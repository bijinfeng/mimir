import { ChatPanel } from '@mimir/chat'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { ChatThemeBridge } from '../components/chat/ChatThemeBridge'
import { LoadError } from '../components/LoadError'
import { api } from '../lib/api'
import { useAppShell } from '../lib/app-shell-context'
import { createChatIo } from '../lib/chat-io'
import { useChatComposerStatus } from '../lib/use-chat-composer-status'

/**
 * 对话模式（右栏）。
 *
 * 会话 id 走 URL（`?id=`），这样刷新、从会话历史点进来都能接上——
 * 会话优先的导航（`.trellis/spec/project/product.md` §5.2）要求会话是可寻址的，
 * 只放组件状态里的话，刷新一次当前对话就没了。
 *
 * 对话体本身在 `@mimir/chat` 里（那边有完整的消息区、检索过程、引用、
 * 失败卡、输入区与流式状态）。这个路由只做**宿主该做的事**：
 * 会话寻址、历史读取失败时那一条明确的错误、以及把动作面（`ChatIo`）
 * 与数据槽接给包。
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
 *
 * 重挂载契约**没有变**：会话 id 与那一批消息在挂载时定下（agent 的
 * threadId、请求里的 forwardedProps），而「自己建的会话不重挂」是保流式的
 * 唯一办法。搬到包里之后这一点由 `panelKey` 继续承担。
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
    scope: typeof search.scope === 'string' && search.scope ? search.scope : 'all',
    ...(typeof search.id === 'string' && search.id ? { id: search.id } : {}),
  }),
  component: ChatRoute,
})

function ChatRoute() {
  const { askDraft, setAskDraft, openCitation, openDocument } = useAppShell()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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

  /**
   * 历史读取的失败**不能放行成空对话**——用户点开一个旧会话，看到的会是
   * 「问点什么」的全新空态，而记录其实还在库里：那比报错更吓人
   * （看起来像对话被清空了）。给一条明确的失败 + 重试。
   *
   * 注意历史**内容**不再由这里取：包的历史适配器自己调
   * `io.loadConversation`（打开会话时引擎出骨架屏，见包内的 ChatThread）。
   * 这里这一次查询只为了「读不到时拦住」——它的键与包读的是同一个
   * （`['conversation', id]`），所以两边共享缓存，不是两次请求。
   */
  const conversationQuery = useQuery({
    queryKey: ['conversation', search.id],
    queryFn: () => api.conversations.get(search.id!),
    enabled: Boolean(search.id) && !isOwned,
  })

  const composerStatus = useChatComposerStatus(search.id)

  /**
   * 动作面（`ChatIo` 的实现）。
   *
   * 每次渲染新建对象是**安全的**：包内只在事件回调里用它，不参与渲染
   * 依赖（`io` 是「动作」不是「数据」）。真正需要稳定的是它背后接的
   * queryClient 与 navigate——那两个来自 hook，本身是稳定的。
   */
  const io = createChatIo({
    invalidate: (keys) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key })
    },
    onConversationCreated: (conversationId) => {
      // 记下这是我们自己建的：URL 变化不触发重挂载，流式状态得以保留
      setOwnedId(conversationId)
      setAskDraft(null)
      void navigate({ to: '/chat', search: { scope: search.scope, id: conversationId } })
    },
    onManageModels: () => {
      /* 显式点名 `models` 而不是靠默认值：那是一个**有名字的目的地**
         （去配模型），而不是「打开设置」。靠默认值会在分区顺序调整时
         悄悄落到别的 tab，而界面上没有任何东西提示这件事发生了 */
      void navigate({ to: '/settings', search: { scope: 'all', section: 'models' } })
    },
  })

  if (conversationQuery.isError) {
    return (
      <ChatThemeBridge>
        <LoadError
          message="会话读取失败"
          detail="记录还在，重试一下就能打开。"
          onRetry={() => void conversationQuery.refetch()}
        />
      </ChatThemeBridge>
    )
  }

  return (
    /* 主题变量挂在面板祖先上（字号八档 + gutter 默认值 40px）。
       挂在别处的话包里的样式会退回回退值——界面能用、字号差半个像素，
       不报错（见 ChatHostVars 的说明） */
    <ChatThemeBridge>
      <ChatPanel
        key={panelKey}
        conversationId={search.id}
        draft={askDraft}
        onOpenCitation={openCitation}
        onOpenNote={(noteId) => openDocument(noteId, 'all')}
        io={io}
        composerStatus={composerStatus}
      />
    </ChatThemeBridge>
  )
}
