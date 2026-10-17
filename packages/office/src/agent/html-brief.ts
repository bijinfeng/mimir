import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { normalizeHtmlPageBrief, type HtmlPageBrief } from '@mimir/shared'
import type { Patch } from '../../vendor/apps/html/src/renderer/document/patch.js'

type HtmlNode = DefaultTreeAdapterMap['node']
const META_NAME = 'genoffice:brief'
const PAGE_LIMIT = 200_000
const isElement = (node: HtmlNode): node is DefaultTreeAdapterMap['element'] => 'tagName' in node
function headOf(source: string) {
  const document = parse(source.startsWith('\uFEFF') ? ` ${source.slice(1)}` : source, {
    sourceCodeLocationInfo: true,
  })
  const html = document.childNodes.find((node) => isElement(node) && node.tagName === 'html')
  const head =
    html && 'childNodes' in html
      ? html.childNodes.find((node) => isElement(node) && node.tagName === 'head')
      : undefined
  return { document, html, head }
}
const encode = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Portable upstream meta; alternatives and editing provenance belong to the confirmation only. */
export function htmlBriefMetaTag(value: HtmlPageBrief): string {
  const brief = normalizeHtmlPageBrief(value)
  const stored = {
    core_hook: brief.core_hook,
    style: brief.style,
    sections: brief.sections.map(({ purpose, ...section }) => ({ ...section, brief: purpose })),
    meta: brief.meta,
    version: 1,
  }
  return `<meta name="${META_NAME}" content="${encode(JSON.stringify(stored))}">`
}
export function readHtmlBrief(source: string): HtmlPageBrief | null {
  const { head } = headOf(source)
  if (!head || !('childNodes' in head)) return null
  const tags = head.childNodes.filter(
    (node) =>
      isElement(node) &&
      node.tagName === 'meta' &&
      node.attrs.some((attr) => attr.name === 'name' && attr.value.toLowerCase() === META_NAME),
  )
  if (tags.length !== 1 || !isElement(tags[0]!)) return null
  const content = tags[0].attrs.find((attr) => attr.name === 'content')?.value
  if (!content || content.length > PAGE_LIMIT) return null
  try {
    return normalizeHtmlPageBrief(JSON.parse(content))
  } catch {
    return null
  }
}

/** Source locations avoid touching matching strings in comments, scripts or the body. */
export function htmlBriefPinPatches(source: string, brief: HtmlPageBrief): Patch[] {
  const tag = htmlBriefMetaTag(brief),
    { document, html, head } = headOf(source)
  const existing =
    head && 'childNodes' in head
      ? head.childNodes.filter(
          (node) =>
            isElement(node) &&
            node.tagName === 'meta' &&
            node.attrs.some(
              (attr) => attr.name === 'name' && attr.value.toLowerCase() === META_NAME,
            ),
        )
      : []
  const patches: Patch[] = []
  if (existing.length) {
    existing.forEach((node, index) => {
      const at = node.sourceCodeLocation
      if (!at) throw new Error('无法定位原有页面提纲，未修改源码')
      const text = index === 0 ? tag : ''
      if (source.slice(at.startOffset, at.endOffset) !== text)
        patches.push({ from: at.startOffset, to: at.endOffset, text })
    })
  } else {
    // Keep the encoding declaration inside HTML's first 1024 bytes even for long briefs.
    const encoding =
      head && 'childNodes' in head
        ? head.childNodes.find(
            (node) =>
              isElement(node) &&
              node.tagName === 'meta' &&
              node.attrs.some(
                (attr) =>
                  attr.name === 'charset' ||
                  (attr.name === 'http-equiv' && attr.value.toLowerCase() === 'content-type'),
              ),
          )
        : undefined
    const encodingEnd = encoding?.sourceCodeLocation?.endOffset
    const headStart =
      head?.sourceCodeLocation && 'startTag' in head.sourceCodeLocation
        ? head.sourceCodeLocation.startTag?.endOffset
        : undefined
    const htmlStart =
      html?.sourceCodeLocation && 'startTag' in html.sourceCodeLocation
        ? html.sourceCodeLocation.startTag?.endOffset
        : undefined
    const doctype = document.childNodes.find((node) => node.nodeName === '#documentType')
    const from =
      encodingEnd ??
      headStart ??
      htmlStart ??
      doctype?.sourceCodeLocation?.endOffset ??
      (source.startsWith('\uFEFF') ? 1 : 0)
    patches.push({
      from,
      to: from,
      text:
        encodingEnd !== undefined || headStart !== undefined
          ? `\n${tag}`
          : `\n<head>${tag}</head>\n`,
    })
  }
  if (
    source.length +
      patches.reduce((sum, patch) => sum + patch.text.length - (patch.to - patch.from), 0) >
    PAGE_LIMIT
  )
    throw new Error('固定提纲后页面超出200000字符限制，未修改源码')
  return patches
}
