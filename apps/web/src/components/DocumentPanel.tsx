import { ApartmentOutlined, ArrowLeftOutlined, MessageOutlined } from '@ant-design/icons'
import type { DocumentDetail } from '@mimir/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Empty, Skeleton, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { KindBadge, StatusBadge } from '@/components/DocumentBadges'
import { NoteEditor } from '@/components/NoteEditor'
import { useContentStyles } from '@/components/ContentTypography.style'
import { DocumentFooter } from '@/components/document/DocumentFooter'
import { useStyles } from '@/components/document/DocumentPanel.style'
import { MarkdownBody } from '@/components/document/MarkdownBody'
import { TriageBar } from '@/components/document/TriageBar'
import { extractHeadings } from '@/components/document/headings'
import { api } from '@/lib/api'

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
  onBackToChat,
  onAskAi,
  onAskAboutSelection,
  onOpenDocument,
}: DocumentPanelProps) {
  const { styles } = useStyles()
  const { styles: contentStyles } = useContentStyles()
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
        <span className={styles.path}>{doc.path ?? doc.url ?? '（尚无快照）'}</span>

        {/* 保存状态常驻工具条。**只在笔记上显示**：资料是只读的，
            给它显示「已保存」会让人以为可以编辑（PRD §2.3） */}
        {doc.kind === 'note' && <SaveIndicator state={save.state} retry={save.retry} />}

        <Tooltip title="带这篇的上下文去主视图对话，范围自动锁到这一篇">
          <Button
            type="text"
            size="small"
            icon={<MessageOutlined />}
            className={styles.tbBtn}
            onClick={() => onAskAi(doc.id)}
          >
            问 AI
          </Button>
        </Tooltip>
      </div>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.cols}>
          <div className={styles.inner}>
            {/* 从对话点引用跳过来时给一个明确的返回入口。
                没有它，用户会以为对话没了（docs/PRD.md §5.5） */}
            {onBackToChat && (
              <button type="button" className={styles.backChat} onClick={onBackToChat}>
                <ArrowLeftOutlined style={{ fontSize: 11 }} />
                返回对话
              </button>
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
              笔记用编辑器（可写），资料只渲染（只读）。
              抓来的资料不可编辑——它的真相是原始快照 + 派生正文，
              就地改写会让「原文是什么」变得不可考。
            */}
            {doc.kind === 'note' ? (
              <NoteEditor
                key={doc.id}
                document={doc}
                title={doc.title}
                onSaveStateChange={setSave}
                onAskAboutSelection={(passage) => onAskAboutSelection(doc.id, passage)}
              />
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

  return (
    <div className={styles.meta}>
      <KindBadge kind={doc.kind} />
      {doc.status === 'inbox' && <StatusBadge status="inbox" />}
      {doc.kind === 'note' ? (
        <span className={styles.originManual}>手动编辑</span>
      ) : (
        <span className={styles.originAuto}>AI 整理</span>
      )}
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
