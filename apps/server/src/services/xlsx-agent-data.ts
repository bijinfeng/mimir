import JSZip from 'jszip'
import {
  parseAddress,
  parseRange,
  columnIndex,
  formatAddress,
  rangeCellCount,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { computeSortedRowOrder } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/sort-range.js'
import { translateSharedFormula } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import {
  applyCellEditsToXlsx,
  assertOnlyTouchedEntriesChanged,
  type ImportedXlsx,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import type {
  SheetFilterState,
  FilterColumnState,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-filter.js'
import type { WorkbookOperation } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { decodeXlsxXml } from '../../../../packages/office/src/xlsx-format.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'

const MAX_CELLS = 2_000
function attr(xml: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(xml)?.[1]
}
function xmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
function sameRange(a: ReturnType<typeof parseRange>, b: ReturnType<typeof parseRange>) {
  return (
    a.startRow === b.startRow &&
    a.endRow === b.endRow &&
    a.startColumn === b.startColumn &&
    a.endColumn === b.endColumn
  )
}

/** Keep original cell XML (styles, rich text, errors) while permuting rows in a rectangle. */
export async function applyXlsxDataOperation(
  bytes: Uint8Array,
  before: ImportedXlsx,
  op: WorkbookOperation,
  version: number,
): Promise<XlsxHostResult> {
  if (!('sheetId' in op)) throw new Error('缺少工作表 ID')
  const sheet = before.snapshot.sheets.find((item) => item.id === op.sheetId)
  const view = await readXlsx(bytes)
  const sheetView = view.sheets.find((item) => item.id === op.sheetId)
  if (!sheet || !sheetView) throw new Error('工作表 ID 已失效')
  const zip = await JSZip.loadAsync(bytes)
  const originalXml = await zip.file(sheetView.entry)!.async('string')
  if (/<sheetProtection\b/.test(originalXml)) throw new Error('工作表已保护，请先取消保护')
  if (op.op === 'sort_range') {
    const bounds = parseRange(op.range)
    if (rangeCellCount(bounds) > MAX_CELLS) throw new Error('单次排序最多 2000 个格子')
    const key = columnIndex(op.byColumn)
    if (key < bounds.startColumn || key > bounds.endColumn) throw new Error('排序列必须在范围内')
    const first = bounds.startRow + (op.hasHeader ? 1 : 0)
    if (first >= bounds.endRow) throw new Error('排序范围至少包含两行数据')
    // These features bind extra OOXML parts to addresses; moving only cells would detach them.
    for (const feature of [
      'mergeCells',
      'hyperlinks',
      'legacyDrawing',
      'tableParts',
      'conditionalFormatting',
      'dataValidations',
      'autoFilter',
    ]) {
      if (new RegExp(`<${feature}\\b`).test(originalXml))
        throw new Error(`此工作表含 ${feature}，排序需同时迁移对应结构，当前不支持`)
    }
    const sourceCells = new Map<string, string>()
    for (const [cellXml] of originalXml.matchAll(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const ref = attr(cellXml, 'r')
      if (ref) sourceCells.set(ref, cellXml)
    }
    const rows = Array.from({ length: bounds.endRow - first + 1 }, (_row, i) =>
      Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }, (_column, j) => {
        const address = formatAddress(first + i, bounds.startColumn + j)
        const cell = sheet.cells[address]
        if (
          j === key - bounds.startColumn &&
          cell?.formula &&
          !/<v\b[^>]*>[^<]+<\/v>/.test(sourceCells.get(address) ?? '')
        )
          throw new Error(`${address} 排序键公式无缓存结果；先重新计算`)
        return cell?.rawValue ?? cell?.value ?? null
      }),
    )
    const order = computeSortedRowOrder(rows, key - bounds.startColumn, op.order === 'asc')
    const replacements = new Map<number, string[]>()
    const changedCells: string[] = []
    order.forEach((sourceIndex, offset) => {
      const sourceRow = first + sourceIndex
      const targetRow = first + offset
      const targetCells: string[] = []
      for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
        const sourceAddress = formatAddress(sourceRow, column)
        const targetAddress = formatAddress(targetRow, column)
        let cellXml = sourceCells.get(sourceAddress) ?? ''
        if (/<f\b[^>]*(?:\bt=|\bref=|\bsi=)/.test(cellXml))
          throw new Error(`${sourceAddress} 是共享/数组公式；排序前需展开公式组`)
        if (cellXml) {
          cellXml = cellXml.replace(/\br="[^"]*"/, `r="${targetAddress}"`)
          cellXml = cellXml.replace(
            /(<f\b[^>]*>)([\s\S]*?)(<\/f>)/,
            (_all, open: string, formula: string, close: string) => {
              const translated = translateSharedFormula(
                decodeXlsxXml(formula),
                targetRow - sourceRow,
                0,
              )
              if (translated === null) throw new Error(`${sourceAddress} 公式平移超出边界`)
              return open + xmlText(translated) + close
            },
          )
          targetCells.push(cellXml)
        }
        if (sourceRow !== targetRow) changedCells.push(`${sheet.id}:${targetAddress}`)
      }
      replacements.set(targetRow, targetCells)
    })
    const sheetData = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(originalXml)
    if (!sheetData) throw new Error('工作表缺少 sheetData')
    const seen = new Set<number>()
    let data = sheetData[1]!.replace(
      /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,
      (full, attrs: string, content: string | undefined) => {
        const row = Number(attr(attrs, 'r')) - 1
        const incoming = replacements.get(row)
        if (!incoming) return full
        seen.add(row)
        const existing = [...(content ?? '').matchAll(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)]
          .map(([cellXml]) => cellXml)
          .filter((cellXml) => {
            const ref = attr(cellXml, 'r')
            if (!ref) throw new Error('单元格缺少地址')
            const col = parseAddress(ref).column
            return col < bounds.startColumn || col > bounds.endColumn
          })
        const all = [...existing, ...incoming].toSorted(
          (a, b) => parseAddress(attr(a, 'r')!).column - parseAddress(attr(b, 'r')!).column,
        )
        const extras = (content ?? '').replace(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g, '')
        return `<row${attrs}>${all.join('')}${extras}</row>`
      },
    )
    for (const [row, cells] of replacements) {
      if (seen.has(row) || !cells.length) continue
      const newRow = `<row r="${row + 1}">${cells.join('')}</row>`
      const next = [...data.matchAll(/<row\b[^>]*\br="(\d+)"/g)].find(
        (match) => Number(match[1]) > row + 1,
      )
      data = next ? data.slice(0, next.index) + newRow + data.slice(next.index) : data + newRow
    }
    zip.file(sheetView.entry, originalXml.replace(sheetData[0], `<sheetData>${data}</sheetData>`))
    const touched = [sheetView.entry, 'xl/workbook.xml']
    const workbook = await zip.file('xl/workbook.xml')!.async('string')
    const calcPr = /<calcPr\b[^>]*\/>|<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/
    const flags = '<calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1"/>'
    zip.file(
      'xl/workbook.xml',
      calcPr.test(workbook)
        ? workbook.replace(calcPr, flags)
        : workbook.replace('</workbook>', flags + '</workbook>'),
    )
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml')
      touched.push('xl/calcChain.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml')
      const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
      zip.file(
        'xl/_rels/workbook.xml.rels',
        rels.replace(/<Relationship\b[^>]*\bType="[^"]*\/calcChain"[^>]*\/>/g, ''),
      )
      const types = await zip.file('[Content_Types].xml')!.async('string')
      zip.file(
        '[Content_Types].xml',
        types.replace(/<Override\b[^>]*\bPartName="\/xl\/calcChain.xml"[^>]*\/>/g, ''),
      )
    }
    return {
      bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
      version: version + 1,
      changedCells,
      touchedEntries: touched,
    }
  }
  const oldFilter = /<autoFilter\b[^>]*\/>|<autoFilter\b[^>]*>[\s\S]*?<\/autoFilter>/.exec(
    originalXml,
  )?.[0]
  const oldRange = oldFilter && attr(oldFilter, 'ref')
  const bounds =
    op.op === 'set_filter' ? parseRange(op.range) : oldRange ? parseRange(oldRange) : null
  if (!bounds) throw new Error('工作表没有自动筛选范围')
  if (rangeCellCount(bounds) > MAX_CELLS) throw new Error('单次筛选最多 2000 个格子')
  const columns: FilterColumnState[] = []
  if (op.op === 'set_filter_criteria' && oldFilter) {
    if (/<(?:customFilters|dynamicFilter|top10|colorFilter|iconFilter)\b/.test(oldFilter))
      throw new Error('现有复杂筛选条件需先清除，再设置值筛选')
    for (const [columnXml] of oldFilter.matchAll(
      /<filterColumn\b[^>]*>[\s\S]*?<\/filterColumn>/g,
    )) {
      columns.push({
        colId: Number(attr(columnXml, 'colId')),
        values: [...columnXml.matchAll(/<filter\b[^>]*\bval="([^"]*)"[^>]*\/>/g)].map((match) =>
          decodeXlsxXml(match[1]!),
        ),
        blank: /<filters\b[^>]*\bblank="(?:1|true)"/.test(columnXml),
      })
    }
    const colId = columnIndex(op.column) - bounds.startColumn
    if (colId < 0 || colId > bounds.endColumn - bounds.startColumn)
      throw new Error('筛选列必须在筛选范围内')
    const previous = columns.findIndex((item) => item.colId === colId)
    if (previous >= 0) columns.splice(previous, 1)
    if (op.values !== null)
      columns.push({
        colId,
        values: op.values.filter((value) => value !== ''),
        blank: op.values.includes(''),
      })
  }
  const hiddenRows: number[] = []
  for (let row = bounds.startRow + 1; row <= bounds.endRow; row++) {
    if (
      columns.some((column) => {
        const cell = sheet.cells[formatAddress(row, bounds!.startColumn + column.colId)]
        const raw = cell?.rawValue ?? cell?.value ?? null
        const value =
          raw === null
            ? ''
            : typeof raw === 'boolean'
              ? raw
                ? 'TRUE'
                : 'FALSE'
              : String(cell?.value ?? raw)
        return value === ''
          ? !column.blank
          : !column.values?.some(
              (allowed) => allowed.toLocaleLowerCase() === value.toLocaleLowerCase(),
            )
      })
    )
      hiddenRows.push(row)
  }
  const filters: SheetFilterState[] = []
  if (op.op === 'set_filter' && oldRange && !sameRange(parseRange(oldRange), bounds))
    filters.push({
      sheetName: sheet.name,
      filter: null,
      hiddenRows: [],
      visibilityRange: parseRange(oldRange),
    })
  filters.push({
    sheetName: sheet.name,
    filter: op.op === 'clear_filter' ? null : { range: bounds, columns },
    hiddenRows,
    visibilityRange: bounds,
  })
  const mutation = await applyCellEditsToXlsx(Buffer.from(bytes), [], [], [], undefined, filters)
  assertOnlyTouchedEntriesChanged(mutation)
  return {
    bytes: new Uint8Array(mutation.buffer),
    version: version + 1,
    changedCells: [],
    touchedEntries: [...mutation.touchedEntries],
  }
}
