import JSZip from 'jszip'
import {
  applyCellEditsToXlsx,
  assertOnlyTouchedEntriesChanged,
  type CellEdit,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  parseRange,
  formatAddress,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type { StructuralOp } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import type { WorkbookOperation } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'
export const XLSX_TABLE_OPS = new Set([
  'add_table_row',
  'delete_table_row',
  'add_table_column',
  'delete_table_column',
])
const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
export async function applyXlsxTableOperation(
  bytes: Uint8Array,
  op: WorkbookOperation,
  expectedVersion: number,
): Promise<XlsxHostResult> {
  if (
    !['add_table_row', 'delete_table_row', 'add_table_column', 'delete_table_column'].includes(
      op.op,
    ) ||
    !('tableName' in op) ||
    !('sheetId' in op)
  )
    throw new Error('表格操作无效')
  const sheet = (await readXlsx(bytes)).sheets.find((s) => s.id === op.sheetId),
    table = sheet?.tables?.find((t) => t.name.toLowerCase() === op.tableName.toLowerCase())
  if (!sheet || !table) throw new Error('结构化表已失效')
  const zip = await JSZip.loadAsync(bytes),
    original = await zip.file(table.path)!.async('string')
  if (
    /totalsRowCount="[1-9]|headerRowCount="0"|<calculatedColumnFormula\b|<totalsRowFormula\b/.test(
      original,
    )
  )
    throw new Error('含汇总行或计算列的表格结构调整尚未支持')
  const b = parseRange(table.range),
    count = 'count' in op ? Number(op.count) : 1,
    isRow = op.op.endsWith('_row'),
    adding = op.op.startsWith('add_')
  const size = isRow ? b.endRow - b.startRow : b.endColumn - b.startColumn + 1
  const position = ('row' in op ? op.row : 'column' in op ? op.column : undefined) ?? size + 1
  if (
    !Number.isInteger(position) ||
    position < 1 ||
    position > size + (adding ? 1 : 0) ||
    (!adding && (position + count - 1 > size || count >= size))
  )
    throw new Error('位置或数量越界，表格必须保留至少一行数据和一列')
  const columns = [...table.columns]
  if (op.op === 'add_table_column') {
    const names = Array.from({ length: count }, (_, i) =>
      i ? `${op.columnName}${i + 1}` : op.columnName,
    )
    const taken = new Set(columns.map((s) => s.toLowerCase()))
    if (names.some((s) => !s.trim() || taken.has(s.toLowerCase())))
      throw new Error('新增列名必须非空且唯一')
    columns.splice(position - 1, 0, ...names)
  } else if (op.op === 'delete_table_column') columns.splice(position - 1, count)
  const index = isRow ? b.startRow + position : b.startColumn + position - 1
  const native: StructuralOp = {
    kind: isRow ? (adding ? 'insert-rows' : 'remove-rows') : adding ? 'insert-cols' : 'remove-cols',
    index,
    count,
  }
  if (
    isRow ? b.endRow + (adding ? count : 0) >= 1048576 : b.endColumn + (adding ? count : 0) >= 16384
  )
    throw new Error('结构调整超出工作表边界')
  const mutation = await applyCellEditsToXlsx(
    Buffer.from(bytes),
    [],
    [{ sheetName: sheet.name, ops: [native] }],
  )
  assertOnlyTouchedEntriesChanged(mutation)
  const next = await JSZip.loadAsync(mutation.buffer),
    shifted = await next.file(table.path)!.async('string')
  const range = `${formatAddress(b.startRow, b.startColumn)}:${formatAddress(b.endRow + (isRow ? (adding ? count : -count) : 0), b.endColumn + (!isRow ? (adding ? count : -count) : 0))}`
  let patched = shifted
    .replace(/(<table\b[^>]*\bref=")[^"]*(")/, `$1${range}$2`)
    .replace(/(<autoFilter\b[^>]*\bref=")[^"]*(")/, `$1${range}$2`)
  if (!isRow) {
    // Keep existing column IDs and metadata while adding fresh IDs for new columns.
    const oldNodes = [
      ...original.matchAll(/<tableColumn\b[^>]*(?:\/>|>[\s\S]*?<\/tableColumn>)/g),
    ].map((m) => m[0])
    let nextId = Math.max(0, ...oldNodes.map((n) => Number(/\bid="(\d+)"/.exec(n)?.[1] ?? 0))) + 1
    const nodes =
      op.op === 'delete_table_column'
        ? oldNodes.filter((_, i) => i < position - 1 || i >= position - 1 + count)
        : [
            ...oldNodes.slice(0, position - 1),
            ...columns
              .slice(position - 1, position - 1 + count)
              .map((name) => `<tableColumn id="${nextId++}" name="${escape(name)}"/>`),
            ...oldNodes.slice(position - 1),
          ]
    patched = patched.replace(
      /<tableColumns\b[^>]*>[\s\S]*?<\/tableColumns>/,
      `<tableColumns count="${columns.length}">${nodes.join('')}</tableColumns>`,
    )
  }
  next.file(table.path, patched)
  let result = new Uint8Array(await next.generateAsync({ type: 'uint8array' })),
    touched = new Set([...mutation.touchedEntries, ...mutation.removedEntries, table.path])
  if (op.op === 'add_table_column') {
    const edits: CellEdit[] = columns.slice(position - 1, position - 1 + count).map((name, i) => ({
      sheetName: sheet.name,
      row: b.startRow,
      column: b.startColumn + position - 1 + i,
      writeValue: true,
      cell: { value: name },
    }))
    const headers = await applyCellEditsToXlsx(Buffer.from(result), edits)
    assertOnlyTouchedEntriesChanged(headers)
    result = new Uint8Array(headers.buffer)
    touched = new Set([...touched, ...headers.touchedEntries, ...headers.removedEntries])
  }
  const actual = (await readXlsx(result)).sheets
    .find((s) => s.id === sheet.id)
    ?.tables?.find((t) => t.name === table.name)
  if (actual?.range !== range || actual.columns.join('\0') !== columns.join('\0'))
    throw new Error('表格结构读回不一致')
  return {
    bytes: result,
    version: expectedVersion + 1,
    changedCells: [],
    touchedEntries: [...touched],
  }
}
