import { pmDocToSavePlan, pmTableToModel } from '../vendor/apps/docs/src/renderer/editor/convert.js'
import {
  generateTableModelXml,
  splitXmlChildren,
} from '../vendor/packages/docx-engine/src/generate.js'
import { escapeXmlAttr } from '../vendor/packages/docx-engine/src/xml-utils.js'
import type { Block, CellBorder, CellBorders } from '../vendor/packages/docx-engine/src/types.js'
import type { PmDocJson } from './docx.js'

interface Json {
  type: string
  attrs?: Record<string, unknown>
  content?: Json[]
  [key: string]: unknown
}
const TABLE_KEYS = [
  'tblStyleId',
  'tblLook',
  'tblLookEdited',
  'cellMar',
  'cellMarEdited',
  'tblAlign',
  'tblFloat',
  'tblFloatSource',
  'tblFloatSuppressed',
  'tblFloatEdited',
  'tblFloatXTwips',
  'tblFloatYTwips',
  'tblFloatHorzAnchor',
  'tblFloatVertAnchor',
  'tblFloatDistance',
  'tblAutoFit',
  'tblAutoFitEdited',
  'tblFixedLayout',
  'widthPx',
  'widthPct',
  'colWidthsPct',
]
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function inner(xml: string) {
  return xml.slice(xml.indexOf('>') + 1, xml.lastIndexOf('</'))
}
function child(xml: string, name: string) {
  return splitXmlChildren(inner(xml)).find((item) => item.name === name)?.xml
}
const ORDER: Record<string, string[]> = {
  'w:tbl': ['w:tblPr', 'w:tblGrid', 'w:tr'],
  'w:tc': ['w:tcPr', 'w:p', 'w:tbl'],
  'w:tblPr': [
    'w:tblStyle',
    'w:tblpPr',
    'w:tblOverlap',
    'w:bidiVisual',
    'w:tblStyleRowBandSize',
    'w:tblStyleColBandSize',
    'w:tblW',
    'w:jc',
    'w:tblCellSpacing',
    'w:tblInd',
    'w:tblBorders',
    'w:shd',
    'w:tblLayout',
    'w:tblCellMar',
    'w:tblLook',
  ],
  'w:tcPr': [
    'w:cnfStyle',
    'w:tcW',
    'w:gridSpan',
    'w:hMerge',
    'w:vMerge',
    'w:tcBorders',
    'w:shd',
    'w:noWrap',
    'w:tcMar',
    'w:textDirection',
    'w:tcFitText',
    'w:vAlign',
  ],
  'w:tcBorders': [
    'w:top',
    'w:left',
    'w:bottom',
    'w:right',
    'w:insideH',
    'w:insideV',
    'w:tl2br',
    'w:tr2bl',
  ],
}
function setChild(xml: string, name: string, value: string | null, parent: string) {
  const previous = child(xml, name)
  if (previous) return xml.replace(previous, value ?? '')
  if (!value) return xml
  if (xml.endsWith('/>')) xml = xml.slice(0, -2) + `></${parent}>`
  const order = ORDER[parent] ?? []
  const following = splitXmlChildren(inner(xml)).find(
    (item) => order.indexOf(item.name) > order.indexOf(name),
  )
  const at = following ? xml.indexOf(following.xml) : xml.lastIndexOf('</')
  return xml.slice(0, at) + value + xml.slice(at)
}
function borderLineXml(source: string | undefined, side: string, line: CellBorder) {
  let xml = source ?? `<w:${side}/>`
  for (const [name, value] of Object.entries({
    val: line.style,
    sz: line.szEighths,
    color: line.color,
  })) {
    xml = xml.replace(new RegExp(`\\s+w:${name}=(?:"[^"]*"|'[^']*')`, 'g'), '')
    if (value !== undefined)
      xml = xml.replace(/(\/?>)/, ` w:${name}="${escapeXmlAttr(String(value))}"$1`)
  }
  return xml
}
function patchBorders(pr: string, current: CellBorders | null, baseline: CellBorders | null) {
  let borders = child(pr, 'w:tcBorders') ?? '<w:tcBorders></w:tcBorders>'
  for (const side of ['top', 'left', 'bottom', 'right'] as const) {
    const line = current?.[side]
    if (equal(line, baseline?.[side])) continue
    borders = setChild(
      borders,
      `w:${side}`,
      line ? borderLineXml(child(borders, `w:${side}`), side, line) : null,
      'w:tcBorders',
    )
  }
  return setChild(pr, 'w:tcBorders', borders, 'w:tcPr')
}
function sameGrid(a: Json, b: Json) {
  return equal(
    a.content?.map((r) =>
      r.content?.map((c) => [c.type, c.attrs?.colspan, c.attrs?.rowspan, c.attrs?.gridGap]),
    ),
    b.content?.map((r) =>
      r.content?.map((c) => [c.type, c.attrs?.colspan, c.attrs?.rowspan, c.attrs?.gridGap]),
    ),
  )
}
function mapChildren(xml: string, name: string, map: (xml: string, index: number) => string) {
  let cursor = xml.indexOf('>') + 1
  let out = xml.slice(0, cursor)
  let index = 0
  for (const item of splitXmlChildren(inner(xml))) {
    const at = xml.indexOf(item.xml, cursor)
    if (at < cursor) throw new Error('表格XML无法可靠映射')
    out += xml.slice(cursor, at) + (item.name === name ? map(item.xml, index++) : item.xml)
    cursor = at + item.xml.length
  }
  return out + xml.slice(cursor)
}
/** Reuse native text/structure plans, but keep table-design deltas out of a full table rebuild. */
export function docxTableSavePlan(
  edited: PmDocJson,
  original: PmDocJson,
  blocks: readonly Block[],
) {
  const clean = structuredClone(edited) as Json
  const tables: { current: Json; baseline: Json }[] = []
  for (const table of clean.content ?? []) {
    if (table.type !== 'docTable' || table.attrs?.docxIndex == null) continue
    const baseline = original.content?.find(
      (n) =>
        n.type === 'docTable' &&
        (n.attrs as Record<string, unknown>)?.docxIndex === table.attrs?.docxIndex,
    ) as Json | undefined
    if (!baseline || !sameGrid(table, baseline)) continue
    const current = structuredClone(table)
    let changed = false
    for (const key of TABLE_KEYS) {
      if (!equal(table.attrs?.[key], baseline.attrs?.[key])) changed = true
      table.attrs![key] = baseline.attrs?.[key]
    }
    table.content?.forEach((row, ri) =>
      row.content?.forEach((cell, ci) => {
        const base = baseline.content![ri]!.content![ci]!
        for (const key of ['fill', 'borders', 'colwidth']) {
          if (!equal(cell.attrs?.[key], base.attrs?.[key])) changed = true
          cell.attrs![key] = base.attrs?.[key]
        }
      }),
    )
    if (changed) tables.push({ current, baseline })
  }
  const plan = pmDocToSavePlan(clean, [...blocks])
  for (const { current, baseline } of tables) {
    const index = Number(current.attrs!.docxIndex)
    const at = plan.saveBlockIndexByDocx.get(index)
    if (at === undefined) continue
    const block = plan.saveBlocks[at]!
    const inputXml =
      block.kind === 'original'
        ? blocks.find((item) => item.docxIndex === index)?.originalXml
        : block.kind === 'xml'
          ? block.xml
          : undefined
    if (!inputXml) throw new Error('无法保真保存表格设计，请重新打开文档')
    let xml: string = inputXml
    const model = pmTableToModel(current)
    const generated = generateTableModelXml(model, xml)
    const beforePr = child(xml, 'w:tblPr') ?? '<w:tblPr></w:tblPr>'
    const afterPr = child(generated, 'w:tblPr') ?? beforePr
    // Use native values only for changed properties; retain every unrelated tblPr byte.
    let patchedPr = beforePr
    const properties: [string[], string[]][] = [
      [['tblStyleId'], ['w:tblStyle']],
      [['tblLook', 'tblLookEdited'], ['w:tblLook']],
      [['cellMar', 'cellMarEdited'], ['w:tblCellMar']],
      [['tblAlign'], ['w:jc']],
      [
        ['tblAutoFit', 'tblAutoFitEdited', 'tblFixedLayout', 'widthPx', 'widthPct'],
        ['w:tblW', 'w:tblLayout'],
      ],
      [TABLE_KEYS.filter((key) => key.startsWith('tblFloat')), ['w:tblpPr', 'w:tblOverlap']],
    ]
    for (const [keys, names] of properties)
      if (keys.some((key) => !equal(current.attrs?.[key], baseline.attrs?.[key])))
        for (const name of names)
          patchedPr = setChild(patchedPr, name, child(afterPr, name) ?? null, 'w:tblPr')
    // Native drag changes the fixed grid without an AutoFit command. The native
    // generator intentionally retains tblW unless AutoFit was explicitly edited.
    if (
      !equal(current.attrs?.widthPx, baseline.attrs?.widthPx) &&
      current.attrs?.tblAutoFit !== 'contents' &&
      current.attrs?.tblAutoFit !== 'window' &&
      !current.attrs?.widthPct
    ) {
      const total =
        model.colWidthsTwips?.reduce((sum, width) => sum + Math.round(width), 0) ??
        Math.round(Number(current.attrs?.widthPx) * 15)
      if (Number.isFinite(total) && total > 0) {
        let width = child(patchedPr, 'w:tblW') ?? '<w:tblW/>'
        for (const [name, value] of Object.entries({ w: total, type: 'dxa' })) {
          const attribute = new RegExp(`(\\s+w:${name}=)(["'])[^"']*\\2`)
          width = attribute.test(width)
            ? width.replace(attribute, `$1$2${value}$2`)
            : width.replace(/(\/?>)/, ` w:${name}="${value}"$1`)
        }
        patchedPr = setChild(patchedPr, 'w:tblW', width, 'w:tblPr')
      }
    }
    if (patchedPr !== beforePr) xml = setChild(xml, 'w:tblPr', patchedPr, 'w:tbl')
    const gridChanged =
      current.attrs?.tblAutoFit !== 'contents' &&
      !equal(
        current.content?.map((row) => row.content?.map((cell) => cell.attrs?.colwidth)),
        baseline.content?.map((row) => row.content?.map((cell) => cell.attrs?.colwidth)),
      )
    if (gridChanged)
      xml = setChild(xml, 'w:tblGrid', child(generated, 'w:tblGrid') ?? null, 'w:tbl')
    const generatedRows = splitXmlChildren(inner(generated)).filter((item) => item.name === 'w:tr')
    xml = mapChildren(xml, 'w:tr', (sourceRow, ri) => {
      const row = current.content?.[ri]
      if (!row) throw new Error('表格行无法映射到原件')
      const visibleCells = row.content?.filter((cell) => !cell.attrs?.gridGap) ?? []
      const baseCells = baseline.content![ri]!.content?.filter((cell) => !cell.attrs?.gridGap) ?? []
      const generatedCells = splitXmlChildren(inner(generatedRows[ri]?.xml ?? '')).filter(
        (item) => item.name === 'w:tc',
      )
      let ci = 0
      return mapChildren(sourceRow, 'w:tc', (sourceCell, rawCellIndex) => {
        const sourcePr = child(sourceCell, 'w:tcPr') ?? ''
        const merge = /<w:vMerge\b[^>]*\/?\s*>/.exec(sourcePr)?.[0]
        if (merge && !/w:val=["']restart["']/.test(merge)) {
          if (!gridChanged) return sourceCell
          const width = child(
            child(generatedCells[rawCellIndex]?.xml ?? '', 'w:tcPr') ?? '',
            'w:tcW',
          )
          return setChild(
            sourceCell,
            'w:tcPr',
            setChild(sourcePr, 'w:tcW', width ?? null, 'w:tcPr'),
            'w:tc',
          )
        }
        const cell = visibleCells[ci]
        const base = baseCells[ci++]
        if (!cell || !base) throw new Error('表格单元格无法映射到原件')
        if (
          !gridChanged &&
          !current.attrs?.mimirTablePreset &&
          equal(cell.attrs?.fill, base.attrs?.fill) &&
          equal(cell.attrs?.borders, base.attrs?.borders)
        )
          return sourceCell
        // A vertical merge's continuation has no PM node. Skip those raw cells in later rows.
        let pr = child(sourceCell, 'w:tcPr') ?? '<w:tcPr></w:tcPr>'
        if (gridChanged)
          pr = setChild(
            pr,
            'w:tcW',
            child(child(generatedCells[rawCellIndex]?.xml ?? '', 'w:tcPr') ?? '', 'w:tcW') ?? null,
            'w:tcPr',
          )
        if (current.attrs?.mimirTablePreset || !equal(cell.attrs?.fill, base.attrs?.fill))
          pr = setChild(
            pr,
            'w:shd',
            cell.attrs?.fill
              ? `<w:shd w:val="clear" w:color="auto" w:fill="${escapeXmlAttr(String(cell.attrs.fill))}"/>`
              : null,
            'w:tcPr',
          )
        if (!equal(cell.attrs?.borders, base.attrs?.borders))
          pr = patchBorders(
            pr,
            cell.attrs?.borders as CellBorders | null,
            base.attrs?.borders as CellBorders | null,
          )
        return setChild(sourceCell, 'w:tcPr', pr, 'w:tc')
      })
    })
    plan.saveBlocks[at] = { ...block, kind: 'xml', xml }
  }
  return plan
}
