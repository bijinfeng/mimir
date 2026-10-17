import {
  assembleWithJsZip,
  assertOnlyTouchedEntriesChanged,
  createBufferEntrySource,
  planCellEditsToXlsx,
  type ImportedXlsx,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  copyTargetBounds,
  expandToPrimitiveOps,
  filteredCopySourceRows,
  matchableCellText,
  type WorkbookOperation,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import {
  formatAddress,
  parseAddress,
  parseRange,
  rangeCellCount,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { translateSharedFormula } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { decodeXlsxXml } from '../../../../packages/office/src/xlsx-format.js'
import { xlsxAttribute } from '../../../../packages/office/src/xlsx-sheet-features.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { assertXlsxRangeFeatures, assertXlsxSheetWritable } from './xlsx-range-features.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'
import { materializeXlsxCellStyle, xlsxRangeStyles } from './xlsx-range-styles.js'
import { planXlsxRangeStructures, rewriteXlsxRangeFormulas } from './xlsx-range-structures.js'
import {
  bindXlsxRangeValidation,
  planXlsxRangeRules,
  xlsxNativeRuleReaders,
  type XlsxRangeRulePlan,
} from './xlsx-range-rules.js'

const CELL = /<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g
const ROW = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
const MAX_CELLS = 2_000
function attribute(xml: string, key: string): string | undefined {
  return new RegExp(`(?:^|\\s)${key}="([^"]*)"`).exec(xml)?.[1]
}
export function cellMap(xml: string): Map<string, string> {
  return new Map(
    [...xml.matchAll(CELL)].map(([cell]) => {
      const address = attribute(cell, 'r')
      if (!address) throw new Error('单元格缺少地址')
      return [address, cell]
    }),
  )
}
function freezeFormula(xml: string, address: string): string {
  if (!/<f\b/.test(xml)) return xml
  if (!/<v\b[^>]*(?:\/>|>[\s\S]*?<\/v>)/.test(xml))
    throw new Error(`${address} 公式没有缓存结果，请先重新计算`)
  return xml.replace(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/g, '')
}
export function assertOrdinaryFormulas(xml: string): void {
  if (/<f\b[^>]*(?:\bt=|\bref=|\bsi=)/.test(xml) || /<c\b[^>]*\bcm=/.test(xml))
    throw new Error('共享、数组或溢出公式尚不支持此范围操作')
}
export function replaceCells(xml: string, incoming: Map<string, string>): string {
  const data = /<sheetData\b[^>]*\/>|<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)
  if (!data) throw new Error('工作表缺少 sheetData')
  const byRow = new Map<number, Map<string, string>>()
  for (const [address, cell] of incoming) {
    const row = parseAddress(address).row + 1
    const cells = byRow.get(row) ?? new Map<string, string>()
    cells.set(address, cell)
    byRow.set(row, cells)
  }
  const write = (attrs: string, body: string, edits: Map<string, string>) => {
    const cells = cellMap(body)
    for (const [address, cell] of edits) {
      if (cell) cells.set(address, cell)
      else cells.delete(address)
    }
    const sorted = [...cells].toSorted(
      ([left], [right]) => parseAddress(left).column - parseAddress(right).column,
    )
    return `<row${attrs}>${sorted.map(([, cell]) => cell).join('')}${body.replace(CELL, '')}</row>`
  }
  let previousRow = 0
  let body = (data[1] ?? '').replace(ROW, (full, attrs: string, content: string | undefined) => {
    const declared = Number(xlsxAttribute(attrs, 'r') ?? NaN)
    const explicit = Number.isInteger(declared) && declared > 0
    const row = explicit ? declared : previousRow + 1
    previousRow = row
    const edits = byRow.get(row)
    if (!edits) return full
    byRow.delete(row)
    // Stabilize the touched implicit row, keeping all its other attributes and
    // every untouched row's original XML intact.
    const targetAttrs = explicit
      ? attrs
      : attrs.replace(/\sr=(?:"[^"]*"|'[^']*')/, '') + ` r="${row}"`
    return write(targetAttrs, content ?? '', edits)
  })
  for (const [row, edits] of [...byRow].toSorted(([a], [b]) => a - b)) {
    let previous = 0
    const next = [...body.matchAll(ROW)].find((match) => {
      const declared = Number(xlsxAttribute(match[1] ?? '', 'r') ?? NaN)
      const number = Number.isInteger(declared) && declared > 0 ? declared : previous + 1
      previous = number
      return number > row
    })
    const added = write(` r="${row}"`, '', edits)
    body = next ? body.slice(0, next.index) + added + body.slice(next.index) : body + added
  }
  let result = xml.replace(data[0], `<sheetData>${body}</sheetData>`)
  const oldDimension = /<dimension\b[^>]*?(?:\/>|>[\s\S]*?<\/dimension>)/.exec(result)?.[0]
  const oldRange = oldDimension ? xlsxAttribute(oldDimension, 'ref') : undefined
  const points = [...cellMap(result).keys(), ...(oldRange?.split(':') ?? [])].map(parseAddress)
  const lastRow = Math.max(0, ...points.map((point) => point.row))
  const lastColumn = Math.max(0, ...points.map((point) => point.column))
  const dimension = `<dimension ref="A1:${formatAddress(lastRow, lastColumn)}"/>`
  if (oldDimension) result = result.replace(oldDimension, dimension)
  else result = result.replace(/<worksheet\b[^>]*>/, (open) => open + dimension)
  return result
}

/** Raw-cell copying preserves the original workbook's style indices and typed values. */
export async function applyXlsxRangeOperation(
  bytes: Uint8Array,
  before: ImportedXlsx,
  op: WorkbookOperation,
  version: number,
): Promise<XlsxHostResult> {
  if (op.op !== 'copy_range' && op.op !== 'fill_range' && op.op !== 'convert_to_values')
    throw new Error('不支持的范围操作')
  // Retain fixed upstream geometry/overlap/filter validation.
  expandToPrimitiveOps(
    [op],
    (address, id) =>
      before.snapshot.sheets.find((sheet) => sheet.id === id)?.cells[address] ?? { value: null },
  )
  const view = await readXlsx(bytes)
  const target = view.sheets.find((sheet) => sheet.id === op.sheetId)
  const sourceId = op.op === 'convert_to_values' ? op.sheetId : (op.sourceSheetId ?? op.sheetId)
  const source = view.sheets.find((sheet) => sheet.id === sourceId)
  if (!target || !source) throw new Error('工作表 ID 已失效，请重新读取')
  const archive = await createBufferEntrySource(Buffer.from(bytes))
  const targetXml = await archive.readText(target.entry)
  const sourceXml = source.id === target.id ? targetXml : await archive.readText(source.entry)
  assertXlsxSheetWritable(targetXml)
  assertOrdinaryFormulas(targetXml)
  assertOrdinaryFormulas(sourceXml)
  const originalCells = cellMap(sourceXml)
  const writes = new Map<string, string>()
  const structureReplacements = new Map<string, string>()
  let rulePlan: XlsxRangeRulePlan | undefined
  let ruleTarget: { entry: string; bounds: ReturnType<typeof parseRange> } | undefined
  if (op.op === 'convert_to_values') {
    const bounds = parseRange(op.range)
    if (rangeCellCount(bounds) > MAX_CELLS) throw new Error('范围操作最多2000格')
    for (const [address, cell] of originalCells) {
      const { row, column } = parseAddress(address)
      if (
        row < bounds.startRow ||
        row > bounds.endRow ||
        column < bounds.startColumn ||
        column > bounds.endColumn ||
        !/<f\b/.test(cell)
      )
        continue
      writes.set(address, freezeFormula(cell, address))
    }
    if (!writes.size) throw new Error('范围内没有可转换的公式')
  } else {
    const styleAt = xlsxRangeStyles(sourceXml, originalCells)
    // These structures have separate anchors/parts. Do not copy values while
    // silently omitting or overwriting their associated semantics.
    const sourceBounds = parseRange(op.source)
    if (
      rangeCellCount(sourceBounds) > MAX_CELLS ||
      sourceBounds.endRow >= 1_048_576 ||
      sourceBounds.endColumn >= 16_384
    )
      throw new Error('源范围超出2000格或工作表边界')
    const sourceState = before.snapshot.sheets.find((sheet) => sheet.id === source.id)!
    const rows =
      op.op === 'copy_range'
        ? filteredCopySourceRows(op, (row, column) => {
            const address = formatAddress(row, column)
            const rawCell = originalCells.get(address) ?? ''
            if (/<f\b/.test(rawCell)) {
              const cache = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(rawCell)?.[1]
              if (cache === undefined)
                throw new Error(`${address} 筛选键公式没有缓存，请先重新计算`)
              const type = attribute(rawCell, 't')
              return matchableCellText(
                type === 'b'
                  ? cache === '1'
                  : type === 'str' || type === 'e'
                    ? decodeXlsxXml(cache)
                    : Number(cache),
              )
            }
            const cell = sourceState.cells[address]
            return matchableCellText(cell?.rawValue ?? cell?.value ?? null)
          })
        : Array.from(
            { length: sourceBounds.endRow - sourceBounds.startRow + 1 },
            (_v, i) => sourceBounds.startRow + i,
          )
    if (!rows) throw new Error('筛选复制没有匹配行')
    const bounds = { ...(op.op === 'copy_range' ? copyTargetBounds(op) : parseRange(op.target)) }
    if (op.op === 'copy_range' && op.filterColumn) bounds.endRow = bounds.startRow + rows.length - 1
    if (
      rangeCellCount(bounds) > MAX_CELLS ||
      bounds.endRow >= 1_048_576 ||
      bounds.endColumn >= 16_384
    )
      throw new Error('目标超出2000格或工作表边界')
    const featureZip = await BoundedZip.open(bytes)
    const structurePlan =
      op.op === 'copy_range' && !op.filterColumn
        ? await planXlsxRangeStructures(
            featureZip,
            { entry: source.entry, xml: sourceXml, bounds: sourceBounds },
            { entry: target.entry, xml: targetXml, bounds },
            false,
          )
        : undefined
    for (const [path, text] of structurePlan?.replacements ?? [])
      structureReplacements.set(path, text)
    if (structurePlan) {
      ruleTarget = { entry: target.entry, bounds }
      rulePlan = planXlsxRangeRules(
        {
          sheets: [
            { entry: source.entry, name: source.name, xml: sourceXml },
            ...(source.entry === target.entry
              ? []
              : [{ entry: target.entry, name: target.name, xml: targetXml }]),
          ],
          source: { entry: source.entry, bounds: sourceBounds },
          target: ruleTarget,
          move: false,
          stylesXml: (await featureZip.readText('xl/styles.xml')) ?? undefined,
          candidateBases: structureReplacements,
        },
        xlsxNativeRuleReaders(),
      )
      for (const [path, text] of rulePlan.replacements) structureReplacements.set(path, text)
    }
    if (source.entry === target.entry)
      await assertXlsxRangeFeatures(
        featureZip,
        source.entry,
        sourceXml,
        [sourceBounds, bounds],
        structurePlan?.permit,
        rulePlan?.permit,
      )
    else {
      await assertXlsxRangeFeatures(
        featureZip,
        source.entry,
        sourceXml,
        [sourceBounds],
        structurePlan?.permit,
        rulePlan?.permit,
      )
      await assertXlsxRangeFeatures(
        featureZip,
        target.entry,
        targetXml,
        [bounds],
        structurePlan?.permit,
        rulePlan?.permit,
      )
    }
    const width = sourceBounds.endColumn - sourceBounds.startColumn + 1
    for (let row = bounds.startRow; row <= bounds.endRow; row++)
      for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
        const sourceRow = rows[(row - bounds.startRow) % rows.length]!
        const sourceColumn = sourceBounds.startColumn + ((column - bounds.startColumn) % width)
        const from = formatAddress(sourceRow, sourceColumn),
          to = formatAddress(row, column)
        let cell = originalCells.get(from) ?? `<c r="${from}"/>`
        if (op.op === 'copy_range' && op.filterColumn) cell = freezeFormula(cell, from)
        else
          cell = rewriteXlsxRangeFormulas(cell, ['f'], (formula) => {
            const translated = translateSharedFormula(
              formula,
              row - sourceRow,
              column - sourceColumn,
            )
            if (translated === null) throw new Error(`${from} 公式平移超出边界`)
            return translated
          })
        cell = cell.replace(/\br="[^"]*"/, `r="${to}"`)
        cell = materializeXlsxCellStyle(cell, styleAt(sourceRow, sourceColumn))
        writes.set(to, cell)
      }
  }
  const updated = replaceCells(structureReplacements.get(target.entry) ?? targetXml, writes)
  if (updated === targetXml && !structureReplacements.size)
    return { bytes, version, changedCells: [], touchedEntries: [] }
  const overlay = {
    ...archive,
    readText: async (path: string) => (path === target.entry ? updated : archive.readText(path)),
  }
  const plan = await planCellEditsToXlsx(overlay, [], [{ sheetName: target.name, ops: [] }])
  const replaced = new Map(plan.replaced),
    added = new Map(plan.added)
  for (const [path, text] of structureReplacements) {
    if (path === target.entry) continue
    if (await archive.has(path)) replaced.set(path, text)
    else added.set(path, text)
  }
  const mutationPlan = {
    ...plan,
    replaced,
    added,
    touchedEntries: [...new Set([...plan.touchedEntries, ...structureReplacements.keys()])],
    addedEntries: [...new Set([...plan.addedEntries, ...added.keys()])],
  }
  const result = await assembleWithJsZip(Buffer.from(bytes), mutationPlan)
  assertOnlyTouchedEntriesChanged(result)
  const resultBytes = new Uint8Array(result.buffer)
  if (rulePlan && ruleTarget) bindXlsxRangeValidation(resultBytes, rulePlan, ruleTarget)
  return {
    bytes: resultBytes,
    version: version + 1,
    changedCells: [...writes.keys()].map((address) => `${target.id}:${address}`),
    touchedEntries: [...result.touchedEntries],
  }
}
