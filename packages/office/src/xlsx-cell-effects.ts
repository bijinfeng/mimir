import type { XlsxCellFormat } from './xlsx-format.js'
import type { XlsxCell, XlsxSheet, XlsxWorkbook } from './xlsx.js'
import { decodeXlsxXml } from './xlsx-format.js'
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
export function readXlsxCfRules(xml: string, styles: string): XlsxCfRule[] {
  const dxfs = [
    ...(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/.exec(styles)?.[1] ?? '').matchAll(
      /<dxf\b[^>]*>([\s\S]*?)<\/dxf>/g,
    ),
  ].map((m) => {
    const body = m[1]!,
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
  return [...xml.matchAll(/<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g)]
    .flatMap(([, a = '', body = '']) =>
      [...body.matchAll(/<cfRule\b([^>]*)(?:\/>|>([\s\S]*?)<\/cfRule>)/g)].map(
        ([full, attrs = '', rule = '']) => ({
          range: attr(a, 'sqref') ?? '',
          type: attr(attrs, 'type') ?? '',
          operator: attr(attrs, 'operator'),
          priority: Number(attr(attrs, 'priority') ?? 999),
          stop: /^(?:1|true)$/.test(attr(attrs, 'stopIfTrue') ?? ''),
          formula: [...rule.matchAll(/<formula\b[^>]*>([\s\S]*?)<\/formula>/g)].map((m) =>
            decodeXlsxXml(m[1]!),
          ),
          style: dxfs[Number(attr(attrs, 'dxfId') ?? -1)],
          xml: full,
        }),
      ),
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
            ),
            b = rule.formula[1]
              ? evaluateXlsxPredicate(
                  rule.formula[1],
                  scalarAt,
                  row - anchor.startRow,
                  cell.col - anchor.startColumn,
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
export function validateXlsxCellInput(
  sheet: XlsxSheet,
  workbook: XlsxWorkbook,
  address: string,
  input: PredicateScalar,
): string | null {
  const p = parseAddress(address),
    rules = (sheet.extras?.validations ?? []).filter((v) =>
      xlsxRangeContains(v.range, p.row, p.column),
    )
  for (const rule of rules) {
    if ((input === '' || input === null) && rule.allowBlank) continue
    const at = (row: number, col: number) =>
      row === p.row && col === p.column
        ? input
        : xlsxScalar(sheet.rows.find((r) => r.number === row + 1)?.cells[col])
    try {
      let valid = true
      if (rule.type === 'list') {
        const inline = /^"([\s\S]*)"$/.exec(rule.formula1)
        let values: PredicateScalar[]
        if (inline) values = inline[1]!.split(',')
        else {
          const defined =
            workbook.definedNames?.find((n) => n.name === rule.formula1)?.ref ?? rule.formula1
          const ref = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(defined),
            source = ref
              ? workbook.sheets.find((s) => s.name === (ref[1]?.replaceAll("''", "'") ?? ref[2]))
              : sheet
          if (!source) throw new Error('数据验证引用的工作表不存在')
          const b = parseRange((ref?.[3] ?? defined).replaceAll('$', ''))
          if ((b.endRow - b.startRow + 1) * (b.endColumn - b.startColumn + 1) > 2000)
            throw new Error('数据验证引用超出范围')
          values = []
          for (let r = b.startRow; r <= b.endRow; r++)
            for (let c = b.startColumn; c <= b.endColumn; c++)
              values.push(xlsxScalar(source.rows.find((row) => row.number === r + 1)?.cells[c]))
        }
        valid = values.some(
          (v) => String(v ?? '').toLowerCase() === String(input ?? '').toLowerCase(),
        )
      } else if (rule.type === 'custom') {
        const b = parseRange(rule.range.split(/\s+/)[0]!.replaceAll('$', ''))
        valid = Boolean(
          evaluateXlsxPredicate(rule.formula1, at, p.row - b.startRow, p.column - b.startColumn),
        )
      } else if (['decimal', 'whole', 'date', 'time', 'textLength'].includes(rule.type)) {
        const value = rule.type === 'textLength' ? String(input ?? '').length : Number(input),
          a = Number(evaluateXlsxPredicate(rule.formula1, at)),
          b = rule.formula2 ? Number(evaluateXlsxPredicate(rule.formula2, at)) : 0
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
      if (!valid) return rule.error || '输入不符合此单元格的数据验证规则'
    } catch (error) {
      return error instanceof Error ? error.message : '无法检查数据验证规则'
    }
  }
  return null
}
