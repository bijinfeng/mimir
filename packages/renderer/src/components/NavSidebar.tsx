import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Avatar, Button, Dropdown, Menu, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  ChartColumn,
  Check,
  LibraryBig,
  LogOut,
  MessageCircle,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  User,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { BrandMark } from './BrandMark'
import { useStyles } from './NavSidebar.style'
import { FolderSection } from './nav/FolderSection'
import { buildActions, buildConversations, currentKey } from './nav/menu-items'
import { api } from '../lib/api'
import { useScrolled } from '../lib/use-scrolled'
import { useUnsaved } from '../lib/unsaved'
import { useRecentDocuments } from '../lib/recent-documents'
import { THEME_MODES, THEME_MODE_LABELS, useThemeMode, type ThemeMode } from '../theme/appearance'

export interface NavSelection {
  page: 'docs' | 'chat' | 'settings'
  scope: string
  id?: string
}

export interface NavSidebarProps {
  selection: NavSelection
  onOpenPalette: () => void
  onOpenCapture: () => void
  collapsed: boolean
  overlayOpen: boolean
  narrowViewport: boolean
  onToggleOverlay: () => void
  onCloseOverlay: () => void
  onToggleCollapsed: () => void
  hideTopBar?: boolean
  userId?: string
  onOpenDocument: (id: string, scope: string) => void
}

const CONVERSATION_LIMIT = 12

export function NavSidebar({
  selection,
  onOpenPalette,
  onOpenCapture,
  collapsed,
  overlayOpen,
  narrowViewport,
  onToggleOverlay,
  onCloseOverlay,
  onToggleCollapsed,
  hideTopBar = false,
  userId,
  onOpenDocument,
}: NavSidebarProps) {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const { runGuarded } = useUnsaved()
  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: api.conversations.list,
  })
  const recentQuery = useRecentDocuments(userId)
  const [showRecent, setShowRecent] = useState(true)
  const overlayTriggerRef = useRef<HTMLButtonElement>(null)
  const overlayCloseRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!overlayOpen || !narrowViewport) return
    const trigger = overlayTriggerRef.current
    overlayCloseRef.current?.focus()
    return () => trigger?.focus()
  }, [overlayOpen, narrowViewport])

  const goDocs = (scope: string) => {
    onCloseOverlay()
    runGuarded(() => void navigate({ to: '/docs', search: { scope } }))
  }
  const goChat = (id?: string) => {
    onCloseOverlay()
    runGuarded(
      () => void navigate({ to: '/chat', search: id ? { scope: 'all', id } : { scope: 'all' } }),
    )
  }
  const goSettingsSection = (section: 'account' | 'stats') => {
    onCloseOverlay()
    runGuarded(() => void navigate({ to: '/settings', search: { scope: 'all', section } }))
  }
  const goSettings = () => {
    onCloseOverlay()
    runGuarded(() => void navigate({ to: '/settings', search: { scope: 'all' } }))
  }
  const openPalette = () => {
    onCloseOverlay()
    onOpenPalette()
  }
  const openCapture = () => {
    onCloseOverlay()
    onOpenCapture()
  }
  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('conv:')) return goChat(key.slice('conv:'.length))
    if (key === 'action:new-chat') return goChat()
    if (key === 'action:search') return openPalette()
    if (key === 'action:retry-conversations') return void conversationsQuery.refetch()
  }

  const selectedKey = currentKey(selection)
  const conversations = conversationsQuery.data?.items ?? []
  const conversationItems = conversationsQuery.isError
    ? [
        {
          key: 'conv-group:all',
          type: 'group' as const,
          label: '对话',
          children: [{ key: 'action:retry-conversations', label: '读取失败，点此重试' }],
        },
      ]
    : conversations.length === 0
      ? [
          {
            key: 'conv-group:all',
            type: 'group' as const,
            label: '对话',
            children: [{ key: 'conv-empty', label: '还没有对话', disabled: true }],
          },
        ]
      : buildConversations(conversations, CONVERSATION_LIMIT)

  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyScrolled = useScrolled(bodyRef)
  const panelVisible = selection.page !== 'settings' && (!collapsed || overlayOpen)
  const railButton = (label: string, icon: ReactNode, onClick: () => void, active = false) => (
    <Tooltip
      title={label}
      placement="right"
      key={label.includes('侧边栏') ? 'sidebar-toggle' : label}
    >
      <Button
        type="text"
        className={`${styles.railButton} ${active ? styles.railActive : ''}`}
        icon={icon}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        ref={label.includes('侧边栏') ? overlayTriggerRef : undefined}
        onClick={onClick}
      />
    </Tooltip>
  )

  return (
    <nav className={styles.nav} aria-label="主导航">
      <div className={styles.rail}>
        {hideTopBar ? null : (
          <span className={styles.railBrand}>
            <BrandMark size={23} title="mimir" />
          </span>
        )}
        {railButton(
          '新建对话',
          <MessageCircle size={19} />,
          () => goChat(),
          selection.page === 'chat',
        )}
        {railButton(
          '知识库',
          <LibraryBig size={19} />,
          () => goDocs('all'),
          selection.page === 'docs',
        )}
        {railButton('搜索', <Search size={19} />, openPalette)}
        {railButton('收集', <Plus size={19} />, openCapture)}
        <div className={styles.railSpacer} />
        {selection.page !== 'settings' &&
          railButton(
            overlayOpen ? '关闭侧边栏' : collapsed ? '展开侧边栏' : '折叠侧边栏',
            collapsed && !overlayOpen ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />,
            narrowViewport ? onToggleOverlay : onToggleCollapsed,
          )}
        {railButton('设置', <Settings size={19} />, goSettings, selection.page === 'settings')}
        <div className={styles.railFoot}>
          <AccountRow
            key={`${selection.page}:${selection.scope}:${selection.id ?? ''}`}
            collapsed
            showSettings={false}
            settingsActive={selection.page === 'settings'}
            onOpenAccount={() => goSettingsSection('account')}
            onOpenSettings={goSettings}
            onOpenStats={() => goSettingsSection('stats')}
          />
        </div>
      </div>

      {panelVisible && (
        <div className={`${styles.panel} ${collapsed ? styles.panelOverlay : ''}`}>
          <div className={styles.panelHeading}>
            <span>工作区</span>
            {collapsed && (
              <Button
                type="text"
                size="small"
                icon={<PanelLeftClose size={16} />}
                aria-label="关闭侧边栏"
                ref={overlayCloseRef}
                onClick={onCloseOverlay}
              />
            )}
          </div>
          <div className={styles.body} ref={bodyRef}>
            <Menu
              mode="inline"
              className={styles.menu}
              selectedKeys={selectedKey ? [selectedKey] : []}
              onClick={onMenuClick}
              items={[...buildActions(), ...conversationItems]}
            />
            <div className={styles.treeGroup}>
              <FolderSection
                items={foldersQuery.data?.items}
                isLoading={foldersQuery.isLoading}
                isError={foldersQuery.isError}
                onRetry={() => void foldersQuery.refetch()}
                activePath={
                  selection.page === 'docs' && selection.scope.startsWith('folder:')
                    ? selection.scope.slice('folder:'.length)
                    : null
                }
                onSelect={(path) => goDocs(path ? `folder:${path}` : 'all')}
              />
            </div>
            {selection.page === 'docs' && (
              <div className={styles.recentGroup}>
                <Button
                  type="text"
                  className={styles.recentHeading}
                  aria-expanded={showRecent}
                  onClick={() => setShowRecent((value) => !value)}
                >
                  最近笔记 {showRecent ? '⌄' : '›'}
                </Button>
                {showRecent && (
                  <div className={styles.recentList}>
                    {(recentQuery.data ?? []).filter((doc) => doc.kind === 'note').length === 0 ? (
                      <span className={styles.recentEmpty}>还没有最近打开的笔记</span>
                    ) : (
                      (recentQuery.data ?? [])
                        .filter((doc) => doc.kind === 'note')
                        .slice(0, 6)
                        .map((doc) => (
                          <Button
                            key={doc.id}
                            type="text"
                            className={styles.recentItem}
                            aria-current={selection.id === doc.id ? 'page' : undefined}
                            onClick={() => {
                              onCloseOverlay()
                              onOpenDocument(doc.id, doc.folder ? `folder:${doc.folder}` : 'all')
                            }}
                          >
                            <span>{doc.title}</span>
                            <small>{doc.folder ?? '知识库根'}</small>
                          </Button>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.foot} data-scrolled={bodyScrolled || undefined} />
        </div>
      )}
    </nav>
  )
}

function AccountRow({
  collapsed,
  showSettings = true,
  settingsActive,
  onOpenAccount,
  onOpenSettings,
  onOpenStats,
}: {
  collapsed: boolean
  showSettings?: boolean
  settingsActive: boolean
  onOpenAccount: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
}) {
  const { styles } = useStyles()
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  /**
   * 本地模式（D-100）：菜单里**不再有登出**。
   *
   * 本机用户不是登录来的（桌面客户端注入令牌直接进入），登出之后没有任何
   * 可以「出」的地方——留在那里就是一颗点了没反应的按钮。服务端是这件事
   * 的真相来源（`RuntimeConfig.localMode`），界面不猜。
   */
  const localMode = configQuery.data?.localMode ?? false
  const { mode, setMode } = useThemeMode()
  /**
   * 主题子菜单的展开状态。**受控**——这是子菜单那个「弹层残留」的修法：
   *
   * 子菜单浮层是**独立的 portal**（挂在 body 下，不在 Dropdown 的弹层里）。
   * 非受控时，点完子项父层关闭，而它不知道自己该收——于是留在页面上，
   * 里面的勾还是点之前的值（实测）。受控之后，选择动作与收起动作是同一步，
   * 弹层没有「悬着」的窗口。
   *
   * 声明必须在 `if (!user) return null` **之前**（hooks 不能有条件地少调），
   * 所以它排在早退之前。
   */
  const [themeOpen, setThemeOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const user = sessionQuery.data?.user

  /**
   * 会话还没取回时**不渲染**，而不是渲染一个占位的空行。
   *
   * 占位行会在数据到达时让侧栏底部跳一下，而那个跳动恰好发生在用户
   * 刚开始看界面的时候。少一行比跳一下好。
   */
  if (!user) return null

  /**
   * 主题的三个取值，挂在「主题」子菜单下（**级联形态**，用户拍板）。
   *
   * 早先试过子菜单又退回分组平铺，原因是两个实测问题——点完子项后
   * 弹层残留（独立 portal 不知道父层关了）与勾不更新。这次回到子菜单，
   * 用**受控 `openKeys`** 修掉根因：选中子项时同步收起子菜单
   * （见下面的 `onClick`），关整个菜单时也重置（`Dropdown` 的
   * `onOpenChange`）。弹层残留的窗口因此不存在，勾也随重渲染更新。
   *
   * 当前项用 `Check` 打勾而**不禁用**：点当前值是无操作，禁用会读成
   * 「这一项坏了」——`ComposerMenus` 里那组「当前模型」是真禁用
   * （那是展示行，不是选择行），两者语义不同。
   *
   * 勾走菜单项的 **`extra`**（行尾）而不是 `icon`（行首）：三个取值里只有
   * 一个带勾，放行首会让选中项的文字比其他两项**整体右移一格**——扫读时
   * 「浅色」与「深色」不在同一条竖线上。放行尾则文字左对齐、勾在右侧对齐。
   *
   * 三个值从 `THEME_MODES` 来、文案从 `THEME_MODE_LABELS` 来：设置页的
   * `Segmented` 用的是同一对来源，加取值或改文案只改一处。
   */
  const themeChildren: MenuProps['items'] = THEME_MODES.map((value: ThemeMode) => ({
    key: `theme:${value}`,
    label: THEME_MODE_LABELS[value],
    extra: mode === value ? <Check size={16} /> : undefined,
  }))

  const items: MenuProps['items'] = [
    { key: 'account', icon: <User size={16} />, label: '账号资料' },
    {
      key: 'theme',
      icon: <Palette size={16} />,
      label: '主题',
      children: themeChildren,
    },
    { key: 'stats', icon: <ChartColumn size={16} />, label: '数据统计' },
    // 登出只在云端模式出现（本地模式的理由见 `localMode` 的声明处）
    ...(localMode
      ? []
      : [
          { type: 'divider' as const },
          { key: 'signout', icon: <LogOut size={16} />, label: '登出', danger: true },
        ]),
  ]

  const accountTrigger = (
    <Button
      type="text"
      className={`${styles.account} ${collapsed ? styles.accountCollapsed : ''}`}
      /* 折叠态只剩一个字母头像：「这是谁的账号」「点开是一组动作」
         都得靠可及名称补回来。文案取「账号菜单」而不是逐项列举——
         菜单在三到四项之间（账号资料 / 主题 / 数据统计 / 登出，本地模式
         下没有最后一项），列全了又长又漏得快 */
      aria-label={collapsed ? `${user.name}，账号菜单` : undefined}
      ref={accountTriggerRef}
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
        open={accountOpen}
        placement="topRight"
        /* 关菜单时把子菜单状态一并重置：下次打开停在收起态（与 antd
           的默认行为一致），也不会留下一个「上次展开过的」子菜单 */
        onOpenChange={(open) => {
          setAccountOpen(open)
          if (!open) setThemeOpen(false)
          if (!open) queueMicrotask(() => accountTriggerRef.current?.focus())
        }}
        menu={{
          items,
          /* 受控展开（理由见 `themeOpen` 的声明处） */
          openKeys: themeOpen ? ['theme'] : [],
          onOpenChange: (keys) => setThemeOpen(keys.includes('theme')),
          /*
            主题三项走这里分发（key 前缀 `theme:`）——它们不是独立动作按钮，
            而是这一组选择里的一个取值。放在分发处而不是给每项挂 onClick：
            「加一个取值」只需要改 `THEME_MODES`（它本来就是唯一清单），
            分发处不用动。

            选中时**先把子菜单收起来再切主题**：子菜单浮层是独立 portal，
            不收的窗口期里它会悬在页面上（上一版的 bug）。收起的动作与
            选择同一步，就不存在那个窗口。
          */
          onClick: ({ key }) => {
            setAccountOpen(false)
            if (key.startsWith('theme:')) {
              /*
                用 `flushSync` **同步**收起子菜单，再切主题。
                
                不等它异步渲染：`Dropdown` 关闭时 rc-trigger 不再重渲染
                overlay，而子菜单弹层是**独立 portal**——异步的 state 更新
                会赶不上关闭动作，弹层就留在屏幕上（实测 aria-expanded 一直
                是 true、popup 持续可见，而 state 早已是 false）。
                rc-menu 内部对同类「React 18 合并事件导致不同步」也用
                flushSync（见其 `triggerOpenKeys` 的 forceFlush 分支）。
              */
              flushSync(() => setThemeOpen(false))
              return setMode(key.slice('theme:'.length) as ThemeMode)
            }
            if (key === 'account') return onOpenAccount()
            if (key === 'stats') return onOpenStats()
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
      {showSettings && (
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
      )}
    </div>
  )
}
