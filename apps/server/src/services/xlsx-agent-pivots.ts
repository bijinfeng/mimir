import {
  buildPivotLayout,
  pivotOutputArea,
  areasOverlap,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/pivot-layout.js'
import {
  growPivotDefinition,
  recomputePivotData,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/pivot-engine.js'
import {
  createBufferEntrySource,
  planCellEditsToXlsx,
  assembleWithJsZip,
  assertOnlyTouchedEntriesChanged,
  type CellEdit,
  type SheetPivotAddition,
  type PivotRefreshUpdate,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  parseAddress,
  parseRange,
  formatAddress,
  rangeCellCount,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type {
  AddPivotOperation,
  WorkbookOperation,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import type { PivotDefinition } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-pivot.js'
import { readXlsx, type XlsxSheet } from '../../../../packages/office/src/xlsx.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { xlsxAttribute } from '../../../../packages/office/src/xlsx-sheet-features.js'
export const XLSX_PIVOT_OPS = new Set(['add_pivot', 'refresh_pivot'])
/** Only the pinned writer's complete grouping extension is modeled by relayout.
 * Any additional XML/JSON metadata must retain the existing fail-closed guard. */
function hasUnmodeledExtensions(xml: string, definition: PivotDefinition): boolean {
  const openings = [...xml.matchAll(/<(?:\w+:)?extLst\b/g)]
  if (!openings.length) return false
  if (openings.length !== 1) return true
  const block =
    /<extLst><ext uri="\{AIO-PIVOT-GROUPINGS\}" xmlns:aio="urn:aioffice:pivot"><aio:aioPivotGroupings v="[^"]*"\/><\/ext><\/extLst>/.exec(
      xml,
    )?.[0]
  if (!block) return true
  const expected = new Map(
    definition.fields.flatMap((field, fieldIndex) =>
      field.grouping ? [[fieldIndex, field.grouping] as const] : [],
    ),
  )
  try {
    const entries: unknown = JSON.parse(
      xlsxAttribute(block.match(/<aio:aioPivotGroupings\b[^>]*\/>/)?.[0] ?? '', 'v') ?? '',
    )
    if (!Array.isArray(entries) || !entries.length || entries.length !== expected.size) return true
    const seen = new Set<number>()
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true
      const { fieldIndex, ...grouping } = entry as Record<string, unknown>
      if (typeof fieldIndex !== 'number' || !Number.isInteger(fieldIndex) || seen.has(fieldIndex))
        return true
      seen.add(fieldIndex)
      const native = expected.get(fieldIndex)
      if (!native) return true
      const keys =
        grouping.kind === 'date'
          ? ['kind', 'dateUnit']
          : ['kind', 'rangeStep', ...(grouping.rangeStart === undefined ? [] : ['rangeStart'])]
      if (
        Object.keys(grouping).length !== keys.length ||
        Object.keys(grouping).some((key) => !keys.includes(key))
      )
        return true
      if (
        Object.keys(native).length !== keys.length ||
        keys.some((key) => grouping[key] !== (native as unknown as Record<string, unknown>)[key])
      )
        return true
    }
    return false
  } catch {
    return true
  }
}
function bounds(ref: string) {
  const b = parseRange(ref)
  if (b.endRow >= 1048576 || b.endColumn >= 16384 || rangeCellCount(b) > 2000)
    throw new Error('透视范围超出边界或2000格上限')
  return b
}
function grid(sheet: XlsxSheet, ref: string) {
  const b = bounds(ref)
  return Array.from({ length: b.endRow - b.startRow + 1 }, (_row, r) =>
    Array.from({ length: b.endColumn - b.startColumn + 1 }, (_, c) => {
      const cell = sheet.rows.find((row) => row.number === b.startRow + r + 1)?.cells[
        b.startColumn + c
      ]
      if (cell?.formula && cell.formulaCache !== 'cached')
        throw new Error('透视源数据含未计算公式，请先重新计算')
      return cell?.numeric
        ? Number(cell.rawText ?? cell.text)
        : cell?.boolean !== undefined
          ? cell.boolean
          : cell?.text || null
    }),
  )
}
// Rebuild the native member/cache metadata alongside expanded output. Updating
// only location leaves stale members behind for the next refresh/open.
function refreshSpec(
  def: PivotDefinition,
): Pick<
  AddPivotOperation,
  'rowFields' | 'columnField' | 'pageFields' | 'values' | 'groupings' | 'filters'
> {
  if (
    def.rowFields.some((field) => field < 0) ||
    def.pageFields.some((field) => field.item !== null)
  )
    throw new Error('此透视表的值行布局或报告筛选选择暂不支持自动扩展')
  return {
    rowFields: def.rowFields.map((f) => def.fields[f]!.name),
    ...(def.colFields.some((f) => f >= 0)
      ? { columnField: def.colFields.filter((f) => f >= 0).map((f) => def.fields[f]!.name) }
      : {}),
    pageFields: def.pageFields.map((f) => def.fields[f.field]!.name),
    values: def.dataFields.map((f) => {
      if (!['sum', 'count', 'average', 'max', 'min'].includes(f.subtotal))
        throw new Error('此汇总方式暂不支持扩展')
      return {
        field: def.fields[f.field]!.name,
        agg: f.subtotal as 'sum' | 'count' | 'average' | 'max' | 'min',
        ...(f.showDataAs ? { showDataAs: f.showDataAs } : {}),
        ...(f.formula ? { formula: f.formula } : {}),
      }
    }),
    groupings: def.fields.flatMap((f) => (f.grouping ? [{ field: f.name, ...f.grouping }] : [])),
    filters: def.filters.map((f) =>
      f.kind === 'label'
        ? { ...f, field: def.fields[f.field]!.name }
        : { ...f, field: def.fields[f.field]!.name, valueIndex: f.dataField },
    ),
  }
}
export async function applyXlsxPivotOperation(
  bytes: Uint8Array,
  op: WorkbookOperation,
  expectedVersion: number,
): Promise<XlsxHostResult> {
  if (op.op !== 'add_pivot' && op.op !== 'refresh_pivot') throw new Error('透视操作无效')
  const workbook = await readXlsx(bytes),
    sheet = workbook.sheets.find((s) => s.id === op.sheetId)
  if (!sheet) throw new Error('工作表已失效')
  const additions: SheetPivotAddition[] = [],
    updates: PivotRefreshUpdate[] = [],
    cachePaths: string[] = [],
    edits: CellEdit[] = []
  const write = (
    target: XlsxSheet,
    location: ReturnType<typeof parseRange>,
    matrix: readonly (readonly (string | number | null)[])[],
    old?: ReturnType<typeof parseRange>,
  ) => {
    const rows = Math.max(matrix.length, old ? old.endRow - old.startRow + 1 : 0),
      cols = Math.max(matrix[0]?.length ?? 0, old ? old.endColumn - old.startColumn + 1 : 0)
    if (
      rows * cols > 2000 ||
      location.startRow + rows > 1048576 ||
      location.startColumn + cols > 16384
    )
      throw new Error('透视输出超出边界或2000格上限')
    if (target.extras?.protected) throw new Error('透视目标表已保护')
    if (
      target.extras?.validations?.some((rule) =>
        rule.range
          .split(/\s+/)
          .some((ref) => areasOverlap(location, parseRange(ref.replaceAll('$', '')))),
      )
    )
      throw new Error('透视输出与数据验证范围重叠，请选择无验证的空白区域')
    if (target.tables?.some((t) => areasOverlap(location, parseRange(t.range))))
      throw new Error('透视输出与结构化表重叠')
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const row = location.startRow + r,
          column = location.startColumn + c,
          cell = target.rows.find((x) => x.number === row + 1)?.cells[column]
        const wasPivot =
          old &&
          row >= old.startRow &&
          row <= old.endRow &&
          column >= old.startColumn &&
          column <= old.endColumn
        if (!wasPivot && (cell?.text || cell?.formula || cell?.covered || cell?.mergeRef))
          throw new Error('透视输出会覆盖现有内容或合并格，请选择空白位置')
        edits.push({
          sheetName: target.name,
          row,
          column,
          writeValue: true,
          cell: { value: matrix[r]?.[c] ?? null },
        })
      }
  }
  if (op.op === 'add_pivot') {
    const source = bounds(op.sourceRange),
      target = workbook.sheets.find((s) => s.id === (op.targetSheetId ?? op.sheetId))
    if (!target) throw new Error('目标工作表已失效')
    const layout = buildPivotLayout(grid(sheet, op.sourceRange), op, {
        subtotal: '小计',
        grandTotal: '总计',
      }),
      anchor = parseAddress(op.targetCell),
      location = pivotOutputArea(anchor, layout)
    bounds(
      `${formatAddress(location.startRow, location.startColumn)}:${formatAddress(location.endRow, location.endColumn)}`,
    )
    if (
      (target.id === sheet.id && areasOverlap(source, location)) ||
      target.pivots?.some((p) => areasOverlap(location, parseRange(p.definition.outputRef)))
    )
      throw new Error('透视输出与源数据或现有透视表重叠')
    const names = new Set(
      workbook.sheets.flatMap((s) => s.pivots ?? []).map((p) => p.name.toLowerCase()),
    )
    let i = 1
    while (names.has(`pivottable${i}`)) i++
    const name = op.name ?? `PivotTable${i}`
    if (names.has(name.toLowerCase())) throw new Error('透视表名称已存在')
    additions.push({
      sheetName: target.name,
      sourceSheetName: sheet.name,
      sourceArea: source,
      location,
      name,
      ...layout.definition,
    })
    write(target, location, layout.matrix)
    for (const f of layout.numberFormats)
      for (let r = location.startRow + 1; r < location.endRow; r++) {
        const edit = edits.find(
          (e) => e.row === r && e.column === location.startColumn + f.columnOffset,
        )
        if (edit) edits[edits.indexOf(edit)] = { ...edit, style: { numberFormat: f.format } }
      }
  } else {
    if (!sheet.pivots?.length) throw new Error('当前工作表没有透视表')
    for (const pivot of sheet.pivots) {
      const def = pivot.definition
      if (def.unsupported.length)
        throw new Error('透视表暂不支持刷新：' + def.unsupported.join('；'))
      const source = workbook.sheets.find((s) => s.name === def.sourceSheet)
      if (!source) throw new Error('透视源工作表不存在')
      const values = grid(source, def.sourceRef),
        growth = growPivotDefinition(def, values),
        grown = growth.definition,
        { data } = recomputePivotData(grown, values),
        old = bounds(def.outputRef)
      if (growth.grown) {
        const original = (await (await BoundedZip.open(bytes)).readText(pivot.path)) ?? ''
        // Relayout rebuilds native fields. Imported metadata that the pinned
        // layout does not model must not be silently reset during growth.
        if (
          /\b(?:rowGrandTotals|colGrandTotals)="(?:0|false)"/.test(original) ||
          hasUnmodeledExtensions(original, def)
        )
          throw new Error('此透视表含自定义总计或扩展属性，暂不支持自动扩展')
        const dataFields = [...original.matchAll(/<dataField\b[^>]*>/g)]
        if (
          dataFields.some(([tag], index) => {
            const format = xlsxAttribute(tag, 'numFmtId')
            return (
              format && format !== '0' && !(format === '10' && def.dataFields[index]?.showDataAs)
            )
          })
        )
          throw new Error('此透视表含自定义数值格式，暂不支持自动扩展；现有内容未修改')
        if (grown.firstDataRow !== 1 || grown.firstDataCol !== Math.max(1, grown.rowFields.length))
          throw new Error('此透视版式暂不支持自动扩展')
        const layout = buildPivotLayout(values, refreshSpec(def), {
            subtotal: '小计',
            grandTotal: '总计',
          }),
          matrix = layout.matrix,
          location = {
            ...old,
            endRow: old.startRow + matrix.length - 1,
            endColumn: old.startColumn + (matrix[0]?.length ?? 0) - 1,
          }
        if (
          sheet.pivots.some(
            (p) =>
              p.path !== pivot.path && areasOverlap(location, parseRange(p.definition.outputRef)),
          )
        )
          throw new Error('透视扩展与其他透视表重叠')
        write(sheet, location, matrix, old)
        updates.push({
          cachePath: pivot.cachePath,
          sheetName: sheet.name,
          newOutputRef: `${formatAddress(location.startRow, location.startColumn)}:${formatAddress(location.endRow, location.endColumn)}`,
          relayout: {
            name: pivot.name,
            sourceSheetName: source.name,
            sourceArea: bounds(def.sourceRef),
            location,
            ...layout.definition,
          },
        })
      } else {
        const location = {
          ...old,
          startRow: old.startRow + def.firstDataRow,
          startColumn: old.startColumn + def.firstDataCol,
        }
        if (
          data.length !== location.endRow - location.startRow + 1 ||
          data.some((r) => r.length !== location.endColumn - location.startColumn + 1)
        )
          throw new Error('透视刷新输出尺寸不一致')
        write(sheet, location, data, old)
      }
      cachePaths.push(pivot.cachePath)
    }
  }
  const source = Buffer.from(bytes),
    plan = await planCellEditsToXlsx(
      await createBufferEntrySource(source),
      edits,
      [],
      [],
      undefined,
      [],
      [],
      [],
      [],
      [],
      null,
      [],
      [],
      [],
      [],
      additions,
      cachePaths,
      updates,
    )
  const result = await assembleWithJsZip(source, plan)
  assertOnlyTouchedEntriesChanged(result)
  await readXlsx(new Uint8Array(result.buffer))
  return {
    bytes: new Uint8Array(result.buffer),
    version: expectedVersion + 1,
    changedCells: edits.map((e) => `${e.sheetName}!${formatAddress(e.row, e.column)}`),
    touchedEntries: [...result.touchedEntries, ...result.removedEntries],
  }
}
