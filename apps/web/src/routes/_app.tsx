import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { App as AntApp } from 'antd'
import { createStyles } from 'antd-style'
import { useEffect, useState } from 'react'
import type { Citation } from '@mimir/shared'
import { CaptureDialog } from '@/components/CaptureDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { ListColumn } from '@/components/ListColumn'
import { NavSidebar } from '@/components/NavSidebar'
import { UnsavedGuard } from '@/components/UnsavedGuard'
import { api } from '@/lib/api'
import { AppShellContext, type AskDraft } from '@/lib/app-shell-context'

/**
 * 三栏骨架（pathless layout）。
 *
 * 左导航 / 中列表 / 右内容（`docs/PRD.md` §5.1）。
 * 宽度与断点见 `docs/DESIGN.md` §5.4 / §5.5：200 / 300 / 1fr，窄屏 180 / 260。
 *
 * 做成 **layout 路由**而不是每个页面各渲染一份：切换「对话 / 文档」时
 * 只有右栏换内容，左导航与中栏不重新挂载。否则每次切换都会重拉目录树与标签、
 * 丢掉中栏的滚动位置——那些都是用户能感觉到的抖动。
 */

export interface AppSearch {
  /** inbox / all / note / clip / folder:<path> / tag:<name> */
  scope: string
  kind?: string
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
    // scope 用一个字符串编码筛选条件，而不是拆成三个字段：
    // 它们互斥——「目录」和「标签」不会同时生效
    scope: typeof search.scope === 'string' && search.scope ? search.scope : 'inbox',
    ...(typeof search.kind === 'string' ? { kind: search.kind } : {}),
    ...(typeof search.id === 'string' ? { id: search.id } : {}),
  }),
  beforeLoad: ({ location }) => {
    if (location.pathname === '/') {
      throw redirect({ to: '/docs', search: { scope: 'inbox' } })
    }
  },
  component: AppShell,
})

const useStyles = createStyles(({ css, token }) => ({
  /* 三栏外壳。
   *
   * **那三个 min-height: 0 不是装饰，缺了它整个滚动结构就失效。**
   * grid / flex 里项目的自动最小尺寸是 `min-height: auto`，即「不能小于
   * 内容的高度」。于是中栏那两千像素的列表会把整行撑到两千像素，
   * `height: 100%` 形同虚设——结果是**整页滚动**，而中栏里那个
   * `overflow-y: auto` 永远不触发（它自己已经和内容一样高了）。
   *
   * 症状很迷惑：看着像「列表不能滚动」，实际是高度链断在中间那一层
   * （与 docs/DESIGN.md §7.6 记的 AntApp 断链是同一类问题）。
   *
   * `overflow: hidden` 是配套的：万一某个子元素仍然溢出，让它被裁掉
   * 而不是把页面撑长。
   */
  /* 文档模式：左导航 / 中列表 / 右内容 */
  app: css`
    display: grid;
    grid-template-columns: 200px 300px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media (max-width: 1100px) {
      grid-template-columns: 180px 260px minmax(0, 1fr);
    }
  `,
  /**
   * 两栏模式：**对话与设置都没有中栏**。
   *
   * 两者共用一套布局，因为理由是同一个：**中栏在那两种场景下只能显示
   * 文档列表，而那与用户正在做的事无关**。
   *
   *  - 对话：中栏想显示「本次引用」，但它与回答下方的引用块重复（§5.2）
   *  - 设置：中栏显示文档列表，而用户在改配置，那个列表看起来却像设置的一部分
   *
   * 右栏因此拿到整块剩余宽度。问答是主场景，值得更多横向空间；
   * 设置页的表单也不再被挤在四分之一的宽度里（见 §5.2 与 §5.5）。
   */
  appWide: css`
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
   * 宽度的真相在这里而不在 `NavSidebar` 里——三栏/两栏的差别只影响
   * **后面几列**，第一列两种模式都一样，所以四条规则都要各自声明一次
   * （grid 的 `grid-template-columns` 是一整条声明，没法只覆盖一列）。
   *
   * 48px 的来由：图标 20px + 左右各 14px，与展开态的 200px 是同一套
   * 内边距节奏，折叠时图标落在与展开态文字相同的视觉竖线上。
   *
   * **折叠不跨断点切换**——窄屏（≤1100px）下折叠宽度同样是 48px，
   * 不跟着 180/260 那套走，否则「折叠」在不同屏幕宽度下会折叠出两种宽度。
   */
  appCollapsed: css`
    display: grid;
    grid-template-columns: 48px 300px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media (max-width: 1100px) {
      grid-template-columns: 48px 260px minmax(0, 1fr);
    }
  `,
  appWideCollapsed: css`
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
  list: css`
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

  /** 中栏的搜索词。瞬时状态，不进 URL——搜索不值得进历史 */
  const [query, setQuery] = useState('')

  /** 「问 AI」带进对话的上下文，见 AskDraft 的说明 */
  const [askDraft, setAskDraft] = useState<AskDraft | null>(null)

  /** 被点击的引用：文档打开后据此高亮对应区间 */
  const [highlight, setHighlight] = useState<Citation | null>(null)

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

  /** 只有文档模式有中栏；对话与设置都是两栏（docs/PRD.md §5.2） */
  const hasMiddleColumn = page === 'docs'

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

  const gridClass = hasMiddleColumn
    ? navCollapsed
      ? styles.appCollapsed
      : styles.app
    : navCollapsed
      ? styles.appWideCollapsed
      : styles.appWide

  const openDocument = (id: string, scope = search.scope) => {
    setCameFromChat(false)
    void navigate({ to: '/docs', search: { scope, id } })
  }

  const openCitation = (id: string, citation: Citation) => {
    setLastConversationId(search.id)
    setCameFromChat(true)
    // 记下被点的引用：文档打开后据此高亮那段原文区间。
    // 这是「点击跳回原文位置」的下半句——只跳到文档而不指出位置，
    // 在长文里等于没跳（docs/PRD.md §5.1 的引用卡片承诺）
    setHighlight(citation)
    void navigate({ to: '/docs', search: { scope: 'all', id } })
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
        highlight,
        clearHighlight: () => setHighlight(null),
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

        {/*
          只有文档模式渲染中栏（docs/PRD.md §5.2）。
          用条件渲染而不是「渲染但隐藏」：隐藏的话 ListColumn 仍会跑它那两个
          查询（文档列表 + 检索），而它们的返回值在另两种模式下没人看
        */}
        {hasMiddleColumn && (
          <div className={styles.list}>
            <ListColumn
              scope={search.scope}
              {...(search.kind ? { kind: search.kind } : {})}
              {...(search.id ? { selectedId: search.id } : {})}
              query={query}
              onQueryChange={setQuery}
              onKindChange={(kind) =>
                void navigate({
                  to: '/docs',
                  search: { scope: search.scope, ...(kind ? { kind } : {}) },
                })
              }
              onOpenDocument={(id) => {
                // 纯文档浏览时点开不留「从对话来」的标记——
                // 那会让用户以为自己错过了一段对话
                setCameFromChat(false)
                openDocument(id, 'all')
              }}
            />
          </div>
        )}

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
            openDocument(created.id, 'note')
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
