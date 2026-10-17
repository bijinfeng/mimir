import type { Fill, SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { pptxFillDraft, pptxShapeFillOp, type PptxFillDraft } from './pptx-fill-presets.js'
import { PPTX_SHAPE_STYLES, pptxShapeStyleOps } from './pptx-shape-presets.js'
import { pptxElementStroke, pptxOutlineOp, type PptxOutlineDraft } from './pptx-outline.js'

type StopEdit =
  | { kind: 'patch'; index: number; color?: string; pos?: string | number }
  | { kind: 'append'; from: number }
  | { kind: 'remove'; index: number }
export interface PptxSelectionFillDraft {
  mode?: 'none' | 'solid' | 'gradient'
  color?: string
  angle?: string | number
  path?: PptxFillDraft['path']
  stops?: PptxFillDraft['stops']
  stopEdits?: StopEdit[]
}
export const pptxElementFill = (element: SlideElement) =>
  element.type === 'shape' || element.type === 'text' ? element.fill : undefined

/** Edits are relative to each object's original stops, never to the first selected object. */
export function pptxSelectionFillValue(
  fill: Fill | undefined,
  draft: PptxSelectionFillDraft,
): PptxFillDraft {
  const original = pptxFillDraft(fill)
  const stops = (draft.stops ?? original.stops).map((stop) => Object.assign({}, stop))
  for (const edit of draft.stopEdits ?? []) {
    if (edit.kind === 'append') {
      const source = stops[edit.from]
      if (!source) throw new Error('所选对象的色标数量不同，请先选择渐变预设')
      stops.push({ pos: 0.5, color: source.color })
    } else {
      const stop = stops[edit.index]
      if (!stop) throw new Error('所选对象的色标数量不同，请先选择渐变预设')
      if (edit.kind === 'remove') {
        if (stops.length <= 2) throw new Error('渐变至少保留两个色标')
        stops.splice(edit.index, 1)
      } else {
        if (edit.color !== undefined) stop.color = edit.color
        if (edit.pos !== undefined) stop.pos = Number(edit.pos) / 100
      }
    }
  }
  return {
    ...original,
    mode: draft.mode ?? original.mode,
    color: draft.color ?? original.color,
    angle: draft.angle === undefined ? original.angle : Number(draft.angle),
    path: draft.path ?? original.path,
    stops,
  }
}
export function pptxSelectionShapeFillOp(
  fill: Fill | undefined,
  draft: PptxSelectionFillDraft,
  target: { slide: number; el: string },
) {
  if (!Object.keys(draft).length) throw new Error('请先调整填充')
  if (
    fill?.type !== 'gradient' &&
    draft.mode === undefined &&
    (draft.angle !== undefined ||
      draft.path !== undefined ||
      draft.stops ||
      draft.stopEdits?.length)
  )
    throw new Error('所选对象包含非渐变填充，请先选择渐变类型或预设')
  if (fill?.type !== 'solid' && draft.mode === undefined && draft.color !== undefined)
    throw new Error('所选对象包含非纯色填充，请先选择纯色类型')
  const value = pptxSelectionFillValue(fill, draft)
  const color = /^#[\da-f]{6}([\da-f]{2})?$/i
  if (value.mode === 'texture') throw new Error('图片填充须通过手动填充宿主执行')
  if (value.mode === 'solid' && !color.test(value.color))
    throw new Error('填充颜色使用#RRGGBB或#RRGGBBAA')
  if (value.mode === 'gradient') {
    if (draft.angle !== undefined && typeof draft.angle === 'string' && !draft.angle.trim())
      throw new Error('请输入渐变角度')
    if (!Number.isFinite(value.angle) || value.angle < 0 || value.angle > 360)
      throw new Error('渐变角度须为0–360°')
    if (!['', 'circle', 'rect', 'shape'].includes(value.path)) throw new Error('请选择有效渐变类型')
    if (
      value.stops.length < 2 ||
      value.stops.length > 16 ||
      value.stops.some(
        (stop) =>
          !color.test(stop.color) || !Number.isFinite(stop.pos) || stop.pos < 0 || stop.pos > 1,
      )
    )
      throw new Error('渐变须有2–16个色标，位置为0–100%，颜色使用#RRGGBB或#RRGGBBAA')
    if (
      draft.stopEdits?.some(
        (edit) => edit.kind === 'patch' && typeof edit.pos === 'string' && !edit.pos.trim(),
      )
    )
      throw new Error('请输入色标位置')
  }
  const op = pptxShapeFillOp(value, target)
  if (
    fill?.type === 'gradient' &&
    value.path &&
    draft.path !== undefined &&
    draft.path !== fill.path &&
    fill.fillTo
  )
    op.fill = { ...(op.fill as Record<string, unknown>), fillTo: fill.fillTo }
  return op
}
/** Reuse the fixed gallery's intended fill/color/dash; preserve every other line property. */
export function pptxSelectionShapeStyleOps(
  target: { slide: number; el: string },
  element: SlideElement,
  key: string,
  outline: PptxOutlineDraft = {},
) {
  const style = PPTX_SHAPE_STYLES.find((item) => item.key === key)
  if (!style) throw new Error('请选择有效的组合样式')
  const [fill] = pptxShapeStyleOps(target, element, style)
  return [
    fill!,
    pptxOutlineOp(target, pptxElementStroke(element), {
      color: style.stroke,
      dash: style.dash,
      ...Object.fromEntries(Object.entries(outline).filter(([, value]) => value !== undefined)),
    }),
  ]
}
