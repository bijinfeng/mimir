import {
  AppstoreOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button, Collapse, Tooltip, Tree } from 'antd'
import { createStyles } from 'antd-style'
import type { ReactNode } from 'react'
import type { ConversationSummary } from '@mimir/shared'
import { api } from '@/lib/api'
import { useUnsaved } from '@/lib/unsaved'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 左导航。
 *
 * `docs/PRD.md` §5.2：**会话优先**。顶部是「新对话」+ 会话历史（按日期分组），
 * 然后才是文档入口。这不只是排序——它改变了中栏的语义（见 docs.tsx）。
 *
 * 目录与标签并存（§5.3）：树管归属（唯一位置），标签管横切（可多个）。
 * 两者走同一套过滤逻辑，只是筛选条件不同。
 */

export interface NavSelection {
  mode: 'docs' | 'chat'
  /** 文档模式的筛选：inbox / all / note / clip / folder:<path> / tag:<name> */
  scope: string
  /** 当前选中的文档 id，用于会话项的选中态 */
  id?: string
}

export interface NavSidebarProps {
  selection: NavSelection
  /** 命令面板的开关由外层持有 */
  onOpenPalette: () => void
  onOpenCapture: () => void
}

const useStyles = createStyles(({ css, token, prefixCls }) => ({
  nav: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.tintNav};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,

  brand: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 10px 16px;

    b {
      font-size: ${FONT_SIZE.section}}px;
      letter-spacing: 0.06em;
    }
  `,
  brandActions: css`
    display: flex;
    gap: 2px;
  `,

  cta: css`
    display: flex;
    gap: 6px;
    padding: 0 12px 10px;
  `,

  /* 可滚动的主体。左栏内容（会话+知识库+目录+标签）一定会溢出，
     所以滚动的是这一段而不是整栏——品牌与 CTA 始终可见 */
  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 8px;
  `,

  section: css`
    margin-top: 4px;

    .${prefixCls}-collapse-header {
      padding: 4px 12px 4px 16px !important;
      font-size: ${FONT_SIZE.meta}}px;
      font-weight: 600;
      color: ${token.colorTextTertiary};
      letter-spacing: 0.02em;
    }

    .${prefixCls}-collapse-content-box {
      padding: 0 !important;
    }

    .${prefixCls}-collapse-item {
      border: none !important;
    }
  `,

  item: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 16px);
    margin: 1px 8px;
    padding: 6px 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font-size: ${FONT_SIZE.item}}px;
    font-family: inherit;
    color: ${token.colorTextSecondary};
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease-out;

    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,
  /* 选中态：浅底 + 链接色文字 + 加粗。
   *
   * 三条与原型的一致性，以及一处**刻意的不一致**：
   *  - 底色用 antd 派生的 colorPrimaryBg，字重 500（原型是 550，但
   *    DESIGN §4.2 规定字重只用 400/500/600/700——550 在不含细字重的
   *    系统上会被吸附到最近一档，效果不可控）
   *  - **文字用 colorLink 而不是 colorPrimary**：这是唯一一处刻意偏离原型的地方。
   *    `docs/DESIGN.md` §3.2 实测过：#1677ff 作文字在浅蓝底上只有 3.61:1，
   *    而「选中项的文字」正是导航里最常见的组合。文档明确写了
   *    「不要把 colorPrimary 直接用在文字上」，并说明原型那个 #e8f1ff
   *    换成 antd 派生值是为了少维护一个变量。
   *  - **不加描边**：原型没有描边。我曾加过一道 #cfe0ff，但守门测试算出来
   *    它与选中底只有 1.19:1——肉眼看不见的线等于没画，只是徒增一层噪声。
   *    选中与未选中的区分交给「底色 + 字色 + 字重」三重线索，足够了。 */
  itemActive: css`
    background: ${token.colorPrimaryBg};
    color: ${token.colorLink};
    font-weight: 500;

    &:hover {
      background: ${token.colorPrimaryBg};
    }
  `,
  itemLabel: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  /* 计数做成小胶囊（原型如此）。纯数字贴在右边缘会和条目标题连成一片，
     读不出「这是数量」。底色走 antd 的 fill 系列而不是原型那个字面量——
     同色阶、成体系，换主题时会跟着走 */
  count: css`
    flex: none;
    min-width: 18px;
    padding: 0 6px;
    border-radius: 9px;
    background: ${token.colorFillSecondary};
    font-size: ${FONT_SIZE.badge}}px;
    line-height: 1.6;
    color: ${token.colorTextTertiary};
    text-align: center;
    font-variant-numeric: tabular-nums;
  `,

  convItem: css`
    padding-left: 10px;
    font-size: ${FONT_SIZE.excerpt}}px;
  `,

  hint: css`
    padding: 6px 16px 2px;
    font-size: ${FONT_SIZE.badge}}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,

  foot: css`
    flex: none;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,

  /* 目录树。antd Tree 自带缩进与展开箭头，这里只调字号与行高，
     让它和上面的导航项读起来是同一套东西 */
  treeWrap: css`
    padding: 0 8px 4px;

    .${prefixCls}-tree {
      background: transparent;
      font-size: ${FONT_SIZE.excerpt}}px;
    }

    .${prefixCls}-tree-node-content-wrapper {
      border-radius: 6px;
      padding: 2px 6px !important;
      color: ${token.colorTextSecondary};
    }

    /* 选中态与导航项保持一致：浅底 + 链接色（不加描边，理由见 itemActive） */
    .${prefixCls}-tree-node-selected .${prefixCls}-tree-node-content-wrapper {
      background: ${token.colorPrimaryBg};
      color: ${token.colorLink};
    }
  `,
  treeCount: css`
    margin-left: 6px;
    font-size: ${FONT_SIZE.badge}}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,
  treeEmpty: css`
    padding: 4px 16px 8px;
    font-size: ${FONT_SIZE.meta}}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
}))

/** 取当地时间的零点，用于按「天」而不是按「24 小时」分组 */
function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

/** 会话按日期分组。分组名稳定，不随打开时间跳动。 */
function groupByDay(isoDate: string): string {
  const date = new Date(isoDate)
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days <= 7) return '最近一周'
  return '更早'
}

export function NavSidebar({ selection, onOpenPalette, onOpenCapture }: NavSidebarProps) {
  const { styles, cx } = useStyles()
  const navigate = useNavigate()
  const { runGuarded } = useUnsaved()

  const countsQuery = useQuery({ queryKey: ['counts'], queryFn: api.documents.counts })
  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: api.tags.list })
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: api.conversations.list,
  })

  const goDocs = (scope: string) =>
    runGuarded(() => void navigate({ to: '/docs', search: { scope } }))
  const goChat = (id?: string) =>
    runGuarded(
      () =>
        void navigate({ to: '/chat', search: id ? { scope: 'inbox', id } : { scope: 'inbox' } }),
    )

  const counts = countsQuery.data
  const scopes = [
    { key: 'inbox', label: '收件箱', icon: <InboxOutlined />, count: counts?.inbox },
    { key: 'all', label: '全部文档', icon: <AppstoreOutlined />, count: counts?.all },
    { key: 'note', label: '我的笔记', icon: <FileTextOutlined />, count: counts?.note },
    { key: 'clip', label: '收集的资料', icon: <UploadOutlined />, count: counts?.clip },
  ]

  // 会话历史按日期分组。Map 的插入顺序即分组出现顺序，
  // 而 groupByDay 的输出本身是「今天 → 昨天 → 更早」，所以不需要额外排序
  const grouped = new Map<string, ConversationSummary[]>()
  for (const conversation of conversationsQuery.data?.items ?? []) {
    const key = groupByDay(conversation.updatedAt)
    grouped.set(key, [...(grouped.get(key) ?? []), conversation])
  }

  const activeScope = selection.mode === 'docs' ? selection.scope : ''

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <b>mimir</b>
        <span className={styles.brandActions}>
          <Tooltip title="搜索与命令（Ctrl K）">
            <Button type="text" size="small" icon={<SearchOutlined />} onClick={onOpenPalette} />
          </Tooltip>
        </span>
      </div>

      <div className={styles.cta}>
        <Button type="primary" size="small" icon={<PlusOutlined />} block onClick={() => goChat()}>
          新对话
        </Button>
        <Tooltip title="收集网页 / 公众号 / GitHub">
          <Button size="small" icon={<UploadOutlined />} onClick={onOpenCapture} />
        </Tooltip>
      </div>

      <div className={styles.body}>
        {/* 会话历史排在文档入口之前——这是「会话优先」最直接的体现 */}
        {grouped.size > 0 ? (
          <Collapse
            ghost
            className={styles.section}
            defaultActiveKey={[...grouped.keys()].slice(0, 2)}
            items={[...grouped.entries()].map(([label, items]) => ({
              key: label,
              label,
              children: items.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={cx(
                    styles.item,
                    styles.convItem,
                    selection.mode === 'chat' &&
                      selection.id === conversation.id &&
                      styles.itemActive,
                  )}
                  onClick={() => goChat(conversation.id)}
                >
                  <span className={styles.itemLabel}>{conversation.title || '新对话'}</span>
                </button>
              )),
            }))}
          />
        ) : (
          <div className={styles.hint}>还没有会话。问点什么，它会出现在这里。</div>
        )}

        <Collapse
          ghost
          className={styles.section}
          defaultActiveKey={['kb', 'folders', 'tags']}
          items={[
            {
              key: 'kb',
              label: '知识库',
              children: (
                <>
                  {scopes.map((scope) => (
                    <button
                      key={scope.key}
                      type="button"
                      className={cx(styles.item, activeScope === scope.key && styles.itemActive)}
                      onClick={() => goDocs(scope.key)}
                    >
                      <span style={{ opacity: 0.7, fontSize: 13 }}>{scope.icon}</span>
                      <span className={styles.itemLabel}>{scope.label}</span>
                      <span className={styles.count}>{scope.count ?? ''}</span>
                    </button>
                  ))}
                </>
              ),
            },
            {
              key: 'folders',
              label: '目录',
              children: (
                <div className={styles.treeWrap}>
                  {(foldersQuery.data?.items.length ?? 0) === 0 ? (
                    <div className={styles.treeEmpty}>还没归入任何目录。整理收件箱时可以指定。</div>
                  ) : (
                    <Tree
                      blockNode
                      showIcon
                      defaultExpandAll
                      selectedKeys={
                        activeScope.startsWith('folder:')
                          ? [activeScope.slice('folder:'.length)]
                          : []
                      }
                      icon={<FolderOpenOutlined />}
                      treeData={toTreeData(foldersQuery.data?.items ?? [], styles.treeCount)}
                      onSelect={(_keys, info) => goDocs(`folder:${String(info.node.key)}`)}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'tags',
              label: '标签',
              children: (
                <>
                  {(tagsQuery.data?.items.length ?? 0) === 0 ? (
                    <div className={styles.treeEmpty}>还没有标签。</div>
                  ) : (
                    tagsQuery.data?.items.map((tag) => (
                      <button
                        key={tag.name}
                        type="button"
                        className={cx(
                          styles.item,
                          activeScope === `tag:${tag.name}` && styles.itemActive,
                        )}
                        onClick={() => goDocs(`tag:${tag.name}`)}
                      >
                        <span className={styles.itemLabel}>#{tag.name}</span>
                        <span className={styles.count}>{tag.count}</span>
                      </button>
                    ))
                  )}
                </>
              ),
            },
          ]}
        />
      </div>

      <div className={styles.foot}>
        <button
          type="button"
          className={cx(styles.item, activeScope === 'settings' && styles.itemActive)}
          style={{ marginTop: 6, marginBottom: 6 }}
          onClick={() =>
            runGuarded(() => void navigate({ to: '/settings', search: { scope: 'inbox' } }))
          }
        >
          <SettingOutlined style={{ opacity: 0.7 }} />
          <span className={styles.itemLabel}>设置</span>
        </button>
      </div>
    </nav>
  )
}

interface TreeDatum {
  key: string
  title: ReactNode
  children?: TreeDatum[]
}

/** 服务端的目录树 → antd Tree 的形状。key 用完整路径，因为它本身就是筛选条件 */
function toTreeData(
  nodes: { path: string; name: string; count: number; children: unknown[] }[],
  countClass: string,
): TreeDatum[] {
  return nodes.map((node) => ({
    key: node.path,
    title: (
      <span>
        {node.name}
        <span className={countClass}>{node.count}</span>
      </span>
    ),
    ...(node.children.length > 0
      ? { children: toTreeData(node.children as typeof nodes, countClass) }
      : {}),
  }))
}
