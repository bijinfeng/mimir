import type { PageViewport } from 'pdfjs-dist'

export type RedactionPoint = { x: number; y: number }
export type RedactionRect = [number, number, number, number]
export interface PdfRedactionRegion {
  id: string
  pageIndex: number
  rect: RedactionRect
}
export function redactionPoint(client: RedactionPoint, box: DOMRect): RedactionPoint {
  return {
    x: Math.max(0, Math.min(1, (client.x - box.left) / Math.max(1, box.width))),
    y: Math.max(0, Math.min(1, (client.y - box.top) / Math.max(1, box.height))),
  }
}
/** PDF.js owns rotation, CropBox offsets and the PDF bottom-left coordinate system. */
export function pdfRedactionRect(
  viewport: Pick<PageViewport, 'width' | 'height' | 'convertToPdfPoint'>,
  from: RedactionPoint,
  to: RedactionPoint,
): RedactionRect {
  const a = viewport.convertToPdfPoint(from.x * viewport.width, from.y * viewport.height)
  const b = viewport.convertToPdfPoint(to.x * viewport.width, to.y * viewport.height)
  return [
    Math.min(a[0]!, b[0]!),
    Math.min(a[1]!, b[1]!),
    Math.max(a[0]!, b[0]!),
    Math.max(a[1]!, b[1]!),
  ]
}
export function redactionScreenRect(
  viewport: Pick<PageViewport, 'width' | 'height' | 'convertToViewportPoint'>,
  rect: RedactionRect,
) {
  const a = viewport.convertToViewportPoint(rect[0], rect[1])
  const b = viewport.convertToViewportPoint(rect[2], rect[3])
  return {
    left: `${(Math.min(a[0]!, b[0]!) / viewport.width) * 100}%`,
    top: `${(Math.min(a[1]!, b[1]!) / viewport.height) * 100}%`,
    width: `${(Math.abs(a[0]! - b[0]!) / viewport.width) * 100}%`,
    height: `${(Math.abs(a[1]! - b[1]!) / viewport.height) * 100}%`,
  }
}
