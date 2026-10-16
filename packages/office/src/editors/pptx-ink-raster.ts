import type { PptxInkStroke } from '@mimir/shared'
import { HIGHLIGHTER_ALPHA, relativeInkStroke, strokeBounds } from '../pptx-ink.js'

export function rasterizeInk(stroke: PptxInkStroke): string {
  const bounds = strokeBounds(stroke),
    rel = relativeInkStroke(stroke)
  if (bounds.w * bounds.h * 4 > 16_000_000) throw new Error('笔迹区域过大，请分成几笔绘制')
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(bounds.w * 2))
  canvas.height = Math.max(1, Math.ceil(bounds.h * 2))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器暂时无法创建笔迹，请重新打开文档')
  ctx.scale(2, 2)
  ctx.strokeStyle = `#${stroke.color}`
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = stroke.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1
  ctx.beginPath()
  ctx.moveTo(rel.points[0]!.x, rel.points[0]!.y)
  if (rel.points.length === 1) ctx.lineTo(rel.points[0]!.x + 0.01, rel.points[0]!.y)
  for (const point of rel.points.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.stroke()
  return canvas.toDataURL('image/png').split(',')[1]!
}
