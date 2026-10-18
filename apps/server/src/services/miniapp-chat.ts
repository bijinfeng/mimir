import {
  MINIAPP_EVENT_OPERATION,
  type MiniappChatInput,
  type MiniappStreamEvent,
} from '@mimir/shared/miniapp'
import { HttpError } from '../lib/http.js'
import { streamChat } from './assistant-stream.js'
import { createConversation, ensureConversationScope, getConversation } from './conversations.js'
import { normalizeRetrievalScope } from './retrieval-scope.js'
import {
  beginMiniappOperation,
  bindMiniappConversation,
  failMiniappOperation,
  finishMiniappOperation,
  getMiniappOperation,
} from './miniapp-operations.js'
import type { MiniappPrincipal } from './miniapp-auth.js'

const activeConversations = new Set<string>()
const frame = (event: MiniappStreamEvent) =>
  new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
/** The native transport owns one lifecycle; underlying AG-UI lifecycle is normalized.
 * Draining continues after the phone disconnects. Only receipt/history recovery can
 * resume viewing an answer; a repeated request never starts the provider again.
 */
export async function miniappChat(
  principal: MiniappPrincipal,
  input: MiniappChatInput,
): Promise<Response> {
  const entry = await beginMiniappOperation(principal, input.requestId, 'chat', input)
  const operationId = entry.operation.id
  const runId = `miniapp_${operationId}`
  let disconnected = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: MiniappStreamEvent) => {
        if (!disconnected) controller.enqueue(frame(event))
      }
      const work = async () => {
        let conversationId = entry.operation.conversationId
        let locked = false
        let upstream: ReadableStreamDefaultReader<Uint8Array> | undefined
        let terminal = false
        send({
          type: 'RUN_STARTED',
          runId,
          ...(conversationId ? { threadId: conversationId } : {}),
        })
        send({
          type: 'CUSTOM',
          name: MINIAPP_EVENT_OPERATION,
          value: { operation: entry.operation },
        })
        try {
          if (!entry.fresh) {
            if (conversationId)
              send({ type: 'CUSTOM', name: 'mimir.conversation', value: { conversationId } })
            if (entry.operation.status === 'succeeded')
              send({ type: 'RUN_FINISHED', runId, threadId: conversationId ?? '' })
            else
              send({
                type: 'RUN_ERROR',
                runId,
                message:
                  entry.operation.error?.message ?? '该请求正在处理中，请读取操作状态和会话历史',
              })
            return
          }
          const scope = await normalizeRetrievalScope(input.scope)
          if (input.conversationId) {
            const existing = await getConversation(input.conversationId)
            if (!existing)
              throw new HttpError(404, 'CONVERSATION_NOT_FOUND', '会话已不存在，请新建会话')
            await ensureConversationScope(existing.id, scope)
            conversationId = existing.id
          } else conversationId = (await createConversation('', scope)).id
          if (activeConversations.has(conversationId))
            throw new HttpError(409, 'CONVERSATION_BUSY', '当前会话仍在回答中，请等待结果后再提问')
          activeConversations.add(conversationId)
          locked = true
          await bindMiniappConversation(operationId, conversationId)
          send({
            type: 'CUSTOM',
            name: MINIAPP_EVENT_OPERATION,
            value: { operation: await getMiniappOperation(principal, operationId) },
          })
          send({ type: 'CUSTOM', name: 'mimir.conversation', value: { conversationId } })
          const response = await streamChat({
            threadId: conversationId,
            runId,
            tools: [],
            context: [],
            state: {},
            messages: [{ id: input.requestId, role: 'user', content: input.question }],
            forwardedProps: {
              conversationId,
              retrievalScope: scope,
              ...(scope.type === 'document' ? { documentId: scope.documentId } : {}),
              ...(input.mode === 'search' ? { scope: 'search' } : {}),
            },
          })
          if (!response.ok || !response.body)
            throw new HttpError(400, 'CHAT_REJECTED', '无法开始回答，请检查检索范围和会话状态')
          upstream = response.body.getReader()
          const decoder = new TextDecoder('utf-8', { fatal: true })
          let pending = ''
          const consume = async (raw: string) => {
            const data = raw
              .split(/\r?\n/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).replace(/^ /, ''))
              .join('\n')
            if (!data || data === '[DONE]') return
            const event = JSON.parse(data) as MiniappStreamEvent
            if (event.type === 'RUN_STARTED') return
            if (event.type === 'RUN_FINISHED') {
              await finishMiniappOperation(operationId, {
                type: 'chat',
                conversationId: conversationId!,
              })
              terminal = true
              send({ ...event, runId, threadId: conversationId! })
            } else if (event.type === 'RUN_ERROR') {
              await failMiniappOperation(operationId, new Error('chat generation failed'), true)
              terminal = true
              send({ ...event, runId })
            } else send(event)
          }
          while (true) {
            const next = await upstream.read()
            pending += next.done ? decoder.decode() : decoder.decode(next.value, { stream: true })
            let boundary: RegExpExecArray | null
            while ((boundary = /\r?\n\r?\n/.exec(pending)) !== null) {
              const raw = pending.slice(0, boundary.index)
              pending = pending.slice(boundary.index + boundary[0].length)
              await consume(raw)
            }
            if (next.done) break
            if (pending.length > 4_000_000) throw new Error('stream frame too large')
          }
          if (pending.trim()) await consume(pending)
          if (!terminal) throw new Error('stream ended before terminal event')
        } catch (error) {
          if (entry.fresh && !terminal) await failMiniappOperation(operationId, error)
          send({
            type: 'RUN_ERROR',
            runId,
            message:
              error instanceof HttpError
                ? error.message
                : '回答连接中断，请刷新会话确认结果，系统不会自动重新提问',
          })
        } finally {
          upstream?.releaseLock()
          if (locked && conversationId) activeConversations.delete(conversationId)
          if (!disconnected) controller.close()
        }
      }
      void work().catch(() => {
        if (!disconnected) {
          send({ type: 'RUN_ERROR', runId, message: '无法记录回答结果，请查询原操作状态' })
          controller.close()
        }
      })
    },
    cancel() {
      disconnected = true
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
