import JSZip from 'jszip'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { NumberingLevel } from '../vendor/packages/docx-engine/src/types.js'
import { escapeXmlAttr } from '../vendor/packages/docx-engine/src/xml-utils.js'
import { splitXmlChildren } from '../vendor/packages/docx-engine/src/generate.js'
import type { PmDocJson } from './docx.js'
import { BoundedZip } from './zip-bounds.js'

export const LIST_DEFINITIONS_ATTR = 'mimirListDefinitions'
export const LIST_FORMATS = [
  'bullet',
  'decimal',
  'decimalZero',
  'upperRoman',
  'lowerRoman',
  'upperLetter',
  'lowerLetter',
  'chineseCountingThousand',
  'chineseCounting',
  'chineseLegalSimplified',
] as const
export type ListLevelPatch = Partial<
  Pick<NumberingLevel, 'numFmt' | 'lvlText' | 'start' | 'indentLeft' | 'hanging' | 'suff' | 'lvlJc'>
>
export interface ListDefinitionEdit {
  numId: string
  baseNumId: string | null
  levels: NumberingLevel[]
  patches: Record<number, ListLevelPatch>
}
export function validateListLevel(patch: ListLevelPatch, index: number): void {
  if (patch.numFmt !== undefined && !(LIST_FORMATS as readonly string[]).includes(patch.numFmt))
    throw new Error('请选择支持的编号格式')
  if (patch.lvlText !== undefined) {
    if (
      typeof patch.lvlText !== 'string' ||
      !patch.lvlText.trim() ||
      patch.lvlText.length > 100 ||
      [...patch.lvlText].some((character) => character.charCodeAt(0) < 32)
    )
      throw new Error('编号格式文字须为 1 至 100 个字符')
    if (
      /%(?![1-9])/.test(patch.lvlText) ||
      [...patch.lvlText.matchAll(/%([1-9])/g)].some((m) => Number(m[1]) > index + 1)
    )
      throw new Error('编号占位符只能引用当前级别和更高级别（%1 至 %9）')
  }
  for (const key of ['start', 'indentLeft', 'hanging'] as const) {
    const value = patch[key]
    if (
      value !== undefined &&
      (!Number.isInteger(value) ||
        value < (key === 'start' ? 1 : 0) ||
        value > (key === 'start' ? 32767 : 31680))
    )
      throw new Error(
        key === 'start' ? '起始编号须为 1 至 32767 的整数' : '缩进须在 0 至 1584 磅之间',
      )
  }
  if (patch.suff !== undefined && !['tab', 'space', 'nothing'].includes(patch.suff))
    throw new Error('编号后缀无效')
  if (patch.lvlJc !== undefined && !['left', 'center', 'right'].includes(patch.lvlJc))
    throw new Error('编号对齐无效')
}
export function listDefinitionEdits(doc: { attrs?: unknown }): ListDefinitionEdit[] {
  const value = (doc.attrs as Record<string, unknown> | undefined)?.[LIST_DEFINITIONS_ATTR]
  if (value == null) return []
  if (!Array.isArray(value) || value.length > 200) throw new Error('列表定义过多或无效')
  const ids = new Set<string>()
  for (const edit of value as ListDefinitionEdit[]) {
    if (
      !edit ||
      !/^\d+$/.test(edit.numId) ||
      ids.has(edit.numId) ||
      (edit.baseNumId !== null && !/^\d+$/.test(edit.baseNumId))
    )
      throw new Error('列表编号无效')
    ids.add(edit.numId)
    if (
      !Array.isArray(edit.levels) ||
      edit.levels.length < 1 ||
      edit.levels.length > 9 ||
      !edit.patches ||
      typeof edit.patches !== 'object'
    )
      throw new Error('列表级别无效')
    for (const [key, patch] of Object.entries(edit.patches)) {
      if (!/^[0-8]$/.test(key)) throw new Error('列表级别须为 1 至 9')
      validateListLevel(patch, Number(key))
    }
  }
  return value as ListDefinitionEdit[]
}
function usedEdits(doc: PmDocJson): ListDefinitionEdit[] {
  const edits = listDefinitionEdits({ attrs: doc.attrs })
  const used = new Set<string>()
  const visit = (node: PmDocJson) => {
    const id = (node.attrs as Record<string, unknown> | undefined)?.numId
    if (typeof id === 'string') used.add(id)
    node.content?.forEach(visit)
  }
  visit(doc)
  for (const edit of edits.toReversed())
    if (used.has(edit.numId) && edit.baseNumId) used.add(edit.baseNumId)
  return edits.filter((edit) => used.has(edit.numId))
}
export function docxListSaveOptions(doc: PmDocJson, options: SaveOptions): SaveOptions {
  const edits = usedEdits(doc)
  if (!edits.length) return options
  const existing = new Set((options.numbering?.newDefs ?? []).map((def) => def.numId))
  if (edits.some((edit) => existing.has(edit.numId)))
    throw new Error('列表编号已变化，请重新打开文档')
  return {
    ...options,
    numbering: {
      ...options.numbering,
      newDefs: [
        ...(options.numbering?.newDefs ?? []),
        ...edits.map((edit) => ({
          numId: edit.numId,
          kind: edit.levels[0]?.numFmt === 'bullet' ? ('bullet' as const) : ('ordered' as const),
          levels: edit.levels.map((level) => ({ ...level, indentLeft: level.indentLeft ?? 720 })),
        })),
      ],
    },
  }
}
/** Complete native element, including a self-closing one. */
function element(xml: string, tag: string, attribute?: string, value?: string): string | null {
  const pattern = new RegExp(`<(/?)w:${tag}(?=[\\s/>])[^>]*>`, 'g')
  let from = -1,
    depth = 0
  for (const match of xml.matchAll(pattern)) {
    const closing = match[1] === '/'
    if (from < 0) {
      if (closing || (attribute && !new RegExp(`\\b${attribute}="${value}"`).test(match[0])))
        continue
      from = match.index
    }
    depth += closing ? -1 : /\/\s*>$/.test(match[0]) ? 0 : 1
    if (depth === 0) return xml.slice(from, match.index + match[0].length)
  }
  return null
}

function setChild(xml: string, tag: string, replacement: string): string {
  const old = element(xml, tag)
  if (old) return xml.replace(old, () => replacement)
  if (xml.endsWith('/>'))
    return xml.slice(0, -2) + '>' + replacement + '</' + xml.match(/^<([^\s/>]+)/)![1] + '>'
  const parent = xml.match(/^<w:([^\s/>]+)/)?.[1]
  const order =
    parent === 'lvl'
      ? [
          'start',
          'numFmt',
          'lvlRestart',
          'pStyle',
          'isLgl',
          'suff',
          'lvlText',
          'lvlPicBulletId',
          'legacy',
          'lvlJc',
          'pPr',
          'rPr',
        ]
      : parent === 'lvlOverride'
        ? ['startOverride', 'lvl']
        : parent === 'pPr'
          ? [
              'pStyle',
              'keepNext',
              'keepLines',
              'pageBreakBefore',
              'framePr',
              'widowControl',
              'numPr',
              'suppressLineNumbers',
              'pBdr',
              'shd',
              'tabs',
              'suppressAutoHyphens',
              'kinsoku',
              'wordWrap',
              'overflowPunct',
              'topLinePunct',
              'autoSpaceDE',
              'autoSpaceDN',
              'bidi',
              'adjustRightInd',
              'snapToGrid',
              'spacing',
              'ind',
              'contextualSpacing',
              'mirrorIndents',
              'suppressOverlap',
              'jc',
              'textDirection',
              'textAlignment',
              'textboxTightWrap',
              'outlineLvl',
              'divId',
              'cnfStyle',
              'rPr',
              'sectPr',
              'pPrChange',
            ]
          : []
  const next = splitXmlChildren(xml.slice(xml.indexOf('>') + 1, xml.lastIndexOf('</'))).find(
    (item) => order.indexOf(item.name.replace(/^w:/, '')) > order.indexOf(tag),
  )
  const at = next ? xml.indexOf(next.xml) : xml.lastIndexOf('</')
  return xml.slice(0, at) + replacement + xml.slice(at)
}
function val(xml: string, tag: string, value: string | number): string {
  const old = element(xml, tag)
  const escaped = escapeXmlAttr(String(value))
  const next = old
    ? /\bw:val="[^"]*"/.test(old)
      ? old.replace(/\bw:val="[^"]*"/, () => `w:val="${escaped}"`)
      : old.replace(/(?=\s*\/?>)/, ` w:val="${escaped}"`)
    : `<w:${tag} w:val="${escaped}"/>`
  return setChild(xml, tag, next)
}
function patchLevel(xml: string, patch: ListLevelPatch): string {
  for (const key of ['numFmt', 'lvlText', 'start', 'suff', 'lvlJc'] as const)
    if (patch[key] !== undefined) xml = val(xml, key, patch[key]!)
  if (patch.numFmt !== undefined || patch.lvlText !== undefined) {
    const picture = element(xml, 'lvlPicBulletId')
    if (picture) xml = xml.replace(picture, '')
  }
  if (patch.indentLeft !== undefined || patch.hanging !== undefined) {
    let ppr = element(xml, 'pPr') ?? '<w:pPr></w:pPr>'
    let ind = element(ppr, 'ind') ?? '<w:ind/>'
    for (const [key, value] of [
      ['left', patch.indentLeft],
      ['hanging', patch.hanging],
    ] as const) {
      if (value === undefined) continue
      const re = new RegExp(`\\bw:${key}="[^"]*"`)
      ind = re.test(ind)
        ? ind.replace(re, `w:${key}="${value}"`)
        : ind.replace(/(?=\s*\/?>)/, ` w:${key}="${value}"`)
    }
    if (patch.hanging !== undefined) ind = ind.replace(/\s+w:firstLine="[^"]*"/g, '')
    ppr = setChild(ppr, 'ind', ind)
    xml = setChild(xml, 'pPr', ppr)
  }
  return xml
}
/** Native writer allocates IDs/relationships; refine only appended definitions. */
export async function docxListSaveResult(bytes: Uint8Array, doc: PmDocJson): Promise<Uint8Array> {
  const edits = usedEdits(doc)
  if (!edits.length) return bytes
  const bounded = await BoundedZip.open(bytes)
  let xml = await bounded.readText('word/numbering.xml')
  if (!xml) throw new Error('缺少原生列表定义')
  const before = xml
  for (const edit of edits) {
    const foundNum = element(xml, 'num', 'w:numId', edit.numId)
    if (!foundNum) throw new Error('列表定义写入失败')
    let num: string = foundNum
    const absId = num && /<w:abstractNumId\b[^>]*w:val="(\d+)"/.exec(num)?.[1]
    const generated: string | null | undefined =
      absId && element(xml, 'abstractNum', 'w:abstractNumId', absId)
    if (!num || !generated || !absId) throw new Error('列表定义写入失败')
    let abstract = generated
    if (edit.baseNumId) {
      const baseNum = element(xml, 'num', 'w:numId', edit.baseNumId)
      const baseId = baseNum && /<w:abstractNumId\b[^>]*w:val="(\d+)"/.exec(baseNum)?.[1]
      const base = baseId && element(xml, 'abstractNum', 'w:abstractNumId', baseId)
      if (!baseNum || !base) throw new Error('原列表定义已变化')
      abstract = base.replace(/\bw:abstractNumId="\d+"/, `w:abstractNumId="${absId}"`)
      const cloneNum = val(
        baseNum.replace(/\bw:numId="\d+"/, `w:numId="${edit.numId}"`),
        'abstractNumId',
        absId,
      )
      xml = xml.replace(num, () => cloneNum)
      num = cloneNum
    }
    for (let i = 0; i < edit.levels.length; i++) {
      if (!element(abstract, 'lvl', 'w:ilvl', String(i))) {
        const fallback = element(generated, 'lvl', 'w:ilvl', String(i))
        if (fallback) abstract = abstract.replace('</w:abstractNum>', fallback + '</w:abstractNum>')
      }
    }
    for (const [key, patch] of Object.entries(edit.patches)) {
      const override = element(num, 'lvlOverride', 'w:ilvl', key)
      const overriddenLevel = override && element(override, 'lvl', 'w:ilvl', key)
      const baseLevel = element(abstract, 'lvl', 'w:ilvl', key)
      const fallback = element(generated, 'lvl', 'w:ilvl', key)
      const level = overriddenLevel ?? baseLevel ?? fallback
      if (!level) throw new Error('当前级别没有可编辑定义')
      const patched = patchLevel(level, patch)
      if (overriddenLevel && override) {
        let nextOverride = override.replace(overriddenLevel, () => patched)
        if (patch.start !== undefined && element(nextOverride, 'startOverride'))
          nextOverride = val(nextOverride, 'startOverride', patch.start)
        const nextNum: string = num.replace(override, () => nextOverride)
        xml = xml.replace(num, () => nextNum)
        num = nextNum
      } else {
        abstract = baseLevel
          ? abstract.replace(baseLevel, () => patched)
          : abstract.replace('</w:abstractNum>', patched + '</w:abstractNum>')
        if (override && patch.start !== undefined) {
          const nextNum: string = num.replace(override, () =>
            val(override, 'startOverride', patch.start!),
          )
          xml = xml.replace(num, () => nextNum)
          num = nextNum
        }
      }
    }
    xml = xml.replace(generated, () => abstract)
  }
  if (xml === before) return bytes
  const zip = await JSZip.loadAsync(bytes)
  zip.file('word/numbering.xml', xml, { date: zip.file('word/numbering.xml')!.date })
  return zip.generateAsync({ type: 'uint8array' })
}
