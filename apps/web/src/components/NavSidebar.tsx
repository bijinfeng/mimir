import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Avatar, Button, Dropdown, Menu, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Settings, User } from 'lucide-react'
import { useRef } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { useStyles } from '@/components/NavSidebar.style'
import { FolderSection } from '@/components/nav/FolderSection'
import { buildActions, buildConversations, currentKey } from '@/components/nav/menu-items'
import { api } from '@/lib/api'
import { useScrolled } from '@/lib/use-scrolled'
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
 * ├────────────────────────────┤
 * │ 对话                        │  会话（素文字分组标签，不可折叠）
 * │   💬 React 性能优化  2 小时前│
 * │ 昨天                        │
 * │   💬 昨天问的      1 天前   │
 * ├────────────────────────────┤
 * │ 知识库                   ＋ │  平铺的知识库列表（D-079）：行上 ⋯ 改名/删除
 * │   📁 技术笔记             2 │  子目录不在这里——它们是库内部结构，
 * │   📁 生活                  1 │  在知识库页里以文件夹卡片呈现
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
  /** 文档页的筛选：all / folder:<path> / tag:<name> */
  scope: string
  /** 当前打开的文档 id（docs 页）或会话 id（chat 页） */
  id?: string
}

export interface NavSidebarProps {
  selection: NavSelection
  onOpenPalette: () => void
  /** 折叠状态由 `_app.tsx` 持有——它要据此改三栏宽度，见那里的注释 */
  collapsed: boolean
  /**
   * 是否显示折叠开关。
   *
   * 窄屏（≤880px）下为 `false`：那个宽度下折叠是**视口强制的**，点了也不会
   * 展开（左列宽度由 `@media` 压着）。留一个按不动的开关比没有开关更糟——
   * 它看起来是坏的。
   */
  showToggle?: boolean
  onToggleCollapsed: () => void
}

/** 会话历史最多显示多少条。再多侧边栏就要长时间滚动，而它们极少被翻到 */
const CONVERSATION_LIMIT = 12

export function NavSidebar({
  selection,
  onOpenPalette,
  collapsed,
  showToggle = true,
  onToggleCollapsed,
}: NavSidebarProps) {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const { runGuarded } = useUnsaved()

  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: api.conversations.list,
  })

  const goDocs = (scope: string) =>
    runGuarded(() => void navigate({ to: '/docs', search: { scope } }))
  const goChat = (id?: string) =>
    runGuarded(
      () => void navigate({ to: '/chat', search: id ? { scope: 'all', id } : { scope: 'all' } }),
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
          search: { scope: 'all', section: 'account' as const },
        }),
    )

  /** 点击分发。key 的约定见 components/nav/menu-items.tsx */
  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('conv:')) return goChat(key.slice('conv:'.length))
    if (key === 'action:new-chat') return goChat()
    if (key === 'action:search') return onOpenPalette()
    // 设置页的 search 与 docs 同形状（父路由声明了必填的 scope），
    // 所以这里必须带上它，不能传空对象
    if (key === 'action:settings') {
      return runGuarded(() => void navigate({ to: '/settings', search: { scope: 'all' } }))
    }
  }

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

  /* 滚动后才显形底部账号行的界线（D-070）：会话列表长了开始被切断时，
     它与固定页脚之间需要一道边界；静态下界面无线 */
  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyScrolled = useScrolled(bodyRef)

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

          **窄屏下整块不渲染**（`showToggle === false`）：那时折叠由视口决定，
          开关按下去不会有任何变化。顶栏因此只剩品牌标记一项。
        */}
        {showToggle ? (
          <Tooltip title={collapsed ? '展开侧边栏' : '折叠侧边栏'} placement="right">
            <Button
              type="text"
              size="small"
              aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
              aria-expanded={!collapsed}
              icon={collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              onClick={onToggleCollapsed}
            />
          </Tooltip>
        ) : null}
      </div>

      <div className={`${styles.body} ${collapsed ? styles.bodyCollapsed : ''}`} ref={bodyRef}>
        <Menu
          mode="inline"
          className={`${styles.menu} ${collapsed ? styles.menuCollapsed : ''}`}
          inlineCollapsed={collapsed}
          selectedKeys={selectedKey ? [selectedKey] : []}
          onClick={onMenuClick}
          /* 不放 divider：分组由「对话」「知识库」标签与留白承担（D-070）。
             之前尾部那条只在展开态渲染，是怕折叠态两条叠在一起像渲染坏了 */
          items={[...buildActions(), ...conversationItems]}
        />

        {/*
          知识库分区（D-068 起，D-079 改平铺）：增删改都在 `FolderSection` 里。
          侧边栏只列**顶层**（知识库自己）；子目录是库内部结构，在知识库页里
          呈现（文件夹卡片 + 面包屑）。

          折叠态下换成**一个图标按钮**：平铺列表没有「只剩图标」的形态
          （一列无名的文件夹图标认不出谁是谁），但折叠后如果什么都不渲染，
          48px 的栏里就没有任何进入库的入口——那等于断了整条导航。
          图标（九宫格）不指某个知识库，只回库的默认视图。

          会话历史在折叠态下由 `inlineCollapsed` 收成图标 + tooltip——
          相对时间那一栏会消失，那是 rail 的固有代价。
        */}
        {collapsed ? (
          <div className={styles.collapsedLibrary}>
            <Tooltip title="知识库" placement="right">
              <Button
                type="text"
                aria-label="知识库"
                icon={<LayoutGrid size={16} />}
                onClick={() => goDocs('all')}
              />
            </Tooltip>
          </div>
        ) : (
          <div className={styles.treeGroup}>
            <FolderSection
              items={foldersQuery.data?.items}
              isLoading={foldersQuery.isLoading}
              activePath={
                selection.page === 'docs' && selection.scope.startsWith('folder:')
                  ? selection.scope.slice('folder:'.length)
                  : null
              }
              onSelect={(path) =>
                /* 空路径 = 删除当前目录后回库的默认视图，不是 folder: 前缀 */
                goDocs(path ? `folder:${path}` : 'all')
              }
            />
          </div>
        )}
      </div>

      {/*
        底部**只有一行**：账号资料在左、设置图标贴最右。

        第一版是两行——上面一行「⚙ 设置」（一个只有一项的 Menu），
        下面一行账号。那一项菜单完全是多余的：设置是个**图标就能表达**的
        目的地，不值得占一整行的高度，而两行叠在一起还把底部撑得很高。
      */}
      <div className={styles.foot} data-scrolled={bodyScrolled || undefined}>
        <AccountRow
          collapsed={collapsed}
          settingsActive={selection.page === 'settings'}
          onOpenAccount={() => goSettings()}
          onOpenSettings={() => goSettings()}
        />
      </div>
    </nav>
  )
}

/**
 * 底部账号行（`docs/DESIGN.md` §8.13）。
 *
 * ## 一行，两个目标（形态参照一份桌面应用的左下角）
 *
 * ```
 * ┌──────────────────────────────────┐
 * │ (头像) Kebai                  ⚙  │
 * └──────────────────────────────────┘
 * ```
 *
 * - **头像 + 名字**：点开菜单（账号资料 / 外观 / 登出）
 * - **⚙ 图标贴最右**：直接进设置
 *
 * ## 为什么不是「两行」或「点哪都进设置」
 *
 * 第一版是两行：上面一个只有一项的 `Menu`（「⚙ 设置」），下面账号行，
 * 而账号行点下去**也**跳设置页。两个问题：
 *
 *  1. 两行都指向设置页，用户看不出差别，区别只是落在哪个分区
 *  2. 「设置」占了一整行的高度，而它是个**图标就能表达**的目的地
 *
 * 改成一行之后：设置回到一个图标（贴最右，与参考形态一致），
 * 账号行则是一组动作的入口——这消掉了那个歧义。
 *
 * ## 为什么 ⚙ 不做成下拉触发器的一部分
 *
 * 它必须能**单独点击**。外面套着 `Dropdown` 的话，点它会被当作打开菜单，
 * 而用户想要的是「去设置页」——那是两个不同的意图，不能共用一个热区。
 * 所以它是 `Dropdown` 的**兄弟节点**，靠 `stopPropagation` 不必要——
 * 事件冒泡到 Dropdown 只发生在包裹层内，而它不在里面。
 */
function AccountRow({
  collapsed,
  settingsActive,
  onOpenAccount,
  onOpenSettings,
}: {
  collapsed: boolean
  settingsActive: boolean
  onOpenAccount: () => void
  onOpenSettings: () => void
}) {
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

  const items: MenuProps['items'] = [
    { key: 'account', icon: <User size={16} />, label: '账号资料' },
    /*
     * 外观（主题）不在这里：它是设置页「外观」分区的职责（带完整的
     * 说明与取舍记录）。同一个设置出现两个家，必然有一天只改一处。
     * 见 D-047 待办收尾。
     */
    { type: 'divider' },
    { key: 'signout', icon: <LogOut size={16} />, label: '登出', danger: true },
  ]

  const accountTrigger = (
    <Button
      type="text"
      className={`${styles.account} ${collapsed ? styles.accountCollapsed : ''}`}
      /* 折叠态只剩一个字母头像：名字与「这是一组账号动作」都得靠可及名称补回来 */
      aria-label={collapsed ? `${user.name}，账号与登出` : undefined}
    >
      <Avatar size={26} src={user.image ?? undefined} className={styles.accountAvatar}>
        {user.name.slice(0, 1).toUpperCase()}
      </Avatar>
      {collapsed ? null : <span className={styles.accountName}>{user.name}</span>}
    </Button>
  )

  return (
    <div className={`${styles.accountRow} ${collapsed ? styles.accountRowCollapsed : ''}`}>
      <Dropdown
        trigger={['click']}
        placement="topRight"
        menu={{
          items,
          onClick: ({ key }) => {
            if (key === 'account') return onOpenAccount()
            if (key === 'signout') return void api.auth.signOutAndLeave()
          },
        }}
      >
        {/*
          触发器是 antd 的 `Button`，**不是带 onClick 的 div**（D-042）。

          它原来是个 div，于是折叠后那个字母头像既不在 tab 序列里、也没有
          可及名称：整条 rail 的键盘序列是「折叠开关 → 菜单 → 知识库 →
          设置」，账号行被跳过（实测），而鼠标悬停也弹不出任何提示
          （同一栏里其余图标都有 tooltip）。登出因此在这条栏里失去了名字。

          换成 `Button` 就同时解决三件事：可聚焦、Enter/Space 打开菜单
          （Dropdown 靠点击触发，而 div 按 Enter 不发 click）、以及外层
          `Tooltip` 能挂上去。

          Tooltip **只在折叠态给**：展开态名字就写在旁边，再弹一次是噪音。
        */}
        {collapsed ? (
          <Tooltip title={user.name} placement="right">
            {accountTrigger}
          </Tooltip>
        ) : (
          accountTrigger
        )}
      </Dropdown>

      {/*
        `Tooltip` 不能省：折叠态下它只剩一个图标，而设置是个**只有图标
        没有文字**的目的地。悬停给名字是廉价的可发现性补偿。
      */}
      <Tooltip title="设置" placement="top">
        <Button
          type="text"
          size="small"
          icon={<Settings size={16} />}
          className={`${styles.accountSettings} ${settingsActive ? styles.accountSettingsActive : ''}`}
          onClick={onOpenSettings}
          aria-label="设置"
          aria-current={settingsActive ? 'page' : undefined}
        />
      </Tooltip>
    </div>
  )
}
