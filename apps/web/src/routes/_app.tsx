import { useQuery } from '@tanstack/react-query'
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
import type { Citation, ConversationDetail } from '@mimir/shared'
import { CaptureDialog } from '@/components/CaptureDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { ListColumn } from '@/components/ListColumn'
import { NavSidebar } from '@/components/NavSidebar'
import { UnsavedGuard } from '@/components/UnsavedGuard'
import { api } from '@/lib/api'
import { AppShellContext, type AskDraft } from '@/lib/app-shell-context'
import { useUnsaved } from '@/lib/unsaved'

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

/**
 * 引用去重。
 *
 * 同一篇文档在一次对话里被引用多次是正常的（命中了不同分块），
 * 但中栏的「本次引用」要的是**文档列表**，所以按 documentId 合并。
 */
function dedupeCitations(items: Citation[]): Citation[] {
  const byDocument = new Map<string, Citation>()
  for (const citation of items) {
    if (!byDocument.has(citation.documentId)) byDocument.set(citation.documentId, citation)
  }
  return [...byDocument.values()]
}

/**
 * 历史会话的引用补位。
 *
 * 打开一个旧会话时，实时流早已结束（没有 liveCitations），此时中栏的
 * 「本次引用」要来自落库的记录。用消息里的 citations 而不是 refs 表的 id
 * 列表——refs 只有 id，而引用卡要显示标题与片段。
 *
 * 只补实时列表里没有的，所以对话进行中不会被它覆盖。
 */
function persistedCitations(conversation: ConversationDetail | undefined): Citation[] {
  if (!conversation) return []
  return conversation.messages.flatMap((item) => item.citations)
}

function AppShell() {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = AntApp.useApp()
  const { runGuarded } = useUnsaved()
  const search = useSearch({ from: '/_app' })

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)

  /** 中栏的搜索词。瞬时状态，不进 URL——搜索不值得进历史 */
  const [query, setQuery] = useState('')

  /** 「问 AI」带进对话的上下文，见 AskDraft 的说明 */
  const [askDraft, setAskDraft] = useState<AskDraft | null>(null)

  /**
   * 对话进行中的实时引用。由右栏回传——只有它知道刚发出去、还没落库的那一轮
   * 引用了什么（`docs/PRD.md` §5.2 要求中栏显示的就是「它读了什么」）。
   */
  const [liveCitations, setLiveCitations] = useState<Citation[]>([])

  /** 被点击的引用：文档打开后据此高亮对应区间 */
  const [highlight, setHighlight] = useState<Citation | null>(null)

  /** 从对话点引用跳去文档后置位，让文档顶部出现「返回对话」 */
  const [cameFromChat, setCameFromChat] = useState(false)
  /** 返回对话时要跳回的会话 id */
  const [lastConversationId, setLastConversationId] = useState<string>()

  const isChat = location.pathname.startsWith('/chat')
  const mode: 'docs' | 'chat' = isChat ? 'chat' : 'docs'

  /**
   * 会话的引用列表。
   *
   * 两个来源合起来：
   *  - 实时：右栏对流式回答收到的 citations（含刚发出去、还没落库的那一轮）
   *  - 落库：打开历史会话时，从 conversationRefs 读到的文档 id
   *
   * 之所以需要后者：历史会话的 messages.citations 是嵌套的 jsonb，
   * 而中栏只需要「读过哪些文档」。单独一张 conversation_refs 表让这件事
   * 变成一次连接而不是解 JSON（见 db/schema.ts 里该表的注释）。
   */
  const conversationQuery = useQuery({
    queryKey: ['conversation', search.id],
    queryFn: () => api.conversations.get(search.id!),
    // 只在对话模式且有 id 时请求。文档模式下多拉一次会话是白花的查询
    enabled: isChat && Boolean(search.id),
  })

  const citations = dedupeCitations([
    // 实时引用优先：它们带完整的片段信息（历史 refs 只有 id）
    ...liveCitations,
    ...persistedCitations(conversationQuery.data),
  ])

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
        citations,
        setCitations: setLiveCitations,
        conversationLoading: Boolean(search.id) && conversationQuery.isLoading,
        highlight,
        clearHighlight: () => setHighlight(null),
        openDocument,
        openCitation,
        cameFromChat,
        backToChat: () =>
          void navigate({ to: '/chat', search: { scope: search.scope, id: lastConversationId } }),
      }}
    >
      <div className={styles.app}>
        <div className={styles.nav}>
          <NavSidebar
            selection={{ mode, scope: search.scope, ...(search.id ? { id: search.id } : {}) }}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenCapture={() => setCaptureOpen(true)}
          />
        </div>

        <div className={styles.list}>
          <ListColumn
            mode={mode}
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
            citations={citations}
            isNewConversation={!search.id}
            onModeChange={(next) => {
              if (next === 'chat') void navigate({ to: '/chat', search: { scope: search.scope } })
              else runGuarded(() => void navigate({ to: '/docs', search: { scope: search.scope } }))
            }}
            onOpenDocument={(id) => openDocument(id, 'all')}
            onStartFromDocument={(id) => {
              // 「新对话」的中栏引导：带着这篇的上下文开始问（PRD §5.10）
              setAskDraft({ text: '', documentId: id })
              void navigate({ to: '/chat', search: { scope: search.scope } })
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
