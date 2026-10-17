import { describe, expect, it, vi } from 'vitest'
import { createPdfOcrWorker, pdfOcrAssetPaths, type OcrTransport } from './pdf-ocr-worker.js'
function transport() {
  const sent: { action: string; payload: unknown; jobId: string }[] = []
  let terminated = false
  const worker: OcrTransport = {
    onmessage: null,
    onerror: null,
    postMessage(value) {
      sent.push(value as (typeof sent)[number])
    },
    terminate() {
      terminated = true
    },
  }
  const reply = (data: unknown = {}, status = 'resolve') => {
    const last = sent.at(-1)!
    worker.onmessage?.({ data: { ...last, data, status } } as MessageEvent)
  }
  return { worker, sent, reply, terminated: () => terminated }
}
async function ready(t: ReturnType<typeof transport>, signal: AbortSignal) {
  const result = createPdfOcrWorker({ signal, baseUrl: '/mimir/', spawn: () => t.worker })
  t.reply()
  await Promise.resolve()
  t.reply()
  await Promise.resolve()
  t.reply()
  return result
}
describe('local OCR worker lifecycle', () => {
  it('uses only prefixed local worker/core/language paths and disables IDB cache', async () => {
    const t = transport(),
      abort = new AbortController()
    const engine = await ready(t, abort.signal)
    expect(pdfOcrAssetPaths('/mimir/')).toEqual({
      worker: '/mimir/pdf-ocr/worker.min.js',
      core: '/mimir/pdf-ocr/tesseract-core-lstm.js',
      lang: '/mimir/pdf-ocr/lang/',
    })
    expect(t.sent.map((item) => item.action)).toEqual(['load', 'loadLanguage', 'initialize'])
    expect(t.sent[1]?.payload).toMatchObject({
      langs: ['eng', 'chi_sim'],
      options: { cacheMethod: 'none', langPath: '/mimir/pdf-ocr/lang/' },
    })
    const recognition = engine.recognize(new Uint8Array([1, 2]))
    expect(t.sent.at(-1)?.payload).toMatchObject({ output: { text: true, blocks: true } })
    t.reply({ text: '中文 hello', blocks: [] })
    expect((await recognition).text).toBe('中文 hello')
    engine.terminate()
    expect(t.terminated()).toBe(true)
  })
  it('terminates and settles initialization rather than leaking createWorker pending promise', async () => {
    const t = transport(),
      abort = new AbortController()
    const engine = createPdfOcrWorker({ signal: abort.signal, baseUrl: '/', spawn: () => t.worker })
    abort.abort()
    await expect(engine).rejects.toMatchObject({ name: 'AbortError' })
    expect(t.terminated()).toBe(true)
    expect(t.worker.onmessage).toBe(null)
  })
  it('settles pending recognition on stop and refuses subsequent work', async () => {
    const t = transport(),
      abort = new AbortController()
    const engine = await ready(t, abort.signal)
    const recognition = engine.recognize(new Uint8Array([1]))
    abort.abort()
    await expect(recognition).rejects.toMatchObject({ name: 'AbortError' })
    await expect(engine.recognize(new Uint8Array([1]))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(t.terminated()).toBe(true)
  })
  it('reports worker load failure and terminates immediately', async () => {
    const t = transport(),
      abort = new AbortController()
    const engine = createPdfOcrWorker({ signal: abort.signal, baseUrl: '/', spawn: () => t.worker })
    t.worker.onerror?.({} as ErrorEvent)
    await expect(engine).rejects.toThrow('加载失败')
    expect(t.terminated()).toBe(true)
  })
  it('initialization timeout terminates the real transport and settles the caller', async () => {
    vi.useFakeTimers()
    try {
      const t = transport(),
        controller = new AbortController()
      const pending = createPdfOcrWorker({
        signal: controller.signal,
        baseUrl: '/',
        spawn: () => t.worker,
      })
      await Promise.all([
        expect(pending).rejects.toThrow('120 秒'),
        vi.advanceTimersByTimeAsync(120_001),
      ])
      expect(t.terminated()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
