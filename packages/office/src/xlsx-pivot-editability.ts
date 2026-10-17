import { pivotXmlTree, type PivotXmlNode } from './xlsx-native-xml.js'
export { pivotXmlTree, type PivotXmlNode } from './xlsx-native-xml.js'
import { BoundedZip } from './zip-bounds.js'
import { readXlsx, type XlsxSheet } from './xlsx.js'
import { resolveXlsxPart, xlsxRelsPath } from './xlsx-visuals.js'
import {
  parseRange,
  rangeCellCount,
} from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  buildPivotLayout,
  areasOverlap,
  type PivotLayoutDefinition,
  type PivotLayoutLine,
} from '../vendor/packages/xlsx-gateway/src/domain/pivot-layout.js'
import { xlsxPivotSource } from './editors/xlsx-pivot-controls.js'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const singleton = (node: PivotXmlNode) => {
  const repeated = new Set([
    'pivotField',
    'item',
    'field',
    'i',
    'x',
    'dataField',
    'cacheField',
    's',
  ])
  const seen = new Set<string>()
  for (const child of node.children) {
    if (!repeated.has(child.tag) && seen.has(child.tag)) throw new Error('原件含重复布局节点')
    seen.add(child.tag)
    singleton(child)
  }
}
export function samePivotXml(a: PivotXmlNode, b: PivotXmlNode): boolean {
  return (
    a.tag === b.tag &&
    Object.keys(a.attrs).length === Object.keys(b.attrs).length &&
    Object.entries(a.attrs).every(([k, v]) => b.attrs[k] === v) &&
    a.children.length === b.children.length &&
    a.children.every((n, i) => samePivotXml(n, b.children[i]!))
  )
}
const attrs = (node: PivotXmlNode, allowed: string[]) => {
  if (Object.keys(node.attrs).some((key) => !allowed.includes(key)))
    throw new Error('含未知原生属性或扩展，暂不能编辑布局')
}
export async function pivotRelations(zip: BoundedZip, part: string) {
  const xml = await zip.readText(xlsxRelsPath(part))
  if (!xml) return []
  const root = pivotXmlTree(xml)
  if (root.tag !== 'Relationships' || root.attrs.xmlns !== REL) throw new Error('无法定位原件关系')
  attrs(root, ['xmlns'])
  const ids = new Set<string>(),
    targets = new Set<string>()
  return root.children.map((node) => {
    attrs(node, ['Id', 'Type', 'Target', 'TargetMode'])
    const { Id: id, Type: type, Target: target, TargetMode: mode } = node.attrs
    if (
      node.tag !== 'Relationship' ||
      node.children.length ||
      !id ||
      !type ||
      !target ||
      (mode && mode !== 'Internal') ||
      /[\\?#%]/.test(target)
    )
      throw new Error('无法定位原件关系或存在外部关系')
    const path = resolveXlsxPart(part, target)
    if (
      !path ||
      path.startsWith('../') ||
      !zip.list().includes(path) ||
      ids.has(id) ||
      targets.has(path)
    )
      throw new Error('原件关系重复或目标无效')
    ids.add(id)
    targets.add(path)
    return { id, type, path }
  })
}
const TABLE_GRAMMAR: Record<string, string[]> = {
  pivotTableDefinition: [
    'xmlns',
    'name',
    'cacheId',
    'applyNumberFormats',
    'applyBorderFormats',
    'applyFontFormats',
    'applyPatternFormats',
    'applyAlignmentFormats',
    'applyWidthHeightFormats',
    'dataCaption',
    'updatedVersion',
    'createdVersion',
    'minRefreshableVersion',
    'useAutoFormatting',
    'itemPrintTitles',
    'compact',
    'compactData',
    'outline',
    'outlineData',
    'multipleFieldFilters',
  ],
  location: ['ref', 'firstHeaderRow', 'firstDataRow', 'firstDataCol'],
  pivotFields: ['count'],
  pivotField: ['axis', 'dataField', 'showAll', 'compact', 'outline', 'defaultSubtotal'],
  items: ['count'],
  item: ['x', 't'],
  rowFields: ['count'],
  colFields: ['count'],
  field: ['x'],
  rowItems: ['count'],
  colItems: ['count'],
  i: ['t', 'r', 'i'],
  x: ['v'],
  dataFields: ['count'],
  dataField: ['name', 'fld', 'subtotal', 'baseField', 'baseItem', 'numFmtId', 'showDataAs'],
  pivotTableStyleInfo: [
    'name',
    'showRowHeaders',
    'showColHeaders',
    'showRowStripes',
    'showColStripes',
    'showLastColumn',
  ],
}
const CACHE_GRAMMAR: Record<string, string[]> = {
  pivotCacheDefinition: [
    'xmlns',
    'xmlns:r',
    'r:id',
    'refreshedBy',
    'createdVersion',
    'refreshedVersion',
    'minRefreshableVersion',
    'recordCount',
    'refreshOnLoad',
  ],
  cacheSource: ['type'],
  worksheetSource: ['ref', 'sheet'],
  cacheFields: ['count'],
  cacheField: ['name', 'numFmtId'],
  sharedItems: ['count'],
  s: ['v'],
}
function grammar(node: PivotXmlNode, rules: Record<string, string[]>) {
  if (!rules[node.tag]) throw new Error('含未知原生属性或扩展，暂不能编辑布局')
  attrs(node, rules[node.tag]!)
  for (const child of node.children) grammar(child, rules)
}
export interface XlsxPivotLayoutEligibility {
  eligible: boolean
  reasons: string[]
  sourceSheetId?: string
  targetSheetId?: string
  sourceRef?: string
  outputRef?: string
  seed?: {
    rowFields: string[]
    columnFields: string[]
    values: { field: string; agg: 'sum' | 'count' | 'average' | 'max' | 'min' }[]
  }
}
export function pivotArea(ref: string) {
  if (!/^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/.test(ref)) throw new Error('透视范围不是固定矩形')
  const area = parseRange(ref)
  if (area.endRow >= 1048576 || area.endColumn >= 16384 || rangeCellCount(area) > 2000)
    throw new Error('透视范围超过2000格预算或工作表边界')
  return area
}
/** Inspect current bytes only. Raw XML never leaves this function through the UI result. */
export async function inspectXlsxPivotLayout(
  bytes: Uint8Array,
  sheetId: string,
  pivotPath: string,
): Promise<XlsxPivotLayoutEligibility> {
  try {
    const zip = await BoundedZip.open(bytes)
    const workbook = await readXlsx(bytes),
      target = workbook.sheets.find((sheet) => sheet.id === sheetId),
      pivot = target?.pivots?.find((item) => item.path === pivotPath)
    if (!target || !pivot) throw new Error('无法定位当前工作表的原件透视关系')
    const selected = (await pivotRelations(zip, target.entry)).filter(
      (rel) => rel.type === `${OFFICE_REL}/pivotTable` && rel.path === pivotPath,
    )
    const cacheRels = await pivotRelations(zip, pivotPath)
    if (
      selected.length !== 1 ||
      cacheRels.length !== 1 ||
      cacheRels[0]?.type !== `${OFFICE_REL}/pivotCacheDefinition` ||
      cacheRels[0].path !== pivot.cachePath
    )
      throw new Error('无法定位原件缓存关系')
    const table = pivotXmlTree((await zip.readText(pivot.path))!),
      cache = pivotXmlTree((await zip.readText(pivot.cachePath))!)
    if (
      table.tag !== 'pivotTableDefinition' ||
      table.attrs.xmlns !== MAIN ||
      cache.tag !== 'pivotCacheDefinition' ||
      cache.attrs.xmlns !== MAIN ||
      cache.attrs['xmlns:r'] !== OFFICE_REL
    )
      throw new Error('原件命名空间暂不支持')
    const workbookXml = pivotXmlTree((await zip.readText('xl/workbook.xml'))!)
    if (
      workbookXml.tag !== 'workbook' ||
      workbookXml.attrs.xmlns !== MAIN ||
      workbookXml.attrs['xmlns:r'] !== OFFICE_REL
    )
      throw new Error('工作簿原生命名空间无法确认')
    const mapping = workbookXml.children
      .filter((node) => node.tag === 'pivotCaches')
      .flatMap((node) => node.children)
      .filter((node) => node.attrs.cacheId === table.attrs.cacheId)
    const workbookRels = await pivotRelations(zip, 'xl/workbook.xml')
    if (
      mapping?.length !== 1 ||
      workbookRels.find((rel) => rel.id === mapping[0]?.attrs['r:id'])?.path !== pivot.cachePath ||
      workbookRels.find((rel) => rel.id === mapping[0]?.attrs['r:id'])?.type !==
        `${OFFICE_REL}/pivotCacheDefinition`
    )
      throw new Error('原件缓存身份不一致')
    let consumers = 0
    for (const path of zip
      .list('xl/pivotTables/')
      .filter((entryPath) => entryPath.endsWith('.xml') && !entryPath.includes('/_rels/'))) {
      if ((await pivotRelations(zip, path)).some((rel) => rel.path === pivot.cachePath)) consumers++
    }
    if (consumers !== 1) throw new Error('透视表共享缓存，暂不能编辑布局')
    const records = await pivotRelations(zip, pivot.cachePath)
    if (
      records.length !== 1 ||
      records[0]?.type !== `${OFFICE_REL}/pivotCacheRecords` ||
      records[0].id !== cache.attrs['r:id']
    )
      throw new Error('无法定位原件记录关系')
    for (const relsPath of zip.list().filter((path) => path.endsWith('.rels'))) {
      const part = relsPath.replace(/(^|\/)_rels\//, '$1').replace(/\.rels$/, '')
      const root = pivotXmlTree((await zip.readText(relsPath))!)
      for (const rel of root.children) {
        if (rel.attrs.TargetMode === 'External' || !rel.attrs.Target) continue
        // Only diagnose aliases here; never accept or rewrite a noncanonical OPC target.
        // Other consumers can live outside xl/pivotTables, so their encoded links
        // must not hide a shared cache/record part from the reverse-reference check.
        let decodedTarget: string
        try {
          decodedTarget = decodeURIComponent(rel.attrs.Target).replaceAll('\\', '/')
        } catch {
          throw new Error('原件关系路径编码无法确认')
        }
        if (decodedTarget !== rel.attrs.Target) {
          const alias = resolveXlsxPart(part, decodedTarget)
          if (alias === pivot.cachePath || alias === records[0]!.path)
            throw new Error('缓存关系含不明确路径别名，暂不能编辑布局')
        }
        const path = resolveXlsxPart(part, rel.attrs.Target)
        if (path === pivot.cachePath && part !== 'xl/workbook.xml' && part !== pivot.path)
          throw new Error('透视表共享缓存或关联缓存对象，暂不能编辑布局')
        if (path === records[0]!.path && part !== pivot.cachePath)
          throw new Error('缓存记录被其他对象共享，暂不能编辑布局')
      }
    }
    const types = pivotXmlTree((await zip.readText('[Content_Types].xml'))!)
    if (
      types.tag !== 'Types' ||
      types.attrs.xmlns !== 'http://schemas.openxmlformats.org/package/2006/content-types'
    )
      throw new Error('原件内容类型命名空间无法确认')
    for (const [path, type] of [
      [pivot.path, 'pivotTable'],
      [pivot.cachePath, 'pivotCacheDefinition'],
      [records[0]!.path, 'pivotCacheRecords'],
    ]) {
      const declarations = types.children.filter(
        (node) => node.tag === 'Override' && node.attrs.PartName === `/${path}`,
      )
      if (
        declarations.length !== 1 ||
        declarations[0]?.attrs.ContentType !==
          `application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml`
      )
        throw new Error('原件透视内容类型不明确')
    }
    const def = pivot.definition,
      source = workbook.sheets.find((sheet) => sheet.name === def.sourceSheet)
    if (!source) throw new Error('来源工作表不存在')
    for (const candidate of [source, target]) {
      const native = pivotXmlTree((await zip.readText(candidate.entry))!)
      if (native.tag !== 'worksheet' || native.attrs.xmlns !== MAIN)
        throw new Error('来源或目标工作表命名空间无法确认')
      const protection = native.children.filter(
        (node) => node.tag.split(':').at(-1) === 'sheetProtection',
      )
      if (
        protection.length > 1 ||
        protection.some(
          (node) =>
            node.tag !== 'sheetProtection' ||
            (node.attrs.xmlns && node.attrs.xmlns !== MAIN) ||
            !['0', 'false'].includes(node.attrs.sheet ?? '1'),
        )
      )
        throw new Error(
          candidate === source
            ? '来源工作表已保护或保护状态未知'
            : '目标工作表已保护或保护状态未知',
        )
    }

    if (source.extras?.protected || target.extras?.protected)
      throw new Error(source.extras?.protected ? '来源工作表已保护' : '目标工作表已保护')
    if (def.pageFields.length || def.filters.length || def.fields.some((field) => field.grouping))
      throw new Error('含分组、筛选或报告字段，暂不能编辑布局')
    if (def.dataFields.some((field) => field.formula)) throw new Error('含计算字段，暂不能编辑布局')
    if (
      def.unsupported.length ||
      def.rowFields.some((field) => field < 0) ||
      !def.rowFields.length ||
      def.rowFields.length > 8 ||
      def.colFields.some((field) => field < 0 && field !== -2)
    )
      throw new Error('值行或其他特殊布局暂不支持编辑')
    const positiveColumns = def.colFields.filter((field) => field >= 0)
    const dimensionNames = [...def.rowFields, ...positiveColumns].map((i) => def.fields[i]?.name)
    if (
      positiveColumns.length > 8 ||
      def.dataFields.length < 1 ||
      def.dataFields.length > 8 ||
      new Set(dimensionNames).size !== dimensionNames.length ||
      def.dataFields.some((field) => dimensionNames.includes(def.fields[field.field]?.name)) ||
      (positiveColumns.length > 0 && def.dataFields.length !== 1)
    )
      throw new Error('行列维度或汇总值布局暂不支持编辑')
    const dataFields = table.children.find((node) => node.tag === 'dataFields')?.children ?? []
    if (
      dataFields.some(
        (node) =>
          (node.attrs.numFmtId && node.attrs.numFmtId !== '0') ||
          (node.attrs.showDataAs && node.attrs.showDataAs !== 'normal'),
      )
    )
      throw new Error('含自定义数字格式或显示方式，暂不能编辑布局')
    if (table.attrs.rowGrandTotals !== undefined || table.attrs.colGrandTotals !== undefined)
      throw new Error('含自定义总计，暂不能编辑布局')
    if (
      cache.children
        .find((node) => node.tag === 'cacheFields')
        ?.children.some((node) => node.attrs.numFmtId && node.attrs.numFmtId !== '0')
    )
      throw new Error('缓存字段含自定义数字格式')
    grammar(table, TABLE_GRAMMAR)
    grammar(cache, CACHE_GRAMMAR)
    const rootDefaults: Record<string, string> = {
      applyNumberFormats: '0',
      applyBorderFormats: '0',
      applyFontFormats: '0',
      applyPatternFormats: '0',
      applyAlignmentFormats: '0',
      applyWidthHeightFormats: '1',
      dataCaption: 'Values',
      updatedVersion: '8',
      createdVersion: '8',
      minRefreshableVersion: '3',
      useAutoFormatting: '1',
      itemPrintTitles: '1',
      multipleFieldFilters: '0',
    }
    if (Object.entries(rootDefaults).some(([key, value]) => table.attrs[key] !== value))
      throw new Error('原件含自定义样式、标题或布局属性')
    singleton(table)
    singleton(cache)
    const fieldNodes = cache.children.find((node) => node.tag === 'cacheFields')?.children ?? []
    if (
      fieldNodes.some(
        (node, i) =>
          node.attrs.name !== def.fields[i]?.name ||
          (node.children[0]?.children ?? []).some(
            (item, j) => item.attrs.v !== String(def.fields[i]?.sharedItems[j]),
          ),
      )
    )
      throw new Error('缓存成员结构无法确认')
    const style = table.children.find((node) => node.tag === 'pivotTableStyleInfo')
    if (
      !style ||
      !samePivotXml(style, {
        tag: 'pivotTableStyleInfo',
        attrs: {
          name: 'PivotStyleLight16',
          showRowHeaders: '1',
          showColHeaders: '1',
          showRowStripes: '0',
          showColStripes: '0',
          showLastColumn: '1',
        },
        children: [],
      })
    )
      throw new Error('含自定义透视样式，暂不能编辑布局')
    const captions: Record<string, string> = {
      sum: 'Sum',
      count: 'Count',
      average: 'Average',
      max: 'Max',
      min: 'Min',
    }
    if (
      dataFields.some(
        (node, i) =>
          node.attrs.name !==
          `${captions[def.dataFields[i]?.subtotal ?? '']} of ${def.fields[def.dataFields[i]?.field ?? -1]?.name}`,
      )
    )
      throw new Error('含自定义汇总标题，暂不能编辑布局')
    const sourceData = xlsxPivotSource(source, def.sourceRef)
    const recordCount = Number(cache.attrs.recordCount),
      recordTree = pivotXmlTree((await zip.readText(records[0]!.path))!)
    if (
      !Number.isInteger(recordCount) ||
      recordCount < 0 ||
      (recordCount !== 0 && recordCount !== sourceData.grid.length - 1) ||
      recordTree.tag !== 'pivotCacheRecords' ||
      recordTree.attrs.xmlns !== MAIN ||
      recordTree.attrs['xmlns:r'] !== OFFICE_REL ||
      Number(recordTree.attrs.count) !== recordCount ||
      recordTree.children.length !== recordCount
    )
      throw new Error('原件缓存记录数或结构未知')
    attrs(recordTree, ['xmlns', 'xmlns:r', 'count'])
    for (const row of recordTree.children) {
      if (
        row.tag !== 'r' ||
        Object.keys(row.attrs).length ||
        row.children.length !== sourceData.fields.length
      )
        throw new Error('原件缓存记录结构未知')
      for (const [i, item] of row.children.entries()) {
        if (!['s', 'n', 'b', 'm', 'x'].includes(item.tag) || item.children.length)
          throw new Error('原件缓存记录含未知扩展')
        attrs(item, ['v'])
        if (
          (item.tag === 'm' && Object.keys(item.attrs).length) ||
          (item.tag !== 'm' && item.attrs.v === undefined) ||
          (item.tag === 'n' && !Number.isFinite(Number(item.attrs.v))) ||
          (item.tag === 'b' && !['0', '1'].includes(item.attrs.v!)) ||
          (item.tag === 'x' &&
            (!/^\d+$/.test(item.attrs.v!) ||
              Number(item.attrs.v) >= def.fields[i]!.sharedItems.length))
        )
          throw new Error('原件缓存记录值未知')
      }
    }
    if (JSON.stringify(sourceData.fields) !== JSON.stringify(def.fields.map((field) => field.name)))
      throw new Error('来源标题已变化，请先刷新透视表')
    const layout = buildPivotLayout(
      sourceData.grid,
      {
        rowFields: def.rowFields.map((i) => def.fields[i]!.name),
        columnField: def.colFields.filter((i) => i >= 0).map((i) => def.fields[i]!.name),
        values: def.dataFields.map((field) => ({
          field: def.fields[field.field]!.name,
          agg: field.subtotal as 'sum' | 'count' | 'average' | 'max' | 'min',
        })),
      },
      { subtotal: '小计', grandTotal: '总计' },
    )
    const output = pivotArea(def.outputRef)
    if (
      layout.width !== output.endColumn - output.startColumn + 1 ||
      layout.height !== output.endRow - output.startRow + 1
    )
      throw new Error('来源成员或输出尺寸已变化，请先刷新')
    const expected = pivotBaselineTrees(layout.definition, {
      name: pivot.name,
      cacheId: table.attrs.cacheId!,
      recordsId: cache.attrs['r:id']!,
      recordCount: cache.attrs.recordCount!,
      sourceSheet: source.name,
      sourceRef: def.sourceRef,
      outputRef: def.outputRef,
    })
    for (const node of dataFields) {
      if (node.attrs.numFmtId === '0') delete node.attrs.numFmtId
      if (node.attrs.showDataAs === 'normal') delete node.attrs.showDataAs
    }
    const refresh = cache.attrs.refreshOnLoad
    if (refresh !== undefined && !['0', '1'].includes(refresh)) throw new Error('缓存刷新状态未知')
    delete cache.attrs.refreshOnLoad
    for (const field of cache.children.find((node) => node.tag === 'cacheFields')?.children ?? [])
      field.attrs.numFmtId ??= '0'
    if (!samePivotXml(table, expected.table) || !samePivotXml(cache, expected.cache))
      throw new Error('原生布局含自定义属性或缓存成员已变化，请先刷新后重试')
    pivotArea(def.sourceRef)
    await assertPivotOutputSafe(zip, target, output, pivot.path)
    // Relationship consumers beyond the selected pivot are not rebuilt by relayout.
    for (const path of zip
      .list()
      .filter(
        (entryPath) => entryPath.endsWith('.xml') && /(?:slicer|timeline|chart)/i.test(entryPath),
      )) {
      const xml = (await zip.readText(path))!
      const related = (node: PivotXmlNode): boolean =>
        Object.entries(node.attrs).some(
          ([key, value]) =>
            (key.split(':').at(-1) === 'cacheId' && value === table.attrs.cacheId) ||
            (key.split(':').at(-1) === 'name' && value === pivot.name) ||
            (key === 'value' && value.trim().endsWith('!' + pivot.name)),
        ) || node.children.some(related)
      if (related(pivotXmlTree(xml))) throw new Error('关联切片器、时间线或透视图，暂不能编辑布局')
    }
    return {
      eligible: true,
      reasons: [],
      sourceSheetId: source.id,
      targetSheetId: target.id,
      sourceRef: def.sourceRef,
      outputRef: def.outputRef,
      seed: {
        rowFields: def.rowFields.map((index) => def.fields[index]!.name),
        columnFields: def.colFields
          .filter((index) => index >= 0)
          .map((index) => def.fields[index]!.name),
        values: def.dataFields.map((field) => {
          if (!['sum', 'count', 'average', 'max', 'min'].includes(field.subtotal))
            throw new Error('汇总方式暂不支持编辑')
          return {
            field: def.fields[field.field]!.name,
            agg: field.subtotal as 'sum' | 'count' | 'average' | 'max' | 'min',
          }
        }),
      },
    }
  } catch (error) {
    return {
      eligible: false,
      reasons: [error instanceof Error ? error.message : '无法确认原件布局编辑资格'],
    }
  }
}

/** Address-local output safety: never reject unrelated custom content in an external corner. */
export async function assertPivotOutputSafe(
  zip: BoundedZip,
  sheet: XlsxSheet,
  area: ReturnType<typeof parseRange>,
  selectedPath: string,
) {
  if (
    sheet.tables?.some((table) => areasOverlap(area, parseRange(table.range))) ||
    sheet.pivots?.some(
      (pivot) =>
        pivot.path !== selectedPath && areasOverlap(area, pivotArea(pivot.definition.outputRef)),
    )
  )
    throw new Error('输出区域与结构化表或其他透视表重叠')
  const xml = (await zip.readText(sheet.entry))!
  for (const match of xml.matchAll(
    /<(?:mergeCell|dataValidation|conditionalFormatting|hyperlink)\b[^>]*(?:ref|sqref)=["']([^"']+)["'][^>]*>/g,
  )) {
    if (
      match[1]!.split(/\s+/).some((ref) => areasOverlap(area, parseRange(ref.replaceAll('$', ''))))
    )
      throw new Error('输出区域含合并、验证、条件格式或超链接')
  }
  if (/<(?:extLst|legacyDrawing|legacyDrawingHF|oleObjects|controls)\b/.test(xml))
    throw new Error('输出工作表含未建模地址结构')
  if (
    (await pivotRelations(zip, sheet.entry)).some((rel) =>
      /\/(?:comments|threadedComment|vmlDrawing)$/.test(rel.type),
    )
  )
    throw new Error('输出工作表含批注地址结构')
  const stylesXml = await zip.readText('xl/styles.xml'),
    styles = stylesXml ? pivotXmlTree(stylesXml) : null
  const styleChildren = (tag: string) =>
    styles?.children.find((node) => node.tag === tag)?.children ?? []
  const xfs = styleChildren('cellXfs'),
    styleXfs = styleChildren('cellStyleXfs')
  const defaultXf = (index: number) => {
    if (!styles) {
      if (index !== 0) throw new Error('输出区域格式无法确认')
      return
    }
    const xf = xfs[index]
    if (
      !xf ||
      xf.children.length ||
      Object.entries(xf.attrs).some(
        ([key, value]) =>
          !['fontId', 'fillId', 'borderId', 'numFmtId', 'xfId'].includes(key) || value !== '0',
      )
    )
      throw new Error('输出区域含暂不支持的自定义格式')
    const base = styleXfs[0]
    if (
      base &&
      (base.children.length ||
        Object.entries(base.attrs).some(
          ([key, value]) =>
            !['fontId', 'fillId', 'borderId', 'numFmtId'].includes(key) || value !== '0',
        ))
    )
      throw new Error('输出区域含继承自定义格式')
    const font = styleChildren('fonts')[0],
      fill = styleChildren('fills')[0],
      border = styleChildren('borders')[0]
    if (
      font?.children.some(
        (node) =>
          !['sz', 'name', 'family', 'scheme', 'color'].includes(node.tag) ||
          (node.tag === 'color' && node.attrs.theme !== '1'),
      ) ||
      fill?.children.some(
        (node) =>
          node.tag !== 'patternFill' || node.attrs.patternType !== 'none' || node.children.length,
      ) ||
      border?.children.some((node) => node.children.length || Object.keys(node.attrs).length)
    )
      throw new Error('输出区域默认外观已自定义')
  }
  defaultXf(0)
  for (const match of xml.matchAll(/<col\b[^>]*>/g)) {
    const node = pivotXmlTree(match[0].endsWith('/>') ? match[0] : match[0].slice(0, -1) + '/>')
    if (
      Number(node.attrs.min) - 1 <= area.endColumn &&
      Number(node.attrs.max) - 1 >= area.startColumn &&
      node.attrs.style
    )
      defaultXf(Number(node.attrs.style))
  }
  for (const match of xml.matchAll(/<row\b([^>]*)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const tag = pivotXmlTree(`<row${match[1]}/>`),
      r = Number(tag.attrs.r) - 1
    if (r < area.startRow || r > area.endRow) continue
    if (tag.attrs.s) defaultXf(Number(tag.attrs.s))
    for (const cell of (match[2] ?? '').matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const ref = /\br=["']([A-Z]+[1-9]\d*)["']/.exec(cell[0])?.[1]
      if (!ref) throw new Error('输出单元格身份无法确认')
      const bounds = parseRange(`${ref}:${ref}`)
      if (!areasOverlap(area, bounds)) continue
      const node = pivotXmlTree(cell[0])
      attrs(node, ['r', 's', 't'])
      defaultXf(Number(node.attrs.s ?? 0))
      if (node.children.some((child) => !['v', 'is'].includes(child.tag)))
        throw new Error('输出区域含公式或未知单元格扩展')
      if (node.attrs.t && !['n', 's', 'inlineStr', 'str', 'b'].includes(node.attrs.t))
        throw new Error('输出区域单元格类型暂不支持')
      const checkValue = (value: PivotXmlNode) => {
        if (!['v', 'is', 't', '#text'].includes(value.tag))
          throw new Error('输出区域含未知单元格结构')
        if (value.tag === '#text') return
        attrs(value, value.tag === 't' ? ['xml:space'] : [])
        if (
          value.tag === 't' &&
          value.attrs['xml:space'] &&
          value.attrs['xml:space'] !== 'preserve'
        )
          throw new Error('输出区域含未知文字属性')
        for (const child of value.children) checkValue(child)
      }
      for (const child of node.children) checkValue(child)
      // Cell text is checked separately with the XML parser, which retains content.
      if (/<(?:r|rPr|extLst)\b/.test(cell[0])) throw new Error('输出区域含富文本或未知单元格扩展')
    }
  }
}

const n = (
  tag: string,
  attributes: Record<string, string | number> = {},
  children: PivotXmlNode[] = [],
): PivotXmlNode => ({
  tag,
  attrs: Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, String(v)])),
  children,
})

/** Read-only semantic shape of the pinned General/simple writer. This builds no XML
 * and imports no gateway writer into browsers. Server independently compares the
 * original with the actual pinned writer; native positive tests keep both aligned.
 * Reference: GenOffice 480548fd xlsx-pivot-add.ts:620–838,950–1015. */
function pivotBaselineTrees(
  d: PivotLayoutDefinition,
  identity: {
    name: string
    cacheId: string
    recordsId: string
    recordCount: string
    sourceSheet: string
    sourceRef: string
    outputRef: string
  },
) {
  const cols =
      d.columnFieldIndices ?? (d.columnFieldIndex === undefined ? [] : [d.columnFieldIndex]),
    rowItems = d.rowLevelItems ?? [d.rowItems],
    colItems = d.colLevelItems ?? (d.columnItems ? [d.columnItems] : []),
    tabular = d.rowFieldIndices.length >= 2
  const tab: Record<string, string> = tabular ? { compact: '0', outline: '0' } : {}
  const axis = (kind: string, items: readonly string[]) =>
    n('pivotField', { axis: kind, showAll: 0, ...tab }, [
      n('items', { count: items.length + 1 }, [
        ...items.map((_, i) => n('item', { x: i })),
        n('item', { t: 'default' }),
      ]),
    ])
  const lines = (tag: string, items: readonly PivotLayoutLine[], levels: number) => {
    let carry: (number | null)[] = Array.from({ length: levels }, () => null)
    const result = items.map((line) => {
      let repeat = 0
      while (
        repeat < line.members.length - 1 &&
        carry[repeat] !== null &&
        carry[repeat] === line.members[repeat]
      )
        repeat++
      carry = [...line.members]
      while (carry.length < levels) carry.push(null)
      return n(
        'i',
        { ...(repeat ? { r: repeat } : {}), ...(line.t === 'data' ? {} : { t: line.t }) },
        line.members.slice(repeat).map((member) => n('x', member === 0 ? {} : { v: member })),
      )
    })
    return n(tag, { count: result.length + 1 }, [...result, n('i', { t: 'grand' }, [n('x')])])
  }
  const captions: Record<string, string> = {
    sum: 'Sum',
    count: 'Count',
    average: 'Average',
    max: 'Max',
    min: 'Min',
  }
  const table = n(
    'pivotTableDefinition',
    {
      xmlns: MAIN,
      name: identity.name,
      cacheId: identity.cacheId,
      applyNumberFormats: 0,
      applyBorderFormats: 0,
      applyFontFormats: 0,
      applyPatternFormats: 0,
      applyAlignmentFormats: 0,
      applyWidthHeightFormats: 1,
      dataCaption: 'Values',
      updatedVersion: 8,
      createdVersion: 8,
      minRefreshableVersion: 3,
      useAutoFormatting: 1,
      itemPrintTitles: 1,
      ...(tabular
        ? { compact: 0, compactData: 0, outline: 0, outlineData: 0 }
        : { outline: 1, outlineData: 1 }),
      multipleFieldFilters: 0,
    },
    [
      n('location', {
        ref: identity.outputRef,
        firstHeaderRow: 1,
        firstDataRow: Math.max(1, cols.length),
        firstDataCol: d.rowFieldIndices.length,
      }),
      n(
        'pivotFields',
        { count: d.fieldNames.length },
        d.fieldNames.map((_, i) => {
          const row = d.rowFieldIndices.indexOf(i),
            col = cols.indexOf(i)
          return row >= 0
            ? axis('axisRow', rowItems[row] ?? [])
            : col >= 0
              ? axis('axisCol', colItems[col] ?? [])
              : n('pivotField', {
                  ...(d.values.some((value) => value.fieldIndex === i) ? { dataField: 1 } : {}),
                  showAll: 0,
                  ...tab,
                })
        }),
      ),
      n(
        'rowFields',
        { count: d.rowFieldIndices.length },
        d.rowFieldIndices.map((x) => n('field', { x })),
      ),
      lines(
        'rowItems',
        d.rowLines ?? d.rowItems.map((_, i) => ({ t: 'data', members: [i] })),
        d.rowFieldIndices.length,
      ),
      ...(cols.length
        ? [
            n(
              'colFields',
              { count: cols.length },
              cols.map((x) => n('field', { x })),
            ),
            lines(
              'colItems',
              d.colLines ?? (d.columnItems ?? []).map((_, i) => ({ t: 'data', members: [i] })),
              cols.length,
            ),
          ]
        : d.values.length > 1
          ? [
              n('colFields', { count: 1 }, [n('field', { x: -2 })]),
              n(
                'colItems',
                { count: d.values.length },
                d.values.map((_, i) =>
                  i === 0 ? n('i', {}, [n('x')]) : n('i', { i }, [n('x', { v: i })]),
                ),
              ),
            ]
          : [n('colItems', { count: 1 }, [n('i')])]),
      n(
        'dataFields',
        { count: d.values.length },
        d.values.map((value) =>
          n('dataField', {
            name: `${captions[value.agg]} of ${d.fieldNames[value.fieldIndex]}`,
            fld: value.fieldIndex,
            ...(value.agg === 'sum' ? {} : { subtotal: value.agg }),
            baseField: 0,
            baseItem: 0,
          }),
        ),
      ),
      n('pivotTableStyleInfo', {
        name: 'PivotStyleLight16',
        showRowHeaders: 1,
        showColHeaders: 1,
        showRowStripes: 0,
        showColStripes: 0,
        showLastColumn: 1,
      }),
    ],
  )
  const cache = n(
    'pivotCacheDefinition',
    {
      xmlns: MAIN,
      'xmlns:r': OFFICE_REL,
      'r:id': identity.recordsId,
      refreshedBy: 'genoffice',
      createdVersion: 8,
      refreshedVersion: 8,
      minRefreshableVersion: 3,
      recordCount: identity.recordCount,
    },
    [
      n('cacheSource', { type: 'worksheet' }, [
        n('worksheetSource', { ref: identity.sourceRef, sheet: identity.sourceSheet }),
      ]),
      n(
        'cacheFields',
        { count: d.fieldNames.length },
        d.fieldNames.map((name, i) => {
          const row = d.rowFieldIndices.indexOf(i),
            col = cols.indexOf(i),
            items = row >= 0 ? (rowItems[row] ?? []) : col >= 0 ? (colItems[col] ?? []) : []
          return n('cacheField', { name, numFmtId: 0 }, [
            n(
              'sharedItems',
              items.length ? { count: items.length } : {},
              items.map((v) => n('s', { v })),
            ),
          ])
        }),
      ),
    ],
  )
  return { table, cache }
}
