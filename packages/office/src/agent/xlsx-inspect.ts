import { XMLParser } from 'fast-xml-parser'
import { BoundedZip } from '../zip-bounds.js'
import type { XlsxCell, XlsxSheet, XlsxWorkbook } from '../xlsx.js'
import {
  parseAddress,
  parseRange,
  columnIndex,
  formatAddress,
} from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { FORMULA_REFERENCE_PATTERN } from '../../vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'

const GUIDES: Record<string, string> = {
  charts:
    'add_chart(sheetId,chartType,dataRange,title?,anchorCell?)支持柱形/条形/折线/面积/饼/圆环/散点/雷达/组合，检测首行标题和首列分类。edit_chart用chartPath修改title/chartType/legend/dataLabels/grouping/axisTitles/seriesColors/seriesData；值与分类范围须为单行或单列。add_shape和add_image用anchorCell放置，图片须公开HTTP(S)PNG/JPEG/GIF，不接受本机路径。edit_shape用visualId修改文字/填充/位置；delete_visual删除原生对象。先read_sheet_features获取ID和当前属性。',
  table:
    'add_table(sheetId,range,name?,style?,bandedRows?)创建原生结构化表；第一行标题非空唯一，范围至少两行。add_table_row/delete_table_row用tableName和数据区相对row/count；add_table_column/delete_table_column用tableName和表内相对column/count，新增另需columnName。插入或删除影响整行或整列。至少保留一行数据和一列，计算列/汇总行拒绝复杂结构调整。delete_table将表转为区域，存在结构化公式引用时拒绝。',
  pivot:
    'add_pivot(sheetId,sourceRange,targetCell,rowFields,values)创建原生透视表且把汇总结果写入网格；values各项field/agg(sum/count/average/max/min)，可numFmt/showDataAs/formula；可columnField/pageFields/targetSheetId/name/groupings/filters。输出须为空白且不与源、其他透视或结构化表重叠。refresh_pivot(sheetId)按当前缓存刷新本表全部透视，扩展新分类时拒绝覆盖原有内容。支持范围上限2000格。',
  writing:
    '读取当前画布和目标格后用 propose_operations。使用 op，不使用 type；sheetId 从上下文取得。set_formula 的公式以 = 开头。范围写入最多2000格。copy_range/fill_range支持sourceSheetId，保留原始类型、样式、富文本并平移相对公式；筛选复制用filterColumn/filterValues，固定缓存值。convert_to_values按缓存移除公式，建议先重算，无缓存拒绝。共享/数组和关联结构相交拒绝。写入后未保存，需用户保存到库。',
  formatting:
    'format_range 使用 range 和 format。支持字形、字体、字号、字体/填充颜色、数字格式、对齐、边框、换行、缩进、旋转；先 read_formats。fill支持{pattern,fg,bg?}全部18种图案与{gradient:{type:linear/path,angle?,left?,right?,top?,bottom?,stops:[{position,color}]}}，色标2–10个；颜色可#RRGGBB、accent1+40%或{theme:4,tint:0.4}。fill:null明确清除；省略保持原样；同操作fill优先于fillColor。read_formats的fill包含原始spec、direct/inherited来源及unsupported提示。add_conditional_format(range,rule)支持number/text/blank/duplicate/top10/formula/colorScale/dataBar，clear_conditional_formats清除此表普通规则；网格显示基础规则、色阶和数据条；复杂条件公式如无法计算会标出。',
  structure:
    '行列插删及尺寸、合并、工作表新增/改名/复制/移动/隐藏/删除均单项提交。删表被引用或导致没有可见表时拒绝。set_hyperlink(address,target)支持http/https/mailto/#表!A1，null删除；set_note(address,text)支持普通批注，null删除；protect_sheet(protected)切换无密码保护。set_freeze(rows,columns)设定顶部行与左列冻结，0/0取消；set_page_setup接打印方向、纸张、缩放或fit、页边距、打印区域/标题/页眉页脚和分页。add_defined_name(name,ref)/delete_defined_name(name)仅工作簿普通名称，不传sheetId；保留隐藏/内置/工作表级名称。以上单项提交，受保护表禁止内容写入，密码保护不能取消，范围超链接与富文本/线程批注暂拒绝修改。',
  data: 'set_filter 设置标题+数据范围；set_filter_criteria 的 column 是绝对列字母，values 为允许值数组，null 清除此列条件。sort_range 搬移完整单元格样式和公式，并平移相对引用；绑定复杂地址结构的工作表拒绝。find_replace 只改文字格。set_data_validation(range,validation)支持list(values)、listRef(range)、numberBetween(min/max)、dateBetween(start/end ISO)、checkbox（0/1列表）、formula；null清除精确范围，部分重叠拒绝。宿主拒绝违反输入规则的写入；自定义公式超出安全计算能力时会明确拒绝。add_sparkline(type,dataRange,targetCell?,color?)为每行追加迷你图。',
  formulas:
    '公式可写入和保留；普通写入不自动重算，显示值可能过期。单独propose_operations传operations:[]和recalculate:true可刷新受支持公式缓存；1904日期、共享/数组公式、外部引用和未支持函数明确失败。trace_precedents/trace_dependents静态追踪A1引用；不解析命名范围、结构化表引用、INDIRECT、OFFSET或外部工作簿。先read_sheet_features读命名范围。',
}

function within(row: number, col: number, range: ReturnType<typeof parseRange>): boolean {
  return (
    row >= range.startRow &&
    row <= range.endRow &&
    col >= range.startColumn &&
    col <= range.endColumn
  )
}
function scalar(cell: XlsxCell): string | number | boolean {
  if (cell.boolean !== undefined) return cell.boolean
  if (cell.numeric) return Number(cell.rawText ?? cell.text)
  return cell.rawText ?? cell.text
}
function referenceBounds(ref: string): ReturnType<typeof parseRange> {
  const clean = ref.replaceAll('$', '')
  if (/^[A-Z]+:[A-Z]+$/.test(clean)) {
    const [start, end] = clean.split(':')
    return {
      startRow: 0,
      endRow: 1_048_575,
      startColumn: columnIndex(start!),
      endColumn: columnIndex(end!),
    }
  }
  if (/^\d+:\d+$/.test(clean)) {
    const [start, end] = clean.split(':').map(Number)
    return { startRow: start! - 1, endRow: end! - 1, startColumn: 0, endColumn: 16_383 }
  }
  return parseRange(clean)
}
function references(workbook: XlsxWorkbook, sheet: XlsxSheet, formula: string) {
  const refs: Array<{ sheet: XlsxSheet; range: string; bounds: ReturnType<typeof parseRange> }> = []
  const unresolved: string[] = []
  // Quoted strings cannot contain real A1 references. External references need a workbook resolver.
  const clean = formula
    .split('"')
    .map((segment, i) => (i % 2 ? '' : segment))
    .join('"')
  if (/\[[^\]]*\]|\b(?:INDIRECT|OFFSET)\s*\(/i.test(clean))
    return { refs, unresolved: ['包含外部、结构化或动态引用；静态追踪不完整'] }
  for (const match of clean.matchAll(
    new RegExp(FORMULA_REFERENCE_PATTERN.source, FORMULA_REFERENCE_PATTERN.flags),
  )) {
    const qualifier = match[2]
    const name = qualifier?.startsWith("'")
      ? qualifier.slice(1, -1).replaceAll("''", "'")
      : qualifier
    const target = name
      ? workbook.sheets.find((item) => item.name.toLowerCase() === name.toLowerCase())
      : sheet
    if (!target) {
      unresolved.push(`${qualifier}!${match[3]}`)
      continue
    }
    refs.push({ sheet: target, range: match[3]!, bounds: referenceBounds(match[3]!) })
  }
  return { refs, unresolved }
}

export async function inspectXlsx(
  tool: string,
  input: Record<string, unknown>,
  workbook: XlsxWorkbook,
  bytes: Uint8Array,
  fallbackSheet: number,
): Promise<unknown | undefined> {
  if (tool === 'load_guide') {
    if (
      !Array.isArray(input.guides) ||
      input.guides.length < 1 ||
      input.guides.length > 8 ||
      input.guides.some((name) => typeof name !== 'string' || !GUIDES[name])
    )
      throw new Error(`guides 可用名称：${Object.keys(GUIDES).join(', ')}`)
    return { guides: input.guides.map((name: string) => ({ name, content: GUIDES[name] })) }
  }
  if (
    ![
      'aggregate_range',
      'read_formats',
      'read_sheet_features',
      'trace_precedents',
      'trace_dependents',
    ].includes(tool)
  )
    return undefined
  if (input.sheetId !== undefined && typeof input.sheetId !== 'string')
    throw new Error('sheetId 必须是字符串')
  const sheet =
    typeof input.sheetId === 'string'
      ? workbook.sheets.find((item) => item.id === input.sheetId)
      : workbook.sheets[fallbackSheet]
  if (!sheet) throw new Error('工作表 ID 已失效')
  if (tool === 'aggregate_range' || tool === 'read_formats') {
    if (typeof input.range !== 'string') throw new Error('range 必须是 A1 范围')
    const bounds = parseRange(input.range)
    const total =
      (bounds.endRow - bounds.startRow + 1) * (bounds.endColumn - bounds.startColumn + 1)
    if (
      bounds.endRow > 1_048_575 ||
      bounds.endColumn > 16_383 ||
      total > (tool === 'read_formats' ? 200 : 1_000_000)
    )
      throw new Error(tool === 'read_formats' ? '格式读取最多200格' : '汇总最多100万格')
    const cells = sheet.rows.flatMap((row) =>
      row.cells
        .filter((cell) => within(row.number - 1, cell.col, bounds) && !cell.covered)
        .map((cell) => ({ address: formatAddress(row.number - 1, cell.col), cell })),
    )
    if (tool === 'read_formats')
      return {
        sheetId: sheet.id,
        cells: cells
          .filter(({ cell }) => cell.format)
          .map(({ address, cell }) => ({ address, format: cell.format })),
      }
    if (
      input.topValues !== undefined &&
      (typeof input.topValues !== 'number' ||
        !Number.isInteger(input.topValues) ||
        input.topValues < 0 ||
        input.topValues > 50)
    )
      throw new Error('topValues 必须是0–50的整数')
    const values = cells.filter(({ cell }) => cell.text !== '').map(({ cell }) => scalar(cell))
    const numbers = values.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    )
    const frequencies = new Map<string, { value: string | number | boolean; count: number }>()
    for (const value of values) {
      const key = `${typeof value}:${value}`
      const previous = frequencies.get(key)
      frequencies.set(key, { value, count: (previous?.count ?? 0) + 1 })
    }
    const sum = numbers.reduce((a, b) => a + b, 0)
    return {
      sheetId: sheet.id,
      range: input.range,
      cells: total,
      nonEmpty: values.length,
      blank: total - values.length,
      distinct: frequencies.size,
      numericCount: numbers.length,
      sum,
      average: numbers.length ? sum / numbers.length : null,
      min: numbers.length ? numbers.reduce((a, b) => Math.min(a, b), Infinity) : null,
      max: numbers.length ? numbers.reduce((a, b) => Math.max(a, b), -Infinity) : null,
      topValues: [...frequencies.values()]
        .toSorted((a, b) => b.count - a.count)
        .slice(0, typeof input.topValues === 'number' ? input.topValues : 10),
      formulaValues: '文件缓存，尚未重算',
    }
  }
  if (tool === 'read_sheet_features') {
    const zip = await BoundedZip.open(bytes)
    const xml = await zip.readText(sheet.entry)
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
    })
    const parsed = parser.parse(xml ?? '') as { worksheet?: Record<string, unknown> }
    const workbookXml = parser.parse((await zip.readText('xl/workbook.xml')) ?? '') as {
      workbook?: Record<string, unknown>
    }
    const features = Object.fromEntries(
      [
        'autoFilter',
        'conditionalFormatting',
        'dataValidations',
        'mergeCells',
        'sheetViews',
        'sheetProtection',
        'pageMargins',
        'pageSetup',
        'printOptions',
        'headerFooter',
        'drawing',
        'legacyDrawing',
        'tableParts',
        'hyperlinks',
      ].map((key) => [key, parsed.worksheet?.[key] ?? null]),
    )
    if (
      JSON.stringify({
        features,
        definedNames: workbookXml.workbook?.definedNames,
        notes: sheet.extras?.notes,
        visuals: (sheet.visuals ?? []).map(({ svg: _svg, image: _image, ...metadata }) => metadata),
        tables: sheet.tables,
        pivots: sheet.pivots,
        sparklines: sheet.extras?.sparklines,
      }).length > 32_000
    )
      throw new Error('工作表特征过多，超过单次读取预算')
    return {
      sheetId: sheet.id,
      hidden: sheet.hidden === true,
      features,
      visuals: (sheet.visuals ?? []).map(({ svg: _svg, image: _image, ...metadata }) => metadata),
      tables: sheet.tables ?? [],
      pivots: sheet.pivots ?? [],
      definedNames: workbookXml.workbook?.definedNames ?? null,
      notes: sheet.extras?.notes ?? {},
      sparklines: sheet.extras?.sparklines ?? [],
      limitations: ['图表、透视和公式显示值来自当前缓存；源数据变更后须显式更新'],
    }
  }
  if (typeof input.address !== 'string' || !/^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/.test(input.address))
    throw new Error('address 必须是单格A1地址')
  const point = parseAddress(input.address)
  if (point.row > 1_048_575 || point.column > 16_383) throw new Error('单元格地址超出边界')
  if (tool === 'trace_precedents') {
    const cell = sheet.rows.find((row) => row.number === point.row + 1)?.cells[point.column]
    if (!cell?.formulaText) throw new Error('目标不是可读取公式的单元格')
    const { refs, unresolved } = references(workbook, sheet, cell.formulaText)
    return {
      sheetId: sheet.id,
      address: input.address,
      formula: cell.formulaText,
      precedents: refs.map((ref) => ({
        sheetId: ref.sheet.id,
        sheetName: ref.sheet.name,
        range: ref.range,
        cells: ref.sheet.rows
          .flatMap((row) =>
            row.cells
              .filter(
                (candidate) =>
                  within(row.number - 1, candidate.col, ref.bounds) &&
                  (candidate.text !== '' || candidate.formula),
              )
              .map((candidate) => ({
                address: formatAddress(row.number - 1, candidate.col),
                text: candidate.text,
                formula: candidate.formulaText,
                error: /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/.test(candidate.text),
              })),
          )
          .slice(0, 200),
      })),
      unresolved,
      note: '仅静态A1引用，命名范围和动态引用不展开；当前值为公式缓存',
    }
  }
  const dependents: Array<Record<string, unknown>> = []
  let unresolved = 0
  for (const currentSheet of workbook.sheets)
    for (const row of currentSheet.rows)
      for (const cell of row.cells) {
        if (!cell.formulaText) continue
        const result = references(workbook, currentSheet, cell.formulaText)
        if (result.unresolved.length) unresolved++
        if (
          result.refs.some(
            (ref) => ref.sheet.id === sheet.id && within(point.row, point.column, ref.bounds),
          )
        )
          dependents.push({
            sheetId: currentSheet.id,
            sheetName: currentSheet.name,
            address: formatAddress(row.number - 1, cell.col),
            formula: cell.formulaText,
            text: cell.text,
          })
      }
  return {
    sheetId: sheet.id,
    address: input.address,
    dependents: dependents.slice(0, 200),
    truncated: dependents.length > 200,
    unresolvedFormulas: unresolved,
    note: '仅静态A1引用；命名范围和动态引用不展开',
  }
}
