import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { patchChartPartXml, type ChartPatch } from '../vendor/packages/docx-engine/src/chart.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import { BoundedZip } from './zip-bounds.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
})
const many = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]
const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
function resolvePart(base: string, target: string): string {
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') {
      if (!parts.length) throw new Error('图表工作簿关系越出文件包')
      parts.pop()
    } else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}
function relsPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return `${path.slice(0, slash + 1)}_rels/${path.slice(slash + 1)}.rels`
}
interface Relationship {
  '@_Id': string
  '@_Target': string
  '@_Type': string
  '@_TargetMode'?: string
}
async function relationships(zip: BoundedZip, path: string): Promise<Relationship[]> {
  const xml = await zip.readText(relsPath(path))
  return xml ? many(parser.parse(xml).Relationships?.Relationship) : []
}
interface CellWrite {
  sheet: string
  ref: string
  value: string | number
}
function columnNumber(letters: string): number {
  return [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0)
}
function columnLetters(number: number): string {
  let result = ''
  for (let n = number; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result
  return result
}
/** Chart refs may point anywhere in a workbook, including quoted sheet names and horizontal ranges. */
function formulaCells(formula: string): { sheet: string; refs: string[] } {
  const match = /^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(
    formula.trim(),
  )
  if (!match || (match[1] ?? match[2])?.includes('['))
    throw new Error(`无法同步图表数据引用：${formula}`)
  const sheet = (match[1] ?? match[2]!).replaceAll("''", "'")
  const c1 = columnNumber(match[3]!),
    r1 = Number(match[4])
  const c2 = columnNumber(match[5] ?? match[3]!),
    r2 = Number(match[6] ?? match[4])
  if (
    c1 < 1 ||
    c2 > 16384 ||
    r1 < 1 ||
    r2 > 1048576 ||
    c2 < c1 ||
    r2 < r1 ||
    (c1 !== c2 && r1 !== r2) ||
    Math.max(c2 - c1, r2 - r1) > 10000
  )
    throw new Error('图表数据引用范围无效或过大')
  return {
    sheet,
    refs: Array.from(
      { length: Math.max(c2 - c1, r2 - r1) + 1 },
      (_, i) => `${columnLetters(c1 + (c1 === c2 ? 0 : i))}${r1 + (r1 === r2 ? 0 : i)}`,
    ),
  }
}
function writesForChart(xml: string, patch: ChartPatch): CellWrite[] {
  const chart = parser.parse(xml).chartSpace?.chart
  const writes: CellWrite[] = []
  const add = (
    holder: Record<string, unknown> | undefined,
    values: (string | number | null)[] | undefined,
  ) => {
    if (!holder || !values?.some((value) => value !== null)) return
    const ref = (holder.strRef ?? holder.numRef) as { f?: string } | undefined
    if (!ref?.f) return // literal caches have no workbook source
    const range = formulaCells(ref.f)
    values.forEach((value, index) => {
      if (value === null) return
      if (!range.refs[index]) throw new Error('图表缓存与工作簿引用数量不一致')
      writes.push({ sheet: range.sheet, ref: range.refs[index]!, value })
    })
  }
  add(chart?.title?.tx, patch.title === undefined ? undefined : [patch.title])
  const plot = chart?.plotArea ?? {}
  let index = 0
  for (const [tag, element] of Object.entries(plot)) {
    if (!tag.endsWith('Chart')) continue
    for (const group of many(element as { ser?: unknown } | { ser?: unknown }[])) {
      for (const series of many(
        group.ser as
          | {
              tx?: Record<string, unknown>
              cat?: Record<string, unknown>
              val?: Record<string, unknown>
            }
          | undefined,
      )) {
        const change = patch.series?.[index++]
        add(series.tx, change?.name === undefined ? undefined : [change.name])
        add(series.cat, patch.categories)
        add(series.val, change?.values)
      }
    }
  }
  return writes
}
/** Replace only the referenced cell's value; preserve its style, row metadata and all other cells. */
function patchCell(xml: string, ref: string, value: string | number): string {
  const rowNumber = Number(/\d+$/.exec(ref)![0])
  const cell = (attrs: string) =>
    `<c${attrs.replace(/\s+t=(?:"[^"]*"|'[^']*')/g, '')}${typeof value === 'string' ? ' t="inlineStr"' : ''}>${typeof value === 'string' ? `<is><t xml:space="preserve">${escape(value)}</t></is>` : `<v>${value}</v>`}</c>`
  let found = false
  let result = xml.replace(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (whole, attrs: string) => {
    if (parser.parse(`<c${attrs}/>`).c?.['@_r'] !== ref) return whole
    found = true
    return cell(attrs)
  })
  if (found) return result
  const insert = cell(` r="${ref}"`)
  let rowFound = false
  result = result.replace(
    /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,
    (whole, attrs: string, inner = '') => {
      if (Number(parser.parse(`<row${attrs}/>`).row?.['@_r']) !== rowNumber) return whole
      rowFound = true
      const col = columnNumber(ref.replace(/\d+$/, ''))
      const next = [...inner.matchAll(/<c\b[^>]*\br=["']([A-Z]+)\d+["']/g)].find(
        (match) => columnNumber(match[1]!) > col,
      )
      const at = next?.index ?? inner.length
      return `<row${attrs}>${inner.slice(0, at)}${insert}${inner.slice(at)}</row>`
    },
  )
  if (rowFound) return result
  const newRow = `<row r="${rowNumber}">${insert}</row>`
  const next = [...result.matchAll(/<row\b[^>]*\br=["'](\d+)["']/g)].find(
    (match) => Number(match[1]) > rowNumber,
  )
  if (next) return result.slice(0, next.index) + newRow + result.slice(next.index)
  if (/<sheetData\s*\/>/.test(result))
    return result.replace(/<sheetData\s*\/>/, `<sheetData>${newRow}</sheetData>`)
  if (!result.includes('</sheetData>')) throw new Error('图表工作簿缺少单元格区域')
  return result.replace('</sheetData>', `${newRow}</sheetData>`)
}
async function patchWorkbook(bytes: Uint8Array, writes: CellWrite[]): Promise<Uint8Array> {
  const zip = await BoundedZip.open(bytes)
  const entries = await zip.readAll()
  const workbook = parser.parse((await zip.readText('xl/workbook.xml')) ?? '').workbook
  const rels = await relationships(zip, 'xl/workbook.xml')
  const sheets = new Map<string, string>()
  for (const sheet of many(
    workbook?.sheets?.sheet as { '@_name': string; '@_id': string } | undefined,
  )) {
    const rel = rels.find(
      (item) => item['@_Id'] === sheet['@_id'] && item['@_TargetMode'] !== 'External',
    )
    if (rel) sheets.set(sheet['@_name'], resolvePart('xl/workbook.xml', rel['@_Target']))
  }
  const edits = new Map<string, string>()
  for (const write of writes) {
    const path = sheets.get(write.sheet)
    if (!path) throw new Error(`图表工作簿缺少工作表：${write.sheet}`)
    const xml = edits.get(path) ?? (await zip.readText(path))
    if (!xml) throw new Error(`图表工作簿缺少部件：${path}`)
    edits.set(path, patchCell(xml, write.ref, write.value))
  }
  const out = new JSZip()
  for (const [path, data] of entries)
    out.file(path, edits.get(path) ?? data, { createFolders: false })
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
/** Resolve every patch before saving so a broken workbook never produces a half-updated document. */
export async function docxChartSaveOptions(
  bytes: Uint8Array,
  patches: { partPath: string; patch: ChartPatch }[],
  options: SaveOptions,
): Promise<SaveOptions> {
  if (!patches.length) return options
  const zip = await BoundedZip.open(bytes)
  const partXml = { ...options.partXml },
    partBinary = { ...options.partBinary }
  const workbookWrites = new Map<string, CellWrite[]>()
  for (const { partPath, patch } of patches) {
    const xml = partXml[partPath] ?? (await zip.readText(partPath))
    if (!xml) throw new Error(`图表部件不存在：${partPath}`)
    const titleXml =
      patch.title !== undefined && !/<c:title[\s>]/.test(xml)
        ? xml.replace(
            /<c:chart(\s[^>]*)?>/,
            (opening) =>
              `${opening}<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escape(patch.title!)}</a:t></a:r></a:p></c:rich></c:tx></c:title>`,
          )
        : xml
    partXml[partPath] = patchChartPartXml(titleXml, patch)
    const writes = writesForChart(xml, patch)
    if (!writes.length) continue
    const workbook = (await relationships(zip, partPath)).find((rel) =>
      rel['@_Type'].endsWith('/package'),
    )
    // Formula caches without an externalData/package relationship are self-contained.
    if (!workbook) continue
    if (workbook['@_TargetMode'] === 'External')
      throw new Error('图表链接到外部工作簿，无法同步外部数据')
    const path = resolvePart(partPath, workbook['@_Target'])
    const previous = workbookWrites.get(path) ?? []
    for (const write of writes) {
      const conflict = previous.find(
        (item) =>
          item.sheet === write.sheet && item.ref === write.ref && item.value !== write.value,
      )
      if (conflict) throw new Error('多个图表对同一工作簿单元格写入不同数值，请分别保存')
    }
    workbookWrites.set(path, [...previous, ...writes])
  }
  for (const [path, writes] of workbookWrites) {
    const original = partBinary[path]
      ? Uint8Array.from(atob(partBinary[path]), (char) => char.charCodeAt(0))
      : await zip.read(path)
    if (!original) throw new Error(`图表嵌入工作簿不存在：${path}`)
    partBinary[path] = base64(await patchWorkbook(original, writes))
  }
  return { ...options, partXml, partBinary }
}
