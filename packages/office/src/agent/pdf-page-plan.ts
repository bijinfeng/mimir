import type { PdfLocalOperation } from '@mimir/shared'
import type { PdfPageRef } from '../editors/pdf-pages.js'

/** Page-reference edits can retain the catalog, forms and editor content layers. */
export function planPdfPageOperations(
  layout: readonly PdfPageRef[],
  original: readonly { rotation: number }[],
): Extract<PdfLocalOperation, { op: 'apply_ops' }>['ops'] | null {
  const indices: number[] = []
  const rotations = new Map<90 | -90 | 180, number[]>()
  for (const page of layout) {
    if (page.origin.kind !== 'original' || page.crop || page.paper) return null
    const index = page.origin.index
    if (!original[index] || indices.includes(index)) return null
    indices.push(index)
    const delta = (((page.rotation - original[index]!.rotation) % 360) + 360) % 360
    if (!delta) continue
    if (delta !== 90 && delta !== 180 && delta !== 270) return null
    const dir = delta === 270 ? -90 : delta
    rotations.set(dir, [...(rotations.get(dir) ?? []), index + 1])
  }
  if (!indices.length) return null
  const ops: Extract<PdfLocalOperation, { op: 'apply_ops' }>['ops'] = []
  for (const [dir, pages] of rotations) ops.push({ op: 'rotatePages', pages, dir })
  const retained = new Set(indices)
  for (let i = original.length - 1; i >= 0; i--)
    if (!retained.has(i)) ops.push({ op: 'deletePage', page: i + 1 })
  const surviving = indices.toSorted((a, b) => a - b)
  const order = indices.map((index) => surviving.indexOf(index) + 1)
  if (order.some((page, index) => page !== index + 1)) ops.push({ op: 'setPageOrder', order })
  return ops
}
