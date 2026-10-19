import { fetchServerSentEvents } from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'
import type { ConnectionAdapter } from '@tanstack/ai-client'
import type { ChatIo } from './io.js'
import { DEFAULT_CHAT_URL } from './io.js'
import type { ChatDocxAgent } from '../types.js'

/** The persisted ID and immutable per-send body are bound at the final HTTP boundary. */
export function createChatTransport(options: {
  io: ChatIo
  conversationId?: string
  onCreated: (id: string) => void
  agent: () => ChatDocxAgent | null | undefined
  round: { id: string | null; version: number | null }
  selection: { value: unknown }
  validate: (config: Record<string, unknown>, resuming: boolean) => void
}): { connection: ConnectionAdapter; ensureConversation: () => Promise<string> } {
  let activeId = options.conversationId
  let creating: Promise<string> | undefined
  let lastConfig: Record<string, unknown> = {}
  let lastForwarded: Record<string, unknown> = {}
  async function ensureConversation() {
    if (activeId) return activeId
    creating ??= options.io
      .createConversation()
      .then(({ id }) => {
        activeId = id
        options.onCreated(id)
        return id
      })
      .catch((error: unknown) => {
        creating = undefined
        throw error
      })
    return creating
  }
  const base = fetchServerSentEvents(options.io.chatUrl ?? DEFAULT_CHAT_URL, {
    credentials: 'include',
    fetchClient: async (url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      const forwarded = (body.forwardedProps ?? body.data ?? {}) as Record<string, unknown>
      const resuming = Array.isArray(body.resume) && body.resume.length > 0
      const config = structuredClone(
        resuming ? lastConfig : ((forwarded.runConfig ?? {}) as Record<string, unknown>),
      )
      options.validate(config, resuming)
      const agent = options.agent()
      if (agent) {
        const format = agent.format ?? 'docx'
        if (!resuming) {
          const id = config.agentRoundId
          const version = config.agentVersion
          if (typeof id !== 'string' || !Number.isSafeInteger(version))
            throw new Error('文档编辑轮次未准备，请重新发送')
          options.round.id = id
          options.round.version = version as number
          options.selection.value = config.agentSelection
        }
        if (options.round.id === null || options.round.version !== agent.getVersion())
          throw new Error('文档在本轮指令期间发生了其他修改，请重新发送指令')
        const context = agent.getContext()
        const frozenContext =
          typeof context === 'object' && context !== null
            ? { ...context, selection: options.selection.value }
            : context
        Object.assign(config, {
          documentAgent: true,
          agentFormat: format,
          documentId: agent.documentId,
          agentContext: frozenContext,
          agentVersion: options.round.version,
          agentRoundId: options.round.id,
          agentSelection: options.selection.value,
          ...(format === 'docx'
            ? {
                docxAgent: true,
                docxContext: frozenContext,
                docxVersion: options.round.version,
                docxRoundId: options.round.id,
                docxSelection: options.selection.value,
              }
            : {}),
        })
        // Server claims the original interrupted run itself. Keep the SDK's parent internally.
        delete body.parentRunId
      }
      const id = await ensureConversation()
      if (init?.signal?.aborted) throw new DOMException('已停止', 'AbortError')
      options.validate(config, resuming)
      if (agent && options.round.version !== agent.getVersion())
        throw new Error('文档在本轮指令期间发生了其他修改，请重新发送指令')
      body.threadId = id
      body.forwardedProps = {
        ...(resuming ? lastForwarded : forwarded),
        runConfig: config,
        conversationId: id,
      }
      body.data = body.forwardedProps
      lastConfig = structuredClone(config)
      lastForwarded = structuredClone(body.forwardedProps as Record<string, unknown>)
      return globalThis.fetch(url, { ...init, credentials: 'include', body: JSON.stringify(body) })
    },
  })
  const connection: ConnectionAdapter = {
    async *connect(messages, data, signal, context) {
      let terminal = false
      let legacyReasoning = 0
      const aliases: Record<string, string> = {
        THINKING_START: 'REASONING_START',
        THINKING_END: 'REASONING_END',
        THINKING_TEXT_MESSAGE_START: 'REASONING_MESSAGE_START',
        THINKING_TEXT_MESSAGE_CONTENT: 'REASONING_MESSAGE_CONTENT',
        THINKING_TEXT_MESSAGE_END: 'REASONING_MESSAGE_END',
      }
      for await (const chunk of base.connect(messages, data, signal, context)) {
        if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') terminal = true
        const event = chunk as unknown as Record<string, unknown>
        if (event.type === 'THINKING_START') legacyReasoning++
        const alias = aliases[String(event.type)]
        yield alias
          ? ({
              ...event,
              type: alias,
              messageId: `legacy-reasoning-${legacyReasoning}`,
              ...(event.type === 'THINKING_TEXT_MESSAGE_START' ? { role: 'reasoning' } : {}),
            } as unknown as StreamChunk)
          : chunk
      }
      // The stock normalizer synthesizes success on EOF; a truncated HTTP stream is a failure.
      if (!signal?.aborted && !terminal) throw new Error('连接中断，回答尚未完成，请重试')
    },
  }
  return { connection, ensureConversation }
}
