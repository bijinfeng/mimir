import { xlsxManualSortSchema, type XlsxManualSort } from '@mimir/shared'
import { cellMap, assertOrdinaryFormulas, replaceCells } from './xlsx-agent-range.js'
import { materializeXlsxCellStyle, xlsxRangeStyles } from './xlsx-range-styles.js'
import JSZip from 'jszip'
import {
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

import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { assertXlsxRangeFeatures, assertXlsxSheetWritable } from './xlsx-range-features.js'

const MAX_CELLS = 2_000
function attr(xml: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(xml)?.[1]
}
/** Decode only references present in the original validated sort attribute/cache. */
function decodeSortXml(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g,
    (entity: string, hex: string | undefined, decimal: string | undefined, named: string) => {
      if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16))
      if (decimal !== undefined) return String.fromCodePoint(Number(decimal))
      switch (named) {
        case 'amp':
          return '&'
        case 'lt':
          return '<'
        case 'gt':
          return '>'
        case 'quot':
          return '"'
        case 'apos':
          return "'"
        default:
          return entity
      }
    },
  )
}
/** Read one attribute from the validated native c opening tag, decoding exactly once.
 * Consuming complete quoted values avoids treating decoy t= text as an attribute.
 */
function sortCellType(xml: string): string | undefined {
  const opening = /^<c\b((?:[^"'<>]|"[^"]*"|'[^']*')*)(?:\/>|>)/.exec(xml)?.[1]
  if (opening === undefined) throw new Error('排序单元格原生起始标签无效')
  for (const [, name, double, single] of opening.matchAll(
    /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    if (name === 't') return decodeSortXml(double ?? single ?? '')
  }
  return undefined
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
  op: WorkbookOperation | XlsxManualSort,
  version: number,
): Promise<XlsxHostResult> {
  if (!('sheetId' in op)) throw new Error('缺少工作表 ID')
  const sheet = before.snapshot.sheets.find((item) => item.id === op.sheetId)
  const view = await readXlsx(bytes)
  const sheetView = view.sheets.find((item) => item.id === op.sheetId)
  if (!sheet || !sheetView) throw new Error('工作表 ID 已失效')
  const zip = await JSZip.loadAsync(bytes)
  const originalXml = await zip.file(sheetView.entry)!.async('string')
  assertXlsxSheetWritable(originalXml)
  if (op.op === 'sort_range' || op.op === 'sort_range_multi') {
    const rules =
      op.op === 'sort_range_multi'
        ? xlsxManualSortSchema.parse(op).rules
        : [{ column: op.byColumn, order: op.order }]

    const bounds = parseRange(op.range)
    if (rangeCellCount(bounds) > MAX_CELLS) throw new Error('单次排序最多 2000 个格子')
    if (bounds.endRow >= 1048576 || bounds.endColumn >= 16384)
      throw new Error('排序范围超出工作表边界')
    const keys = rules.map((rule) => ({ key: columnIndex(rule.column), order: rule.order }))
    if (keys.some(({ key }) => key < bounds.startColumn || key > bounds.endColumn))
      throw new Error('排序列必须在范围内')
    const first = bounds.startRow + (op.hasHeader ? 1 : 0)
    if (first >= bounds.endRow) throw new Error('排序范围至少包含两行数据')
    await assertXlsxRangeFeatures(await BoundedZip.open(bytes), sheetView.entry, originalXml, [
      { ...bounds, startRow: first },
    ])
    // The native writer supports ordinary unprefixed sheetData/cells only. Do not silently
    // treat a legal prefixed cell as an empty value. Implicit rows use replaceCells.
    if (/<[\w.-]+:(?:sheetData|row|c|f|v|is|t)\b/.test(originalXml))
      throw new Error('排序暂不支持带命名空间前缀的单元格结构')
    const sourceCells = cellMap(originalXml)
    const styleAt = xlsxRangeStyles(originalXml, sourceCells)
    const inheritedAt = xlsxRangeStyles(originalXml, new Map())
    const rows = Array.from({ length: bounds.endRow - first + 1 }, (_row, i) =>
      Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }, (_column, j) => {
        const address = formatAddress(first + i, bounds.startColumn + j)
        const cell = sheet.cells[address]
        if (
          keys.some(({ key }) => j === key - bounds.startColumn) &&
          cell?.formula &&
          !/<v\b[^>]*(?:\/>|>[\s\S]*?<\/v>)/.test(sourceCells.get(address) ?? '')
        )
          throw new Error(`${address} 排序键公式无缓存结果；先重新计算`)
        if (cell?.formula && keys.some(({ key }) => j === key - bounds.startColumn)) {
          const raw = sourceCells.get(address) ?? ''
          const match = /<v\b[^>]*(?:\/>|>([\s\S]*?)<\/v>)/.exec(raw)
          if (!match) throw new Error(`${address} 排序键公式无缓存结果；先重新计算`)
          const cache = decodeSortXml(match[1] ?? '')
          // Read the actual c root attributes, not text resembling attributes inside a
          // different quoted attribute, formula or cache. This accepts legal XML quote
          // styles, character references and whitespace around equals consistently.
          const type = sortCellType(raw)
          if (type === 'str' || type === 'e') return cache
          if (type === 'b') {
            if (!['0', '1'].includes(cache))
              throw new Error(`${address} 排序键布尔缓存无效；先重新计算`)
            return cache === '1'
          }
          if (type !== undefined && type !== 'n')
            throw new Error(`${address} 排序键缓存类型暂不支持`)
          const number = Number(cache)
          if (!cache.trim() || !Number.isFinite(number))
            throw new Error(`${address} 排序键缓存无效；先重新计算`)
          return number
        }
        return cell?.rawValue ?? cell?.value ?? null
      }),
    )
    let order = rows.map((_row, index) => index)
    // Stable sorting from the last level preserves each lower-priority order on ties.
    // Reuse the pinned typed comparator, including blanks-last in either direction.
    for (const { key, order: direction } of keys.toReversed()) {
      const previous = order
      order = computeSortedRowOrder(
        previous.map((index) => rows[index]!),
        key - bounds.startColumn,
        direction === 'asc',
      ).map((index) => previous[index]!)
    }
    const replacements = new Map<number, string[]>()
    const changedCells: string[] = []
    order.forEach((sourceIndex, offset) => {
      const sourceRow = first + sourceIndex
      const targetRow = first + offset
      const targetCells: string[] = []
      for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
        const sourceAddress = formatAddress(sourceRow, column)
        const targetAddress = formatAddress(targetRow, column)
        let cellXml = sourceCells.get(sourceAddress) ?? `<c r="${sourceAddress}"/>`
        if (/<f\b[^>]*(?:\bt=|\bref=|\bsi=)/.test(cellXml))
          throw new Error(`${sourceAddress} 是共享/数组公式；排序前需展开公式组`)
        assertOrdinaryFormulas(cellXml)
        // A stationary row must retain its complete original lexical XML, including
        // entities, attribute spelling and absent cells, even when other rows move.
        if (sourceRow === targetRow) continue
        if (
          sourceRow !== targetRow &&
          styleAt(sourceRow, column) !== inheritedAt(targetRow, column)
        ) {
          cellXml = materializeXlsxCellStyle(cellXml, styleAt(sourceRow, column))
        }
        if (cellXml) {
          cellXml = cellXml.replace(/\br="[^"]*"/, `r="${targetAddress}"`)
          cellXml = cellXml.replace(
            /(<f\b[^>]*>)([\s\S]*?)(<\/f>)/,
            (_all, open: string, formula: string, close: string) => {
              const translated = translateSharedFormula(
                decodeSortXml(formula),
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
      if (sourceRow !== targetRow) replacements.set(targetRow, targetCells)
    })
    const sheetData = /<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/.exec(originalXml)
    if (!sheetData) throw new Error('工作表缺少 sheetData')
    // Stable identity order changes neither cells nor recalculation state.
    if (!changedCells.length)
      return { bytes: bytes.slice(), version, changedCells: [], touchedEntries: [] }
    const incoming = new Map<string, string>()
    for (const cells of replacements.values())
      for (const cell of cells) incoming.set(attr(cell, 'r')!, cell)
    let sortedXml = replaceCells(originalXml, incoming)
    const dimension = /<dimension\b[^>]*?(?:\/>|>[\s\S]*?<\/dimension>)/
    sortedXml = sortedXml.replace(dimension, originalXml.match(dimension)?.[0] ?? '')
    zip.file(sheetView.entry, sortedXml)
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
