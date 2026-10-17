import {
  formatAddress,
  parseRange,
  type RangeBounds,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  FORMULA_REFERENCE_PATTERN,
  translateSharedFormula,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import { readXlsxRangeXmlTree, rewriteXlsxRangeFormulas } from './xlsx-range-structures.js'
import { xlsxRuleStaticReferences } from './xlsx-rule-footprint.js'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const MAX_RECTANGLES = 512
const MAX_FRAGMENTS = 8192
const MAX_RULES = 4096
function fail(detail: string): never {
  throw new Error(`范围条件格式/验证无法安全迁移：${detail}；文档未修改`)
}
export interface XlsxRuleBudget {
  remaining: number
}
const spend = (budget: XlsxRuleBudget, count = 1) => {
  budget.remaining -= count
  if (budget.remaining < 0) fail('矩形或公式运算超过预算')
}
function bounded(rect: RangeBounds): RangeBounds {
  if (
    !Object.values(rect).every(Number.isSafeInteger) ||
    rect.startRow < 0 ||
    rect.startColumn < 0 ||
    rect.endRow < rect.startRow ||
    rect.endColumn < rect.startColumn ||
    rect.endRow >= 1_048_576 ||
    rect.endColumn >= 16_384
  )
    fail('规则矩形超出工作表边界')
  return rect
}
export function intersectXlsxRuleRects(a: RangeBounds, b: RangeBounds): RangeBounds | undefined {
  const rect = {
    startRow: Math.max(a.startRow, b.startRow),
    endRow: Math.min(a.endRow, b.endRow),
    startColumn: Math.max(a.startColumn, b.startColumn),
    endColumn: Math.min(a.endColumn, b.endColumn),
  }
  return rect.startRow <= rect.endRow && rect.startColumn <= rect.endColumn ? rect : undefined
}
/** At most four rectangles, including for full-column rules; no cell enumeration. */
export function subtractXlsxRuleRect(rect: RangeBounds, cut: RangeBounds): RangeBounds[] {
  const hit = intersectXlsxRuleRects(rect, cut)
  if (!hit) return [rect]
  return [
    { ...rect, endRow: hit.startRow - 1 },
    { ...rect, startRow: hit.endRow + 1 },
    { ...hit, startColumn: rect.startColumn, endColumn: hit.startColumn - 1 },
    { ...hit, startColumn: hit.endColumn + 1, endColumn: rect.endColumn },
  ].filter((part) => part.startRow <= part.endRow && part.startColumn <= part.endColumn)
}
const order = (a: RangeBounds, b: RangeBounds) =>
  a.startRow - b.startRow ||
  a.startColumn - b.startColumn ||
  a.endRow - b.endRow ||
  a.endColumn - b.endColumn
const sameRect = (a: RangeBounds, b: RangeBounds) => order(a, b) === 0
export function shiftXlsxRuleRect(rect: RangeBounds, dr: number, dc: number): RangeBounds {
  return bounded({
    startRow: rect.startRow + dr,
    endRow: rect.endRow + dr,
    startColumn: rect.startColumn + dc,
    endColumn: rect.endColumn + dc,
  })
}
/** Deterministic disjoint union, merging only shared complete edges. */
export function normalizeXlsxRuleRects(
  input: readonly RangeBounds[],
  budget: XlsxRuleBudget = { remaining: 200_000 },
): RangeBounds[] {
  if (input.length > MAX_FRAGMENTS) fail('规则矩形数量超过预算')
  let output: RangeBounds[] = []
  for (const rect of input.toSorted(order)) {
    bounded(rect)
    let additions = [rect]
    for (const previous of output) {
      spend(budget, additions.length)
      additions = additions.flatMap((part) => subtractXlsxRuleRect(part, previous))
      if (additions.length + output.length > MAX_FRAGMENTS) fail('规则分片超过预算')
    }
    output.push(...additions)
  }
  let merged = true
  while (merged) {
    merged = false
    output.sort(order)
    outer: for (let i = 0; i < output.length; i++)
      for (let j = i + 1; j < output.length; j++) {
        spend(budget)
        const a = output[i]!,
          b = output[j]!
        if (
          (a.startRow === b.startRow &&
            a.endRow === b.endRow &&
            a.endColumn + 1 === b.startColumn) ||
          (a.startColumn === b.startColumn &&
            a.endColumn === b.endColumn &&
            a.endRow + 1 === b.startRow)
        ) {
          output[i] = {
            startRow: a.startRow,
            startColumn: a.startColumn,
            endRow: Math.max(a.endRow, b.endRow),
            endColumn: Math.max(a.endColumn, b.endColumn),
          }
          output.splice(j, 1)
          merged = true
          break outer
        }
      }
  }
  return output.toSorted(order)
}
function subtractAll(
  rects: readonly RangeBounds[],
  cuts: readonly RangeBounds[],
  budget: XlsxRuleBudget,
) {
  let output = [...rects]
  for (const cut of cuts) {
    spend(budget, output.length)
    output = output.flatMap((rect) => subtractXlsxRuleRect(rect, cut))
    if (output.length > MAX_FRAGMENTS) fail('规则分片超过预算')
  }
  return normalizeXlsxRuleRects(output, budget)
}

/** Supplied by the existing bounded native reader; no second XML decoder is introduced. */
export interface XlsxRuleXmlNode {
  tag: string
  local: string
  ns: string
  namespaces: ReadonlyMap<string, string>
  attrs: ReadonlyMap<string, string>
  start: number
  openEnd: number
  closeStart: number
  end: number
  children: readonly XlsxRuleXmlNode[]
}
export interface XlsxRuleReference {
  sheet?: string
  start: { row: number; column: number; rowAbsolute: boolean; columnAbsolute: boolean }
  end: { row: number; column: number; rowAbsolute: boolean; columnAbsolute: boolean }
}
export interface XlsxRuleSheet {
  entry: string
  name: string
  xml: string
}
export interface XlsxRangeRuleRequest {
  sheets: readonly XlsxRuleSheet[]
  source: { entry: string; bounds: RangeBounds }
  target: { entry: string; bounds: RangeBounds }
  move: boolean
  /** Private special paste mode; absent retains ordinary CF+DV migration. */
  kinds?: readonly ('cf' | 'dv')[]
  tiles?: readonly RangeBounds[]
  stylesXml?: string
  /** Merge/link planner output; native rule bytes must still match the frozen source. */
  candidateBases?: ReadonlyMap<string, string>
}
export interface XlsxRangeRuleReaders {
  readXml(xml: string): XlsxRuleXmlNode
  references(formula: string): readonly XlsxRuleReference[]
  /** Existing cell-reference movement, including source qualification for cross-sheet cut. */
  moveFormula(formula: string, context: string, relocatedFrom?: string): string
}
export function xlsxNativeRuleReaders(
  moveFormula?: XlsxRangeRuleReaders['moveFormula'],
): XlsxRangeRuleReaders {
  return {
    readXml: readXlsxRangeXmlTree,
    references: xlsxRuleStaticReferences,
    moveFormula: moveFormula ?? (() => fail('剪切公式迁移器缺失')),
  }
}
interface RuleGroup {
  kind: 'cf' | 'dv'
  node: XlsxRuleXmlNode
  ranges: RangeBounds[]
  formulas: { node: XlsxRuleXmlNode; value: string; attribute: boolean }[]
  rules: readonly XlsxRuleXmlNode[]
}
interface NativeSheet extends XlsxRuleSheet {
  root: XlsxRuleXmlNode
  groups: RuleGroup[]
  dv?: XlsxRuleXmlNode
}
interface Fragment {
  group: RuleGroup
  ranges: RangeBounds[]
  xml: string
  cloned: boolean
  priorities: Map<number, number>
}
interface Patch {
  start: number
  end: number
  value: string
}
function patch(xml: string, patches: readonly Patch[]): string {
  return patches
    .toSorted((a, b) => b.start - a.start || b.end - a.end)
    .reduce((text, item) => text.slice(0, item.start) + item.value + text.slice(item.end), xml)
}
const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\t', '&#9;')
    .replaceAll('\r', '&#13;')
    .replaceAll('\n', '&#10;')
function setAttribute(open: string, name: string, value: string): string {
  const quoted = escapeAttribute(value)
  for (const match of open.matchAll(/([^\s=/>]+)(\s*=\s*)(?:"[^"]*"|'[^']*')/g)) {
    if (match[1] !== name) continue
    return (
      open.slice(0, match.index) +
      name +
      match[2] +
      `"${quoted}"` +
      open.slice(match.index + match[0].length)
    )
  }
  return open.replace(/\/?>(?![\s\S])/, (end) => ` ${name}="${quoted}"${end}`)
}
function attributes(node: XlsxRuleXmlNode, allowed: readonly string[]) {
  for (const name of node.attrs.keys())
    if (name !== 'xmlns' && !name.startsWith('xmlns:') && !allowed.includes(name))
      fail(`未知 ${node.local} 属性 ${name}`)
}
function booleanAttributes(node: XlsxRuleXmlNode, names: readonly string[]) {
  for (const name of names) {
    const value = node.attrs.get(name)
    if (value !== undefined && !['0', '1', 'false', 'true'].includes(value))
      fail(`${node.local}.${name} 布尔值无效`)
  }
}
function integer(value: string | undefined, name: string, min = 0): number {
  if (
    value === undefined ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min
  )
    fail(`${name} 无效`)
  return Number(value)
}
function sqref(value: string | undefined, budget: XlsxRuleBudget): RangeBounds[] {
  const parts = value?.trim().split(/\s+/) ?? []
  if (!parts.length || parts.length > MAX_RECTANGLES) fail('规则 sqref 缺失或超过512矩形')
  const ranges = parts.map((part) => {
    if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/.test(part))
      fail('规则 sqref 无效')
    return bounded(parseRange(part.replaceAll('$', '')))
  })
  for (let i = 0; i < ranges.length; i++)
    for (let j = i + 1; j < ranges.length; j++) {
      spend(budget)
      if (intersectXlsxRuleRects(ranges[i]!, ranges[j]!)) fail('同一规则 sqref 重复或重叠')
    }
  return ranges
}
function emptyOutsideChildren(xml: string, node: XlsxRuleXmlNode) {
  let cursor = node.openEnd,
    text = ''
  for (const child of node.children) {
    text += xml.slice(cursor, child.start)
    cursor = child.end
  }
  text += xml.slice(cursor, node.closeStart)
  if (text.replace(/<!--[\s\S]*?-->/g, '').trim()) fail(`${node.local} 含未知字符数据`)
}
function formulaText(xml: string, node: XlsxRuleXmlNode): string {
  let value: string | undefined
  rewriteXlsxRangeFormulas(xml.slice(node.start, node.end), [node.tag], (text) => {
    value = text
    return text
  })
  if (!value?.trim()) fail(`${node.local} 公式为空或无效`)
  return value!
}
const CF_TYPES = new Set(
  'cellIs expression containsText notContainsText beginsWith endsWith duplicateValues uniqueValues top10 aboveAverage containsBlanks notContainsBlanks containsErrors notContainsErrors timePeriod colorScale dataBar iconSet'.split(
    ' ',
  ),
)
const OPERATORS =
  'between notBetween equal notEqual lessThan lessThanOrEqual greaterThan greaterThanOrEqual'.split(
    ' ',
  )
function readNativeSheet(
  sheet: XlsxRuleSheet,
  readers: XlsxRangeRuleReaders,
  dxfCount: number,
  budget: XlsxRuleBudget,
): NativeSheet {
  const root = readers.readXml(sheet.xml)
  if (root.ns !== MAIN || root.local !== 'worksheet') fail('工作表命名空间无效')
  const groups: RuleGroup[] = []
  const formulas = (node: XlsxRuleXmlNode, names: readonly string[]) => {
    const found: RuleGroup['formulas'] = []
    const visit = (current: XlsxRuleXmlNode) => {
      if (current.ns !== MAIN) fail('未知规则命名空间')
      if (names.includes(current.local)) {
        attributes(current, [])
        found.push({ node: current, value: formulaText(sheet.xml, current), attribute: false })
      } else if (current.local === 'cfvo' && current.attrs.get('type') === 'formula') {
        const value = current.attrs.get('val')
        if (!value?.trim()) fail('formula cfvo 缺少 val')
        found.push({ node: current, value: value!, attribute: true })
      }
      for (const child of current.children) visit(child)
    }
    visit(node)
    return found
  }
  const allPriorities = new Set<number>()
  for (const group of root.children.filter((node) => node.local === 'conditionalFormatting')) {
    if (group.ns !== MAIN) fail('条件格式命名空间无效')
    attributes(group, ['sqref', 'pivot'])
    booleanAttributes(group, ['pivot'])
    if (['1', 'true'].includes(group.attrs.get('pivot') ?? '')) fail('透视条件格式不支持范围迁移')
    emptyOutsideChildren(sheet.xml, group)
    if (!group.children.length) fail('空条件格式容器')
    for (const rule of group.children) {
      if (
        rule.ns !== MAIN ||
        rule.local !== 'cfRule' ||
        !CF_TYPES.has(rule.attrs.get('type') ?? '')
      )
        fail('未知条件格式类型')
      attributes(rule, [
        'type',
        'dxfId',
        'priority',
        'stopIfTrue',
        'operator',
        'text',
        'rank',
        'percent',
        'bottom',
        'aboveAverage',
        'equalAverage',
        'stdDev',
        'timePeriod',
      ])
      booleanAttributes(rule, ['stopIfTrue', 'percent', 'bottom', 'aboveAverage', 'equalAverage'])
      const priority = integer(rule.attrs.get('priority'), '条件格式 priority', 1)
      if (priority > 2_147_483_647 || allPriorities.has(priority))
        fail('条件格式 priority 重复或越界')
      allPriorities.add(priority)
      if (rule.attrs.has('dxfId') && integer(rule.attrs.get('dxfId'), 'dxfId') >= dxfCount)
        fail('dxfId 没有实际样式身份')
      for (const name of ['rank', 'stdDev'])
        if (rule.attrs.has(name))
          integer(rule.attrs.get(name), `条件格式 ${name}`, name === 'rank' ? 1 : 0)
      if (
        rule.attrs.has('timePeriod') &&
        ![
          'today',
          'yesterday',
          'tomorrow',
          'last7Days',
          'thisMonth',
          'lastMonth',
          'nextMonth',
          'thisWeek',
          'lastWeek',
          'nextWeek',
        ].includes(rule.attrs.get('timePeriod')!)
      )
        fail('未知条件格式 timePeriod')
      const operator = rule.attrs.get('operator')
      if (operator !== undefined && !OPERATORS.includes(operator)) fail('未知条件格式 operator')
      emptyOutsideChildren(sheet.xml, rule)
      const validateChild = (node: XlsxRuleXmlNode): void => {
        if (node.ns !== MAIN) fail('未知条件格式子节点命名空间')
        if (node.local === 'formula') {
          attributes(node, [])
          formulaText(sheet.xml, node)
          return
        }
        const allowed: Record<string, string[]> = {
          colorScale: [],
          dataBar: ['minLength', 'maxLength', 'showValue'],
          iconSet: ['iconSet', 'showValue', 'percent', 'reverse'],
          cfvo: ['type', 'val', 'gte'],
          color: ['auto', 'indexed', 'rgb', 'theme', 'tint'],
        }
        if (!allowed[node.local]) fail(`未知条件格式子节点 ${node.local}`)
        attributes(node, allowed[node.local]!)
        booleanAttributes(node, ['showValue', 'percent', 'reverse', 'gte', 'auto'])
        emptyOutsideChildren(sheet.xml, node)
        if (['cfvo', 'color'].includes(node.local) && node.children.length)
          fail('条件格式叶含未知子节点')
        if (node.local === 'cfvo') {
          if (
            !['num', 'min', 'max', 'percent', 'percentile', 'formula'].includes(
              node.attrs.get('type') ?? '',
            )
          )
            fail('未知 cfvo 类型')
          if (
            ['num', 'percent', 'percentile'].includes(node.attrs.get('type') ?? '') &&
            (!node.attrs.get('val')?.trim() || !Number.isFinite(Number(node.attrs.get('val'))))
          )
            fail('cfvo 数值无效')
          if (
            ['percent', 'percentile'].includes(node.attrs.get('type') ?? '') &&
            (Number(node.attrs.get('val')) < 0 || Number(node.attrs.get('val')) > 100)
          )
            fail('cfvo 百分比越界')
        }
        if (node.local === 'color') {
          const identities = ['auto', 'indexed', 'rgb', 'theme'].filter((name) =>
            node.attrs.has(name),
          )
          if (identities.length !== 1) fail('条件格式颜色身份缺失或不明确')
          if (node.attrs.has('rgb') && !/^[\da-fA-F]{8}$/.test(node.attrs.get('rgb')!))
            fail('条件格式 RGB 无效')
          for (const name of ['indexed', 'theme'])
            if (node.attrs.has(name)) integer(node.attrs.get(name), `颜色 ${name}`)
          if (
            node.attrs.has('tint') &&
            (!node.attrs.get('tint')?.trim() ||
              !Number.isFinite(Number(node.attrs.get('tint'))) ||
              Math.abs(Number(node.attrs.get('tint'))) > 1)
          )
            fail('颜色 tint 无效')
        }
        for (const child of node.children) {
          if (!['cfvo', 'color'].includes(child.local)) fail('条件格式阈值子节点无效')
          validateChild(child)
        }
      }
      for (const child of rule.children) {
        if (!['formula', 'colorScale', 'dataBar', 'iconSet'].includes(child.local))
          fail('条件格式规则直属子节点无效')
        validateChild(child)
      }
      const type = rule.attrs.get('type')!,
        nativeFormulas = rule.children.filter((node) => node.local === 'formula')
      if (
        (type === 'expression' && nativeFormulas.length !== 1) ||
        (type === 'cellIs' &&
          nativeFormulas.length !==
            (['between', 'notBetween'].includes(operator ?? 'between') ? 2 : 1))
      )
        fail('条件格式公式数量无效')
      for (const container of ['colorScale', 'dataBar', 'iconSet']) {
        const children = rule.children.filter((node) => node.local === container)
        if (type === container && (children.length !== 1 || rule.children.length !== 1))
          fail('条件格式阈值结构无效')
        if (type !== container && children.length) fail('条件格式类型与阈值结构不符')
        const node = children[0]
        if (node) {
          const thresholds = node.children.filter((child) => child.local === 'cfvo').length,
            colors = node.children.filter((child) => child.local === 'color').length
          if (container === 'colorScale' && (![2, 3].includes(thresholds) || colors !== thresholds))
            fail('色阶阈值或颜色数量无效')
          if (container === 'dataBar') {
            if (thresholds !== 2 || colors !== 1) fail('数据条阈值或颜色数量无效')
            for (const name of ['minLength', 'maxLength'])
              if (node.attrs.has(name) && integer(node.attrs.get(name), `数据条 ${name}`) > 100)
                fail('数据条长度越界')
            if (
              Number(node.attrs.get('minLength') ?? 10) > Number(node.attrs.get('maxLength') ?? 90)
            )
              fail('数据条最小长度大于最大长度')
          }
          if (container === 'iconSet') {
            const name = node.attrs.get('iconSet') ?? '3TrafficLights1'
            if (
              ![
                '3Arrows',
                '3ArrowsGray',
                '3Flags',
                '3TrafficLights1',
                '3TrafficLights2',
                '3Signs',
                '3Symbols',
                '3Symbols2',
                '4Arrows',
                '4ArrowsGray',
                '4RedToBlack',
                '4Rating',
                '4TrafficLights',
                '5Arrows',
                '5ArrowsGray',
                '5Rating',
                '5Quarters',
              ].includes(name)
            )
              fail('未知图标集')
            if (colors || thresholds !== Number(name[0])) fail('图标集阈值数量无效')
          }
          if (
            node.children.some(
              (child, index) => child.local !== (index < thresholds ? 'cfvo' : 'color'),
            )
          )
            fail('条件格式阈值顺序无效')
        }
      }
    }
    groups.push({
      kind: 'cf',
      node: group,
      ranges: sqref(group.attrs.get('sqref'), budget),
      formulas: formulas(group, ['formula']),
      rules: group.children,
    })
  }
  const containers = root.children.filter((node) => node.local === 'dataValidations')
  if (containers.length > 1) fail('dataValidations 重复')
  const dv = containers[0]
  if (dv) {
    if (dv.ns !== MAIN) fail('验证容器命名空间无效')
    attributes(dv, ['count', 'disablePrompts', 'xWindow', 'yWindow'])
    booleanAttributes(dv, ['disablePrompts'])
    emptyOutsideChildren(sheet.xml, dv)
    if (
      !dv.children.length ||
      (dv.attrs.has('count') && integer(dv.attrs.get('count'), '验证 count') !== dv.children.length)
    )
      fail('验证 count 或空容器无效')
    for (const node of dv.children) {
      if (node.ns !== MAIN || node.local !== 'dataValidation') fail('验证子节点无效')
      attributes(node, [
        'type',
        'operator',
        'allowBlank',
        'showInputMessage',
        'showErrorMessage',
        'errorStyle',
        'promptTitle',
        'prompt',
        'errorTitle',
        'error',
        'showDropDown',
        'imeMode',
        'sqref',
      ])
      booleanAttributes(node, [
        'allowBlank',
        'showInputMessage',
        'showErrorMessage',
        'showDropDown',
      ])
      emptyOutsideChildren(sheet.xml, node)
      const type = node.attrs.get('type') ?? 'none',
        operator = node.attrs.get('operator') ?? 'between'
      if (
        !['none', 'list', 'custom', 'decimal', 'whole', 'date', 'time', 'textLength'].includes(type)
      )
        fail('未知验证类型')
      if (!OPERATORS.includes(operator)) fail('未知验证 operator')
      if (!['stop', 'warning', 'information'].includes(node.attrs.get('errorStyle') ?? 'stop'))
        fail('未知验证错误样式')
      if (
        node.attrs.has('imeMode') &&
        ![
          'noControl',
          'off',
          'on',
          'disabled',
          'hiragana',
          'fullKatakana',
          'halfKatakana',
          'fullAlpha',
          'halfAlpha',
          'fullHangul',
          'halfHangul',
        ].includes(node.attrs.get('imeMode')!)
      )
        fail('未知验证 imeMode')
      if (node.children.some((child) => !['formula1', 'formula2'].includes(child.local)))
        fail('未知验证子节点')
      const first = node.children.filter((child) => child.local === 'formula1').length,
        second = node.children.filter((child) => child.local === 'formula2').length
      if (
        first > 1 ||
        second > 1 ||
        (type === 'none' && node.children.length) ||
        (type !== 'none' && first !== 1) ||
        (['list', 'custom'].includes(type) && second) ||
        (!['none', 'list', 'custom'].includes(type) &&
          second !== (['between', 'notBetween'].includes(operator) ? 1 : 0))
      )
        fail('验证公式数量无效')
      groups.push({
        kind: 'dv',
        node,
        ranges: sqref(node.attrs.get('sqref'), budget),
        formulas: formulas(node, ['formula1', 'formula2']),
        rules: [],
      })
    }
    const validations = groups
      .filter((group) => group.kind === 'dv')
      .flatMap((group) => group.ranges)
    for (let i = 0; i < validations.length; i++)
      for (let j = i + 1; j < validations.length; j++) {
        spend(budget)
        if (intersectXlsxRuleRects(validations[i]!, validations[j]!))
          fail('多个数据验证规则重复或重叠')
      }
  }
  if (groups.length + allPriorities.size > MAX_RULES) fail('规则数量超过预算')
  return { ...sheet, root, groups, dv }
}

function formulaShift(formula: string, from: RangeBounds, to: RangeBounds): string {
  const dr = to.startRow - from.startRow,
    dc = to.startColumn - from.startColumn
  if (!dr && !dc) return formula
  return formula
    .split('"')
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            new RegExp(FORMULA_REFERENCE_PATTERN.source, 'giu'),
            (_all, lead: string, qualifier: string | undefined, token: string) => {
              const shifted = translateSharedFormula(token.toUpperCase(), dr, dc)
              if (shifted === null) fail('规则相对引用平移超出工作表边界')
              return `${lead}${qualifier === undefined ? '' : qualifier + '!'}${shifted}`
            },
          ),
    )
    .join('"')
}
function assertSplittableRule(group: RuleGroup, count: number) {
  if (
    count > 1 &&
    group.rules.some((rule) =>
      [
        'colorScale',
        'dataBar',
        'iconSet',
        'duplicateValues',
        'uniqueValues',
        'top10',
        'aboveAverage',
      ].includes(rule.attrs.get('type') ?? ''),
    )
  )
    fail('统计型条件格式需要保持完整规则域，依赖迁移无法表示为多个独立规则')
}
function partitionForMove(
  ranges: readonly RangeBounds[],
  group: RuleGroup,
  sheet: NativeSheet,
  request: XlsxRangeRuleRequest,
  readers: XlsxRangeRuleReaders,
  budget: XlsxRuleBudget,
): RangeBounds[] {
  const sourceName = request.sheets
    .find((candidate) => candidate.entry === request.source.entry)!
    .name.toLocaleLowerCase()
  const refs = group.formulas
    .flatMap((formula) => readers.references(formula.value))
    .filter((ref) => (ref.sheet ?? sheet.name).toLocaleLowerCase() === sourceName)
  const anchor = group.ranges[0]!,
    source = request.source.bounds
  const output: RangeBounds[] = []
  for (const range of ranges) {
    const rows = new Set([range.startRow, range.endRow + 1]),
      columns = new Set([range.startColumn, range.endColumn + 1])
    for (const ref of refs)
      for (const endpoint of [ref.start, ref.end]) {
        spend(budget, 2)
        if (!endpoint.rowAbsolute)
          for (const edge of [source.startRow, source.endRow + 1]) {
            const at = edge - endpoint.row + anchor.startRow
            if (at > range.startRow && at <= range.endRow) rows.add(at)
          }
        if (!endpoint.columnAbsolute)
          for (const edge of [source.startColumn, source.endColumn + 1]) {
            const at = edge - endpoint.column + anchor.startColumn
            if (at > range.startColumn && at <= range.endColumn) columns.add(at)
          }
      }
    const rowEdges = [...rows].toSorted((a, b) => a - b),
      columnEdges = [...columns].toSorted((a, b) => a - b)
    spend(budget, (rowEdges.length - 1) * (columnEdges.length - 1))
    if (output.length + (rowEdges.length - 1) * (columnEdges.length - 1) > MAX_FRAGMENTS)
      fail('规则依赖分片超过预算')
    for (let r = 0; r < rowEdges.length - 1; r++)
      for (let c = 0; c < columnEdges.length - 1; c++)
        output.push({
          startRow: rowEdges[r]!,
          endRow: rowEdges[r + 1]! - 1,
          startColumn: columnEdges[c]!,
          endColumn: columnEdges[c + 1]! - 1,
        })
  }
  return output
}

function hasMoveDependency(
  group: RuleGroup,
  sheet: NativeSheet,
  request: XlsxRangeRuleRequest,
  readers: XlsxRangeRuleReaders,
  budget: XlsxRuleBudget,
): boolean {
  const sourceName = request.sheets
    .find((candidate) => candidate.entry === request.source.entry)!
    .name.toLocaleLowerCase()
  const anchor = group.ranges[0]!
  for (const formula of group.formulas)
    for (const ref of readers.references(formula.value)) {
      if ((ref.sheet ?? sheet.name).toLocaleLowerCase() !== sourceName) continue
      for (const range of group.ranges) {
        spend(budget)
        const extent = (axis: 'row' | 'column') => {
          const key = axis === 'row' ? 'rowAbsolute' : 'columnAbsolute'
          const lower =
            axis === 'row'
              ? range.startRow - anchor.startRow
              : range.startColumn - anchor.startColumn
          const upper =
            axis === 'row' ? range.endRow - anchor.startRow : range.endColumn - anchor.startColumn
          return {
            min: Math.min(
              ...[ref.start, ref.end].map((point) => point[axis] + (point[key] ? 0 : lower)),
            ),
            max: Math.max(
              ...[ref.start, ref.end].map((point) => point[axis] + (point[key] ? 0 : upper)),
            ),
          }
        }
        const rows = extent('row'),
          cols = extent('column')
        const hit = intersectXlsxRuleRects(
          { startRow: rows.min, endRow: rows.max, startColumn: cols.min, endColumn: cols.max },
          request.source.bounds,
        )
        if (hit) {
          if (
            (ref.start.row === 0 && ref.end.row === 1_048_575) ||
            (ref.start.column === 0 && ref.end.column === 16_383)
          )
            fail('整行/整列公式引用与剪切范围相交，无法表达为普通引用迁移')
          return true
        }
      }
    }
  return false
}
function renderFragment(
  sheet: NativeSheet,
  group: RuleGroup,
  ranges: RangeBounds[],
  transform: (formula: string) => string,
  cloned: boolean,
): Fragment {
  const node = group.node,
    raw = sheet.xml.slice(node.start, node.end),
    patches: Patch[] = []
  let open = sheet.xml.slice(node.start, node.openEnd)
  const ref = ranges
    .map((range) => {
      const start = formatAddress(range.startRow, range.startColumn),
        end = formatAddress(range.endRow, range.endColumn)
      return start === end ? start : start + ':' + end
    })
    .join(' ')
  const sameRanges =
    ranges.length === group.ranges.length &&
    ranges.every((range, index) => sameRect(range, group.ranges[index]!))
  if (!sameRanges) open = setAttribute(open, 'sqref', ref)
  if (cloned)
    for (const [prefix, uri] of node.namespaces) {
      const name = prefix ? 'xmlns:' + prefix : 'xmlns'
      if (prefix !== 'xml' && !node.attrs.has(name)) open = setAttribute(open, name, uri)
    }
  if (open !== raw.slice(0, node.openEnd - node.start))
    patches.push({ start: 0, end: node.openEnd - node.start, value: open })
  for (const formula of group.formulas) {
    const value = transform(formula.value)
    if (value === formula.value) continue
    const original = sheet.xml.slice(formula.node.start, formula.node.end)
    const rewritten = formula.attribute
      ? setAttribute(sheet.xml.slice(formula.node.start, formula.node.openEnd), 'val', value) +
        sheet.xml.slice(formula.node.openEnd, formula.node.end)
      : rewriteXlsxRangeFormulas(original, [formula.node.tag], () => value)
    patches.push({
      start: formula.node.start - node.start,
      end: formula.node.end - node.start,
      value: rewritten,
    })
  }
  return { group, ranges, xml: patch(raw, patches), cloned, priorities: new Map() }
}
function assignPriorities(fragments: Fragment[], budget: XlsxRuleBudget) {
  const retained = fragments.filter((fragment) => !fragment.cloned && fragment.group.kind === 'cf')
  const copied = fragments.filter((fragment) => fragment.cloned && fragment.group.kind === 'cf')
  const items = (list: Fragment[]) =>
    list
      .flatMap((fragment) =>
        fragment.group.rules.map((rule) => ({
          fragment,
          rule,
          old: Number(rule.attrs.get('priority')),
        })),
      )
      .toSorted((a, b) => a.old - b.old)
  let last = 0
  for (const item of [...items(retained), ...items(copied)]) {
    spend(budget)
    const priority = item.fragment.cloned ? last + 1 : Math.max(last + 1, item.old)
    if (priority > 2_147_483_647) fail('条件格式 priority 超出预算')
    item.fragment.priorities.set(item.rule.start, priority)
    last = priority
  }
  for (const fragment of fragments.filter((part) => part.group.kind === 'cf')) {
    // Formula and sqref edits may shift offsets, so read this actual fragment again at publication.
    if (fragment.priorities.size !== fragment.group.rules.length)
      fail('条件格式 priority 规划不完整')
  }
}
function withPriorities(fragment: Fragment, readers: XlsxRangeRuleReaders): string {
  if (fragment.group.kind !== 'cf') return fragment.xml
  // The fragment may rely on worksheet namespace bindings. Supply them on a temporary wrapper.
  const wrapper = `<worksheet ${[...fragment.group.node.namespaces]
    .filter(([prefix]) => prefix !== 'xml')
    .map(([prefix, uri]) => `${prefix ? 'xmlns:' + prefix : 'xmlns'}="${escapeAttribute(uri)}"`)
    .join(' ')}>`
  const root = readers.readXml(wrapper + fragment.xml + '</worksheet>')
  const group = root.children[0]
  if (!group || group.children.length !== fragment.group.rules.length)
    fail('实际条件格式规则数量发生变化')
  const patches: Patch[] = []
  group.children.forEach((rule, index) => {
    const priority = fragment.priorities.get(fragment.group.rules[index]!.start)!
    if (Number(rule.attrs.get('priority')) !== priority)
      patches.push({
        start: rule.start - wrapper.length,
        end: rule.openEnd - wrapper.length,
        value: setAttribute(
          (wrapper + fragment.xml).slice(rule.start, rule.openEnd),
          'priority',
          String(priority),
        ),
      })
  })
  return patch(fragment.xml, patches)
}
function patchRuleSheet(
  sheet: NativeSheet,
  fragments: Fragment[],
  readers: XlsxRangeRuleReaders,
): string {
  const patches: Patch[] = []
  const byGroup = new Map<RuleGroup, string[]>()
  for (const fragment of fragments.filter((item) => !item.cloned)) {
    const values = byGroup.get(fragment.group) ?? []
    values.push(withPriorities(fragment, readers))
    byGroup.set(fragment.group, values)
  }
  for (const group of sheet.groups) {
    const value = (byGroup.get(group) ?? []).join('')
    if (value !== sheet.xml.slice(group.node.start, group.node.end))
      patches.push({ start: group.node.start, end: group.node.end, value })
  }
  const copiedCf = fragments
    .filter((fragment) => fragment.cloned && fragment.group.kind === 'cf')
    .map((fragment) => withPriorities(fragment, readers))
    .join('')
  const copiedDv = fragments
    .filter((fragment) => fragment.cloned && fragment.group.kind === 'dv')
    .map((fragment) => fragment.xml)
    .join('')
  const later = new Set([
    'dataValidations',
    'hyperlinks',
    'printOptions',
    'pageMargins',
    'pageSetup',
    'headerFooter',
    'rowBreaks',
    'colBreaks',
    'customProperties',
    'cellWatches',
    'ignoredErrors',
    'smartTags',
    'drawing',
    'legacyDrawing',
    'legacyDrawingHF',
    'picture',
    'oleObjects',
    'controls',
    'webPublishItems',
    'tableParts',
    'extLst',
  ])
  if (copiedCf) {
    const at =
      sheet.root.children.find((node) => later.has(node.local))?.start ?? sheet.root.closeStart
    patches.push({ start: at, end: at, value: copiedCf })
  }
  const count = fragments.filter((fragment) => fragment.group.kind === 'dv').length
  if (sheet.dv) {
    if (!count) {
      const parent = sheet.dv
      for (let i = patches.length - 1; i >= 0; i--)
        if (patches[i]!.start >= parent.openEnd && patches[i]!.end <= parent.closeStart)
          patches.splice(i, 1)
      patches.push({ start: parent.start, end: parent.end, value: '' })
    } else {
      const open = sheet.xml.slice(sheet.dv.start, sheet.dv.openEnd)
      if (sheet.dv.attrs.has('count') && Number(sheet.dv.attrs.get('count')) !== count)
        patches.push({
          start: sheet.dv.start,
          end: sheet.dv.openEnd,
          value: setAttribute(open, 'count', String(count)),
        })
      if (copiedDv)
        patches.push({ start: sheet.dv.closeStart, end: sheet.dv.closeStart, value: copiedDv })
    }
  } else if (copiedDv) {
    const at =
      sheet.root.children.find((node) => later.has(node.local))?.start ?? sheet.root.closeStart
    const value = `<dataValidations xmlns="${MAIN}" count="${count}">${copiedDv}</dataValidations>`
    // Combine same-offset inserts so schema order remains CF, DV, hyperlinks.
    const existing = patches.find((item) => item.start === at && item.end === at)
    if (existing) existing.value += value
    else patches.push({ start: at, end: at, value })
  }
  return patch(sheet.xml, patches)
}
const permits = new WeakMap<
  object,
  { entry: string; xml: string; ranges: readonly RangeBounds[] }[]
>()
export function hasXlsxRangeRulePermit(
  permit: object | undefined,
  entry: string,
  xml: string,
  ranges: readonly RangeBounds[],
): boolean {
  const signed =
    permit && permits.get(permit)?.find((item) => item.entry === entry && item.xml === xml)
  return (
    !!signed &&
    ranges.length > 0 &&
    ranges.every((range) => signed.ranges.some((allowed) => sameRect(range, allowed)))
  )
}
export interface XlsxRangeRulePlan {
  replacements: Map<string, string>
  /** Rectangles classify existing stored values; only the bounded operation target is enumerated. */
  validationAreas: Map<string, RangeBounds[]>
  permit: object
}
interface ValidationCoverage {
  areas: ReadonlyMap<string, readonly RangeBounds[]>
  target: { entry: string; bounds: RangeBounds }
}
const validationCoverage = new WeakMap<Uint8Array, ValidationCoverage>()
/** Server-private capability bound to this exact candidate; never transported by the public DSL. */
export function bindXlsxRangeValidation(
  bytes: Uint8Array,
  plan: XlsxRangeRulePlan,
  target: { entry: string; bounds: RangeBounds },
): void {
  if (plan.validationAreas.size)
    validationCoverage.set(bytes, { areas: plan.validationAreas, target })
}
export function xlsxRangeValidationCoverage(bytes: Uint8Array): ValidationCoverage | undefined {
  return validationCoverage.get(bytes)
}
/** Frozen source snapshot, destination overwrite and source-cut removal form one native candidate. */
export function planXlsxRangeRules(
  request: XlsxRangeRuleRequest,
  readers: XlsxRangeRuleReaders,
): XlsxRangeRulePlan {
  const budget = { remaining: 200_000 }
  const from = { ...bounded(request.source.bounds) },
    to = { ...bounded(request.target.bounds) }
  const height = from.endRow - from.startRow + 1,
    width = from.endColumn - from.startColumn + 1
  if (
    (to.endRow - to.startRow + 1) % height !== 0 ||
    (to.endColumn - to.startColumn + 1) % width !== 0 ||
    (to.endRow - to.startRow + 1) * (to.endColumn - to.startColumn + 1) > 2000 ||
    height * width > 2000
  )
    fail('规则迁移仅支持源整数倍矩形且最多2000格')
  const tiles = request.tiles ?? [to],
    kinds = request.kinds ?? ['cf', 'dv']
  if (
    !tiles.length ||
    tiles.length > 2000 ||
    (request.move && (tiles.length !== 1 || kinds.length !== 2))
  )
    fail('规则平铺或剪切模式无效')
  const expected: RangeBounds[] = []
  for (let r = to.startRow; r <= to.endRow; r += height)
    for (let c = to.startColumn; c <= to.endColumn; c += width)
      expected.push({
        startRow: r,
        endRow: r + height - 1,
        startColumn: c,
        endColumn: c + width - 1,
      })
  if (
    expected.length !== tiles.length ||
    expected.some((tile, index) => !sameRect(tile, tiles[index]!))
  )
    fail('规则平铺必须完整覆盖目标且互不重叠')
  const sourceData = request.sheets.find((sheet) => sheet.entry === request.source.entry),
    targetData = request.sheets.find((sheet) => sheet.entry === request.target.entry)
  if (
    !sourceData ||
    !targetData ||
    new Set(request.sheets.map((sheet) => sheet.entry)).size !== request.sheets.length
  )
    fail('工作表身份缺失或重复')
  let dxfCount = 0
  if (request.stylesXml) {
    const styles = readers.readXml(request.stylesXml)
    if (styles.ns !== MAIN || styles.local !== 'styleSheet') fail('样式表命名空间无效')
    const dxfs = styles.children.filter((node) => node.local === 'dxfs')
    if (
      dxfs.length > 1 ||
      dxfs.some(
        (node) =>
          node.ns !== MAIN ||
          node.children.some((child) => child.ns !== MAIN || child.local !== 'dxf'),
      )
    )
      fail('dxf 身份无法唯一定位')
    dxfCount = dxfs[0]?.children.length ?? 0
    if (
      dxfs[0]?.attrs.has('count') &&
      integer(dxfs[0].attrs.get('count'), 'dxfs count') !== dxfCount
    )
      fail('dxfs count 无效')
  }
  const sheets = request.sheets
    .filter(
      (sheet) =>
        request.move ||
        sheet.entry === request.source.entry ||
        sheet.entry === request.target.entry,
    )
    .map((sheet) => {
      const base = request.candidateBases?.get(sheet.entry)
      if (base !== undefined && base !== sheet.xml) {
        const sections = (xml: string) =>
          readers
            .readXml(xml)
            .children.filter((node) =>
              ['conditionalFormatting', 'dataValidations'].includes(node.local),
            )
            .map((node) => xml.slice(node.start, node.end))
        if (JSON.stringify(sections(base)) !== JSON.stringify(sections(sheet.xml)))
          fail('结构候选改变了冻结规则原件')
      }
      return readNativeSheet({ ...sheet, xml: base ?? sheet.xml }, readers, dxfCount, budget)
    })
  const source = sheets.find((sheet) => sheet.entry === sourceData.entry)!,
    target = sheets.find((sheet) => sheet.entry === targetData.entry)!
  const replacements = new Map<string, string>(),
    validationAreas = new Map<string, RangeBounds[]>(),
    permit = Object.freeze({})
  permits.set(permit, [
    {
      entry: source.entry,
      xml: sourceData.xml,
      ranges: source.entry === target.entry ? [from, to] : [from],
    },
    ...(source.entry === target.entry
      ? []
      : [{ entry: target.entry, xml: targetData.xml, ranges: [to] }]),
  ])
  if (source.entry === target.entry && sameRect(from, to))
    return { replacements, validationAreas, permit }
  const fragments = new Map<NativeSheet, Fragment[]>()
  for (const sheet of sheets) {
    const result: Fragment[] = []
    for (const group of sheet.groups) {
      if (!kinds.includes(group.kind)) {
        result.push(renderFragment(sheet, group, group.ranges, (formula) => formula, false))
        continue
      }
      const cuts = [
        ...(sheet === target ? [to] : []),
        ...(request.move && sheet === source ? [from] : []),
      ]
      const hit = group.ranges.some((range) =>
        cuts.some((cut) => intersectXlsxRuleRects(range, cut)),
      )
      const remaining = hit ? subtractAll(group.ranges, cuts, budget) : group.ranges
      const depends = request.move && hasMoveDependency(group, sheet, request, readers, budget)
      if (!remaining.length) continue
      if (!hit && !depends) {
        result.push(renderFragment(sheet, group, remaining, (formula) => formula, false))
        continue
      }
      const dependencyTiles = depends
        ? partitionForMove(remaining, group, sheet, request, readers, budget)
        : [remaining[0]!]
      assertSplittableRule(group, dependencyTiles.length)
      for (const tile of dependencyTiles) {
        const ranges = depends ? [tile] : remaining
        let dependencyChanged = false
        const fragment = renderFragment(
          sheet,
          group,
          ranges,
          (formula) => {
            readers.references(formula)
            const shifted = formulaShift(formula, group.ranges[0]!, tile)
            const moved = request.move ? readers.moveFormula(shifted, sheet.name) : shifted
            if (moved !== shifted) dependencyChanged = true
            return moved
          },
          false,
        )
        result.push(fragment)
        if (group.kind === 'dv' && dependencyChanged)
          validationAreas.set(sheet.entry, [...(validationAreas.get(sheet.entry) ?? []), ...ranges])
      }
    }
    fragments.set(sheet, result)
  }
  const copied: Fragment[] = []
  for (const group of source.groups) {
    if (!kinds.includes(group.kind)) continue
    const intersections = group.ranges
      .map((range) => intersectXlsxRuleRects(range, from))
      .filter((range): range is RangeBounds => !!range)
    if (!intersections.length) continue
    const pieces = normalizeXlsxRuleRects(intersections, budget)
    const depends = request.move && hasMoveDependency(group, source, request, readers, budget)
    const sets = depends
      ? partitionForMove(pieces, group, source, request, readers, budget).map((tile) => [tile])
      : [pieces]
    assertSplittableRule(group, sets.length)
    for (const set of sets) {
      const tile = set[0]!,
        destinations = tiles.flatMap((destinationTile) =>
          set.map((part) =>
            shiftXlsxRuleRect(
              part,
              destinationTile.startRow - from.startRow,
              destinationTile.startColumn - from.startColumn,
            ),
          ),
        ),
        destination = destinations[0]!
      const fragment = renderFragment(
        source,
        group,
        destinations,
        (formula) => {
          readers.references(formula)
          return request.move
            ? readers.moveFormula(
                formulaShift(formula, group.ranges[0]!, tile),
                target.name,
                source.name,
              )
            : formulaShift(formula, group.ranges[0]!, destination)
        },
        true,
      )
      copied.push(fragment)
      if (group.kind === 'dv')
        validationAreas.set(target.entry, [
          ...(validationAreas.get(target.entry) ?? []),
          ...destinations,
        ])
    }
  }
  fragments.get(target)!.push(...copied)
  if ([...fragments.values()].reduce((count, parts) => count + parts.length, 0) > MAX_FRAGMENTS)
    fail('规则输出分片超过预算')
  for (const [sheet, parts] of fragments) {
    assignPriorities(parts, budget)
    const candidate = patchRuleSheet(sheet, parts, readers)
    if (candidate === sheet.xml) continue
    readNativeSheet({ ...sheet, xml: candidate }, readers, dxfCount, budget)
    if (Buffer.byteLength(candidate, 'utf8') > 4 * 1024 * 1024) fail('候选规则 XML 超过预算')
    replacements.set(sheet.entry, candidate)
  }
  for (const [entry, ranges] of validationAreas)
    validationAreas.set(entry, normalizeXlsxRuleRects(ranges, budget))
  return { replacements, validationAreas, permit }
}
