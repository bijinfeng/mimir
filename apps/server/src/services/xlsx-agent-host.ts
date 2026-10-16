import {
  validateXlsxCellInput,
  xlsxScalar,
} from '../../../../packages/office/src/xlsx-cell-effects.js'
import type { XlsxWorkbook } from '../../../../packages/office/src/xlsx.js'
import { applyXlsxPivotOperation, XLSX_PIVOT_OPS } from './xlsx-agent-pivots.js'
import { applyXlsxTableOperation, XLSX_TABLE_OPS } from './xlsx-agent-tables.js'
import { applyXlsxObjectOperation, XLSX_OBJECT_OPS } from './xlsx-agent-objects.js'
import {
  applyCellEditsToXlsx,
  assertOnlyTouchedEntriesChanged,
  readBasicWorkbook,
  type CellEdit,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  parseAddress,
  parseRange,
  columnIndex,
  formatAddress,
  rangeCellCount,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type { StructuralOp } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import {
  expandToPrimitiveOps,
  workbookOperationSchema,
  type CellFormatPatch,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import type { CellState } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook.types.js'
import type { WorkbookStyleEdit } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/shared/edit-schemas.js'
import {
  validateSheetName,
  type SheetEditPlan,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-sheets.js'
import { BoundedZip, MAX_ZIP_INPUT_BYTES } from '../../../../packages/office/src/zip-bounds.js'
import { documentAgentFormatOf } from './document-agent-format.js'
import { getDocument } from './documents.js'
import { applyXlsxDataOperation } from './xlsx-agent-data.js'
import { applyXlsxRangeOperation } from './xlsx-agent-range.js'
import { applyXlsxPropertyOperation, XLSX_PROPERTY_OPS } from './xlsx-agent-properties.js'
import { applyXlsxFeatureOperation } from './xlsx-agent-features.js'
import { xlsxHostActionSchema, type XlsxHostAction, type XlsxRecalculation } from '@mimir/shared'
import { recalculateXlsx } from './xlsx-recalc.js'
import { xlsxManualOperationSchema, XLSX_MANUAL_OPS } from '@mimir/shared'
import { applyXlsxManualOperation } from './xlsx-manual-ops.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'

/** The same byte-level executor is called by the grid and by Agent proposals. */
export interface XlsxHostRequest {
  documentId: string
  bytes: Uint8Array
  expectedVersion: number
  ops: unknown[]
  image?: { bytes: Uint8Array; mimeType: string }
  action?: XlsxHostAction
  signal?: AbortSignal
}

export interface XlsxHostResult {
  bytes: Uint8Array
  version: number
  changedCells: string[]
  touchedEntries: string[]
  recalculation?: XlsxRecalculation
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('XLSX 操作已取消；文档未修改')
}

function sameCell(left: CellState, right: CellState): boolean {
  return left.value === right.value && left.formula === right.formula
}

const MAX_MATERIALIZED_CELLS = 2_000
const SUPPORTED_OPS = new Set([
  ...XLSX_PROPERTY_OPS,
  ...XLSX_OBJECT_OPS,
  ...XLSX_TABLE_OPS,
  ...XLSX_PIVOT_OPS,
  'set_cell',
  'set_formula',
  'clear_cell',
  'set_range',
  'clear_range',
  'fill_range',
  'copy_range',
  'convert_to_values',
  'set_hyperlink',
  'set_note',
  'protect_sheet',
  'format_range',
  'insert_rows',
  'delete_rows',
  'insert_cols',
  'delete_cols',
  'merge_cells',
  'unmerge_cells',
  'set_row_height',
  'set_col_width',
  'set_rows_hidden',
  'set_cols_hidden',
  'rename_sheet',
  'add_sheet',
  'delete_sheet',
  'duplicate_sheet',
  'set_sheet_hidden',
  'move_sheet',
  'sort_range',
  'find_replace',
  'set_filter',
  'clear_filter',
  'set_filter_criteria',
])

function styleFromFormat(format: CellFormatPatch): WorkbookStyleEdit {
  const style: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(format)) {
    if (value === undefined) continue
    if (key === 'border') {
      const border = value as NonNullable<CellFormatPatch['border']>
      const edge = border.type === 'none' ? null : { style: 'thin', color: border.color }
      const edges =
        border.type === 'all' || border.type === 'none'
          ? ['Top', 'Bottom', 'Left', 'Right']
          : [border.type[0]!.toUpperCase() + border.type.slice(1)]
      for (const name of edges) style[`border${name}`] = edge
      continue
    }
    if (key === 'horizontalAlign' || key === 'verticalAlign') {
      if (value === null) throw new Error(`format_range 暂不支持清除 ${key}`)
      style[key === 'horizontalAlign' ? 'horizontalAlignment' : 'verticalAlignment'] = value
      continue
    }
    if (key === 'textRotation') {
      style.textRotation =
        value === null
          ? 0
          : value === 'vertical'
            ? 255
            : typeof value === 'number' && value < 0
              ? 90 - value
              : value
      continue
    }
    if (key === 'indent') {
      style.indent = value ?? 0
      continue
    }
    if (key === 'numberFormat') {
      style.numberFormat = value ?? 'General'
      continue
    }
    if (key === 'fontFamily' || key === 'fontSize') {
      if (value === null) throw new Error(`format_range 暂不支持清除 ${key}`)
      style[key] = value
      continue
    }
    if (key === 'fill') throw new Error('format_range 的图案和渐变填充尚未接入；可使用 fillColor')
    if (
      value === null &&
      ['bold', 'italic', 'underline', 'strikethrough', 'wrapText'].includes(key)
    )
      style[key] = false
    else style[key] = value
  }
  return style as WorkbookStyleEdit
}

function forEachCell(
  bounds: ReturnType<typeof parseRange>,
  visit: (row: number, column: number) => void,
): void {
  if (bounds.endRow >= 1_048_576 || bounds.endColumn >= 16_384)
    throw new Error('单元格范围超出工作表边界')
  if (rangeCellCount(bounds) > MAX_MATERIALIZED_CELLS)
    throw new Error(`当前宿主的范围写入最多 ${MAX_MATERIALIZED_CELLS} 个格子`)
  for (let row = bounds.startRow; row <= bounds.endRow; row++)
    for (let column = bounds.startColumn; column <= bounds.endColumn; column++) visit(row, column)
}

async function checkDataValidation(before: XlsxWorkbook, result: XlsxHostResult): Promise<void> {
  const after = await readXlsx(result.bytes)
  for (const sheet of after.sheets) {
    if (!sheet.extras?.validations?.length) continue
    const prior = before.sheets.find((s) => s.id === sheet.id)
    const positions = new Set(
      [...(prior?.rows ?? []), ...sheet.rows].flatMap((row) =>
        row.cells.map((cell) => `${row.number}:${cell.col}`),
      ),
    )
    for (const position of positions) {
      const [rowNumber, column] = position.split(':').map(Number) as [number, number]
      const cell = sheet.rows.find((r) => r.number === rowNumber)?.cells[column]
      const previous = prior?.rows.find((r) => r.number === rowNumber)?.cells[column]
      if (
        cell?.rawText === previous?.rawText &&
        cell?.text === previous?.text &&
        cell?.formulaText === previous?.formulaText
      )
        continue
      const address = formatAddress(rowNumber - 1, column),
        error = validateXlsxCellInput(sheet, after, address, cell ? xlsxScalar(cell) : null)
      if (error) throw new Error(`${sheet.name}!${address}：${error}；文档未修改`)
    }
  }
}

/** Unsupported upstream operations fail before a single byte is changed. */
export async function applyXlsxOpsOnHost(request: XlsxHostRequest): Promise<XlsxHostResult> {
  const { documentId, bytes, expectedVersion, signal } = request
  if (!documentId) throw new Error('缺少文档 ID')
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    throw new Error('XLSX 画布版本无效')
  const document = await getDocument(documentId)
  if (!document || documentAgentFormatOf(document) !== 'xlsx')
    throw new Error('文档不存在或不是 XLSX')
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_ZIP_INPUT_BYTES)
    throw new Error(`XLSX 原件必须是至多 ${MAX_ZIP_INPUT_BYTES} 字节的二进制数据`)
  const action = xlsxHostActionSchema.parse(request.action ?? 'apply_ops')
  if (action === 'recalculate_formulas') {
    if (!Array.isArray(request.ops) || request.ops.length !== 0)
      throw new Error('公式重算须单独提交空operations')
    const result = await recalculateXlsx(bytes, signal)
    return { ...result, version: expectedVersion + 1 }
  }
  if (!Array.isArray(request.ops) || request.ops.length < 1 || request.ops.length > 50)
    throw new Error('XLSX 操作批次必须包含 1–50 项')

  const manual = request.ops.filter(
    (raw) => raw && typeof raw === 'object' && XLSX_MANUAL_OPS.has((raw as { op: never }).op),
  )
  if (manual.length) {
    if (request.ops.length !== 1 || request.image) throw new Error('手动范围工具须单独提交')
    const operation = xlsxManualOperationSchema.parse(manual[0])
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    const result = await applyXlsxManualOperation(bytes, operation, expectedVersion)
    await checkDataValidation(await readXlsx(bytes), result)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }

  const parsed = request.ops.map((raw, index) => {
    const candidate =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null
    if (!candidate || typeof candidate.op !== 'string')
      throw new Error(
        `第 ${index + 1} 项 XLSX 操作缺少字符串字段 op；例如 {"op":"set_cell","sheetId":"sheet-1","address":"B3","value":"内容"}（不要用 type）`,
      )
    if (!SUPPORTED_OPS.has(candidate.op))
      throw new Error(`第 ${index + 1} 项 XLSX 操作的 op 尚未接入宿主写回`)
    const result = workbookOperationSchema.safeParse(raw)
    if (!result.success) {
      const issue = result.error.issues[0]
      const field = issue?.path.join('.') || '操作'
      throw new Error(
        `第 ${index + 1} 项 XLSX ${candidate.op} 参数无效：${field} ${issue?.message ?? '请核对工具字段'}`,
      )
    }
    return result.data
  })
  for (const op of parsed) {
    if ('range' in op && typeof op.range === 'string') {
      const bounds = parseRange(op.range)
      if (bounds.endRow >= 1_048_576 || bounds.endColumn >= 16_384)
        throw new Error('单元格范围超出工作表边界')
    }
  }
  const structural = parsed.some(
    (op) =>
      ![
        'set_cell',
        'set_formula',
        'clear_cell',
        'set_range',
        'clear_range',
        'format_range',
      ].includes(op.op),
  )
  if (structural && parsed.length !== 1)
    throw new Error('行列或合并操作须单独提交，避免同批次地址位移')
  if (
    request.image &&
    (parsed.length !== 1 || parsed[0]!.op !== 'add_image' || parsed[0]!.path !== 'upload')
  )
    throw new Error('上传图片须单独通过add_image操作提交')
  checkSignal(signal)
  await (await BoundedZip.open(bytes)).preflightAll()
  const source = Buffer.from(bytes)
  const before = await readBasicWorkbook(source)
  const preview = await readXlsx(bytes)
  for (const op of parsed) {
    if (
      'sheetId' in op &&
      ![
        'protect_sheet',
        'rename_sheet',
        'move_sheet',
        'set_sheet_hidden',
        'duplicate_sheet',
        'delete_sheet',
      ].includes(op.op) &&
      preview.sheets.find((sheet) => sheet.id === op.sheetId)?.extras?.protected
    )
      throw new Error('工作表已保护，请先取消保护')
  }
  if (
    parsed.length === 1 &&
    ['set_hyperlink', 'set_note', 'protect_sheet'].includes(parsed[0]!.op)
  ) {
    const result = await applyXlsxFeatureOperation(bytes, parsed[0]!, expectedVersion)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }
  if (parsed.some((op) => op.op === 'set_range')) {
    const archive = await BoundedZip.open(bytes)
    for (const op of parsed) {
      if (op.op !== 'set_range') continue
      const sheet = preview.sheets.find((item) => item.id === op.sheetId)
      if (!sheet) throw new Error('工作表 ID 已失效')
      const xml = (await archive.readText(sheet.entry)) ?? ''
      if (/<sheetProtection\b/.test(xml)) throw new Error('工作表已保护，请先取消保护')
      if (/<f\b[^>]*(?:\bt=|\bref=|\bsi=)/.test(xml))
        throw new Error('共享或数组公式工作表尚不支持范围覆盖')
    }
  }
  if (
    parsed.length === 1 &&
    ['copy_range', 'fill_range', 'convert_to_values'].includes(parsed[0]!.op)
  ) {
    const result = await applyXlsxRangeOperation(bytes, before, parsed[0]!, expectedVersion)
    await checkDataValidation(preview, result)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }
  if (
    parsed.length === 1 &&
    ['sort_range', 'set_filter', 'clear_filter', 'set_filter_criteria'].includes(parsed[0]!.op)
  ) {
    const result = await applyXlsxDataOperation(bytes, before, parsed[0]!, expectedVersion)
    await checkDataValidation(preview, result)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }
  if (parsed.length === 1 && XLSX_PROPERTY_OPS.has(parsed[0]!.op)) {
    const result = await applyXlsxPropertyOperation(bytes, parsed[0]!, expectedVersion)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }
  if (parsed.length === 1 && XLSX_OBJECT_OPS.has(parsed[0]!.op)) {
    const result = await applyXlsxObjectOperation(bytes, parsed[0]!, expectedVersion, request.image)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }
  if (parsed.length === 1 && XLSX_TABLE_OPS.has(parsed[0]!.op)) {
    const result = await applyXlsxTableOperation(bytes, parsed[0]!, expectedVersion)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }
  if (parsed.length === 1 && XLSX_PIVOT_OPS.has(parsed[0]!.op)) {
    const result = await applyXlsxPivotOperation(bytes, parsed[0]!, expectedVersion)
    checkSignal(signal)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    return result
  }
  const cells = new Map<string, CellState>()
  const sheets = new Map(before.snapshot.sheets.map((sheet) => [sheet.id, sheet]))
  const edits = new Map<string, CellEdit>()
  const structuralOps: Array<{ sheetName: string; ops: StructuralOp[] }> = []
  let sheetPlan: SheetEditPlan | undefined
  for (const op of parsed)
    if (
      'range' in op &&
      typeof op.range === 'string' &&
      rangeCellCount(parseRange(op.range)) > MAX_MATERIALIZED_CELLS
    )
      throw new Error('当前宿主的范围写入最多 2000 个格子')
  const expanded = expandToPrimitiveOps(
    parsed,
    (address, sheetId) => sheets.get(sheetId)?.cells[address] ?? { value: null },
  )
  if (expanded.length > MAX_MATERIALIZED_CELLS) throw new Error('XLSX 操作展开超过 2000 个单元格')
  for (const op of expanded) {
    if (op.op !== 'set_cell' && op.op !== 'set_formula' && op.op !== 'clear_cell') {
      if (op.op === 'add_sheet') {
        validateSheetName(op.name)
        if (!op.name.trim()) throw new Error('工作表名称不能为空')
        if (op.rows !== undefined || op.columns !== undefined)
          throw new Error('新增工作表暂不支持指定网格行列数')
        if (
          before.snapshot.sheets.some(
            (existing) => existing.name.toLocaleLowerCase() === op.name.toLocaleLowerCase(),
          )
        )
          throw new Error(`工作表名称「${op.name}」已被使用`)
        sheetPlan = {
          renames: [],
          additions: [{ name: op.name }],
          removals: [],
          order: [...before.snapshot.sheets.map((item) => item.name), op.name],
        }
        continue
      }
      if (!('sheetId' in op)) throw new Error(`XLSX 操作 ${op.op} 缺少工作表 ID`)
      const sheet = sheets.get(op.sheetId)
      if (!sheet) throw new Error(`工作表 ${op.sheetId} 已失效，请重新读取工作簿`)
      if (['delete_sheet', 'duplicate_sheet', 'set_sheet_hidden', 'move_sheet'].includes(op.op)) {
        const names = before.snapshot.sheets.map((item) => item.name)
        const base: SheetEditPlan = { renames: [], additions: [], removals: [], order: names }
        if (op.op === 'delete_sheet') {
          if (names.length <= 1) throw new Error('不能删除最后一张工作表')
          sheetPlan = {
            ...base,
            removals: [sheet.name],
            order: names.filter((name) => name !== sheet.name),
            orderChanged: true,
          }
        } else if (op.op === 'duplicate_sheet') {
          let name = op.name ?? `${sheet.name.slice(0, 24)} 副本`
          if (!op.name) {
            let i = 2
            while (names.some((item) => item.toLowerCase() === name.toLowerCase()))
              name = `${sheet.name.slice(0, 23)} 副本${i++}`
          }
          validateSheetName(name)
          if (names.some((item) => item.toLowerCase() === name.toLowerCase()))
            throw new Error('工作表名称已被使用')
          const order = [...names]
          order.splice(names.indexOf(sheet.name) + 1, 0, name)
          sheetPlan = {
            ...base,
            additions: [{ name, sourceSheetName: sheet.name }],
            order,
            orderChanged: true,
          }
        } else if (op.op === 'set_sheet_hidden') {
          sheetPlan = { ...base, hiddenChanges: [{ sheetName: sheet.name, hidden: op.hidden }] }
        } else if (op.op === 'move_sheet') {
          if (op.position > names.length) throw new Error('工作表位置超出页签数量')
          const order = names.filter((name) => name !== sheet.name)
          order.splice(op.position - 1, 0, sheet.name)
          sheetPlan = { ...base, order, orderChanged: true }
        }
        continue
      }
      if (op.op === 'format_range') {
        const style = styleFromFormat(op.format)
        forEachCell(parseRange(op.range), (row, column) => {
          const address = formatAddress(row, column)
          const key = `${op.sheetId}:${address}`
          const existing = edits.get(key)
          edits.set(key, {
            sheetName: sheet.name,
            row,
            column,
            writeValue: existing?.writeValue ?? false,
            cell: existing?.cell ?? sheet.cells[address] ?? { value: null },
            style: { ...existing?.style, ...style },
          })
        })
        continue
      }
      if (op.op === 'rename_sheet') {
        validateSheetName(op.name)
        if (!op.name.trim()) throw new Error('工作表名称不能为空')
        if (op.name === sheet.name) throw new Error('工作表名称没有变化')
        if (
          before.snapshot.sheets.some(
            (other) =>
              other.id !== sheet.id &&
              other.name.toLocaleLowerCase() === op.name.toLocaleLowerCase(),
          )
        )
          throw new Error(`工作表名称「${op.name}」已被使用`)
        sheetPlan = {
          renames: [{ sheetName: sheet.name, newName: op.name }],
          additions: [],
          removals: [],
          order: before.snapshot.sheets.map((item) => (item.id === sheet.id ? op.name : item.name)),
        }
        continue
      }
      let native: StructuralOp
      switch (op.op) {
        case 'insert_rows':
          native = { kind: 'insert-rows', index: op.row - 1, count: op.count }
          break
        case 'delete_rows':
          native = { kind: 'remove-rows', index: op.row - 1, count: op.count }
          break
        case 'insert_cols':
          native = { kind: 'insert-cols', index: columnIndex(op.column), count: op.count }
          break
        case 'delete_cols':
          native = { kind: 'remove-cols', index: columnIndex(op.column), count: op.count }
          break
        case 'merge_cells':
          native = { kind: 'merge-cells', range: parseRange(op.range) }
          break
        case 'unmerge_cells':
          native = { kind: 'unmerge-cells', range: parseRange(op.range) }
          break
        case 'set_row_height':
          native = {
            kind: 'set-row-size',
            start: op.row - 1,
            end: op.row + op.count - 2,
            size: op.heightPoints,
          }
          break
        case 'set_col_width':
          native = {
            kind: 'set-col-size',
            start: columnIndex(op.column),
            end: columnIndex(op.column) + op.count - 1,
            // OOXML stores column width in character units. The GenOffice
            // structural gateway accepts that unit, while the DSL uses pixels.
            size: Math.max(0, (op.widthPx - 5) / 7),
          }
          break
        case 'set_rows_hidden':
          native = {
            kind: 'set-rows-hidden',
            start: op.row - 1,
            end: op.row + op.count - 2,
            hidden: op.hidden,
          }
          break
        case 'set_cols_hidden':
          native = {
            kind: 'set-cols-hidden',
            start: columnIndex(op.column),
            end: columnIndex(op.column) + op.count - 1,
            hidden: op.hidden,
          }
          break
        default:
          throw new Error(`XLSX 操作 ${op.op} 尚未接入宿主写回`)
      }
      structuralOps.push({ sheetName: sheet.name, ops: [native] })
      continue
    }
    const sheet = sheets.get(op.sheetId)
    if (!sheet) throw new Error(`工作表 ${op.sheetId} 已失效，请重新读取工作簿`)
    const current = cells.get(`${op.sheetId}:${op.address}`) ??
      sheet.cells[op.address] ?? { value: null }
    if (
      op.op === 'set_cell' &&
      op.expectedValue !== undefined &&
      current.value !== op.expectedValue
    )
      throw new Error(`${sheet.name}!${op.address} 内容已变化，请重新读取`)
    if (
      op.op === 'set_formula' &&
      op.expectedFormula !== undefined &&
      current.formula !== op.expectedFormula
    )
      throw new Error(`${sheet.name}!${op.address} 公式已变化，请重新读取`)
    const next: CellState =
      op.op === 'set_formula'
        ? { value: null, formula: op.formula }
        : { value: op.op === 'clear_cell' ? null : op.value }
    cells.set(`${op.sheetId}:${op.address}`, next)
    const { row, column } = parseAddress(op.address)
    if (row >= 1_048_576 || column >= 16_384) throw new Error('单元格超出工作表边界')
    edits.set(`${op.sheetId}:${op.address}`, {
      sheetName: sheet.name,
      row,
      column,
      writeValue: true,
      cell: next,
      style: edits.get(`${op.sheetId}:${op.address}`)?.style,
    })
  }
  if (edits.size === 0 && structuralOps.length === 0 && !sheetPlan)
    throw new Error('XLSX 操作没有生成可写入的变更')
  checkSignal(signal)
  const mutation = await applyCellEditsToXlsx(
    source,
    [...edits.values()],
    structuralOps,
    [],
    sheetPlan,
  )
  assertOnlyTouchedEntriesChanged(mutation)
  checkSignal(signal)
  const after = await readBasicWorkbook(mutation.buffer)
  const afterSheets = new Map(after.snapshot.sheets.map((sheet) => [sheet.name, sheet]))
  if (sheetPlan) {
    if (after.snapshot.sheets.map((item) => item.name).join('\0') !== sheetPlan.order.join('\0'))
      throw new Error('工作表操作保存后顺序不一致')
    const rename = sheetPlan.renames[0]
    if (rename) {
      const original = before.snapshot.sheets.find((item) => item.name === rename.sheetName)
      const renamed = after.snapshot.sheets.find((item) => item.id === original?.id)
      if (
        renamed?.name !== rename.newName ||
        after.snapshot.sheets.length !== before.snapshot.sheets.length
      )
        throw new Error('工作表改名保存后读回不一致')
    }
    const addition = sheetPlan.additions[0]
    if (addition) {
      const added = after.snapshot.sheets.find((item) => item.name === addition.name)
      if (
        after.snapshot.sheets.length !== before.snapshot.sheets.length + 1 ||
        added?.name !== addition.name ||
        before.snapshot.sheets.some((item) => item.id === added.id)
      )
        throw new Error('新增工作表保存后读回不一致')
    }
  }
  for (const [key, edit] of edits) {
    const address = key.split(':').at(-1)
    if (!address) throw new Error('XLSX 读回时丢失单元格地址')
    const cell = afterSheets.get(edit.sheetName)?.cells[address] ?? { value: null }
    if (!sameCell(cell, edit.cell)) throw new Error(`${edit.sheetName}!${address} 保存后读回不一致`)
  }
  await (await BoundedZip.open(mutation.buffer)).preflightAll()
  checkSignal(signal)
  const result = {
    bytes: new Uint8Array(mutation.buffer),
    version: expectedVersion + 1,
    changedCells: [...edits.keys()],
    touchedEntries: [...mutation.touchedEntries],
  }
  if (!structural || parsed[0]?.op === 'find_replace') await checkDataValidation(preview, result)
  return result
}
