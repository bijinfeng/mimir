import type { Transform } from '../../vendor/packages/pptx-engine/src/types.js'
import { isConnectorPreset } from '../../vendor/packages/pptx-render/src/preset-geometry.js'
import { pptxResolveSelection, type PptxSelectionContext } from './pptx-selection.js'
import { PPTX_SHAPES, isPptxLineKind } from './pptx-shape-presets.js'

export const PPTX_GEOMETRY_PT = 12700
export type PptxGeometryField = 'x' | 'y' | 'width' | 'height' | 'rotation'
export interface PptxSelectionGeometryDraft {
  x?: string
  y?: string
  width?: string
  height?: string
  rotation?: string
  flipH?: boolean
  flipV?: boolean
  preset?: string
}
export function pptxGeometryContext(
  elements: Parameters<typeof pptxResolveSelection>[0],
  refs: readonly string[],
): { context: PptxSelectionContext | null; reason: string } {
  if (refs.length !== 1)
    return {
      context: null,
      reason: refs.length ? '位置与形状需单独选择一个对象' : '选择一个对象以编辑位置与形状',
    }
  const contexts = pptxResolveSelection(elements, refs)
  const context = contexts[0]
  if (!context) return { context: null, reason: '所选对象已失效，请重新选择' }
  if (context.depth > 1 || (context.depth > 0 && context.element.type === 'group'))
    return { context: null, reason: '深层组合暂不支持位置与形状编辑，请先取消组合' }
  if (context.element.type === 'passthrough')
    return { context: null, reason: '此原件对象暂不支持位置与形状编辑' }
  const { offset, rot } = context.element.transform
  if (![offset.x, offset.y, offset.cx, offset.cy, rot].every(Number.isFinite))
    return { context: null, reason: '对象缺少可靠的位置或尺寸，无法修改' }
  return { context, reason: '' }
}
export function pptxGeometryPreset(context: PptxSelectionContext): string | null {
  const element = context.element
  if (
    (element.type !== 'text' && element.type !== 'shape') ||
    !element.presetGeometry ||
    element.customGeometry ||
    isPptxLineKind(element.presetGeometry) ||
    isConnectorPreset(element.presetGeometry)
  )
    return null
  return element.presetGeometry
}
/** Text fields display pt, while untouched fields retain their original integer EMU. */
export function pptxGeometryValue(context: PptxSelectionContext, field: PptxGeometryField): string {
  const transform = context.element.transform
  const value =
    field === 'rotation'
      ? transform.rot / 60000
      : transform.offset[
          { x: 'x', y: 'y', width: 'cx', height: 'cy' }[field] as 'x' | 'y' | 'cx' | 'cy'
        ] / PPTX_GEOMETRY_PT
  return String(Number(value.toFixed(4)))
}
function number(value: string, label: string): number {
  if (!value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
    throw new Error(`${label}须填写有效数字`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label}须填写有限数字`)
  return parsed
}
/** Same center-preserving local-space orbit as fixed upstream flipElements. */
function flippedTransform(source: Transform, axis: 'h' | 'v'): Transform {
  const transform = { ...source, offset: { ...source.offset } }
  const orbit = () => {
    const rad = ((transform.rot / 60000) * Math.PI) / 180
    const { cx, cy } = transform.offset
    const vx = ((transform.flipH ? -1 : 1) * cx) / 2
    const vy = ((transform.flipV ? -1 : 1) * cy) / 2
    return {
      x: (transform.flipH ? cx : 0) + vx * Math.cos(rad) - vy * Math.sin(rad),
      y: (transform.flipV ? cy : 0) + vx * Math.sin(rad) + vy * Math.cos(rad),
    }
  }
  const before = orbit()
  if (axis === 'h') transform.flipH = !transform.flipH
  else transform.flipV = !transform.flipV
  const after = orbit()
  transform.offset.x += Math.round(before.x - after.x)
  transform.offset.y += Math.round(before.y - after.y)
  return transform
}
export function pptxSelectionGeometryOps(
  context: PptxSelectionContext,
  ref: string,
  slide: number,
  draft: PptxSelectionGeometryDraft,
): Record<string, unknown>[] {
  if (context.depth > 1 || (context.depth > 0 && context.element.type === 'group'))
    throw new Error('当前只支持顶层对象与组合的直接成员')
  const original = context.element.transform
  let next: Transform = { ...original, offset: { ...original.offset } }
  for (const [field, key, label] of [
    ['x', 'x', '水平位置'],
    ['y', 'y', '垂直位置'],
    ['width', 'cx', '宽度'],
    ['height', 'cy', '高度'],
  ] as const) {
    if (draft[field] === undefined) continue
    const value = Math.round(number(draft[field], label) * PPTX_GEOMETRY_PT)
    if (!Number.isSafeInteger(value)) throw new Error(`${label}超出可保存范围`)
    if ((key === 'cx' || key === 'cy') && value < 0) throw new Error('宽度和高度不能为负数')
    next.offset[key] = value
  }
  if (draft.rotation !== undefined) {
    const degrees = number(draft.rotation, '旋转角度')
    next.rot = Math.round((((degrees % 360) + 360) % 360) * 60000)
  }
  if (next.offset.cx === 0 && next.offset.cy === 0) throw new Error('宽度和高度不能同时为零')
  const target = { slide, el: ref }
  const group = context.group ? { group: context.group } : {}
  const transformOp = () => ({
    op: 'setTransform',
    target,
    ...group,
    box: { ...next.offset },
    rotDeg: next.rot / 60000,
    ...(context.element.type === 'table' &&
    (next.offset.cx !== original.offset.cx || next.offset.cy !== original.offset.cy)
      ? { resizeTableGrid: true }
      : {}),
  })
  const ops: Record<string, unknown>[] = []
  if (JSON.stringify(next.offset) !== JSON.stringify(original.offset) || next.rot !== original.rot)
    ops.push(transformOp())
  for (const [field, axis] of [
    ['flipH', 'h'],
    ['flipV', 'v'],
  ] as const) {
    if (draft[field] === undefined || draft[field] === next[field]) continue
    ops.push({ op: 'flipElements', target: { slide }, ...group, els: [ref], axis })
    next = flippedTransform(next, axis)
  }
  // Fixed upstream flips mark the member dirty but do not patch its owning
  // group's XML. The explicit local transform flushes that model inside this
  // same atomic transaction, including the native center compensation.
  if (context.group && ops.some((op) => op.op === 'flipElements')) ops.push(transformOp())
  const preset = pptxGeometryPreset(context)
  if (draft.preset !== undefined && draft.preset !== preset) {
    if (
      !preset ||
      !PPTX_SHAPES.some((item) => item.kind === draft.preset && !isPptxLineKind(item.kind))
    )
      throw new Error('请选择支持的预设形状；线条与自定义几何不能直接替换')
    ops.push({ op: 'setShapeGeometry', target, ...group, prst: draft.preset })
  }
  return ops
}
