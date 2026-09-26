import { SearchOutlined } from '@ant-design/icons'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Empty, Input, Skeleton, Tag } from 'antd'
import { useEffect, useState } from 'react'
import type { DocumentSummary } from '@mimir/shared'
import { StatusBadge } from '@/components/DocumentBadges'
import {
  excerptText,
  formatMeta,
  formatRelative,
  scopeParams,
  scopeTitle,
} from '@/components/list-helpers'
import { api } from '@/lib/api'
import { useAppShell } from '@/lib/app-shell-context'
import { useUnsaved } from '@/lib/unsaved'
import { useStyles } from '@/components/library/LibraryView.style'

/**
 * 库视图：文档模式的**浏览态主区**（URL 无 `id` 时）。
 *
 * 两栏布局（D-047）里它是收集内容的展台——搜索、卡片网格、点开进阅读态。
 * 原 `ListColumn`（300px 中栏）的数据引擎原样搬到这里：
 *
 *  - 有搜索词 → 走检索（中文分词 + 子串兜底，比前端 filter 正确）
 *  - 无搜索词 → 走列表（按 scope 筛选：收件箱 / 全部 / 目录 / 标签）
 *
 * 与旧中栏的两个差异：
 *  - 搜索输入在组件内部并带 **300ms 防抖**——原先每敲一个键就发一次请求，
 *    主区宽了、打字更长，这个浪费被放大了
 *  - 来源（kind）不再是维度（D-047）：没有筛选胶囊与来源徽标，
 *    卡片上的标签是**可点的**——点击进入 `scope=tag:<name>`，
 *    标签的「横切」维度由此成为真的筛选入口
 */
export function LibraryView({ scope }: { scope: string }) {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const { openDocument } = useAppShell()
  const { runGuarded } = useUnsaved()

  /** 输入框的即时值；真正发起请求的是 300ms 后的防抖值 */
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])

  const listQuery = useQuery({
    queryKey: ['documents', scope, query],
    queryFn: () =>
      query
        ? api.search({ q: query, limit: 50 }).then((result) => ({
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
        : api.documents.list({
            ...scopeParams(scope),
            limit: 50,
          }),
    placeholderData: keepPreviousData,
  })

  const items = listQuery.data?.items ?? []
  const open = (id: string) => runGuarded(() => openDocument(id))
  const openTag = (tag: string) =>
    runGuarded(() => void navigate({ to: '/docs', search: { scope: `tag:${tag}` } }))

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <h1 className={styles.title}>{scopeTitle(scope, query)}</h1>
          <span className={styles.sub}>{items.length} 条</span>
        </div>

        <Input
          allowClear
          prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
          placeholder="搜索标题与正文…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
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
                <span className={styles.emptyHint}>
                  {query ? '换个说法试试，分词可能切得不一样' : '粘贴一个链接，或新建一条笔记'}
                </span>
              </span>
            }
          />
        ) : (
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
                  <StatusBadge status={doc.status} />
                  {/*
                    标签是筛选入口：点它进入该标签的库视图。
                    搜索结果不带标签（检索契约里没有），所以只在浏览态出现
                  */}
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
                  <span className={styles.spacer}>
                    {doc.updatedAt ? formatRelative(doc.updatedAt) : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
