import type { SlideElement } from '../vendor/packages/pptx-engine/src/types.js'
import type {
  RenderNode,
  ShapeRenderNode,
  PictureRenderNode,
} from '../vendor/packages/pptx-render/src/render-tree.js'
import type { EditParagraph } from '../vendor/packages/pptx-ops/src/types.js'
import { elementDurableId } from '../vendor/packages/pptx-engine/src/identity.js'

export interface PptxBrush {
  fill?: string
  stroke?: { color: string; widthEmu: number }
  font?: {
    fontFamily: string
    fontSize: number
    bold: boolean
    italic: boolean
    underline: boolean
    color: string
  }
  align?: string
}
/** Mirrors fixed upstream format-brush scope; gradients and effects are intentionally excluded. */
export function capturePptxBrush(node: RenderNode, pointsPerPixel = 0.75): PptxBrush | null {
  if (node.type !== 'shape' && node.type !== 'text' && node.type !== 'picture') return null
  const shape = node as ShapeRenderNode
  const brush: PptxBrush = {}
  if (node.type !== 'picture') {
    if (shape.fill?.kind === 'solid') brush.fill = shape.fill.color
    else if (!shape.fill || shape.fill.kind === 'none') brush.fill = 'none'
    const line = shape.text?.lines.find((item) => item.paraStart !== false) ?? shape.text?.lines[0]
    const run = line?.runs.find((item) => !item.isBullet)
    if (run)
      brush.font = {
        fontFamily: run.fontFamily,
        fontSize: Math.round(run.fontSizePx * pointsPerPixel * 100) / 100,
        bold: !!run.bold,
        italic: !!run.italic,
        underline: !!run.underline,
        color: run.color,
      }
    if (line?.align) brush.align = line.align
  }
  const stroke = (node as ShapeRenderNode | PictureRenderNode).stroke
  if (stroke) brush.stroke = { color: stroke.color, widthEmu: Math.round(stroke.widthPt * 12700) }
  return brush
}
export function pptxBrushOps(
  brush: PptxBrush,
  element: SlideElement,
  slide: number,
): Record<string, unknown>[] {
  if (element.type !== 'shape' && element.type !== 'text' && element.type !== 'picture')
    throw new Error('格式刷支持文字、形状和图片')
  const target = { slide, el: elementDurableId(element) ?? element.id },
    ops: Record<string, unknown>[] = []
  if (brush.stroke) ops.push({ op: 'setStroke', target, stroke: brush.stroke })
  if (element.type !== 'picture') {
    if (brush.fill !== undefined) ops.push({ op: 'setFill', target, fill: brush.fill })
    if (brush.font && element.text) {
      const paragraphs: EditParagraph[] = element.text.paragraphs.map((para, pi) => ({
        srcPara: pi,
        runs: para.runs.map((run, ri) => ({ text: run.text, srcRun: ri, ...brush.font })),
      }))
      ops.push({ op: 'setText', target, paragraphs })
    }
    if (brush.align && element.text)
      ops.push({ op: 'setParagraphFormat', target, format: { align: brush.align } })
  }
  if (!ops.length) throw new Error('源对象与目标对象没有可复制的格式')
  return ops
}
