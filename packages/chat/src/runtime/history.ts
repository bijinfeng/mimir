import type { Message } from '@mimir/shared'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { ExportedMessageRepository } from '@assistant-ui/react'
import { ExportedMessageRepository as Repository } from '@assistant-ui/react'
import type { ChatIo } from './io.js'

/**
 * 落库的 `Message` → 对话引擎的消息形状。
 *
 * ## 这是本次架构的核心改动
 *
 * 在这之前，「本轮结果」（检索过程 / 引用 / 失败）是**另一条数据流**：
 * 服务端推自定义事件 → 收进 state（`use-mimir-chat-events.ts`）→
 * 渲染层按**位置**把实时那份与落库那份对齐（`RoundResult.tsx` 的
 * `resolveRound`，那 80 行注释就是在解释为什么要按位置而不是按 id）。
 *
 * 现在它们都是**消息里的 data part**，两条路径同一个形状：
 *
 *  - 实时：服务端 CUSTOM 事件 → 运行时把它们变成 canonical data part
 *  - 历史：这里把落库字段转成同名的 data part
 *
 * 于是「同一轮的结果」与「这条消息」不再是两套对齐逻辑——
 * 消息在哪，它的依据就在哪。
 *
 * ## 顺序是刻意的：trace → citations → failure → 正文
 *
 * data part 按这个顺序排，正文在最后。历史会话里「检索过程在回答上方、
 * 引用在回答下方」那种版式靠 CSS 的 order 与独立渲染块实现，不靠 part 顺序；
 * 但 part 顺序仍然照实时那条流来排（先发的在前），这样读代码时两条路径
 * 是一致的。
 *
 * ## 失败那条的 `message`
 *
 * 落库只存分类（`packages/shared/src/conversations.ts` 的 messageSchema
 * 只有 text / trace / citations / failure），原始错误文本没有存。
 * 所以历史里的失败卡**没有 detail**，用 `FAILURE_UI` 的预设说明
 * （这与今天的行为一致：`resolveRound` 的 `failureDetail` 只在实时那份存在时给）。
 */
/**
 * 一条消息里可以出现的 part。
 *
 * 从 `ThreadMessageLike['content']` 里取出来而不是 import `@assistant-ui/core`
 * 的类型：那个包是这个包的依赖的依赖（`@assistant-ui/react` 转发的），
 * 直接 import 等于多声明一条依赖，而这里要的只是同一个形状。
 */
type ThreadMessageLikePart = Extract<ThreadMessageLike['content'], readonly unknown[]>[number]

export function toThreadMessage(message: Message): ThreadMessageLike {
  /* 局部是可变的数组，最后一次性交给 content（`ThreadMessageLike['content']`
     是只读的——引擎那边把它当不可变数据） */
  const parts: ThreadMessageLikePart[] = []

  if (message.role === 'assistant') {
    if (message.trace) {
      parts.push({ type: 'data', name: 'mimir.trace', data: { trace: message.trace } })
    }
    if (message.citations && message.citations.length > 0) {
      parts.push({
        type: 'data',
        name: 'mimir.citations',
        data: { citations: message.citations },
      })
    }
    if (message.failure) {
      parts.push({
        type: 'data',
        name: 'mimir.failure',
        data: { failure: message.failure, message: '' },
      })
    }
  }

  parts.push({ type: 'text', text: message.text })

  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: parts,
  }
}

/**
 * 历史适配器（对话引擎的 `adapters.history`）。
 *
 * ## 它替掉的是「initialMessages 只在挂载那一刻生效」
 *
 * 旧实现里历史必须**数据到位之后**才挂载对话体（`useChat` 内部把客户端建在
 * `useMemo(..., [])` 里，之后传的变化不生效），所以宿主有一个硬契约
 * （`messagesLoading` 分支 + `key` 重挂载）。有了 `load()`，宿主可以在数据
 * 没到位时就挂载，运行时自己出加载态（`thread.isLoading`，实测 true→false）
 * ——「换会话时白屏一下」也一并变成骨架屏。
 *
 * ## append / update 是空实现，这是对的
 *
 * **落库是服务端的职责**：服务端的 `persistAssistant` 在流走完时写
 * （`assistant-stream.ts`），而 AG-UI 运行时自己的 `unstable_persistsHistory`
 * 也是 true——两处都写会造出重复记录，且客户端那份没有服务端的 trace 与引用。
 */
export function createHistoryAdapter(io: ChatIo, conversationId: string | undefined) {
  return {
    async load(): Promise<ExportedMessageRepository> {
      if (!conversationId) return Repository.fromArray([])
      const conversation = await io.loadConversation(conversationId)
      if (!conversation) return Repository.fromArray([])
      return Repository.fromArray(conversation.messages.map(toThreadMessage))
    },
    async append(): Promise<void> {
      /* 落库归服务端（见上） */
    },
  }
}
