import { api, configureApiTransport } from './api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PptxDeckProgressListener } from '@mimir/shared'
import { streamPptxDeck } from './pptx-deck-stream'
const generationId = 'generation-1'
const progress = (completed: number, stage: string = 'checkpoint') => ({
  generationId,
  total: 3,
  completed,
  stage,
  insertMode: 'replace',
  originalPages: 1,
})
const checkpoint = (completed: number) => ({
  type: 'checkpoint',
  progress: progress(completed),
  bytesBase64: 'UEsDBA==',
  data: { pages: completed, style: '简洁', topic: '真实主题' },
  sampleData: false,
})
const lines = (...events: unknown[]) => events.map((e) => JSON.stringify(e) + '\n').join('')
const run = (body: string, onProgress = vi.fn<PptxDeckProgressListener>(async () => {})) =>
  streamPptxDeck(
    { fetchImpl: async () => new Response(body) },
    new FormData(),
    7,
    generationId,
    undefined,
    onProgress,
  )
describe('PPTX page stream contract', () => {
  afterEach(() => configureApiTransport({}))
  it('delivers completed pages before the third page finishes and validates a clean terminal', async () => {
    let control!: ReadableStreamDefaultController<Uint8Array>
    const observe = vi.fn<PptxDeckProgressListener>(async () => {})
    const pending = streamPptxDeck(
      {
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(c) {
                control = c
              },
            }),
          ),
      },
      new FormData(),
      7,
      generationId,
      undefined,
      observe,
    )
    await Promise.resolve()
    await Promise.resolve()
    const first = new TextEncoder().encode(
      lines({ type: 'progress', progress: progress(0, 'planning') }, checkpoint(1), checkpoint(2)),
    )
    control.enqueue(first.slice(0, 37))
    control.enqueue(first.slice(37))
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(3))
    expect(observe.mock.calls[2]?.[0]).toMatchObject({ completed: 2 })
    control.enqueue(
      new TextEncoder().encode(lines(checkpoint(3), { type: 'done', generationId, completed: 3 })),
    )
    control.close()
    expect(await pending).toMatchObject({
      version: 8,
      changed: true,
      data: { pages: 3 },
      bytes: new Uint8Array([80, 75, 3, 4]),
    })
  })
  it.each([
    [lines(checkpoint(1)), '未完整结束'],
    [lines(checkpoint(1)) + '{"type":"checkpoint"', '未完整结束'],
    [lines(checkpoint(2)), '页序'],
    [lines(checkpoint(1), { type: 'done', generationId, completed: 1 }), '终局不完整'],
    [lines({ ...checkpoint(1), progress: { ...progress(1), generationId: 'other' } }), '会话'],
    [
      lines(checkpoint(1), {
        type: 'progress',
        progress: { ...progress(1, 'generating'), total: 4 },
      }),
      '计划',
    ],
  ])('rejects invalid streams with no permission to retain partial output', async (body, text) => {
    await expect(run(body)).rejects.toMatchObject({
      message: expect.stringContaining(text),
      partialAllowed: false,
    })
  })
  it('rejects event-budget exhaustion and trailing events without partial permission', async () => {
    const repeats = Array.from({ length: 251 }, () => ({
      type: 'progress',
      progress: progress(0, 'planning'),
    }))
    await expect(run(lines(...repeats))).rejects.toMatchObject({ partialAllowed: false })
    await expect(
      run(
        lines(
          checkpoint(1),
          checkpoint(2),
          checkpoint(3),
          { type: 'done', generationId, completed: 3 },
          { type: 'progress', progress: progress(3, 'generating') },
        ),
      ),
    ).rejects.toMatchObject({ partialAllowed: false })
  })
  it('wires current source identity and cancellation through the real API multipart path', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          lines(checkpoint(1), checkpoint(2), checkpoint(3), {
            type: 'done',
            generationId,
            completed: 3,
          }),
        ),
    )
    configureApiTransport({
      fetchImpl,
      baseUrl: 'https://mimir.example',
      headers: { 'X-Test': 'deck' },
    })
    const onDeckProgress = vi.fn<PptxDeckProgressListener>(async () => {})
    const signal = new AbortController().signal
    const result = await api.documents.applyPptxOps({
      documentId: 'current-document',
      generationId,
      expectedVersion: 7,
      action: 'generate_deck',
      bytes: new Uint8Array([1, 2]),
      ops: [{ topic: '中文主题' }],
      signal,
      onDeckProgress,
    })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://mimir.example/api/conversations/pptx-agent/apply-ops?stream=1')
    expect(init).toMatchObject({ signal, credentials: 'include', headers: { 'X-Test': 'deck' } })
    const form = init!.body as FormData
    expect(form.get('generationId')).toBe(generationId)
    expect(form.get('documentId')).toBe('current-document')
    expect(form.get('expectedVersion')).toBe('7')
    expect(form.get('ops')).toBe('[{"topic":"中文主题"}]')
    expect(new Uint8Array(await (form.get('file') as File).arrayBuffer())).toEqual(
      new Uint8Array([1, 2]),
    )
    expect(onDeckProgress).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ changed: true, version: 8 })
  })
  it('only permits partial retention after a clean explicit recoverable server terminal', async () => {
    const error = { type: 'error', generationId, message: '第三页生成失败', recoverable: true }
    await expect(run(lines(checkpoint(1), checkpoint(2), error))).rejects.toMatchObject({
      partialAllowed: true,
    })
    await expect(run(lines(error))).rejects.toMatchObject({ partialAllowed: false })
    await expect(run(lines(checkpoint(1), error) + '{')).rejects.toMatchObject({
      partialAllowed: false,
    })
    await expect(run(lines(checkpoint(1), { ...error, recoverable: false }))).rejects.toMatchObject(
      { partialAllowed: false },
    )
  })
  it('independent: decodes Chinese and supplementary characters split at every UTF-8 byte', async () => {
    const stream = lines(
      { ...checkpoint(1), data: { pages: 1, style: '中文😀', topic: '主题𠮷' } },
      { type: 'error', generationId, message: '第三页失败😀', recoverable: true },
    )
    const encoded = new TextEncoder().encode(stream)
    const observe = vi.fn<PptxDeckProgressListener>(async () => {})
    const running = streamPptxDeck(
      {
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (const byte of encoded) controller.enqueue(new Uint8Array([byte]))
                controller.close()
              },
            }),
          ),
      },
      new FormData(),
      0,
      generationId,
      undefined,
      observe,
    )
    await expect(running).rejects.toMatchObject({
      partialAllowed: true,
      message: '第三页失败😀',
    })
    expect(observe.mock.calls[0]?.[1]?.data).toEqual({
      pages: 1,
      style: '中文😀',
      topic: '主题𠮷',
    })
  })
})
