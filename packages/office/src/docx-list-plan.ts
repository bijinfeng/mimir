import { splitXmlChildren } from '../vendor/packages/docx-engine/src/generate.js'
import type { Block } from '../vendor/packages/docx-engine/src/types.js'
import type { PmDocJson } from './docx.js'
import { docxTableSavePlan } from './docx-table-save.js'
interface Json {
  type: string
  attrs?: Record<string, unknown>
  content?: Json[]
}
const PARAGRAPHS = new Set(['docParagraph', 'docHeading', 'docListItem'])
const LIST_KEYS = ['kind', 'numId', 'ilvl']
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function inner(xml: string) {
  return xml.slice(xml.indexOf('>') + 1, xml.lastIndexOf('</'))
}
function child(xml: string, name: string) {
  return splitXmlChildren(inner(xml)).find((item) => item.name === name)?.xml
}
function setChild(xml: string, name: string, value: string, order: string[] = []) {
  const previous = child(xml, name)
  if (previous) return xml.replace(previous, () => value)
  if (xml.endsWith('/>')) xml = xml.slice(0, -2) + `></${xml.match(/^<([^\s/>]+)/)![1]}>`
  const following = splitXmlChildren(inner(xml)).find(
    (item) => order.indexOf(item.name) > order.indexOf(name),
  )
  const at = following ? xml.indexOf(following.xml) : xml.lastIndexOf('</')
  return xml.slice(0, at) + value + xml.slice(at)
}
function numberingProperties(ppr: string, current: Json): string {
  let num = child(ppr, 'w:numPr') ?? '<w:numPr></w:numPr>'
  const id = current.type === 'docListItem' ? String(current.attrs?.numId ?? '0') : '0'
  if (!/^\d+$/.test(id)) throw new Error('段落编号无效')
  const level = Math.min(8, Math.max(0, Number(current.attrs?.ilvl) || 0))
  const setVal = (tag: string, value: string) => {
    const old = child(num, tag)
    const next = old
      ? /\bw:val="[^"]*"/.test(old)
        ? old.replace(/\bw:val="[^"]*"/, `w:val="${value}"`)
        : old.replace(/(?=\s*\/?>)/, ` w:val="${value}"`)
      : `<${tag} w:val="${value}"/>`
    num = setChild(num, tag, next, ['w:ilvl', 'w:numId', 'w:numberingChange', 'w:ins'])
  }
  setVal('w:ilvl', String(level))
  setVal('w:numId', id)
  return setChild(ppr, 'w:numPr', num, [
    'w:pStyle',
    'w:keepNext',
    'w:keepLines',
    'w:pageBreakBefore',
    'w:framePr',
    'w:widowControl',
    'w:numPr',
    'w:suppressLineNumbers',
    'w:pBdr',
    'w:shd',
    'w:tabs',
    'w:spacing',
    'w:ind',
    'w:jc',
    'w:rPr',
    'w:sectPr',
    'w:pPrChange',
  ])
}
function paragraphXml(xml: string, current: Json): string {
  const paragraph = /<w:p(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/.exec(xml)?.[0]
  if (!paragraph || (paragraph.match(/<w:p(?=[\s/>])/g)?.length ?? 0) !== 1)
    throw new Error('无法可靠映射列表段落')
  const ppr = child(paragraph, 'w:pPr') ?? '<w:pPr></w:pPr>'
  return xml.replace(paragraph, () =>
    setChild(paragraph, 'w:pPr', numberingProperties(ppr, current), [
      'w:pPr',
      'w:r',
      'w:hyperlink',
    ]),
  )
}
/** Preserve raw paragraph properties for list changes before the generic text/format diff. */
export function docxListSavePlan(edited: PmDocJson, original: PmDocJson, blocks: readonly Block[]) {
  const clean = structuredClone(edited) as Json
  const changes: { current: Json; index: number }[] = []
  const firstByAnchor = new Map<number, Json>()
  for (const node of clean.content ?? [])
    if (node.attrs?.docxIndex != null && !firstByAnchor.has(Number(node.attrs.docxIndex)))
      firstByAnchor.set(Number(node.attrs.docxIndex), node)
  const tableChanges: { index: number; paragraphs: Map<number, Json>; count: number }[] = []
  const normalize = (node: Json, baseline: Json) => {
    const current = structuredClone(node)
    node.type = baseline.type
    for (const key of [...LIST_KEYS, 'level']) {
      if (baseline.attrs && key in baseline.attrs) node.attrs![key] = baseline.attrs[key]
      else delete node.attrs![key]
    }
    return current
  }
  const listChanged = (node: Json, baseline: Json) =>
    (node.type === 'docListItem' || baseline.type === 'docListItem') &&
    (node.type !== baseline.type ||
      !LIST_KEYS.every((key) => equal(node.attrs?.[key], baseline.attrs?.[key])))
  const sameStructure = (a: Json, b: Json): boolean => {
    if (PARAGRAPHS.has(a.type) && PARAGRAPHS.has(b.type)) return true
    return (
      a.type === b.type &&
      ['colspan', 'rowspan', 'gridGap'].every((key) => equal(a.attrs?.[key], b.attrs?.[key])) &&
      (a.content?.length ?? 0) === (b.content?.length ?? 0) &&
      (a.content ?? []).every((node, i) => sameStructure(node, b.content![i]!))
    )
  }
  for (const table of clean.content ?? []) {
    if (
      table.type !== 'docTable' ||
      table.attrs?.docxIndex == null ||
      firstByAnchor.get(Number(table.attrs.docxIndex)) !== table
    )
      continue
    const baseline = original.content?.find(
      (item) =>
        (item.attrs as Record<string, unknown> | undefined)?.docxIndex === table.attrs?.docxIndex,
    ) as Json | undefined
    if (!baseline || !sameStructure(table, baseline)) continue
    let ordinal = 0
    const paragraphs = new Map<number, Json>()
    const visit = (node: Json, base: Json) => {
      if (PARAGRAPHS.has(node.type)) {
        if (listChanged(node, base)) paragraphs.set(ordinal, normalize(node, base))
        ordinal++
        return
      }
      node.content?.forEach((childNode, i) => visit(childNode, base.content![i]!))
    }
    visit(table, baseline)
    if (paragraphs.size)
      tableChanges.push({ index: Number(table.attrs.docxIndex), paragraphs, count: ordinal })
  }
  for (const node of clean.content ?? []) {
    if (
      !PARAGRAPHS.has(node.type) ||
      node.attrs?.docxIndex == null ||
      firstByAnchor.get(Number(node.attrs.docxIndex)) !== node
    )
      continue
    const baseline = original.content?.find(
      (item) =>
        (item.attrs as Record<string, unknown> | undefined)?.docxIndex === node.attrs?.docxIndex,
    ) as Json | undefined
    if (!baseline || !PARAGRAPHS.has(baseline.type)) continue
    if (!listChanged(node, baseline)) continue
    changes.push({ current: normalize(node, baseline), index: Number(node.attrs.docxIndex) })
  }
  const plan = docxTableSavePlan(clean as PmDocJson, original, blocks)
  for (const { current, index } of changes) {
    const at = plan.saveBlockIndexByDocx.get(index)
    if (at === undefined) throw new Error('列表段落已变化，无法保真保存')
    const block = plan.saveBlocks[at]!
    const source = blocks.find((item) => item.docxIndex === index)
    if (!source?.originalXml) throw new Error('缺少原列表段落')
    if (block.kind === 'original') {
      // Only list identity changed: every run, attribute and unknown child stays byte-identical.
      plan.saveBlocks[at] = {
        ...block,
        kind: 'xml',
        xml: paragraphXml(source.originalXml, current),
      }
    } else if (block.kind === 'xml') {
      plan.saveBlocks[at] = { ...block, xml: paragraphXml(block.xml, current) }
    } else if (block.kind === 'generated') {
      const ppr = block.block.rawPPr ?? source.rawPPr ?? '<w:pPr></w:pPr>'
      block.block.rawPPr = numberingProperties(ppr, current)
    } else throw new Error('当前段落结构不支持列表设置')
  }
  for (const { index, paragraphs, count } of tableChanges) {
    const at = plan.saveBlockIndexByDocx.get(index)
    const block = at !== undefined ? plan.saveBlocks[at] : null
    const source =
      block?.kind === 'original'
        ? blocks.find((item) => item.docxIndex === index)?.originalXml
        : block?.kind === 'xml'
          ? block.xml
          : null
    if (
      !source ||
      at === undefined ||
      !block ||
      (source.match(/<w:p(?=[\s/>])/g)?.length ?? 0) !== count
    )
      throw new Error('当前表格包含无法可靠映射的列表段落，请先取消此列表修改')
    let ordinal = 0
    const xml = source.replace(/<w:p(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g, (paragraph) => {
      const current = paragraphs.get(ordinal++)
      return current ? paragraphXml(paragraph, current) : paragraph
    })
    if (ordinal !== count) throw new Error('当前表格列表无法保真保存')
    plan.saveBlocks[at] = { ...block, kind: 'xml', xml }
  }
  return plan
}
