import { describe, expect, it, vi } from 'vitest'
import { streamHtmlWriting } from './html-writing-stream'

const input = {
  documentId: 'html-1',
  kind: 'content' as const,
  instruction: '写指南',
  plan: '计划',
}
const encoder = new TextEncoder()
describe('HTML incremental writing transport', () => {
  it('delivers deltas before the server completes and handles split UTF-8/NDJSON boundaries', async () => {
    let control!: ReadableStreamDefaultController<Uint8Array>
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              control = controller
            },
          }),
        ),
    )
    const deltas: string[] = []
    const pending = streamHtmlWriting({ fetchImpl }, input, undefined, (delta) =>
      deltas.push(delta),
    )
    await Promise.resolve()
    await Promise.resolve()
    const first = encoder.encode('{"type":"delta","text":"第一段"}\n')
    control.enqueue(first.slice(0, 26))
    control.enqueue(first.slice(26))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deltas).toEqual(['第一段'])
    const html = '<html><body>第一段第二段</body></html>'
    control.enqueue(
      encoder.encode(
        JSON.stringify({ type: 'delta', text: '第二段' }) +
          '\n' +
          JSON.stringify({ type: 'done', html, complete: true }) +
          '\n',
      ),
    )
    control.close()
    await expect(pending).resolves.toEqual({ html, complete: true })
    expect(deltas).toEqual(['第一段', '第二段'])
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('?stream=1'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })
  it.each([
    ['{"type":"delta","text":"<html><body>部分"}\n', '未完成'],
    ['{"type":"delta","text":"部分"}\n{"type":"error","message":"模型连接中断"}\n', '模型连接中断'],
    ['{"type":"unknown"}\n', 'Invalid'],
  ])(
    'rejects truncated/error/unknown streams without pretending completion',
    async (body, message) => {
      const deltas: string[] = []
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response(body))
      await expect(
        streamHtmlWriting({ fetchImpl }, input, undefined, (delta) => deltas.push(delta)),
      ).rejects.toThrow(message)
    },
  )
})
