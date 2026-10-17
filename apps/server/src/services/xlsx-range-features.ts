import { assertRuleMoveFootprint, type RuleMoveContext } from './xlsx-rule-footprint.js'
import { hasXlsxRangeStructurePermit, xlsxRangeXmlTokens } from './xlsx-range-structures.js'
import { hasXlsxRangeRulePermit } from './xlsx-range-rules.js'
import {
  pivotXmlTree,
  type PivotXmlNode,
} from '../../../../packages/office/src/xlsx-pivot-editability.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import {
  parseRange,
  formatAddress,
  type RangeBounds,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006/relationships'
const EXCEL = 'urn:schemas-microsoft-com:office:excel'
const VML = 'urn:schemas-microsoft-com:vml'
interface Node extends PivotXmlNode {
  local: string
  ns: string
  namespaces: Record<string, string>
  children: Node[]
}
const fail = (detail: string): never => {
  throw new Error(`范围关联结构无法安全保留：${detail}`)
}
/** Bound the parser's recursive tree conversion before parsing any native part. */
function tree(xml: string): Node {
  if (Buffer.byteLength(xml, 'utf8') > 4 * 1024 * 1024) fail('XML 超过预算')
  let count = 0,
    depth = 0
  for (const [tag] of xlsxRangeXmlTokens(xml)) {
    if (tag.startsWith('<?') || tag.startsWith('<!')) continue
    if (tag.startsWith('</')) depth--
    else {
      if (++count > 200_000 || ++depth > 64) fail('XML 节点或深度超过预算')
      if (tag.endsWith('/>')) depth--
    }
  }
  const resolve = (node: PivotXmlNode, inherited: Record<string, string>): Node => {
    const namespaces: Record<string, string> = Object.assign(Object.create(null), inherited)
    for (const [name, value] of Object.entries(node.attrs))
      if (name === 'xmlns') namespaces[''] = value
      else if (name.startsWith('xmlns:')) namespaces[name.slice(6)] = value
    const parts = node.tag.split(':'),
      local = parts.at(-1)!,
      prefix = parts.length === 2 ? parts[0]! : ''
    if (parts.length > 2 || (prefix && !namespaces[prefix])) fail('未声明的命名空间')
    return {
      ...node,
      local,
      ns: namespaces[prefix] ?? '',
      namespaces,
      children: node.children.map((child) => resolve(child, namespaces)),
    }
  }
  return resolve(pivotXmlTree(xml), {})
}
const all = (node: Node): Node[] => [node, ...node.children.flatMap(all)]
const children = (node: Node, name: string) =>
  node.children.filter((child) => child.ns === MAIN && child.local === name)
function single(node: Node, name: string): Node {
  const found = children(node, name)
  if (found.length !== 1) fail(`${name} 缺失或重复`)
  return found[0]!
}
const overlap = (a: RangeBounds, b: RangeBounds) =>
  a.startRow <= b.endRow &&
  b.startRow <= a.endRow &&
  a.startColumn <= b.endColumn &&
  b.startColumn <= a.endColumn
function area(ref: string | undefined): RangeBounds {
  if (!ref || !/^\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?$/.test(ref))
    fail('原生 ref/sqref 缺失或无效')
  const result = parseRange(ref!)
  if (result.endRow >= 1_048_576 || result.endColumn >= 16_384) fail('原生引用超出工作表边界')
  return result
}
function check(ref: string | undefined, areas: RangeBounds[], multi = false) {
  const refs = multi ? (ref?.trim().split(/\s+/) ?? []) : [ref]
  if (!refs?.length || refs.length > 20_000) fail('原生引用缺失或超过预算')
  const seen = new Set<string>()
  for (const value of refs) {
    const bounds = area(value)
    const key = JSON.stringify(bounds)
    if (seen.has(key)) fail('原生引用重复')
    seen.add(key)
    if (areas.some((candidate) => overlap(candidate, bounds)))
      fail('范围与合并、链接、条件/验证、筛选、批注或表格相交，尚不支持迁移')
  }
}
function relationId(node: Node): string {
  const ids = Object.entries(node.attrs).filter(([name]) => {
    const [prefix, local] = name.split(':')
    return local === 'id' && node.namespaces[prefix!] === OFFICE
  })
  if (ids.length !== 1 || !ids[0]![1]) fail('关系 ID 缺失或重复')
  return ids[0]![1]
}
function rejectExtensions(root: Node) {
  for (const node of all(root))
    if (['extLst', 'AlternateContent'].includes(node.local)) fail('未知扩展语义')
}
interface Relation {
  id: string
  type: string
  path: string
  external: boolean
}
async function relations(zip: BoundedZip, entry: string): Promise<Relation[]> {
  const slash = entry.lastIndexOf('/'),
    xml = await zip.readText(`${entry.slice(0, slash)}/_rels/${entry.slice(slash + 1)}.rels`)
  if (!xml) return []
  const root = tree(xml)
  if (root.local !== 'Relationships' || root.ns !== PACKAGE) fail('关系根节点无效')
  const ids = new Set<string>()
  return root.children.map((node) => {
    const { Id: id, Type: type, Target: target, TargetMode: mode } = node.attrs
    if (
      node.local !== 'Relationship' ||
      node.ns !== PACKAGE ||
      node.children.length ||
      !id ||
      !type ||
      !target ||
      ids.has(id) ||
      (mode && !['Internal', 'External'].includes(mode))
    )
      fail('关系缺失、重复或无效')
    ids.add(id!)
    if (mode === 'External') {
      if (type !== `${OFFICE}/hyperlink` || !/^(?:https?:|mailto:)/i.test(target!))
        fail('外部结构关系')
      return { id: id!, type: type!, path: target!, external: true }
    }
    if (/[\\?#%]/.test(target!) || /^[a-z][\w+.-]*:/i.test(target!)) fail('关系目标无效')
    const parts = target!.startsWith('/') ? [] : entry.split('/').slice(0, -1)
    for (const part of target!.split('/')) {
      if (part === '..') {
        if (!parts.length) fail('关系越界')
        parts.pop()
      } else if (part && part !== '.') parts.push(part)
    }
    const path = parts.join('/')
    if (!zip.list().includes(path)) fail('关系目标不存在')
    return { id: id!, type: type!, path, external: false }
  })
}
/** Preserve the existing protection-presence rule, including password-bearing native XML. */
export function assertXlsxSheetWritable(xml: string): void {
  const root = tree(xml)
  if (root.ns !== MAIN || root.local !== 'worksheet') fail('工作表命名空间无效')
  const protections = all(root).filter((node) => node.local === 'sheetProtection')
  if (protections.some((node) => node.ns !== MAIN || !root.children.includes(node)))
    fail('工作表保护结构或命名空间无效')
  if (protections.length) throw new Error('工作表已保护，请先取消保护')
}
function assertWorksheetTopLevel(root: Node): void {
  if (root.local !== 'worksheet' || root.ns !== MAIN) fail('工作表命名空间无效')
  const worksheetChildren = new Set([
    'sheetPr',
    'dimension',
    'sheetViews',
    'sheetFormatPr',
    'cols',
    'sheetData',
    'sheetCalcPr',
    'sheetProtection',
    'protectedRanges',
    'scenarios',
    'autoFilter',
    'sortState',
    'dataConsolidate',
    'customSheetViews',
    'mergeCells',
    'phoneticPr',
    'conditionalFormatting',
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
  if (root.children.some((node) => node.ns !== MAIN || !worksheetChildren.has(node.local)))
    fail('未知顶层工作表结构或扩展')
  for (const node of root.children.filter((child) => child.local !== 'sheetData'))
    rejectExtensions(node)
}
/** Unknown structures remain guarded on third worksheets whose rule dependencies may move. */
export function assertXlsxWorksheetRangeStructure(xml: string): void {
  assertWorksheetTopLevel(tree(xml))
}
/** Read native anchors only. No normalized feature model or XML writer participates. */
export async function assertXlsxRangeFeatures(
  zip: BoundedZip,
  entry: string,
  xml: string,
  areas: RangeBounds[],
  structurePermit?: object,
  rulePermit?: object,
): Promise<void> {
  const root = tree(xml)
  const migratingStructures = hasXlsxRangeStructurePermit(structurePermit, entry, xml, areas)
  const migratingRules = hasXlsxRangeRulePermit(rulePermit, entry, xml, areas)
  assertWorksheetTopLevel(root)
  const reserved = new Set([
    'mergeCells',
    'mergeCell',
    'hyperlinks',
    'hyperlink',
    'conditionalFormatting',
    'dataValidations',
    'dataValidation',
    'autoFilter',
    'legacyDrawing',
    'tableParts',
    'tablePart',
  ])
  for (const node of all(root))
    if (reserved.has(node.local) && node.ns !== MAIN) fail('未知命名空间中的范围结构')
  for (const name of [
    'mergeCells',
    'hyperlinks',
    'dataValidations',
    'autoFilter',
    'legacyDrawing',
    'tableParts',
  ])
    if (children(root, name).length > 1) fail(`${name} 重复`)
  const parentOf: Record<string, string> = {
    mergeCells: 'worksheet',
    mergeCell: 'mergeCells',
    hyperlinks: 'worksheet',
    hyperlink: 'hyperlinks',
    conditionalFormatting: 'worksheet',
    dataValidations: 'worksheet',
    dataValidation: 'dataValidations',
    autoFilter: 'worksheet',
    legacyDrawing: 'worksheet',
    tableParts: 'worksheet',
    tablePart: 'tableParts',
  }
  const validatePlacement = (node: Node) => {
    for (const child of node.children) {
      if (reserved.has(child.local) && parentOf[child.local] !== node.local)
        fail('范围结构位置无效')
      validatePlacement(child)
    }
    if (
      ['mergeCells', 'hyperlinks', 'dataValidations', 'tableParts'].includes(node.local) &&
      node.attrs.count !== undefined &&
      (!/^\d+$/.test(node.attrs.count) || Number(node.attrs.count) !== node.children.length)
    )
      fail('范围结构 count 无效')
  }
  validatePlacement(root)
  const rels = await relations(zip, entry)
  if (rels.some((r) => /\/(?:threadedComment|threadedComments|ctrlProp)$/.test(r.type)))
    fail('未知批注或控件关系')
  const targetIdentities = new Set<string>()
  for (const related of rels.filter((r) => /\/(?:table|comments|vmlDrawing)$/.test(r.type))) {
    const identity = related.type + ':' + related.path
    if (targetIdentities.has(identity)) fail('结构关系目标重复')
    targetIdentities.add(identity)
  }
  const rel = (id: string, type: string) => {
    const found = rels.find((r) => r.id === id && r.type === `${OFFICE}/${type}`)
    if (!found) fail(`${type} 关系无效`)
    return found!
  }
  const uniqueRefs = (nodes: Node[]) => {
    const refs = new Set<string>()
    for (const node of nodes) {
      const key = JSON.stringify(area(node.attrs.ref))
      if (refs.has(key)) fail('原生锚点重复')
      refs.add(key)
    }
  }
  for (const container of children(root, 'mergeCells')) {
    uniqueRefs(container.children)
    if (!container.children.length) fail('mergeCells 为空')
    for (const node of container.children) {
      if (node.ns !== MAIN || node.local !== 'mergeCell') fail('合并结构无效')
      check(node.attrs.ref, migratingStructures ? [] : areas)
    }
  }
  for (const container of children(root, 'hyperlinks')) {
    uniqueRefs(container.children)
    if (!container.children.length) fail('hyperlinks 为空')
    for (const node of container.children) {
      if (node.ns !== MAIN || node.local !== 'hyperlink') fail('链接结构无效')
      check(node.attrs.ref, migratingStructures ? [] : areas)
      if (Object.keys(node.attrs).some((k) => k.endsWith(':id'))) rel(relationId(node), 'hyperlink')
      else if (!node.attrs.location) fail('链接目标缺失')
    }
  }
  for (const node of children(root, 'conditionalFormatting'))
    check(node.attrs.sqref, migratingRules ? [] : areas, true)
  for (const container of children(root, 'dataValidations')) {
    if (!container.children.length) fail('dataValidations 为空')
    for (const node of container.children) {
      if (node.ns !== MAIN || node.local !== 'dataValidation') fail('验证结构无效')
      check(node.attrs.sqref, migratingRules ? [] : areas, true)
    }
  }
  for (const node of children(root, 'autoFilter')) check(node.attrs.ref, areas)
  const tableIds = new Set<string>()
  for (const container of children(root, 'tableParts')) {
    if (!container.children.length) fail('tableParts 为空')
    for (const node of container.children) {
      if (node.ns !== MAIN || node.local !== 'tablePart') fail('表格结构无效')
      const id = relationId(node)
      if (tableIds.has(id)) fail('表格关系重复')
      tableIds.add(id)
      const related = rel(id, 'table'),
        table = tree((await zip.readText(related.path))!)
      if (table.ns !== MAIN || table.local !== 'table') fail('表格根节点无效')
      rejectExtensions(table)
      check(table.attrs.ref, areas)
      for (const filter of children(table, 'autoFilter')) check(filter.attrs.ref, areas)
    }
  }
  if (rels.filter((r) => r.type === `${OFFICE}/table`).some((r) => !tableIds.has(r.id)))
    fail('表格关系没有对应原生锚点')
  const comments = rels.filter((r) => r.type === `${OFFICE}/comments`)
  if (comments.length > 1) fail('批注关系重复')
  const noteRefs = new Set<string>()
  for (const related of comments) {
    const notes = tree((await zip.readText(related.path))!)
    if (notes.local !== 'comments' || notes.ns !== MAIN) fail('批注根节点无效')
    rejectExtensions(notes)
    for (const note of single(notes, 'commentList').children) {
      if (note.ns !== MAIN || note.local !== 'comment') fail('批注结构无效')
      const ref = note.attrs.ref,
        point = area(ref)
      if (
        point.startRow !== point.endRow ||
        point.startColumn !== point.endColumn ||
        noteRefs.has(ref!)
      )
        fail('批注引用重复或非单格')
      noteRefs.add(ref!)
      check(ref, areas)
    }
  }
  const legacy = children(root, 'legacyDrawing'),
    vmlRels = rels.filter((r) => r.type === `${OFFICE}/vmlDrawing`)
  if (vmlRels.length !== legacy.length || (legacy.length && !comments.length))
    fail('VML 与批注关系不匹配')
  for (const anchor of legacy) {
    const related = rel(relationId(anchor), 'vmlDrawing'),
      drawing = tree((await zip.readText(related.path))!),
      seen = new Set<string>()
    if (drawing.local !== 'xml' || drawing.ns) fail('VML 根节点无效')
    const shapes = all(drawing).filter((node) => node.ns === VML && node.local === 'shape')
    if (
      all(drawing).filter((node) => node.local === 'ClientData').length !== shapes.length ||
      drawing.children.some(
        (node) => node.ns === VML && !['shape', 'shapetype'].includes(node.local),
      )
    )
      fail('未知 VML 控件或锚点')
    for (const shape of shapes) {
      const data = shape.children.filter((node) => node.ns === EXCEL && node.local === 'ClientData')
      if (data.length !== 1 || data[0]!.attrs.ObjectType !== 'Note') fail('非标准批注 VML 控件')
      const number = (name: string) => {
        const values = data[0]!.children.filter((n) => n.ns === EXCEL && n.local === name)
        const value = values[0]?.children.map((n) => n.attrs.value ?? '').join('')
        if (values.length !== 1 || !/^\d+$/.test(value ?? '')) fail('批注 VML 坐标无效')
        return Number(value)
      }
      const ref = formatAddress(number('Row'), number('Column'))
      area(ref)
      if (!noteRefs.has(ref) || seen.has(ref)) fail('批注与 VML 锚点不匹配')
      seen.add(ref)
      check(ref, areas)
    }
    if (seen.size !== noteRefs.size) fail('批注 VML 锚点缺失')
  }
}
/** Moving a cell must not silently retarget an otherwise disjoint rule's formula. */
export function assertXlsxFeatureFormulaMoveSafe(xml: string, context: RuleMoveContext): void {
  const root = tree(xml)
  assertWorksheetTopLevel(root)
  const budget = { remaining: 200_000 }
  for (const feature of root.children
    .flatMap((node) => (node.local === 'dataValidations' ? node.children : [node]))
    .filter(
      (node) =>
        node.ns === MAIN && ['conditionalFormatting', 'dataValidation'].includes(node.local),
    )) {
    for (const node of all(feature).filter(
      (candidate) =>
        candidate.ns === MAIN &&
        (['formula', 'formula1', 'formula2'].includes(candidate.local) ||
          (candidate.local === 'cfvo' && candidate.attrs.type === 'formula')),
    )) {
      if (node.children.some((child) => child.tag !== '#text')) fail('规则公式结构无效')
      const formula =
        node.local === 'cfvo'
          ? (node.attrs.val ?? '')
          : node.children.map((child) => child.attrs.value ?? '').join('')
      const nativeRanges = feature.attrs.sqref?.trim().split(/\s+/) ?? []
      if (!nativeRanges.length || nativeRanges.length > 20_000) fail('规则 sqref 缺失或超过预算')
      assertRuleMoveFootprint(formula, nativeRanges.map(area), context, budget)
    }
  }
}
