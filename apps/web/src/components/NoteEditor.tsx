import type { DocumentDetail } from '@mimir/shared'
import { useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { useCallback } from 'react'
import { MarkdownEditor } from '@mimir/office'
import { useContentStyles } from '@/components/ContentTypography.style'
import { createExtensions } from '@/editor/extensions'
import { api } from '@/lib/api'
import { useUnsaved } from '@/lib/unsaved'
import { useEditorThemeVars } from '@/theme/editor-theme-bridge'

/**
 * 笔记的正文编辑器。
 *
 * **只负责正文，不负责标题。** 标题是文档级元数据（它决定文件名，见
 * `lib/vault.ts` 的 `buildNotePath`），由 `DocumentPanel` 用 antd 的
 * `Typography.Title editable` 就地编辑。曾经两处都渲染标题，页面上就出现了
 * 两个一模一样的 h1。
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
  /** 标题由面板编辑，保存正文时要带上它 */
  title: string
  /** 「就这段提问」：把选中的话带进对话 */
  onAskAboutSelection?: (passage: string) => void
  /** 有未保存改动时上报。宿主用它武装离开前的拦截 */
  onDirtyChange?: ((dirty: boolean) => void) | undefined
}

export function NoteEditor({ document: doc, title, onAskAboutSelection, onDirtyChange }: Props) {
  const { styles: contentStyles } = useContentStyles()
  const { styles: themeVars } = useEditorThemeVars()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { setDirty, setSave } = useUnsaved()

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
        const updated = await api.documents.update(doc.id, { title, body })
        void queryClient.invalidateQueries({ queryKey: ['documents'] })
        void queryClient.setQueryData(['document', updated.id], updated)
      } catch (error) {
        // 自动保存失败时用户可能正看着别处，状态行的变化容易被漏掉——
        // 所以补一条 message。**成功时不弹**：防抖保存很频繁，那是纯噪音
        message.error(error instanceof Error ? error.message : '保存失败')
        throw error
      }
    },
    [doc.id, title, queryClient, message],
  )

  return (
    <div className={themeVars.vars}>
      <MarkdownEditor
        documentId={doc.id}
        extensions={createExtensions()}
        initialContent={doc.body}
        contentClassName={contentStyles.content}
        onSave={onSave}
        onDirtyChange={reportDirty}
        onSaveHandle={setSave}
        flush
        onAskAboutSelection={(passage) => onAskAboutSelection?.(passage)}
      />
    </div>
  )
}
