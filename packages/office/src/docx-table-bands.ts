import { XMLParser } from 'fast-xml-parser'
import type { DocxSession } from './docx.js'
import { BoundedZip } from './zip-bounds.js'
import { resolveThemeColor } from '../vendor/packages/docx-engine/src/theme.js'

export interface TableColumnBands {
  first?: string
  second?: string
  size?: number
}
const cache = new WeakMap<DocxSession, Promise<Map<string, TableColumnBands>>>()
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
})
interface TableStyleCondition {
  '@_type'?: string
  tcPr?: { shd?: Record<string, string> }
}
interface StyleXml {
  '@_styleId'?: string
  basedOn?: { '@_val'?: string }
  tblPr?: { tblStyleColBandSize?: { '@_val'?: string } }
  tblStylePr?: TableStyleCondition | TableStyleCondition[]
}
/** Fixed engine's tableDisplay omits vertical bands. Read only their authored fills for the view. */
export function docxTableColumnBands(session: DocxSession) {
  let promise = cache.get(session)
  if (!promise) {
    promise = BoundedZip.open(session.originalBytes).then(async (zip) => {
      const xml = await zip.readText('word/styles.xml')
      const source = xml
        ? (parser.parse(xml).styles?.style as StyleXml | StyleXml[] | undefined)
        : undefined
      const styles = new Map(
        (source ? (Array.isArray(source) ? source : [source]) : []).map((style) => [
          style['@_styleId'] ?? '',
          style,
        ]),
      )
      const result = new Map<string, TableColumnBands>()
      const resolve = (id: string, seen = new Set<string>()): TableColumnBands => {
        if (seen.has(id) || seen.size >= 64) return {}
        seen.add(id)
        const style = styles.get(id)
        if (!style) return {}
        const bands = style.basedOn?.['@_val'] ? { ...resolve(style.basedOn['@_val'], seen) } : {}
        const conditions = style.tblStylePr
          ? Array.isArray(style.tblStylePr)
            ? style.tblStylePr
            : [style.tblStylePr]
          : []
        for (const condition of conditions) {
          const shading = condition.tcPr?.shd
          const fill = shading?.['@_themeFill']
            ? (resolveThemeColor(
                shading['@_themeFill'],
                session.footnotes.parsed.themeColors ?? {},
                shading['@_themeFillTint'],
                shading['@_themeFillShade'],
              ) ?? shading['@_fill'])
            : shading?.['@_fill']
          if (!fill || !/^[\da-f]{6}$/i.test(fill)) continue
          if (condition['@_type'] === 'band1Vert') bands.first = fill
          if (condition['@_type'] === 'band2Vert') bands.second = fill
        }
        const size = Number(style.tblPr?.tblStyleColBandSize?.['@_val'])
        if (size > 0 && Number.isInteger(size)) bands.size = size
        return bands
      }
      for (const id of styles.keys()) result.set(id, resolve(id))
      return result
    })
    cache.set(session, promise)
  }
  return promise
}
