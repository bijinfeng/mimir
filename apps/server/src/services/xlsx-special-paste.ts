import {
  parseRange,
  formatAddress,
  rangeCellCount,
  type RangeBounds,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  readXlsxRangeXmlTree,
  readXlsxFormulaCharacterData,
  rewriteXlsxRangeFormulas,
  type XlsxRangeXmlNode,
} from '../../../../packages/office/src/xlsx-native-xml.js'

import type { XlsxPasteMode } from '@mimir/shared'
export type { XlsxPasteMode } from '@mimir/shared'

export interface XlsxPasteGeometry {
  source: RangeBounds
  target: RangeBounds
  tiles: RangeBounds[]
}
const MAX_CELLS = 2000
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
type Area = { -readonly [Key in keyof RangeBounds]: RangeBounds[Key] }
function fail(detail: string): never {
  throw new Error(`选择性粘贴无法安全完成：${detail}`)
}
function area(ref: string): Area {
  if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/.test(ref))
    fail('范围须为普通连续矩形')
  const result = parseRange(ref)
  if (
    result.startRow < 0 ||
    result.startColumn < 0 ||
    result.endRow >= 1048576 ||
    result.endColumn >= 16384 ||
    rangeCellCount(result) > MAX_CELLS
  )
    fail('范围超出2000格或工作表边界')
  return { ...result }
}
/** Plan all tiles before any mutation, including overlapping source/target ranges. */
export function planXlsxPasteGeometry(
  sourceRef: string,
  targetRef: string,
  kind: 'copy' | 'cut',
  mode: XlsxPasteMode,
): XlsxPasteGeometry {
  if (!['all', 'value', 'formula', 'format', 'column-width', 'besides-border'].includes(mode))
    fail('未知粘贴方式')
  if (kind !== 'copy' && kind !== 'cut') fail('未知剪贴板来源类型')
  if (kind === 'cut' && mode !== 'all') fail('剪切内容只支持全部粘贴；请先复制以使用选择性粘贴')
  const source = area(sourceRef),
    target = area(targetRef)
  const height = source.endRow - source.startRow + 1
  const width = source.endColumn - source.startColumn + 1
  if (rangeCellCount(target) === 1) {
    target.endRow += height - 1
    target.endColumn += width - 1
  }
  if (target.endRow >= 1048576 || target.endColumn >= 16384 || rangeCellCount(target) > MAX_CELLS)
    fail('展开后的目标超出2000格或工作表边界')
  const targetHeight = target.endRow - target.startRow + 1
  const targetWidth = target.endColumn - target.startColumn + 1
  if (targetHeight % height || targetWidth % width) fail('目标行列数须分别为源范围的整数倍')
  if (kind === 'cut' && (targetHeight !== height || targetWidth !== width))
    fail('剪切目标须为单格或与源相同大小')
  const tiles: RangeBounds[] = []
  for (let row = target.startRow; row <= target.endRow; row += height)
    for (let column = target.startColumn; column <= target.endColumn; column += width)
      tiles.push({
        startRow: row,
        endRow: row + height - 1,
        startColumn: column,
        endColumn: column + width - 1,
      })
  return { source, target, tiles }
}

interface NativeCell {
  xml: string
  node: XlsxRangeXmlNode
  formula?: XlsxRangeXmlNode
  value?: XlsxRangeXmlNode
  inline?: XlsxRangeXmlNode
}
function nativeCell(xml: string): NativeCell | null {
  if (!xml) return null
  const node = readXlsxRangeXmlTree(xml)
  if (node.local !== 'c' || (node.ns && node.ns !== MAIN)) fail('单元格命名空间无效')
  for (const key of node.attrs.keys())
    if (!['r', 's', 't', 'xmlns'].includes(key)) fail(`单元格含未支持的 ${key} 元数据`)
  for (const child of node.children)
    if (!['f', 'v', 'is'].includes(child.local) || child.ns !== node.ns)
      fail('单元格含未知原生内容')
  const one = (name: string) => {
    const found = node.children.filter((child) => child.local === name)
    if (found.length > 1) fail(`单元格 ${name} 重复`)
    return found[0]
  }
  const formula = one('f'),
    value = one('v'),
    inline = one('is')
  let cursor = node.openEnd
  for (const child of node.children) {
    if (readXlsxFormulaCharacterData(xml.slice(cursor, child.start)).trim())
      fail('单元格含未知直接文字')
    cursor = child.end
  }
  if (readXlsxFormulaCharacterData(xml.slice(cursor, node.closeStart)).trim())
    fail('单元格含未知直接文字')
  if (formula && [...formula.attrs.keys()].some((key) => key !== 'xmlns'))
    fail('共享、数组或溢出公式尚不支持此范围操作')
  if (formula?.children.length || value?.children.length) fail('单元格公式或缓存含未知子元素')
  const type = node.attrs.get('t')
  if (type && !['n', 'b', 'e', 'str', 's', 'inlineStr', 'd'].includes(type)) fail('单元格类型未知')
  if ((inline && (type !== 'inlineStr' || value || formula)) || (type === 'inlineStr' && !inline))
    fail('内联文字类型与内容不一致')
  if (type === 's' && (!value || formula)) fail('共享文字索引无效')
  if (value) {
    const content = text(xml, value)
    if (
      (type === 'b' && !['0', '1'].includes(content)) ||
      (type === 's' && (!/^\d+$/.test(content) || !Number.isSafeInteger(Number(content)))) ||
      ((!type || type === 'n') &&
        content !== '' &&
        (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(content) ||
          !Number.isFinite(Number(content))))
    )
      fail('原生单元格缓存与类型不一致')
  }
  return { xml, node, formula, value, inline }
}
const raw = (cell: NativeCell, node?: XlsxRangeXmlNode) =>
  node ? cell.xml.slice(node.start, node.end) : ''
const text = (xml: string, node: XlsxRangeXmlNode) =>
  readXlsxFormulaCharacterData(xml.slice(node.openEnd, node.closeStart))
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#13;')
function stringText(xml: string): string {
  const node = readXlsxRangeXmlTree(xml)
  if (!['is', 'si'].includes(node.local)) fail('文字容器无效')
  let result = ''
  for (const child of node.children) {
    if (child.local === 't') result += text(xml, child)
    else if (child.local === 'r') {
      if (
        child.children.filter((part) => part.local === 't').length !== 1 ||
        child.children.some((part) => !['rPr', 't'].includes(part.local))
      )
        fail('富文本结构未知')
      result += text(
        xml,
        child.children.find((part) => part.local === 't')!,
      )
    } else if (!['rPh', 'phoneticPr'].includes(child.local)) fail('文字含未知原生内容')
  }
  return result
}
export interface XlsxPasteCellDependencies {
  /** The same-workbook shared string item, retaining its native si element. */
  sharedString(index: number): string | undefined
  translateFormula(formula: string, rowDelta: number, columnDelta: number): string
  /** For besides-border, resolves source base style with destination effective border. */
  mergeBorder(sourceStyle: string, targetStyle: string): string
}
export interface XlsxPasteCellRequest {
  sourceXml: string
  targetXml: string
  sourceStyle: string
  targetStyle: string
  targetAddress: string
  rowDelta: number
  columnDelta: number
  mode: Exclude<XlsxPasteMode, 'column-width'>
}
/** Build one cell from a frozen source; caller publishes the complete plan only once. */
export function projectXlsxPasteCell(
  input: XlsxPasteCellRequest,
  deps: XlsxPasteCellDependencies,
): string {
  const { mode, targetAddress, sourceStyle, targetStyle } = input
  if (!['all', 'value', 'formula', 'format', 'besides-border'].includes(mode)) fail('未知粘贴方式')
  if (!Number.isInteger(input.rowDelta) || !Number.isInteger(input.columnDelta))
    fail('公式偏移无效')
  area(targetAddress)
  if (targetAddress.includes(':')) fail('目标单元格地址无效')
  for (const style of [sourceStyle, targetStyle]) if (!/^\d+$/.test(style)) fail('样式索引无效')
  const source = nativeCell(input.sourceXml),
    target = nativeCell(input.targetXml)
  if (mode === 'format') {
    if (sourceStyle === targetStyle) return input.targetXml
    if (!target) return `<c r="${targetAddress}" s="${sourceStyle}"/>`
    return target.xml.replace(/^<[^\s/>]+\b[^>]*>/, (open) =>
      open
        .replace(/\ss=(?:"[^"]*"|'[^']*')/, '')
        .replace(/\/?>(?![\s\S])/, (end) => ` s="${sourceStyle}"${end}`),
    )
  }
  const style =
    mode === 'all'
      ? sourceStyle
      : mode === 'besides-border'
        ? deps.mergeBorder(sourceStyle, targetStyle)
        : targetStyle
  if (!/^\d+$/.test(style)) fail('合并后的样式索引无效')
  if (!source)
    return !target && style === targetStyle ? '' : `<c r="${targetAddress}" s="${style}"/>`
  let type = source.node.attrs.get('t'),
    body = ''
  if (mode === 'all' || mode === 'besides-border') {
    body = source.node.children.map((child) => raw(source, child)).join('')
    body = rewriteXlsxRangeFormulas(body, ['f'], (formula) =>
      deps.translateFormula(formula, input.rowDelta, input.columnDelta),
    )
  } else if (source.formula) {
    if (mode === 'value') {
      if (!source.value) fail('源公式没有缓存结果，请先重新计算')
      if ((!type || type === 'n') && !text(source.xml, source.value).trim())
        fail('源公式没有数值缓存结果，请先重新计算')
      body = raw(source, source.value)
    } else {
      const formula = deps.translateFormula(
        text(source.xml, source.formula),
        input.rowDelta,
        input.columnDelta,
      )
      body = `<f>${escape(formula)}</f>`
      type = undefined
    }
  } else if (mode === 'formula' || (mode === 'value' && target?.formula)) {
    // Official formula-ui priority 10 follows the value hook: rich strings are
    // flattened in formula mode, or value mode when replacing a target formula.
    if (source.inline || type === 's') {
      let value: string
      if (source.inline) value = stringText(raw(source, source.inline))
      else {
        const index = text(source.xml, source.value!)
        if (!/^\d+$/.test(index)) fail('共享文字索引无效')
        const item = deps.sharedString(Number(index))
        if (!item) fail('共享文字索引不存在')
        value = stringText(item)
      }
      type = 'inlineStr'
      body = `<is><t xml:space="preserve">${escape(value)}</t></is>`
    } else body = raw(source, source.value)
  } else body = raw(source, source.value) + raw(source, source.inline)
  return `<c r="${targetAddress}" s="${style}"${type ? ` t="${type}"` : ''}>${body}</c>`
}

/** Fixed 0.25.1: default source widths do not reset targets; hidden targets are skipped. */
export function planXlsxPasteColumnWidths(
  sourceWidths: readonly number[],
  target: RangeBounds,
  defaultWidth: number,
  targetVisible: (column: number) => boolean,
): Map<number, number> {
  if (!sourceWidths.length || !Number.isFinite(defaultWidth) || defaultWidth <= 0)
    fail('来源列宽无效')
  if (sourceWidths.some((width) => !Number.isFinite(width) || width < 0)) fail('来源列宽无效')
  if (
    target.startColumn < 0 ||
    target.endColumn >= 16384 ||
    target.endColumn - target.startColumn >= MAX_CELLS
  )
    fail('列宽目标超出预算')
  const result = new Map<number, number>()
  for (let column = target.startColumn; column <= target.endColumn; column++) {
    const width = sourceWidths[(column - target.startColumn) % sourceWidths.length]!
    if (width > 0 && width !== defaultWidth && targetVisible(column)) result.set(column, width)
  }
  return result
}

export function xlsxPasteAddresses(geometry: XlsxPasteGeometry) {
  return geometry.tiles.flatMap((tile) => {
    const positions: { source: string; target: string; rowDelta: number; columnDelta: number }[] =
      []
    const rowDelta = tile.startRow - geometry.source.startRow
    const columnDelta = tile.startColumn - geometry.source.startColumn
    for (let row = geometry.source.startRow; row <= geometry.source.endRow; row++)
      for (let column = geometry.source.startColumn; column <= geometry.source.endColumn; column++)
        positions.push({
          source: formatAddress(row, column),
          target: formatAddress(row + rowDelta, column + columnDelta),
          rowDelta,
          columnDelta,
        })
    return positions
  })
}

function setAttribute(open: string, key: string, value: string): string {
  const pattern = new RegExp(`\\s${key}\\s*=\\s*(?:"[^"]*"|'[^']*')`)
  return pattern.test(open)
    ? open.replace(pattern, ` ${key}="${value}"`)
    : open.replace(/\/?>(?![\s\S])/, (end) => ` ${key}="${value}"${end}`)
}
function nativeInteger(value: string | undefined, label: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail(`${label}无效`)
  return Number(value)
}
/** Append only actually needed cellXfs; themes, fills, rich runs and old xfs stay byte-exact. */
export function createXlsxPasteBorderStyles(xml: string) {
  const root = readXlsxRangeXmlTree(xml)
  if (root.local !== 'styleSheet' || (root.ns && root.ns !== MAIN)) fail('样式表命名空间无效')
  const unique = (name: string, required = true) => {
    const found = root.children.filter((node) => node.local === name)
    if (found.length > 1 || (required && found.length !== 1)) fail(`样式表 ${name} 缺失或重复`)
    const node = found[0]
    if (node && (node.ns !== root.ns || node.children.some((child) => child.ns !== root.ns)))
      fail('样式表子项命名空间无效')
    if (
      node?.attrs.has('count') &&
      nativeInteger(node.attrs.get('count'), `${name} count`) !== node.children.length
    )
      fail(`样式表 ${name} count 不一致`)
    return node
  }
  const xfs = unique('cellXfs')!,
    bases = unique('cellStyleXfs', false),
    borders = unique('borders')!
  if (
    !xfs.children.length ||
    xfs.children.some((node) => node.local !== 'xf') ||
    bases?.children.some((node) => node.local !== 'xf') ||
    borders.children.some((node) => node.local !== 'border')
  )
    fail('样式表结构无效')
  const added: string[] = [],
    cache = new Map<string, string>()
  const xf = (index: string) => {
    const node = xfs.children[nativeInteger(index, '样式索引')]
    if (!node) fail('样式索引不存在')
    const known = new Set([
      'numFmtId',
      'fontId',
      'fillId',
      'borderId',
      'xfId',
      'applyNumberFormat',
      'applyFont',
      'applyFill',
      'applyBorder',
      'applyAlignment',
      'applyProtection',
      'pivotButton',
      'quotePrefix',
      'xmlns',
    ])
    if (
      [...node.attrs.keys()].some((key) => !known.has(key)) ||
      node.children.some((child) => !['alignment', 'protection'].includes(child.local))
    )
      fail('样式含未支持的边框元数据')
    return node
  }
  const effectiveBorder = (node: XlsxRangeXmlNode) => {
    const apply = node.attrs.get('applyBorder')
    if (apply !== undefined && !['0', '1', 'false', 'true'].includes(apply))
      fail('applyBorder 无效')
    let holder = node
    if (apply === '0' || apply === 'false') {
      const base = bases?.children[nativeInteger(node.attrs.get('xfId'), 'xfId', 0)]
      if (!base) fail('继承边框样式不存在')
      holder = base
    }
    const index = nativeInteger(holder.attrs.get('borderId'), 'borderId', 0)
    if (!borders.children[index]) fail('原生边框不存在')
    return String(index)
  }
  return {
    mergeBorder(source: string, target: string): string {
      const sourceXf = xf(source),
        targetXf = xf(target)
      const border = effectiveBorder(targetXf)
      if (effectiveBorder(sourceXf) === border) return source
      const key = source + ':' + border,
        previous = cache.get(key)
      if (previous) return previous
      const original = xml.slice(sourceXf.start, sourceXf.end)
      const value = original.replace(/^<[^>]*>/, (open) =>
        setAttribute(setAttribute(open, 'borderId', border), 'applyBorder', '1'),
      )
      const existing = xfs.children.findIndex((node) => xml.slice(node.start, node.end) === value)
      if (existing >= 0) return String(existing)
      if (added.length >= MAX_CELLS || xfs.children.length + added.length >= 65536)
        fail('新增样式超过预算')
      const index = String(xfs.children.length + added.length)
      added.push(value)
      cache.set(key, index)
      return index
    },
    result(): string {
      if (!added.length) return xml
      const open = setAttribute(
        xml.slice(xfs.start, xfs.openEnd),
        'count',
        String(xfs.children.length + added.length),
      )
      if (open.endsWith('/>')) fail('cellXfs 容器无效')
      return (
        xml.slice(0, xfs.start) +
        open +
        xml.slice(xfs.openEnd, xfs.closeStart) +
        added.join('') +
        xml.slice(xfs.closeStart)
      )
    },
  }
}

/** Split only touched native col spans, retaining all their other attributes and unrelated XML. */
export function writeXlsxPasteColumnWidths(
  xml: string,
  widths: ReadonlyMap<number, number>,
): string {
  if (!widths.size) return xml
  if (widths.size > MAX_CELLS) fail('列宽修改超过预算')
  for (const [column, width] of widths)
    if (
      !Number.isInteger(column) ||
      column < 0 ||
      column >= 16384 ||
      !Number.isFinite(width) ||
      width <= 0 ||
      width > 255
    )
      fail('原生列宽或目标无效')
  const root = readXlsxRangeXmlTree(xml)
  if (root.local !== 'worksheet' || (root.ns && root.ns !== MAIN)) fail('工作表命名空间无效')
  const containers = root.children.filter((node) => node.local === 'cols')
  if (containers.length > 1) fail('cols 容器重复')
  const container = containers[0],
    covered = new Set<number>()
  const columns = container?.children ?? []
  if (columns.length * widths.size > 2_000_000) fail('列宽解析超过预算')
  const defaults = root.children.filter((node) => node.local === 'sheetFormatPr')
  if (defaults.length > 1) fail('sheetFormatPr 重复')
  const defaultWidth = defaults[0]?.attrs.get('defaultColWidth')
  widths = new Map(
    [...widths].filter(([column, width]) => {
      let current = defaultWidth === undefined ? undefined : Number(defaultWidth),
        hidden = false
      for (const node of columns) {
        const from = nativeInteger(node.attrs.get('min'), '列 min') - 1
        const to = nativeInteger(node.attrs.get('max'), '列 max') - 1
        if (column < from || column > to) continue
        if (node.attrs.has('width')) current = Number(node.attrs.get('width'))
        if (node.attrs.has('hidden')) {
          const value = node.attrs.get('hidden')!
          if (!['0', '1', 'false', 'true'].includes(value)) fail('原生隐藏列状态无效')
          hidden = value === '1' || value === 'true'
        }
      }
      return !hidden && current !== width
    }),
  )
  if (!widths.size) return xml
  const patches: { start: number; end: number; value: string }[] = []
  for (const node of columns) {
    if (node.local !== 'col' || node.ns !== root.ns || node.children.length) fail('列定义结构无效')
    const start = nativeInteger(node.attrs.get('min'), '列 min') - 1
    const end = nativeInteger(node.attrs.get('max'), '列 max') - 1
    if (start < 0 || end < start || end >= 16384) fail('列定义范围无效')
    const selected = [...widths.keys()]
      .filter((column) => column >= start && column <= end)
      .toSorted((a, b) => a - b)
    if (!selected.length) continue
    if (xml.slice(node.openEnd, node.closeStart).trim()) fail('列定义含未知内容')
    const original = xml.slice(node.start, node.end)
    const render = (from: number, to: number, width?: number) => {
      let value = setAttribute(
        setAttribute(original, 'min', String(from + 1)),
        'max',
        String(to + 1),
      )
      if (width !== undefined)
        value = setAttribute(setAttribute(value, 'width', String(width)), 'customWidth', '1')
      return value
    }
    let cursor = start,
      value = ''
    for (const column of selected) {
      covered.add(column)
      if (cursor < column) value += render(cursor, column - 1)
      value += render(column, column, widths.get(column))
      cursor = column + 1
    }
    if (cursor <= end) value += render(cursor, end)
    patches.push({ start: node.start, end: node.end, value })
  }
  const additions = [...widths]
    .filter(([column]) => !covered.has(column))
    .toSorted(([a], [b]) => a - b)
    .map(
      ([column, width]) =>
        `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('')
  if (container) {
    if (container.ns !== root.ns) fail('cols 命名空间无效')
    if (xml.slice(container.start, container.openEnd).endsWith('/>')) {
      patches.push({
        start: container.start,
        end: container.end,
        value: `<cols>${additions}</cols>`,
      })
    } else if (additions)
      patches.push({ start: container.closeStart, end: container.closeStart, value: additions })
  } else {
    const before = root.children.find(
      (node) => !['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr'].includes(node.local),
    )
    const position = before?.start ?? root.closeStart
    patches.push({ start: position, end: position, value: `<cols>${additions}</cols>` })
  }
  return patches
    .toSorted((a, b) => b.start - a.start)
    .reduce(
      (result, patch) => result.slice(0, patch.start) + patch.value + result.slice(patch.end),
      xml,
    )
}
