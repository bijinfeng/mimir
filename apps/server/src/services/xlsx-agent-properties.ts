import {
  createBufferEntrySource,
  applyCellEditsToXlsx,
  assertOnlyTouchedEntriesChanged,
  planCellEditsToXlsx,
  assembleWithJsZip,
  type SheetCfState,
  type SheetDvState,
  type SheetSparklineAddition,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  expandToPrimitiveOps,
  type WorkbookOperation,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import {
  parseRange,
  parseAddress,
  formatAddress,
  rangeCellCount,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type { SheetPageSetupState } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-page-setup.js'
import type { DefinedNamesState } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-defined-names.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { readXlsxArchive } from '../../../../packages/office/src/xlsx.js'
import { xlsxAttribute } from '../../../../packages/office/src/xlsx-sheet-features.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'
export const XLSX_PROPERTY_OPS = new Set([
  'add_conditional_format',
  'clear_conditional_formats',
  'set_data_validation',
  'add_defined_name',
  'delete_defined_name',
  'set_page_setup',
  'set_freeze',
  'add_sparkline',
])
function checkedRange(value: string) {
  const b = parseRange(value)
  if (b.endRow >= 1_048_576 || b.endColumn >= 16_384 || rangeCellCount(b) > 2000)
    throw new Error('范围超出边界或2000格上限')
  return b
}
function cfRule(
  op: Extract<WorkbookOperation, { op: 'add_conditional_format' }>,
): SheetCfState['rules'][number] {
  const r = op.rule
  let rule: Record<string, unknown>
  if (r.kind === 'colorScale')
    rule = {
      type: 'colorScale',
      config: [
        { index: 0, color: r.minColor, value: { type: 'min' } },
        ...(r.midColor
          ? [{ index: 1, color: r.midColor, value: { type: 'percentile', value: 50 } }]
          : []),
        { index: 2, color: r.maxColor, value: { type: 'max' } },
      ],
    }
  else if (r.kind === 'dataBar')
    rule = {
      type: 'dataBar',
      config: { min: { type: 'min' }, max: { type: 'max' }, positiveColor: r.color ?? '#638EC6' },
    }
  else {
    const f = r.format,
      style = {
        ...(f.bold !== undefined ? { bl: f.bold ? 1 : 0 } : {}),
        ...(f.italic !== undefined ? { it: f.italic ? 1 : 0 } : {}),
        ...(f.fillColor ? { bg: { rgb: f.fillColor } } : {}),
        ...(f.fontColor ? { cl: { rgb: f.fontColor } } : {}),
      }
    rule = { type: 'highlightCell', style }
    if (r.kind === 'number')
      Object.assign(rule, {
        subType: 'number',
        operator: r.operator,
        value: r.value2 === undefined ? r.value : [r.value, r.value2],
      })
    if (r.kind === 'text')
      Object.assign(rule, {
        subType: 'text',
        operator: {
          contains: 'containsText',
          notContains: 'notContainsText',
          beginsWith: 'beginsWith',
          endsWith: 'endsWith',
        }[r.operator],
        value: r.text,
      })
    if (r.kind === 'blank')
      Object.assign(rule, {
        subType: 'text',
        operator: r.blank ? 'containsBlanks' : 'notContainsBlanks',
      })
    if (r.kind === 'duplicate')
      Object.assign(rule, { subType: r.unique ? 'uniqueValues' : 'duplicateValues' })
    if (r.kind === 'top10')
      Object.assign(rule, {
        subType: 'rank',
        value: r.rank,
        isPercent: r.percent,
        isBottom: r.bottom,
      })
    if (r.kind === 'formula') Object.assign(rule, { subType: 'formula', value: r.formula })
  }
  return { ranges: [checkedRange(op.range)], stopIfTrue: false, rule }
}
function dvRule(
  op: Extract<WorkbookOperation, { op: 'set_data_validation' }>,
): SheetDvState['rules'][number] | null {
  const r = op.validation
  if (!r) return null
  const rule: Record<string, unknown> = { allowBlank: true, showErrorMessage: true, errorStyle: 1 }
  if (r.kind === 'list') {
    if (r.values.some((v) => /[,"\r\n]/.test(v)) || r.values.join(',').length > 255)
      throw new Error('下拉选项不能含逗号、引号或换行，合计最多255字符；请改用范围引用')
    Object.assign(rule, { type: 'list', formula1: r.values.join(','), showDropDown: true })
  }
  if (r.kind === 'listRef') {
    checkedRange(r.range)
    Object.assign(rule, { type: 'list', formula1: '=' + r.range, showDropDown: true })
  }
  if (r.kind === 'numberBetween')
    Object.assign(rule, {
      type: 'decimal',
      operator: 'between',
      formula1: String(r.min),
      formula2: String(r.max),
    })
  if (r.kind === 'dateBetween') {
    if (r.start < '1900-03-01') throw new Error('1900年3月以前的日期验证暂不支持')
    for (const value of [r.start, r.end])
      if (
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        throw new Error('日期必须是有效ISO日期')
    Object.assign(rule, { type: 'date', operator: 'between', formula1: r.start, formula2: r.end })
  }
  if (r.kind === 'checkbox') Object.assign(rule, { type: 'checkbox', formula1: '1', formula2: '0' })
  if (r.kind === 'formula') Object.assign(rule, { type: 'custom', formula1: r.formula })
  return { ranges: [checkedRange(op.range)], rule }
}
export async function applyXlsxPropertyOperation(
  bytes: Uint8Array,
  op: WorkbookOperation,
  version: number,
): Promise<XlsxHostResult> {
  if (!XLSX_PROPERTY_OPS.has(op.op)) throw new Error('不支持的工作簿属性工具')
  expandToPrimitiveOps([op])
  const zip = await BoundedZip.open(bytes),
    view = await readXlsxArchive(zip)
  const sheet = 'sheetId' in op ? view.sheets.find((s) => s.id === op.sheetId) : undefined
  if ('sheetId' in op && !sheet) throw new Error('工作表ID已失效')
  if (sheet?.extras?.protected) throw new Error('工作表已保护，请先取消保护')
  const xml = sheet ? ((await zip.readText(sheet.entry)) ?? '') : ''
  const wb = (await zip.readText('xl/workbook.xml')) ?? ''
  const cf: SheetCfState[] = [],
    dv: SheetDvState[] = [],
    pages: SheetPageSetupState[] = [],
    sparks: SheetSparklineAddition[] = []
  let names: DefinedNamesState | null = null
  if (op.op === 'add_conditional_format')
    cf.push({ sheetName: sheet!.name, rules: [cfRule(op)], append: true })
  if (op.op === 'clear_conditional_formats') {
    if (/<(?:\w+:)?conditionalFormattings\b|<conditionalFormatting\b[\s\S]*?<extLst\b/.test(xml))
      throw new Error('含扩展条件格式的工作表暂不能清除全部规则')
    cf.push({ sheetName: sheet!.name, rules: [] })
  }
  if (op.op === 'set_data_validation') {
    const b = checkedRange(op.range)
    if ([...xml.matchAll(/<dataValidation\b[^>]*>/g)].some(([tag]) => !tag.includes('sqref="')))
      throw new Error('现有验证XML形式暂不支持保真修改')
    if (/<(?:\w+:)dataValidation\b/.test(xml)) throw new Error('扩展数据验证暂不支持修改')
    if (op.validation?.kind === 'dateBetween' && /\bdate1904=["'](?:1|true)["']/.test(wb))
      throw new Error('1904日期系统的数据验证暂不支持')
    for (const [tag] of xml.matchAll(/<dataValidation\b[^>]*>/g))
      for (const ref of (xlsxAttribute(tag, 'sqref') ?? '').split(/\s+/).filter(Boolean)) {
        const a = parseRange(ref),
          same =
            a.startRow === b.startRow &&
            a.endRow === b.endRow &&
            a.startColumn === b.startColumn &&
            a.endColumn === b.endColumn
        if (
          !same &&
          a.startRow <= b.endRow &&
          a.endRow >= b.startRow &&
          a.startColumn <= b.endColumn &&
          a.endColumn >= b.startColumn
        )
          throw new Error('现有验证范围与目标部分重叠，请使用完整原范围')
      }
    const rule = dvRule(op)
    dv.push({
      sheetName: sheet!.name,
      rules: rule ? [rule] : [],
      append: true,
      remove: rule ? [] : [b],
    })
  }
  if (op.op === 'set_freeze')
    pages.push({ sheetName: sheet!.name, frozenRows: op.rows, frozenColumns: op.columns })
  if (op.op === 'set_page_setup') {
    if (op.printArea) checkedRange(op.printArea)
    if (op.printTitles) {
      const [a, b] = op.printTitles.replaceAll('$', '').split(':').map(Number)
      if (!a || !b || a > b || b > 1_048_576) throw new Error('重复标题行范围无效')
    }
    const { op: _op, sheetId: _sheetId, rowBreaks, colBreaks, ...settings } = op
    pages.push({
      sheetName: sheet!.name,
      ...settings,
      ...(op.fitToWidth !== undefined || op.fitToHeight !== undefined
        ? { fitToPage: true }
        : op.scale !== undefined
          ? { fitToPage: false }
          : {}),
      ...(rowBreaks ? { rowBreaks: rowBreaks.map((v) => v - 1) } : {}),
      ...(colBreaks ? { colBreaks: colBreaks.map((v) => v - 1) } : {}),
    })
  }
  if (op.op === 'add_defined_name' || op.op === 'delete_defined_name') {
    const entries = [
      ...wb.matchAll(/<definedName\b[^>]*\/>|<definedName\b[^>]*>[\s\S]*?<\/definedName>/g),
    ].map((m) => m[0])
    if (entries.some((tag) => !/<definedName\b[^>]*\bname="/.test(tag)))
      throw new Error('现有名称XML形式暂不支持保真修改')
    const matched = entries.filter(
      (tag) => xlsxAttribute(tag, 'name')?.toLocaleLowerCase() === op.name.toLocaleLowerCase(),
    )
    if (
      matched.some(
        (tag) =>
          xlsxAttribute(tag, 'localSheetId') !== undefined ||
          xlsxAttribute(tag, 'hidden') === '1' ||
          xlsxAttribute(tag, 'hidden') === 'true',
      ) ||
      op.name.startsWith('_xlnm.')
    )
      throw new Error('内置、隐藏或工作表级命名范围暂不能修改')
    if (op.op === 'add_defined_name' && matched.length)
      throw new Error('该名称已存在，请先删除或选择其他名称')
    if (op.op === 'delete_defined_name' && !matched.length) throw new Error('命名范围不存在')
    const actual = matched[0] ? xlsxAttribute(matched[0], 'name')! : op.name
    names = {
      names: op.op === 'add_defined_name' ? [{ name: op.name, formula: op.ref }] : [],
      preserveNames: entries
        .map((tag) => xlsxAttribute(tag, 'name') ?? '')
        .filter((name) => name !== actual),
    }
  }
  if (op.op === 'add_sparkline') {
    const b = checkedRange(op.dataRange),
      target = op.targetCell
        ? parseAddress(op.targetCell)
        : { row: b.startRow, column: b.endColumn + 1 }
    if (target.column >= 16_384 || target.row + b.endRow - b.startRow >= 1_048_576)
      throw new Error('迷你图目标超出工作表边界')
    const cells = Array.from({ length: b.endRow - b.startRow + 1 }, (_, i) => ({
      cell: formatAddress(target.row + i, target.column),
      sourceRef: `'${sheet!.name.replaceAll("'", "''")}'!${formatAddress(b.startRow + i, b.startColumn)}:${formatAddress(b.startRow + i, b.endColumn)}`,
    }))
    if (cells.some((c) => new RegExp(`<(?:\\w+:)?sqref>\\s*${c.cell}\\s*<`).test(xml)))
      throw new Error('目标格已有迷你图，请换一个目标')
    sparks.push({ sheetName: sheet!.name, type: op.type, color: op.color, cells })
  }
  const source = Buffer.from(bytes)
  const mutation = sparks.length
    ? await assembleWithJsZip(
        source,
        await planCellEditsToXlsx(
          await createBufferEntrySource(source),
          [],
          [],
          [],
          undefined,
          [],
          [],
          cf,
          dv,
          [],
          names,
          [],
          pages,
          [],
          [],
          [],
          [],
          [],
          [],
          sparks,
        ),
      )
    : await applyCellEditsToXlsx(source, [], [], [], undefined, [], [], cf, dv, [], names, pages)
  assertOnlyTouchedEntriesChanged(mutation)
  return {
    bytes: new Uint8Array(mutation.buffer),
    version: version + 1,
    changedCells: [],
    touchedEntries: [...mutation.touchedEntries],
  }
}
