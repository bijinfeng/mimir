import type { DocxImageInsets } from './docx-image.js'

export type DocxCropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'move'
export interface DocxCropRect {
  left: number
  top: number
  right: number
  bottom: number
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export function cropRect(insets: DocxImageInsets): DocxCropRect {
  return {
    left: insets.left / 100,
    top: insets.top / 100,
    right: 1 - insets.right / 100,
    bottom: 1 - insets.bottom / 100,
  }
}
export function cropInsets(rect: DocxCropRect): DocxImageInsets {
  return {
    left: rect.left * 100,
    top: rect.top * 100,
    right: (1 - rect.right) * 100,
    bottom: (1 - rect.bottom) * 100,
  }
}
/** Deltas are relative to the actual unletterboxed source image, independent of DPR. */
export function moveDocxCrop(
  rect: DocxCropRect,
  handle: DocxCropHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
): DocxCropRect {
  if (![dx, dy, width, height].every(Number.isFinite) || width < 1 || height < 1) return rect
  if (handle === 'move') {
    dx = clamp(dx, -rect.left, 1 - rect.right)
    dy = clamp(dy, -rect.top, 1 - rect.bottom)
    return {
      left: rect.left + dx,
      right: rect.right + dx,
      top: rect.top + dy,
      bottom: rect.bottom + dy,
    }
  }
  const next = { ...rect }
  if (handle.includes('w')) next.left = clamp(rect.left + dx, 0, rect.right - 1 / width)
  if (handle.includes('e')) next.right = clamp(rect.right + dx, rect.left + 1 / width, 1)
  if (handle.includes('n')) next.top = clamp(rect.top + dy, 0, rect.bottom - 1 / height)
  if (handle.includes('s')) next.bottom = clamp(rect.bottom + dy, rect.top + 1 / height, 1)
  return next
}
/** Both preview and writer round the same two source boundaries, never a second crop. */
export function docxCropPixels(insets: DocxImageInsets, width: number, height: number) {
  const r = cropRect(insets)
  if (
    !Object.values(r).every(Number.isFinite) ||
    r.left < 0 ||
    r.top < 0 ||
    r.right > 1 ||
    r.bottom > 1 ||
    r.left >= r.right ||
    r.top >= r.bottom
  )
    throw new Error('裁切后必须保留图片区域')
  const x = clamp(Math.round(r.left * width), 0, width - 1)
  const y = clamp(Math.round(r.top * height), 0, height - 1)
  const right = clamp(Math.round(r.right * width), x + 1, width)
  const bottom = clamp(Math.round(r.bottom * height), y + 1, height)
  return { x, y, width: right - x, height: bottom - y }
}
