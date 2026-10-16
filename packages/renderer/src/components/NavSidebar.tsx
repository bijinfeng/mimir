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
import { useRef } from 'react'
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
  const { runGuarded } = useUnsaved()
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
  const goDocs = (scope: string) => {
    closeAfterAction()
    runGuarded(() => void navigate({ to: '/docs', search: { scope } }))
  }
  const goChat = (id?: string) => {
    closeAfterAction()
    runGuarded(
      () => void navigate({ to: '/chat', search: id ? { scope: 'all', id } : { scope: 'all' } }),
    )
  }
  const goSettingsSection = (section: 'account' | 'stats') => {
    closeAfterAction()
    runGuarded(() => void navigate({ to: '/settings', search: { scope: 'all', section } }))
  }
  const goSettings = () => {
    closeAfterAction()
    runGuarded(() => void navigate({ to: '/settings', search: { scope: 'all' } }))
  }
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
            children: [],
          },
        ]
      : buildConversations(
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
    <div className={styles.panel}>
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
        <Button className={styles.searchButton} icon={<Search size={17} />} onClick={openPalette}>
          搜索
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
          />
        </div>
        <Menu
          mode="inline"
          className={styles.menu}
          selectedKeys={selectedKey?.startsWith('conv:') ? [selectedKey] : []}
          onClick={onMenuClick}
          items={conversationItems}
        />
        {!conversationsQuery.isError &&
          !conversationsQuery.isLoading &&
          conversations.length === 0 && (
            <p className={styles.conversationEmpty}>暂无对话，点上方“新建对话”</p>
          )}
        <RecentNotes
          userId={userId}
          activeId={selection.id}
          onBeforeOpen={closeAfterAction}
          onOpenDocument={onOpenDocument}
        />
      </div>
      <div className={styles.foot} data-scrolled={bodyScrolled || undefined}>
        <AccountRow
          key={`${selection.page}:${selection.scope}:${selection.id ?? ''}`}
          collapsed={false}
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
          keyboard
          mask={{ closable: true }}
          focusable={{ trap: true, focusTriggerAfterClose: false }}
          onClose={dismissOverlay}
          afterOpenChange={(open) => {
            if (open) overlayCloseRef.current?.focus()
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
