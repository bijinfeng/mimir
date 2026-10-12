import { HttpAgent } from '@ag-ui/client'
import type { RunAgentInput } from '@ag-ui/client'
import type { ChatIo } from './io.js'
import { DEFAULT_CHAT_URL } from './io.js'
import type { ChatDocxAgent } from '../types.js'

/**
 * mimir 的 AG-UI agent：**在请求发出之前**把这一轮的参数补进去。
 *
 * ## 它替掉的两个旧补丁
 *
 * 1. **会话 id 的维护**（旧 `use-mimir-chat.ts` 的 `creating` 标志）。
 *    新会话的第一问要求「先把会话建出来、再带着 id 发请求」，从前是在
 *    `send()` 里 `await api.conversations.create()` 然后手工塞进 body，
 *    再补一个 `creating` state 让界面算忙（那段注释解释了为什么不能罩住
 *    整个 send：只收到 RUN_STARTED 时按停止，SDK 的 Promise 不落地，
 *    标志位再也清不掉，界面永久停在「生成中」）。
 *    现在落在 `onRunInitialized`：它**被 await 且在请求发出之前**执行
 *    （实测），失败会 reject 整次 run——「建会话失败」于是天然是一条
 *    能显示出来的错误，而不是一个要维护的布尔。
 *
 * 2. **每轮的参数通道**。旧实现走 `sendMessage(text, { body })` 合并进
 *    `forwardedProps`；新运行的每次发送都带着自己的 `runConfig.custom`，
 *    由运行时合并进 `forwardedProps.runConfig`（读 `AgUiThreadRuntimeCore`
 *    的 buildRunInput 源码得）。服务端两个通道都认（见
 *    `apps/server/src/services/assistant-stream.ts` 的 `mimirProps`）。
 *
 * ## 为什么用 fetch 包一层而不是覆写 requestInit
 *
 * `requestInit` 是 `protected`，子类可以覆写——但那样每个实例都要一个子类。
 * 构造器收一个 fetch 更小：同源下 `credentials` 走默认（same-origin 带
 * cookie），跨源（`VITE_API_TARGET` 指到别的 host）时才需要显式
 * `credentials: 'include'`。这里统一显式写上——它对本仓的两种部署都是对的，
 * 而漏掉的表现是「本地开发好好的、部署到别的 host 上 401」。
 */
export interface MimirAgentOptions {
  io: ChatIo
  conversationId: string | undefined
  /**
   * 新建会话之后的回推（包内更新 activeId + 通知宿主换 URL）。
   *
   * 由 `useMimirRuntime` 提供，agent 只管「把 id 写进请求」这一件事——
   * 「谁建会话谁通知」与「请求要带什么」的失败语义不同，混在一起会让
   * 「建好了但 URL 没换」这类问题无处可查。
   */
  onConversationCreated: (id: string) => void
  /** Read at request time so a newly loaded or replaced editor is never captured. */
  docxAgent?: ChatDocxAgent | null
  round: { id: string | null; version: number | null }
  selection: { value: { from: number; to: number; text: string } | null }
}

function queuedSelection(value: unknown): { from: number; to: number; text: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const selection = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(selection.from) ||
    !Number.isSafeInteger(selection.to) ||
    typeof selection.text !== 'string'
  )
    return null
  return selection as { from: number; to: number; text: string }
}

export function createMimirAgent({
  io,
  conversationId,
  onConversationCreated,
  docxAgent,
  round,
  selection,
}: MimirAgentOptions): {
  agent: HttpAgent
  updateDocxAgent: (next: ChatDocxAgent | null | undefined) => void
} {
  const url = io.chatUrl ?? DEFAULT_CHAT_URL
  let activeDocxAgent = docxAgent

  const agent = new HttpAgent({
    url,
    ...(conversationId ? { threadId: conversationId } : {}),
    /**
     * 带 cookie（鉴权走 cookie，见 .trellis/spec/renderer/frontend/conventions.md 的「调后端」一节）。
     * same-origin 下 fetch 默认就会带，这里显式写是为了跨源那条路径
     * 不需要有人记得回来加。
     */
    fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: 'include' }),
  })

  /**
   * 请求发出之前的补写。
   *
   * - **异步**：建会话要走一次接口，而钩子被 await（实测：里面 await 300ms，
   *   服务端看到的是 await 之后的值）
   * - **同时改 agent.threadId 与 forwardedProps**：前者是 AG-UI 的 thread
   *   标识（服务端拿它对齐会话），后者是 `mimirProps` 认的那个字段。
   *   两个都写，是因为服务端两条通道都读（顶层优先），而 threadId 还决定
   *   客户端自己怎么分组消息
   */
  agent.subscribe({
    onRunInitialized: async (params) => {
      const input = params.input as RunAgentInput & {
        forwardedProps?: Record<string, unknown>
      }
      const forwarded = input.forwardedProps ?? {}
      const existing =
        typeof forwarded.conversationId === 'string' ? forwarded.conversationId : input.threadId

      const currentDocxAgent = activeDocxAgent
      if (currentDocxAgent) {
        const previous =
          typeof forwarded.runConfig === 'object' && forwarded.runConfig !== null
            ? (forwarded.runConfig as Record<string, unknown>)
            : {}
        // The composer captures this pair before send(), including queued sends.
        // A resume must retain the same pair; only a legacy/unprepared fresh
        // request falls back to dispatch-time capture.
        if (!Array.isArray((input as RunAgentInput & { resume?: unknown }).resume)) {
          const preparedRound = previous.docxRoundId
          const preparedSelection = queuedSelection(previous.docxSelection)
          const preparedVersion = previous.docxVersion
          if (
            typeof preparedRound === 'string' &&
            preparedRound !== round.id &&
            preparedSelection &&
            Number.isSafeInteger(preparedVersion)
          ) {
            round.id = preparedRound
            round.version = preparedVersion as number
            selection.value = preparedSelection
          } else {
            round.id = crypto.randomUUID()
            selection.value = currentDocxAgent.freezeSelection(round.id)
            round.version = currentDocxAgent.getVersion()
          }
        } else if (round.id === null || round.version === null) {
          throw new Error('DOCX 工具续轮已失去编辑轮次，请重新提问')
        }
        if (round.version !== currentDocxAgent.getVersion())
          throw new Error('文档在本轮指令期间发生了其他修改，请重新发送指令')
        const liveContext = currentDocxAgent.getContext()
        const docxContext =
          typeof liveContext === 'object' && liveContext !== null
            ? { ...liveContext, selection: selection.value }
            : liveContext
        input.forwardedProps = {
          ...forwarded,
          runConfig: {
            ...previous,
            docxAgent: true,
            documentId: currentDocxAgent.documentId,
            docxContext,
            docxVersion: round.version,
            docxRoundId: round.id,
            docxSelection: selection.value,
          },
        }
      }

      // 已经有了：什么都不用做（只有真·新会话才建）
      if (existing) return

      const created = await io.createConversation()
      params.agent.threadId = created.id
      input.threadId = created.id
      input.forwardedProps = { ...(input.forwardedProps ?? forwarded), conversationId: created.id }
      /* 建完立刻回推：包里更新 activeId（落库查询要用）、宿主换 URL
         （自己建的会话不重挂载对话体，否则正在接收的流会被丢掉——
         见 `_app.chat.tsx` 的 ownedId） */
      onConversationCreated(created.id)
    },
  })

  return {
    agent,
    updateDocxAgent: (next) => {
      activeDocxAgent = next
    },
  }
}
