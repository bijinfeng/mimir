import type { PdfDrawingInput } from '@mimir/shared'

export type DrawingPoint = [number, number]
export type PdfCanvasTool = 'select' | PdfDrawingInput['kind']
export type DrawingHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const DRAWING_HANDLES: DrawingHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const DRAWING_LABELS: Record<PdfCanvasTool, string> = {
  select: '选择与调整',
  ink: '自由笔',
  rect: '矩形',
  ellipse: '椭圆',
  line: '直线',
  arrow: '箭头',
  check: '勾选',
  cross: '叉号',
}
export function drawingPoint(
  client: DrawingPoint,
  box: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  size: { width: number; height: number },
): DrawingPoint | null {
  if (box.width <= 0 || box.height <= 0) return null
  return [
    ((client[0] - box.left) * size.width) / box.width,
    ((client[1] - box.top) * size.height) / box.height,
  ]
}
export function createDrawing(
  kind: PdfDrawingInput['kind'],
  page: number,
  points: DrawingPoint[],
): PdfDrawingInput | null {
  if (points.length < 2) return null
  const first = points[0]!,
    last = points.at(-1)!
  const path = kind === 'ink' ? points : [first, last]
  const xs = path.map((p) => p[0]),
    ys = path.map((p) => p[1])
  const width = Math.max(...xs) - Math.min(...xs),
    height = Math.max(...ys) - Math.min(...ys)
  if (Math.hypot(width, height) < 2) return null
  const dx = last[0] - first[0],
    dy = last[1] - first[1]
  return {
    kind,
    page,
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(kind === 'line' || kind === 'arrow' ? Number.MIN_VALUE : 0.25, width),
    height: Math.max(kind === 'line' || kind === 'arrow' ? Number.MIN_VALUE : 0.25, height),
    color: '#2563EB',
    thickness: 2,
    opacity: 1,
    ...(kind === 'line' || kind === 'arrow'
      ? { rotation: dx < 0 ? (dy < 0 ? 180 : 90) : dy < 0 ? 270 : 0 }
      : {}),
    ...(kind === 'arrow' ? { arrowHeadLength: Math.min(12, Math.hypot(width, height) / 3) } : {}),
    ...(kind === 'ink' ? { points: path } : {}),
  }
}
export function moveDrawing(d: PdfDrawingInput, dx: number, dy: number): PdfDrawingInput {
  return {
    ...d,
    x: d.x + dx,
    y: d.y + dy,
    ...(d.points ? { points: d.points.map(([x, y]) => [x + dx, y + dy] as DrawingPoint) } : {}),
  }
}
export function resizeDrawing(
  d: PdfDrawingInput,
  handle: DrawingHandle,
  to: DrawingPoint,
): PdfDrawingInput {
  const right = d.x + d.width,
    bottom = d.y + d.height
  const x = handle.includes('w') ? Math.min(to[0], right - 0.25) : d.x
  const y = handle.includes('n') ? Math.min(to[1], bottom - 0.25) : d.y
  const width = handle.includes('w')
    ? right - x
    : handle.includes('e')
      ? Math.max(0.25, to[0] - x)
      : d.width
  const height = handle.includes('n')
    ? bottom - y
    : handle.includes('s')
      ? Math.max(0.25, to[1] - y)
      : d.height
  return {
    ...d,
    x,
    y,
    width,
    height,
    ...(d.points
      ? {
          points: d.points.map(
            ([px, py]) =>
              [
                x + ((px - d.x) * width) / d.width,
                y + ((py - d.y) * height) / d.height,
              ] as DrawingPoint,
          ),
        }
      : {}),
  }
}
export function handlePoint(d: PdfDrawingInput, h: DrawingHandle): DrawingPoint {
  return [
    d.x + d.width * (h.includes('w') ? 0 : h.includes('e') ? 1 : 0.5),
    d.y + d.height * (h.includes('n') ? 0 : h.includes('s') ? 1 : 0.5),
  ]
}
/** Same local quarter-turn convention as the native pdf-local writer. */
export function drawingPath(d: PdfDrawingInput): string {
  if (d.kind === 'ink')
    return (d.points ?? []).map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  const r = d.rotation ?? 0,
    w = r === 90 || r === 270 ? d.height : d.width,
    h = r === 90 || r === 270 ? d.width : d.height
  const p = (u: number, v: number): string => {
    const [x, y] =
      r === 90 ? [h - v, u] : r === 180 ? [w - u, h - v] : r === 270 ? [v, w - u] : [u, v]
    return `${d.x + x},${d.y + y}`
  }
  if (d.kind === 'check') return `M${p(0, h * 0.5)} L${p(w * 0.35, h)} L${p(w, 0)}`
  if (d.kind === 'cross') return `M${p(0, h)} L${p(w, 0)} M${p(0, 0)} L${p(w, h)}`
  let path = `M${p(0, 0)} L${p(w, h)}`
  if (d.kind === 'arrow') {
    const len = d.arrowHeadLength ?? Math.min(12, w / 3, h / 3),
      a = Math.atan2(h, w)
    for (const delta of [-0.5, 0.5])
      path += ` M${p(w, h)} L${p(w - len * Math.cos(a + delta), h - len * Math.sin(a + delta))}`
  }
  return path
}
