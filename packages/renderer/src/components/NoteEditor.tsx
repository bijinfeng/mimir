import type { AgentImageAspectRatio } from '@mimir/shared'
import type { ReactNode } from 'react'
import type { DocumentDetail } from '@mimir/shared'
import type { ChatDocumentAgent } from '@mimir/chat'
import { useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { useCallback, useMemo } from 'react'
import { MarkdownEditor } from '@mimir/office'
import { useContentStyles } from './ContentTypography.style'
import { createExtensions } from '../editor/extensions'
import { api } from '../lib/api'
import { downloadMarkdownNote } from '../lib/markdown-export'
import { useUnsaved } from '../lib/unsaved'
import { useEditorThemeVars } from '../theme/editor-theme-bridge'

/**
 * 笔记的正文编辑器。
 *
 * **只负责正文，不负责标题。** 标题是文档级元数据（它决定文件名，见
 * `lib/vault.ts` 的 `buildNotePath`），由 `DocumentPanel` 通过 contentHeader
 * 注入唯一的 DocumentTitle，放在正文滚动列、Markdown 可编辑区域之外。
 *
 * ## 与另外三种编辑器的关系（D-054）
 *
 * 壳（工具条 + 正文区 + 状态行）在 `@mimir/office` 里，与 docx / xlsx / pptx
 * 共用同一套原语——所以「它们长得一样」不靠约定。这个文件和
 * `OfficeSourceEditor` 一样是**适配层**，只做三件事：
 *
 * 1. 把保存包成 `onSave`（写回数据库的正文列）
 * 2. 注入方言（`createExtensions`）与正文排版类（与只读视图共用同一个）
 * 3. 把「立即保存」交给 `lib/unsaved` 的守卫，供「保存并离开」调用
 *
 * ## 未保存状态交给共同祖先
 *
 * 这里曾经声明了 `onDirtyChange` / `registerSave` 两个 props，而全仓
 * **没有任何调用方传它们**——于是 `UnsavedGuard` 从来没被武装过。后果是
 * 数据丢失（实测）：输入后在 900ms 防抖窗口内切换文档，卸载时定时器被清掉、
 * 待保存的写请求再也不会发出，用户以为存上了、实际丢了。
 *
 * 所以脏标记与「立即保存」都直接从 context 取（`lib/unsaved.tsx` 的设计就是
 * 「必须提到一个共同祖先，而不是靠编辑器往下传回调」）。
 */

interface Props {
  document: DocumentDetail
  /** 「就这段提问」：把选中的话带进对话 */
  onAskAboutSelection?: (passage: string) => void
  onAiPreset?: (instruction: string) => void
  /** 有未保存改动时上报。宿主用它武装离开前的拦截 */
  onDirtyChange?: ((dirty: boolean) => void) | undefined
  /** 编辑区右侧的固定列（大纲）。透传给编辑器外壳的 bodySide */
  bodySide?: ReactNode
  contentHeader?: ReactNode
  onSaveStateChange?: ((state: NoteSaveState) => void) | undefined
  /** 新建笔记的一次性正文聚焦请求 */
  focusOnReady?: boolean
  onFocusReady?: () => void
  /** 打开正文中的稳定 ID 内链，由面板负责导航守卫与返回位置 */
  onOpenInternalNote?: (id: string) => void
  onDocumentAgentHandleChange?: (handle: ChatDocumentAgent | null) => void
}

export type NoteSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export function NoteEditor({
  document: doc,
  onAskAboutSelection,
  onAiPreset,
  onDirtyChange,
  bodySide,
  contentHeader,
  onSaveStateChange,
  focusOnReady,
  onFocusReady,
  onOpenInternalNote,
  onDocumentAgentHandleChange,
}: Props) {
  const { styles: contentStyles } = useContentStyles()
  const { styles: themeVars } = useEditorThemeVars()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { setDirty, setSave } = useUnsaved()
  const registerAutoSave = useCallback(
    (save: (() => Promise<boolean>) | null) => setSave(save, 'auto'),
    [setSave],
  )

  /**
   * 上报给宿主的脏标记。
   *
   * 与 `setDirty`（`lib/unsaved` 的守卫）**是两件事**：那个管「切换文档时
   * 拦截」，这个管「宿主想知道现在有没有改动」。两个都需要——只报一个的话
   * 要么离开不拦截、要么宿主的状态是假的。
   */
  const reportDirty = useCallback(
    (dirty: boolean) => {
      setDirty(dirty)
      onDirtyChange?.(dirty)
    },
    [setDirty, onDirtyChange],
  )

  /**
   * 保存。
   *
   * `useCallback` 在这里是**语义**要求而不是性能优化：`MarkdownEditor` 把
   * `onSave` 放进 ref，但「引用稳定」这条仍然成立才能保证它不会在某次渲染
   * 中读到半旧的闭包。`title` 是 props，所以标题改了它要跟着换。
   */
  const onSave = useCallback(
    async (body: string) => {
      try {
        const updated = await api.documents.update(doc.id, { body })
        void queryClient.invalidateQueries({ queryKey: ['documents'] })
        void queryClient.setQueryData(['document', updated.id], updated)
      } catch (error) {
        // 自动保存失败时用户可能正看着别处，状态行的变化容易被漏掉——
        // 所以补一条 message。**成功时不弹**：防抖保存很频繁，那是纯噪音
        message.error(error instanceof Error ? error.message : '保存失败')
        throw error
      }
    },
    [doc.id, queryClient, message],
  )

  /**
   * 「插入图片」：把图片存进资料库，再把地址插进正文。
   *
   * ## 顺序与代价
   *
   * 上传**先发生**：正文里写的地址必须已经能取到，否则存下去的是一张 404 的图
   * （而只有刷新页面之后才看得出来）。代价是**插一张图会在资料库里多一条
   * `file` 文档**——这是有意的产品决定：正文里只留一个地址、原件存得住、也能
   * 被单独搜到；嵌 base64 会让笔记膨胀十倍，而且没有任何东西在守。
   *
   * ## 为什么 alt 用原文件名
   *
   * 图加载不出来时 `alt` 是唯一还能读的东西。文件名（`图表-1.png`）比
   * 「image」有意义，而这里没有更好的来源——用户插图时并没有机会填描述。
   *
   * ## 上传完要让库视图知道
   *
   * 新文档会出现在「最近」里，所以失效一次文档列表的查询。**不失效正文缓存**
   * （`['document', id]`）：那些是别的文档，与这一次无关。
   */
  /**
   * 内联改写（M1-D）。**这是宿主侧的唯一一处**：包（`@mimir/office`）
   * 只负责「拿到文本就替换选区」，网络、提示、失败处理都在这里。
   *
   * 返回 `null` 表示「宿主处理过了、不要替换」——没配模型时就是这样：
   * 弹一句说明比把「改写需要先配置模型…」那段文字塞进正文好得多。
   */
  const onRewrite = useCallback(
    async (text: string, action: 'rewrite' | 'translate' | 'shorten' | 'expand') => {
      try {
        const result = await api.ai.rewrite({ text, action, documentId: doc.id })
        if (!result.usedModel) {
          message.warning(result.text)
          return null
        }
        return result.text
      } catch (error) {
        message.error(error instanceof Error ? error.message : '改写失败')
        // 抛出去让 InlineToolbar 的 promise 结束；这里已经提示过了，
        // 所以返回 null 而不是把错误再抛一层（那会在控制台留一个未处理的拒绝）
        return null
      }
    },
    [doc.id, message],
  )

  const uploadImage = useCallback(
    async (file: File) => {
      const uploaded = await api.documents.upload(file)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      return {
        url: api.documents.sourceUrl(uploaded.document.id),
        name: uploaded.document.title,
      }
    },
    [queryClient],
  )

  const searchNotes = useCallback(
    async (query: string) => {
      const result = await api.documents.findNotes(query)
      return result.items.filter((item) => item.id !== doc.id)
    },
    [doc.id],
  )

  const agentServices = useMemo(
    () => ({
      fetchImage: (url: string, signal?: AbortSignal) =>
        api.conversations.fetchMarkdownImage(doc.id, url, signal),
      generateImage: (prompt: string, signal?: AbortSignal, aspectRatio?: AgentImageAspectRatio) =>
        api.conversations.generateMarkdownImage(doc.id, prompt, signal, aspectRatio),
      uploadImage,
      async writeDocument(
        input: { plan: string; title?: string; context?: string },
        signal?: AbortSignal,
        onDelta?: (text: string) => void,
      ) {
        const result = await api.conversations.writeMarkdownDocument(doc.id, input, signal, onDelta)
        return result.markdown
      },
      async readFrontmatter() {
        return (await api.conversations.readMarkdownFrontmatter(doc.id)).yaml
      },
      async writeFrontmatter(yaml: string, expectedYaml: string) {
        const updated = await api.conversations.updateMarkdownFrontmatter(
          doc.id,
          yaml,
          expectedYaml,
        )
        queryClient.setQueryData(['document', updated.id], updated)
        void queryClient.invalidateQueries({ queryKey: ['documents'] })
        return updated.yaml
      },
    }),
    [doc.id, queryClient, uploadImage],
  )

  return (
    <div className={themeVars.vars}>
      <MarkdownEditor
        documentId={doc.id}
        extensions={createExtensions()}
        initialContent={doc.body}
        contentClassName={contentStyles.content}
        contentHeader={contentHeader}
        onSaveStateChange={onSaveStateChange}
        onSave={onSave}
        onExportMarkdown={async (markdown) => {
          const { yaml } = await api.conversations.readMarkdownFrontmatter(doc.id)
          downloadMarkdownNote(doc.title, markdown, yaml)
        }}
        onAiPreset={onAiPreset}
        onDirtyChange={reportDirty}
        onSaveHandle={registerAutoSave}
        focusOnReady={focusOnReady}
        onFocusReady={onFocusReady}
        onOpenInternalNote={onOpenInternalNote}
        searchNotes={searchNotes}
        flush
        onAskAboutSelection={(passage) => onAskAboutSelection?.(passage)}
        {...(bodySide !== undefined ? { bodySide } : {})}
        onRewrite={onRewrite}
        onUploadImage={uploadImage}
        agentServices={agentServices}
        onAgentHandleChange={onDocumentAgentHandleChange}
      />
    </div>
  )
}
