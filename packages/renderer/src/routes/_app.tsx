import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import type { Citation, SearchHit, DocumentDetail } from '@mimir/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { App as AntApp } from 'antd'
import { createStyles } from 'antd-style'
import { useEffect, useRef, useState } from 'react'
import { CaptureDialog } from '../components/CaptureDialog'
import { CommandPalette } from '../components/CommandPalette'
import { NavSidebar } from '../components/NavSidebar'
import { UnsavedGuard } from '../components/UnsavedGuard'
import { api, ApiRequestError } from '../lib/api'
import { AppShellContext, type AskDraft, type CaptureOptions } from '../lib/app-shell-context'
import { useForcedNavCollapse } from '../lib/nav-collapse'
import { recordRecentDocument } from '../lib/recent-documents'
import { useUnsaved } from '../lib/unsaved'
import { useIsDesktop, useTitleBar } from '../platform'
import { NAV_NARROW_QUERY } from '../theme/tokens'

/** 统一工作区导航与主区共用这一层，切换页面时导航不会重挂载。 */

export interface AppSearch {
  /** all / folder:<path> / tag:<name>（来源、收件箱与归档都不再是浏览维度） */
  scope: string
  id?: string
}

/**
 * 侧边栏折叠偏好的持久化。
 *
 * 用 `localStorage` 而不是 cookie / 服务端：它是**纯客户端的一次性渲染偏好**，
 * 服务端不关心，也没必要为它多一次请求。
 *
 * 读取时用 try/catch 包住：`localStorage` 在隐私模式或存储被禁用时会**抛错**
 * 而不是返回 null，不兜住的话整个应用壳都渲染不出来——一个偏好不该有这种能力。
 */
const NAV_COLLAPSED_KEY = 'mimir.nav-collapsed'

function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeNavCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // 写不进去只影响「下次打开还记不记得」，不该影响这次点击
  }
}

export const Route = createFileRoute('/_app')({
  validateSearch: (search: Record<string, unknown>): AppSearch => ({
    // scope 用一个字符串编码筛选条件：全集 / 目录 / 标签互斥
    scope: typeof search.scope === 'string' && search.scope ? search.scope : 'all',
    ...(typeof search.id === 'string' && search.id ? { id: search.id } : {}),
  }),
  component: AppShell,
})

const useStyles = createStyles(({ css, token }) => ({
  shell: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  `,
  app: css`
    display: grid;
    grid-template-columns: 256px minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media ${NAV_NARROW_QUERY} {
      grid-template-columns: 52px minmax(0, 1fr);
    }
  `,
  appCollapsed: css`
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};
  `,
  nav: css`
    min-width: 0;
    min-height: 0;
    overflow: visible;
    position: relative;
    z-index: 30;
  `,
  main: css`
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgContainer};
  `,
}))

function AppShell() {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()
  const { message } = AntApp.useApp()
  const { runGuarded, pending: pendingLeave, saving } = useUnsaved()
  const search = useSearch({ from: '/_app' })
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })
  const userId = sessionQuery.data?.user.id

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [creatingNote, setCreatingNote] = useState(false)
  const [createNoteError, setCreateNoteError] = useState<string | null>(null)
  const [createNoteRetryable, setCreateNoteRetryable] = useState(true)
  const creatingNoteRef = useRef(false)
  const paletteGuardRef = useRef(false)

  useEffect(() => {
    if (!pendingLeave) paletteGuardRef.current = false
  }, [pendingLeave])

  const openPalette = () => {
    if (creatingNoteRef.current || paletteGuardRef.current || pendingLeave || saving) return
    setCreateNoteError(null)
    setPaletteOpen(true)
  }
  const closePalette = () => {
    if (creatingNoteRef.current || paletteGuardRef.current || pendingLeave || saving) return
    setPaletteOpen(false)
  }
  const runPaletteGuarded = (action: () => void) => {
    if (creatingNoteRef.current || paletteGuardRef.current || pendingLeave || saving) return
    // Cover repeated commands before React publishes the pending confirmation.
    paletteGuardRef.current = true
    runGuarded(() => {
      paletteGuardRef.current = false
      action()
    })
  }
  const [captureOpen, setCaptureOpen] = useState(false)
  const captureOpenRef = useRef(false)
  const uploadBatchRef = useRef(false)
  const captureNonce = useRef(0)
  const [captureHandoff, setCaptureHandoff] = useState(false)
  const claimUploadBatch = (fromDialog = false) => {
    if (uploadBatchRef.current || (!fromDialog && captureOpenRef.current)) return false
    uploadBatchRef.current = true
    return true
  }
  const releaseUploadBatch = () => {
    uploadBatchRef.current = false
  }
  const captureTriggerRef = useRef<HTMLElement | null>(null)
  const restoreCaptureFocusRef = useRef(false)
  /**
   * 这次打开收集对话框的预置项 + 序号。
   *
   * **序号是必须的**：`initialTab` 之类的初始值只在挂载时读一次，而对话框
   * 实例常驻应用壳——上次从「上传文件」打开过、这次想从「网页抓取」打开，
   * 不换 key 的话组件不会重新初始化，用户会看到上一次的页签。
   */
  const [captureRequest, setCaptureRequest] = useState<(CaptureOptions & { nonce: number }) | null>(
    null,
  )

  const openCapture = (options?: CaptureOptions) => {
    if (captureOpenRef.current || uploadBatchRef.current || pendingLeave || saving) return
    captureOpenRef.current = true
    setCaptureHandoff(false)
    captureTriggerRef.current = document.activeElement as HTMLElement | null
    restoreCaptureFocusRef.current = false
    setCaptureRequest({ ...options, nonce: ++captureNonce.current })
    setCaptureOpen(true)
  }
  const closeCapture = () => {
    if (uploadBatchRef.current) return
    captureOpenRef.current = false
    setCaptureHandoff(false)
    restoreCaptureFocusRef.current = true
    setCaptureOpen(false)
  }
  const afterCaptureClose = () => {
    if (!restoreCaptureFocusRef.current) return
    restoreCaptureFocusRef.current = false
    const libraryTrigger = captureRequest?.tab
      ? document.querySelector<HTMLElement>('[data-capture-trigger]')
      : null
    if (libraryTrigger?.getClientRects().length) {
      libraryTrigger.focus()
      return
    }
    const trigger = captureTriggerRef.current
    if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus()
    else {
      document.querySelector<HTMLElement>('[data-capture-trigger], [aria-label="收集"]')?.focus()
    }
  }

  /** 「问 AI」带进对话的上下文，见 AskDraft 的说明 */
  const [askDraft, setAskDraft] = useState<AskDraft | null>(null)

  /** 从对话点引用跳去文档后置位，让文档顶部出现「返回对话」 */
  const [cameFromChat, setCameFromChat] = useState(false)
  /** 返回对话时要跳回的会话 id */
  const [lastConversationId, setLastConversationId] = useState<string>()
  /** 被点击的引用：文档打开后据此滚动到原文区间并高亮 */
  const [citation, setCitation] = useState<Citation | null>(null)

  const isChat = location.pathname.startsWith('/chat')
  const isSettings = location.pathname.startsWith('/settings')

  /**
   * 当前所在页。**三值**，不是「chat 或 docs」。
   *
   * 设置页曾经被归并进 'docs'，于是「设置」这一项在侧边栏里永远不高亮——
   * 它的判据是 `scope === 'settings'`，而 scope 的取值范围里根本没有这个值
   * （它来自 URL 的 scope 参数）。表现是点进设置后侧边栏没有任何位置反馈。
   */
  const page: 'docs' | 'chat' | 'settings' = isChat ? 'chat' : isSettings ? 'settings' : 'docs'

  /**
   * 侧边栏折叠。
   *
   * **状态放在这里而不是 `NavSidebar` 内部**：折叠要改的是外层的
   * `grid-template-columns`（左列 256px → 52px），而网格属于这一层。
   * 放在栏内的话，栏自己收窄了、网格没变，只会留下一片空的 256px。
   *
   * 持久化到 `localStorage`：折叠是**长期偏好**，不是临时动作。
   * 每次刷新都弹回去会让人反复去点它——而这个按钮的价值就在于点一次
   * 之后不用再管。用惰性初始化读取，只在挂载时读一次。
   */
  const [navCollapsedPref, setNavCollapsedPref] = useState(() => readNavCollapsed())
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [newNoteFocusId, setNewNoteFocusId] = useState<string | null>(null)

  /**
   * 窄屏（≤880px）下**强制折叠**，与用户偏好取或。
   *
   * 关键在于它不只是改网格宽度（那是 `@media` 已经在做的），而是让
   * `NavSidebar` **真的按折叠态渲染**。原先两者脱节：CSS 把左列压到 52px，
   * 而栏内的标签、目录树、品牌名仍按展开态渲染——实测窄屏下「知识库」
   * 竖成一列、品牌名与折叠开关叠在一起、目录树歪掉。
   *
   * 偏好不被覆盖（`navCollapsedPref` 原样保留）：窗口变宽后回到用户选的形态。
   * 窄屏下开关打开临时导航抽屉，关闭后回到紧凑栏；不回写长期偏好。
   */
  const narrowViewport = useForcedNavCollapse()
  const navCollapsed = navCollapsedPref || narrowViewport

  const isDesktop = useIsDesktop()

  const toggleNavCollapsed = () => {
    setNavCollapsedPref((collapsed) => {
      const next = !collapsed
      writeNavCollapsed(next)
      return next
    })
  }

  /**
   * 标题栏（桌面端自绘，浏览器里是 null）。
   *
   * **在组件顶部取值**，不在 JSX 里调：hook 不能出现在回调或条件里。
   */
  const titleBar = useTitleBar({
    collapsed: navCollapsed,
    showToggle: !narrowViewport,
    onToggleCollapsed: toggleNavCollapsed,
  })

  const gridClass = navCollapsed ? styles.appCollapsed : styles.app

  const currentScope = search.scope
  const openDocument = (id: string, scope = currentScope) => {
    setCameFromChat(false)
    void navigate({ to: '/docs', search: { scope, id } })
  }

  useEffect(() => {
    if (page === 'docs' && search.id && userId) recordRecentDocument(userId, search.id)
  }, [page, search.id, userId])

  const openCitation = (documentId: string, cited: Citation) => {
    setLastConversationId(search.id)
    setCameFromChat(true)
    setCitation(cited)
    void navigate({ to: '/docs', search: { scope: 'all', id: documentId } })
  }

  const openSearchHit = (hit: SearchHit) => {
    setCameFromChat(false)
    setCitation({
      documentId: hit.documentId,
      kind: hit.kind,
      title: hit.title,
      snippet: hit.snippet.text,
      start: hit.snippet.start,
      end: hit.snippet.end,
      matchedBy: hit.matchedBy,
    })
    void navigate({ to: '/docs', search: { scope: 'all', id: hit.documentId } })
  }

  const createNote = () => {
    runPaletteGuarded(() => {
      if (creatingNoteRef.current) return
      creatingNoteRef.current = true
      setCreatingNote(true)
      setCreateNoteError(null)
      void (async () => {
        try {
          const created = await api.documents.createNote({
            title: '未命名笔记',
            body: '',
            tags: [],
          })
          setPaletteOpen(false)
          message.success('已新建笔记')
          void queryClient.invalidateQueries({ queryKey: ['documents'] })
          void queryClient.invalidateQueries({ queryKey: ['folders'] })
          void queryClient.invalidateQueries({ queryKey: ['counts'] })
          setNewNoteFocusId(created.id)
          openDocument(created.id, 'all')
        } catch (error) {
          setCreateNoteRetryable(error instanceof ApiRequestError && error.status < 500)
          setCreateNoteError(
            error instanceof ApiRequestError && error.status < 500
              ? `新建笔记失败：${error.message}`
              : '未能确认笔记是否创建成功，请先检查知识库，再决定是否重试。',
          )
        } finally {
          creatingNoteRef.current = false
          setCreatingNote(false)
        }
      })()
    })
  }

  /**
   * Ctrl K 打开命令面板。
   *
   * 绑在 window 而不是某个元素上：这个快捷键在任何位置都该生效
   * （包括焦点在编辑器里时）。preventDefault 是必须的——浏览器默认的
   * Ctrl K 会聚焦地址栏或搜索框。
   */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return
      event.preventDefault()
      if (
        event.repeat ||
        creatingNoteRef.current ||
        paletteGuardRef.current ||
        pendingLeave ||
        saving
      )
        return
      setCreateNoteError(null)
      setPaletteOpen((open) => !open)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pendingLeave, saving])

  return (
    <AppShellContext.Provider
      value={{
        askDraft,
        setAskDraft,
        citation,
        clearHighlight: () => setCitation(null),
        openDocument,
        openCapture,
        claimUploadBatch,
        releaseUploadBatch,
        openCitation,
        cameFromChat,
        newNoteFocusId,
        requestNewNoteFocus: setNewNoteFocusId,
        backToChat: () =>
          void navigate({ to: '/chat', search: { scope: search.scope, id: lastConversationId } }),
      }}
    >
      <div className={styles.shell}>
        {/*
        标题栏（D-103）：桌面端是自绘窗口控件，浏览器里是 null
        （浏览器有自己的标签栏，自绘是重复）。
      */}
        {titleBar}

        <div className={gridClass}>
          <div className={styles.nav}>
            <NavSidebar
              selection={{
                page,
                scope: search.scope,
                ...(search.id ? { id: search.id } : {}),
              }}
              onOpenPalette={openPalette}
              onOpenCapture={() => openCapture()}
              collapsed={navCollapsed}
              overlayOpen={overlayOpen && narrowViewport}
              narrowViewport={narrowViewport}
              onToggleOverlay={() => setOverlayOpen((open) => !open)}
              onCloseOverlay={() => setOverlayOpen(false)}
              /* 桌面端那一行由窗口标题栏承担（D-094 / D-103）——两条并排是重复，
               且合并后垂直空间净增为零 */
              hideTopBar={isDesktop}
              onToggleCollapsed={toggleNavCollapsed}
              userId={userId}
              onOpenDocument={openDocument}
            />
          </div>

          <div className={styles.main} inert={overlayOpen && narrowViewport}>
            <Outlet />
          </div>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        creatingNote={creatingNote}
        createNoteError={createNoteError}
        createNoteRetryable={createNoteRetryable}
        interactionSuspended={Boolean(pendingLeave) || saving}
        onOpenCapture={() => {
          if (creatingNoteRef.current || paletteGuardRef.current || pendingLeave || saving) return
          setPaletteOpen(false)
          openCapture()
        }}
        onOpenSearchHit={(hit) => {
          runPaletteGuarded(() => {
            setPaletteOpen(false)
            openSearchHit(hit)
          })
        }}
        userId={userId}
        currentDocumentId={page === 'docs' ? search.id : undefined}
        onOpenRecent={(id, scope) => {
          runPaletteGuarded(() => {
            setPaletteOpen(false)
            openDocument(id, scope)
          })
        }}
        onCurrentCommand={(command) => {
          if (
            !search.id ||
            page !== 'docs' ||
            pendingLeave ||
            saving ||
            paletteGuardRef.current ||
            creatingNoteRef.current
          )
            return
          setPaletteOpen(false)
          window.dispatchEvent(
            new CustomEvent('mimir:document-command', {
              detail: { command, documentId: search.id },
            }),
          )
        }}
        onReturnToLibrary={() => {
          runPaletteGuarded(() => {
            setPaletteOpen(false)
            void navigate({ to: '/docs', search: { scope: search.scope } })
          })
        }}
        onAsk={(question) => {
          runPaletteGuarded(() => {
            setPaletteOpen(false)
            setAskDraft({ text: question })
            void navigate({ to: '/chat', search: { scope: search.scope } })
          })
        }}
        onNewNote={createNote}
      />

      <CaptureDialog
        /* key 按次换：initialTab / folder / directory 都只在挂载时读一次 */
        key={captureRequest?.nonce ?? 'capture'}
        open={captureOpen}
        initialTab={captureRequest?.tab}
        directory={captureRequest?.directory}
        folder={captureRequest?.folder ?? null}
        onClose={closeCapture}
        onAfterClose={afterCaptureClose}
        interactionSuspended={captureHandoff && Boolean(pendingLeave)}
        onCaptured={(documentId) => {
          if (!captureOpenRef.current) return
          setCaptureHandoff(true)
          runGuarded(() => {
            captureOpenRef.current = false
            restoreCaptureFocusRef.current = false
            setCaptureOpen(false)
            setCaptureHandoff(false)
            message.success('收集结果已就绪')
            openDocument(
              documentId,
              captureRequest?.folder ? `folder:${captureRequest.folder}` : 'all',
            )
          })
        }}
      />

      <UnsavedGuard
        documentTitle={queryClient.getQueryData<DocumentDetail>(['document', search.id])?.title}
        captureContext={
          captureHandoff && captureOpen
            ? {
                description: '打开刚收集的文档前，请先处理当前改动。',
                onContinue: () => setCaptureHandoff(false),
                documentTitle: queryClient.getQueryData<DocumentDetail>(['document', search.id])
                  ?.title,
                resultHint: '本批导入结果会保留，不需要重新上传。',
              }
            : undefined
        }
      />
    </AppShellContext.Provider>
  )
}
