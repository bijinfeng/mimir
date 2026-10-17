import type { SlideElement, TextElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { pptxParagraphFormatSchema } from '@mimir/shared'
import {
  elementDurableId,
  groupChildDurableId,
  matchesElementRef,
} from '../../vendor/packages/pptx-engine/src/identity.js'
import { pptxElementStroke, pptxOutlineOp, type PptxOutlineDraft } from './pptx-outline.js'
import {
  pptxElementFill,
  pptxSelectionShapeFillOp,
  pptxSelectionShapeStyleOps,
  type PptxSelectionFillDraft,
} from './pptx-selection-fill.js'
import { pptxSupportsShapeFill } from '../pptx-element-capabilities.js'

export interface PptxSelectionContext {
  element: SlideElement
  ref: string
  group?: string
  depth: number
  ancestors: string[]
}
/** Fixed engine writes immediate children of top-level groups; deeper rows stay discoverable. */
export function pptxSelectionContexts(elements: readonly SlideElement[]): PptxSelectionContext[] {
  const contexts: PptxSelectionContext[] = []
  const visit = (items: readonly SlideElement[], ancestors: string[], parent?: SlideElement) => {
    for (const element of items) {
      const ref =
        (parent ? groupChildDurableId(parent, element) : elementDurableId(element)) ?? element.id
      contexts.push({
        element,
        ref,
        depth: ancestors.length,
        ancestors,
        ...(ancestors.length === 1 ? { group: ancestors[0] } : {}),
      })
      if (element.type === 'group') visit(element.children, [...ancestors, ref], element)
    }
  }
  visit(elements, [])
  return contexts
}
export function pptxResolveSelection(elements: readonly SlideElement[], refs: readonly string[]) {
  const contexts = pptxSelectionContexts(elements)
  return refs.flatMap((ref) => {
    const match = contexts.find((item) => item.ref === ref || matchesElementRef(item.element, ref))
    return match ? [match] : []
  })
}
/** Keep the original cNvPr alias through the engine's first creationId upgrade. */
export function pptxNormalizeSelection(
  elements: readonly SlideElement[],
  refs: readonly string[],
): string[] {
  const contexts = pptxSelectionContexts(elements)
  const chosen = refs.flatMap((ref) => {
    const context = contexts.find(
      (item) => item.ref === ref || matchesElementRef(item.element, ref),
    )
    return context ? [{ ref, context }] : []
  })
  const seen = new Set<string>()
  return chosen
    .filter(({ context }) => {
      if (
        seen.has(context.ref) ||
        context.ancestors.some((ancestor) => chosen.some((item) => item.context.ref === ancestor))
      )
        return false
      seen.add(context.ref)
      return true
    })
    .map(({ ref, context }) => (ref === context.element.id ? context.ref : ref))
}
export function pptxExpandSelection(elements: readonly SlideElement[], refs: readonly string[]) {
  const contexts = pptxSelectionContexts(elements)
  return pptxResolveSelection(elements, pptxNormalizeSelection(elements, refs)).flatMap(
    (context) => {
      if (context.depth > 1) return []
      if (context.element.type !== 'group') return [context]
      if (context.depth !== 0) return []
      return contexts.filter(
        (item) => item.depth === 1 && item.group === context.ref && item.element.type !== 'group',
      )
    },
  )
}
export function pptxSelectionOp(
  context: PptxSelectionContext,
  op: Record<string, unknown>,
): Record<string, unknown> {
  if (context.depth > 1 || context.element.type === 'group')
    throw new Error('当前引擎只支持顶层对象与组合的直接成员')
  return { ...op, ...(context.group ? { group: context.group } : {}) }
}
export function pptxSelectionText(context: PptxSelectionContext): TextElement | null {
  return (context.element.type === 'text' || context.element.type === 'shape') &&
    context.element.text?.paragraphs.length
    ? context.element
    : null
}
export interface PptxSelectionDraft {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSizePt?: number
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  fill?: string
  strokeColor?: string
  strokeWidthPt?: number
  paragraph?: Record<string, unknown>
  outline?: PptxOutlineDraft
  fillFormat?: PptxSelectionFillDraft
  shapeStyle?: string
}
/** Form strings stay local until apply; never turn an untouched mixed field into a patch. */
export function pptxSelectionParagraphPatch(draft: Record<string, unknown>) {
  const format = { ...draft }
  for (const field of [
    'lineSpacingPct',
    'spaceBeforePt',
    'spaceAfterPt',
    'startAt',
    'bulletSizePct',
    'bulletHangEmu',
  ]) {
    const value = format[field]
    if (typeof value === 'string') {
      if (!value.trim()) throw new Error('请输入已调整的段落数值，或重置草稿')
      format[field] = Number(value)
    }
  }
  if (format.bulletHangPt !== undefined) {
    const hang = format.bulletHangPt
    if (typeof hang === 'string' && !hang.trim()) throw new Error('请输入符号悬挂缩进，或重置草稿')
    const points = Number(hang)
    if (!Number.isFinite(points) || points < 0 || points > 4032)
      throw new Error('符号悬挂缩进须为0–4032pt')
    format.bulletHangEmu = Math.round(points * 12700)
    delete format.bulletHangPt
  }
  const parsed = pptxParagraphFormatSchema.safeParse(format)
  if (!parsed.success) throw new Error('请检查段落数值、颜色与列表格式；输入须在标注范围内')
  return parsed.data
}
export function pptxSelectionFormatOps(
  elements: readonly SlideElement[],
  refs: readonly string[],
  slide: number,
  draft: PptxSelectionDraft,
) {
  const ops: Record<string, unknown>[] = []
  const {
    align,
    fill,
    strokeColor,
    strokeWidthPt,
    paragraph,
    outline,
    fillFormat,
    shapeStyle,
    ...font
  } = draft
  const paragraphDraft = { ...(align === undefined ? {} : { align }), ...paragraph }
  const paragraphFormat = Object.keys(paragraphDraft).length
    ? pptxSelectionParagraphPatch(paragraphDraft)
    : null
  if (paragraphFormat?.bulletImage) {
    const selected = pptxResolveSelection(elements, refs)
    const contexts = pptxSelectionContexts(elements)
    if (
      !refs.length ||
      selected.length !== refs.length ||
      selected.some((context) => {
        if (context.depth > 1) return true
        if (context.element.type !== 'group') return !pptxSelectionText(context)
        const children = contexts.filter((item) => item.ancestors.at(-1) === context.ref)
        return (
          context.depth !== 0 ||
          !children.length ||
          children.some((item) => !pptxSelectionText(item))
        )
      })
    )
      throw new Error('图片符号须选择可编辑文本框或形状；请移除失效、非文字或深层组合对象后重试')
  }
  const line = {
    ...outline,
    ...(strokeColor === undefined ? {} : { color: strokeColor }),
    ...(strokeWidthPt === undefined ? {} : { widthPt: strokeWidthPt }),
  }
  if (
    font.fontSizePt !== undefined &&
    (!Number.isFinite(font.fontSizePt) || font.fontSizePt < 1 || font.fontSizePt > 400)
  )
    throw new Error('字号须为1–400pt')
  for (const [index, color] of [font.color, fill, strokeColor].entries())
    if (
      color !== undefined &&
      !(index === 1 && color === 'none') &&
      !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)
    )
      throw new Error('颜色须使用#RRGGBB或#RRGGBBAA')
  for (const context of pptxExpandSelection(elements, refs)) {
    const element = context.element
    const target = { slide, el: context.ref }
    const push = (op: Record<string, unknown>) => ops.push(pptxSelectionOp(context, op))
    if (pptxSelectionText(context)) {
      if (Object.keys(font).length) push({ op: 'setFont', target, font })
      if (paragraphFormat) {
        let format = paragraphFormat
        // Native whole-object commands require a glyph to set its font.
        // Resolve each object's own glyph, never copy a member's glyph onto another.
        if (format.bulletFont !== undefined && format.bullet === undefined) {
          const paragraphs = pptxSelectionText(context)!.text!.paragraphs
          const glyph = pptxMixedValue(
            paragraphs.map((p) => (p.bullet?.type === 'char' ? (p.bullet.char ?? '•') : null)),
          )
          if (glyph === null)
            throw new Error('所选文本含不同符号或非符号段落；请先明确选择字符符号，再修改符号字体')
          format = { ...format, bullet: 'char', bulletChar: glyph }
        }
        push({ op: 'setParagraphFormat', target, format })
      }
    }
    if (element.type === 'shape' || element.type === 'text') {
      const styleOps = shapeStyle
        ? pptxSelectionShapeStyleOps(target, element, shapeStyle, line)
        : null
      if (pptxSupportsShapeFill(element)) {
        if (fillFormat && Object.keys(fillFormat).length)
          push(pptxSelectionShapeFillOp(pptxElementFill(element), fillFormat, target))
        else if (fill !== undefined) push({ op: 'setFill', target, fill })
        else if (styleOps) push(styleOps[0]!)
      }
      if (styleOps) push(styleOps[1]!)
    }
    if (
      (element.type === 'shape' || element.type === 'text' || element.type === 'picture') &&
      !(shapeStyle && (element.type === 'shape' || element.type === 'text')) &&
      Object.keys(line).length
    )
      push(pptxOutlineOp(target, pptxElementStroke(element), line))
  }
  if (ops.length > 50) throw new Error('本次超过50项操作，请减少选择对象或分次应用')
  return ops
}
export function pptxMixedValue<T>(values: readonly T[]): T | null {
  return values.length && values.every((value) => Object.is(value, values[0])) ? values[0]! : null
}
