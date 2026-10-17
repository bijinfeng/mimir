import { readXlsxRangeXmlTree, readXlsxFormulaCharacterData } from './xlsx-native-xml.js'
import type { XlsxCfRule } from './xlsx-cell-effects.js'
import { decodeXlsxEscapes } from '../vendor/packages/xlsx-gateway/src/gateway/xlsx-escapes.js'
import type { BoundedZip } from './zip-bounds.js'
import { decodeXlsxXml } from './xlsx-format.js'
import {
  formatAddress,
  parseAddress,
  parseRange,
  rangeCellCount,
} from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'

export interface XlsxNote {
  row: number
  column: number
  author: string
  text: string
}
export interface XlsxSheetExtras {
  protected: boolean
  passwordProtected: boolean
  hyperlinks: Record<string, string>
  notes: Record<string, XlsxNote>
  richNotes: boolean
  frozenRows?: number
  frozenColumns?: number
  cfRules?: XlsxCfRule[]
  validations?: XlsxValidationRule[]
  conditionalFormats?: { range: string; types: string[] }[]
  pageSetup?: Record<string, string>
  headers?: { header: string; footer: string }
  sparklines?: { cell: string; source: string; type: string; color?: string }[]
}
export interface XlsxValidationRule {
  range: string
  type: string
  formula1: string
  formula2: string
  operator: string
  allowBlank: boolean
  error: string
  showErrorMessage?: boolean
  errorStyle?: string
  errorTitle?: string
  showInputMessage?: boolean
  promptTitle?: string
  prompt?: string
  /** Native OOXML: true suppresses the dropdown. */
  showDropDown?: boolean
  xml?: string
  unsupported?: string
}
export function xlsxAttribute(xml: string, key: string): string | undefined {
  const value = new RegExp(`(?:^|\\s)${key}=(?:"([^"]*)"|'([^']*)')`).exec(xml)
  return value ? decodeXlsxXml(value[1] ?? value[2] ?? '') : undefined
}
function text(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXlsxEscapes(decodeXlsxXml(match[1]!)))
    .join('')
}
function validationAttribute(xml: string, key: string) {
  for (const [, name, double, single] of xml.matchAll(
    /(?:^|\s)([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    if (name === key) return decodeXlsxXml(double ?? single ?? '')
  }
  return undefined
}
function validationUnsupported(attrs: string, body: string) {
  if (/<(?:\w+:)?extLst\b/.test(body)) return '扩展数据验证暂不支持计算'
  const names = new Set<string>()
  let duplicate = false
  const rest = attrs
    .replace(/(?:^|\s)([^\s=/>]+)\s*=\s*(?:"[^"]*"|'[^']*')/g, (_whole, name: string) => {
      if (names.has(name)) duplicate = true
      names.add(name)
      return ''
    })
    .trim()
    .replace(/\/$/, '')
  if (duplicate || rest) return '原件验证属性存在重复或无法可靠读取'
  for (const key of ['showErrorMessage', 'showInputMessage', 'showDropDown', 'allowBlank']) {
    const value = validationAttribute(attrs, key)
    if (value !== undefined && !['0', '1', 'true', 'false'].includes(value))
      return '原件验证开关无法识别'
  }
  for (const key of ['promptTitle', 'errorTitle', 'prompt', 'error']) {
    const value = decodeXlsxEscapes(validationAttribute(attrs, key) ?? '')
    if (value.length > (key.endsWith('Title') ? 32 : 255))
      return '原件验证提示超过标准长度，暂不支持编辑'
  }
  return undefined
}
/** Native QName-aware reading shared by the browser and the host candidate post-check. */
export function readXlsxNativeValidations(xml: string): XlsxValidationRule[] {
  if (!xml.includes('dataValidation')) return []
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const root = readXlsxRangeXmlTree(xml)
  return root.children
    .filter((node) => node.local === 'dataValidations')
    .flatMap((container) =>
      container.children.map((node) => {
        const attrs = xml.slice(node.start + node.tag.length + 1, node.openEnd - 1)
        const body = xml.slice(node.openEnd, node.closeStart)
        const value = (name: string) => node.attrs.get(name)
        const flag = (name: string) => /^(?:1|true)$/.test(value(name) ?? '')
        const formula = (name: string) => {
          const found = node.children.filter((item) => item.local === name)
          if (found.length > 1 || found.some((item) => item.ns !== main || item.children.length))
            throw new Error('原件数据验证公式无法可靠读取')
          return found[0]
            ? readXlsxFormulaCharacterData(xml.slice(found[0].openEnd, found[0].closeStart))
            : ''
        }
        return {
          xml: xml.slice(node.start, node.end),
          unsupported:
            container.ns !== main || node.ns !== main || node.local !== 'dataValidation'
              ? '原件数据验证命名空间或结构无法识别'
              : validationUnsupported(attrs, body),
          showErrorMessage: flag('showErrorMessage'),
          errorStyle: value('errorStyle') ?? 'stop',
          errorTitle: decodeXlsxEscapes(value('errorTitle') ?? ''),
          showInputMessage: flag('showInputMessage'),
          promptTitle: decodeXlsxEscapes(value('promptTitle') ?? ''),
          prompt: decodeXlsxEscapes(value('prompt') ?? ''),
          showDropDown: flag('showDropDown'),
          range: value('sqref') ?? '',
          type: value('type') ?? 'none',
          operator: value('operator') ?? 'between',
          allowBlank: flag('allowBlank'),
          error: decodeXlsxEscapes(value('error') ?? ''),
          formula1: formula('formula1'),
          formula2: formula('formula2'),
        }
      }),
    )
}
function resolvePart(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const segments = base.split('/').slice(0, -1)
  for (const segment of target.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment !== '.') segments.push(segment)
  }
  return segments.join('/')
}
export async function readXlsxSheetExtras(
  zip: BoundedZip,
  entry: string,
  xml: string,
): Promise<XlsxSheetExtras> {
  const protection = /<sheetProtection\b[^>]*>/.exec(xml)?.[0] ?? ''
  const protectedSheet = !!protection && !/\bsheet=(?:"0"|'0'|"false"|'false')/.test(protection)
  const rels =
    (await zip.readText(entry.replace(/^(xl\/worksheets\/)([^/]+)$/, '$1_rels/$2.rels'))) ?? ''
  const targets = new Map<string, string>()
  let comments: string | undefined
  for (const [relation] of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = xlsxAttribute(relation, 'Id'),
      target = xlsxAttribute(relation, 'Target'),
      type = xlsxAttribute(relation, 'Type')
    if (id && target && type?.endsWith('/hyperlink')) targets.set(id, target)
    if (target && type?.endsWith('/comments')) comments = resolvePart(entry, target)
  }
  const hyperlinks: Record<string, string> = {}
  for (const [link] of xml.matchAll(/<hyperlink\b[^>]*>/g)) {
    const ref = xlsxAttribute(link, 'ref'),
      location = xlsxAttribute(link, 'location'),
      id = xlsxAttribute(link, 'r:id')
    const target = location !== undefined ? '#' + location : id ? targets.get(id) : undefined
    if (!ref || target === undefined) continue
    const bounds = parseRange(ref)
    // Range hyperlinks can span an entire column. Only materialize a bounded
    // subset here; the original OOXML remains unchanged by reading.
    if (rangeCellCount(bounds) > 2000) continue
    for (let row = bounds.startRow; row <= bounds.endRow; row++)
      for (let column = bounds.startColumn; column <= bounds.endColumn; column++)
        hyperlinks[formatAddress(row, column)] = target
  }
  const notes: Record<string, XlsxNote> = {}
  const commentXml = comments ? await zip.readText(comments) : null
  const authors = [...(commentXml ?? '').matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/g)].map(
    (match) => decodeXlsxEscapes(decodeXlsxXml(match[1]!)),
  )
  for (const [, attrs = '', body = ''] of (commentXml ?? '').matchAll(
    /<comment\b([^>]*)>([\s\S]*?)<\/comment>/g,
  )) {
    const address = xlsxAttribute(attrs, 'ref')
    if (!address) continue
    const { row, column } = parseAddress(address)
    notes[address] = {
      row,
      column,
      author: authors[Number(xlsxAttribute(attrs, 'authorId') ?? 0)] ?? '',
      text: text(body),
    }
  }
  const pane = /<pane\b[^>]*>/.exec(xml)?.[0] ?? ''
  const frozen = /\bstate=["']frozen(?:Split)?["']/.test(pane)
  const validations = readXlsxNativeValidations(xml)
  const conditionalFormats = xml.includes('conditionalFormatting')
    ? readXlsxRangeXmlTree(xml)
        .children.filter(
          (node) =>
            node.ns === 'http://schemas.openxmlformats.org/spreadsheetml/2006/main' &&
            node.local === 'conditionalFormatting',
        )
        .map((group) => ({
          range: group.attrs.get('sqref') ?? '',
          types: group.children
            .filter((node) => node.local === 'cfRule')
            .map((node) => node.attrs.get('type') ?? 'unknown'),
        }))
    : []
  const setup = /<pageSetup\b[^>]*>/.exec(xml)?.[0] ?? ''
  const pageSetup = Object.fromEntries(
    [...setup.matchAll(/(\w+)=["']([^"']*)["']/g)].map(([, key = '', value = '']) => [key, value]),
  )
  const sparklines = [
    ...xml.matchAll(/<x14:sparklineGroup\b([^>]*)>([\s\S]*?)<\/x14:sparklineGroup>/g),
  ].flatMap(([, attrs = '', body = '']) =>
    [...body.matchAll(/<x14:sparkline>([\s\S]*?)<\/x14:sparkline>/g)].map(([, block = '']) => ({
      cell: /<xm:sqref>([^<]*)<\/xm:sqref>/.exec(block)?.[1] ?? '',
      source: decodeXlsxXml(/<xm:f>([^<]*)<\/xm:f>/.exec(block)?.[1] ?? ''),
      type: xlsxAttribute(attrs, 'type') ?? 'line',
      color: xlsxAttribute(/<x14:colorSeries\b[^>]*>/.exec(body)?.[0] ?? '', 'rgb'),
    })),
  )
  return {
    frozenRows: frozen ? Number(xlsxAttribute(pane, 'ySplit') ?? 0) : 0,
    frozenColumns: frozen ? Number(xlsxAttribute(pane, 'xSplit') ?? 0) : 0,
    validations,
    conditionalFormats,
    pageSetup,
    headers: {
      header: decodeXlsxXml(/<oddHeader[^>]*>([\s\S]*?)<\/oddHeader>/.exec(xml)?.[1] ?? ''),
      footer: decodeXlsxXml(/<oddFooter[^>]*>([\s\S]*?)<\/oddFooter>/.exec(xml)?.[1] ?? ''),
    },
    sparklines,
    protected: protectedSheet,
    passwordProtected: /\b(?:password|hashValue)=/.test(protection),
    hyperlinks,
    notes,
    richNotes: /<r\b|<extLst\b|<commentPr\b|\bguid=/.test(commentXml ?? ''),
  }
}
