import type { XlsxPivotLayoutEdit } from '@mimir/shared'
import type { XlsxSheet } from '../xlsx.js'
import type { XlsxPivot } from '../xlsx-visuals.js'
import {
  parseAddress,
  parseRange,
  rangeCellCount,
  formatAddress,
} from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  workbookOperationSchema,
  expandToPrimitiveOps,
  type AddPivotOperation,
  type WorkbookOperation,
} from '../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import {
  buildPivotLayout,
  areasOverlap,
  pivotOutputArea,
} from '../../vendor/packages/xlsx-gateway/src/domain/pivot-layout.js'

export type XlsxPivotOperation =
  | Extract<WorkbookOperation, { op: 'add_pivot' | 'refresh_pivot' }>
  | XlsxPivotLayoutEdit
export type PivotAggregate = AddPivotOperation['values'][number]['agg']
export const PIVOT_AGGREGATES: { value: PivotAggregate; label: string }[] = [
  { value: 'sum', label: '求和' },
  { value: 'count', label: '计数' },
  { value: 'average', label: '平均值' },
  { value: 'max', label: '最大值' },
  { value: 'min', label: '最小值' },
]
export interface XlsxPivotValueDraft {
  key: string
  field: string
  agg: PivotAggregate
  numFmt: string
  showDataAs: '' | 'percentOfTotal' | 'percentOfRow' | 'percentOfCol'
  formula: string
}
export interface XlsxPivotGroupingDraft {
  key: string
  field: string
  mode: 'year' | 'quarter' | 'month' | 'range'
  step: string
  start: string
}
export interface XlsxPivotFilterDraft {
  key: string
  field: string
  op: 'equal' | 'contains' | 'beginsWith' | 'top' | 'greaterThan' | 'between'
  text: string
  valueKey: string
  count: string
  from: string
  to: string
}
export interface XlsxPivotDraft {
  name: string
  sourceRange: string
  targetCell: string
  rowFields: string[]
  columnFields: string[]
  pageFields: string[]
  values: XlsxPivotValueDraft[]
  groupings: XlsxPivotGroupingDraft[]
  filters: XlsxPivotFilterDraft[]
}
export function xlsxPivotSource(sheet: XlsxSheet, range: string) {
  if (!/^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/.test(range))
    throw new Error('源范围须包含标题行和数据行，例如 A1:D20')
  const area = parseRange(range)
  if (area.endRow >= 1048576 || area.endColumn >= 16384 || rangeCellCount(area) > 2000)
    throw new Error('源范围最多2000格，且须位于工作表内')
  if (area.endRow <= area.startRow) throw new Error('源范围至少包含一行标题和一行数据')
  const rows = new Map(sheet.rows.map((row) => [row.number, row]))
  const grid = Array.from({ length: area.endRow - area.startRow + 1 }, (_, r) =>
    Array.from({ length: area.endColumn - area.startColumn + 1 }, (_cell, c) => {
      const cell = rows
        .get(area.startRow + r + 1)
        ?.cells.find((item) => item.col === area.startColumn + c)
      if (cell?.formula && cell.formulaCache !== 'cached')
        throw new Error('源数据含未计算公式，请先重新计算')
      return cell?.numeric
        ? Number(cell.rawText ?? cell.text)
        : cell?.boolean !== undefined
          ? cell.boolean
          : cell?.text || null
    }),
  )
  const fields = grid[0]!.map((value) => String(value ?? '').trim())
  if (fields.some((field) => !field)) throw new Error('源范围第一行的字段标题不能为空')
  if (new Set(fields.map((field) => field.toLowerCase())).size !== fields.length)
    throw new Error('字段标题不能重复（忽略大小写）')
  return { fields, grid, area }
}
export function xlsxPivotValue(key: string, field = ''): XlsxPivotValueDraft {
  return { key, field, agg: 'sum', numFmt: '', showDataAs: '', formula: '' }
}
export function createXlsxPivotDraft(sheet: XlsxSheet, sourceRange: string): XlsxPivotDraft {
  let fields: string[] = []
  let valueField = ''
  try {
    const source = xlsxPivotSource(sheet, sourceRange)
    fields = source.fields
    valueField =
      fields.find(
        (_, index) =>
          index > 0 && source.grid.slice(1).some((row) => typeof row[index] === 'number'),
      ) ??
      fields[1] ??
      ''
  } catch {
    /* Show the source issue in the panel. */
  }
  return {
    name: '',
    sourceRange,
    targetCell: '',
    rowFields: fields.slice(0, 1),
    columnFields: [],
    pageFields: [],
    values: [xlsxPivotValue('value-0', valueField)],
    groupings: [],
    filters: [],
  }
}
function numeric(value: string, label: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`请输入有效的${label}`)
  return Number(value)
}
/** Build exactly the existing native add_pivot operation. Draft-only keys never cross the executor. */
export function xlsxPivotOperation(
  sheet: XlsxSheet,
  draft: XlsxPivotDraft,
  targetSheet: XlsxSheet = sheet,
) {
  const source = xlsxPivotSource(sheet, draft.sourceRange)
  if (!/^[A-Z]+[1-9]\d*$/.test(draft.targetCell)) throw new Error('请填写输出左上角单元格，例如 I1')
  const anchor = parseAddress(draft.targetCell)
  if (anchor.row >= 1048576 || anchor.column >= 16384) throw new Error('输出位置超出工作表边界')
  if (
    !draft.rowFields.length ||
    draft.rowFields.length > 8 ||
    draft.columnFields.length > 8 ||
    draft.pageFields.length > 4
  )
    throw new Error('请选择1–8个行字段、至多8个列字段和4个报告筛选字段')
  const dimensions = [...draft.rowFields, ...draft.columnFields, ...draft.pageFields]
  const dimensionSet = new Set(dimensions)
  if (dimensionSet.size !== dimensions.length)
    throw new Error('行、列和报告筛选字段不能重复使用同一字段')
  if (dimensions.some((field) => !source.fields.includes(field)))
    throw new Error('维度字段已不属于当前源范围，请重新选择')
  if (!draft.values.length || draft.values.length > 8) throw new Error('请配置1–8个汇总值')
  if (draft.columnFields.length && draft.values.length !== 1)
    throw new Error('使用列字段时只能配置一个汇总值；多值汇总请先移除列字段')
  if (draft.values.some((value) => dimensionSet.has(value.field)))
    throw new Error('汇总值不能同时用作行、列或报告筛选字段')
  if (draft.values.some((value) => !value.formula && !source.fields.includes(value.field)))
    throw new Error('请选择当前源范围中的汇总字段')
  if (draft.values.some((value) => value.formula && (!value.field.trim() || value.agg !== 'sum')))
    throw new Error('计算字段须填写名称，且只支持求和')
  const axes = [...draft.rowFields, ...draft.columnFields]
  const axisSet = new Set(axes)
  for (const [rules, label] of [
    [draft.groupings, '分组'],
    [draft.filters, '筛选'],
  ] as const) {
    if (rules.length > 8 || new Set(rules.map((rule) => rule.field)).size !== rules.length)
      throw new Error(`每个维度字段只能设置一条${label}规则，最多8条`)
    if (rules.some((rule) => !axisSet.has(rule.field)))
      throw new Error(`${label}规则的字段须属于当前行或列字段`)
  }
  const groupings = draft.groupings.map(
    (group): NonNullable<AddPivotOperation['groupings']>[number] => {
      if (group.mode !== 'range') return { field: group.field, kind: 'date', dateUnit: group.mode }
      const rangeStep = numeric(group.step, '分组间隔')
      if (rangeStep <= 0) throw new Error('分组间隔必须大于0')
      return {
        field: group.field,
        kind: 'range',
        rangeStep,
        ...(group.start.trim() ? { rangeStart: numeric(group.start, '分组起点') } : {}),
      }
    },
  )
  const filters = draft.filters.map((filter): NonNullable<AddPivotOperation['filters']>[number] => {
    if (filter.op === 'equal' || filter.op === 'contains' || filter.op === 'beginsWith')
      return { kind: 'label', field: filter.field, op: filter.op, value: filter.text }
    const valueIndex = draft.values.findIndex((value) => value.key === filter.valueKey)
    if (valueIndex < 0) throw new Error('筛选引用的汇总值已移除，请重新选择')
    if (filter.op === 'top') {
      const count = numeric(filter.count, '前几项数量')
      if (!Number.isInteger(count) || count < 1 || count > 10000)
        throw new Error('前几项数量须为1–10000的整数')
      return { kind: 'value', field: filter.field, op: 'top', valueIndex, count }
    }
    const from = numeric(filter.from, '筛选下限')
    if (filter.op === 'greaterThan')
      return { kind: 'value', field: filter.field, op: 'greaterThan', valueIndex, from }
    const to = numeric(filter.to, '筛选上限')
    if (to < from) throw new Error('筛选上限不能小于下限')
    return { kind: 'value', field: filter.field, op: 'between', valueIndex, from, to }
  })
  const candidate = {
    op: 'add_pivot',
    sheetId: sheet.id,
    ...(targetSheet.id !== sheet.id ? { targetSheetId: targetSheet.id } : {}),
    sourceRange: draft.sourceRange,
    targetCell: draft.targetCell,
    rowFields: [...draft.rowFields],
    ...(draft.columnFields.length ? { columnField: [...draft.columnFields] } : {}),
    ...(draft.pageFields.length ? { pageFields: [...draft.pageFields] } : {}),
    values: draft.values.map(({ field, agg, numFmt, showDataAs, formula }) => ({
      field: field.trim(),
      agg,
      ...(numFmt ? { numFmt } : {}),
      ...(showDataAs ? { showDataAs } : {}),
      ...(formula ? { formula } : {}),
    })),
    ...(groupings.length ? { groupings } : {}),
    ...(filters.length ? { filters } : {}),
    ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
  }
  const parsed = workbookOperationSchema.safeParse(candidate)
  if (!parsed.success || parsed.data.op !== 'add_pivot')
    throw new Error('请检查透视名称、字段和汇总格式，名称以文字或下划线开始')
  const operation = parsed.data
  expandToPrimitiveOps([operation])
  const layout = buildPivotLayout(source.grid, operation)
  const output = pivotOutputArea(anchor, layout)
  if (output.endRow >= 1048576 || output.endColumn >= 16384 || layout.width * layout.height > 2000)
    throw new Error('透视输出超出边界或2000格上限')
  if (sheet.id === targetSheet.id && areasOverlap(source.area, output))
    throw new Error('透视输出不能与源范围重叠')
  return {
    operation,
    layout,
    outputRef: `${draft.targetCell}:${formatAddress(output.endRow, output.endColumn)}`,
  }
}

/** Read the native model directly. Never turn an incomplete imported definition into a lossy edit draft. */
export function xlsxPivotReadback(pivot: XlsxPivot) {
  const def = pivot.definition
  const fieldName = (index: number) =>
    index === -2 ? '汇总值' : (def.fields[index]?.name ?? `未知字段 ${index}`)
  return {
    rows: def.rowFields.map(fieldName),
    columns: def.colFields.map(fieldName),
    pages: def.pageFields.map((page) => ({
      field: fieldName(page.field),
      value:
        page.item === null
          ? '全部项'
          : String(def.fields[page.field]?.sharedItems[page.item] ?? '未知项'),
    })),
    values: def.dataFields.map((value) => ({ ...value, fieldName: fieldName(value.field) })),
    groupings: def.fields.flatMap((field) =>
      field.grouping ? [{ field: field.name, ...field.grouping }] : [],
    ),
    filters: def.filters.map((filter) => ({ ...filter, fieldName: fieldName(filter.field) })),
    unsupported: [...def.unsupported],
  }
}
