/** GenOffice 480548fd ink v1 payload; Mimir keeps vectors in native PM history. */
export const INK_ATTR = 'mimirInk'
export const INK_ANCHOR = 'mimirInkAnchor'
export const INK_PARAGRAPHS = new Set(['docParagraph', 'docHeading', 'docListItem'])
export const MAX_INK_STROKES = 500
export const MAX_INK_POINTS = 10000
export type InkTool = 'select' | 'pen' | 'highlighter' | 'eraser'
export interface InkPoint {
  x: number
  y: number
}
export interface InkStroke {
  tool: 'pen' | 'highlighter'
  color: string
  width: number
  points: InkPoint[]
}
export interface InkAnnotation {
  id: string
  anchor: string
  stroke: InkStroke | null
  image?: { dataUrl: string | null; x: number; y: number; width: number; height: number }
}
export function inkAnnotations(doc: { attrs?: Record<string, unknown> }): InkAnnotation[] {
  return (doc.attrs?.[INK_ATTR] as InkAnnotation[] | null) ?? []
}
export function decodeInkPayload(payload: string | null): InkStroke | null {
  if (!payload || payload.length > 500000) return null
  try {
    const p = JSON.parse(payload)
    if (
      Object.keys(p).some((key) => !['v', 'tool', 'color', 'width', 'points'].includes(key)) ||
      p.v !== 1 ||
      !['pen', 'highlighter'].includes(p.tool) ||
      !/^[\da-f]{6}$/i.test(p.color) ||
      !Number.isFinite(p.width) ||
      p.width < 0.5 ||
      p.width > 64 ||
      !Array.isArray(p.points) ||
      p.points.length < 1 ||
      p.points.length > MAX_INK_POINTS
    )
      return null
    if (
      !p.points.every(
        (point: unknown) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every(
            (value: unknown) =>
              typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000,
          ),
      )
    )
      return null
    return {
      tool: p.tool,
      color: p.color.toUpperCase(),
      width: p.width,
      points: p.points.map(([x, y]: number[]) => ({ x: x!, y: y! })),
    }
  } catch {
    return null
  }
}
export function encodeInkPayload(stroke: InkStroke): string {
  const payload = JSON.stringify({
    v: 1,
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map(({ x, y }) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
  })
  if (!decodeInkPayload(payload)) throw new Error('笔迹数据无效或超过限制')
  return payload
}
export function inkBounds(stroke: InkStroke) {
  const xs = stroke.points.map((p) => p.x),
    ys = stroke.points.map((p) => p.y),
    pad = stroke.width / 2 + 1
  const x = Math.min(...xs) - pad,
    y = Math.min(...ys) - pad
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(Math.max(...xs) + pad - x)),
    height: Math.max(1, Math.ceil(Math.max(...ys) + pad - y)),
  }
}
export function inkHit(stroke: InkStroke, point: InkPoint, radius = 6): boolean {
  const points = stroke.points
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)]!,
      b = points[i]!,
      dx = b.x - a.x,
      dy = b.y - a.y
    const t =
      dx || dy
        ? Math.max(
            0,
            Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
          )
        : 0
    if (Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= radius + stroke.width / 2)
      return true
  }
  return false
}
export function inkPath(stroke: InkStroke): string {
  const points = stroke.points
  return (
    points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') +
    (points.length === 1 ? ` l0.01,0` : '')
  )
}
export function rasterizeInk(stroke: InkStroke) {
  encodeInkPayload(stroke)
  const bounds = inkBounds(stroke)
  if (bounds.width > 8192 || bounds.height > 8192 || bounds.width * bounds.height > 16000000)
    throw new Error('单笔范围过大，请分成较短笔迹')
  const canvas = document.createElement('canvas')
  canvas.width = bounds.width * 2
  canvas.height = bounds.height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法生成透明笔迹图片')
  ctx.scale(2, 2)
  ctx.translate(-bounds.x, -bounds.y)
  ctx.strokeStyle = `#${stroke.color}`
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.45 : 1
  ctx.beginPath()
  stroke.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  if (stroke.points.length === 1) ctx.lineTo(stroke.points[0]!.x + 0.01, stroke.points[0]!.y)
  ctx.stroke()
  const data = canvas.toDataURL('image/png')
  if (!data.startsWith('data:image/png;base64,')) throw new Error('无法生成 PNG 笔迹')
  return { ...bounds, base64: data.slice('data:image/png;base64,'.length) }
}
