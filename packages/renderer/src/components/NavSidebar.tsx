import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button, Drawer, Menu, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  LibraryBig,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { BrandMark } from './BrandMark'
import { useStyles } from './NavSidebar.style'
import { FolderSection } from './nav/FolderSection'
import { AccountRow } from './nav/AccountRow'
import { NavigationAction } from './nav/NavigationAction'
import { RecentNotes } from './nav/RecentNotes'
import { buildConversations, currentKey } from './nav/menu-items'
import { api } from '../lib/api'
import { useScrolled } from '../lib/use-scrolled'
import { useUnsaved } from '../lib/unsaved'

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
  const { runGuarded, pending } = useUnsaved()
  // This survives account-row remounts between the rail and Drawer.
  const signingOutRef = useRef(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signoutError, setSignoutError] = useState(false)
  const signOut = (onStart: () => void) => {
    if (signingOutRef.current) return
    runGuarded(() => {
      if (signingOutRef.current) return
      signingOutRef.current = true
      setSigningOut(true)
      setSignoutError(false)
      onStart()
      void (async () => {
        try {
          await api.auth.signOutAndLeave()
        } catch {
          setSignoutError(true)
        } finally {
          signingOutRef.current = false
          setSigningOut(false)
        }
      })()
    })
  }
  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: api.conversations.list,
  })
  const overlayCloseRef = useRef<HTMLButtonElement>(null)
  const overlayTriggerRef = useRef<HTMLButtonElement>(null)
  const restoreOverlayFocusRef = useRef(true)
  const closeAfterAction = () => {
    restoreOverlayFocusRef.current = false
    onCloseOverlay()
  }
  const dismissOverlay = () => {
    restoreOverlayFocusRef.current = true
    onCloseOverlay()
  }
  const goDocs = (scope: string) =>
    runGuarded(() => {
      closeAfterAction()
      void navigate({ to: '/docs', search: { scope } })
    })
  const goChat = (id?: string) =>
    runGuarded(() => {
      closeAfterAction()
      void navigate({ to: '/chat', search: id ? { scope: 'all', id } : { scope: 'all' } })
    })
  const goSettingsSection = (section: 'account' | 'stats') =>
    runGuarded(() => {
      closeAfterAction()
      void navigate({ to: '/settings', search: { scope: 'all', section } })
    })
  const goSettings = () =>
    runGuarded(() => {
      closeAfterAction()
      void navigate({ to: '/settings', search: { scope: 'all' } })
    })
  const openRecent = (id: string, scope: string) =>
    runGuarded(() => {
      closeAfterAction()
      onOpenDocument(id, scope)
    })
  const openPalette = () => {
    closeAfterAction()
    onOpenPalette()
  }
  const openCapture = () => {
    closeAfterAction()
    onOpenCapture()
  }
  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('conv:')) return goChat(key.slice('conv:'.length))
    if (key === 'action:new-chat') return goChat()
    if (key === 'action:search') return openPalette()
  }

  const selectedKey = currentKey(selection)
  const conversations = conversationsQuery.data?.items ?? []
  // Cached history stays navigable when a background refresh fails.
  const conversationItems = buildConversations(
    conversations,
    CONVERSATION_LIMIT,
    selection.page === 'chat' ? selection.id : undefined,
  )

  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyScrolled = useScrolled(bodyRef)
  const panelVisible = !collapsed || (narrowViewport && overlayOpen)
  const toggleOverlay = () => {
    restoreOverlayFocusRef.current = true
    onToggleOverlay()
  }

  const workspace = (
    <div
      className={styles.panel}
      onKeyDown={(event) => {
        if (!narrowViewport || !overlayOpen || pending || event.key !== 'Tab') return
        const nodes = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]',
          ),
        ].filter(
          (node) =>
            node.tabIndex >= 0 &&
            node.getClientRects().length > 0 &&
            !node.closest('[inert], [hidden]'),
        )
        const first = nodes[0]
        const last = nodes.at(-1)
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault()
          first.focus()
        }
      }}
    >
      <div className={styles.panelHeading}>
        <span className={styles.brand}>
          {!hideTopBar && <BrandMark size={22} title={null} />}
          {hideTopBar ? '工作区' : 'Mimir'}
        </span>
        <Tooltip title={narrowViewport ? '关闭侧边栏' : '折叠侧边栏'}>
          <Button
            type="text"
            icon={narrowViewport ? <X size={18} /> : <PanelLeftClose size={18} />}
            aria-label={narrowViewport ? '关闭侧边栏' : '折叠侧边栏'}
            ref={narrowViewport ? overlayCloseRef : undefined}
            className={styles.railButton}
            onClick={narrowViewport ? dismissOverlay : onToggleCollapsed}
          />
        </Tooltip>
      </div>
      <div className={styles.primaryActions}>
        <Button
          data-palette-trigger
          className={styles.searchButton}
          icon={<Search size={17} />}
          onClick={openPalette}
        >
          <span className={styles.searchLabel}>快速搜索…</span>
          <kbd className={styles.searchShortcut} aria-hidden="true">
            {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
              ? '⌘ K'
              : 'Ctrl K'}
          </kbd>
        </Button>
        <NavigationAction
          label="知识库"
          icon={<LibraryBig size={18} />}
          onClick={() => goDocs('all')}
          active={selection.page === 'docs'}
        />
        <NavigationAction
          label="新建对话"
          icon={<MessageCircle size={18} />}
          onClick={() => goChat()}
          active={selection.page === 'chat' && !selection.id}
        />
        <NavigationAction label="收集" icon={<Plus size={18} />} onClick={openCapture} />
      </div>
      <div className={styles.body} ref={bodyRef}>
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
            parentOnly={Boolean(selection.id)}
            onSelect={(path) => goDocs(path ? `folder:${path}` : 'all')}
            onPathChanged={(from, to) => {
              const prefix = 'folder:'
              const path = selection.scope.startsWith(prefix)
                ? selection.scope.slice(prefix.length)
                : null
              if (
                selection.page !== 'docs' ||
                from === to ||
                !path ||
                !(path === from || path.startsWith(`${from}/`))
              )
                return
              // The save already committed; synchronize the same content's canonical
              // location, not a guarded departure that could leave an obsolete scope.
              void navigate({
                to: '/docs',
                search: {
                  scope: `${prefix}${to}${path.slice(from.length)}`,
                  ...(selection.id ? { id: selection.id } : {}),
                },
              })
            }}
          />
        </div>
        <Menu
          mode="inline"
          className={styles.menu}
          selectedKeys={selectedKey?.startsWith('conv:') ? [selectedKey] : []}
          onClick={onMenuClick}
          items={conversationItems}
        />
        {conversationsQuery.isPending && (
          <p className={styles.conversationEmpty} role="status">
            正在读取对话…
          </p>
        )}
        {conversationsQuery.isError && (
          <div className={styles.queryFeedback}>
            <span role="status">{conversations.length ? '对话刷新失败' : '对话读取失败'}</span>
            <Button
              type="link"
              size="small"
              loading={conversationsQuery.isFetching}
              onClick={() => void conversationsQuery.refetch()}
            >
              重试
            </Button>
          </div>
        )}
        {!conversationsQuery.isError &&
          !conversationsQuery.isPending &&
          conversations.length === 0 && (
            <p className={styles.conversationEmpty}>暂无对话，点上方“新建对话”</p>
          )}
        <RecentNotes userId={userId} activeId={selection.id} onOpenDocument={openRecent} />
      </div>
      <div className={styles.foot} data-scrolled={bodyScrolled || undefined}>
        <AccountRow
          key={`${selection.page}:${selection.scope}:${selection.id ?? ''}`}
          collapsed={false}
          narrowViewport={narrowViewport}
          signingOut={signingOut}
          signoutError={signoutError}
          onSignOut={signOut}
          settingsActive={selection.page === 'settings'}
          onOpenAccount={() => goSettingsSection('account')}
          onOpenSettings={goSettings}
          onOpenStats={() => goSettingsSection('stats')}
        />
      </div>
    </div>
  )

  return (
    <nav className={styles.nav} aria-label="主导航">
      {collapsed ? (
        <div className={styles.rail} inert={narrowViewport && overlayOpen}>
          {!hideTopBar && (
            <span className={styles.railBrand}>
              <BrandMark size={23} title="mimir" />
            </span>
          )}
          <NavigationAction
            compact
            label="展开侧边栏"
            icon={<PanelLeftOpen size={18} />}
            onClick={narrowViewport ? toggleOverlay : onToggleCollapsed}
            buttonRef={overlayTriggerRef}
          />
          <NavigationAction
            compact
            label="知识库"
            icon={<LibraryBig size={18} />}
            onClick={() => goDocs('all')}
            active={selection.page === 'docs'}
          />
          <NavigationAction
            compact
            label="新建对话"
            icon={<MessageCircle size={18} />}
            onClick={() => goChat()}
            active={selection.page === 'chat'}
          />
          <NavigationAction
            compact
            label="搜索"
            icon={<Search size={18} />}
            onClick={openPalette}
          />
          <NavigationAction compact label="收集" icon={<Plus size={18} />} onClick={openCapture} />
          <div className={styles.railSpacer} />
          <NavigationAction
            compact
            label="设置"
            icon={<Settings size={18} />}
            onClick={goSettings}
            active={selection.page === 'settings'}
          />
          {!(narrowViewport && overlayOpen) && (
            <div className={styles.railFoot}>
              <AccountRow
                key={`${selection.page}:${selection.scope}:${selection.id ?? ''}`}
                collapsed
                narrowViewport={narrowViewport}
                signingOut={signingOut}
                signoutError={signoutError}
                onSignOut={signOut}
                showSettings={false}
                settingsActive={selection.page === 'settings'}
                onOpenAccount={() => goSettingsSection('account')}
                onOpenSettings={goSettings}
                onOpenStats={() => goSettingsSection('stats')}
              />
            </div>
          )}
        </div>
      ) : (
        workspace
      )}
      {narrowViewport && (
        <Drawer
          title="工作区导航"
          open={panelVisible}
          placement="left"
          size="min(280px, 100vw)"
          closable={false}
          keyboard={!pending}
          mask={{ closable: !pending }}
          focusable={{ trap: !pending, focusTriggerAfterClose: false }}
          onClose={dismissOverlay}
          afterOpenChange={(open) => {
            if (open && !pending) overlayCloseRef.current?.focus()
            else if (restoreOverlayFocusRef.current) overlayTriggerRef.current?.focus()
          }}
          styles={{ header: { display: 'none' }, body: { padding: 0, overflow: 'hidden' } }}
        >
          {workspace}
        </Drawer>
      )}
    </nav>
  )
}
