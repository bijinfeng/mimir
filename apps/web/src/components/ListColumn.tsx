import { SearchOutlined } from '@ant-design/icons'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Empty, Input, Segmented, Skeleton, Tag } from 'antd'
import type { Citation, DocumentListQuery, DocumentSummary } from '@mimir/shared'
import { KindBadge, StatusBadge } from '@/components/DocumentBadges'
import { useStyles } from '@/components/ListColumn.style'
import {
  KIND_FILTERS,
  channelLabel,
  formatRelative,
  scopeParams,
  scopeTitle,
} from '@/components/list-helpers'
import { api } from '@/lib/api'
import { useUnsaved } from '@/lib/unsaved'

/**
 * 中栏。
 *
 * 这个栏位的语义**随模式变化**（`docs/PRD.md` §5.2）：
 *
 * | 模式 | 中栏 |
 * |---|---|
 * | 对话 | 本次引用了哪些文档 |
 * | 文档 | 文档列表 |
 *
 * 会话优先意味着「问答」是主场景，那么**「它读了什么」就该和「我有什么」
 * 一样可见**——引用不再是回答下面的一行小字，而是占据整列。
 */

export interface ListColumnProps {
  mode: 'docs' | 'chat'
  /** 文档模式：inbox / all / note / clip / folder:<path> / tag:<name> */
  scope: string
  /** 文档模式：类型筛选（叠加在 scope 之上） */
  kind?: string | undefined
  selectedId?: string | undefined
  query: string
  onQueryChange: (value: string) => void
  onModeChange: (mode: 'docs' | 'chat') => void
  onKindChange: (kind: string | undefined) => void
  /** 对话模式：引用来源列表（已存在的会话） */
  citations: Citation[]
  /** 对话模式：会话是否还在加载 */
  citationsLoading?: boolean
  /** 对话模式：是否是一个新会话 */
  isNewConversation: boolean
  /** 点击一条文档（列表项或引用卡） */
  onOpenDocument: (id: string) => void
  /** 「新对话」的中栏引导：点一条待整理内容开始问 */
  onStartFromDocument: (id: string) => void
}

export function ListColumn({
  mode,
  scope,
  kind,
  selectedId,
  query,
  onQueryChange,
  onModeChange,
  onKindChange,
  citations,
  citationsLoading,
  isNewConversation,
  onOpenDocument,
  onStartFromDocument,
}: ListColumnProps) {
  const { styles, cx } = useStyles()
  const { runGuarded } = useUnsaved()

  const isChat = mode === 'chat'

  /**
   * 文档列表。两种数据源：
   *  - 有搜索词 → 走检索（中文分词 + 子串兜底，比前端 filter 正确）
   *  - 无搜索词 → 走列表（按 scope 筛选）
   *
   * 对话模式下不请求：中栏显示的是引用，多拉一次列表是白花的查询。
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
    enabled: !isChat,
    placeholderData: keepPreviousData,
  })

  /** 新对话的中栏不空着，直接列待整理收件箱（PRD §5.10） */
  const pendingQuery = useQuery({
    queryKey: ['documents', 'inbox-pending'],
    queryFn: () => api.documents.list({ status: 'inbox', limit: 8 }),
    enabled: isChat && isNewConversation,
    placeholderData: keepPreviousData,
  })

  const items = listQuery.data?.items ?? []
  const title = isChat ? (isNewConversation ? '新对话' : '本次引用') : scopeTitle(scope, query)
  const sub = isChat
    ? isNewConversation
      ? '还没有引用'
      : `${citations.length} 个来源`
    : `${items.length} 条`

  const open = (id: string) => runGuarded(() => onOpenDocument(id))

  return (
    <section className={styles.col}>
      <div className={styles.head}>
        <Segmented
          block
          size="small"
          value={mode}
          onChange={(value) => onModeChange(value as 'docs' | 'chat')}
          options={[
            { label: '对话', value: 'chat' },
            { label: '文档', value: 'docs' },
          ]}
        />

        <div className={styles.headRow}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.sub}>{sub}</span>
        </div>

        {/* 搜索与筛选只在文档模式下有意义——对话模式的中栏展示的是引用 */}
        {!isChat && (
          <>
            <Input
              allowClear
              size="small"
              prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
              placeholder="搜索标题与正文…"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              style={{ marginTop: 10 }}
            />
            {/*
              分类筛选用 Tag.CheckableTagGroup 而不是 Segmented：
              Segmented 是「分段控件」，它的选项等宽且不换行——五个选项塞进
              300px 的列里会被截断成「公…」「Git…」（实测）。
              CheckableTagGroup 是 antd 自己的胶囊组，会自然换行，
              而且它就是为「一组可选的分类」设计的。
            */}
            <Tag.CheckableTagGroup
              value={kind ?? 'all'}
              onChange={(value) => onKindChange(value === 'all' ? undefined : String(value))}
              options={KIND_FILTERS}
            />
          </>
        )}
      </div>

      <div className={styles.body}>
        {isChat ? (
          citationsLoading ? (
            <div className={styles.loading}>
              <Skeleton active paragraph={{ rows: 3 }} title={false} />
            </div>
          ) : isNewConversation ? (
            (pendingQuery.data?.items.length ?? 0) > 0 ? (
              <>
                <div className={styles.hint}>
                  收件箱还有 {pendingQuery.data?.items.length} 条没整理，可以从它们开始问
                </div>
                {pendingQuery.data?.items.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className={styles.item}
                    onClick={() => onStartFromDocument(doc.id)}
                  >
                    <div className={styles.itemTop}>
                      <KindBadge kind={doc.kind} />
                      <span className={styles.itemTitle}>{doc.title}</span>
                    </div>
                    <p className={styles.itemExcerpt}>{doc.excerpt}</p>
                    <div className={styles.itemMeta}>
                      <StatusBadge status="inbox" />
                      <span>尚未整理</span>
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <Empty
                className={styles.empty}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    收件箱是空的
                    <span className={styles.emptyHint}>抓取或新建内容后会出现在这里</span>
                  </span>
                }
              />
            )
          ) : citations.length === 0 ? (
            <Empty
              className={styles.empty}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span>
                  这次对话还没有引用文档
                  <span className={styles.emptyHint}>提问后，它读了哪些内容会出现在这里</span>
                </span>
              }
            />
          ) : (
            citations.map((entry) => (
              <button
                key={entry.documentId}
                type="button"
                className={cx(styles.item, entry.documentId === selectedId && styles.itemActive)}
                onClick={() => open(entry.documentId)}
              >
                <div className={styles.itemTop}>
                  <KindBadge kind={entry.kind} />
                  <span className={styles.itemTitle}>{entry.title}</span>
                </div>
                <p className={styles.itemExcerpt}>{entry.snippet}</p>
                <div className={styles.citeStep}>
                  {/* 这一行让「为什么是这篇」有据可查：哪个通道命中的，
                      以及引用在原文里的位置（PRD §5.2） */}
                  {channelLabel(entry.matchedBy)} · 原文第 {entry.start} 字符起
                </div>
              </button>
            ))
          )
        ) : listQuery.isLoading ? (
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
