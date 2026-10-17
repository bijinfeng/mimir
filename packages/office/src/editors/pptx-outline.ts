import type { SlideElement, Stroke } from '../../vendor/packages/pptx-engine/src/types.js'
import type { StrokePatch } from '../../vendor/packages/pptx-engine/src/generate.js'

const PT = 12700
export interface PptxOutlineDraft {
  enabled?: boolean
  color?: string
  widthPt?: number
  dash?: string
  cap?: 'flat' | 'round' | 'square'
  join?: 'round' | 'bevel' | 'miter'
  compound?: 'sng' | 'dbl' | 'thickThin' | 'thinThick' | 'tri'
}
export function pptxElementStroke(element: SlideElement): Stroke | undefined {
  return element.type === 'shape' || element.type === 'text' || element.type === 'picture'
    ? element.stroke
    : undefined
}
/** Preserve untouched attributes; the native writer keeps head/tail and other XML children. */
export function pptxOutlineOp(
  target: { slide: number; el: string },
  stroke: Stroke | undefined,
  draft: PptxOutlineDraft,
): Record<string, unknown> {
  if (draft.enabled === false) return { op: 'setStroke', target, stroke: null }
  if (draft.color !== undefined && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(draft.color))
    throw new Error('轮廓颜色使用#RRGGBB或#RRGGBBAA，例如#4472C4')
  const fill = stroke?.fill
  if (!draft.color && fill && fill.type !== 'solid' && fill.type !== 'none') {
    if (
      fill.type !== 'gradient' ||
      fill.path ||
      fill.fillTo ||
      fill.tileRect ||
      fill.scaled !== true
    )
      throw new Error('此原件轮廓使用复杂填充。请选择纯色后应用，或保留原件轮廓。')
  }
  const width = draft.widthPt === undefined ? (stroke?.width ?? PT) : Math.round(draft.widthPt * PT)
  if (!Number.isFinite(width) || width <= 0 || width > 20116800)
    throw new Error('轮廓宽度须大于0且不超过1584pt')
  const cap = draft.cap ?? stroke?.cap
  const patch: StrokePatch = {
    color:
      draft.color ??
      (fill?.type === 'solid'
        ? fill.color
        : fill?.type === 'gradient'
          ? (fill.stops[0]?.color ?? '#000000')
          : '#000000'),
    widthEmu: width,
    ...(draft.dash !== undefined || stroke?.dash !== undefined
      ? { dash: draft.dash ?? stroke?.dash }
      : {}),
    ...(cap ? { cap: ({ flat: 'flat', round: 'rnd', square: 'sq' } as const)[cap] } : {}),
    ...(draft.join || stroke?.join ? { join: draft.join ?? stroke?.join } : {}),
    ...(draft.compound || stroke?.compound ? { compound: draft.compound ?? stroke?.compound } : {}),
    ...(!draft.color && fill?.type === 'gradient'
      ? { gradient: { stops: fill.stops, angle: fill.angle ?? 0 } }
      : {}),
  }
  return { op: 'setStroke', target, stroke: patch }
}
