import JSZip from 'jszip'
import { renderPdfPageImage, retainPdfImageExport } from './pdf-render.js'

/** Page numbers are displayed order, not the source file's old page indexes. */
export function pdfImagePages(range: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('PDF 中没有可导出的页面')
  if (!range.trim()) throw new Error('请输入页码，例如 1-3,5')
  const pages = new Set<number>()
  for (const part of range.split(/[,，]/)) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part)
    if (!match) throw new Error('页码格式无效，请使用 1-3,5 这样的范围')
    const first = Number(match[1])
    const last = Number(match[2] ?? match[1])
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      first < 1 ||
      last > pageCount
    )
      throw new Error(`页码须在 1 到 ${pageCount} 之间`)
    if (last < first) throw new Error('页码范围的结束页须不小于起始页')
    for (let n = first; n <= last; n += 1) pages.add(n)
  }
  return [...pages].toSorted((a, b) => a - b)
}

export interface PdfPageImageOutput {
  bytes: Uint8Array
  mime: 'image/png' | 'application/zip'
  name: string
  pages: { page: number; width: number; height: number }[]
  preview: Uint8Array
}

/** Complete the full batch before offering a single explicit download. */
export async function exportPdfPageImages({
  bytes,
  pages,
  dpi,
  signal,
  assertCurrent,
  onProgress,
}: {
  bytes: Uint8Array
  pages: number[]
  dpi: number
  signal: AbortSignal
  assertCurrent(): void
  onProgress(done: number, total: number): void
}): Promise<PdfPageImageOutput> {
  if (!pages.length) throw new Error('请选择至少一页')
  const zip = new JSZip()
  const dimensions: PdfPageImageOutput['pages'] = []
  let totalSize = 0
  let first: Uint8Array | null = null
  const check = () => {
    signal.throwIfAborted()
    assertCurrent()
  }
  const release = retainPdfImageExport(bytes)
  try {
    for (const [index, page] of pages.entries()) {
      check()
      const image = await renderPdfPageImage({ bytes, pageIndex: page - 1, dpi, signal })
      check()
      totalSize += image.bytes.byteLength
      if (totalSize > 128 * 1024 * 1024)
        throw new Error('图像总大小超过 128 MiB，请减少页数或降低分辨率')
      first ??= image.bytes
      dimensions.push({ page, width: image.width, height: image.height })
      zip.file(`page-${String(page).padStart(3, '0')}.png`, image.bytes)
      onProgress(index + 1, pages.length)
    }
    check()
    const output =
      pages.length === 1
        ? first!
        : await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }, () => check())
    check()
    return {
      bytes: output,
      preview: first!,
      name: pages.length === 1 ? `page-${String(pages[0]).padStart(3, '0')}.png` : 'pdf-pages.zip',
      mime: pages.length === 1 ? 'image/png' : 'application/zip',
      pages: dimensions,
    }
  } finally {
    release()
  }
}
