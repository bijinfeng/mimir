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
  validations?: {
    range: string
    type: string
    formula1: string
    formula2: string
    operator: string
    allowBlank: boolean
    error: string
  }[]
  conditionalFormats?: { range: string; types: string[] }[]
  pageSetup?: Record<string, string>
  headers?: { header: string; footer: string }
  sparklines?: { cell: string; source: string; type: string; color?: string }[]
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
  const validations = [
    ...xml.matchAll(/<dataValidation\b([^>]*)(?:\/>|>([\s\S]*?)<\/dataValidation>)/g),
  ].map(([, attrs = '', body = '']) => ({
    range: xlsxAttribute(attrs, 'sqref') ?? '',
    type: xlsxAttribute(attrs, 'type') ?? 'none',
    operator: xlsxAttribute(attrs, 'operator') ?? 'between',
    allowBlank: /^(?:1|true)$/.test(xlsxAttribute(attrs, 'allowBlank') ?? ''),
    error: xlsxAttribute(attrs, 'error') ?? '',
    formula1: decodeXlsxXml(/<formula1>([\s\S]*?)<\/formula1>/.exec(body)?.[1] ?? ''),
    formula2: decodeXlsxXml(/<formula2>([\s\S]*?)<\/formula2>/.exec(body)?.[1] ?? ''),
  }))
  const conditionalFormats = [
    ...xml.matchAll(/<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g),
  ].map(([, attrs = '', body = '']) => ({
    range: xlsxAttribute(attrs, 'sqref') ?? '',
    types: [...body.matchAll(/<cfRule\b[^>]*>/g)].map(
      ([tag]) => xlsxAttribute(tag, 'type') ?? 'unknown',
    ),
  }))
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
