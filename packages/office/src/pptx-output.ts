import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { renderSlide, type PptxRenderable, type RenderedSlide } from './pptx-render.js'

export type PptxOutputFormat = 'pdf' | 'png' | 'svg'
export interface PptxOutputOptions {
  format: PptxOutputFormat
  indices: readonly number[]
  width: number
  signal?: AbortSignal
  isCurrent?: () => boolean
}
export interface PptxOutputFile {
  bytes: Uint8Array<ArrayBuffer>
  mime: string
  name: string
}
export function pptxOutputIndices(text: string, count: number): number[] {
  const indices = new Set<number>()
  for (const item of text.split(/[,，]/)) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(item)
    if (!match) throw new Error('页码请写成 1-3,5')
    const first = Number(match[1]),
      last = Number(match[2] ?? match[1])
    if (first < 1 || last < first || last > count) throw new Error(`页码须在 1–${count} 内`)
    for (let i = first; i <= last; i++) indices.add(i - 1)
  }
  return [...indices].toSorted((a, b) => a - b)
}

/** Only the editor's self-contained SVG is decoded; no remote image fetch occurs here. */
export async function rasterizePptxSvg(
  svg: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (width <= 0 || height <= 0 || width * height > 24_000_000)
    throw new Error('图片尺寸超过处理上限')
  await waitForPptxOutput(document.fonts?.ready, signal)
  signal?.throwIfAborted()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      const cancelled = () => {
        image.src = ''
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      }
      signal?.addEventListener('abort', cancelled, { once: true })
      const clean = () => signal?.removeEventListener('abort', cancelled)
      image.addEventListener(
        'load',
        () => {
          clean()
          resolve()
        },
        { once: true },
      )
      image.addEventListener(
        'error',
        () => {
          clean()
          reject(new Error('无法渲染幻灯片图片，请尝试 SVG 导出'))
        },
        { once: true },
      )
      image.src = url
    })
    signal?.throwIfAborted()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width)
    canvas.height = Math.round(height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('浏览器无法创建导出画布')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    canvas.width = canvas.height = 0
    if (!blob) throw new Error('PNG 编码失败，请重试')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function buildPptxOutput(
  deck: PptxRenderable,
  options: PptxOutputOptions,
  rasterize = rasterizePptxSvg,
): Promise<PptxOutputFile> {
  if (!options.indices.length || options.indices.length > 200)
    throw new Error('每次请选择 1–200 页')
  if (![1280, 1920, 2560].includes(options.width)) throw new Error('请选择受支持的导出分辨率')
  checkPptxOutput(options)
  // Freeze every page before the first await: a mutable live session must never mix versions.
  const pages = options.indices.map((index) => {
    const page = renderSlide(deck, index, {
      fitWidthPx: options.width,
      svgIdPrefix: `output-${index}`,
    })
    if (!page) throw new Error('所选幻灯片已不存在，请重新选择')
    return page
  })
  const widthPt = deck.size.cx / 12700,
    heightPt = deck.size.cy / 12700
  const pdf = options.format === 'pdf' ? await PDFDocument.create() : null
  const zip = new JSZip()
  let total = 0
  let single: Uint8Array<ArrayBuffer> | undefined
  for (let position = 0; position < pages.length; position++) {
    checkPptxOutput(options)
    const index = options.indices[position]!
    const page = pages[position]!
    const bytes =
      options.format === 'svg'
        ? new TextEncoder().encode(page.svg)
        : await waitForPptxOutput(
            rasterize(page.svg, page.widthPx, page.heightPx, options.signal),
            options.signal,
          )
    checkPptxOutput(options)
    total += bytes.length
    if (total > 64 * 1024 * 1024) throw new Error('导出内容超过 64 MiB，请分批导出或降低分辨率')
    if (pdf) {
      const image = await pdf.embedPng(bytes)
      pdf
        .addPage([widthPt, heightPt])
        .drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt })
    } else {
      zip.file(`slide-${String(index + 1).padStart(3, '0')}.${options.format}`, bytes)
      single = new Uint8Array(bytes)
    }
  }
  if (pdf) {
    const bytes = new Uint8Array(await pdf.save())
    checkPptxOutput(options)
    return { bytes, name: 'slides.pdf', mime: 'application/pdf' }
  }
  if (options.indices.length === 1 && single)
    return {
      bytes: single,
      name: `slide-${options.indices[0]! + 1}.${options.format}`,
      mime: options.format === 'svg' ? 'image/svg+xml' : 'image/png',
    }
  const bytes = new Uint8Array(
    await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
  )
  checkPptxOutput(options)
  return {
    bytes,
    name: `slides-${options.format}.zip`,
    mime: 'application/zip',
  }
}

export function downloadPptxOutput(file: PptxOutputFile): void {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type PptxPrintLayout = 'full' | 'notes' | 'handout2' | 'handout3' | 'handout6'
export interface PptxPrintOptions {
  layout?: PptxPrintLayout
  orientation?: 'portrait' | 'landscape'
  frame?: boolean
  /** Notes are already ordered by the selected slide indices. */
  notes?: readonly string[]
  signal?: AbortSignal
  isCurrent?: () => boolean
}
export function checkPptxOutput(options: {
  signal?: AbortSignal
  isCurrent?: () => boolean
}): void {
  options.signal?.throwIfAborted()
  if (options.isCurrent && !options.isCurrent()) throw new Error('文稿已更改，请重新输出当前版本')
}
/** Cancellation also releases a pending font/image wait; it never allows a late print. */
export function waitForPptxOutput<T>(value: PromiseLike<T> | T, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', cancel, { once: true })
    Promise.resolve(value).then(
      (result) => {
        signal?.removeEventListener('abort', cancel)
        resolve(result)
      },
      (error: unknown) => {
        signal?.removeEventListener('abort', cancel)
        reject(error)
      },
    )
  })
}
export function pptxCopyFilename(value: string): string {
  const base = value
    .trim()
    .replace(/\.pptx$/i, '')
    .trim()
  if (
    !base ||
    base === '.' ||
    base === '..' ||
    /[<>:"/\\|?*]/.test(base) ||
    [...base].some((c) => c.charCodeAt(0) < 32)
  )
    throw new Error('请输入有效文件名，不含斜杠或特殊字符')
  if (base.length > 175) throw new Error('文件名过长，请缩短至 175 个字符以内')
  return `${base}.pptx`
}
export async function buildPptxCopy(
  save: (options: { signal: AbortSignal }) => Promise<Uint8Array>,
  filename: string,
  options: { signal: AbortSignal; isCurrent?: () => boolean },
): Promise<PptxOutputFile> {
  const name = pptxCopyFilename(filename)
  checkPptxOutput(options)
  const bytes = await waitForPptxOutput(save({ signal: options.signal }), options.signal)
  checkPptxOutput(options)
  if (!bytes.length) throw new Error('无法生成演示文稿副本，请重试')
  return {
    bytes: new Uint8Array(bytes),
    name,
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
}
export function pptxPrintPageCount(count: number, layout: PptxPrintLayout): number {
  return Math.ceil(
    count / (layout === 'handout2' ? 2 : layout === 'handout3' ? 3 : layout === 'handout6' ? 6 : 1),
  )
}
export function pptxPrintPageSize(
  widthPt: number,
  heightPt: number,
  options: PptxPrintOptions = {},
) {
  if (![widthPt, heightPt].every((n) => Number.isFinite(n) && n > 0))
    throw new Error('幻灯片尺寸无效')
  if (!options.layout || options.layout === 'full') return { width: widthPt, height: heightPt }
  return options.orientation === 'landscape'
    ? { width: 841.68, height: 595.44 }
    : { width: 595.44, height: 841.68 }
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const printSlide = (page: RenderedSlide) => `<div class="slide">${page.svg}</div>`
export function pptxPrintDocument(
  pages: readonly RenderedSlide[],
  widthPt: number,
  heightPt: number,
  options: PptxPrintOptions = {},
): string {
  const layout = options.layout ?? 'full'
  const size = pptxPrintPageSize(widthPt, heightPt, options)
  const landscape = options.orientation === 'landscape'
  let body: string
  if (layout === 'full')
    body = pages.map((page) => `<section class="page">${printSlide(page)}</section>`).join('')
  else if (layout === 'notes')
    body = pages
      .map(
        (page, i) =>
          `<section class="page notes">${printSlide(page)}<div class="note">${escapeHtml(options.notes?.[i] ?? '')}</div></section>`,
      )
      .join('')
  else {
    const perPage = layout === 'handout2' ? 2 : layout === 'handout3' ? 3 : 6
    const sheets: string[] = []
    for (let i = 0; i < pages.length; i += perPage)
      sheets.push(
        `<section class="page handout h${perPage}">${pages
          .slice(i, i + perPage)
          .map(
            (page) =>
              `<div class="cell">${printSlide(page)}${perPage === 3 ? '<div class="rules"></div>' : ''}</div>`,
          )
          .join('')}</section>`,
      )
    body = sheets.join('')
  }
  // SVG keeps selectable text and self-contained media; notes never enter HTML unescaped.
  return `<!doctype html><html><head><meta charset="utf-8"><title>打印演示文稿</title><style>
@page{size:${size.width}pt ${size.height}pt;margin:0}
html,body{margin:0;font-family:system-ui,sans-serif;color:#111;background:#fff}
.page{width:${size.width}pt;height:${size.height}pt;break-after:page;overflow:hidden;box-sizing:border-box;background:#fff}
.page:last-child{break-after:auto}.slide{min-width:0;min-height:0;aspect-ratio:${widthPt}/${heightPt}}
.page>.slide{width:100%;height:100%}svg{width:100%;height:100%;display:block}
${options.frame && layout === 'full' ? '.page>.slide{border:1px solid #999;box-sizing:border-box}' : ''}
.handout{padding:28.8pt;display:flex;flex-direction:${landscape && layout === 'handout2' ? 'row' : 'column'};gap:17.28pt}
.cell{display:flex;flex:1;gap:14.4pt;align-items:center;min-width:0;min-height:0}
.cell .slide,.notes .slide{border:1px solid #aaa;box-sizing:border-box}
.cell .slide{width:100%;max-height:100%}.h3 .slide{width:55%;flex:none}
.h3 .rules{flex:1;align-self:stretch;background:repeating-linear-gradient(#fff 0 20pt,#bbb 20pt 20.7pt)}
.h6{display:grid;grid-template-columns:repeat(${landscape ? 3 : 2},minmax(0,1fr));grid-template-rows:repeat(${landscape ? 2 : 3},minmax(0,1fr))}
.notes{padding:36pt;display:flex;flex-direction:column}.notes>.slide{width:${landscape ? '65%' : '100%'};height:auto;max-height:55%;flex:none;align-self:center}
.note{margin-top:21.6pt;font-size:11pt;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>${body}</body></html>`
}
export function pptxPrintPreviewDocument(html: string, pageWidthPt: number): string {
  return html.replace(
    '</style>',
    `@media screen{body{padding:6px;display:flex;flex-direction:column;gap:8px;background:#e8e8e8}.page{flex:none;zoom:${252 / ((pageWidthPt * 96) / 72)}}}</style>`,
  )
}
export async function printPptx(
  deck: PptxRenderable,
  indices: readonly number[],
  options: PptxPrintOptions = {},
): Promise<void> {
  if (!indices.length || indices.length > 200) throw new Error('每次请选择 1–200 页')
  checkPptxOutput(options)
  const pages = indices.map((index) => {
    const page = renderSlide(deck, index, { fitWidthPx: 1280, svgIdPrefix: `print-${index}` })
    if (!page) throw new Error('所选幻灯片已不存在，请重新选择')
    return page
  })
  const html = pptxPrintDocument(pages, deck.size.cx / 12700, deck.size.cy / 12700, options)
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('打印窗口被拦截，请允许此站点打开弹窗后重试')
  const cancel = () => {
    if (!popup.closed) popup.close()
  }
  options.signal?.addEventListener('abort', cancel, { once: true })
  try {
    popup.opener = null
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    // HTMLDocument.images excludes SVG <image>; decode those self-contained media too.
    const svgMedia = new Set(
      Array.from(popup.document.querySelectorAll('svg image')).flatMap((image) => {
        const href = image.getAttribute('href') ?? image.getAttribute('xlink:href')
        return href ? [href] : []
      }),
    )
    await waitForPptxOutput(
      Promise.all([
        popup.document.fonts?.ready,
        ...Array.from(popup.document.images).map((img) => img.decode()),
        ...Array.from(svgMedia).map((src) => {
          const image = popup.document.createElement('img')
          image.src = src
          return image.decode()
        }),
      ]),
      options.signal,
    )
    checkPptxOutput(options)
    if (popup.closed) throw new Error('打印窗口已关闭，请重新打开')
    popup.addEventListener('afterprint', cancel, { once: true })
    popup.focus()
    popup.print()
  } catch (error) {
    cancel()
    throw error
  } finally {
    options.signal?.removeEventListener('abort', cancel)
  }
}
