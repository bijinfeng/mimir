/** Pinned tesseract.js 7 worker protocol; owns cancellation even before engine initialization. */
export interface OcrBox {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface OcrSymbol {
  text: string
  confidence: number
  bbox: OcrBox
}
export interface OcrWord extends OcrSymbol {
  symbols: OcrSymbol[]
}
export interface OcrLine {
  words: OcrWord[]
}
export interface OcrPageData {
  text: string
  confidence: number
  blocks: { paragraphs: { lines: OcrLine[] }[] }[] | null
}
export interface OcrWorkerProgress {
  status: string
  progress: number
}
export interface PdfOcrWorker {
  recognize(image: Uint8Array): Promise<OcrPageData>
  terminate(): void
}
export interface OcrTransport {
  postMessage(message: unknown): void
  terminate(): void
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}
export function pdfOcrAssetPaths(baseUrl: string) {
  const base = baseUrl.startsWith('/') ? baseUrl.replace(/\/+$/, '') : ''
  return {
    worker: `${base}/pdf-ocr/worker.min.js`,
    core: `${base}/pdf-ocr/tesseract-core-lstm.js`,
    lang: `${base}/pdf-ocr/lang/`,
  }
}

export async function createPdfOcrWorker({
  signal,
  onProgress,
  baseUrl,
  spawn = (url) => new Worker(url),
}: {
  signal: AbortSignal
  onProgress?: (progress: OcrWorkerProgress) => void
  baseUrl: string
  spawn?: (url: string) => OcrTransport
}): Promise<PdfOcrWorker> {
  signal.throwIfAborted()
  const assets = pdfOcrAssetPaths(baseUrl)
  const worker = spawn(assets.worker)
  let sequence = 0
  let closed = false
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: unknown): void }>()
  const stop = (error: unknown) => {
    if (closed) return
    closed = true
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
    worker.onmessage = null
    worker.onerror = null
    worker.terminate()
    for (const job of pending.values()) job.reject(error)
    pending.clear()
  }
  const abort = () => stop(signal.reason ?? new DOMException('已停止识别', 'AbortError'))
  // Covers worker script loading, language initialization and recognition, not only the final job.
  const timeoutError = () => stop(new Error('本页识别超过 120 秒，请重试或降低页面复杂度'))
  let timeout = setTimeout(timeoutError, 120_000)
  signal.addEventListener('abort', abort, { once: true })
  worker.onerror = () => stop(new Error('本地识别引擎加载失败，请检查静态资源后重试'))
  worker.onmessage = ({ data }) => {
    if (closed || !data || typeof data !== 'object') return
    if (data.status === 'progress') {
      if (typeof data.data?.status === 'string' && Number.isFinite(data.data?.progress))
        onProgress?.({
          status: data.data.status,
          progress: Math.max(0, Math.min(1, data.data.progress)),
        })
      return
    }
    const job = pending.get(data.jobId)
    if (!job) return
    pending.delete(data.jobId)
    if (data.status === 'resolve') job.resolve(data.data)
    else if (data.status === 'reject') {
      job.reject(new Error(typeof data.data === 'string' ? data.data : '本地文字识别失败，请重试'))
      stop(new Error('本地文字识别失败，请重试'))
    }
  }
  const run = (action: string, payload: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new DOMException('已停止识别', 'AbortError'))
        return
      }
      const jobId = `mimir-ocr-${++sequence}`
      pending.set(jobId, { resolve, reject })
      try {
        worker.postMessage({ workerId: 'mimir-ocr', jobId, action, payload })
      } catch (error) {
        stop(error)
      }
    })
  try {
    await run('load', { options: { lstmOnly: true, corePath: assets.core, logging: false } })
    await run('loadLanguage', {
      langs: ['eng', 'chi_sim'],
      options: {
        langPath: assets.lang,
        gzip: true,
        cacheMethod: 'none',
        lstmOnly: true,
      },
    })
    await run('initialize', { langs: ['eng', 'chi_sim'], oem: 1, config: {} })
    return {
      recognize: async (image) => {
        clearTimeout(timeout)
        timeout = setTimeout(timeoutError, 120_000)
        const result = await run('recognize', {
          image,
          options: {},
          output: { text: true, blocks: true },
        })
        if (
          !result ||
          typeof result !== 'object' ||
          !('text' in result) ||
          typeof result.text !== 'string'
        )
          throw new Error('本地识别引擎未返回有效文字')
        return result as OcrPageData
      },
      terminate: () => stop(new DOMException('识别已结束', 'AbortError')),
    }
  } catch (error) {
    stop(error)
    throw error
  }
}

/** Abort waiting without destroying shared PDF.js documents or leaving a rejected promise unobserved. */
export function pdfOcrAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('已停止识别', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
