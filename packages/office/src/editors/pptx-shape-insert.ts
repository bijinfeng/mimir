import type { PptxManualShape } from '../../../shared/src/pptx-shape.js'
import { isPptxLineKind } from './pptx-shape-presets.js'

export type ShapePoint = { x: number; y: number }
export type ShapeDrawRect = {
  x: number
  y: number
  w: number
  h: number
  flipH?: boolean
  flipV?: boolean
}
export function shapeCanvasPoint(
  point: ShapePoint,
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): ShapePoint | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null
  return {
    x: Math.max(0, Math.min(width, ((point.x - bounds.left) * width) / bounds.width)),
    y: Math.max(0, Math.min(height, ((point.y - bounds.top) * height) / bounds.height)),
  }
}
/** Fixed upstream 3-screen-pixel click threshold, 96px default, Shift square / 45° lines. */
export function resolveShapeDraw(
  kind: string,
  start: ShapePoint,
  end: ShapePoint,
  shift: boolean,
  screenDistance: number,
): ShapeDrawRect {
  const line = isPptxLineKind(kind)
  if (screenDistance <= 3)
    return {
      x: start.x,
      y: start.y,
      w: 96,
      h: ['line', 'lineArrow', 'lineArrowDouble'].includes(kind) ? 0 : 96,
    }
  let dx = end.x - start.x,
    dy = end.y - start.y
  if (shift && line) {
    const length = Math.hypot(dx, dy),
      angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4
    dx = Math.round(length * Math.cos(angle))
    dy = Math.round(length * Math.sin(angle))
    if (Math.abs(dx) < 1) dx = 0
    if (Math.abs(dy) < 1) dy = 0
  } else if (shift) {
    const size = Math.max(Math.abs(dx), Math.abs(dy), 2)
    dx = dx < 0 ? -size : size
    dy = dy < 0 ? -size : size
  }
  const w = line ? Math.abs(dx) : Math.max(2, Math.abs(dx)),
    h = line ? Math.abs(dy) : Math.max(2, Math.abs(dy))
  return {
    x: dx < 0 ? start.x - w : start.x,
    y: dy < 0 ? start.y - h : start.y,
    w,
    h,
    ...(line ? { flipH: dx < 0, flipV: dy < 0 } : {}),
  }
}
export function shapeInsertInput(
  kind: PptxManualShape['kind'],
  slide: number,
  rect: ShapeDrawRect,
  viewport: { width: number; height: number; slideWidth: number; slideHeight: number },
): PptxManualShape {
  const { width, height, slideWidth, slideHeight } = viewport
  return {
    kind,
    slide,
    offset: {
      x: Math.round((rect.x * slideWidth) / width),
      y: Math.round((rect.y * slideHeight) / height),
      cx: Math.round((rect.w * slideWidth) / width),
      cy: Math.round((rect.h * slideHeight) / height),
    },
    ...(isPptxLineKind(kind) ? { flipH: !!rect.flipH, flipV: !!rect.flipV } : {}),
  }
}
