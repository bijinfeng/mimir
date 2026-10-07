import type { Citation } from '@mimir/shared'
import { useState } from 'react'
import type { ChatIo } from './io.js'
import { useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import { createMimirAgent } from './agent.js'
import { createHistoryAdapter } from './history.js'
import type { AskOptions, MimirChatApi } from './chat-context.js'

/**
 * 对话的运行时。**这是这个包里唯一碰流式状态的地方**（组件不直接碰 runtime
 * ——与旧实现「`use-mimir-chat.ts` 是唯一入口」同一条纪律，只是引擎换了）。
 *
 * ## 它替掉的四个补丁
 *
 * | 旧实现 | 现在 |
 * |---|---|
 * | `creating` 布尔（建会话那趟的忙标志） | agent 的 `onRunInitialized`（被 await，失败即 reject 整轮） |
 * | `initialMessages` 只在挂载时生效 + 宿主的 `messagesLoading` 硬契约 | 历史适配器的 `load()` + `thread.isLoading`（宿主可以先挂载，包出骨架屏） |
 * | `stopped` 自维护布尔 | 消息状态 `incomplete/cancelled`（引擎表达停止的方式） |
 * | trace / citations / failure 收进旁路 state、再按位置对齐落库那份 | 它们就是消息里的 data part（实时与历史同一个形状） |
 *
 * ## 两个「只建一次」的实例用 useState 的惰性初值承接
 *
 * `agent` 与历史适配器都必须**只建一次**：它们带着订阅与「这一轮的参数」，
 * 每次渲染新建会换掉 in-flight 那一轮的 agent。写法用 `useState(初始化函数)`
 * 而不是 ref——渲染期写 ref 会让 React Compiler 拒绝优化这个 hook
 * （`apps/web/AGENTS.md` 的「只读一次的初始值」那一节给的是同一条结论）。
 *
 * ## 停止时为什么要把队列取回来
 *
 * 引擎（`@assistant-ui/core` 的 message-queue）在取消时是
 * `notifyCancelled()` → **暂停**队列，不把已排队的那条还回去
 * （读 message-queue.js 的 `notifyCancelled` 与 external-store-thread-runtime-core
 * 的 cancel 路径确认：它只置 paused）。
 * 而 mimir 的语义是「停止 / 失败 → 还给输入框」（D-098，Codex 同款）：
 * 按下停止的人想的是「改主意」，不是「那条丢掉」。
 *
 * 所以这里在 `onCancel` 里显式做：取队列首条 → `setText` → `removeQueueItem`。
 * 漏了它的症状是「用户按了停止，排队的字不见了」——不报错，只是丢内容。
 */
export function useMimirRuntime({
  io,
  conversationId,
  onOpenCitation,
  onOpenNote,
}: {
  io: ChatIo
  conversationId: string | undefined
  onOpenCitation: (documentId: string, citation: Citation) => void
  onOpenNote: (noteId: string) => void
}): { runtime: ReturnType<typeof useAgUiRuntime>; api: MimirChatApi } {
  /**
   * 当前会话 id。
   *
   * 初值来自 prop（从会话历史点进来时已有 id）；新建会话后由 agent 的初始化
   * 钩子回推（下面那个 `onConversationCreated`）。用 state 而不是每次现读
   * agent.threadId：它参与渲染（「存成笔记」要用它去取落库记录）。
   *
   * 切换会话由宿主 `key` 重挂载——所以「prop 变了而 state 没跟上」这条
   * 路径不存在（这也是重挂载契约的一部分）。
   */
  const [activeId, setActiveId] = useState<string | undefined>(conversationId)

  const [agent] = useState(() =>
    createMimirAgent({
      io,
      conversationId,
      onConversationCreated: (id) => {
        setActiveId(id)
        io.onConversationCreated(id)
      },
    }),
  )
  const [history] = useState(() => createHistoryAdapter(io, conversationId))

  /**
   * 这块面板自己发过至少一轮。
   *
   * 与「打开历史会话」相对：那时库里没有存那一轮的思考强度
   * （messageSchema 只有 text / trace / citations / failure），失败卡上要
   * 说明「重试按你现在的设置来」。发过一轮之后，输入区里那个开关就是用户
   * 自己设的，不必再解释（旧实现的 `lastSend.known` 是同一件事）。
   */
  const [sentHere, setSentHere] = useState(false)

  const runtime = useAgUiRuntime({
    agent,
    adapters: { history },
    /**
     * 生成中允许发下一条：Enter 排队，本轮落定后自动发出（实测：
     * 队列长度 1 → 本轮结束自动发出 → 第二个请求体里带着完整 transcript）。
     */
    unstable_enableMessageQueue: true,
    /**
     * 把模型的思考流（`REASONING_*` 帧）聚成 reasoning part 并渲染。
     *
     * 运行时默认**藏掉**它们（`showThinking: false`，只留一个签名占位），
     * 而 `parts/ReasoningPart.tsx` 已经按官方 Reasoning 形态挂上了——
     * 开着而不渲染等于白开，两者必须同批（D-099 收尾）。
     */
    showThinking: true,
    onError: (error) => {
      /* 流中断也要让宿主刷新：会话落库发生在服务端处理的**开头**，
         与服务端流的好坏死活无关（旧实现同一条注释）。 */
      console.error('对话流中断', error)
      settle()
    },
    onCancel: () => {
      /* 见文件头：停止要把排队的那条还回输入框 */
      const composer = runtime.thread.composer
      const first = composer.getState().queue[0]
      if (first) {
        /* `removeQueueItem` 只管删，所以顺序是「先放回输入框、再删」——
           反过来的话文本就随那条一起没了。
           （命令面这里走 `runtime.thread.composer`，它带 `removeQueueItem`；
           React 组件那边走 `useAui().composer`，那上面的对应方法是
           `queueItem({ id }).remove()`——两条路径的方法名不同，见各自的注释） */
        composer.setText(first.prompt)
        composer.removeQueueItem(first.id)
      }
      settle()
    },
  })

  function settle() {
    io.onTurnSettled(activeId)
  }

  const api: MimirChatApi = {
    activeId,
    sentHere,
    onOpenCitation,
    onOpenNote,
    saveAsNote: () => {
      /* 没有会话 id 是不可能的（有回答就有会话），但类型上是 undefined——
         抛出去比发一个 undefined 的请求诚实 */
      if (activeId === undefined) throw new Error('还没有会话，无法存成笔记')
      return io.saveAsNote(activeId)
    },
    ask: (question, options) => {
      const composer = runtime.thread.composer
      /**
       * 这一轮的参数 = **输入区当前的设置** + 这里给的覆盖。
       *
       * 读 composer 的 `runConfig.custom`（Composer 那个 effect 一直把它
       * 同步成「范围 + 思考强度」）——于是「重试」用的是用户**看得见**的
       * 那套设置。旧实现用的是原来那一轮记下的值（看不见），两者对
       * 「历史轮的失败」都不完全等价，但看得见的那一个至少可解释。
       */
      const current = composer.getState().runConfig.custom ?? {}
      const next = { ...current, ...runConfigOf(options) }
      composer.setRunConfig({ custom: next })
      composer.setText(question)
      composer.send()
      setSentHere(true)
    },
    stop: () => {
      runtime.thread.cancelRun()
    },
    refill: (text) => {
      runtime.thread.composer.setText(text)
    },
  }

  return { runtime, api }
}

/**
 * 新一轮的 runConfig。
 *
 * 服务端认 `forwardedProps.runConfig`（读 `AgUiThreadRuntimeCore.buildRunInput`
 * 的源码得：`...runConfig?.custom ? { runConfig: runConfig.custom } : {}`），
 * 同时兼容旧前端那种顶层写法——两条通道都在 `mimirProps` 里认，
 * 见 `apps/server/src/services/assistant-stream.ts`。
 */
function runConfigOf(options: AskOptions | undefined): Record<string, unknown> {
  if (!options) return {}
  return {
    ...(options.documentId !== undefined ? { documentId: options.documentId } : {}),
    ...(options.deepReasoning ? { deepReasoning: true } : {}),
    ...(options.scope ? { scope: options.scope } : {}),
  }
}
