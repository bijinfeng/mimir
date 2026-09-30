import {
  ArrowLeftOutlined,
  DownloadOutlined,
  MessageOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { viewerFor, type Citation, type DocumentDetail, type NoteUpdate } from '@mimir/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Dropdown, Empty, Skeleton, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { StatusBadge } from '@/components/DocumentBadges'
import { NoteEditor } from '@/components/NoteEditor'
import { useContentStyles } from '@/components/ContentTypography.style'
import { DocumentFooter } from '@/components/document/DocumentFooter'
import { useStyles } from '@/components/document/DocumentPanel.style'
import { FilePreview } from '@/components/document/FilePreview'
import { MarkdownBody } from '@/components/document/MarkdownBody'
import { buildDocMenu } from '@/components/document/doc-menu'
import { flattenFolders } from '@/components/document/folders'
import { extractHeadings } from '@/components/document/headings'
import { formatMeta } from '@/components/list-helpers'
import { api } from '@/lib/api'
import { useAppShell } from '@/lib/app-shell-context'
import { useScrolled } from '@/lib/use-scrolled'
import { useUnsaved } from '@/lib/unsaved'

/**
 * 右栏：文档视图。
 *
 * 结构自上而下：
 *   工具条（路径 + 下载 + 问 AI + ⋯）
 *   返回（从对话点引用跳过来时出现）
 *   标题 + 元信息
 *   正文（笔记可编辑、上传件分两层、资料只读）
 *   页脚（来源 / 被引用）
 *
 * 「资料」是只读的（`docs/PRD.md` §2.3）——抓来的内容不该被就地编辑，
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
  /** 工具条「问 AI」：带着这篇的上下文进主视图对话 */
  onAskAi: (documentId: string) => void
  /**
   * 内联工具条「就这段提问」：带着选中的话进对话。
   *
   * 与「问 AI」的区别是它**锚定了选中内容**——范围同样锁在这一篇，
   * 但把选中的话预填进输入框，比「问整篇」精确（PRD §5.5）。
   */
  onAskAboutSelection: (documentId: string, passage: string) => void
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
  onAskAi,
  onAskAboutSelection,
  onOpenDocument,
  onDirtyChange,
}: DocumentPanelProps) {
  const { styles } = useStyles()
  const { styles: contentStyles } = useContentStyles()
  const { clearHighlight } = useAppShell()
  const { runGuarded } = useUnsaved()
  const queryClient = useQueryClient()
  const { message } = App.useApp()

  const docQuery = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.documents.get(documentId!),
    enabled: Boolean(documentId),
  })

  const doc = docQuery.data
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
   * 右侧大纲的判据**只有一个**：正文里有没有 ≥ 2 个标题。
   *
   * 它是正文的锚点导航（`docs/PRD.md` §5.10），唯一的豁免是**有原件的
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
   */
  const showOutline = headings.length >= 2 && !showsSource
  const scrollRef = useRef<HTMLDivElement>(null)
  /* 标题栏的界线随正文滚动显形（D-070） */
  const headerScrolled = useScrolled(scrollRef)
  const [activeHeading, setActiveHeading] = useState<string | undefined>()

  /**
   * 标题住在面板而不是编辑器里。
   *
   * 标题是**文档级元数据**——它决定文件名（`lib/vault.ts` 的 buildNotePath），
   * 而正文是编辑器内容。两处都渲染标题会让页面上出现两个一模一样的 h1
   * （真实踩过）。所以标题归这里，编辑器只管正文。
   *
   * 真相在查询缓存里：改名走 `renameTitle`，成功后把新值写回缓存，
   * 于是标题与编辑器传下去的 `title` 都会跟着更新，不需要额外的本地 state。
   * 用 antd 的 `Typography.Title editable` 做就地编辑，它自带
   * 确认/取消与键盘行为，比手搓一个可编辑标题可靠。
   */
  const renameTitle = useMutation({
    mutationFn: (next: string) => api.documents.update(documentId!, { title: next }),
    onSuccess: (updated) => {
      void queryClient.setQueryData(['document', updated.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '改名失败'),
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
   * 引用跳转的下半句：滚动到原文区间并高亮（D-047 待办收尾）。
   *
   * 定位用**归一化文本匹配**而不是 citation.start/end 的字符偏移——
   * 偏移指向原始 Markdown 正文，而渲染后的 DOM 里没有 `**` 这类记号，
   * 直接按偏移找必然错位。匹配先试全文，再试前缀（长引用被截断时仍能命中）；
   * 都找不到就只跳转不高亮——不做「看起来高亮了其实是别处」的假动作。
   *
   * 高亮用 CSS Custom Highlight API：Range 注册到 `CSS.highlights`，
   * 不改 DOM（只读正文与 Tiptap 编辑器的文本节点都适用），样式在
   * `styles/global.ts` 的 `::highlight(mimir-citation)`。
   * 消费一次即清除 context（高亮不跟着用户去下一篇文档）。
   */
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !doc || !citation) return
    const snippet = citation.snippet

    /**
     * **要重试**：effect 首次跑时正文可能还没挂载完（笔记的 Tiptap 与
     * 只读渲染都是异步的），此时注册的 Range 会在内容重渲染后塌缩成空
     * ——实测症状是 `highlights.size` 为 1 但 `collapsed: true`，看过去
     * 就是「没有高亮」。这里每 150ms 重试一次，直到 Range 在下一帧
     * 仍然有效（或超时放弃，只跳转不高亮）。
     */
    let cancelled = false
    let attempts = 0

    /**
     * **清除必须等结束之后**：`clearHighlight` 会改 context，触发本 effect
     * 以 citation=null 重跑，cleanup 把 cancelled 置真——放在开头调用等于
     * 第一次 tick 就被掐断（实测踩过：重试循环从未跑第二轮）。
     */
    const finish = () => {
      clearHighlight()
    }

    const tick = () => {
      if (cancelled) return
      attempts += 1

      const registered = window.CSS?.highlights?.get('mimir-citation')
      const alive = registered
        ? [...registered].find(
            (range): range is Range => !range.collapsed && range.startContainer.isConnected,
          )
        : undefined

      if (alive) {
        // 上一次注册的还活着 → 内容已稳定：滚过去，收工
        const rect = alive.getBoundingClientRect()
        root.scrollTo({
          top: rect.top - root.getBoundingClientRect().top + root.scrollTop - 140,
          behavior: 'smooth',
        })
        finish()
        return
      }

      highlightSnippet(root, snippet)
      if (attempts < 20) window.setTimeout(tick, 150)
      else finish()
    }
    tick()

    return () => {
      cancelled = true
    }
  }, [doc, citation, clearHighlight])

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

  if (docQuery.isError) {
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

  const menu = buildDocMenu({
    doc,
    onSetTags: (tags) => patch.mutate({ tags }),
    onSetFolder: (folder) => patch.mutate({ folder }),
    folders: flattenFolders(folderQuery.data?.items ?? []).map((item) => item.path),
    suggestedTags: suggestQuery.data?.items ?? [],
  })

  return (
    <div className={styles.wrap}>
      {/*
        Office 式头部：**一行**（D-054）。
        返回 · 标题 · 元信息 · 动作，四段挤在 44px 里——这是 Word / Excel
        网页版的标题栏形态。原先它占三行（返回胶囊 / 28px 大标题 / 元信息行），
        约 150px 的铬条压在内容之上，而文件类文档的内容（纸张、表格、幻灯片）
        恰恰是越高越好。

        返回按钮**留在头部最左**而不是收进菜单：`docs/PRD.md` §5.5 要求
        「回去」是显式动作（不能靠浏览器后退），而两栏布局里它是离开详情的
        主路径。两个返回并存——「返回对话」只在从对话跳来时出现。

        两个都走 `runGuarded`：这里是**离开详情的主路径**，而原先它直接
        `navigate`，于是编辑器刚写着「已修改，未保存」的那一笔改动就这么丢了
        （与侧栏导航不一致——那里一直有拦截）。有未保存内容时才弹守卫框，
        干净时不留任何中间态（`lib/unsaved.tsx` 的 `runGuarded`）。
      */}
      <div className={styles.header} data-scrolled={headerScrolled || undefined}>
        {onBackToChat && (
          <button type="button" className={styles.back} onClick={() => runGuarded(onBackToChat)}>
            <ArrowLeftOutlined style={{ fontSize: 11 }} />
            返回对话
          </button>
        )}
        {onBack && (
          <button type="button" className={styles.back} onClick={() => runGuarded(onBack)}>
            <ArrowLeftOutlined style={{ fontSize: 11 }} />
            返回库
          </button>
        )}

        {/*
          标题：笔记可改（它决定文件名，所以改名会让服务端同步移动 vault 里的
          文件，见 lib/vault.ts 的 moveNote），文件与资料只读。

          用 antd 的 `Typography.Title editable` 做就地编辑，它自带确认/取消
          与键盘行为，比手搓一个可编辑标题可靠。
        */}
        {/*
          **两个分支都是 `Typography.Title`**，即使文件与资料的标题不可改。
          换成一个裸 `<h1>` 会让那条抬了特异性的规则匹配不上它，字号回落到
          浏览器默认的 28px（在 44px 的头部里就是「挤且丑」）。一个元素类型
          = 一条样式路径，不存在「哪条规则匹配不到」。
        */}
        <Typography.Title
          level={1}
          className={styles.headerTitle}
          title={doc.title}
          {...(doc.kind === 'note'
            ? {
                editable: {
                  onChange: (next: string) => {
                    const trimmed = next.trim()
                    // 空标题会让 buildNotePath 生成 `-<id>.md` 这种无名文件，
                    // 所以拒绝空值而不是静默接受
                    if (!trimmed || trimmed === doc.title) return
                    renameTitle.mutate(trimmed)
                  },
                  tooltip: '点击修改标题（会同步重命名文件）',
                  maxLength: 200,
                },
              }
            : {})}
        >
          {doc.title}
        </Typography.Title>

        <DocHeaderMeta doc={doc} />

        <div className={styles.headerActions}>
          {/* 上传件的下载入口。它在头部常驻而不是等用户切到某一层——
              下载是最常用的动作（PRD §5.12） */}
          {doc.kind === 'file' && doc.sourceKey && (
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              className={styles.tbBtn}
              href={api.documents.sourceUrl(doc.id, { download: true })}
            >
              下载
            </Button>
          )}

          <Tooltip
            title={
              doc.body.trim() === ''
                ? '这篇还没有可检索的正文，问答里引用不到它'
                : '带这篇的上下文去主视图对话，范围自动锁到这一篇'
            }
          >
            <Button
              type="text"
              size="small"
              icon={<MessageOutlined />}
              className={styles.tbBtn}
              onClick={() => onAskAi(doc.id)}
              /* 没有正文时禁用并说明原因（tooltip 里）——留一个点了没反应的
                 按钮是最坏的一种（DESIGN §7.4） */
              disabled={doc.body.trim() === ''}
            >
              问 AI
            </Button>
          </Tooltip>

          {/*
            「⋯」：元信息动作的出口。原先是整理条上的几项（标签 / 目录），
            现在收在一处。它在最右端——**高频动作在左、低频在右**是工具条
            的通用约定，而这两项都是低频的（D-054）
          */}
          <Dropdown trigger={['click']} menu={{ items: menu }} placement="bottomRight">
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              className={styles.tbBtn}
              aria-label="更多操作"
            />
          </Dropdown>
        </div>
      </div>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.cols}>
          <div className={wideContent ? styles.innerWide : styles.inner}>
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
                title={doc.title}
                onAskAboutSelection={(passage) => onAskAboutSelection(doc.id, passage)}
                onDirtyChange={onDirtyChange}
              />
            ) : doc.kind === 'file' ? (
              <FilePreview key={doc.id} doc={doc} onDirtyChange={onDirtyChange} />
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
              有原件的文件类文档除外（原件自带导航） */}
          {showOutline && (
            <aside className={styles.outline}>
              <div className={styles.outlineTitle}>大纲</div>
              {headings.map((heading, index) => (
                <button
                  key={heading.id}
                  type="button"
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
  )
}

/**
 * 头部元信息那一行。
 *
 * 它承载的是「一眼要确认的东西」，按重要性排序（从左到右）：
 *
 * | 项 | 为什么在这里 |
 * |---|---|
 * | 状态徽标 | `failed` 是**状态**，它说「这条记录坏了」——`ready` 不给徽标（DESIGN §3.7） |
 * | 来源标注 | 「手动编辑 / AI 整理 / 本机导入」——借自 WeKnora（PRD §5.10）：一眼看出内容是谁生成的 |
 * | 位置 | 笔记的 vault 路径（能拿它去 Obsidian 里找）／上传件的原文件名／资料的 URL |
 * | 格式与大小 | 上传件才有（「PDF · 2.4 MB」）；**不是徽标**，格式是开放集合（DESIGN §3.7） |
 * | 日期 | 最后更新 |
 *
 * **标签与目录不在这里**——它们在「⋯」菜单里，而那里还能增删。同一份信息
 * 摆两处，迟早有一天两处会不一致；而且标签多起来会把这一行挤爆。
 *
 * 位置是全行唯一可省略的一项：只有它可能很长（见 `location` 样式）。
 */
function DocHeaderMeta({ doc }: { doc: DocumentDetail }) {
  const { styles } = useStyles()
  const format = formatMeta(doc)
  /**
   * 位置：笔记给 vault 路径（能拿它去 Obsidian 里找），上传件给原文件名
   * （用户认得的是这个，它没有 vault 文件），资料给 URL。
   * 空串就不渲染——否则会留下一个孤零零的分隔点。
   */
  const location =
    doc.kind === 'file' ? (doc.sourceKey?.split('/').pop() ?? '') : (doc.path ?? doc.url ?? '')

  return (
    <div className={styles.headerMeta}>
      <StatusBadge status={doc.status} />
      {/*
        「手动编辑 / AI 整理 / 本机导入」这个标注让用户一眼看出内容是**自己写的**
        还是**机器整理的**。上传件说「本机导入」，不说「AI 整理」——后者是在说
        一个没发生的事，而这一行里的每一条都该是真的。
      */}
      {doc.kind === 'file' ? (
        <span className={styles.originManual}>本机导入</span>
      ) : doc.kind === 'note' ? (
        <span className={styles.originManual}>手动编辑</span>
      ) : (
        <span className={styles.originAuto}>AI 整理</span>
      )}
      {/*
        位置。上传件不显示 vault 路径——它没有 vault 文件，显示「（尚无快照）」
        会让人以为记录坏了；它显示原文件名，那才是用户认得的东西。
        空串就不渲染：否则会留下一个孤零零的分隔点（只有一个「·」）。
      */}
      {location !== '' && (
        <span className={styles.location} title={location}>
          {location}
        </span>
      )}
      {format && <span className={styles.formatMeta}>{format}</span>}
      <span>{new Date(doc.updatedAt).toLocaleDateString('zh-CN')}</span>
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

/**
 * 在滚动容器里找 snippet 对应的文本区间。
 *
 * 把所有文本节点各自归一化后拼接成全文（记录每个节点在全文里的位置），
 * 对全文做 indexOf，再把命中位置映射回「哪个节点的第几个字符」。
 * 返回的 Range 直接可用于 Highlight 与 scroll 定位。
 */
function highlightSnippet(root: HTMLElement, snippet: string): Range | null {
  // 检索摘要可能以「…」结尾（片段被截断的标记），它不在原文里，必须剥掉
  const raw = snippet
    .trim()
    .replace(/(\.{3}|…)$/, '')
    .trim()
  if (raw.length < 4) return null

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
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
    (candidate) => candidate.length >= 4,
  )
  let at = -1
  let needle = ''
  for (const candidate of candidates) {
    at = full.indexOf(candidate)
    if (at !== -1) {
      needle = candidate
      break
    }
  }
  if (at === -1) return null

  if (typeof Highlight === 'undefined') return null

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
  window.CSS?.highlights?.set('mimir-citation', new Highlight(range))
  return range
}
