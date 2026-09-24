import { FolderOpenOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Avatar, Button, Menu, Tree, Tooltip } from 'antd'
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
 * │ [标记] mimir         ⇤     │  顶栏：品牌 + 折叠开关
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
 * 折叠后（48px，`DESIGN.md` §5.4）只剩图标列：目录树与分组标签不渲染，
 * 顶栏的标记与开关改成竖排。状态的持有者是 `_app.tsx`——折叠要改的是
 * 外层的 `grid-template-columns`，网格在哪一层，状态就在哪一层。
 * 详见 `docs/DECISIONS.md` D-026。
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
  /** 折叠状态由 `_app.tsx` 持有——它要据此改三栏宽度，见那里的注释 */
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** 会话历史最多显示多少条。再多侧边栏就要长时间滚动，而它们极少被翻到 */
const CONVERSATION_LIMIT = 12

export function NavSidebar({
  selection,
  onOpenPalette,
  onOpenCapture,
  collapsed,
  onToggleCollapsed,
}: NavSidebarProps) {
  const { styles } = useStyles()
  const navigate = useNavigate()
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

  /**
   * 去设置 › 账号。
   *
   * `scope` 必须显式带上：搜索参数沿路由树合并，而父路由把它声明成必填。
   * `section` 也必须带——不带会落在默认的「模型」分区，而用户点的是头像。
   */
  const goSettings = () =>
    runGuarded(
      () =>
        void navigate({
          to: '/settings',
          search: { scope: 'inbox', section: 'account' as const },
        }),
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
  const conversations = conversationsQuery.data?.items ?? []

  /**
   * 会话那一段。
   *
   * **空态的「还没有对话」在折叠时整块不渲染。** antd 折叠后会给没有图标的
   * 菜单项一个兜底：取标签的**第一个字**当图标（它假定无图标项是纯文字入口）。
   * 实测那个禁用占位项因此渲染成一个孤立的「还」字，看起来像乱码。
   *
   * 补一个图标是错的做法——那会让人以为「还没有对话」是个能点的入口。
   * 折叠态里它没有信息量（会话列表本身也收成了图标），直接不渲染。
   */
  const conversationItems =
    conversations.length === 0
      ? collapsed
        ? []
        : [
            {
              key: 'conv-group:all',
              type: 'group' as const,
              label: '对话',
              children: [{ key: 'conv-empty', label: '还没有对话', disabled: true }],
            },
          ]
      : buildConversations(conversations, CONVERSATION_LIMIT)

  return (
    <nav className={styles.nav}>
      <div className={`${styles.topBar} ${collapsed ? styles.topBarCollapsed : ''}`}>
        <span className={`${styles.brandLockup} ${collapsed ? styles.brandLockupCollapsed : ''}`}>
          <BrandMark size={20} title={null} />
          {/* 折叠后只剩标记：品牌名是这一列里唯一「不折叠也能猜到」的东西，
              而它是 48px 宽放不下的那部分 */}
          {collapsed ? null : <b>mimir</b>}
        </span>

        {/*
          侧边栏折叠开关。
          
          **它替代了原先的「返回上一处」按钮。** 那个按钮的问题不是没用，
          而是位置错了：它是**全局**的历史导航，却挂在侧边栏顶栏上——
          用户找它时会去看内容区，而想收侧边栏时会来看这个角落。
          折叠开关是这一栏唯一的自解释动作，所以这里是它的位置。
          
          历史返回没有消失：浏览器的后退键仍然可用，`DocumentPanel` 也从
          「从对话来」的标记给出了明确的返回入口。
        */}
        <Tooltip title={collapsed ? '展开侧边栏' : '折叠侧边栏'} placement="right">
          <Button
            type="text"
            size="small"
            aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            aria-expanded={!collapsed}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={onToggleCollapsed}
          />
        </Tooltip>
      </div>

      <div className={styles.body}>
        <Menu
          mode="inline"
          className={`${styles.menu} ${collapsed ? styles.menuCollapsed : ''}`}
          inlineCollapsed={collapsed}
          selectedKeys={[selectedKey]}
          onClick={onMenuClick}
          items={[
            ...buildActions(),
            { type: 'divider' },
            ...conversationItems,
            { type: 'divider' },
            {
              type: 'group',
              label: '知识库',
              children: buildScopes(countsQuery.data),
            },
          ]}
        />

        {/*
          目录树在折叠态下**整块隐藏**。
          
          一个层级树没有「只剩图标」的形态：留着它会变成一列缩进错乱、
          认不出是什么的文件夹图标。而它本来就是低频入口（`PRD.md` §5.2
          的左栏清单里它排在最后），折叠时让位是合理的代价。
          
          同理，会话历史在折叠态下由 `inlineCollapsed` 收成图标 + tooltip——
          相对时间那一栏会消失，那是 rail 的固有代价。
        */}
        {collapsed ? null : (
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
        )}
      </div>

      <div className={styles.foot}>
        <Menu
          mode="inline"
          className={`${styles.menu} ${collapsed ? styles.menuCollapsed : ''}`}
          inlineCollapsed={collapsed}
          selectedKeys={[selectedKey]}
          onClick={onMenuClick}
          items={buildFooter()}
        />

        <AccountRow collapsed={collapsed} onOpen={() => goSettings()} />
      </div>
    </nav>
  )
}

/**
 * 底部账号行（`docs/DESIGN.md` §8.13）。
 *
 * **放在设置下方、最底部**，不是顶部：它是「关于我自己」的信息，
 * 不是导航目标——而点它进的是设置 › 账号，与上面那行同一个去处。
 * 顶部已经有品牌标记，再放一个头像会把「这是什么产品」与
 * 「这是谁的账号」两个语义挤在一起。
 *
 * ## 为什么不用 Menu 的 item
 *
 * 菜单项的形状是「图标 + 文字 + 右侧元信息」，而这里要放一个圆形头像——
 * 塞进 12px 图标的位置会把它压变形。它是一条**有自己形态**的行。
 */
function AccountRow({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  const { styles } = useStyles()
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })
  const user = sessionQuery.data?.user

  /**
   * 会话还没取回时**不渲染**，而不是渲染一个占位的空行。
   *
   * 占位行会在数据到达时让侧栏底部跳一下，而那个跳动恰好发生在用户
   * 刚开始看界面的时候。少一行比跳一下好。
   */
  if (!user) return null

  return (
    <Tooltip title={collapsed ? user.name : undefined} placement="right">
      {/*
        用 antd 的 `Button type="text" block` 而不是裸 `<button>`：
        hover / active 的底色由 token 给（深浅两套主题自动跟着走），
        而这正是原生按钮拿不到的那部分。形状仍由 `styles.account` 定——
        它是一条通栏的、有自己形态的行，不是标准按钮。
      */}
      <Button
        type="text"
        block
        className={`${styles.account} ${collapsed ? styles.accountCollapsed : ''}`}
        onClick={onOpen}
        aria-label={`账号：${user.name}`}
      >
        <Avatar
          size={collapsed ? 24 : 26}
          src={user.image ?? undefined}
          className={styles.accountAvatar}
        >
          {user.name.slice(0, 1).toUpperCase()}
        </Avatar>
        {collapsed ? null : <span className={styles.accountName}>{user.name}</span>}
      </Button>
    </Tooltip>
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
