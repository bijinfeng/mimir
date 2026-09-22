import { ArrowLeftOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button, Menu, Tree, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { BrandMark } from '@/components/BrandMark'
import { useStyles } from '@/components/NavSidebar.style'
import {
  buildActions,
  buildConversations,
  buildFooter,
  buildScopes,
  currentKey,
} from '@/components/nav/menu-items'
import { api } from '@/lib/api'
import { useUnsaved } from '@/lib/unsaved'

/**
 * 左导航。
 *
 * ## 结构（形态参照一份桌面应用侧栏）
 *
 * ```
 * ┌────────────────────────────┐
 * │ [标记] mimir       ← →     │  顶栏：品牌 + 历史
 * ├────────────────────────────┤
 * │ ＋ 新建对话                 │  动作列表（图标 + 文字 + 右侧快捷键）
 * │ ⌕ 搜索              Ctrl K │
 * │ ⤒ 收集内容                 │
 * ├────────────────────────────┤
 * │ 今天                        │  会话，按日期分组（素文字标签，不可折叠）
 * │   💬 React 性能优化  2 小时前│
 * │ 昨天                        │
 * │   💬 昨天问的      1 天前   │
 * ├────────────────────────────┤
 * │ 知识库                      │
 * │   ▤ 收件箱              4  │
 * │   ▦ 全部文档            5  │
 * ├────────────────────────────┤
 * │ 目录                        │
 * │   📁 技术                   │
 * ├────────────────────────────┤
 * │ ⚙ 设置                      │
 * └────────────────────────────┘
 * ```
 *
 * ## 会话优先（`docs/PRD.md` §5.2）
 *
 * 「新建对话」在动作列表第一项、会话历史紧随其后，然后才是知识库入口。
 * 这不是排序偏好——它决定了中栏的语义（对话模式下中栏是「本次引用」）。
 *
 * ## 两点与前版的差异
 *
 * 1. **会话分组不可折叠。** 之前用 Collapse，「更早」那组默认折叠，
 *    于是打开一个旧会话后**侧边栏里看不到自己正在哪次对话**——
 *    而右栏明明显示着内容。用 Menu 的 group 就没有这个问题。
 * 2. **右侧元信息**（计数 / 相对时间）。它是扫读的锚点：
 *    让每行左边的内容对齐成一条竖线，视线不用来回跳。
 */

export interface NavSelection {
  /** 当前所在页。三值——设置页曾经被并进 docs，导致它永远不高亮 */
  page: 'docs' | 'chat' | 'settings'
  /** 文档页的筛选：inbox / all / note / clip / folder:<path> / tag:<name> */
  scope: string
  /** 当前打开的文档 id（docs 页）或会话 id（chat 页） */
  id?: string
}

export interface NavSidebarProps {
  selection: NavSelection
  onOpenPalette: () => void
  onOpenCapture: () => void
}

/** 会话历史最多显示多少条。再多侧边栏就要长时间滚动，而它们极少被翻到 */
const CONVERSATION_LIMIT = 12

export function NavSidebar({ selection, onOpenPalette, onOpenCapture }: NavSidebarProps) {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const router = useRouter()
  const { runGuarded } = useUnsaved()

  const countsQuery = useQuery({ queryKey: ['counts'], queryFn: api.documents.counts })
  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })
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

  /** 点击分发。key 的约定见 components/nav/menu-items.tsx */
  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('scope:')) return goDocs(key.slice('scope:'.length))
    if (key.startsWith('conv:')) return goChat(key.slice('conv:'.length))
    if (key.startsWith('tag:')) return goDocs(key)
    if (key === 'action:new-chat') return goChat()
    if (key === 'action:search') return onOpenPalette()
    if (key === 'action:capture') return onOpenCapture()
    // 设置页的 search 与 docs 同形状（父路由声明了必填的 scope），
    // 所以这里必须带上它，不能传空对象
    if (key === 'action:settings') {
      return runGuarded(() => void navigate({ to: '/settings', search: { scope: 'inbox' } }))
    }
  }

  const folders = foldersQuery.data?.items ?? []
  const selectedKey = currentKey(selection)

  return (
    <nav className={styles.nav}>
      <div className={styles.topBar}>
        <span className={styles.brandLockup}>
          <BrandMark size={20} title={null} />
          <b>mimir</b>
        </span>

        {/*
          前进/后退。**后退按钮只在真的能退时可用**——`router.history.canGoBack`
          是路由器自己的判断，不是猜的。
          没有「前进」：@tanstack/history 不暴露 canGoForward，
          画一个永远禁用的按钮比不画更让人困惑（DESIGN §7.4）。
        */}
        <Tooltip title="返回上一处">
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            disabled={!router.history.canGoBack}
            onClick={() => router.history.back()}
          />
        </Tooltip>
      </div>

      <div className={styles.body}>
        <Menu
          mode="inline"
          className={styles.menu}
          selectedKeys={[selectedKey]}
          onClick={onMenuClick}
          items={[
            ...buildActions(),
            { type: 'divider' },
            ...((conversationsQuery.data?.items.length ?? 0) === 0
              ? [
                  {
                    key: 'conv-group:all',
                    type: 'group' as const,
                    label: '对话',
                    children: [{ key: 'conv-empty', label: '还没有对话', disabled: true }],
                  },
                ]
              : buildConversations(conversationsQuery.data?.items ?? [], CONVERSATION_LIMIT)),
            { type: 'divider' },
            {
              type: 'group',
              label: '知识库',
              children: buildScopes(countsQuery.data),
            },
          ]}
        />

        {/* 目录不在 Menu 里：Menu 是扁平的，而目录是层级结构。
            两处的行高与选中态必须看起来是同一套东西（见 .style.ts） */}
        <div className={styles.treeGroup}>
          <div
            className={styles.emptyHint}
            style={{ paddingTop: 14, fontWeight: 600, color: 'inherit' }}
          >
            目录
          </div>
          {folders.length === 0 ? (
            <div className={styles.emptyHint}>还没归入任何目录</div>
          ) : (
            <Tree
              blockNode
              showIcon
              defaultExpandAll
              className={styles.treeWrap}
              selectedKeys={
                selection.page === 'docs' && selection.scope.startsWith('folder:')
                  ? [selection.scope.slice('folder:'.length)]
                  : []
              }
              icon={<FolderOpenOutlined />}
              treeData={toTreeData(folders, styles.treeCount)}
              onSelect={(_keys, info) => goDocs(`folder:${String(info.node.key)}`)}
            />
          )}
        </div>
      </div>

      <div className={styles.foot}>
        <Menu
          mode="inline"
          className={styles.menu}
          selectedKeys={[selectedKey]}
          onClick={onMenuClick}
          items={buildFooter()}
        />
      </div>
    </nav>
  )
}

interface TreeDatum {
  key: string
  title: React.ReactNode
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
