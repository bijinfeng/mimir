import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { SourceInfo } from '../vendor/packages/docx-engine/src/types.js'
import {
  buildSourcesXml,
  parseSourcesXml,
  SOURCES_NS,
} from '../vendor/packages/docx-engine/src/sources.js'
import type { PmDocJson } from './docx.js'
import { BoundedZip } from './zip-bounds.js'

export const REFERENCE_SOURCES_ATTR = 'mimirReferenceSources'
export function invalidReferenceText(text: string, allControls = false): boolean {
  return [...text].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 && (allControls || ![9, 10, 13].includes(code))
  })
}

/** Read only our runtime metadata; null leaves the original package untouched. */
export function referenceSourcesAttr(doc: { attrs?: unknown }): SourceInfo[] | null {
  const value = (doc.attrs as Record<string, unknown> | undefined)?.[REFERENCE_SOURCES_ATTR]
  if (value == null) return null
  if (!Array.isArray(value) || value.length > 2000) throw new Error('来源列表无效')
  const tags = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('来源格式无效')
    for (const key of ['tag', 'type', 'author', 'title', 'year'])
      if (typeof item[key] !== 'string') throw new Error('来源字段无效')
    for (const field of Object.values(item).filter((entry) => entry !== undefined))
      if (typeof field !== 'string' || field.length > 4000 || invalidReferenceText(field))
        throw new Error('来源字段包含无效文字')
    if (!item.tag || tags.has(item.tag)) throw new Error('来源标签重复或为空')
    tags.add(item.tag)
  }
  return value as SourceInfo[]
}

/** Find a complete child, including nested b:Author wrappers. */
function element(xml: string, tag: string): { from: number; to: number; xml: string } | null {
  const re = new RegExp(`<(/?)b:${tag}(?=[\\s/>])[^>]*>`, 'g')
  let depth = 0
  let from = -1
  for (const match of xml.matchAll(re)) {
    if (from < 0) from = match.index
    depth += match[1] ? -1 : /\/\s*>$/.test(match[0]) ? 0 : 1
    if (depth === 0)
      return {
        from,
        to: match.index + match[0].length,
        xml: xml.slice(from, match.index + match[0].length),
      }
  }
  return null
}

function patchEntry(xml: string, before: SourceInfo, after: SourceInfo): string {
  const generated = buildSourcesXml([after])
  const fields: [keyof SourceInfo, string[]][] = [
    ['type', ['SourceType']],
    ['author', ['Author']],
    ['title', ['Title']],
    ['year', ['Year']],
    ['publisher', ['Publisher', 'JournalName', 'InternetSiteTitle']],
    ['url', ['URL']],
  ]
  for (const [key, tags] of fields) {
    if (
      (before[key] ?? '') === (after[key] ?? '') &&
      !(key === 'publisher' && before.type !== after.type)
    )
      continue
    let insertion = xml.indexOf('</b:Source>')
    for (const tag of tags) {
      const current = element(xml, tag)
      if (current) {
        insertion = Math.min(insertion, current.from)
        xml = xml.slice(0, current.from) + xml.slice(current.to)
      }
    }
    const replacement = tags.map((tag) => element(generated, tag)?.xml ?? '').join('')
    xml = xml.slice(0, insertion) + replacement + xml.slice(insertion)
  }
  return xml
}

/** Native sources creation, surgical updates to existing sources, one PM history state. */
export async function docxReferenceSaveOptions(
  bytes: Uint8Array,
  doc: PmDocJson,
  options: SaveOptions,
): Promise<SaveOptions> {
  const sources = referenceSourcesAttr({ attrs: doc.attrs })
  if (!sources) return options
  const zip = await BoundedZip.open(bytes)
  for (const path of zip
    .list('customXml/')
    .filter((name) => /^customXml\/item\d+\.xml$/.test(name))) {
    const xml = await zip.readText(path)
    if (!xml?.includes(SOURCES_NS) || !/<b:Sources\b/.test(xml)) continue
    const originals = new Map(parseSourcesXml(xml).map((source) => [source.tag, source]))
    const next = new Map(sources.map((source) => [source.tag, source]))
    let patched = xml.replace(/<b:Source>[\s\S]*?<\/b:Source>/g, (entry) => {
      const before = parseSourcesXml(entry)[0]
      if (!before) return entry
      const after = next.get(before.tag)
      return after ? patchEntry(entry, before, after) : ''
    })
    const added = sources.filter((source) => !originals.has(source.tag))
    const entries =
      buildSourcesXml(added)
        .match(/<b:Source>[\s\S]*?<\/b:Source>/g)
        ?.join('') ?? ''
    patched = patched.replace('</b:Sources>', () => entries + '</b:Sources>')
    return { ...options, sources: undefined, partXml: { ...options.partXml, [path]: patched } }
  }
  return { ...options, sources }
}
