/** Adapted from GenOffice 480548fd zoom-actions/insert-defaults/section-groups (Apache-2.0). */
export interface ZoomSection {
  id: string
  name: string
  slideIndices: number[]
}
export interface ZoomFrame {
  x: number
  y: number
  w: number
  h: number
}
/** Normalize section membership by position, retaining PowerPoint's implicit leading group. */
export function pptxZoomGroups(sections: readonly ZoomSection[], total: number) {
  if (!sections.length || !total) return []
  let next = total
  const starts = sections.map(() => total)
  for (let i = sections.length - 1; i >= 0; i--) {
    const own = sections[i]!.slideIndices.length ? Math.min(...sections[i]!.slideIndices) : next
    starts[i] = Math.max(0, Math.min(own, next, total))
    next = starts[i]!
  }
  return [
    ...(starts[0]! > 0 ? [{ id: '', name: '默认节', start: 0, end: starts[0]! }] : []),
    ...sections.map((section, index) => ({
      id: section.id,
      name: section.name,
      start: starts[index]!,
      end: starts[index + 1] ?? total,
    })),
  ].filter((group) => group.start < group.end)
}
export function pptxZoomCascade(width: number, height: number, count: number): ZoomFrame[] {
  // 12pt at the deck's native EMU scale (PowerPoint's cascade spacing).
  const step = 12 * 12700
  return Array.from({ length: count }, (_, index) => {
    const delta = (index - (count - 1) / 2) * step
    return {
      x: Math.round(width * 0.375 + delta),
      y: Math.round(height * 0.375 + delta),
      w: Math.round(width / 4),
      h: Math.round(height / 4),
    }
  })
}
export function pptxSummaryZoomFrames(count: number, box: ZoomFrame, aspect: number): ZoomFrame[] {
  let best = { cols: 1, rows: count, width: 0 }
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const width = Math.min((0.9 * box.w) / cols, ((0.9 * box.h) / rows) * aspect)
    if (width > best.width) best = { cols, rows, width }
  }
  const { cols, rows, width } = best
  const height = width / aspect,
    gap = height / 15,
    x = box.x + (box.w - (cols * width + (cols - 1) * gap)) / 2,
    y = box.y + (box.h - (rows * height + (rows - 1) * gap)) / 2
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(x + (index % cols) * (width + gap)),
    y: Math.round(y + Math.floor(index / cols) * (height + gap)),
    w: Math.round(width),
    h: Math.round(height),
  }))
}
export function pptxSummaryZoomSections(
  sections: readonly ZoomSection[],
  total: number,
  chosen: readonly number[],
  nameOf: (index: number) => string,
): ZoomSection[] {
  const first = Math.min(...chosen)
  const heads = new Map<number, { id: string; name: string }>()
  for (const group of pptxZoomGroups(sections, total))
    if (group.id)
      heads.set(group.start + (group.start >= first ? 1 : 0), { id: group.id, name: group.name })
  for (const target of chosen)
    if (!heads.has(target + 1)) heads.set(target + 1, { id: '', name: nameOf(target) })
  heads.set(first, { id: '', name: '摘要节' })
  const starts = [...heads.keys()].toSorted((a, b) => a - b)
  return starts.map((start, index) => ({
    id: heads.get(start)!.id,
    name: heads.get(start)!.name,
    slideIndices: Array.from(
      { length: (starts[index + 1] ?? total + 1) - start },
      (_, i) => start + i,
    ),
  }))
}
