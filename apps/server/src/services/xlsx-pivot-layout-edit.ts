import type { XlsxPivotLayoutEdit } from '@mimir/shared'
import {
  inspectXlsxPivotLayout,
  pivotArea,
  pivotRelations,
  pivotXmlTree,
  samePivotXml,
  assertPivotOutputSafe,
} from '../../../../packages/office/src/xlsx-pivot-editability.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { xlsxPivotSource } from '../../../../packages/office/src/editors/xlsx-pivot-controls.js'
import {
  buildPivotLayout,
  pivotOutputArea,
  areasOverlap,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/pivot-layout.js'
import { formatAddress } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  buildCacheDefinitionXml,
  buildPivotTableXml,
  type PivotAddition,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-pivot-add.js'
import {
  createBufferEntrySource,
  planCellEditsToXlsx,
  assembleWithJsZip,
  assertOnlyTouchedEntriesChanged,
  type CellEdit,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'

export async function applyXlsxPivotLayoutEdit(
  bytes: Uint8Array,
  op: XlsxPivotLayoutEdit,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<XlsxHostResult> {
  const check = () => {
    if (signal?.aborted) throw new Error('透视布局编辑已取消')
  }
  check()
  const eligibility = await inspectXlsxPivotLayout(bytes, op.sheetId, op.pivotPath)
  if (!eligibility.eligible) throw new Error(eligibility.reasons.join('；'))
  const workbook = await readXlsx(bytes),
    target = workbook.sheets.find((sheet) => sheet.id === op.sheetId)!,
    pivot = target.pivots!.find((item) => item.path === op.pivotPath)!,
    source = workbook.sheets.find((sheet) => sheet.id === eligibility.sourceSheetId)!
  const zip = await BoundedZip.open(bytes),
    old = pivotArea(pivot.definition.outputRef),
    sourceData = xlsxPivotSource(source, pivot.definition.sourceRef)
  const current = eligibility.seed!
  if (
    JSON.stringify(current) ===
    JSON.stringify({ rowFields: op.rowFields, columnFields: op.columnFields, values: op.values })
  )
    throw new Error('配置未变化；来源值变化请使用刷新')
  const spec = { rowFields: op.rowFields, columnField: op.columnFields, values: op.values }
  const dimensions = [...op.rowFields, ...op.columnFields]
  if (
    new Set(dimensions).size !== dimensions.length ||
    dimensions.some((field) => !sourceData.fields.includes(field)) ||
    op.values.some(
      (value) => !sourceData.fields.includes(value.field) || dimensions.includes(value.field),
    ) ||
    (op.columnFields.length && op.values.length !== 1)
  )
    throw new Error('行列字段与汇总值配置无效或重复')
  const tableXml = (await zip.readText(pivot.path))!,
    cacheXml = (await zip.readText(pivot.cachePath))!,
    table = pivotXmlTree(tableXml),
    cache = pivotXmlTree(cacheXml)
  const recordsRel = (await pivotRelations(zip, pivot.cachePath))[0]!
  // Full ordered native baseline comparison: every regenerated attribute/node must be modeled.
  const baselineLayout = buildPivotLayout(
    sourceData.grid,
    { rowFields: current.rowFields, columnField: current.columnFields, values: current.values },
    { subtotal: '小计', grandTotal: '总计' },
  )
  const baseline: PivotAddition = {
    worksheetPath: target.entry,
    sourceSheetName: source.name,
    sourceArea: sourceData.area,
    location: old,
    name: pivot.name,
    ...baselineLayout.definition,
  }
  if (
    baselineLayout.height !== old.endRow - old.startRow + 1 ||
    baselineLayout.width !== old.endColumn - old.startColumn + 1
  )
    throw new Error('来源成员或原件输出尺寸已变化，请先刷新')
  const expectedTable = pivotXmlTree(buildPivotTableXml(Number(table.attrs.cacheId), baseline))
  // General and normal are explicit equivalents to writer omission.
  for (const node of table.children.find((section) => section.tag === 'dataFields')?.children ??
    []) {
    if (node.attrs.numFmtId === '0') delete node.attrs.numFmtId
    if (node.attrs.showDataAs === 'normal') delete node.attrs.showDataAs
  }
  if (!samePivotXml(table, expectedTable))
    throw new Error('原生布局含自定义属性或来源成员已变化，请先刷新后重试')
  const count = Number(cache.attrs.recordCount)
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    (count !== 0 && count !== sourceData.grid.length - 1)
  )
    throw new Error('原件缓存记录数不一致')
  const refresh = cache.attrs.refreshOnLoad
  if (refresh !== undefined && !['0', '1'].includes(refresh))
    throw new Error('原件缓存刷新状态未知')
  delete cache.attrs.refreshOnLoad
  for (const field of cache.children.find((node) => node.tag === 'cacheFields')?.children ?? [])
    field.attrs.numFmtId ??= '0'
  if (!samePivotXml(cache, pivotXmlTree(buildCacheDefinitionXml(recordsRel.id, baseline, count))))
    throw new Error('缓存成员或原生属性已变化，请先刷新后重试')
  const records = pivotXmlTree((await zip.readText(recordsRel.path))!)
  if (
    records.tag !== 'pivotCacheRecords' ||
    records.attrs.xmlns !== 'http://schemas.openxmlformats.org/spreadsheetml/2006/main' ||
    Number(records.attrs.count) !== count ||
    Object.keys(records.attrs).some((key) => !['xmlns', 'xmlns:r', 'count'].includes(key)) ||
    records.children.length !== count
  )
    throw new Error('原件缓存记录结构未知')
  for (const row of records.children) {
    if (
      row.tag !== 'r' ||
      Object.keys(row.attrs).length ||
      row.children.length !== sourceData.fields.length
    )
      throw new Error('原件缓存记录结构未知')
    for (const item of row.children)
      if (
        !['s', 'n', 'b', 'm', 'x'].includes(item.tag) ||
        item.children.length ||
        Object.keys(item.attrs).some((key) => key !== 'v')
      )
        throw new Error('原件缓存记录含未知扩展')
  }
  const layout = buildPivotLayout(sourceData.grid, spec, { subtotal: '小计', grandTotal: '总计' }),
    location = pivotOutputArea({ row: old.startRow, column: old.startColumn }, layout),
    newRef = `${formatAddress(location.startRow, location.startColumn)}:${formatAddress(location.endRow, location.endColumn)}`
  pivotArea(newRef)
  if (source.id === target.id && areasOverlap(sourceData.area, location))
    throw new Error('输出区域与来源重叠')
  await assertPivotOutputSafe(zip, target, location, pivot.path)
  const inside = (r: number, c: number, area: typeof old) =>
    r >= area.startRow && r <= area.endRow && c >= area.startColumn && c <= area.endColumn
  const edits: CellEdit[] = []
  for (let row = location.startRow; row <= location.endRow; row++)
    for (let column = location.startColumn; column <= location.endColumn; column++) {
      const cell = target.rows
        .find((item) => item.number === row + 1)
        ?.cells.find((item) => item.col === column)
      if (
        !inside(row, column, old) &&
        (cell?.text || cell?.formula || cell?.covered || cell?.mergeRef)
      )
        throw new Error('新输出区域会覆盖现有内容')
      edits.push({
        sheetName: target.name,
        row,
        column,
        writeValue: true,
        cell: {
          value: layout.matrix[row - location.startRow]?.[column - location.startColumn] ?? null,
        },
      })
    }
  for (let row = old.startRow; row <= old.endRow; row++)
    for (let column = old.startColumn; column <= old.endColumn; column++)
      if (!inside(row, column, location))
        edits.push({ sheetName: target.name, row, column, writeValue: true, cell: { value: null } })
  if (edits.length > 2000) throw new Error('新旧输出实际并集超过2000格预算')
  check()
  const input = Buffer.from(bytes),
    plan = await planCellEditsToXlsx(
      await createBufferEntrySource(input),
      edits,
      [],
      [],
      undefined,
      [],
      [],
      [],
      [],
      [],
      null,
      [],
      [],
      [],
      [],
      [],
      [pivot.cachePath],
      [
        {
          cachePath: pivot.cachePath,
          sheetName: target.name,
          newOutputRef: newRef,
          relayout: {
            name: pivot.name,
            sourceSheetName: source.name,
            sourceArea: sourceData.area,
            location,
            ...layout.definition,
          },
        },
      ],
    )
  const result = await assembleWithJsZip(input, plan)
  assertOnlyTouchedEntriesChanged(result)
  const output = new Uint8Array(result.buffer),
    after = await BoundedZip.open(output)
  // Independently verify all package entries; no trust in writer's touched inventory.
  const allowed = new Set([
    target.entry,
    pivot.path,
    pivot.cachePath,
    recordsRel.path,
    'xl/workbook.xml',
    'xl/calcChain.xml',
    'xl/_rels/workbook.xml.rels',
    '[Content_Types].xml',
  ])
  const beforeNames = zip.list().toSorted(),
    afterNames = after.list().toSorted()
  if (
    afterNames.some((path) => !beforeNames.includes(path)) ||
    beforeNames.some((path) => !afterNames.includes(path) && path !== 'xl/calcChain.xml')
  )
    throw new Error('布局编辑意外改变原件部件身份')
  for (const path of beforeNames)
    if (!allowed.has(path)) {
      const a = await zip.read(path),
        b = await after.read(path)
      if (!a || !b || a.length !== b.length || a.some((value, index) => value !== b[index]))
        throw new Error(`布局编辑意外修改非目标部件：${path}`)
    }
  for (const path of ['xl/_rels/workbook.xml.rels', '[Content_Types].xml']) {
    const a = pivotXmlTree((await zip.readText(path))!),
      b = pivotXmlTree((await after.readText(path))!)
    const chain = path.includes('_rels')
      ? a.children.find((node) => node.attrs.Type?.endsWith('/calcChain'))
      : undefined
    if (!after.list().includes('xl/calcChain.xml'))
      a.children = a.children.filter(
        (node) => node !== chain && node.attrs.PartName !== '/xl/calcChain.xml',
      )
    if (!samePivotXml(a, b)) throw new Error('原件关系或类型被意外修改')
  }
  const wbBefore = pivotXmlTree((await zip.readText('xl/workbook.xml'))!),
    wbAfter = pivotXmlTree((await after.readText('xl/workbook.xml'))!)
  const beforeCalc = wbBefore.children.find((node) => node.tag === 'calcPr'),
    afterCalc = wbAfter.children.find((node) => node.tag === 'calcPr')
  if (!afterCalc || afterCalc.attrs.fullCalcOnLoad !== '1')
    throw new Error('布局编辑计算状态不一致')
  delete afterCalc.attrs.fullCalcOnLoad
  if (beforeCalc) {
    delete beforeCalc.attrs.fullCalcOnLoad
    if (!samePivotXml(beforeCalc, afterCalc)) throw new Error('布局编辑意外改变计算属性')
  } else if (Object.keys(afterCalc.attrs).length || afterCalc.children.length)
    throw new Error('布局编辑意外新增计算属性')
  wbBefore.children = wbBefore.children.filter((node) => node.tag !== 'calcPr')
  wbAfter.children = wbAfter.children.filter((node) => node.tag !== 'calcPr')
  if (!samePivotXml(wbBefore, wbAfter)) throw new Error('原件工作簿身份被意外修改')
  const finalView = await readXlsx(output),
    finalPivot = finalView.sheets
      .find((sheet) => sheet.id === target.id)
      ?.pivots?.find((item) => item.path === pivot.path)
  if (
    !finalPivot ||
    finalPivot.cachePath !== pivot.cachePath ||
    finalPivot.name !== pivot.name ||
    finalPivot.definition.outputRef !== newRef ||
    finalPivot.definition.sourceSheet !== source.name ||
    finalPivot.definition.sourceRef !== pivot.definition.sourceRef
  )
    throw new Error('布局编辑原生读回不一致')
  const expectedAfter: PivotAddition = {
    worksheetPath: target.entry,
    sourceSheetName: source.name,
    sourceArea: sourceData.area,
    name: pivot.name,
    location,
    ...layout.definition,
  }
  if (
    !samePivotXml(
      pivotXmlTree((await after.readText(pivot.path))!),
      pivotXmlTree(buildPivotTableXml(Number(table.attrs.cacheId), expectedAfter)),
    )
  )
    throw new Error('布局编辑字段读回不一致')
  const finalCache = pivotXmlTree((await after.readText(pivot.cachePath))!)
  if (finalCache.attrs.refreshOnLoad !== '1') throw new Error('布局缓存缺少刷新标记')
  delete finalCache.attrs.refreshOnLoad
  if (
    !samePivotXml(
      finalCache,
      pivotXmlTree(buildCacheDefinitionXml(recordsRel.id, expectedAfter, 0)),
    )
  )
    throw new Error('布局编辑缓存读回不一致')
  const finalRecords = pivotXmlTree((await after.readText(recordsRel.path))!)
  if (finalRecords.attrs.count !== '0' || finalRecords.children.length)
    throw new Error('布局编辑记录未安全清空')
  const finalTarget = finalView.sheets.find((sheet) => sheet.id === target.id)!
  for (let row = 0; row < layout.matrix.length; row++)
    for (let column = 0; column < layout.matrix[row]!.length; column++) {
      const actual =
        finalTarget.rows
          .find((item) => item.number === location.startRow + row + 1)
          ?.cells.find((item) => item.col === location.startColumn + column)?.rawText ??
        finalTarget.rows
          .find((item) => item.number === location.startRow + row + 1)
          ?.cells.find((item) => item.col === location.startColumn + column)?.text ??
        ''
      if (String(layout.matrix[row]![column] ?? '') !== actual)
        throw new Error('布局汇总格读回不一致')
    }
  const editedRefs = new Set(edits.map((edit) => formatAddress(edit.row, edit.column)))
  const beforeSheet = (await zip.readText(target.entry))!,
    afterSheet = (await after.readText(target.entry))!
  for (const match of beforeSheet.matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const ref = /\br=["']([^"']+)["']/.exec(match[0])?.[1]
    if (ref && !editedRefs.has(ref) && !afterSheet.includes(match[0]))
      throw new Error('布局编辑意外修改范围外单元格')
  }
  check()
  return {
    bytes: output,
    version: expectedVersion + 1,
    changedCells: edits.map((edit) => `${edit.sheetName}!${formatAddress(edit.row, edit.column)}`),
    touchedEntries: [...result.touchedEntries, ...result.removedEntries],
  }
}
