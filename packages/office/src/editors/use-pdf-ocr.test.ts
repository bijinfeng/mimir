import { describe, expect, it, vi } from 'vitest'
import { PdfOcrSession } from './use-pdf-ocr.js'
import type { PdfTextSource } from './pdf-text.js'
import type { PdfOcrPage } from './pdf-ocr.js'
import { recognizePdfOcrPage } from './pdf-ocr.js'
import { createPdfOcrWorker } from './pdf-ocr-worker.js'
const bytes = new Uint8Array([1, 2, 3])
const source = (index: number): PdfTextSource => ({ bytes, index, rotation: 0 })
const result = (item: PdfTextSource): PdfOcrPage => ({
  bytes: item.bytes!,
  sourceIndex: item.index,
  text: `第${item.index}页`,
  tokens: [],
  confidence: 90,
  provenance: 'local-ocr',
})
const documentFor = async () => {
  throw new Error('mock recognition owns the page')
}
describe('OCR session lifecycle without document edits', () => {
  it('keeps imported and original pages distinct despite equal page indices', async () => {
    const imported = { bytes: bytes.slice(), index: 0, rotation: 90 }
    const visited: PdfTextSource[] = []
    const recognize: typeof recognizePdfOcrPage = async (item) => {
      visited.push(item)
      return result(item)
    }
    const session = new PdfOcrSession(documentFor, '/', recognize)
    await session.start([source(0), imported], 1, 'scanned')
    expect(visited.map((item) => item.bytes)).toEqual([imported.bytes, bytes])
    expect(session.getState().results).toHaveLength(2)
    session.retain([imported])
    expect(session.getState().results).toHaveLength(1)
    expect(session.getState().results[0]?.bytes).toBe(imported.bytes)
    session.dispose()
  })
  it('scans current first then sequentially, skips native pages and reuses one engine', async () => {
    const visited: number[] = [],
      terminated: boolean[] = []
    let workers = 0
    const recognize: typeof recognizePdfOcrPage = async (item, _doc, options) => {
      visited.push(item.index)
      if (item.index === 1) return null
      const engine = await options.workerFor!({ signal: options.signal, baseUrl: '/' })
      engine.terminate() // Per-page cleanup cannot terminate the shared worker.
      return result(item)
    }
    const factory: typeof createPdfOcrWorker = async () => {
      workers++
      return {
        recognize: async () => {
          throw new Error('not needed')
        },
        terminate: () => terminated.push(true),
      }
    }
    const session = new PdfOcrSession(documentFor, '/', recognize, factory)
    await session.start([source(0), source(1), source(2)], 2, 'scanned')
    expect(visited).toEqual([2, 0, 1])
    expect(workers).toBe(1)
    expect(terminated).toEqual([true])
    expect(session.getState().results.map((r) => r.sourceIndex)).toEqual([2, 0])
    expect(session.getState().running).toBe(false)
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
    await session.start([source(0), source(1), source(2)], 0, 'current')
    expect(visited).toEqual([2, 0, 1])
    session.retain([source(0)])
    expect(session.getState().results.map((r) => r.sourceIndex)).toEqual([0])
    session.dispose()
  })
  it('stopping/clearing discards a late result and permits retry', async () => {
    let release: ((value: PdfOcrPage) => void) | undefined
    const recognize: typeof recognizePdfOcrPage = async () =>
      new Promise((resolve) => {
        release = resolve
      })
    const session = new PdfOcrSession(documentFor, '/', recognize)
    const pending = session.start([source(0)], 0, 'current')
    session.clear()
    release!(result(source(0)))
    await pending
    expect(session.getState().results).toEqual([])
    expect(session.getState().running).toBe(false)
    session.dispose()
  })
  it('rejects excess pages before initializing a worker and retains a retryable error', async () => {
    const session = new PdfOcrSession(documentFor, '/')
    await session.start(
      Array.from({ length: 51 }, (_, index) => source(index)),
      0,
      'scanned',
    )
    expect(session.getState().error).toContain('最多识别 50 页')
    expect(session.getState().running).toBe(false)
    session.dispose()
  })
  it('native/empty page and failure cannot fake a successful result', async () => {
    const recognize: typeof recognizePdfOcrPage = async () => {
      throw new Error('缺少本地语言资源')
    }
    const session = new PdfOcrSession(documentFor, '/', recognize)
    await session.start([source(0)], 0, 'current')
    expect(session.getState().error).toBe('缺少本地语言资源')
    expect(session.getState().results).toEqual([])
    session.clear()
    expect(session.getState().error).toBe(null)
    session.dispose()
  })
  it('bounds a stalled raster or recognition promise with the complete page deadline', async () => {
    vi.useFakeTimers()
    try {
      const recognize: typeof recognizePdfOcrPage = () => new Promise(() => {})
      const session = new PdfOcrSession(documentFor, '/', recognize)
      const pending = session.start([source(0)], 0, 'current')
      await vi.advanceTimersByTimeAsync(120_001)
      await pending
      expect(session.getState().running).toBe(false)
      expect(session.getState().error).toContain('120 秒')
      session.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
  it('terminates initialization immediately when raster preparation used part of the page deadline', async () => {
    vi.useFakeTimers()
    try {
      const terminate = vi.fn<() => void>()
      const factory: typeof createPdfOcrWorker = (options) =>
        createPdfOcrWorker({
          ...options,
          spawn: () => ({
            postMessage() {},
            terminate,
            onmessage: null,
            onerror: null,
          }),
        })
      const recognize: typeof recognizePdfOcrPage = async (item, _document, options) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await options.workerFor!({ signal: options.signal, baseUrl: '/' })
        return result(item)
      }
      const session = new PdfOcrSession(documentFor, '/', recognize, factory)
      const pending = session.start([source(0)], 0, 'current')
      await vi.advanceTimersByTimeAsync(120_001)
      await pending
      expect(session.getState().error).toContain('120 秒')
      expect(terminate).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
      session.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
