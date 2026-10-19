import { ChatClient } from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'
import type { Message } from '@mimir/shared'
import type { UIMessage } from '@tanstack/ai'
import type { ChatIo } from './io.js'
import type { MessageSidecar } from './runtime-context.js'

/** History and live streams share native TanStack parts; legacy trace is deliberately ignored. */
export function toThreadMessage(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    parts: [{ type: 'text', content: message.text }],
  }
}
export function historySidecar(message: Message): MessageSidecar {
  return {
    ...(message.savedNoteId ? { savedNoteId: message.savedNoteId } : {}),
    ...(message.modelSelection ? { modelSelection: message.modelSelection } : {}),
    ...(message.retrievalScope ? { retrievalScope: message.retrievalScope } : {}),
    ...(message.citations?.length ? { citations: message.citations } : {}),
    ...(message.failure ? { failure: { kind: message.failure, detail: '' } } : {}),
    ...(message.agent ? { agent: message.agent } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
  }
}
export function createHistoryAdapter(io: ChatIo, conversationId: string | undefined) {
  return {
    async load() {
      if (!conversationId)
        return { messages: [] as UIMessage[], sidecars: {} as Record<string, MessageSidecar> }
      const conversation = await io.loadConversation(conversationId)
      if (!conversation) throw new Error('会话不存在或已被删除')
      return {
        messages: await Promise.all(conversation.messages.map(replayThreadMessage)),
        sidecars: Object.fromEntries(
          conversation.messages.map((message) => [message.id, historySidecar(message)]),
        ),
      }
    },
  }
}

/** Replay actual stored protocol events through the same SDK reducer as live rendering. */
export async function replayThreadMessage(message: Message): Promise<UIMessage> {
  const events = message.protocolEvents
  if (message.role !== 'assistant' || !events?.length) return toThreadMessage(message)
  const threadId = `history-${message.id}`
  const runId = `history-run-${message.id}`
  const client = new ChatClient({
    connection: {
      async *connect() {
        yield { type: 'RUN_STARTED', threadId, runId } as StreamChunk
        for (const event of events) yield event as unknown as StreamChunk
        yield { type: 'RUN_FINISHED', threadId, runId } as StreamChunk
      },
    },
  })
  try {
    await client.sendMessage('restore history')
    const messages = client.getMessages().filter((entry) => entry.role === 'assistant')
    const parts = messages.flatMap((entry) => entry.parts)
    return parts.length ? { ...messages[0]!, id: message.id, parts } : toThreadMessage(message)
  } finally {
    client.dispose()
  }
}
