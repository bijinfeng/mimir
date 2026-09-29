import {
  AppstoreOutlined,
  BarsOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { App, Button, Empty, Input, Segmented, Skeleton, Tag } from 'antd'
import { useEffect, useState } from 'react'
import type { DocumentSummary } from '@mimir/shared'
import { StatusBadge } from '@/components/DocumentBadges'
import {
  emptyScopeHint,
  excerptText,
  formatMeta,
  formatRelative,
  readLibraryLayout,
  scopeParams,
  scopeTitle,
  writeLibraryLayout,
  type LibraryLayout,
} from '@/components/list-helpers'
import { api } from '@/lib/api'
import { useAppShell } from '@/lib/app-shell-context'
import { useUnsaved } from '@/lib/unsaved'
import { useStyles } from '@/components/library/LibraryView.style'

/**
 * 库视图：文档模式的**浏览态主区**（URL 无 `id` 时）。
 *
 * 两栏布局（D-047）里它是收集内容的展台——搜索、卡片/列表两种布局、
 * 点开进阅读态。原 `ListColumn`（300px 中栏）的数据引擎原样搬到这里：
 *
 *  - 有搜索词 → 走检索（中文分词 + 子串兜底，比前端 filter 正确）
 *  - 无搜索词 → 走列表（按 scope 筛选：全部 / 目录 / 标签）
 *
 * 与旧中栏的差异：
 *  - 搜索输入在组件内部并带 **300ms 防抖**——原先每敲一个键就发一次请求，
 *    主区宽了、打字更长，这个浪费被放大了
 *  - 来源（kind）不再是维度（D-047）：没有筛选胶囊与来源徽标，
 *    卡片上的标签是**可点的**——点击进入 `scope=tag:<name>`，
 *    标签的「横切」维度由此成为真的筛选入口
 *
 * ## 两种布局（D-067）
 *
 * 卡片（网格，默认）扫读的是**摘要**，列表（行条）扫读的是**标题清单**。
 * 两者消费同一份 `items`，差别只在排版——切换不改数据、不改筛选，
 * 偏好存 `localStorage`（`list-helpers.ts` 的 `readLibraryLayout`）。
 *
 * ## 页面级的入口
 *
 * 头部右侧放「收集内容」与「新建笔记」：收集走应用壳唯一的
 * `CaptureDialog`（`AppShellContext.openCapture`——对话框只有一个实例，
 * 侧边栏、命令面板、这里三处唤起同一份状态），新建直接建一篇空笔记并
 * 进入编辑。空态里给同样两个按钮——「这里还是空的」如果只有一句话
 * 没有动作，跟报错没区别（DESIGN §7.4）。
 */
export function LibraryView({ scope }: { scope: string }) {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const { openDocument, openCapture } = useAppShell()
  const { runGuarded } = useUnsaved()
  const { message } = App.useApp()

  /** 输入框的即时值；真正发起请求的是 300ms 后的防抖值 */
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  /** 惰性初始化只读一次 localStorage；之后读的都是 state（与折叠偏好同型） */
  const [layout, setLayout] = useState<LibraryLayout>(readLibraryLayout)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])

  const listQuery = useQuery({
    queryKey: ['documents', scope, query],
    queryFn: () => {
      if (query) {
        /**
         * 搜索带上当前 scope **能带的那一半**。
         *
         * 检索契约（`searchQuerySchema`）只有 kind 与 tag：标签是它的一个
         * 条件，所以 tag 视图里的搜索必须把它传下去，否则用户以为搜的是
         * 这个标签、实际搜的是全库。目录**不在检索契约里**——那条路要改
         * `packages/shared` 与两条 leg，先由 `scopeTitle` 把范围写在标题上
         * （见 `list-helpers.ts` 的注释）。
         */
        const { tag } = scopeParams(scope)
        return api.search({ q: query, limit: 50, ...(tag ? { tag } : {}) }).then((result) => ({
          items: result.hits.map(
            (hit) =>
              ({
                id: hit.documentId,
                kind: hit.kind,
                status: 'ready',
                title: hit.title,
                excerpt: hit.snippet.text,
                tags: [],
                path: hit.path,
                url: hit.url,
                // 检索命中带格式与大小（见 @mimir/shared 的 searchHitSchema），
                // 所以搜索结果的卡片与浏览结果长得一样；命中不携带标签
                mime: hit.mime,
                size: hit.size,
                folder: null,
                createdAt: '',
                updatedAt: '',
              }) satisfies DocumentSummary,
          ),
        }))
      }
      return api.documents.list({
        ...scopeParams(scope),
        limit: 50,
      })
    },
    placeholderData: keepPreviousData,
  })

  const items = listQuery.data?.items ?? []
  const open = (id: string) => runGuarded(() => openDocument(id))
  const openTag = (tag: string) =>
    runGuarded(() => void navigate({ to: '/docs', search: { scope: `tag:${tag}` } }))
  const scopeHint = emptyScopeHint(scope)

  const switchLayout = (next: LibraryLayout) => {
    setLayout(next)
    writeLibraryLayout(next)
  }

  const createNote = async () => {
    try {
      const created = await api.documents.createNote({
        title: '未命名笔记',
        body: '',
        tags: [],
      })
      open(created.id)
    } catch {
      message.error('新建笔记失败')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <div className={styles.headTitle}>
            <h1 className={styles.title}>{scopeTitle(scope, query)}</h1>
            <span className={styles.sub}>{items.length} 条</span>
          </div>
          <div className={styles.headActions}>
            <Button icon={<UploadOutlined />} onClick={openCapture}>
              收集内容
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void createNote()}>
              新建笔记
            </Button>
          </div>
        </div>

        <div className={styles.searchRow}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
            placeholder="搜索标题与正文…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          {/* 带文字标签的 Segmented：纯图标档的可及名称问题（AGENTS 坑表）
              在这里靠「文字就在标签里」直接绕开 */}
          <Segmented
            value={layout}
            onChange={(value) => switchLayout(value as LibraryLayout)}
            options={[
              { value: 'card', icon: <AppstoreOutlined />, label: '卡片' },
              { value: 'list', icon: <BarsOutlined />, label: '列表' },
            ]}
          />
        </div>
      </div>

      <div className={styles.body}>
        {listQuery.isLoading ? (
          <div className={styles.loading}>
            <Skeleton active paragraph={{ rows: 5 }} title={false} />
          </div>
        ) : items.length === 0 ? (
          <Empty
            className={styles.empty}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                {query ? '没有匹配的内容' : '这里还是空的'}
                {query && (
                  <span className={styles.emptyHint}>换个说法试试，分词可能切得不一样</span>
                )}
                {/* 空目录里的两个按钮建出来的东西不归入这个目录——
                    不说明的话，用户会以为按钮没生效（list-helpers 的 emptyScopeHint） */}
                {!query && scopeHint && <span className={styles.emptyHint}>{scopeHint}</span>}
              </span>
            }
          >
            {/* 空态的动作只在「真的没有内容」时给——搜索无结果时
                给「收集/新建」等于答非所问 */}
            {!query && (
              <div className={styles.emptyActions}>
                <Button icon={<UploadOutlined />} onClick={openCapture}>
                  收集内容
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => void createNote()}>
                  新建笔记
                </Button>
              </div>
            )}
          </Empty>
        ) : layout === 'card' ? (
          <div className={styles.grid}>
            {items.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={styles.card}
                onClick={() => open(doc.id)}
              >
                <span className={styles.cardTitle}>{doc.title}</span>
                <p className={styles.cardExcerpt}>{excerptText(doc)}</p>
                <span className={styles.cardMeta}>
                  {/* 徽标 + 标签 + 格式是同一条可折行的流；时间在它外面
                      —— 折行时时间必须留在第一行（LibraryView.style.ts 的
                      cardMeta 注释写了为什么） */}
                  <span className={styles.cardMetaMain}>
                    <StatusBadge status={doc.status} />
                    {/* 搜索结果不带标签（检索契约里没有），所以只在浏览态出现 */}
                    {doc.tags.slice(0, 3).map((tag) => (
                      <Tag
                        key={tag}
                        variant="filled"
                        className={styles.tagLink}
                        onClick={(event) => {
                          event.stopPropagation()
                          openTag(tag)
                        }}
                        style={{ marginInlineEnd: 0, fontSize: 11 }}
                      >
                        #{tag}
                      </Tag>
                    ))}
                    {formatMeta(doc) && <span className={styles.format}>{formatMeta(doc)}</span>}
                  </span>
                  <span className={styles.spacer}>
                    {doc.updatedAt ? formatRelative(doc.updatedAt) : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {items.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={styles.row}
                onClick={() => open(doc.id)}
              >
                <span className={styles.rowTop}>
                  <span className={styles.rowTitle}>{doc.title}</span>
                  <span className={styles.rowTime}>
                    {doc.updatedAt ? formatRelative(doc.updatedAt) : ''}
                  </span>
                </span>
                <span className={styles.rowBottom}>
                  <span className={styles.rowExcerpt}>{excerptText(doc)}</span>
                  <StatusBadge status={doc.status} />
                  {doc.tags.slice(0, 2).map((tag) => (
                    <Tag
                      key={tag}
                      variant="filled"
                      className={styles.tagLink}
                      onClick={(event) => {
                        event.stopPropagation()
                        openTag(tag)
                      }}
                      style={{ marginInlineEnd: 0, fontSize: 11 }}
                    >
                      #{tag}
                    </Tag>
                  ))}
                  {formatMeta(doc) && <span className={styles.format}>{formatMeta(doc)}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
