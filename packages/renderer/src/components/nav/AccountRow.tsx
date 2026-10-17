import { useQuery } from '@tanstack/react-query'
import { Avatar, Button, Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { ChartColumn, Check, LogOut, Palette, Settings, User } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useStyles } from '../NavSidebar.style'
import { api } from '../../lib/api'
import {
  THEME_MODES,
  THEME_MODE_LABELS,
  useThemeMode,
  type ThemeMode,
} from '../../theme/appearance'

export function AccountRow({
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
    {
      type: 'group',
      label: (
        <div className={styles.accountMenuIdentity}>
          <Avatar size={28} src={user.image ?? undefined} className={styles.accountAvatar}>
            {user.name.slice(0, 1).toUpperCase()}
          </Avatar>
          <div className={styles.accountMenuIdentityText}>
            <span className={styles.accountMenuName}>{user.name}</span>
            {localMode ? (
              <span className={styles.accountMenuEmail}>本地用户</span>
            ) : (
              user.email && <span className={styles.accountMenuEmail}>{user.email}</span>
            )}
          </div>
        </div>
      ),
      children: [
        { key: 'account', icon: <User size={16} />, label: '账号资料' },
        {
          key: 'theme',
          icon: <Palette size={16} />,
          label: '主题',
          popupClassName: styles.accountMenuPopup,
          children: themeChildren,
        },
        { key: 'stats', icon: <ChartColumn size={16} />, label: '数据统计' },
      ],
    },
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
      aria-label={`${user.name}，账号菜单`}
      ref={accountTriggerRef}
    >
      <Avatar
        aria-hidden="true"
        size={26}
        src={user.image ?? undefined}
        className={styles.accountAvatar}
      >
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
        destroyOnHidden
        placement="topRight"
        classNames={{ root: styles.accountMenuPopup }}
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
              setAccountOpen(false)
              return setMode(key.slice('theme:'.length) as ThemeMode)
            }
            setAccountOpen(false)
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
            onClick={(event) => {
              event.currentTarget.focus()
              onOpenSettings()
            }}
            aria-label="设置"
            aria-current={settingsActive ? 'page' : undefined}
          >
            {!collapsed && '设置'}
          </Button>
        </Tooltip>
      )}
    </div>
  )
}
