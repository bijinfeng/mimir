import { useQuery } from '@tanstack/react-query'
import { Avatar, Button, Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { ChartColumn, Check, LoaderCircle, LogOut, Palette, Settings, User } from 'lucide-react'
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
  narrowViewport,
  showSettings = true,
  settingsActive,
  signingOut,
  signoutError,
  onSignOut,
  onOpenAccount,
  onOpenSettings,
  onOpenStats,
}: {
  collapsed: boolean
  narrowViewport: boolean
  showSettings?: boolean
  settingsActive: boolean
  signingOut: boolean
  signoutError: boolean
  onSignOut: (onStart: () => void) => void
  onOpenAccount: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
}) {
  const { styles } = useStyles()
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  // Unknown runtime mode must never be interpreted as a cloud account.
  const localMode = configQuery.data?.localMode
  const { mode, setMode } = useThemeMode()
  const [themeOpen, setThemeOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const user = sessionQuery.data?.user
  const accountUnavailable = sessionQuery.isError || (sessionQuery.isSuccess && !user)

  const closeMenu = (restoreFocus = false) => {
    // Theme is an independent portal: close it synchronously before its parent.
    flushSync(() => setThemeOpen(false))
    setAccountOpen(false)
    if (restoreFocus) queueMicrotask(() => accountTriggerRef.current?.focus())
  }

  const requestSignout = () => {
    if (signingOut) return
    closeMenu()
    accountTriggerRef.current?.focus()
    onSignOut(() => setAccountOpen(true))
  }

  const themeChildren: MenuProps['items'] = THEME_MODES.map((value: ThemeMode) => ({
    key: `theme:${value}`,
    label: THEME_MODE_LABELS[value],
    extra: mode === value ? <Check size={16} /> : undefined,
  }))
  const items: MenuProps['items'] = user
    ? [
        {
          type: 'group',
          label: (
            <div className={styles.accountMenuIdentity}>
              <Avatar size={28} src={user.image ?? undefined} className={styles.accountAvatar}>
                {user.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className={styles.accountMenuIdentityText}>
                <Tooltip title={user.name} trigger={['hover', 'focus']}>
                  <span tabIndex={0} className={styles.accountMenuName}>
                    {user.name}
                  </span>
                </Tooltip>
                {localMode === true ? (
                  <span className={styles.accountMenuEmail}>本地用户</span>
                ) : localMode === false && user.email ? (
                  <Tooltip title={user.email} trigger={['hover', 'focus']}>
                    <span tabIndex={0} className={styles.accountMenuEmail}>
                      {user.email}
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          ),
          children: [
            { key: 'account', icon: <User size={16} />, label: '账号资料', disabled: signingOut },
            {
              key: 'theme',
              icon: <Palette size={16} />,
              label: <span data-account-theme>主题</span>,
              popupClassName: styles.accountMenuPopup,
              children: themeChildren,
              disabled: signingOut,
            },
            {
              key: 'stats',
              icon: <ChartColumn size={16} />,
              label: '数据统计',
              disabled: signingOut,
            },
            ...(sessionQuery.isError
              ? [
                  {
                    key: 'retry-session',
                    label: sessionQuery.isFetching ? '正在重试账号…' : '账号刷新失败，重试',
                    disabled: sessionQuery.isFetching,
                  },
                ]
              : []),
            ...(configQuery.data === undefined
              ? [
                  {
                    key: 'retry-config',
                    label: configQuery.isError ? '连接信息读取失败，重试' : '正在读取连接信息…',
                    disabled: configQuery.isFetching || !configQuery.isError,
                  },
                ]
              : []),
          ],
        },
        // RuntimeConfig is the authority. Local and unknown modes have no signout.
        ...(localMode === false
          ? [
              { type: 'divider' as const },
              {
                key: 'signout',
                icon: signingOut ? <LoaderCircle size={16} /> : <LogOut size={16} />,
                label: signingOut ? '正在登出…' : signoutError ? '重试登出' : '登出',
                disabled: signingOut,
                danger: true,
              },
              ...(signoutError
                ? [
                    {
                      type: 'group' as const,
                      label: (
                        <p role="alert" className={styles.accountMenuError}>
                          登出失败，请重试。当前内容已保留。
                        </p>
                      ),
                      children: [],
                    },
                  ]
                : []),
            ]
          : []),
      ]
    : []

  const accountTrigger = user ? (
    <Button
      type="text"
      className={`${styles.account} ${collapsed ? styles.accountCollapsed : ''}`}
      aria-label={`${user.name}，账号菜单`}
      ref={accountTriggerRef}
      loading={signingOut}
    >
      <Avatar
        aria-hidden="true"
        size={26}
        src={user.image ?? undefined}
        className={styles.accountAvatar}
      >
        {user.name.slice(0, 1).toUpperCase()}
      </Avatar>
      {!collapsed && <span className={styles.accountName}>{user.name}</span>}
    </Button>
  ) : null

  return (
    <div className={`${styles.accountRow} ${collapsed ? styles.accountRowCollapsed : ''}`}>
      {user && accountTrigger ? (
        <Dropdown
          trigger={['click']}
          open={accountOpen}
          destroyOnHidden
          placement={narrowViewport ? 'topLeft' : 'topRight'}
          classNames={{ root: styles.accountMenuPopup }}
          styles={{ root: { minWidth: 0 } }}
          onOpenChange={(open, info) => {
            // Menu actions explicitly decide whether to close (signout stays open).
            if (info.source === 'menu' || signingOut) return
            setAccountOpen(open)
            if (!open) setThemeOpen(false)
            // Outside clicks keep focus on their new target.
          }}
          menu={{
            items,
            onKeyDownCapture: (event) => {
              if (event.key !== 'Escape' || signingOut) return
              event.preventDefault()
              event.stopPropagation()
              if (themeOpen) {
                setThemeOpen(false)
                accountTriggerRef.current?.ownerDocument
                  .querySelector<HTMLElement>('[data-account-theme]')
                  ?.closest<HTMLElement>('[role="menuitem"]')
                  ?.focus()
              } else closeMenu(true)
            },
            openKeys: themeOpen ? ['theme'] : [],
            onOpenChange: (keys) => setThemeOpen(keys.includes('theme')),
            onClick: ({ key }) => {
              if (signingOut) return
              if (key.startsWith('theme:')) {
                closeMenu(true)
                return setMode(key.slice('theme:'.length) as ThemeMode)
              }
              if (key === 'signout') return requestSignout()
              if (key === 'retry-session') return void sessionQuery.refetch()
              if (key === 'retry-config') return void configQuery.refetch()
              closeMenu()
              if (key === 'account') return onOpenAccount()
              if (key === 'stats') return onOpenStats()
            },
          }}
        >
          <Tooltip title={user.name} trigger={['hover', 'focus']} placement="right">
            {accountTrigger}
          </Tooltip>
        </Dropdown>
      ) : (
        <Tooltip
          title={accountUnavailable ? '账号读取失败，重试' : '正在读取账号…'}
          trigger={['hover', 'focus']}
        >
          <Button
            type="text"
            className={`${styles.account} ${collapsed ? styles.accountCollapsed : ''}`}
            aria-label={accountUnavailable ? '账号读取失败，重试' : '正在读取账号…'}
            loading={sessionQuery.isFetching}
            disabled={!accountUnavailable}
            onClick={() => void sessionQuery.refetch()}
          >
            {collapsed ? (
              <User size={18} />
            ) : accountUnavailable ? (
              '账号读取失败，重试'
            ) : (
              '正在读取账号…'
            )}
          </Button>
        </Tooltip>
      )}
      {showSettings && (
        <Tooltip title="设置" placement="top" trigger={['hover', 'focus']}>
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
