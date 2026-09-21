import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { App, Empty, Layout, List, Spin, Tag, Typography } from 'antd'
import { api } from '@/lib/api'
import { KindBadge } from '@/components/DocumentBadges'
import { NoteEditor } from '@/components/NoteEditor'
import { useMemo } from 'react'

/**
 * 文档视图。三栏布局的骨架：
 *   左  = 导航（会话优先，见 PRD 5.2）—— 目前占位
 *   中  = 列表
 *   右  = 内容
 *
 * 骨架先立住，具体交互按原型逐步填。
 */

type Scope = 'inbox' | 'all' | 'note' | 'clip'

export const Route = createFileRoute('/docs')({
  validateSearch: (search: Record<string, unknown>): { scope: Scope; id?: string } => ({
    scope:
      search.scope === 'all' || search.scope === 'note' || search.scope === 'clip'
        ? search.scope
        : 'inbox',
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  component: DocsPage,
})

const SCOPE_LABEL: Record<Scope, string> = {
  inbox: '收件箱',
  all: '全部文档',
  note: '我的笔记',
  clip: '收集的资料',
}

function DocsPage() {
  const { scope, id } = Route.useSearch()
  const navigate = useNavigate()

  const listQuery = useQuery({
    queryKey: ['documents', scope],
    queryFn: () =>
      api.documents.list({
        status: scope === 'inbox' ? 'inbox' : undefined,
        kind: scope === 'note' ? 'note' : undefined,
        limit: 50,
      }),
    // 保留上一次数据，切换视图时不闪空白
    placeholderData: keepPreviousData,
  })

  const selectedId = id ?? listQuery.data?.items[0]?.id

  const detailQuery = useQuery({
    queryKey: ['document', selectedId],
    queryFn: () => api.documents.get(selectedId!),
    enabled: Boolean(selectedId),
  })

  const { message } = App.useApp()

  const items = useMemo(() => {
    const all = listQuery.data?.items ?? []
    // 'clip' 是「非笔记」，服务端没有这个筛选维度，在前端补
    return scope === 'clip' ? all.filter((item) => item.kind !== 'note') : all
  }, [listQuery.data, scope])

  return (
    <Layout style={{ height: '100%' }}>
      {/* 列底色比容器底稍冷，用来分开三栏而不靠边框——
          层级模型见 docs/DESIGN.md §3.6。变量定义在 global.css 的 :root。 */}
      <Layout.Sider
        width={200}
        theme="light"
        style={{
          borderRight: '1px solid var(--ant-color-border-secondary)',
          background: 'var(--mimir-tint-nav)',
        }}
      >
        <div style={{ padding: 16 }}>
          <Typography.Text strong style={{ letterSpacing: '0.06em' }}>
            mimir
          </Typography.Text>
        </div>
        <List
          size="small"
          dataSource={(Object.keys(SCOPE_LABEL) as Scope[]).map((key) => ({
            key,
            label: SCOPE_LABEL[key],
          }))}
          renderItem={(item) => (
            <List.Item
              style={{ padding: 0, border: 'none' }}
              onClick={() => void navigate({ to: '/docs', search: { scope: item.key } })}
            >
              <div
                style={{
                  padding: '7px 16px',
                  width: '100%',
                  cursor: 'pointer',
                  fontWeight: scope === item.key ? 600 : 400,
                  color: scope === item.key ? 'var(--ant-color-link)' : undefined,
                  background: scope === item.key ? 'var(--ant-color-primary-bg)' : undefined,
                }}
              >
                {item.label}
              </div>
            </List.Item>
          )}
        />
      </Layout.Sider>

      <Layout.Sider
        width={300}
        theme="light"
        style={{
          borderRight: '1px solid var(--ant-color-border-secondary)',
          background: 'var(--mimir-tint-list)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--ant-color-border-secondary)',
          }}
        >
          <Typography.Text strong>{SCOPE_LABEL[scope]}</Typography.Text>
          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            {items.length} 条
          </Typography.Text>
        </div>
        <div style={{ height: 'calc(100% - 49px)', overflowY: 'auto' }}>
          {listQuery.isLoading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : items.length === 0 ? (
            <Empty
              description="这里还是空的"
              style={{ marginTop: 60 }}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                onClick={() => void navigate({ to: '/docs', search: { scope, id: item.id } })}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--ant-color-border-secondary)',
                  background: item.id === selectedId ? 'var(--ant-color-primary-bg)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <KindBadge kind={item.kind} />
                  <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                    {item.title}
                  </Typography.Text>
                </div>
                <Typography.Paragraph
                  type="secondary"
                  ellipsis={{ rows: 2 }}
                  style={{ margin: '2px 0 0', fontSize: 12.5 }}
                >
                  {item.excerpt}
                </Typography.Paragraph>
                {item.tags.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {item.tags.map((tag) => (
                      <Tag key={tag} variant="filled" style={{ fontSize: 11 }}>
                        {tag}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Layout.Sider>

      <Layout.Content style={{ overflow: 'auto', background: 'var(--ant-color-bg-container)' }}>
        {!selectedId ? (
          <Empty description="选一条开始看" style={{ marginTop: 120 }} />
        ) : detailQuery.isLoading ? (
          <div style={{ padding: 80, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : detailQuery.data ? (
          <NoteEditor
            key={detailQuery.data.id}
            document={detailQuery.data}
            onSaved={() => message.success('已保存', 1)}
          />
        ) : null}
      </Layout.Content>
    </Layout>
  )
}
