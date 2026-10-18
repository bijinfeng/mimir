import type { PptxAiSnapshotDraft } from '@mimir/office'
import { viewerFor, type Citation, type DocumentDetail, type NoteUpdate } from '@mimir/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Empty, Skeleton, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { ChatDocumentAgent } from '@mimir/chat'
import { NoteEditor, type NoteSaveState } from './NoteEditor'
import { useContentStyles } from './ContentTypography.style'
import { DocumentCommandModal, DocumentCommandRefreshError } from './document/DocumentCommandModal'
import { DocumentFooter } from './document/DocumentFooter'
import { DocumentHeader } from './document/DocumentHeader'
import { DocumentTitle } from './document/DocumentTitle'
import { useStyles } from './document/DocumentPanel.style'
import { FilePreview } from './document/FilePreview'
import { MarkdownBody } from './document/MarkdownBody'
import { DocChatSidebar } from './document/DocChatSidebar'
import { buildDocMenu } from './document/doc-menu'
import { flattenFolders } from './document/folders'
import { extractHeadings } from './document/headings'
import { api } from '../lib/api'
import { useAppShell, type AskDraft } from '../lib/app-shell-context'
import { useNarrowViewport } from '../lib/nav-collapse'
import { useUnsaved } from '../lib/unsaved'

const editorScrollPositions = new Map<string, number>()

/**
 * 右栏：文档视图。
 *
 * 结构自上而下：
 *   共用文档头部（返回 + 标题 + 按能力显示的动作）
 *   正文（笔记可编辑、上传件预览原件、资料只读）
 *   页脚（来源 / 被引用）
 *
 * 「资料」是只读的（`.trellis/spec/project/product.md` §2.3）——抓来的内容不该被就地编辑，
 * 否则原始快照和派生正文就分不清哪个是真的了。所以非 note 只渲染不挂编辑器。
 *
 * ## 整理条已移除（D-054）
 *
 * 收件箱那一整条橙色横幅（建议标签 / 归入目录 / 完成整理）删掉了。
 * 它占文档顶部一整行、长期存在，而**那几项能力都是低频动作**——读一篇文章
 * 时不想被一整行横幅挤压正文。能力没有丢，全部收进了工具条右端的「⋯」菜单
 * （见 `document/doc-menu.tsx`）。归档不在其列：它已随归档交互整体退役
 * （D-065）。
 *
 * 状态徽标保留：`failed` 表达「这条记录坏了」，是唯一偏离常态的状态。
 */
export interface DocumentPanelProps {
  documentId: string | undefined
  /** 阅读态返回库（浏览态）。两栏布局（D-047）里它是离开详情的主路径 */
  onBack?: (() => void) | undefined
  /** 从对话引用跳来时携带的原文区间：滚动到它并高亮（消费一次后清掉） */
  citation?: Citation | null | undefined
  /** 从对话点引用跳过来时，显示「返回对话」 */
  onBackToChat?: (() => void) | undefined
  /** 点击页脚的双链 */
  onOpenDocument: (id: string) => void
  /**
   * 文档里有未保存的改动。宿主用它武装离开前的拦截。
   *
   * **三条正文分支都要上报**（笔记与三种 Office 格式都能改）——不报就是
   * 「改完直接切走会丢改动」，而那个症状是静默的（`lib/unsaved.tsx` 记了实测）。
   */
  onDirtyChange?: ((dirty: boolean) => void) | undefined
}

export function DocumentPanel({
  documentId,
  onBack,
  citation,
  onBackToChat,
  onOpenDocument,
  onDirtyChange,
}: DocumentPanelProps) {
  const { styles } = useStyles()
  const { styles: contentStyles } = useContentStyles()
  const { clearHighlight, newNoteFocusId, requestNewNoteFocus } = useAppShell()
  const { runGuarded } = useUnsaved()
  const queryClient = useQueryClient()
  const { message } = App.useApp()

  const docQuery = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.documents.get(documentId!),
    enabled: Boolean(documentId),
  })

  const doc = docQuery.data
  const [noteSave, setNoteSave] = useState<{ id: string | undefined; state: NoteSaveState } | null>(
    null,
  )
  const reportNoteSaveState = (state: NoteSaveState) => {
    setNoteSave((current) =>
      current !== null && current.id === documentId && current.state === state
        ? current
        : { id: documentId, state },
    )
  }
  const docKind = doc?.kind
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!documentId || !docKind) return
    let timer = 0
    let attempts = 0
    const attach = () => {
      const inner = scrollRef.current?.querySelector<HTMLElement>('.me-scroll')
      const scroller = docKind === 'note' ? inner : (inner ?? scrollRef.current)
      if (!scroller) {
        attempts += 1
        if (attempts < 20) timer = window.setTimeout(attach, 100)
        return
      }
      const saved = editorScrollPositions.get(documentId)
      if (saved !== undefined) {
        scroller.scrollTop = saved
        // 编辑器壳先出现、正文后排版；高度尚不足时等正文就绪再恢复。
        if (scroller.scrollTop < saved - 2) {
          attempts += 1
          if (attempts < 20) {
            timer = window.setTimeout(attach, 100)
            return
          }
        }
      }
      const track = () => editorScrollPositions.set(documentId, scroller.scrollTop)
      scroller.addEventListener('scroll', track, { passive: true })
      cleanup = () => scroller.removeEventListener('scroll', track)
    }
    let cleanup = () => {}
    timer = window.setTimeout(attach, 100)
    return () => {
      window.clearTimeout(timer)
      cleanup()
    }
  }, [documentId, docKind])
  const headings = doc ? extractHeadings(doc.body) : []

  /**
   * 内容列要不要占满。
   *
   * 判据是**「这里有没有编辑器」**：
   *
   * | 情况 | 布局 | 为什么 |
   * |---|---|---|
   * | 笔记（有编辑器） | 铺满 | 外壳（工具条 + 状态行）要与上面 44px 的头部同宽，否则两条铬条宽度不一致 |
   * | 文件原件（有查看器） | 铺满 | 纸张、表格、幻灯片是越宽越好看清的东西 |
   * | 只读资料正文 | 760 | 行宽有可读性上限，再宽眼睛回行时容易串行 |
   *
   * 「正文限宽」仍然成立，只是它由**外壳内部**的规则负责
   * （`.mimir-markdown-body` 的 max-width），而不是靠外层容器收窄——
   * 后者会把外壳一起收窄（实测：工具条只有 680px 宽，而头部的下边框横跨
   * 1240px，两条铬条的宽度对不上，看着就是没对齐）。
   *
   * 用 `viewerFor` 而不是自己判 MIME：它已经是「这个格式用哪个查看器」的
   * 唯一真相（`@mimir/shared`），两处各判一次必然有一天不一致。
   */
  /** 这一份有没有**能看的原件**（有查看器的那种）。见下面两条判据 */
  const showsSource = doc !== undefined && doc.sourceKey !== null && viewerFor(doc.mime) !== 'none'

  const wideContent = doc !== undefined && (doc.kind === 'note' || showsSource)

  /**
   * 右侧大纲只在正文有 ≥ 2 个标题且有足够空间时出现。
   *
   * 它是正文的锚点导航（`.trellis/spec/project/product.md` §5.10），唯一的豁免是**有原件的
   * 文件类文档**——原件自带导航（pptx 的页签、xlsx 的表页签、docx 的分页），
   * 两个导航并排只是白占 196px 并把画布挤窄（实测 pptx 因此从 1208 掉到
   * 1012，用户的原话是「左右留那么大的空白也没必要」）。
   *
   * 顺带一提：pptx 的提取正文按页分成「第 1 页…第 5 页」，那些恰好会被
   * `extractHeadings` 当成标题，于是大纲列与翻页页签**列着同一批东西**
   * ——这也是它多余的直接证据。
   *
   * ## 为什么不再看 `wideContent`
   *
   * 第一版写成 `!wideContent && headings.length >= 2`，而 `wideContent` 对
   * **笔记恒为真**（笔记的正文列要铺满，见上），于是笔记永远命中
   * `!wideContent === false`：标题再多也放不出大纲，而右侧那 240px 本来就
   * 空着。写这一行时笔记还是「内容高就够」的那一列，D-054 让笔记的正文列
   * 也铺满之后两个判据就脱钩了——「内容列多宽」与「要不要大纲」是两件事。
   *
   * 实测（1440×900，样张 `Qh3DUSfWcbrYM6MT` 有 7 个标题）：
   * `document.querySelectorAll('aside').length === 0`，全页没有「大纲」二字。
   *
   * ## 窄屏（≤880px）下不渲染
   *
   * 大纲列固定 196px（笔记那侧还要外壳再让 220px 的 padding-right），
   * 420px 视口里正文只剩约 150px——实测一行约 7 个字，中文竖着一路折
   * （`.trellis/spec/project/design.md` §5.5 的窄屏规则是「防止布局崩坏」，不是移动方案：
   * 这个宽度里正文的完整性优先于锚点导航）。判据与左导航折叠、设置页
   * 分区下拉共用 `useNarrowViewport`——同一个 880px 只问一处。
   */
  const narrowViewport = useNarrowViewport()
  const scrollRef = useRef<HTMLDivElement>(null)
  /* 标题栏的界线随正文滚动显形（D-070） */
  const [activeHeading, setActiveHeading] = useState<string | undefined>()

  /**
   * AI 的结果**不落库**（服务端也不存，见 `services/ai-text.ts` 的注释），
   * 所以它只活在这一次打开里。摘要是「现在想看一眼这篇讲了什么」——
   * 存下来就会引入「正文改了、摘要还是旧的」这个新状态要维护。
   *
   * ## 结果里带着它属于哪一篇，而不是用 effect 清空
   *
   * 换文档时「清空上一次的摘要」用 `useEffect` 写会命中
   * `react(set-state-in-effect)`——那条规则是对的：**setState 不是 effect 的职责**
   * （effect 是给外部系统做同步用的），而且那样写会让 React Compiler
   * 跳过整个组件（铁律 1 的静默退化）。
   *
   * 正确做法是**在渲染期派生**：把 `documentId` 一起存进结果，
   * 渲染时对不上就当作没有。这样「有没有结果」永远由当前数据决定，
   * 不存在「切换之后旧结果还在屏幕上」的窗口。
   */
  const [aiSummary, setAiSummary] = useState<{
    documentId: string
    text: string
    model: string
  } | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  /** AI 给出的标签候选。与统计版建议标签分开显示——来源不同，可信度不同 */
  const [aiTags, setAiTags] = useState<{ documentId: string; tags: string[] } | null>(null)

  /**
   * 「问 AI」侧栏（D-087）。
   *
   * `docId` 锁定它属于哪一篇：切到别的文档时它就不渲染了（渲染期派生，
   * 不需要 effect）。`open: false` 时**保持挂载**只折叠——流式进行中关掉
   * 再打开，回答还在继续（卸载会连 `useChat` 的客户端一起丢掉）。
   */
  const [aiSidebar, setAiSidebar] = useState<{
    docId: string
    draft: AskDraft
    open: boolean
  } | null>(null)
  const [documentAgentHandle, setDocumentAgentHandle] = useState<ChatDocumentAgent | null>(null)
  const aiTriggerRef = useRef<HTMLElement | null>(null)
  /** 侧栏里点开的、属于当前这一篇的引用：原地滚动高亮，不走导航 */
  const [sidebarCitation, setSidebarCitation] = useState<Citation | null>(null)

  /** 打开侧栏。「就这段提问」把选中内容带引号预填进输入框（范围同样锁这一篇） */
  const askAi = (passage?: string, instruction?: string) => {
    if (!documentId) return
    aiTriggerRef.current = document.activeElement as HTMLElement | null
    setAiSidebar({
      docId: documentId,
      draft: {
        text:
          instruction ??
          (passage ? `关于这篇里这段：\n> ${passage.replace(/\n+/g, ' ').slice(0, 200)}\n\n` : ''),
        documentId,
      },
      open: true,
    })
  }

  const askAiSnapshot = (snapshot: PptxAiSnapshotDraft) => {
    if (!documentId || snapshot.target.documentId !== documentId) return
    aiTriggerRef.current = document.activeElement as HTMLElement | null
    setAiSidebar({
      docId: documentId,
      draft: { text: snapshot.text, documentId, snapshot },
      open: true,
    })
  }

  /**
   * 标题住在面板而不是编辑器里。
   *
   * 标题是**文档级元数据**——它决定文件名（`lib/vault.ts` 的 buildNotePath），
   * 而正文是编辑器内容。两处都渲染标题会让页面上出现两个一模一样的 h1
   * （真实踩过）。所以标题归这里，编辑器只管正文。
   *
   * 真相在查询缓存里：改名走 `renameTitle`，成功后重新读取当前文档，
   * 于是标题与编辑器传下去的 `title` 都会跟着更新，不需要额外的本地 state。
   * 展示态用 Typography.Title，编辑态用 Input underlined；改名仍走同一请求。
   */
  const renameTitle = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string; inline?: boolean }) =>
      api.documents.update(id, { title }),
    onSuccess: async (updated) => {
      // Metadata responses carry a body snapshot. Reconcile from the server rather
      // than pushing that snapshot into the active note's query cache.
      try {
        await Promise.all([
          queryClient.invalidateQueries(
            { queryKey: ['document', updated.id], exact: true },
            { throwOnError: true },
          ),
          queryClient.invalidateQueries({ queryKey: ['documents'] }),
        ])
      } catch {
        throw new DocumentCommandRefreshError('标题已保存，但暂时无法读取最新内容。请重试刷新。')
      }
      message.success('标题已更新')
    },
    onError: (error: unknown, input) => {
      if (!input.inline) message.error(error instanceof Error ? error.message : '改名失败')
    },
  })

  /**
   * 元信息的改动（标签 / 目录）。原先是整理条上的动作，现在从
   * 「⋯」菜单触发——**失效范围一处不能少**：列表、目录树、标签云、导航计数。
   * 少刷一处就是界面上有一个数字在骗人。
   */
  const patch = useMutation({
    mutationFn: (input: NoteUpdate) => api.documents.update(documentId!, input),
    onSuccess: (updated) => {
      void queryClient.setQueryData(['document', updated.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['folders'] })
      void queryClient.invalidateQueries({ queryKey: ['tags'] })
      void queryClient.invalidateQueries({ queryKey: ['counts'] })
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '操作失败'),
  })

  const moveDocument = async (
    folder: string,
    target: DocumentDetail | undefined = doc,
    inline = false,
  ) => {
    if (!target || folder === (target.folder ?? '')) return true
    const before = target.folder ?? ''
    const targetId = target.id
    try {
      await api.documents.update(targetId, { folder })
      let refreshFailed = false
      await Promise.all([
        queryClient.invalidateQueries(
          { queryKey: ['document', targetId], exact: true },
          { throwOnError: true },
        ),
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ]).catch(() => {
        refreshFailed = true
      })
      const destination = folder || '知识库根'
      message.success({
        duration: 8,
        content: (
          <span>
            已移到 {destination}　
            <Button
              type="link"
              size="small"
              onClick={() => {
                void (async () => {
                  try {
                    await api.documents.update(targetId, { folder: before })
                    await queryClient.invalidateQueries({
                      queryKey: ['document', targetId],
                      exact: true,
                    })
                    void queryClient.invalidateQueries({ queryKey: ['documents'] })
                    void queryClient.invalidateQueries({ queryKey: ['folders'] })
                    message.success(`已移回 ${before || '知识库根'}`)
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : '撤销移动失败')
                  }
                })()
              }}
            >
              撤销
            </Button>
          </span>
        ),
      })
      if (refreshFailed)
        throw new DocumentCommandRefreshError('移动已完成，但暂时无法读取最新内容。请重试刷新。')
      return true
    } catch (error) {
      if (inline) throw error
      message.error(error instanceof Error ? error.message : '移动失败')
      return false
    }
  }

  /**
   * AI 摘要（M1-D）。**不落库**，所以结果只放进本地 state。
   *
   * 用一个普通 async 函数而不是 `useMutation`：它没有「成功之后要
   * 失效哪些查询」这件事要处理（服务端什么都没写），而 mutation 的
   * 那套缓存语义在这里全是空的。loading 与错误各自如实反映。
   */
  const runSummary = async (): Promise<void> => {
    if (!documentId || aiSummaryLoading) return
    setAiSummaryLoading(true)
    try {
      const result = await api.documents.summary(documentId)
      if (!result.usedModel) {
        // 没配模型时**如实说**，不显示一段像摘要的说明文字（见 ai-text.ts）
        message.warning(result.text)
      } else {
        setAiSummary({ documentId, text: result.text, model: result.model })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成摘要失败')
    }
    setAiSummaryLoading(false)
  }

  /**
   * AI 标签建议（M1-D）。
   *
   * 结果**不自动挂上**——它是一组候选，用户要自己选。自动加标签会让
   * 「AI 猜错了」变成一件需要用户去删的事，而 AI 猜对时用户反而没有获得感。
   */
  const runAiTags = async (): Promise<void> => {
    if (!documentId || aiSummaryLoading) return
    setAiSummaryLoading(true)
    try {
      const result = await api.documents.suggestedTagsAi(documentId)
      if (!result.usedModel) {
        message.warning('AI 标签建议需要先配置模型（设置 › 模型 › 任务分配）')
      } else if (result.tags.length === 0) {
        message.info('AI 没有给出新的标签')
      } else {
        /**
         * 摆成按钮让用户点（与统计版建议标签的交互一致）。
         * 用一个 keys 数组当 message 的 key 前缀，重复点同一批标签不会
         * 叠出一堆一模一样的提示。
         */
        setAiTags({ documentId, tags: result.tags })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'AI 建议标签失败')
    }
    setAiSummaryLoading(false)
  }

  /** 目录列表与建议标签：只有打开「⋯」菜单才需要，但 antd 的菜单要一次给全 */
  const folderQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })
  const suggestQuery = useQuery({
    queryKey: ['suggested-tags', documentId, doc?.tags.join(',')],
    queryFn: () => api.documents.suggestedTags(documentId!),
    enabled: Boolean(documentId),
  })

  /**
   * 滚动联动的高亮。
   *
   * 用 IntersectionObserver 而不是监听 scroll：后者每次滚动都要读
   * getBoundingClientRect（强制重排），而正文可以有几千字。
   *
   * 依赖 `doc.body` 而不是 `headings`：headings 是每次渲染新建的数组，
   * 依赖它会让观察器被反复拆装。body 变了 headings 才会变。
   */
  const body = doc?.body ?? ''
  useEffect(() => {
    const panel = scrollRef.current
    if (!panel) return

    const list = extractHeadings(body)
    if (list.length < 2) return

    let observer: IntersectionObserver | null = null
    let timer = 0
    let attempts = 0

    /**
     * **要重试**，而且要能**重挂**。两条都是实测定下来的：
     *
     * 1. 这个 effect 跑的时候正文可能还没挂载完——笔记的 Tiptap 与只读渲染
     *    都是异步的，标题节点那时还不存在，一次找不到就再也找不到
     *    （`body` 不会变第二次）。
     * 2. **找到的节点之后还会被换掉**：内容装进 ProseMirror 时编辑器会重建
     *    那一层 DOM，于是观察的是已经脱离文档的旧节点——观察器的回调照样来，
     *    每个 entry 的 rect 全是 0（实测 `tops: [0,0,0,0,0,0,0]`），
     *    `isIntersecting` 永远为假，症状是**高亮停在第 0 项、而大纲与跳转
     *    都正常**（看上去只像「联动没生效」）。
     *
     * 所以：只在第一项拿不到 rect 时重挂，最多 20 次。Unmount 时两样都清掉。
     */
    const attach = () => {
      const targets = headingNodes(panel, list.length)
      const stale = targets.length === 0 || targets[0]!.getBoundingClientRect().height === 0
      if (stale) {
        attempts += 1
        if (attempts < 20) timer = window.setTimeout(attach, 150)
        return
      }

      /* 观察的 root 必须是**真正在滚的那一层**（笔记与原件是外壳里的
         `.me-scroll`，只读资料是面板）——见 `jumpTo` 的同一条说明。
         root 写错时观察器仍然「工作」，只是永远不触发 */
      const root = scrollableAncestor(targets[0]!, panel)

      observer = new IntersectionObserver(
        (entries) => {
          /*
            **观察目标被换掉时要重挂。** 内容装进 ProseMirror 时编辑器会重建
            那一层 DOM，于是我们观察的是已经脱离文档的旧节点：回调照样来，
            每个 entry 的 rect 全是 0（实测 `tops: [0,0,0,0,0,0,0]`），
            `isIntersecting` 永远为假——症状是**高亮停在第 0 项，而大纲与
            跳转都正常**（看上去只像「联动没做」）。判据用「第一项已经不在
            文档里」，不是「没有 entry 相交」——正文滚出视野时后者也成立。
          */
          if (!targets[0]!.isConnected) {
            observer?.disconnect()
            attach()
            return
          }

          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
          const index = visible ? targets.indexOf(visible.target) : -1
          const heading = index === -1 ? undefined : list[index]
          if (heading) setActiveHeading(heading.id)
        },
        { root, rootMargin: '0px 0px -70% 0px', threshold: 0 },
      )

      for (const target of targets) observer.observe(target)
    }

    attach()

    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [body])

  const jumpTo = (index: number) => {
    const root = scrollRef.current
    const target = root ? headingNodes(root, headings.length)[index] : undefined
    if (!root || !target) return
    /* 滚的是**目标所在的那一层**：笔记与原件现在由外壳自己滚
       （`.me-scroll`，见 DocumentPanel.style.ts 的 `cols`），只读资料
       那一列才是面板在滚。写死面板的话，笔记里点大纲会「点了没反应」——
       面板的量根本不够滚，而目标在更里面那一层。 */
    const scroller = scrollableAncestor(target, root)
    scroller.scrollTo({
      top:
        target.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        20,
      behavior: 'smooth',
    })
  }

  /**
   * 生效的引用：路由带来的（对话页跳来）与侧栏里点开的，走同一条
   * 「滚动 + 高亮」的 effect。prop 优先——它带一次导航，语义更新。
   */
  const activeCitation = citation ?? sidebarCitation

  /**
   * 引用跳转的下半句：滚动到原文区间并高亮（D-047 待办收尾）。
   *
   * 定位用归一化文本匹配。偏移指向原始 Markdown，不能直接当 DOM 偏移；
   * 当相同片段出现多次时，先用原文偏移确定第几次出现，再匹配渲染后的
   * 对应片段。找不到就只打开文档，不高亮错误位置。
   *
   * 高亮用 CSS Custom Highlight API：Range 注册到 `CSS.highlights`，
   * 不改 DOM（只读正文与 Tiptap 编辑器的文本节点都适用），样式在
   * `styles/global.ts` 的 `::highlight(mimir-citation)`。
   * 消费一次即清除 context（高亮不跟着用户去下一篇文档）。
   */
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !doc || !activeCitation) return
    const snippet = activeCitation.snippet

    /**
     * **要重试**：effect 首次跑时正文可能还没挂载完（笔记的 Tiptap 与
     * 只读渲染都是异步的），此时注册的 Range 会在内容重渲染后塌缩成空
     * ——实测症状是 `highlights.size` 为 1 但 `collapsed: true`，看过去
     * 就是「没有高亮」。这里每 150ms 重试一次，直到 Range 在下一帧
     * 仍然有效（或超时放弃，只跳转不高亮）。
     */
    let cancelled = false
    let attempts = 0
    let pendingRange: Range | null = null
    // 同一文档连续打开两个命中时，不能把上一个仍有效的高亮当成本次结果。
    window.CSS?.highlights?.delete('mimir-citation')

    /**
     * **清除必须等结束之后**：`clearHighlight` 会改 context，触发本 effect
     * 以 citation=null 重跑，cleanup 把 cancelled 置真——放在开头调用等于
     * 第一次 tick 就被掐断（实测踩过：重试循环从未跑第二轮）。
     */
    const finish = () => {
      // 侧栏的引用用完清本地状态；来自 shell（对话页跳来）的走 context 清除
      if (sidebarCitation) setSidebarCitation(null)
      else clearHighlight()
    }

    const tick = () => {
      if (cancelled) return
      attempts += 1

      const alive =
        pendingRange && !pendingRange.collapsed && pendingRange.startContainer.isConnected
          ? pendingRange
          : null

      if (alive) {
        // 上一次注册的还活着 → 内容已稳定：滚过去，收工
        const rect = alive.getBoundingClientRect()
        const scroller = scrollableAncestor(alive.startContainer.parentElement ?? root, root)
        scroller.scrollTo({
          top: rect.top - scroller.getBoundingClientRect().top + scroller.scrollTop - 140,
          behavior: 'smooth',
        })
        finish()
        return
      }

      pendingRange = highlightSnippet(root, snippet, doc.body, activeCitation.start)
      if (attempts < 20) window.setTimeout(tick, 150)
      else finish()
    }
    tick()

    return () => {
      cancelled = true
    }
  }, [doc, activeCitation, sidebarCitation, clearHighlight])

  if (!documentId) {
    return (
      <div className={styles.wrap}>
        <Empty
          className={styles.emptyLarge}
          description="选一条开始看"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    )
  }

  if (docQuery.isError && !doc) {
    return (
      <div className={styles.wrap}>
        <div className={styles.centered}>
          <Typography.Text type="danger">文档加载失败</Typography.Text>
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className={styles.wrap}>
        <div className={styles.centered}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    )
  }

  /**
   * 渲染期派生：结果属于当前这一篇才显示（见上面 state 的注释）。
   * 这样切文档不需要 effect，也不存在「旧结果留在屏幕上」的窗口。
   */
  const visibleSummary = aiSummary?.documentId === documentId ? aiSummary : null
  const visibleAiTags = aiTags?.documentId === documentId ? aiTags.tags : []

  const menu = buildDocMenu({
    doc,
    onSetTags: (tags) => patch.mutate({ tags }),
    onSetFolder: (folder) => void moveDocument(folder),
    folders: flattenFolders(folderQuery.data?.items ?? []).map((item) => item.path),
    suggestedTags: suggestQuery.data?.items ?? [],
    onAiTags: () => void runAiTags(),
    onSummary: () => void runSummary(),
    aiBusy: aiSummaryLoading,
  })

  /**
   * 侧栏的挂载与可见是两件事（见 aiSidebar state 的注释）：
   * 属于这一篇就保持挂载（流式不丢），open 决定它展不展开。
   */
  const sidebarMounted = aiSidebar !== null && aiSidebar.docId === documentId
  const sidebarOpen = sidebarMounted && aiSidebar!.open
  // 阅读助手占用右侧 400px；同时显示大纲会把正文挤到难以阅读。
  const showOutline = headings.length >= 2 && !showsSource && !narrowViewport && !sidebarOpen

  /** 侧栏里点引用：同一篇原地高亮，别的文档走导航（离开这一篇，侧栏随之卸载） */
  const openSidebarCitation = (id: string, cite: Citation) => {
    if (id === documentId) setSidebarCitation(cite)
    else onOpenDocument(id)
  }

  const findInDocument = (targetId: string, query: string) => {
    const root = scrollRef.current
    if (!root || targetId !== doc.id || query.length < 2) return false
    const range = highlightSnippet(
      root,
      query,
      doc.body,
      doc.body.toLowerCase().indexOf(query.toLowerCase()),
      2,
    )
    if (!range) return false
    const scroller = scrollableAncestor(range.startContainer.parentElement ?? root, root)
    scroller.scrollTop +=
      range.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 80
    return true
  }

  return (
    <div className={styles.root} ref={panelRef} data-document-id={doc.id}>
      <div className={styles.wrap}>
        <DocumentHeader
          doc={doc}
          onBack={onBack}
          onBackToChat={onBackToChat}
          noteSaveState={
            renameTitle.isPending && renameTitle.variables?.id === doc.id
              ? 'saving'
              : noteSave?.id === doc.id
                ? noteSave.state
                : 'idle'
          }
          onAskAi={() => askAi()}
          menu={menu}
        />

        {docQuery.isError ? (
          <div role="alert">
            <Typography.Text type="warning">暂时无法刷新文档，已保留当前内容。</Typography.Text>
            <Button
              type="link"
              loading={docQuery.isFetching}
              disabled={docQuery.isFetching}
              onClick={() => {
                void docQuery.refetch()
              }}
            >
              重试刷新
            </Button>
          </div>
        ) : null}
        <div className={styles.scroll} ref={scrollRef}>
          <div className={styles.cols}>
            <div className={wideContent ? styles.innerWide : styles.inner}>
              {/*
              AI 的两块结果摆在正文之上（metadata 之下）。

              **位置有讲究**：摘要是「这篇讲了什么」的总览，它是**读之前**
              有用的东西；放在正文之后就等于要求用户先滚到底。
              AI 标签候选同理——它们是要被点进标签的候选，放在正文末尾
              会让人以为选完了。

              两块都只在这个会话里存在（服务端不存），所以它们出没
              不产生「这里以前有东西、现在没了」的疑惑——关掉再开
              就是「重新生成一次」的语义。
            */}
              {visibleSummary ? (
                <div className={styles.aiBlock}>
                  <div className={styles.aiLabel}>AI 摘要 · {visibleSummary.model}</div>
                  <div className={styles.aiText}>{visibleSummary.text}</div>
                </div>
              ) : null}

              {visibleAiTags.length > 0 ? (
                <div className={styles.aiBlock}>
                  <div className={styles.aiLabel}>AI 建议的标签（点一下加上）</div>
                  <div className={styles.aiTags}>
                    {visibleAiTags
                      .filter((tag) => !doc.tags.includes(tag))
                      .map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={styles.aiTag}
                          onClick={() => {
                            patch.mutate({ tags: [...doc.tags, tag] })
                            // 加过的从候选里拿掉——留着会让「点了没变化」变得可能
                            setAiTags((current) =>
                              current === null
                                ? current
                                : { ...current, tags: current.tags.filter((item) => item !== tag) },
                            )
                          }}
                        >
                          ＋ {tag}
                        </button>
                      ))}
                    {/* 全部加完之后给一句说明，而不是留一个空盒子 */}
                    {visibleAiTags.every((tag) => doc.tags.includes(tag)) ? (
                      <span className={styles.aiLabel}>都加上了</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/*
              三种正文区，按 kind 分派：

              | kind | 用什么 | 为什么 |
              |---|---|---|
              | note | NoteEditor | 它是唯一可编辑的东西 |
              | file | FilePreview | 上传件有原件这一层（PDF 在线看、Office 可编辑…） |
              | 其余 | MarkdownBody | 抓取的资料只有派生正文，只读渲染 |

              抓来的资料不可编辑——它的真相是原始快照 + 派生正文，
              就地改写会让「原文是什么」变得不可考。上传件同理。
            */}
              {doc.kind === 'note' ? (
                <NoteEditor
                  key={doc.id}
                  document={doc}
                  contentHeader={
                    <DocumentTitle
                      key={doc.id}
                      title={doc.title}
                      updatedAt={doc.updatedAt}
                      onRename={(next) => renameTitle.mutate({ id: doc.id, title: next })}
                    />
                  }
                  onSaveStateChange={reportNoteSaveState}
                  focusOnReady={newNoteFocusId === doc.id}
                  onFocusReady={() => requestNewNoteFocus(null)}
                  onOpenInternalNote={(id) => runGuarded(() => onOpenDocument(id))}
                  onAskAboutSelection={(passage) => askAi(passage)}
                  onAiPreset={(instruction) => askAi(undefined, instruction)}
                  onDirtyChange={onDirtyChange}
                  onDocumentAgentHandleChange={setDocumentAgentHandle}
                  {...(showOutline
                    ? {
                        bodySide: (
                          <aside className={styles.outlineSide}>
                            <div className={styles.outlineTitle}>大纲</div>
                            {headings.map((heading, index) => (
                              <button
                                key={heading.id}
                                type="button"
                                aria-current={activeHeading === heading.id ? 'location' : undefined}
                                className={`${styles.olItem} ${heading.level === 3 ? styles.olItemLv3 : ''} ${
                                  activeHeading === heading.id ? styles.olItemActive : ''
                                }`}
                                onClick={() => jumpTo(index)}
                              >
                                {heading.text}
                              </button>
                            ))}
                          </aside>
                        ),
                      }
                    : {})}
                />
              ) : doc.kind === 'file' ? (
                <FilePreview
                  onAiSnapshotDraft={askAiSnapshot}
                  onAiPreset={(instruction) => askAi(undefined, instruction)}
                  key={doc.id}
                  doc={doc}
                  onDirtyChange={onDirtyChange}
                  onDocumentAgentHandleChange={setDocumentAgentHandle}
                />
              ) : (
                /* 正文排版与编辑器共用同一个类——两个视图都让 Tiptap 渲染同一份
                 Markdown，排版必须同源。这里曾经各自手抄一份，漂移出四处 */
                <div className={contentStyles.content}>
                  <MarkdownBody body={doc.body} headings={headings} />
                </div>
              )}

              {/* 页脚双链与「返回库」是同一类动作：换一篇=离开这一篇。
                同样走守卫，否则「改完点一个双链」是又一条静默丢改动的路
                （中栏列表里的同一动作一直是拦的，见 LibraryView 的 open） */}
              <DocumentFooter
                doc={doc}
                onOpenDocument={(id) => runGuarded(() => onOpenDocument(id))}
              />
            </div>

            {/* 右侧大纲。判据见 `showOutline`：正文里有 ≥ 2 个标题就出现，
              有原件的文件类文档除外（原件自带导航）。
              **笔记的大纲不走这里**——它在编辑器外壳的 bodySide 里
              （工具栏下面、正文右边，语雀式布局，D-087） */}
            {showOutline && doc.kind !== 'note' && (
              <aside className={styles.outline}>
                <div className={styles.outlineTitle}>大纲</div>
                {headings.map((heading, index) => (
                  <button
                    key={heading.id}
                    type="button"
                    aria-current={activeHeading === heading.id ? 'location' : undefined}
                    className={`${styles.olItem} ${heading.level === 3 ? styles.olItemLv3 : ''} ${
                      activeHeading === heading.id ? styles.olItemActive : ''
                    }`}
                    onClick={() => jumpTo(index)}
                  >
                    {heading.text}
                  </button>
                ))}
              </aside>
            )}
          </div>
        </div>
      </div>

      {/*
        「问 AI」侧栏（D-087）。挂载与可见分离：关闭只是折起（宽度 0），
        组件保持挂载——流式进行中关掉再打开，回答还在继续。

        **`inert` 是必须的**：折起时它只是 `width: 0` + `overflow: hidden`，
        元素仍在文档流里、里面的按钮与输入框仍可聚焦——键盘用户按 Tab 会
        掉进这块看不见的 400px 面板（而且它在 `aria-hidden` 容器里，
        「隐藏容器内含可聚焦元素」本身就是无效 ARIA）。`inert` 一次解决
        两件事：移出 tab 序列 + 移出可及树。收起态下用 `inert={true}`，
        展开时不给属性（React 会把 false 渲染成没这个属性）。
      */}
      {sidebarMounted && (
        <div
          className={styles.aiSidebar}
          data-open={sidebarOpen || undefined}
          aria-hidden={!sidebarOpen}
          inert={!sidebarOpen}
        >
          <DocChatSidebar
            doc={doc}
            documentAgent={documentAgentHandle?.documentId === doc.id ? documentAgentHandle : null}
            draft={aiSidebar!.draft}
            onClose={() => {
              setAiSidebar((current) => (current ? { ...current, open: false } : current))
              requestAnimationFrame(() => {
                if (aiTriggerRef.current?.isConnected) aiTriggerRef.current.focus()
                else document.querySelector<HTMLElement>('[aria-label="询问这篇文档"]')?.focus()
              })
            }}
            onOpenCitation={openSidebarCitation}
          />
        </div>
      )}
      <DocumentCommandModal
        key={doc.id}
        document={doc}
        folders={folderQuery.data?.items ?? []}
        foldersLoading={folderQuery.isPending || folderQuery.isFetching}
        foldersError={folderQuery.isError}
        retryFolders={() => {
          void folderQuery.refetch()
        }}
        rename={async (id, title) => {
          await renameTitle.mutateAsync({ id, title, inline: true })
        }}
        move={async (target, folder) => {
          await moveDocument(folder, target, true)
        }}
        find={findInDocument}
        refresh={async (targetId) => {
          await queryClient.invalidateQueries(
            { queryKey: ['document', targetId], exact: true },
            { throwOnError: true },
          )
        }}
        restoreFocus={(targetId, trigger) => {
          const panel = panelRef.current
          if (!panel || panel.dataset.documentId !== targetId) return
          if (
            trigger?.isConnected &&
            !trigger.closest('[inert], [aria-hidden="true"]') &&
            trigger.getClientRects().length > 0
          )
            trigger.focus()
          else panel.querySelector<HTMLElement>('[aria-label="更多操作"]')?.focus()
        }}
      />
    </div>
  )
}

/**
 * 正文里的标题节点，**按 DOM 顺序**——与 `extractHeadings` 的产出同序。
 *
 * ## 为什么按序号取，而不是按 `#id`
 *
 * 只读正文（`MarkdownBody`）在挂载后会给渲染出的 h1–h6 补上 `id`，那时
 * 按 id 找是对的。但笔记的正文在 Tiptap 里（`contenteditable`）：
 *
 *  - 那里的标题**没有 id**，而且补不上——ProseMirror 用 MutationObserver
 *    看自己的 DOM，下一个事务会把外来的属性改动一并重建掉（实测：给 7 个
 *    标题写好 id，敲两个字之后 7 个 id 全空）
 *  - 于是「点大纲」在笔记里是一条静默的死链：`querySelector('#h-0')` 永远
 *    返回 null，`jumpTo` 直接 return，看上去就是点了没反应（DESIGN §7.4
 *    说的最坏那种）
 *
 * 序号对应是同一个组件的既有做法：`MarkdownBody` 补 id 用的就是
 * `nodes[index] ← headings[index]`。所以两处共用这一条规则。
 * 已知的偏差：围栏代码块里的 `#` 会被正则当成标题、而 DOM 里没有对应节点
 * ——那种情况下错位一格（与 `MarkdownBody` 的 id 补法同源，不是新引入的）。
 */
function headingNodes(root: HTMLElement, count: number): Element[] {
  if (count === 0) return []
  return [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].slice(0, count)
}

/**
 * 目标所在的那一层**真正能滚**的容器（最近的、滚得动的那一个）。
 *
 * 注释区有两层滚动：面板（`.scroll`，只读资料用它）与编辑器外壳里的
 * `.me-scroll`（笔记与原件用它，见 `packages/office/src/shell/shell.css`）。
 * 目标在哪一层里，就滚哪一层——逐层往上找第一个「overflow 是 auto/scroll
 * 且内容确实超出」的祖先，找不到就退回面板。
 */
function scrollableAncestor(node: Element, fallback: HTMLElement): HTMLElement {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue
    if (parent.scrollHeight > parent.clientHeight + 1) return parent
  }
  return fallback
}

/** 归一化：小写、去空白、去 Markdown 记号——原始正文与渲染 DOM 的公共子串 */
const MARKDOWN_NOISE = new Set('#>*`~[]()!')

function normalizeForMatch(text: string): { norm: string; map: number[] } {
  const norm: string[] = []
  const map: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (/\s/.test(ch) || MARKDOWN_NOISE.has(ch)) continue
    norm.push(ch.toLowerCase())
    map.push(i)
  }
  return { norm: norm.join(''), map }
}

/** 从原文偏移推算目标是第几次出现，再去渲染后的正文找同一次出现。 */
export function findPreferredSnippetPosition(
  rendered: string,
  sourceBody: string,
  needle: string,
  sourceStart: number,
): number {
  const { norm: source, map } = normalizeForMatch(sourceBody)
  const occurrences: number[] = []
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) {
    occurrences.push(at)
  }

  // 旧引用或正文已改动时，回到原先的文本匹配行为。
  if (occurrences.length === 0) return rendered.indexOf(needle)

  let preferred = 0
  for (let index = 1; index < occurrences.length; index += 1) {
    if (
      Math.abs(map[occurrences[index]!]! - sourceStart) <
      Math.abs(map[occurrences[preferred]!]! - sourceStart)
    ) {
      preferred = index
    }
  }

  let at = -1
  for (let index = 0; index <= preferred; index += 1) {
    at = rendered.indexOf(needle, at + 1)
    if (at === -1) return -1
  }
  return at
}

/**
 * 在滚动容器里找 snippet 对应的文本区间。
 *
 * 把所有文本节点各自归一化后拼接成全文（记录每个节点在全文里的位置），
 * 对全文做 indexOf，再把命中位置映射回「哪个节点的第几个字符」。
 * 返回的 Range 直接可用于 Highlight 与 scroll 定位。
 */
function highlightSnippet(
  root: HTMLElement,
  snippet: string,
  sourceBody: string,
  sourceStart: number,
  minLength = 4,
): Range | null {
  // 检索摘要可能以「…」结尾（片段被截断的标记），它不在原文里，必须剥掉
  const raw = snippet
    .trim()
    .replace(/(\.{3}|…)$/, '')
    .trim()
  if (raw.length < minLength) return null

  // 头部、AI 摘要和大纲也可能重复正文词句；优先只在真实正文里找。
  const contentRoot = root.querySelector<HTMLElement>('.ProseMirror, pre') ?? root
  const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT)
  const chunks: { node: Text; norm: string; map: number[] }[] = []
  let full = ''
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const { norm, map } = normalizeForMatch(node.data)
    if (norm.length === 0) continue
    chunks.push({ node, norm, map })
    full += norm
  }

  const needleFull = normalizeForMatch(raw).norm
  // 全文命中优先；正文可能被编辑过或引用被截断，逐级退化为更短的前缀
  const candidates = [needleFull, needleFull.slice(0, 40), needleFull.slice(0, 20)].filter(
    (candidate) => candidate.length >= minLength,
  )
  let at = -1
  let needle = ''
  for (const candidate of candidates) {
    at = findPreferredSnippetPosition(full, sourceBody, candidate, sourceStart)
    if (at !== -1) {
      needle = candidate
      break
    }
  }
  if (at === -1) return null

  /**
   * 全文区间 [at, at + needle.length) 与各块的区间求交集——
   * 纯算术，不依赖「逐块消耗」的游标循环（那个写法在跨块时容易错一位，
   * 实测把散列算成 0 长度）。snippet 本身可能跨块（标题 + 段落），
   * 交集法天然支持。
   */
  const range = document.createRange()
  let chunkStart = 0
  let started = false
  for (const chunk of chunks) {
    const chunkEnd = chunkStart + chunk.norm.length
    const overlapStart = Math.max(at, chunkStart)
    const overlapEnd = Math.min(at + needle.length, chunkEnd)
    if (overlapStart < overlapEnd) {
      const first = chunk.map[overlapStart - chunkStart]!
      const last = chunk.map[overlapEnd - chunkStart - 1]!
      if (!started) {
        range.setStart(chunk.node, first)
        started = true
      }
      range.setEnd(chunk.node, Math.min(last + 1, chunk.node.data.length))
    }
    chunkStart = chunkEnd
  }
  if (!started) return null

  if (range.collapsed) return null
  // 缺少 Custom Highlight API 时仍返回 Range，保证命中片段能滚入视野。
  if (typeof Highlight !== 'undefined') {
    window.CSS?.highlights?.set('mimir-citation', new Highlight(range))
  }
  return range
}
