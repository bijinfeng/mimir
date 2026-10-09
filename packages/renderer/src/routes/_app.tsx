import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import type { Citation } from '@mimir/shared'
import { App as AntApp } from 'antd'
import { createStyles } from 'antd-style'
import { useEffect, useState } from 'react'
import { CaptureDialog } from '../components/CaptureDialog'
import { CommandPalette } from '../components/CommandPalette'
import { NavSidebar } from '../components/NavSidebar'
import { UnsavedGuard } from '../components/UnsavedGuard'
import { api } from '../lib/api'
import { AppShellContext, type AskDraft, type CaptureOptions } from '../lib/app-shell-context'
import { useForcedNavCollapse } from '../lib/nav-collapse'
import { useIsDesktop, useTitleBar } from '../platform'
import { NAV_NARROW_QUERY } from '../theme/tokens'

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
  /**
   * 外壳：标题栏（仅桌面端）在上，原来的两栏网格在下面。
   *
   * **用 flex 列而不是 `grid-template-rows: auto minmax(0, 1fr)`。**
   * 网格那版踩过一个静默的坑：`TitleBar` 在 Web 端 `return null`
   * （浏览器里没有窗口可控制，整块不渲染），于是网格只剩一个子元素——
   * 它落进 `auto` 那一行，`1fr` 行空置，下面的两栏网格只拿到「内容高」
   * 而不是整幅高度。实测 1440×900：知识库页 398px、对话页 302px、
   * 设置页 740px，下方全空。Electron 里标题栏渲染了所以看不出来，
   * **Web 部署全站中招**（用户只在浏览器里看，等于整个产品矮了一截）。
   *
   * flex 列对「子项数量」不敏感：标题栏有无都行，剩下的那层用
   * `flex: 1` 吃掉剩余高度——`min-height: 0` 仍然要写，见下面 `app`。
   */
  shell: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  `,

  app: css`
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    /* 吃掉标题栏之下的全部剩余高度。外层现在是 flex 列（见 shell 那一段）：
       这一层不写 height: 100% ——那是对着「父容器只有自己」的静态写法，
       而这里的父容器还装着标题栏，写死就会多出 44px 的溢出。
       注意这段是 CSS 模板串里的注释，**不能出现反引号**（会终止字符串，
       check-style-backticks 守着） */
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media (max-width: 1100px) {
      grid-template-columns: 180px minmax(0, 1fr);
    }

    /* ≤880px：导航强制折叠成图标条，而不是隐藏——隐藏等于断了所有导航。
       这里写死 48px（与折叠态同宽），展开偏好在此宽度下被压过。

       **查询串来自 tokens.ts**，不在这里写字面量：同一个断点还要在
       lib/nav-collapse.ts 里用 matchMedia 问一次（栏内的内容怎么渲染由
       它决定）。两处各写一份的话，改一处漏一处是静默的——网格收窄了而内容
       还是展开态的形状，症状就是栏里那一堆字被挤成一列竖排。 */
    @media ${NAV_NARROW_QUERY} {
      grid-template-columns: 48px minmax(0, 1fr);
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
    flex: 1;
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
    setCaptureRequest({ ...options, nonce: Date.now() })
    setCaptureOpen(true)
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
   * `grid-template-columns`（左列 200px → 48px），而网格属于这一层。
   * 放在栏内的话，栏自己收窄了、网格没变，只会留下一片空的 200px。
   *
   * 持久化到 `localStorage`：折叠是**长期偏好**，不是临时动作。
   * 每次刷新都弹回去会让人反复去点它——而这个按钮的价值就在于点一次
   * 之后不用再管。用惰性初始化读取，只在挂载时读一次。
   */
  const [navCollapsedPref, setNavCollapsedPref] = useState(() => readNavCollapsed())

  /**
   * 窄屏（≤880px）下**强制折叠**，与用户偏好取或。
   *
   * 关键在于它不只是改网格宽度（那是 `@media` 已经在做的），而是让
   * `NavSidebar` **真的按折叠态渲染**。原先两者脱节：CSS 把左列压到 48px，
   * 而栏内的标签、目录树、品牌名仍按展开态渲染——实测窄屏下「知识库」
   * 竖成一列、品牌名与折叠开关叠在一起、目录树歪掉。
   *
   * 偏好不被覆盖（`navCollapsedPref` 原样保留）：窗口变宽后回到用户选的形态。
   * 窄屏下那个开关也一并收起——这个宽度下折叠不是可选状态，点了也不会展开，
   * 留着它只会让人以为按钮坏了。
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

  const openDocument = (id: string, scope = search.scope) => {
    setCameFromChat(false)
    void navigate({ to: '/docs', search: { scope, id } })
  }

  const openCitation = (documentId: string, cited: Citation) => {
    setLastConversationId(search.id)
    setCameFromChat(true)
    setCitation(cited)
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
        citation,
        clearHighlight: () => setCitation(null),
        openDocument,
        openCapture,
        openCitation,
        cameFromChat,
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
              onOpenPalette={() => setPaletteOpen(true)}
              collapsed={navCollapsed}
              /* 窄屏下折叠是**视口强制的**，开关跟着收起来：这个宽度里它点了
               也不会展开（`@media` 与它无关地压着左列宽度），留着只会让人
               以为按钮坏了 */
              showToggle={!narrowViewport}
              /* 桌面端那一行由窗口标题栏承担（D-094 / D-103）——两条并排是重复，
               且合并后垂直空间净增为零 */
              hideTopBar={isDesktop}
              onToggleCollapsed={toggleNavCollapsed}
            />
          </div>

          <div className={styles.main}>
            <Outlet />
          </div>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenCapture={() => {
          setPaletteOpen(false)
          openCapture()
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
        /* key 按次换：initialTab / folder / directory 都只在挂载时读一次 */
        key={captureRequest?.nonce ?? 'capture'}
        open={captureOpen}
        initialTab={captureRequest?.tab}
        directory={captureRequest?.directory}
        folder={captureRequest?.folder ?? null}
        onClose={() => setCaptureOpen(false)}
        onCaptured={(documentId) => {
          setCaptureOpen(false)
          /* 收件箱视图已随 D-054 退役（`docs/DECISIONS.md`:3022，新内容默认
             `ready`）——这里再说「已入收件箱」等于指认一个不存在的去处。
             与 CaptureDialog 页脚同一句话：入库之后按标签与目录整理。 */
          message.success('已入库，之后按标签与目录整理')
          /* 从知识库页收进来的内容指回那个知识库（「返回库」回得到原地）；
             从别处唤起的落库根，回库默认视图 */
          openDocument(
            documentId,
            captureRequest?.folder ? `folder:${captureRequest.folder}` : 'all',
          )
        }}
      />

      <UnsavedGuard />
    </AppShellContext.Provider>
  )
}
