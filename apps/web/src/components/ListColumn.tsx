import { SearchOutlined } from '@ant-design/icons'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Empty, Input, Skeleton, Tag } from 'antd'
import type { DocumentListQuery, DocumentSummary } from '@mimir/shared'
import { KindBadge, StatusBadge } from '@/components/DocumentBadges'
import { useStyles } from '@/components/ListColumn.style'
import { KIND_FILTERS, formatRelative, scopeParams, scopeTitle } from '@/components/list-helpers'
import { api } from '@/lib/api'
import { useUnsaved } from '@/lib/unsaved'

/**
 * 中栏：**文档列表**，只有这一件事。
 *
 * ## 它曾经随模式变形，现在不变了
 *
 * 早先这里跟 `docs` / `chat` 两种模式走（`docs/PRD.md` §5.2 的原型设计）：
 *
 * | 模式 | 中栏 |
 * |---|---|
 * | 对话 | 本次引用了哪些文档 |
 * | 文档 | 文档列表 |
 *
 * 这个设计有个当时没看清的问题：**「本次引用」在右栏已经有了**——
 * 每条回答下面就是一列引用块，带类型徽标、标题与原文片段。
 * 中栏那几张卡片是它的重复，而且更差（少了与回答的对应关系）。
 *
 * 另外两种情况也说明它没必要：
 *
 *  - **新对话**：中栏本来就在显示收件箱（PRD §5.10 要求「不空着」）。
 *    也就是说中栏在对话模式下有一半时间显示的就是文档列表
 *  - **点引用跳转**：用户点引用是想看**那篇文档**，这时中栏该显示
 *    可继续浏览的文档列表，而不是他刚点过的那张卡片
 *
 * 所以中栏固定为文档列表：它的职责是「找一篇、打开它」，两种模式下都要。
 * 引用归右栏——那是回答的一部分，不是另一个列表。
 *
 * 代价是失去了「一次看到这次对话的全部来源」。那个需求由回答下的引用块
 * 满足（滚动即可），而换来的是：少一个要学的模式，且中栏永远可用。
 */

export interface ListColumnProps {
  /** 筛选：inbox / all / note / clip / folder:<path> / tag:<name> */
  scope: string
  /** 类型筛选，叠加在 scope 之上 */
  kind?: string | undefined
  selectedId?: string | undefined
  query: string
  onQueryChange: (value: string) => void
  onKindChange: (kind: string | undefined) => void
  /** 打开一篇文档 */
  onOpenDocument: (id: string) => void
}

export function ListColumn({
  scope,
  kind,
  selectedId,
  query,
  onQueryChange,
  onKindChange,
  onOpenDocument,
}: ListColumnProps) {
  const { styles, cx } = useStyles()
  const { runGuarded } = useUnsaved()

  /**
   * 两种数据源：
   *  - 有搜索词 → 走检索（中文分词 + 子串兜底，比前端 filter 正确）
   *  - 无搜索词 → 走列表（按 scope 筛选）
   */
  const listQuery = useQuery({
    queryKey: ['documents', scope, kind, query],
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
                  folder: null,
                  createdAt: '',
                  updatedAt: '',
                }) satisfies DocumentSummary,
            ),
          }))
        : api.documents.list({
            ...scopeParams(scope),
            ...(kind ? { kind: kind as DocumentListQuery['kind'] } : {}),
            limit: 50,
          }),
    placeholderData: keepPreviousData,
  })

  const items = listQuery.data?.items ?? []
  const open = (id: string) => runGuarded(() => onOpenDocument(id))

  return (
    <section className={styles.col}>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>{scopeTitle(scope, query)}</h2>
          <span className={styles.sub}>{items.length} 条</span>
        </div>

        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
          placeholder="搜索标题与正文…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />

        {/*
          分类筛选用 Tag.CheckableTagGroup 而不是 Segmented：
          Segmented 是「分段控件」，选项等宽且不换行——五个选项塞进 300px
          的列里会被截断成「公…」「Git…」（实测）。CheckableTagGroup 是
          antd 自己的胶囊组，会自然换行。
        */}
        <Tag.CheckableTagGroup
          value={kind ?? 'all'}
          onChange={(value) => onKindChange(value === 'all' ? undefined : String(value))}
          options={KIND_FILTERS}
        />
      </div>

      <div className={styles.body}>
        {listQuery.isLoading ? (
          <div className={styles.loading}>
            <Skeleton active paragraph={{ rows: 3 }} title={false} />
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
          items.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={cx(styles.item, doc.id === selectedId && styles.itemActive)}
              onClick={() => open(doc.id)}
            >
              <div className={styles.itemTop}>
                <KindBadge kind={doc.kind} />
                <span className={styles.itemTitle}>{doc.title}</span>
              </div>
              <p className={styles.itemExcerpt}>{doc.excerpt}</p>
              <div className={styles.itemMeta}>
                {doc.status === 'inbox' && <StatusBadge status="inbox" />}
                {doc.tags.slice(0, 2).map((tag) => (
                  <Tag key={tag} variant="filled" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                    #{tag}
                  </Tag>
                ))}
                <span className={styles.spacer}>
                  {doc.updatedAt ? formatRelative(doc.updatedAt) : ''}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  )
}
