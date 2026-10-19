import type { StreamChunk, UIMessage } from '@tanstack/ai'
import type { ConnectionAdapter } from '@tanstack/ai-client'
export type LocalConnection = {
  connection: ConnectionAdapter
  next: (events: Record<string, unknown>[]) => void
  captured: () => Record<string, unknown> | undefined
}
/** In-memory AG-UI stream only. No API, model, upload, persistence or fake network. */
export function createLocalConnection(
  onConnect?: (messages: UIMessage[], body: Record<string, unknown>, context: unknown) => void,
  options: { autoComplete?: boolean } = {},
): LocalConnection {
  let nextEvents: Record<string, unknown>[] = []
  let captured: Record<string, unknown> | undefined
  return {
    next(events) {
      nextEvents = structuredClone(events)
    },
    captured: () => captured,
    connection: {
      async *connect(messages, data, signal, context) {
        captured = structuredClone(data || {})
        onConnect?.(messages as UIMessage[], captured, context)
        const events = nextEvents
        nextEvents = []
        const runId = context?.runId || 'local-run'
        const threadId = context?.threadId || 'local-thread'
        if (options.autoComplete !== false && !events.some((e) => e.type === 'RUN_STARTED'))
          yield { type: 'RUN_STARTED', threadId, runId } as StreamChunk
        for (const item of events) {
          if (signal?.aborted) return
          yield {
            ...item,
            ...(['RUN_STARTED', 'RUN_FINISHED'].includes(String(item.type))
              ? { threadId, runId }
              : {}),
          } as StreamChunk
          await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 45))
        }
        if (
          !signal?.aborted &&
          options.autoComplete !== false &&
          !events.some((e) => e.type === 'RUN_ERROR' || e.type === 'RUN_FINISHED')
        )
          yield { type: 'RUN_FINISHED', threadId, runId } as StreamChunk
      },
    },
  }
}
