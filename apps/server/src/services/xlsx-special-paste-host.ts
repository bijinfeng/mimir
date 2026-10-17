import { parseAddress } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type { XlsxSpecialPaste } from '@mimir/shared'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { readXlsxRangeXmlTree } from '../../../../packages/office/src/xlsx-native-xml.js'
import { translateSharedFormula } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import { cellMap, replaceCells, assertOrdinaryFormulas } from './xlsx-agent-range.js'
import { assembleXlsxManualRange, applyXlsxManualOperation } from './xlsx-manual-ops.js'
import { xlsxRangeStyles } from './xlsx-range-styles.js'
import { planXlsxRangeStructures } from './xlsx-range-structures.js'
import { assertXlsxRangeFeatures, assertXlsxSheetWritable } from './xlsx-range-features.js'
import {
  planXlsxRangeRules,
  xlsxNativeRuleReaders,
  bindXlsxRangeValidation,
} from './xlsx-range-rules.js'
import {
  planXlsxPasteGeometry,
  planXlsxPasteColumnWidths,
  projectXlsxPasteCell,
  xlsxPasteAddresses,
  createXlsxPasteBorderStyles,
  writeXlsxPasteColumnWidths,
} from './xlsx-special-paste.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'

/** One frozen source and one candidate for every special mode and every tile. */
export async function applyXlsxSpecialPaste(
  bytes: Uint8Array,
  op: XlsxSpecialPaste,
  version: number,
): Promise<XlsxHostResult> {
  const geometry = planXlsxPasteGeometry(op.source, op.target, op.kind, op.mode)
  if (op.kind === 'cut')
    return applyXlsxManualOperation(
      bytes,
      {
        op: 'move_range',
        sheetId: op.sheetId,
        sourceSheetId: op.sourceSheetId,
        source: op.source,
        target: op.target.split(':')[0]!,
      },
      version,
    )
  const zip = await BoundedZip.open(bytes),
    view = await readXlsx(bytes)
  const source = view.sheets.find((sheet) => sheet.id === op.sourceSheetId),
    target = view.sheets.find((sheet) => sheet.id === op.sheetId)
  if (!source || !target) throw new Error('工作表ID已失效，请重新复制')
  const sourceXml = (await zip.readText(source.entry))!,
    targetXml = source.entry === target.entry ? sourceXml : (await zip.readText(target.entry))!
  assertXlsxSheetWritable(targetXml)
  assertOrdinaryFormulas(sourceXml)
  assertOrdinaryFormulas(targetXml)
  const sourceCells = cellMap(sourceXml),
    targetCells = source.entry === target.entry ? sourceCells : cellMap(targetXml)
  const sourceStyle = xlsxRangeStyles(sourceXml, sourceCells),
    targetStyle = xlsxRangeStyles(targetXml, targetCells)
  const structures = await planXlsxRangeStructures(
    zip,
    { entry: source.entry, xml: sourceXml, bounds: geometry.source },
    { entry: target.entry, xml: targetXml, bounds: geometry.target },
    false,
    {
      features: ['all', 'besides-border'].includes(op.mode)
        ? 'all'
        : op.mode === 'format'
          ? 'merge'
          : 'preserve',
      tiles: geometry.tiles,
    },
  )
  const stylesXml = await zip.readText('xl/styles.xml')
  const rules = planXlsxRangeRules(
    {
      sheets: [
        { entry: source.entry, name: source.name, xml: sourceXml },
        ...(source.entry === target.entry
          ? []
          : [{ entry: target.entry, name: target.name, xml: targetXml }]),
      ],
      source: { entry: source.entry, bounds: geometry.source },
      target: { entry: target.entry, bounds: geometry.target },
      move: false,
      kinds: ['all', 'besides-border'].includes(op.mode)
        ? ['cf', 'dv']
        : op.mode === 'format'
          ? ['cf']
          : [],
      tiles: geometry.tiles,
      stylesXml: stylesXml ?? undefined,
      candidateBases: structures.replacements,
    },
    xlsxNativeRuleReaders(),
  )
  const areas =
    source.entry === target.entry ? [geometry.source, geometry.target] : [geometry.source]
  await assertXlsxRangeFeatures(
    zip,
    source.entry,
    sourceXml,
    areas,
    structures.permit,
    rules.permit,
  )
  if (source.entry !== target.entry)
    await assertXlsxRangeFeatures(
      zip,
      target.entry,
      targetXml,
      [geometry.target],
      structures.permit,
      rules.permit,
    )
  if (
    source.entry === target.entry &&
    ['all', 'format', 'besides-border'].includes(op.mode) &&
    JSON.stringify(geometry.source) === JSON.stringify(geometry.target)
  )
    return { bytes, version, changedCells: [], touchedEntries: [] }
  const replacements = new Map([...structures.replacements, ...rules.replacements])
  let updated = replacements.get(target.entry) ?? targetXml
  const changedCells: string[] = []
  if (op.mode === 'column-width') {
    const root = readXlsxRangeXmlTree(sourceXml),
      columns = root.children.find((node) => node.local === 'cols')?.children ?? []
    const nativeDefault = Number(
      root.children.find((node) => node.local === 'sheetFormatPr')?.attrs.get('defaultColWidth') ??
        (88 - 5) / 7,
    )
    const sourceWidths: number[] = []
    if (columns.length * (geometry.source.endColumn - geometry.source.startColumn + 1) > 2000000)
      throw new Error('来源列宽查找超过预算')
    // Fixed Univer default 88px corresponds to (88-5)/7 native character units.
    for (let from = geometry.source.startColumn; from <= geometry.source.endColumn; from++) {
      let width = nativeDefault
      for (const node of columns)
        if (
          from >= Number(node.attrs.get('min')) - 1 &&
          from <= Number(node.attrs.get('max')) - 1 &&
          node.attrs.has('width')
        )
          width = Number(node.attrs.get('width'))
      sourceWidths.push(width)
    }
    const widths = planXlsxPasteColumnWidths(
      sourceWidths,
      geometry.target,
      (88 - 5) / 7,
      // The native writer resolves overlapping target declarations and skips hidden columns.
      () => true,
    )
    updated = writeXlsxPasteColumnWidths(updated, widths)
  } else {
    const stringsXml = await zip.readText('xl/sharedStrings.xml')
    const strings = stringsXml
      ? readXlsxRangeXmlTree(stringsXml).children.map((node) =>
          stringsXml.slice(node.start, node.end),
        )
      : []
    const border =
      op.mode === 'besides-border' && stylesXml ? createXlsxPasteBorderStyles(stylesXml) : undefined
    const writes = new Map<string, string>()
    for (const position of xlsxPasteAddresses(geometry)) {
      const from = parseAddress(position.source),
        to = parseAddress(position.target)
      const original = targetCells.get(position.target) ?? ''
      const projected = projectXlsxPasteCell(
        {
          sourceXml: sourceCells.get(position.source) ?? '',
          targetXml: original,
          sourceStyle: sourceStyle(from.row, from.column),
          targetStyle: targetStyle(to.row, to.column),
          targetAddress: position.target,
          rowDelta: position.rowDelta,
          columnDelta: position.columnDelta,
          mode: op.mode,
        },
        {
          sharedString: (index) => strings[index],
          translateFormula: (formula, dr, dc) => {
            const result = translateSharedFormula(formula, dr, dc)
            if (result === null) throw new Error('公式平移超出边界')
            return result
          },
          mergeBorder: (sourceIndex, targetIndex) => {
            if (border) return border.mergeBorder(sourceIndex, targetIndex)
            if (sourceIndex === '0' && targetIndex === '0') return '0'
            throw new Error('原生样式表缺失')
          },
        },
      )
      if (projected !== original) {
        writes.set(position.target, projected)
        changedCells.push(`${target.id}:${position.target}`)
      }
    }
    if (writes.size) updated = replaceCells(updated, writes)
    const nextStyles = border?.result()
    if (nextStyles && nextStyles !== stylesXml) replacements.set('xl/styles.xml', nextStyles)
  }
  if (updated !== targetXml) replacements.set(target.entry, updated)
  else replacements.delete(target.entry)
  for (const [entry, value] of replacements)
    if (value === (await zip.readText(entry))) replacements.delete(entry)
  if (!replacements.size) return { bytes, version, changedCells: [], touchedEntries: [] }
  const result = await assembleXlsxManualRange(bytes, replacements, changedCells, version)
  bindXlsxRangeValidation(result.bytes, rules, { entry: target.entry, bounds: geometry.target })
  return result
}
