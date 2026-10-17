import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { FindOptions } from '../shims/ui.js'
import type { PdfMatch, PdfRect, PdfTextSource } from './pdf-text.js'
import {
  createPdfOcrWorker,
  pdfOcrAbortable,
  type OcrBox,
  type OcrPageData,
  type PdfOcrWorker,
} from './pdf-ocr-worker.js'

export const PDF_OCR_LIMITS = {
  pages: 50,
  maxSide: 2048,
  pixels: 4_194_304,
  characters: 100_000,
  totalMs: 600_000,
} as const
export interface OcrViewport {
  width: number
  height: number
  convertToPdfPoint(x: number, y: number): number[]
  convertToViewportPoint(x: number, y: number): number[]
}
export interface PdfOcrToken {
  text: string
  start: number
  end: number
  confidence: number
  /** Actual engine symbol/word corners in PDF user space. Never a PDFium editable object. */
  corners: readonly (readonly [number, number])[]
}
export interface PdfOcrPage {
  provenance: 'local-ocr'
  bytes: Uint8Array
  sourceIndex: number
  text: string
  tokens: readonly PdfOcrToken[]
  confidence: number
}
export interface ProjectedPdfOcrPage extends PdfOcrPage {
  page: number
  viewport: { width: number; height: number }
  boxes: readonly { token: PdfOcrToken; rect: PdfRect; points: readonly number[][] }[]
}
function validBox(box: OcrBox, viewport: OcrViewport) {
  return (
    box &&
    [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) &&
    box.x0 >= 0 &&
    box.y0 >= 0 &&
    box.x1 > box.x0 &&
    box.y1 > box.y0 &&
    box.x1 <= viewport.width + 1 &&
    box.y1 <= viewport.height + 1
  )
}
/** Preserve actual symbol boxes; language spacing is reconstructed only between words. */
export function mapPdfOcrData(
  data: OcrPageData,
  source: PdfTextSource,
  viewport: OcrViewport,
): PdfOcrPage {
  if (!source.bytes) throw new Error('空白页没有可识别图像')
  let text = ''
  const tokens: PdfOcrToken[] = []
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        let previous = ''
        for (const word of line.words ?? []) {
          if (!word.text) continue
          // CJK words commonly contain one character; inserting spaces breaks Chinese copy/search.
          if (
            previous &&
            !(/[\p{Script=Han}]$/u.test(previous) && /^[\p{Script=Han}]/u.test(word.text))
          )
            text += ' '
          const parts = word.symbols?.length ? word.symbols : [word]
          for (const symbol of parts) {
            if (!symbol.text || !validBox(symbol.bbox, viewport)) continue
            const start = text.length
            text += symbol.text
            const { x0, y0, x1, y1 } = symbol.bbox
            const corners = [
              [x0, y0],
              [x1, y0],
              [x1, y1],
              [x0, y1],
            ].map(([x, y]) => {
              const point = viewport.convertToPdfPoint(x!, y!)
              if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]))
                throw new Error('页面识别坐标无效')
              return [point[0]!, point[1]!] as const
            })
            tokens.push({
              text: symbol.text,
              start,
              end: text.length,
              corners,
              confidence: symbol.confidence,
            })
            if (text.length > PDF_OCR_LIMITS.characters)
              throw new Error('本页识别文字超过 100,000 字符，已停止')
          }
          previous = word.text
        }
        if (text && !text.endsWith('\n')) text += '\n'
      }
    }
  if (data.text.trim() && tokens.length === 0) throw new Error('识别未返回可定位字框，请重试')
  return {
    provenance: 'local-ocr',
    bytes: source.bytes,
    sourceIndex: source.index,
    text,
    tokens,
    confidence: data.confidence,
  }
}
export function projectPdfOcrPage(
  result: PdfOcrPage,
  viewport: OcrViewport,
  page: number,
): ProjectedPdfOcrPage {
  const boxes = result.tokens.map((token) => {
    const points = token.corners.map(([x, y]) => viewport.convertToViewportPoint(x, y))
    const xs = points.map((p) => p[0]!),
      ys = points.map((p) => p[1]!)
    const x = Math.min(...xs),
      y = Math.min(...ys)
    return {
      token,
      points,
      rect: {
        x: x / viewport.width,
        y: y / viewport.height,
        width: (Math.max(...xs) - x) / viewport.width,
        height: (Math.max(...ys) - y) / viewport.height,
      },
    }
  })
  return { ...result, page, boxes, viewport: { width: viewport.width, height: viewport.height } }
}
/** Separate read-only search. Returns actual whole symbol/word boxes, never ratio-sliced glyph estimates. */
export function searchPdfOcr(
  pages: readonly ProjectedPdfOcrPage[],
  query: string,
  options: FindOptions,
): PdfMatch[] {
  if (!query) return []
  const matches: PdfMatch[] = []
  for (const page of pages) {
    for (let start = 0; start <= page.text.length - query.length; start++) {
      const found = page.text.slice(start, start + query.length)
      if (
        !query
          .split('')
          .every((char, offset) =>
            options.matchCase
              ? char === found[offset]
              : char.toLowerCase() === found[offset]?.toLowerCase(),
          )
      )
        continue
      if (
        options.wholeWord &&
        (/[A-Za-z0-9_]/.test(page.text[start - 1] ?? '') ||
          /[A-Za-z0-9_]/.test(page.text[start + query.length] ?? ''))
      )
        continue
      const rects = page.boxes
        .filter(({ token }) => token.end > start && token.start < start + query.length)
        .map(({ rect }) => rect)
      if (rects.length) matches.push({ page: page.page, text: found, rects })
      start += query.length - 1
    }
  }
  return matches
}

/** Renders privately from the same source/Rotate/Crop viewport as the canvas, independent of screen zoom. */
export async function recognizePdfOcrPage(
  source: PdfTextSource,
  documentFor: (bytes: Uint8Array) => Promise<PDFDocumentProxy>,
  {
    signal,
    baseUrl,
    onProgress,
    workerFor = createPdfOcrWorker,
  }: {
    signal: AbortSignal
    baseUrl: string
    onProgress?: (progress: number) => void
    workerFor?: typeof createPdfOcrWorker
  },
): Promise<PdfOcrPage | null> {
  signal.throwIfAborted()
  if (!source.bytes) return null
  const doc = await pdfOcrAbortable(documentFor(source.bytes), signal)
  signal.throwIfAborted()
  const page = await pdfOcrAbortable(doc.getPage(source.index + 1), signal)
  const native = await pdfOcrAbortable(page.getTextContent(), signal)
  signal.throwIfAborted()
  if (native.items.some((item) => 'str' in item && item.str.trim())) return null
  const base = page.getViewport({ scale: 1, rotation: 0 })
  const scale = Math.min(
    PDF_OCR_LIMITS.maxSide / Math.max(base.width, base.height),
    Math.sqrt(PDF_OCR_LIMITS.pixels / (base.width * base.height)),
    3,
  )
  if (!(scale > 0) || !Number.isFinite(scale)) throw new Error('页面尺寸无效，不能识别')
  const viewport = page.getViewport({ scale, rotation: 0 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器未提供本地识别所需画布')
  let worker: PdfOcrWorker | null = null
  const render = page.render({ canvas, canvasContext: context, viewport })
  const abort = () => render.cancel()
  signal.addEventListener('abort', abort, { once: true })
  try {
    await render.promise
    signal.throwIfAborted()
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('页面图像生成失败'))),
        'image/png',
      ),
    )
    signal.throwIfAborted()
    worker = await workerFor({
      signal,
      baseUrl,
      onProgress: (progress) =>
        onProgress?.(progress.status === 'recognizing text' ? progress.progress : 0),
    })
    const result = await worker.recognize(new Uint8Array(await blob.arrayBuffer()))
    signal.throwIfAborted()
    const mapped = mapPdfOcrData(result, source, viewport)
    return mapped.text.trim() || mapped.tokens.length ? mapped : null
  } finally {
    signal.removeEventListener('abort', abort)
    worker?.terminate()
    canvas.width = 0
    canvas.height = 0
  }
}
