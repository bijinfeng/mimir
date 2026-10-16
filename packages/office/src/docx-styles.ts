import JSZip from 'jszip'
import { parseStyles } from '../vendor/packages/docx-engine/src/parse-styles.js'
import {
  mergeDefaultFontsXml,
  mergeStyleXml,
} from '../vendor/packages/docx-engine/src/style-upsert.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { ParsedDoc } from '../vendor/packages/docx-engine/src/types.js'
import type { DocxSession } from './docx.js'
import { BoundedZip } from './zip-bounds.js'

const originalXml = new WeakMap<DocxSession, Promise<string>>()
/** Parse the same surgical style XML as save so basedOn inheritance and null resets stay identical. */
export async function liveDocxStyleState(
  session: DocxSession,
  options: SaveOptions,
): Promise<ParsedDoc> {
  if (!options.styleUpserts?.length && !options.defaultFonts) return session.footnotes.parsed
  let source = originalXml.get(session)
  if (!source) {
    source = BoundedZip.open(session.originalBytes)
      .then((zip) => zip.readText('word/styles.xml'))
      .then(
        (xml) =>
          xml ??
          '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>',
      )
    originalXml.set(session, source)
  }
  let xml = await source
  for (const upsert of options.styleUpserts ?? []) {
    const match = [...xml.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)].find(
      (item) => /w:styleId="([^"]+)"/.exec(item[0])?.[1] === upsert.styleId,
    )
    const replacement = mergeStyleXml(match?.[0] ?? null, upsert)
    xml = match
      ? xml.slice(0, match.index) + replacement + xml.slice(match.index! + match[0].length)
      : xml.replace('</w:styles>', `${replacement}</w:styles>`)
  }
  if (options.defaultFonts) xml = mergeDefaultFontsXml(xml, options.defaultFonts)
  const zip = new JSZip().file('word/styles.xml', xml)
  const parsed = session.footnotes.parsed
  const styles = await parseStyles(zip, parsed.themeColors, parsed.themeFonts)
  return { ...parsed, ...styles }
}
