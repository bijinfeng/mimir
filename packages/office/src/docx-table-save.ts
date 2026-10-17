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
  'tblFloatXSpec',
  'tblFloatYSpec',
  'tblFloatWidthPx',
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
function positionAttributes(tag: string) {
  return [...tag.slice(0, tag.indexOf('>') + 1).matchAll(/\s+([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)]
}
function positionBindings(parent: Record<string, string>, tag: string) {
  const namespaces = { ...parent }
  for (const match of positionAttributes(tag))
    if (match[1]!.startsWith('xmlns:')) namespaces[match[1]!.slice(6)] = match[3]!
  return namespaces
}
/** Imported positioning must be interpretable before the UI offers numeric editing. */
export function docxTablePositionIssue(xml: string): string | null {
  const pr = child(xml, 'w:tblPr')
  if (!pr) return null
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const strictWord = 'http://purl.oclc.org/ooxml/wordprocessingml/main'
  const namespaces = positionBindings(positionBindings({ w: word }, xml), pr)
  const isWord = (uri: string | undefined) => uri === word || uri === strictWord
  if (!isWord(namespaces.w)) return '原件定位命名空间无法可靠映射，暂不能编辑定位'
  for (const item of splitXmlChildren(inner(pr))) {
    if (item.name.split(':').at(-1) !== 'tblpPr') continue
    const localNamespaces = positionBindings(namespaces, item.xml)
    const prefix = item.name.split(':')[0]!
    if (item.name !== 'w:tblpPr') {
      if (!localNamespaces[prefix] || isWord(localNamespaces[prefix]))
        return '原件使用尚不能映射的定位命名空间别名，暂不能编辑定位'
      continue
    }
    if (!isWord(localNamespaces.w)) return '原件定位命名空间无法可靠映射，暂不能编辑定位'
    for (const match of positionAttributes(item.xml)) {
      const name = match[1]!
      if (name.startsWith('xmlns:') || !name.includes(':') || name.startsWith('w:')) continue
      const uri = localNamespaces[name.split(':')[0]!]
      // The fixed native parser only interprets literal w: attributes. An alias
      // must not be shown as zero or patched into duplicate native attributes.
      if (!uri || isWord(uri)) return '原件使用尚不能映射的定位属性命名空间，暂不能编辑定位'
    }
  }
  const positions = splitXmlChildren(inner(pr)).filter((item) => item.name === 'w:tblpPr')
  if (positions.length > 1) return '原件含多个表格定位节点，暂不能编辑定位'
  const position = positions[0]?.xml
  if (!position) return null
  if (!/^<w:tblpPr\b[^>]*(?:\/\s*>|>(?:\s|<!--[\s\S]*?-->)*<\/w:tblpPr>)$/.test(position))
    return '原件含复杂表格定位内容，暂不能编辑定位'
  const seen = new Set<string>()
  const known: Record<string, RegExp> = {
    tblpX: /^-?\d+$/,
    tblpY: /^-?\d+$/,
    leftFromText: /^\d+$/,
    rightFromText: /^\d+$/,
    topFromText: /^\d+$/,
    bottomFromText: /^\d+$/,
    horzAnchor: /^(page|margin|text)$/,
    vertAnchor: /^(page|margin|text)$/,
    tblpXSpec: /^(left|center|right|inside|outside)$/,
    tblpYSpec: /^(top|center|bottom|inside|outside)$/,
  }
  for (const match of position
    .slice(0, position.indexOf('>') + 1)
    .matchAll(/\s+w:([\w.-]+)\s*=\s*(["'])(.*?)\2/g)) {
    const name = match[1]!,
      value = match[3]!
    if (
      seen.has(name) ||
      !known[name]?.test(value) ||
      (/^-?\d+$/.test(value) &&
        (!Number.isSafeInteger(Number(value)) || Math.abs(Number(value)) > 31680))
    )
      return '原件含无法解释的表格定位属性，暂不能编辑定位'
    seen.add(name)
  }
  return null
}
function positionAttribute(xml: string, name: string, value: unknown) {
  const attribute = new RegExp(`(\\s+w:${name}\\s*=\\s*)(["'])[^"']*\\2`)
  if (value == null) return xml.replace(attribute, '')
  const escaped = escapeXmlAttr(String(value))
  return attribute.test(xml)
    ? xml.replace(attribute, (_match, prefix, quote) => `${prefix}${quote}${escaped}${quote}`)
    : xml.replace(/(\/?>)/, ` w:${name}="${escaped}"$1`)
}
function patchPosition(pr: string, current: Json, baseline: Json): string {
  const attrs = current.attrs!,
    base = baseline.attrs!
  const floatSide = attrs.tblFloat ?? (attrs.tblFloatSuppressed ? attrs.tblFloatSource : null)
  const baseSide = base.tblFloat ?? (base.tblFloatSuppressed ? base.tblFloatSource : null)
  if (
    Boolean(floatSide && floatSide !== 'none') === Boolean(baseSide && baseSide !== 'none') &&
    [
      'tblFloatXTwips',
      'tblFloatYTwips',
      'tblFloatXSpec',
      'tblFloatYSpec',
      'tblFloatHorzAnchor',
      'tblFloatVertAnchor',
      'tblFloatDistance',
    ].every((key) => equal(attrs[key], base[key]))
  )
    return pr
  const issue = docxTablePositionIssue(`<w:tbl>${pr}</w:tbl>`)
  if (issue) throw new Error(issue)
  if (!floatSide || floatSide === 'none') return setChild(pr, 'w:tblpPr', null, 'w:tblPr')
  let position = child(pr, 'w:tblpPr') ?? '<w:tblpPr/>'
  const fresh = !child(pr, 'w:tblpPr')
  for (const [key, name] of [
    ['tblFloatXTwips', 'tblpX'],
    ['tblFloatYTwips', 'tblpY'],
    ['tblFloatXSpec', 'tblpXSpec'],
    ['tblFloatYSpec', 'tblpYSpec'],
    ['tblFloatHorzAnchor', 'horzAnchor'],
    ['tblFloatVertAnchor', 'vertAnchor'],
  ]) {
    if (fresh || !equal(attrs[key!], base[key!]))
      position = positionAttribute(position, name!, attrs[key!])
  }
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const value = (attrs.tblFloatDistance as Record<string, number> | null)?.[side]
    const previous = (base.tblFloatDistance as Record<string, number> | null)?.[side]
    if (fresh || !equal(value, previous))
      position = positionAttribute(position, `${side}FromText`, value)
  }
  // tblOverlap is independent of a coordinate edit. Preserve it, including never-overlap.
  return setChild(pr, 'w:tblpPr', position, 'w:tblPr')
}
/** Reuse native text/structure plans, but keep table-design deltas out of a full table rebuild. */
export function docxTableSavePlan(
  edited: PmDocJson,
  original: PmDocJson,
  blocks: readonly Block[],
) {
  const clean = structuredClone(edited) as Json
  const tables: { current: Json; baseline: Json; positionOnly?: boolean }[] = []
  for (const table of clean.content ?? []) {
    if (table.type !== 'docTable' || table.attrs?.docxIndex == null) continue
    const baseline = original.content?.find(
      (n) =>
        n.type === 'docTable' &&
        (n.attrs as Record<string, unknown>)?.docxIndex === table.attrs?.docxIndex,
    ) as Json | undefined
    if (!baseline) continue
    const current = structuredClone(table)
    if (!sameGrid(table, baseline)) {
      const keys = TABLE_KEYS.filter((key) => key.startsWith('tblFloat'))
      if (keys.some((key) => !equal(table.attrs?.[key], baseline.attrs?.[key]))) {
        for (const key of keys) table.attrs![key] = baseline.attrs?.[key]
        tables.push({ current, baseline, positionOnly: true })
      }
      continue
    }
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
  for (const { current, baseline, positionOnly } of tables) {
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
    if (positionOnly) {
      const pr = child(xml, 'w:tblPr') ?? '<w:tblPr></w:tblPr>'
      plan.saveBlocks[at] = {
        ...block,
        kind: 'xml',
        xml: setChild(xml, 'w:tblPr', patchPosition(pr, current, baseline), 'w:tbl'),
      }
      continue
    }
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
    ]
    for (const [keys, names] of properties)
      if (keys.some((key) => !equal(current.attrs?.[key], baseline.attrs?.[key])))
        for (const name of names)
          patchedPr = setChild(patchedPr, name, child(afterPr, name) ?? null, 'w:tblPr')
    if (
      TABLE_KEYS.filter((key) => key.startsWith('tblFloat')).some(
        (key) => !equal(current.attrs?.[key], baseline.attrs?.[key]),
      )
    )
      patchedPr = patchPosition(patchedPr, current, baseline)
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
