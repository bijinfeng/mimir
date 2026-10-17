import {
  ADDABLE_SHAPE_TYPES,
  type AddableShapeType,
} from '../../vendor/packages/xlsx-gateway/src/shared/shape-types.js'
import { parseAddress } from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { PPTX_SHAPE_GROUPS, pptxShapePreview } from './pptx-shape-presets.js'

// Fixed GenOffice 480548fd55f1be3593ee0d8e316a734751d58309 XLSX whitelist.
// Share Office labels/geometry; PPTX-only lines must not leak into XLSX.
export type XlsxShapeKind = AddableShapeType | 'textbox'
const ALLOWED = new Set<string>(ADDABLE_SHAPE_TYPES)
export const XLSX_SHAPE_GROUPS = [
  { key: 'text', label: '文字', shapes: [{ kind: 'textbox' as XlsxShapeKind, label: '文本框' }] },
  ...PPTX_SHAPE_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    shapes: group.shapes.filter((shape): shape is { kind: AddableShapeType; label: string } =>
      ALLOWED.has(shape.kind),
    ),
  })).filter((group) => group.shapes.length > 0),
]
export const XLSX_SHAPES = XLSX_SHAPE_GROUPS.flatMap((group) => group.shapes)
export function xlsxShapeLabel(kind: string | undefined) {
  return XLSX_SHAPES.find((shape) => shape.kind === kind)?.label ?? '自定义形状'
}
export function xlsxShapePreview(kind: string | undefined, width = 36, height = 28) {
  return kind ? pptxShapePreview(kind === 'textbox' ? 'rect' : kind, width, height) : null
}
export function filterXlsxShapes(query: string, category = 'all') {
  const search = query.trim().toLocaleLowerCase()
  return XLSX_SHAPE_GROUPS.filter((group) => category === 'all' || category === group.key)
    .map((group) => ({
      key: group.key,
      label: group.label,
      shapes: group.shapes.filter(
        (shape) =>
          !search ||
          `${shape.label} ${shape.kind} ${group.label}`.toLocaleLowerCase().includes(search),
      ),
    }))
    .filter((group) => group.shapes.length > 0)
}
export interface XlsxShapeDraft {
  kind: XlsxShapeKind
  anchorCell: string
  text: string
  fillColor: string
}
export function createXlsxShapeDraft(range: string): XlsxShapeDraft {
  return { kind: 'rect', anchorCell: range.split(':')[0] ?? '', text: '', fillColor: '#4472C4' }
}
export function xlsxShapeOperation(draft: XlsxShapeDraft) {
  if (draft.kind !== 'textbox' && !ALLOWED.has(draft.kind)) throw new Error('请选择形状库中的形状')
  const anchorCell = draft.anchorCell.trim().toUpperCase()
  if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(anchorCell))
    throw new Error('请填写有效的左上角单元格，如 E2')
  const position = parseAddress(anchorCell)
  // Existing native insertion occupies four columns and eight rows.
  if (position.column + 4 >= 16384 || position.row + 8 >= 1048576)
    throw new Error('此位置放不下形状，请远离工作表末行或末列')
  if (draft.text.length > 1000) throw new Error('形状文字不能超过 1000 字符')
  if (!/^#[\da-f]{6}$/i.test(draft.fillColor)) throw new Error('请选择有效的填充颜色')
  return {
    op: 'add_shape' as const,
    shapeType: draft.kind,
    anchorCell,
    text: draft.text,
    fillColor: draft.fillColor,
  }
}
