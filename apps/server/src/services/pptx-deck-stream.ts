import {
  PPTX_DECK_GENERATION_TIMEOUT,
  PPTX_DECK_STREAM_MAX_BYTES,
  PPTX_DECK_STREAM_MAX_EVENTS,
  PPTX_DECK_STREAM_MAX_LINE,
  PptxDeckStreamError,
  pptxDeckStreamEventSchema,
  type PptxDeckStreamEvent,
} from '@mimir/shared'
import { applyPptxOpsOnHost, type PptxHostRequest } from './pptx-agent-host.js'

/** Backpressure retains at most one wire event. No candidate is persisted to the vault. */
export function pptxDeckStream(request: PptxHostRequest & { generationId: string }): Response {
  const controller = new AbortController()
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(PPTX_DECK_GENERATION_TIMEOUT),
    ...(request.signal ? [request.signal] : []),
  ])
  const encoder = new TextEncoder()
  let cancelled = false,
    total = 0,
    count = 0,
    completed = 0,
    planned = 0
  let resume: (() => void) | undefined
  return new Response(
    new ReadableStream<Uint8Array>({
      start(stream) {
        const send = async (input: PptxDeckStreamEvent) => {
          if (cancelled || signal.aborted) throw new PptxDeckStreamError('生成已取消')
          const event = pptxDeckStreamEventSchema.parse(input)
          const line = JSON.stringify(event) + '\n',
            encoded = encoder.encode(line)
          total += encoded.byteLength
          if (
            ++count > PPTX_DECK_STREAM_MAX_EVENTS ||
            line.length > PPTX_DECK_STREAM_MAX_LINE ||
            total > PPTX_DECK_STREAM_MAX_BYTES - 8192
          )
            throw new PptxDeckStreamError('生成预览超过传输预算；请减少页数后重试')
          stream.enqueue(encoded)
          if ((stream.desiredSize ?? 0) <= 0) {
            let wake!: () => void
            const ready = new Promise<void>((resolve) => {
              wake = resolve
            })
            resume = wake
            signal.addEventListener('abort', wake, { once: true })
            if (signal.aborted) wake()
            try {
              await ready
            } finally {
              signal.removeEventListener('abort', wake)
              resume = undefined
            }
          }
          if (cancelled || signal.aborted) throw new PptxDeckStreamError('生成已取消')
        }
        void (async () => {
          try {
            const result = await applyPptxOpsOnHost({
              ...request,
              signal,
              onDeckProgress: async (progress, candidate) => {
                planned = progress.total
                if (candidate) {
                  await send({
                    type: 'checkpoint',
                    progress,
                    bytesBase64: Buffer.from(candidate.bytes).toString('base64'),
                    data: candidate.data,
                    sampleData: candidate.sampleData,
                  })
                  completed = progress.completed
                } else await send({ type: 'progress', progress })
              },
            })
            const data = result.data as { pages: number }
            if (!completed || data.pages !== completed)
              throw new PptxDeckStreamError('生成缺少完整候选')
            await send({ type: 'done', generationId: request.generationId, completed })
          } catch (error) {
            if (!cancelled && !signal.aborted)
              stream.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'error',
                    generationId: request.generationId,
                    message:
                      error instanceof Error ? error.message.slice(0, 2000) : '演示文稿生成失败',
                    recoverable:
                      completed > 0 &&
                      completed < planned &&
                      !(error instanceof PptxDeckStreamError),
                  }) + '\n',
                ),
              )
          } finally {
            if (!cancelled) stream.close()
          }
        })()
      },
      pull() {
        resume?.()
      },
      cancel() {
        cancelled = true
        controller.abort()
        resume?.()
      },
    }),
    {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    },
  )
}
