import { useEffect, useMemo, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfTextSource } from './pdf-text.js'
import { createPdfOcrWorker, pdfOcrAbortable, type PdfOcrWorker } from './pdf-ocr-worker.js'
import {
  PDF_OCR_LIMITS,
  projectPdfOcrPage,
  recognizePdfOcrPage,
  type PdfOcrPage,
  type ProjectedPdfOcrPage,
} from './pdf-ocr.js'

const NO_OCR_PAGES: ProjectedPdfOcrPage[] = []

export interface PdfOcrState {
  running: boolean
  done: number
  total: number
  page: number
  progress: number
  error: string | null
  status: string
  results: readonly PdfOcrPage[]
}
const empty = (): PdfOcrState => ({
  running: false,
  done: 0,
  total: 0,
  page: 0,
  progress: 0,
  error: null,
  status: '',
  results: [],
})
export class PdfOcrSession {
  private state = empty()
  private listeners = new Set<() => void>()
  private request: AbortController | null = null
  private runningSources: readonly PdfTextSource[] | null = null
  constructor(
    private readonly documentFor: (bytes: Uint8Array) => Promise<PDFDocumentProxy>,
    private readonly baseUrl: string,
    private readonly recognize = recognizePdfOcrPage,
    private readonly workerFor = createPdfOcrWorker,
  ) {}
  getState = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(update: Partial<PdfOcrState>) {
    this.state = { ...this.state, ...update }
    for (const notify of this.listeners) notify()
  }
  stop = () => {
    if (!this.request) return
    this.request.abort(new DOMException('已停止识别', 'AbortError'))
    this.request = null
    this.publish({ running: false, status: '已停止；已完成的临时文字仍可复制与搜索' })
  }
  interrupt(sources: readonly PdfTextSource[]) {
    if (this.runningSources === sources) this.stop()
  }
  clear = () => {
    this.stop()
    this.state = empty()
    for (const notify of this.listeners) notify()
  }
  retain(sources: readonly PdfTextSource[]) {
    const results = this.state.results.filter((result) =>
      sources.some(
        (source) => source.bytes === result.bytes && source.index === result.sourceIndex,
      ),
    )
    if (results.length !== this.state.results.length) this.publish({ results })
  }
  dispose = () => {
    this.request?.abort()
    this.request = null
    this.listeners.clear()
    this.state = empty()
  }
  async start(sources: readonly PdfTextSource[], active: number, scope: 'current' | 'scanned') {
    if (this.request) return
    const ordered =
      scope === 'current'
        ? [active]
        : [...sources.keys()].map((offset) => (active + offset) % sources.length)
    if (ordered.length > PDF_OCR_LIMITS.pages) {
      this.publish({ error: '一次最多识别 50 页；请先拆分较大的文件', status: '' })
      return
    }
    const controller = new AbortController()
    this.request = controller
    this.runningSources = sources
    const signal = controller.signal
    const timeout = setTimeout(
      () => controller.abort(new Error('识别已达 10 分钟限制；已完成的临时结果保留，请分次识别')),
      PDF_OCR_LIMITS.totalMs,
    )
    let worker: PdfOcrWorker | null = null
    let recognized = 0,
      skipped = 0
    this.publish({
      running: true,
      done: 0,
      total: ordered.length,
      progress: 0,
      error: null,
      status: '正在准备本地识别引擎',
    })
    try {
      for (const [offset, page] of ordered.entries()) {
        signal.throwIfAborted()
        const source = sources[page]
        if (!source?.bytes) {
          skipped++
          this.publish({ done: offset + 1 })
          continue
        }
        if (
          this.state.results.some(
            (result) => result.bytes === source.bytes && result.sourceIndex === source.index,
          )
        ) {
          skipped++
          this.publish({ done: offset + 1 })
          continue
        }
        this.publish({ page, progress: 0, status: `正在识别第 ${page + 1} 页` })
        const pageTimeout = new AbortController()
        const pageSignal = AbortSignal.any([signal, pageTimeout.signal])
        const pageTimer = setTimeout(
          () => pageTimeout.abort(new Error('本页识别超过 120 秒，请重试')),
          120_000,
        )
        let result: PdfOcrPage | null
        try {
          result = await pdfOcrAbortable(
            this.recognize(source, this.documentFor, {
              signal: pageSignal,
              baseUrl: this.baseUrl,
              onProgress: (progress) => {
                if (!signal.aborted) this.publish({ progress })
              },
              workerFor: async (options) => {
                worker ??= await this.workerFor({ ...options, signal })
                return { recognize: worker.recognize, terminate() {} }
              },
            }),
            pageSignal,
          )
        } finally {
          clearTimeout(pageTimer)
        }
        signal.throwIfAborted()
        if (result) {
          const characters = this.state.results.reduce(
            (sum, item) => sum + item.text.length,
            result.text.length,
          )
          if (characters > PDF_OCR_LIMITS.characters)
            throw new Error('临时识别文字总计超过 100,000 字符；请清除结果后分次识别')
          recognized++
          this.publish({ results: [...this.state.results, result] })
        } else skipped++
        this.publish({ done: offset + 1, progress: 1 })
      }
      this.publish({
        status: `识别完成：${recognized} 页；跳过 ${skipped} 个原生文字、空白或已识别页面`,
      })
    } catch (error) {
      if (this.request === controller)
        this.publish({
          error: error instanceof Error && error.name !== 'AbortError' ? error.message : null,
          status: signal.aborted ? '已停止；已完成的临时结果保留' : '识别失败，可重试',
        })
    } finally {
      clearTimeout(timeout)
      // The shared worker can still be initializing when the complete page deadline wins.
      // Abort its scan signal even when its factory has not returned a worker handle yet.
      controller.abort()
      const finalWorker = worker as PdfOcrWorker | null
      finalWorker?.terminate()
      if (this.request === controller) {
        this.request = null
        this.runningSources = null
        this.publish({ running: false })
      }
    }
  }
}

/** Session identity follows immutable source bytes; reorder/rotation only reprojects genuine PDF corners. */
export function usePdfOcr(
  identity: unknown,
  sources: readonly PdfTextSource[],
  documentFor: (bytes: Uint8Array) => Promise<PDFDocumentProxy>,
  baseUrl: string,
) {
  const binding = useMemo(
    () => ({ identity, session: new PdfOcrSession(documentFor, baseUrl) }),
    [identity, documentFor, baseUrl],
  )
  const session = binding.session
  const [observed, setObserved] = useState<{ session: PdfOcrSession; state: PdfOcrState } | null>(
    null,
  )
  const state = observed?.session === session ? observed.state : session.getState()
  useEffect(() => {
    const unsubscribe = session.subscribe(() => setObserved({ session, state: session.getState() }))
    return () => {
      unsubscribe()
      session.dispose()
    }
  }, [session])
  // A new layout interrupts sequential scanning. Completed source-bound results can safely reproject.
  useEffect(
    () => () => {
      session.interrupt(sources)
    },
    [session, sources],
  )
  useEffect(() => {
    session.retain(sources)
  }, [session, sources])
  const [projection, setProjection] = useState<{
    sources: readonly PdfTextSource[]
    results: readonly PdfOcrPage[]
    pages: ProjectedPdfOcrPage[]
  } | null>(null)
  useEffect(() => {
    let stale = false
    void Promise.all(
      sources.map(async (source, page) => {
        const result = state.results.find(
          (item) => item.bytes === source.bytes && item.sourceIndex === source.index,
        )
        if (!result || !source.bytes) return null
        const doc = await documentFor(source.bytes)
        const proxy = await doc.getPage(source.index + 1)
        return projectPdfOcrPage(
          result,
          proxy.getViewport({ scale: 1, rotation: source.rotation }),
          page,
        )
      }),
    ).then(
      (items) => {
        if (!stale)
          setProjection({
            sources,
            results: state.results,
            pages: items.filter((item) => item !== null),
          })
      },
      () => {
        if (!stale) setProjection({ sources, results: state.results, pages: [] })
      },
    )
    return () => {
      stale = true
    }
  }, [sources, state.results, documentFor])
  const pages =
    projection?.sources === sources && projection.results === state.results
      ? projection.pages
      : NO_OCR_PAGES
  return { session, state, pages }
}
