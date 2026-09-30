import type { Citation, FailureKind, Message, Trace } from '@mimir/shared'
import { EVENT_CITATIONS, EVENT_CONVERSATION, EVENT_FAILURE, EVENT_TRACE } from '@mimir/shared'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useMimirChatEvents } from '@/lib/use-mimir-chat-events'

/**
 * 对话的流式状态。
 *
 * **不手搓消息状态。** `useChat` 负责流式接收、消息累积、加载态、停止、
 * 重试与并发排队。这一层只做四件 SDK 不该知道的事：
 *
 *  1. 把服务端推来自定义事件收进 state（检索过程、引用、新会话 id）
 *  2. 会话 id 的维护——新建会话时先建再发
 *  3. 回答结束后让 TanStack Query 里的会话与文档列表失效
 *  4. 把中栏要用的引用回传给外层
 *
 * ## 两个参数通道
 *
 *  - **问题文本**不单独传：它就是 messages 里的最后一条用户消息，
 *    服务端从那里取
 *  - **会话 id / 范围 / 深度思考**走 `sendMessage(text, { body })`，
 *    它们被合并进 AG-UI 的 `forwardedProps`
 *
 * 会话 id **不进 URL** 是刻意的：地址一旦跟着会话变化，`useChat` 就会
 * 重建 ChatClient，把正在进行的流切断。代价是新会话时客户端不知道 id，
 * 所以服务端用 `mimir.conversation` 事件回传。
 */

export interface UseMimirChatOptions {
  /** 会话 id。为空表示新对话——第一次发送时会建一个 */
  conversationId: string | undefined
  /**
   * 已落库的历史消息。
   *
   * 打开旧会话时必须是**加载完成后**才传进来：`useChat` 只在挂载那一刻
   * 读 initialMessages（它内部把客户端建在 `useMemo(..., [])` 里），
   * 之后传的变化不会生效。所以调用方要用 key 保证「数据到位后才挂载」——
   * 见 ChatPanel 里对 ChatPanelBody 的 key。
   */
  initialMessages?: Message[] | undefined
  /** 锁定的文档范围（从工具条「问 AI」或内联「就这段提问」进来） */
  documentId?: string | undefined
  /** 新会话建出来后通知外层换 URL */
  onConversationCreated: (conversationId: string) => void
}

/**
 * 把落库的 Message 转成 useChat 认的 UIMessage 形状。
 *
 * 只映射协议认识的字段：role 与 text parts。trace / citations 不进来——
 * 它们是 mimir 的业务数据，由 shell 从中栏那条路径渲染（PRD §5.2），
 * 塞进 parts 反而要自定义渲染器。落库消息里的这些字段不会被丢，
 * 只是不复用到流式会话里。
 */
function toUiMessage(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    parts: [{ type: 'text', content: message.text }],
  }
}

export function useMimirChat({
  conversationId,
  initialMessages,
  documentId,
  onConversationCreated,
}: UseMimirChatOptions) {
  const queryClient = useQueryClient()
  const events = useMimirChatEvents()

  /**
   * 当前会话 id。
   *
   * 初始值来自 prop（从会话历史点进来时已有 id），新会话建出来后更新。
   * 用 state 而不是 ref：它参与渲染（URL 显示、中栏的选中态），
   * 而且**在渲染期读写 ref 会让 React Compiler 拒绝优化这个组件**。
   */
  const [activeId, setActiveId] = useState(conversationId)

  /**
   * 这一轮被用户手动停过。
   *
   * 单独一个 state 而不是从 `chat.status` 推：停止与「正常结束」在状态机
   * 上都落到 `ready`（还在飞时中间那几种状态才可区分），界面上要区分
   * 「生成完了」与「我按了停止」——后者不该给动作条（见 RoundResult）。
   *
   * `send()` 开头清掉：新一轮开始就不再是「刚停过」。
   */
  const [stopped, setStopped] = useState(false)

  /**
   * 让会话的落库记录重新取一次。
   *
   * `onFinish` 在**停止时不会触发**（实测：onFinish calls = 0），所以停下来的
   * 那一刻不会有任何缓存失效——新会话被停掉后左栏不会出现，用户以为会话没建。
   * `stop()` 里显式补一次。
   */
  const invalidateConversation = () => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    void queryClient.invalidateQueries({ queryKey: ['conversation', activeId] })
  }

  /**
   * 正在**新建会话**（`POST /api/conversations` 那一趟）。
   *
   * 这段窗口 `chat.isLoading` 还是假（它要到 `chat.sendMessage` 之后才置真），
   * 界面看出不来有东西在飞——新会话里连按两次 Enter 会建出**两个**会话。
   * 放在 hook 里而不是调用方：只有这里知道「建会话」那一趟什么时候开始与结束，
   * 而且它**只在建会话期间为真**（不是「整个 send 期间」）——后者会被
   * 停止生成卡住：实测在只收到 `RUN_STARTED` 时按停止，SDK 的 `sendMessage`
   * 那一 Promise 不落地，围着它的标志位就再也清不掉，界面永久停在「生成中」。
   */
  const [creating, setCreating] = useState(false)

  const chat = useChat({
    // 历史消息在挂载时灌入。调用方用 key 保证数据到位后才挂载这个组件，
    // 因为 useChat 只在挂载那一刻读它（见 UseMimirChatOptions 的说明）
    initialMessages: (initialMessages ?? []).map(toUiMessage),
    // 地址固定，不含会话 id —— 见文件头关于「重建客户端会切断流」的说明。
    // 用函数形式是为了让 useChat 在发送时求值（它支持 string | () => string）
    connection: fetchServerSentEvents('/api/chat'),

    onCustomEvent: (name, data) => {
      if (name === EVENT_TRACE) {
        events.setTrace((data as { trace: Trace }).trace)
      } else if (name === EVENT_CITATIONS) {
        events.setCitations((data as { citations: Citation[] }).citations)
      } else if (name === EVENT_FAILURE) {
        // 分类来自服务端，见 packages/shared 里 FailureEventPayload 的说明
        const payload = data as { failure: FailureKind; message: string }
        events.setFailure({ kind: payload.failure, message: payload.message })
      } else if (name === EVENT_CONVERSATION) {
        // 新会话：服务端建好后把 id 推回来
        const created = (data as { conversationId: string }).conversationId
        setActiveId(created)
        onConversationCreated(created)
      }
    },

    onError: (error) => {
      console.error('对话流中断', error)
      /*
        流中断也要刷一次会话。

        `onFinish` 只在流正常跑完时触发，所以「服务端已经落了用户消息
        （甚至落了失败记录）、但流最后报错」这条路径上，左栏的会话列表与
        记录详情都停在旧的一份。会话落库发生在服务端处理的开头，
        **与服务端流的好坏死活无关**——所以这里刷是安全的，不是猜测。
      */
      invalidateConversation()
    },

    onFinish: () => {
      // 助手消息已经落库，让会话与文档列表刷新
      setStopped(false)
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['conversation', activeId] })
    },
  })

  /**
   * 发送一条消息。
   *
   * `options.scope === 'search'` 时走**只用检索**：把问题原样发出去，
   * 服务端认这个字段后直接用命中的原文作答、不调模型（见
   * `services/assistant-stream.ts` 的 `mimirProps`）。
   * 失败卡片上那条「只检索，不调模型」就是走这里的——它重发的是**原问题**，
   * 不是「只检索，不调模型…」这句指令（那会让检索拿指令去查词）。
   */
  const send = async (
    text: string,
    options: { deepReasoning?: boolean; scope?: 'search'; documentId?: string | null } = {},
  ) => {
    const deepReasoning = options.deepReasoning ?? false

    // 新一轮提问：清掉上一轮的检索过程与引用
    events.reset()
    setStopped(false)

    // 新会话：先把会话建出来。空会话只在这一瞬间存在，紧接着就发第一条消息。
    // 之所以在前端建而不是让服务端建：建完能让 URL 立刻对上，
    // 刷新或分享链接时不会丢上下文
    let id = activeId
    if (!id) {
      setCreating(true)
      /* 收尾不用 `finally`：React Compiler 遇到 `try … finally` 会跳过整个
         hook（`AGENTS.md` 铁律 1 那一类的静默退化）。两条路径各写一次。 */
      try {
        const created = await api.conversations.create()
        id = created.id
        setActiveId(created.id)
        onConversationCreated(created.id)
        setCreating(false)
      } catch (error) {
        setCreating(false)
        throw error
      }
    }

    await chat.sendMessage(text, {
      body: {
        conversationId: id,
        /* 检索范围：本轮显式选的文档（输入区「+ 添加上下文」）优先于挂载时
           锁定的（从文档工具条「问 AI」进来的 draft）——用户刚选的就是他
           此刻要的；显式 null = 移除了范围，回整个知识库 */
        documentId: options.documentId !== undefined ? options.documentId : documentId,
        deepReasoning,
        ...(options.scope ? { scope: options.scope } : {}),
      },
    })
  }

  return {
    messages: chat.messages,
    isLoading: chat.isLoading,
    error: chat.error,
    /** 当前会话 id（新会话建出来后与 prop 不同）。落库消息按它去取 */
    activeId,
    trace: events.trace,
    citations: events.citations,
    failure: events.failure,
    /** 这一轮被用户手动停过（`onFinish` 在停止时不触发，所以单独记） */
    stopped,
    /**
     * 正在新建会话。界面据此把输入区算成忙——`isLoading` 覆盖不到这一段。
     * 见上面 `creating` 的说明。
     */
    creating,
    send,
    stop: () => {
      setStopped(true)
      chat.stop()
      /*
        **停止后要自己让缓存失效。**

        `onFinish` 在 stop 时不会触发（SDK 只在流正常跑完时调它），
        所以「新建会话 → 第一条消息刚发出去 → 用户按停止」这条路径上，
        左栏的会话列表不会刷新——用户以为这个会话没建出来。

        会话落库发生在服务端处理的**开头**（`assistant-stream.ts` 先
        `createConversation` 再 appendMessage），所以库里那一刻已经有它了。
      */
      invalidateConversation()
    },
  }
}

/**
 * `useMimirChat` 的返回值。
 *
 * 显式导出是为了让**消息区**那个组件（`components/chat/ChatThread.tsx`）
 * 拿到一个可命名的类型——它要从这里取消息、引用、错误与状态，
 * 而 `mimirChatUI.Chat` 本来就要整个 hook 返回对象（`chat as never`）。
 */
export type MimirChat = ReturnType<typeof useMimirChat>
