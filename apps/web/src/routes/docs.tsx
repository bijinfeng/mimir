import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { App, Empty, Layout, List, Spin, Tag, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { useMemo } from 'react'
import { KindBadge } from '@/components/DocumentBadges'
import { NoteEditor } from '@/components/NoteEditor'
import { api } from '@/lib/api'

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

/**
 * 选择器里的 `${prefixCls}` 是 antd-style 给的当前前缀（默认 `ant`），
 * 不写死 —— 换前缀时这些规则跟着换（见 antd-style 覆写 antd 组件的最佳实践）。
 */
const useStyles = createStyles(({ css, token, prefixCls }) => ({
  /* 列底色比容器底稍冷，用来分开三栏而不靠边框——
     层级模型见 docs/DESIGN.md §3.6。 */
  navColumn: css`
    background: ${token.tintNav};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,
  listColumn: css`
    background: ${token.tintList};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,
  contentColumn: css`
    background: ${token.colorBgContainer};
    overflow: auto;
  `,

  brand: css`
    padding: 16px;

    .${prefixCls}-typography {
      letter-spacing: 0.06em;
    }
  `,

  /* 侧栏导航项。选中态用浅底 + 链接色：`colorPrimary` 作文字在浅蓝底上
     只有 3.61:1，文字角色必须走 colorLink（见 docs/DESIGN.md §3.2）。 */
  navItem: css`
    padding: 7px 16px;
    width: 100%;
    cursor: pointer;
  `,
  navItemActive: css`
    font-weight: 600;
    color: ${token.colorLink};
    background: ${token.colorPrimaryBg};
  `,

  listHeader: css`
    padding: 14px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  listCount: css`
    margin-left: 8px;
    font-size: 12px;
  `,
  listScroll: css`
    height: calc(100% - 49px);
    overflow-y: auto;
  `,

  listItem: css`
    padding: 10px 16px;
    cursor: pointer;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  listItemActive: css`
    background: ${token.colorPrimaryBg};
  `,
  listItemTitle: css`
    display: flex;
    align-items: center;
    gap: 7px;

    .${prefixCls}-typography {
      flex: 1;
      min-width: 0;
    }
  `,
  listItemExcerpt: css`
    margin: 2px 0 0;
    font-size: 12.5px;
  `,
  listItemTags: css`
    margin-top: 4px;

    .${prefixCls}-tag {
      font-size: 11px;
    }
  `,

  root: css`
    height: 100%;
  `,

  navList: css`
    .${prefixCls}-list-item {
      padding: 0;
      border: none;
    }
  `,

  emptySmall: css`
    margin-top: 60px;
  `,
  emptyLarge: css`
    margin-top: 120px;
  `,
  centered: css`
    padding: 40px;
    text-align: center;
  `,
  centeredLarge: css`
    padding: 80px;
    text-align: center;
  `,
}))

function DocsPage() {
  const { styles, cx } = useStyles()
  const { message } = App.useApp()
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

  const items = useMemo(() => {
    const all = listQuery.data?.items ?? []
    // 'clip' 是「非笔记」，服务端没有这个筛选维度，在前端补
    return scope === 'clip' ? all.filter((item) => item.kind !== 'note') : all
  }, [listQuery.data, scope])

  return (
    <Layout className={styles.root}>
      <Layout.Sider width={200} theme="light" className={styles.navColumn}>
        <div className={styles.brand}>
          <Typography.Text strong>mimir</Typography.Text>
        </div>
        <List
          size="small"
          dataSource={(Object.keys(SCOPE_LABEL) as Scope[]).map((key) => ({
            key,
            label: SCOPE_LABEL[key],
          }))}
          className={styles.navList}
          renderItem={(item) => (
            <List.Item>
              <div
                className={cx(styles.navItem, scope === item.key && styles.navItemActive)}
                onClick={() => void navigate({ to: '/docs', search: { scope: item.key } })}
              >
                {item.label}
              </div>
            </List.Item>
          )}
        />
      </Layout.Sider>

      <Layout.Sider width={300} theme="light" className={styles.listColumn}>
        <div className={styles.listHeader}>
          <Typography.Text strong>{SCOPE_LABEL[scope]}</Typography.Text>
          <Typography.Text type="secondary" className={styles.listCount}>
            {items.length} 条
          </Typography.Text>
        </div>
        <div className={styles.listScroll}>
          {listQuery.isLoading ? (
            <div className={styles.centered}>
              <Spin />
            </div>
          ) : items.length === 0 ? (
            <Empty
              description="这里还是空的"
              className={styles.emptySmall}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={cx(styles.listItem, item.id === selectedId && styles.listItemActive)}
                onClick={() => void navigate({ to: '/docs', search: { scope, id: item.id } })}
              >
                <div className={styles.listItemTitle}>
                  <KindBadge kind={item.kind} />
                  <Typography.Text strong ellipsis>
                    {item.title}
                  </Typography.Text>
                </div>
                <Typography.Paragraph
                  type="secondary"
                  ellipsis={{ rows: 2 }}
                  className={styles.listItemExcerpt}
                >
                  {item.excerpt}
                </Typography.Paragraph>
                {item.tags.length > 0 && (
                  <div className={styles.listItemTags}>
                    {item.tags.map((tag) => (
                      <Tag key={tag} variant="filled">
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

      <Layout.Content className={styles.contentColumn}>
        {!selectedId ? (
          <Empty description="选一条开始看" className={styles.emptyLarge} />
        ) : detailQuery.isLoading ? (
          <div className={styles.centeredLarge}>
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
