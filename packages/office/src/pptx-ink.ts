import { pptxInkStrokeSchema, type PptxInkStroke } from '@mimir/shared'
import type {
  PictureRenderNode,
  RenderSlide,
} from '../vendor/packages/pptx-render/src/render-tree.js'

export type InkTool = 'select' | 'pen' | 'highlighter' | 'eraser'
export type InkPoint = { x: number; y: number }
export type InkPreset = { tool: 'pen' | 'highlighter'; color: string; width: number }
export const INK_NAME_PREFIX = 'aislides-ink'
export const HIGHLIGHTER_ALPHA = 0.45
export const INK_COLORS = [
  '000000',
  'C00000',
  'FF0000',
  'FFC000',
  'FFFF00',
  '92D050',
  '00B050',
  '00B0F0',
  '0070C0',
  '7030A0',
] as const
export const PEN_WIDTHS = [1, 2, 3.5, 5] as const
export const HIGHLIGHTER_WIDTHS = [6, 10, 16] as const
export const DEFAULT_INK_PRESETS: readonly InkPreset[] = [
  { tool: 'pen', color: '000000', width: 2 },
  { tool: 'pen', color: 'FF0000', width: 2 },
  { tool: 'pen', color: '0070C0', width: 2 },
  { tool: 'highlighter', color: 'FFFF00', width: 10 },
  { tool: 'highlighter', color: '00B050', width: 10 },
]
export function readInkPresets(value: string | null): InkPreset[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '')
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_INK_PRESETS.length &&
      parsed.every(
        (entry, i) =>
          entry?.tool === DEFAULT_INK_PRESETS[i]!.tool &&
          INK_COLORS.includes(entry.color) &&
          (entry.tool === 'pen' ? PEN_WIDTHS : HIGHLIGHTER_WIDTHS).some((w) => w === entry.width),
      )
    )
      return parsed as InkPreset[]
  } catch {
    /* Invalid local preference falls back to the fixed upstream palette. */
  }
  return DEFAULT_INK_PRESETS.map((p) => ({ tool: p.tool, color: p.color, width: p.width }))
}
export function encodeInkPayload(stroke: PptxInkStroke): string {
  return JSON.stringify({
    v: 1,
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
  })
}
export function decodeInkPayload(payload: string): PptxInkStroke | null {
  if (payload.length > 1_000_000) return null
  try {
    const data = JSON.parse(payload)
    if (
      data?.v !== 1 ||
      !Array.isArray(data.points) ||
      data.points.some((p: unknown) => !Array.isArray(p) || p.length !== 2)
    )
      return null
    const result = pptxInkStrokeSchema.safeParse({
      tool: data.tool,
      color: data.color,
      width: data.width,
      points: data.points.map((p: number[]) => ({ x: p[0], y: p[1] })),
    })
    return result.success ? result.data : null
  } catch {
    return null
  }
}
export function strokeBounds(stroke: PptxInkStroke) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const p of stroke.points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pad = stroke.width / 2 + 1
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}
export function relativeInkStroke(stroke: PptxInkStroke): PptxInkStroke {
  const bounds = strokeBounds(stroke)
  return { ...stroke, points: stroke.points.map((p) => ({ x: p.x - bounds.x, y: p.y - bounds.y })) }
}
export function strokePathD(points: readonly InkPoint[]): string {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y} l 0.01 0`
  return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
}
export function inkNodesOf(slide: RenderSlide) {
  return slide.nodes.flatMap((node) => {
    if (
      node.type !== 'picture' ||
      node.decoration ||
      !node.name?.startsWith(INK_NAME_PREFIX) ||
      !node.descr
    )
      return []
    const stroke = decodeInkPayload(node.descr)
    return stroke ? [{ node, stroke }] : []
  })
}
function segmentDistance(p: InkPoint, a: InkPoint, b: InkPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
/** Invert the same centered rotation/flip used by the SVG picture renderer. */
export function inkNodeHitTest(
  entry: { node: PictureRenderNode; stroke: PptxInkStroke },
  page: InkPoint,
  threshold: number,
): boolean {
  const { node, stroke } = entry,
    box = node.box,
    original = strokeBounds(stroke)
  let x = page.x - box.x,
    y = page.y - box.y
  if (box.flipH) x = box.w - x
  if (box.flipV) y = box.h - y
  const angle = (-(box.rotationDeg ?? 0) * Math.PI) / 180,
    dx = x - box.w / 2,
    dy = y - box.h / 2
  x = Math.cos(angle) * dx - Math.sin(angle) * dy + box.w / 2
  y = Math.sin(angle) * dx + Math.cos(angle) * dy + box.h / 2
  if (x < -threshold || y < -threshold || x > box.w + threshold || y > box.h + threshold)
    return false
  const sx = original.w / (box.w || 1),
    sy = original.h / (box.h || 1)
  const local = { x: x * sx + original.x, y: y * sy + original.y },
    reach = threshold * Math.max(sx, sy) + stroke.width / 2
  if (stroke.points.length === 1)
    return Math.hypot(local.x - stroke.points[0]!.x, local.y - stroke.points[0]!.y) <= reach
  return stroke.points
    .slice(1)
    .some((point, i) => segmentDistance(local, stroke.points[i]!, point) <= reach)
}
