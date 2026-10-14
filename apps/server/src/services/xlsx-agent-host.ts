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
import {
  translateSharedFormula,
  type StructuralOp,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import {
  expandToPrimitiveOps,
  workbookOperationSchema,
  type CellFormatPatch,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import type { CellState } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook.types.js'
import type { WorkbookStyleEdit } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/shared/edit-schemas.js'
import { BoundedZip, MAX_ZIP_INPUT_BYTES } from '../../../../packages/office/src/zip-bounds.js'
import { documentAgentFormatOf } from './document-agent-format.js'
import { getDocument } from './documents.js'

/** The same byte-level executor is called by the grid and by Agent proposals. */
export interface XlsxHostRequest {
  documentId: string
  bytes: Uint8Array
  expectedVersion: number
  ops: unknown[]
  signal?: AbortSignal
}

export interface XlsxHostResult {
  bytes: Uint8Array
  version: number
  changedCells: string[]
  touchedEntries: string[]
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('XLSX 操作已取消；文档未修改')
}

function sameCell(left: CellState, right: CellState): boolean {
  return left.value === right.value && left.formula === right.formula
}

const MAX_MATERIALIZED_CELLS = 2_000
const SUPPORTED_OPS = new Set([
  'set_cell',
  'set_formula',
  'clear_cell',
  'set_range',
  'clear_range',
  'fill_range',
  'copy_range',
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
  if (rangeCellCount(bounds) > MAX_MATERIALIZED_CELLS)
    throw new Error(`当前宿主的范围写入最多 ${MAX_MATERIALIZED_CELLS} 个格子`)
  for (let row = bounds.startRow; row <= bounds.endRow; row++)
    for (let column = bounds.startColumn; column <= bounds.endColumn; column++) visit(row, column)
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
  if (!Array.isArray(request.ops) || request.ops.length < 1 || request.ops.length > 50)
    throw new Error('XLSX 操作批次必须包含 1–50 项')

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
  checkSignal(signal)
  await (await BoundedZip.open(bytes)).preflightAll()
  const source = Buffer.from(bytes)
  const before = await readBasicWorkbook(source)
  const cells = new Map<string, CellState>()
  const sheets = new Map(before.snapshot.sheets.map((sheet) => [sheet.id, sheet]))
  const edits = new Map<string, CellEdit>()
  const structuralOps: Array<{ sheetName: string; ops: StructuralOp[] }> = []
  const expanded = expandToPrimitiveOps(parsed)
  if (expanded.length > MAX_MATERIALIZED_CELLS) throw new Error('XLSX 操作展开超过 2000 个单元格')
  for (const op of expanded) {
    if (op.op !== 'set_cell' && op.op !== 'set_formula' && op.op !== 'clear_cell') {
      if (!('sheetId' in op)) throw new Error(`XLSX 操作 ${op.op} 缺少工作表 ID`)
      const sheet = sheets.get(op.sheetId)
      if (!sheet) throw new Error(`工作表 ${op.sheetId} 已失效，请重新读取工作簿`)
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
      if (op.op === 'fill_range' || op.op === 'copy_range') {
        if (op.op === 'copy_range' && (op.filterColumn || op.filterValues))
          throw new Error('带筛选条件的 copy_range 尚未接入')
        const sourceSheet = sheets.get(op.sourceSheetId ?? op.sheetId)
        if (!sourceSheet) throw new Error('源工作表 ID 已失效，请重新读取工作簿')
        const sourceBounds = parseRange(op.source)
        const targetBounds = parseRange(op.target)
        const sourceRows = sourceBounds.endRow - sourceBounds.startRow + 1
        const sourceColumns = sourceBounds.endColumn - sourceBounds.startColumn + 1
        const destination =
          op.op === 'copy_range'
            ? {
                ...targetBounds,
                endRow: targetBounds.startRow + sourceRows - 1,
                endColumn: targetBounds.startColumn + sourceColumns - 1,
              }
            : targetBounds
        forEachCell(destination, (row, column) => {
          const sourceRow = sourceBounds.startRow + ((row - destination.startRow) % sourceRows)
          const sourceColumn =
            sourceBounds.startColumn + ((column - destination.startColumn) % sourceColumns)
          const sourceAddress = formatAddress(sourceRow, sourceColumn)
          const original = sourceSheet.cells[sourceAddress] ?? { value: null }
          const sourceCell =
            cells.get(`${op.sourceSheetId ?? op.sheetId}:${sourceAddress}`) ?? original
          const formula =
            sourceCell.formula === undefined
              ? undefined
              : translateSharedFormula(sourceCell.formula, row - sourceRow, column - sourceColumn)
          if (sourceCell.formula !== undefined && formula === null)
            throw new Error(`${sourceSheet.name}!${sourceAddress} 公式平移超出工作表边界`)
          const next: CellState =
            formula == null
              ? { value: sourceCell.rawValue ?? sourceCell.value }
              : { value: null, formula }
          const address = formatAddress(row, column)
          const key = `${op.sheetId}:${address}`
          cells.set(key, next)
          edits.set(key, { sheetName: sheet.name, row, column, writeValue: true, cell: next })
        })
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
    edits.set(`${op.sheetId}:${op.address}`, {
      sheetName: sheet.name,
      row,
      column,
      writeValue: true,
      cell: next,
      style: edits.get(`${op.sheetId}:${op.address}`)?.style,
    })
  }
  if (edits.size === 0 && structuralOps.length === 0)
    throw new Error('XLSX 操作没有生成可写入的变更')
  checkSignal(signal)
  const mutation = await applyCellEditsToXlsx(source, [...edits.values()], structuralOps)
  assertOnlyTouchedEntriesChanged(mutation)
  checkSignal(signal)
  const after = await readBasicWorkbook(mutation.buffer)
  const afterSheets = new Map(after.snapshot.sheets.map((sheet) => [sheet.name, sheet]))
  for (const [key, edit] of edits) {
    const address = key.split(':').at(-1)
    if (!address) throw new Error('XLSX 读回时丢失单元格地址')
    const cell = afterSheets.get(edit.sheetName)?.cells[address] ?? { value: null }
    if (!sameCell(cell, edit.cell)) throw new Error(`${edit.sheetName}!${address} 保存后读回不一致`)
  }
  await (await BoundedZip.open(mutation.buffer)).preflightAll()
  checkSignal(signal)
  return {
    bytes: new Uint8Array(mutation.buffer),
    version: expectedVersion + 1,
    changedCells: [...edits.keys()],
    touchedEntries: [...mutation.touchedEntries],
  }
}
