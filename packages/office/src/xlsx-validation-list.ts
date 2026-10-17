import type { XlsxSheet, XlsxWorkbook } from './xlsx.js'
import type { PredicateScalar } from './xlsx-formula-predicate.js'
import { translateSharedFormula } from '../vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import {
  parseAddress,
  parseRange,
  rangeCellCount,
} from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'

/** One bounded resolver for dropdown display and both host/browser validation. */
export function resolveXlsxValidationList(
  formula: string,
  sheet: XlsxSheet,
  workbook: XlsxWorkbook,
  context?: { address: string; range: string },
): PredicateScalar[] {
  let expression = formula.trim().replace(/^=/, '')
  if (expression.length > 8192) throw new Error('数据验证列表公式超过8192字符')
  const inline = /^"((?:[^"]|"")*)"$/.exec(expression)
  if (inline) {
    const values = inline[1]!.replaceAll('""', '"').split(',')
    if (values.length > 2000) throw new Error('数据验证列表最多2000项')
    return values
  }
  const seen = new Set<string>()
  const sheetIndex = workbook.sheets.indexOf(sheet)
  for (let depth = 0; ; depth++) {
    if (/^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/i.test(expression)) break
    if (!/^[\p{L}_\\][\p{L}\p{N}_.\\]*$/u.test(expression)) break
    if (depth === 8) throw new Error('数据验证列表名称引用过深')
    const candidates = (workbook.definedNames ?? []).filter(
      (name) => name.name.toLowerCase() === expression.toLowerCase(),
    )
    const scoped = candidates.filter((name) => name.sheetIndex === sheetIndex)
    const matches = scoped.length
      ? scoped
      : candidates.filter((name) => name.sheetIndex === undefined)
    if (matches.length !== 1 || matches[0]!.hidden)
      throw new Error('列表名称不存在、不可见或作用域不明确')
    const key = `${matches[0]!.sheetIndex ?? '*'}:${matches[0]!.name.toLowerCase()}`
    if (seen.has(key)) throw new Error('数据验证列表名称循环引用')
    seen.add(key)
    expression = matches[0]!.ref.trim().replace(/^=/, '')
  }
  const reference = /^(?:'((?:[^']|'')+)'|([^'![\]]+))!(.+)$/.exec(expression)
  const source = reference
    ? workbook.sheets.find(
        (item) =>
          item.name.toLowerCase() ===
          (reference[1]?.replaceAll("''", "'") ?? reference[2]!).toLowerCase(),
      )
    : sheet
  if (!source) throw new Error('数据验证引用的工作表不存在')
  let address = reference?.[3] ?? expression
  if (!/^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Z]{1,3}\$?[1-9]\d{0,6})?$/i.test(address))
    throw new Error('列表暂仅支持普通单列或单行范围及名称')
  if (context) {
    const anchor = parseRange(
        context.range.trim().split(/\s+/)[0]!.replaceAll('$', '').toUpperCase(),
      ),
      current = parseAddress(context.address.toUpperCase())
    const shifted = translateSharedFormula(
      address.toUpperCase(),
      current.row - anchor.startRow,
      current.column - anchor.startColumn,
    )
    if (shifted === null) throw new Error('数据验证列表相对引用超出工作表边界')
    address = shifted
  }
  const bounds = parseRange(address.replaceAll('$', '').toUpperCase())
  if (bounds.endRow >= 1048576 || bounds.endColumn >= 16384 || rangeCellCount(bounds) > 2000)
    throw new Error('数据验证引用超过2000格或工作表边界')
  if (bounds.startRow !== bounds.endRow && bounds.startColumn !== bounds.endColumn)
    throw new Error('数据验证列表须为单行或单列')
  const values: PredicateScalar[] = []
  for (let row = bounds.startRow; row <= bounds.endRow; row++)
    for (let col = bounds.startColumn; col <= bounds.endColumn; col++) {
      const cell = source.rows.find((item) => item.number === row + 1)?.cells[col]
      if (
        cell?.covered ||
        cell?.mergeRef ||
        (cell?.colSpan ?? 1) > 1 ||
        (cell?.rowSpan ?? 1) > 1 ||
        (cell?.formula && cell.formulaCache !== 'cached')
      )
        throw new Error('列表来源含合并格或未缓存公式，暂不能可靠读取')
      if (cell?.numeric && !Number.isFinite(Number(cell.rawText ?? cell.text)))
        throw new Error('列表来源含无效数值')
      values.push(
        cell?.numeric
          ? Number(cell.rawText ?? cell.text)
          : cell?.boolean !== undefined
            ? cell.boolean
            : cell?.text || null,
      )
    }
  if (values.reduce<number>((size, value) => size + String(value ?? '').length, 0) > 32768)
    throw new Error('数据验证列表文字超过32K预算')
  return values
}
