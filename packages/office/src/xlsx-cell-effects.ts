import {
  readXlsxRangeXmlTree,
  readXlsxFormulaCharacterData,
  type XlsxRangeXmlNode,
} from './xlsx-native-xml.js'
import { resolveXlsxValidationList } from './xlsx-validation-list.js'
import type { XlsxValidationRule } from './xlsx-sheet-features.js'
import type { XlsxCellFormat } from './xlsx-format.js'
import type { XlsxCell, XlsxSheet, XlsxWorkbook } from './xlsx.js'
import { xlsxAttribute as attr } from './xlsx-sheet-features.js'
import { xlsxTableCellFormat } from './xlsx-table-styles.js'
import {
  parseRange,
  parseAddress,
} from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  evaluateXlsxPredicate,
  xlsxRangeContains,
  type PredicateScalar,
} from './xlsx-formula-predicate.js'
export interface XlsxCellEffect {
  format?: XlsxCellFormat
  bar?: { start: number; end: number; color: string }
  sparkline?: { values: (number | null)[]; type: string; color: string }
  warnings?: string[]
}
export interface XlsxCfRule {
  range: string
  type: string
  operator?: string
  priority: number
  stop: boolean
  formula: string[]
  style?: XlsxCellFormat
  xml: string
}
const color = (xml: string) => {
  const rgb = attr(xml, 'rgb')?.slice(-6)
  return rgb && /^[0-9a-f]{6}$/i.test(rgb) ? '#' + rgb : undefined
}
function cfDisplayXml(xml: string, root: XlsxRangeXmlNode): string {
  const patches: { start: number; end: number; value: string }[] = []
  const visit = (node: XlsxRangeXmlNode) => {
    if (
      node.ns === 'http://schemas.openxmlformats.org/spreadsheetml/2006/main' &&
      node.tag !== node.local
    ) {
      patches.push({
        start: node.start + 1,
        end: node.start + 1 + node.tag.length,
        value: node.local,
      })
      if (node.closeStart < node.end && xml.startsWith('</', node.closeStart))
        patches.push({
          start: node.closeStart + 2,
          end: node.closeStart + 2 + node.tag.length,
          value: node.local,
        })
    }
    node.children.forEach(visit)
  }
  visit(root)
  return patches
    .toSorted((a, b) => b.start - a.start)
    .reduce(
      (text, item) =>
        text.slice(0, item.start - root.start) + item.value + text.slice(item.end - root.start),
      xml.slice(root.start, root.end),
    )
}
export function readXlsxCfRules(xml: string, styles: string): XlsxCfRule[] {
  if (!xml.includes('conditionalFormatting')) return []
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const styleRoot = styles ? readXlsxRangeXmlTree(styles) : undefined
  const dxfs = (
    styleRoot?.children
      .filter((node) => node.ns === main && node.local === 'dxfs')
      .flatMap((node) =>
        node.children.filter((child) => child.ns === main && child.local === 'dxf'),
      ) ?? []
  ).map((node) => {
    const body = cfDisplayXml(styles, node),
      font = /<font\b[^>]*>([\s\S]*?)<\/font>/.exec(body)?.[1] ?? '',
      fill = /<fill\b[^>]*>([\s\S]*?)<\/fill>/.exec(body)?.[1] ?? ''
    return {
      bold: /<b\b/.test(font) ? !/<b\b[^>]*val="0"/.test(font) : undefined,
      italic: /<i\b/.test(font) ? !/<i\b[^>]*val="0"/.test(font) : undefined,
      fontColor: color(/<color\b[^>]*>/.exec(font)?.[0] ?? ''),
      fillColor: color(/<fgColor\b[^>]*>/.exec(fill)?.[0] ?? ''),
      numberFormat: attr(/<numFmt\b[^>]*>/.exec(body)?.[0] ?? '', 'formatCode'),
    } satisfies XlsxCellFormat
  })
  const root = readXlsxRangeXmlTree(xml)
  return root.children
    .filter((node) => node.ns === main && node.local === 'conditionalFormatting')
    .flatMap((group) =>
      group.children
        .filter((node) => node.ns === main && node.local === 'cfRule')
        .map((node) => ({
          range: group.attrs.get('sqref') ?? '',
          type: node.attrs.get('type') ?? '',
          operator: node.attrs.get('operator'),
          priority: Number(node.attrs.get('priority') ?? 999),
          stop: /^(?:1|true)$/.test(node.attrs.get('stopIfTrue') ?? ''),
          formula: node.children
            .filter((child) => child.ns === main && child.local === 'formula')
            .map((child) =>
              readXlsxFormulaCharacterData(xml.slice(child.openEnd, child.closeStart)),
            ),
          style: dxfs[Number(node.attrs.get('dxfId') ?? -1)],
          // A display-only view lets existing scalar threshold rendering consume qualified native tags.
          // This text never participates in native serialization.
          xml: cfDisplayXml(xml, node),
        })),
    )
    .toSorted((a, b) => a.priority - b.priority)
}
export function xlsxScalar(cell?: XlsxCell): PredicateScalar {
  return cell?.numeric
    ? Number(cell.rawText ?? cell.text)
    : cell?.boolean !== undefined
      ? cell.boolean
      : cell?.text || null
}
export function xlsxCellEffects(
  sheet: XlsxSheet,
  workbook: XlsxWorkbook,
): Map<string, XlsxCellEffect> {
  const effects = new Map<string, XlsxCellEffect>(),
    scalarAt = (r: number, c: number) =>
      xlsxScalar(sheet.rows.find((row) => row.number === r + 1)?.cells[c])
  const qualifiedAt = (name: string, row: number, column: number) => {
    const source = workbook.sheets.find((item) => item.name.toLowerCase() === name.toLowerCase())
    if (!source) throw new Error('条件格式引用的工作表不存在')
    const cell = source.rows.find((item) => item.number === row + 1)?.cells[column]
    if (cell?.formula && cell.formulaCache !== 'cached') throw new Error('条件格式引用了未缓存公式')
    return xlsxScalar(cell)
  }
  const cells = sheet.rows.flatMap((row) =>
    row.cells.map((cell) => ({ row: row.number - 1, cell, key: `${row.number}:${cell.col}` })),
  )
  for (const rule of sheet.extras?.cfRules ?? []) {
    const targets = cells.filter(({ row, cell }) => xlsxRangeContains(rule.range, row, cell.col)),
      values = targets.map(({ cell }) => xlsxScalar(cell)),
      nums = values.filter((n): n is number => typeof n === 'number').toSorted((a, b) => a - b)
    const min = nums[0] ?? 0,
      max = nums.at(-1) ?? 0
    const threshold = (tag: string) => {
      const type = attr(tag, 'type'),
        val = Number(attr(tag, 'val') ?? 0)
      if (type === 'formula') {
        const result = Number(
          evaluateXlsxPredicate(attr(tag, 'val') ?? '', scalarAt, 0, 0, qualifiedAt),
        )
        if (!Number.isFinite(result)) throw new Error('条件格式阈值公式无法可靠计算')
        return result
      }
      return type === 'min'
        ? min
        : type === 'max'
          ? max
          : type === 'percent'
            ? min + ((max - min) * val) / 100
            : type === 'percentile'
              ? (nums[Math.min(nums.length - 1, Math.floor(((nums.length - 1) * val) / 100))] ?? 0)
              : val
    }
    const anchor = parseRange(rule.range.split(/\s+/)[0]!.replaceAll('$', ''))
    for (const { row, cell, key } of targets) {
      const current = effects.get(key) ?? {},
        value = xlsxScalar(cell),
        n = typeof value === 'number' ? value : null
      if (current.warnings?.includes('stop')) continue
      let matches = false
      try {
        if (rule.type === 'colorScale' && n !== null) {
          const tags = [...rule.xml.matchAll(/<cfvo\b[^>]*>/g)].map(([t]) => t),
            colors = [...rule.xml.matchAll(/<color\b[^>]*>/g)].map(([t]) => color(t) ?? '#FFFFFF'),
            thresholds = tags.map(threshold)
          let i = 0
          while (i < thresholds.length - 2 && n > thresholds[i + 1]!) i++
          const low = thresholds[i] ?? min,
            high = thresholds[i + 1] ?? max,
            ratio = high === low ? 0 : Math.min(1, Math.max(0, (n - low) / (high - low)))
          const a = colors[i] ?? '#FFFFFF',
            b = colors[i + 1] ?? '#4472C4',
            rgb = [1, 3, 5]
              .map((at) =>
                Math.round(
                  parseInt(a.slice(at, at + 2), 16) * (1 - ratio) +
                    parseInt(b.slice(at, at + 2), 16) * ratio,
                )
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join('')
          current.format = { fillColor: '#' + rgb, ...current.format }
          matches = true
        } else if (rule.type === 'dataBar' && n !== null) {
          const tags = [...rule.xml.matchAll(/<cfvo\b[^>]*>/g)].map(([t]) => t),
            low = Math.min(0, threshold(tags[0] ?? '')),
            high = Math.max(0, threshold(tags[1] ?? '')),
            total = high - low || 1,
            zero = (-low / total) * 100,
            end = ((n - low) / total) * 100
          current.bar ??= {
            start: Math.max(0, Math.min(zero, end)),
            end: Math.min(100, Math.max(zero, end)),
            color: color(/<color\b[^>]*>/.exec(rule.xml)?.[0] ?? '') ?? '#638EC6',
          }
          matches = true
        } else if (rule.type === 'cellIs') {
          const a = evaluateXlsxPredicate(
              rule.formula[0] ?? '',
              scalarAt,
              row - anchor.startRow,
              cell.col - anchor.startColumn,
              qualifiedAt,
            ),
            b = rule.formula[1]
              ? evaluateXlsxPredicate(
                  rule.formula[1],
                  scalarAt,
                  row - anchor.startRow,
                  cell.col - anchor.startColumn,
                  qualifiedAt,
                )
              : null
          const compare =
            typeof value === 'number' && typeof a === 'number'
              ? value - a
              : String(value ?? '').localeCompare(String(a ?? ''), undefined, {
                  sensitivity: 'base',
                })
          matches =
            rule.operator === 'equal'
              ? compare === 0
              : rule.operator === 'notEqual'
                ? compare !== 0
                : rule.operator === 'greaterThan'
                  ? compare > 0
                  : rule.operator === 'lessThan'
                    ? compare < 0
                    : rule.operator === 'greaterThanOrEqual'
                      ? compare >= 0
                      : rule.operator === 'lessThanOrEqual'
                        ? compare <= 0
                        : rule.operator === 'between'
                          ? Number(value) >= Number(a) && Number(value) <= Number(b)
                          : rule.operator === 'notBetween'
                            ? Number(value) < Number(a) || Number(value) > Number(b)
                            : false
        } else if (rule.type === 'duplicateValues' || rule.type === 'uniqueValues') {
          const count = values.filter(
            (v) => String(v ?? '').toLowerCase() === String(value ?? '').toLowerCase(),
          ).length
          matches = rule.type === 'uniqueValues' ? count === 1 : count > 1
        } else if (rule.type === 'containsBlanks' || rule.type === 'notContainsBlanks')
          matches = rule.type === 'containsBlanks' ? value === null : value !== null
        else if (
          ['containsText', 'notContainsText', 'beginsWith', 'endsWith'].includes(rule.type)
        ) {
          const needle = (attr(rule.xml, 'text') ?? '').toLowerCase(),
            hay = String(value ?? '').toLowerCase()
          matches =
            rule.type === 'containsText'
              ? hay.includes(needle)
              : rule.type === 'notContainsText'
                ? !hay.includes(needle)
                : rule.type === 'beginsWith'
                  ? hay.startsWith(needle)
                  : hay.endsWith(needle)
        } else if (rule.type === 'top10' && n !== null) {
          const rank = Number(attr(rule.xml, 'rank') ?? 10),
            count = attr(rule.xml, 'percent') === '1' ? Math.ceil((nums.length * rank) / 100) : rank
          matches =
            attr(rule.xml, 'bottom') === '1'
              ? n <= (nums[Math.min(count, nums.length) - 1] ?? -Infinity)
              : n >= (nums[Math.max(0, nums.length - count)] ?? Infinity)
        } else if (rule.type === 'expression')
          matches = Boolean(
            evaluateXlsxPredicate(
              rule.formula[0] ?? '',
              scalarAt,
              row - anchor.startRow,
              cell.col - anchor.startColumn,
              qualifiedAt,
            ),
          )
        else current.warnings = [...(current.warnings ?? []), `暂不支持规则 ${rule.type}`]
        if (matches && rule.style)
          current.format = {
            ...Object.fromEntries(Object.entries(rule.style).filter(([, v]) => v !== undefined)),
            ...current.format,
          }
        if (matches && rule.stop) current.warnings = [...(current.warnings ?? []), 'stop']
      } catch {
        current.warnings = [...(current.warnings ?? []), '条件公式超出当前网格计算能力']
      }
      effects.set(key, current)
    }
  }
  for (const table of sheet.tables ?? [])
    for (const { row, cell, key } of cells) {
      const format = xlsxTableCellFormat(table, sheet, row + 1, cell)
      if (!format || !Object.keys(format).length) continue
      const current = effects.get(key) ?? {}
      current.format = { ...format, ...current.format }
      effects.set(key, current)
    }
  for (const spark of sheet.extras?.sparklines ?? []) {
    const source = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(spark.source),
      sourceSheet = source
        ? workbook.sheets.find((s) => s.name === (source[1]?.replaceAll("''", "'") ?? source[2]))
        : sheet
    if (!sourceSheet) continue
    try {
      const b = parseRange((source?.[3] ?? spark.source).replaceAll('$', '')),
        p = parseAddress(spark.cell),
        key = `${p.row + 1}:${p.column}`,
        values: (number | null)[] = []
      if ((b.endRow - b.startRow + 1) * (b.endColumn - b.startColumn + 1) > 2000) continue
      for (let r = b.startRow; r <= b.endRow; r++)
        for (let c = b.startColumn; c <= b.endColumn; c++) {
          const v = xlsxScalar(sourceSheet.rows.find((row) => row.number === r + 1)?.cells[c])
          values.push(typeof v === 'number' ? v : null)
        }
      effects.set(key, {
        ...effects.get(key),
        sparkline: {
          values,
          type: spark.type,
          color: spark.color ? '#' + spark.color.slice(-6) : '#4472C4',
        },
      })
    } catch {
      /* An unsupported imported reference remains in metadata. */
    }
  }
  return effects
}
export function evaluateXlsxCellInput(
  sheet: XlsxSheet,
  workbook: XlsxWorkbook,
  address: string,
  input: PredicateScalar,
): XlsxValidationResult {
  const issues: XlsxValidationIssue[] = []
  for (const rule of sheet.extras?.validations ?? []) {
    const parts = rule.range.trim().split(/\s+/)
    if (
      !parts.every((part) => {
        if (!/^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Z]{1,3}\$?[1-9]\d{0,6})?$/i.test(part))
          return false
        try {
          const bounds = parseRange(part.replaceAll('$', '').toUpperCase())
          return bounds.endRow < 1048576 && bounds.endColumn < 16384
        } catch {
          return false
        }
      })
    )
      issues.push({
        kind: 'unsupported',
        style: 'stop',
        title: '',
        message: '原件数据验证范围无法可靠映射',
        rule,
      })
  }
  const p = parseAddress(address),
    rules = (sheet.extras?.validations ?? []).filter((v) =>
      xlsxRangeContains(v.range, p.row, p.column),
    )
  for (const rule of rules) {
    const at = (row: number, col: number) => {
      if (row === p.row && col === p.column) return input
      const cell = sheet.rows.find((r) => r.number === row + 1)?.cells[col]
      if (cell?.formula && cell.formulaCache !== 'cached')
        throw new Error('数据验证引用了未缓存公式，无法可靠计算')
      return xlsxScalar(cell)
    }
    const qualifiedAt = (name: string, row: number, column: number) => {
      const source = workbook.sheets.find((item) => item.name.toLowerCase() === name.toLowerCase())
      if (!source) throw new Error('数据验证引用的工作表不存在')
      if (source === sheet) return at(row, column)
      const cell = source.rows.find((item) => item.number === row + 1)?.cells[column]
      if (cell?.formula && cell.formulaCache !== 'cached')
        throw new Error('数据验证引用了未缓存公式，无法可靠计算')
      return xlsxScalar(cell)
    }
    try {
      if (rule.unsupported) throw new Error(rule.unsupported)
      if (
        !['none', 'list', 'custom', 'decimal', 'whole', 'date', 'time', 'textLength'].includes(
          rule.type,
        )
      )
        throw new Error('当前网格暂不支持此数据验证类型')
      if (!['stop', 'warning', 'information'].includes(rule.errorStyle ?? 'stop'))
        throw new Error('原件数据验证错误样式无法识别')
      if ((input === '' || input === null) && rule.allowBlank) continue
      let valid = true
      if (rule.type === 'list') {
        const values = resolveXlsxValidationList(rule.formula1, sheet, workbook, {
          address,
          range: rule.range,
        })
        valid = values.some(
          (v) => String(v ?? '').toLowerCase() === String(input ?? '').toLowerCase(),
        )
      } else if (rule.type === 'custom') {
        const b = parseRange(rule.range.split(/\s+/)[0]!.replaceAll('$', ''))
        const value = evaluateXlsxPredicate(
          rule.formula1,
          at,
          p.row - b.startRow,
          p.column - b.startColumn,
          qualifiedAt,
        )
        if (typeof value !== 'boolean' && (typeof value !== 'number' || !Number.isFinite(value)))
          throw new Error('自定义数据验证公式未返回可计算的逻辑值')
        valid = Boolean(value)
      } else if (['decimal', 'whole', 'date', 'time', 'textLength'].includes(rule.type)) {
        if (
          ![
            'between',
            'notBetween',
            'equal',
            'notEqual',
            'greaterThan',
            'lessThan',
            'greaterThanOrEqual',
            'lessThanOrEqual',
          ].includes(rule.operator)
        )
          throw new Error('原件数据验证比较方式无法识别')
        const between = ['between', 'notBetween'].includes(rule.operator)
        if (between && !rule.formula2) throw new Error('原件数据验证缺少第二个比较值')
        const anchor = parseRange(rule.range.split(/\s+/)[0]!.replaceAll('$', '')),
          deltaRow = p.row - anchor.startRow,
          deltaColumn = p.column - anchor.startColumn
        const value = rule.type === 'textLength' ? String(input ?? '').length : Number(input),
          a = Number(evaluateXlsxPredicate(rule.formula1, at, deltaRow, deltaColumn, qualifiedAt)),
          b = between
            ? Number(evaluateXlsxPredicate(rule.formula2, at, deltaRow, deltaColumn, qualifiedAt))
            : 0
        if (!Number.isFinite(a) || !Number.isFinite(b))
          throw new Error('原件数据验证比较公式无法可靠计算')
        valid =
          Number.isFinite(value) &&
          (rule.type !== 'whole' || Number.isInteger(value)) &&
          (rule.operator === 'equal'
            ? value === a
            : rule.operator === 'notEqual'
              ? value !== a
              : rule.operator === 'greaterThan'
                ? value > a
                : rule.operator === 'lessThan'
                  ? value < a
                  : rule.operator === 'greaterThanOrEqual'
                    ? value >= a
                    : rule.operator === 'lessThanOrEqual'
                      ? value <= a
                      : rule.operator === 'notBetween'
                        ? value < a || value > b
                        : value >= a && value <= b)
      }
      if (!valid && rule.showErrorMessage !== false)
        issues.push({
          kind:
            rule.errorStyle === 'warning' || rule.errorStyle === 'information'
              ? 'confirmation'
              : 'stop',
          style: rule.errorStyle ?? 'stop',
          title: rule.errorTitle ?? '',
          message: rule.error || '输入不符合此单元格的数据验证规则',
          rule,
        })
    } catch (error) {
      issues.push({
        kind: 'unsupported',
        style: 'stop',
        title: '',
        message: error instanceof Error ? error.message : '无法检查数据验证规则',
        rule,
      })
    }
  }
  return { issues, valid: issues.length === 0 }
}
export interface XlsxValidationIssue {
  kind: 'stop' | 'confirmation' | 'unsupported'
  style: string
  title: string
  message: string
  rule: XlsxValidationRule
}
export interface XlsxValidationResult {
  valid: boolean
  issues: XlsxValidationIssue[]
}
/** Compatibility callers remain strict; only the private grid handshake can confirm warnings. */
export function validateXlsxCellInput(
  sheet: XlsxSheet,
  workbook: XlsxWorkbook,
  address: string,
  input: PredicateScalar,
): string | null {
  const result = evaluateXlsxCellInput(sheet, workbook, address, input)
  const issue = result.issues.find((item) => item.kind !== 'confirmation') ?? result.issues[0]
  return issue
    ? issue.message + (issue.kind === 'confirmation' ? '；需要用户在当前格确认' : '')
    : null
}
