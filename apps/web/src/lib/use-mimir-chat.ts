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
    },

    onFinish: () => {
      // 助手消息已经落库，让会话与文档列表刷新
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['conversation', activeId] })
    },
  })

  const send = async (text: string, deepReasoning: boolean) => {
    // 新一轮提问：清掉上一轮的检索过程与引用
    events.reset()

    // 新会话：先把会话建出来。空会话只在这一瞬间存在，紧接着就发第一条消息。
    // 之所以在前端建而不是让服务端建：建完能让 URL 立刻对上，
    // 刷新或分享链接时不会丢上下文
    let id = activeId
    if (!id) {
      const created = await api.conversations.create()
      id = created.id
      setActiveId(created.id)
      onConversationCreated(created.id)
    }

    await chat.sendMessage(text, {
      body: {
        conversationId: id,
        ...(documentId ? { documentId } : {}),
        deepReasoning,
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
    send,
    stop: chat.stop,
  }
}
