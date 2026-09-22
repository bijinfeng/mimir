import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { ChatPanel } from '@/components/ChatPanel'
import { api } from '@/lib/api'
import { useAppShell } from '@/lib/app-shell-context'

/**
 * 对话模式（右栏）。
 *
 * 会话 id 走 URL（`?id=`），这样刷新、从会话历史点进来都能接上——
 * 会话优先的导航（`docs/PRD.md` §5.2）要求会话是可寻址的，
 * 只放组件状态里的话，刷新一次当前对话就没了。
 *
 * ## 为什么需要 `ownedId`
 *
 * 新对话的第一问会先建会话、再把真实 id 写进 URL。如果对话体的 key 直接
 * 跟着 URL 的 id 走，这一次导航就会**把刚挂载的对话体卸载重建**——
 * 于是流式收到的检索过程、引用、失败状态全部丢掉，界面回到骨架屏。
 * 实测症状是：提问后右栏什么都不显示，而消息其实已经落库了。
 *
 * 所以这里区分两种 id 变化：
 *  - **我们刚创建的**（`ownedId`）：不重挂载，保持流式状态
 *  - **从导航/历史点进来的另一个会话**：重挂载，重新灌入历史消息
 */
export const Route = createFileRoute('/_app/chat')({
  /**
   * search 与 `_app` 同形状。
   *
   * 必须显式声明：TanStack Router 的 search 以父路由为基准合并，
   * 子路由不声明时 `navigate({ to: '/chat', search: {...} })` 会因为
   * 父级有必填字段而报类型错。
   */
  validateSearch: (search: Record<string, unknown>) => ({
    scope: typeof search.scope === 'string' && search.scope ? search.scope : 'inbox',
    ...(typeof search.kind === 'string' ? { kind: search.kind } : {}),
    ...(typeof search.id === 'string' ? { id: search.id } : {}),
  }),
  component: ChatRoute,
})

function ChatRoute() {
  const { askDraft, setAskDraft, openCitation } = useAppShell()
  const navigate = useNavigate()
  const search = useSearch({ from: '/_app/chat' })

  /**
   * 这个面板自己创建出来的会话 id。
   *
   * 它变了说明「是我们在对话中途建的会话」，此时**不能**重挂载——
   * 那会把正在接收的流丢掉。而 URL 里出现一个不是它的 id，
   * 说明用户从导航点了别的会话，那时才该重挂载。
   */
  const [ownedId, setOwnedId] = useState<string | null>(null)

  const isOwned = Boolean(search.id) && search.id === ownedId
  // key 固定为 'new' 的情况有两种：真·新对话，以及我们自己刚创建的那个
  const panelKey = search.id && !isOwned ? search.id : 'new'

  const conversationQuery = useQuery({
    queryKey: ['conversation', search.id],
    queryFn: () => api.conversations.get(search.id!),
    // 自己创建的会话不需要在这里取：消息是流式来的，本地就是最新的
    enabled: Boolean(search.id) && !isOwned,
  })

  // 新对话没有历史要等；查阅已有会话时要等查询回来（失败也放行，
  // 否则右栏会永远卡在骨架上，用户看不到任何提示）
  const messagesLoading = Boolean(search.id) && !isOwned && conversationQuery.isPending

  return (
    <ChatPanel
      key={panelKey}
      conversationId={search.id}
      draft={askDraft}
      initialMessages={conversationQuery.data?.messages}
      messagesLoading={messagesLoading}
      onOpenCitation={(documentId, citation) => openCitation(documentId, citation)}
      // 中栏的「本次引用」用的就是它（docs/PRD.md §5.2）
      onConversationCreated={(conversationId) => {
        // 记下这是我们自己建的：URL 变化不触发重挂载，流式状态得以保留
        setOwnedId(conversationId)
        setAskDraft(null)
        void navigate({ to: '/chat', search: { scope: search.scope, id: conversationId } })
      }}
    />
  )
}
