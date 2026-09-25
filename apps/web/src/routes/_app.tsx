import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { App as AntApp } from 'antd'
import { createStyles } from 'antd-style'
import { useEffect, useState } from 'react'
import { CaptureDialog } from '@/components/CaptureDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { NavSidebar } from '@/components/NavSidebar'
import { UnsavedGuard } from '@/components/UnsavedGuard'
import { api } from '@/lib/api'
import { AppShellContext, type AskDraft } from '@/lib/app-shell-context'

/**
 * 两栏骨架（pathless layout，D-047）。
 *
 * 左导航 / 主区。主区的内容由子路由决定：文档模式在库（浏览）与详情
 * （阅读）两态间切换（由 URL 的 `id` 有无驱动），对话与设置是整块内容。
 * 宽度与断点见 `docs/DESIGN.md` §5.4 / §5.5：200 / 1fr，窄屏 180，折叠 48。
 *
 * 做成 **layout 路由**而不是每个页面各渲染一份：切换「对话 / 文档」时
 * 只有主区换内容，左导航不重新挂载。否则每次切换都会重拉目录树与标签、
 * 丢掉导航的滚动位置——那些都是用户能感觉到的抖动。
 */

export interface AppSearch {
  /** inbox / all / folder:<path> / tag:<name>（来源不再是浏览维度，D-047） */
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
    // scope 用一个字符串编码筛选条件：收件箱 / 全部 / 目录 / 标签互斥
    scope: typeof search.scope === 'string' && search.scope ? search.scope : 'inbox',
    ...(typeof search.id === 'string' && search.id ? { id: search.id } : {}),
  }),
  component: AppShell,
})

const useStyles = createStyles(({ css, token }) => ({
  /* 两栏外壳。
   *
   * **那两个 min-height: 0 不是装饰，缺了它整个滚动结构就失效。**
   * grid / flex 里项目的自动最小尺寸是 `min-height: auto`，即「不能小于
   * 内容的高度」。于是主区那两千像素的内容会把整行撑到两千像素，
   * `height: 100%` 形同虚设——结果是**整页滚动**，而主区里那个
   * `overflow-y: auto` 永远不触发（它自己已经和内容一样高了）。
   *
   * 症状很迷惑：看着像「内容不能滚动」，实际是高度链断在中间那一层
   * （与 docs/DESIGN.md §7.6 记的 AntApp 断链是同一类问题）。
   *
   * `overflow: hidden` 是配套的：万一某个子元素仍然溢出，让它被裁掉
   * 而不是把页面撑长。
   */
  app: css`
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media (max-width: 1100px) {
      grid-template-columns: 180px minmax(0, 1fr);
    }
  `,
  /**
   * 侧边栏折叠：左列收成 48px 的图标条。
   *
   * 宽度的真相在这里而不在 `NavSidebar` 里——折叠要改的是
   * `grid-template-columns`（左列 200px → 48px），而网格属于这一层。
   * 放在栏内的话，栏自己收窄了、网格没变，只会留下一片空的 200px。
   *
   * 48px 的来由：图标 20px + 左右各 14px，与展开态的 200px 是同一套
   * 内边距节奏，折叠时图标落在与展开态文字相同的视觉竖线上。
   *
   * **折叠不跨断点切换**——窄屏（≤1100px）下折叠宽度同样是 48px，
   * 不跟着 180 那套走，否则「折叠」在不同屏幕宽度下会折叠出两种宽度。
   */
  appCollapsed: css`
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};
  `,
  nav: css`
    min-width: 0;
    min-height: 0;
    overflow: hidden;
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
  const location = useLocation()
  const { message } = AntApp.useApp()
  const search = useSearch({ from: '/_app' })

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)

  /** 「问 AI」带进对话的上下文，见 AskDraft 的说明 */
  const [askDraft, setAskDraft] = useState<AskDraft | null>(null)

  /** 从对话点引用跳去文档后置位，让文档顶部出现「返回对话」 */
  const [cameFromChat, setCameFromChat] = useState(false)
  /** 返回对话时要跳回的会话 id */
  const [lastConversationId, setLastConversationId] = useState<string>()

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
   * `grid-template-columns`（左列 200px → 48px），而网格属于这一层。
   * 放在栏内的话，栏自己收窄了、网格没变，只会留下一片空的 200px。
   *
   * 持久化到 `localStorage`：折叠是**长期偏好**，不是临时动作。
   * 每次刷新都弹回去会让人反复去点它——而这个按钮的价值就在于点一次
   * 之后不用再管。用惰性初始化读取，只在挂载时读一次。
   */
  const [navCollapsed, setNavCollapsed] = useState(() => readNavCollapsed())

  const gridClass = navCollapsed ? styles.appCollapsed : styles.app

  const openDocument = (id: string, scope = search.scope) => {
    setCameFromChat(false)
    void navigate({ to: '/docs', search: { scope, id } })
  }

  const openCitation = (documentId: string) => {
    setLastConversationId(search.id)
    setCameFromChat(true)
    void navigate({ to: '/docs', search: { scope: 'all', id: documentId } })
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <AppShellContext.Provider
      value={{
        askDraft,
        setAskDraft,
        openDocument,
        openCitation,
        cameFromChat,
        backToChat: () =>
          void navigate({ to: '/chat', search: { scope: search.scope, id: lastConversationId } }),
      }}
    >
      <div className={gridClass}>
        <div className={styles.nav}>
          <NavSidebar
            selection={{
              page,
              scope: search.scope,
              ...(search.id ? { id: search.id } : {}),
            }}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenCapture={() => setCaptureOpen(true)}
            collapsed={navCollapsed}
            onToggleCollapsed={() => {
              setNavCollapsed((collapsed) => {
                const next = !collapsed
                writeNavCollapsed(next)
                return next
              })
            }}
          />
        </div>

        <div className={styles.main}>
          <Outlet />
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenCapture={() => {
          setPaletteOpen(false)
          setCaptureOpen(true)
        }}
        onOpenDocument={(id) => {
          setPaletteOpen(false)
          openDocument(id, 'all')
        }}
        onAsk={(question) => {
          setPaletteOpen(false)
          setAskDraft({ text: question })
          void navigate({ to: '/chat', search: { scope: search.scope } })
        }}
        onNewNote={async () => {
          setPaletteOpen(false)
          try {
            const created = await api.documents.createNote({
              title: '未命名笔记',
              body: '',
              tags: [],
            })
            message.success('已新建笔记')
            openDocument(created.id, 'all')
          } catch {
            message.error('新建笔记失败')
          }
        }}
      />

      <CaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCaptured={(documentId) => {
          setCaptureOpen(false)
          message.success('已入收件箱，记得之后整理')
          openDocument(documentId, 'inbox')
        }}
      />

      <UnsavedGuard />
    </AppShellContext.Provider>
  )
}
