import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  DownloadOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import type { Citation, DocumentDetail } from '@mimir/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Empty, Skeleton, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { StatusBadge } from '@/components/DocumentBadges'
import { NoteEditor } from '@/components/NoteEditor'
import { useContentStyles } from '@/components/ContentTypography.style'
import { DocumentFooter } from '@/components/document/DocumentFooter'
import { useStyles } from '@/components/document/DocumentPanel.style'
import { FilePreview } from '@/components/document/FilePreview'
import { MarkdownBody } from '@/components/document/MarkdownBody'
import { TriageBar } from '@/components/document/TriageBar'
import { extractHeadings } from '@/components/document/headings'
import { formatMeta } from '@/components/list-helpers'
import { api } from '@/lib/api'
import { useAppShell } from '@/lib/app-shell-context'

/**
 * 右栏：文档视图。
 *
 * 结构自上而下：
 *   工具条（路径 + 问 AI）
 *   返回对话（从对话点引用跳过来时出现）
 *   整理条（仅收件箱里的文档，见 document/TriageBar.tsx）
 *   正文 + 右侧大纲
 *   页脚（来源 / 被引用，见 document/DocumentFooter.tsx）
 *
 * 「资料」是只读的（`docs/PRD.md` §2.3）——抓来的内容不该被就地编辑，
 * 否则原始快照和派生正文就分不清哪个是真的了。所以非 note 只渲染不挂编辑器。
 *
 * 样式、大纲抽取、整理条、页脚都在 `document/` 下的独立文件里：
 * 这个组件负责**编排**，不是样式仓库。
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
}

export function DocumentPanel({
  documentId,
  onBack,
  citation,
  onBackToChat,
  onAskAi,
  onAskAboutSelection,
  onOpenDocument,
}: DocumentPanelProps) {
  const { styles } = useStyles()
  const { styles: contentStyles } = useContentStyles()
  const { clearHighlight } = useAppShell()
  const queryClient = useQueryClient()
  const { message } = App.useApp()

  /**
   * 保存状态由编辑器上报，在工具条右侧显示。
   *
   * 它原先渲染在正文上方、标题与元信息之间——一块只有「已保存」三个字的
   * 独立行，两侧都是空的，看起来像没画完的东西；而且**位置会跳**：
   * 状态出现与消失时整块正文上下移动（`saveRow` 有 min-height 但仍在流里）。
   *
   * 移到工具条后它落在**常驻且不占额外高度**的位置，与其他界面状态
   * （路径、问 AI）同一层——这也符合 `docs/PRD.md` §5.9「工具条常驻」
   * 的原话，之前那个实现和文档写的位置并不一致。
   */
  const [save, setSave] = useState<SaveSnapshot>({ state: 'idle', retry: () => {} })

  const docQuery = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.documents.get(documentId!),
    enabled: Boolean(documentId),
  })

  const doc = docQuery.data
  const headings = doc ? extractHeadings(doc.body) : []
  const scrollRef = useRef<HTMLDivElement>(null)
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
    const root = scrollRef.current
    if (!root) return

    const list = extractHeadings(body)
    if (list.length < 2) return

    const targets = list
      .map((heading) => root.querySelector(`#${heading.id}`))
      .filter((node): node is Element => node !== null)
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible?.target.id) setActiveHeading(visible.target.id)
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )

    for (const target of targets) observer.observe(target)
    return () => observer.disconnect()
  }, [body])

  const jumpTo = (id: string) => {
    const root = scrollRef.current
    const target = root?.querySelector(`#${id}`)
    if (!root || !target) return
    root.scrollTo({
      top:
        target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 20,
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
     * **要重试**：effect 首次跑时正文可能还没挂载完（Tiptap 是异步渲染的），
     * 那时注册的 Range 会在内容重渲染后塌缩成空——`highlights.size` 是 1
     * 但 `collapsed: true`，看过去就是「没有高亮」。
     *
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

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        {/*
          工具条左侧显示「这个东西在哪」：
          笔记给 vault 路径（能拿它去 Obsidian 里找），上传件给原文件名，
          抓取的资料给 URL。上传件不显示 vault 路径——它没有 vault 文件，
          显示「（尚无快照）」会让人以为记录坏了。
        */}
        <span className={styles.path}>
          {doc.kind === 'file'
            ? (doc.sourceKey?.split('/').pop() ?? doc.title)
            : (doc.path ?? doc.url ?? '（尚无快照）')}
        </span>

        {/* 保存状态常驻工具条。**只在笔记上显示**：资料与文件都是只读的，
            给它们显示「已保存」会让人以为可以编辑（PRD §2.3、DESIGN §8.11） */}
        {doc.kind === 'note' && <SaveIndicator state={save.state} retry={save.retry} />}

        {/* 上传件的下载入口。它在工具条常驻而不是只出现在「原件」层里——
            下载是最常用的动作，让它要求先切到原件层是多一步 */}
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
            /* 没有正文时禁用并说明原因（tooltip 里）——留一个点了没反应的按钮
               是最坏的一种（DESIGN §7.4） */
            disabled={doc.body.trim() === ''}
          >
            问 AI
          </Button>
        </Tooltip>
      </div>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.cols}>
          <div className={styles.inner}>
            {/*
              返回入口（docs/PRD.md §5.5、D-047）：两栏布局里详情占满主区，
              「回去」必须是一个显式动作。两个返回并存——从对话点引用跳来的
              场景里「返回对话」优先出现，「返回库」永远可用。
            */}
            {(onBackToChat || onBack) && (
              <div className={styles.backRow}>
                {onBackToChat && (
                  <button type="button" className={styles.backChat} onClick={onBackToChat}>
                    <ArrowLeftOutlined style={{ fontSize: 11 }} />
                    返回对话
                  </button>
                )}
                {onBack && (
                  <button type="button" className={styles.backChat} onClick={onBack}>
                    <ArrowLeftOutlined style={{ fontSize: 11 }} />
                    返回库
                  </button>
                )}
              </div>
            )}

            {/*
              标题：笔记可改，资料只读。改名会让服务端同步移动 vault 里的
              文件（见 lib/vault.ts 的 moveNote），所以这里不是纯前端改名
            */}
            {doc.kind === 'note' ? (
              <Typography.Title
                level={1}
                className={styles.title}
                editable={{
                  onChange: (next) => {
                    const trimmed = next.trim()
                    // 空标题会让 buildNotePath 生成 `-<id>.md` 这种无名文件，
                    // 所以拒绝空值而不是静默接受
                    if (!trimmed || trimmed === doc.title) return
                    renameTitle.mutate(trimmed)
                  },
                  tooltip: '点击修改标题（会同步重命名文件）',
                  maxLength: 200,
                }}
              >
                {doc.title}
              </Typography.Title>
            ) : (
              <h1 className={styles.title}>{doc.title}</h1>
            )}
            <DocumentMeta doc={doc} />

            {/*
              整理条在**标题与元信息之后**。
              
              它原先排在最前面，于是打开一篇收件箱文档时，第一眼是一整块
              待办动作，而「这是哪一篇」的标题被压在下面（用户原话：
              「标题上面一大片待整理，我觉得不太好看」）。顺序也说不通——
              你没法在还没看清是什么之前决定怎么归类它。
              
              放到这里之后：标题（是什么）→ 元信息（从哪来）→ 整理（怎么办）
              → 正文。整理动作仍在首屏，没有变难找。
            */}
            {doc.status === 'inbox' && <TriageBar doc={doc} />}

            {/*
              三种正文区，按 kind 分派：

              | kind | 用什么 | 为什么 |
              |---|---|---|
              | note | NoteEditor | 它是唯一可编辑的东西 |
              | file | FilePreview | 上传件有原件这一层（PDF 在线看、Word 下文本…） |
              | 其余 | MarkdownBody | 抓取的资料只有派生正文，只读渲染 |

              抓来的资料不可编辑——它的真相是原始快照 + 派生正文，
              就地改写会让「原文是什么」变得不可考。上传件同理。
            */}
            {doc.kind === 'note' ? (
              <NoteEditor
                key={doc.id}
                document={doc}
                title={doc.title}
                onSaveStateChange={setSave}
                onAskAboutSelection={(passage) => onAskAboutSelection(doc.id, passage)}
              />
            ) : doc.kind === 'file' ? (
              <FilePreview key={doc.id} doc={doc} />
            ) : (
              /* 正文排版与编辑器共用同一个类——两个视图都让 Tiptap 渲染同一份
                 Markdown，排版必须同源。这里曾经各自手抄一份，漂移出四处 */
              <div className={contentStyles.content}>
                <MarkdownBody body={doc.body} headings={headings} />
              </div>
            )}

            <DocumentFooter doc={doc} onOpenDocument={onOpenDocument} />
          </div>

          {/* 右侧大纲。标题数 ≥ 2 才出现——两段话的笔记不需要目录，
              常驻只是白占 196px（docs/PRD.md §5.10） */}
          {headings.length >= 2 && (
            <aside className={styles.outline}>
              <div className={styles.outlineTitle}>大纲</div>
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  type="button"
                  className={`${styles.olItem} ${heading.level === 3 ? styles.olItemLv3 : ''} ${
                    activeHeading === heading.id ? styles.olItemActive : ''
                  }`}
                  onClick={() => jumpTo(heading.id)}
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
 * 保存状态。只在工具条上出现——正文里不放它，见组件顶部的说明。
 *
 * 失败时点击重试：不能只把失败画出来却不给动作（`docs/PRD.md` §5.9）。
 */
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SaveSnapshot {
  state: SaveState
  retry: () => void
}

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  saving: '正在保存…',
  saved: '已保存',
  error: '保存失败 · 点此重试',
}

function SaveIndicator({ state, retry }: SaveSnapshot) {
  const { styles } = useStyles()
  // 空状态不占位也不留空白：没在保存时工具条上不该有它的痕迹
  if (state === 'idle') return null

  return (
    <button
      type="button"
      className={`${styles.save} ${state === 'error' ? styles.saveError : ''}`}
      onClick={state === 'error' ? retry : undefined}
      /* 非失败态不可点：它只是状态显示，做成按钮但禁掉点击比让它可点更
         诚实——可点而无事发生是最坏的一种 */
      disabled={state !== 'error'}
    >
      {SAVE_LABEL[state]}
    </button>
  )
}

/**
 * 标题下的元信息行。
 *
 * 「手动编辑 / AI 整理」这个标注借自 WeKnora（`docs/PRD.md` §5.10）：
 * 让用户一眼看出内容是**自己写的**还是**机器整理的**。
 * 它和来源徽标是两件事——来源说「从哪来」，这个说「谁生成的」。
 */
function DocumentMeta({ doc }: { doc: DocumentDetail }) {
  const { styles } = useStyles()
  const format = formatMeta(doc)

  return (
    <div className={styles.meta}>
      {doc.status === 'inbox' && <StatusBadge status="inbox" />}
      {doc.kind === 'note' ? (
        <span className={styles.originManual}>手动编辑</span>
      ) : doc.kind === 'file' ? (
        /* 上传件说「本机导入」，不说「AI 整理」——后者是在说一个没发生的事，
           而元信息行里的每一条都该是真的 */
        <span className={styles.originManual}>本机导入</span>
      ) : (
        <span className={styles.originAuto}>AI 整理</span>
      )}
      {/* 格式与大小：中性文字，不是彩色徽标（DESIGN §8.3）。
          它们与来源徽标并排但语义不同——徽标是「从哪来」，这是「是什么」 */}
      {format && <span className={styles.formatMeta}>{format}</span>}
      {doc.folder && (
        <span>
          <ApartmentOutlined /> {doc.folder}
        </span>
      )}
      {doc.tags.map((tag) => (
        <Tag key={tag} variant="filled" style={{ marginInlineEnd: 0 }}>
          {tag}
        </Tag>
      ))}
      <span className={styles.metaSpacer}>
        {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
      </span>
    </div>
  )
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
