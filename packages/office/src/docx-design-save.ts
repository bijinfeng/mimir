import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import { applySectionSettings } from '../vendor/packages/docx-engine/src/section.js'
import {
  applyThemeColors,
  applyThemeFonts,
  buildThemeXml,
  DEFAULT_THEME_COLORS,
  readThemeColors,
  readThemeFonts,
  resolveThemeColor,
} from '../vendor/packages/docx-engine/src/theme.js'
import type { ThemeColors, ThemeFonts } from '../vendor/packages/docx-engine/src/types.js'
import type { SavePlan } from '../vendor/apps/docs/src/renderer/editor/convert.js'
import type { DocxSession, PmDocJson } from './docx.js'
import { BoundedZip } from './zip-bounds.js'
import {
  attrsOf,
  childrenOf,
  nameOf,
  xmlParser,
  type XNode,
} from '../vendor/packages/docx-engine/src/xml-utils.js'

export const DESIGN_ATTR = 'mimirDesign'
export const PAGE_BORDER_ATTR = 'mimirPageBorder'
export interface DocxDesignEdits {
  fonts?: ThemeFonts | null
  colors?: ThemeColors | null
  pageColor?: string | null
  trailingBorder?: boolean
}
interface Json {
  attrs?: Record<string, unknown>
  content?: Json[]
}
export const SECT_PR = /<w:sectPr\b[^>]*\/>|<w:sectPr\b[\s\S]*?<\/w:sectPr>/g
export function designEdits(doc: { attrs?: Record<string, unknown> }): DocxDesignEdits {
  return (doc.attrs?.[DESIGN_ATTR] as DocxDesignEdits | null) ?? {}
}
/** Replace only pgBorders; unrelated section children and attributes stay verbatim. */
export function patchPageBorder(xml: string, enabled: boolean): string {
  if (/<w:sectPrChange\b/.test(xml))
    throw new Error('当前节包含节属性修订，请先在 Word 中处理修订后再设置页面边框')
  const sections = [...xml.matchAll(SECT_PR)]
  if (sections.length !== 1) throw new Error('无法可靠定位页面边框所属节')
  const source = sections[0]![0]
  const border = enabled
    ? `<w:pgBorders w:offsetFrom="page">${['top', 'left', 'bottom', 'right'].map((side) => `<w:${side} w:val="single" w:sz="4" w:space="24" w:color="auto"/>`).join('')}</w:pgBorders>`
    : ''
  const old = /<w:pgBorders\b[^>]*\/>|<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/.exec(source)?.[0]
  let next = source
  if (old) next = next.replace(old, () => border)
  else if (border) {
    if (next.endsWith('/>')) next = next.slice(0, -2) + '></w:sectPr>'
    // pgBorders precedes lnNumType/pgNumType/cols in CT_SectPr.
    const following =
      /<w:(?:lnNumType|pgNumType|cols|formProt|vAlign|noEndnote|titlePg|textDirection|bidi|rtlGutter|docGrid|printerSettings|sectPrChange)\b/.exec(
        next,
      )
    const at = following?.index ?? next.lastIndexOf('</w:sectPr>')
    next = next.slice(0, at) + border + next.slice(at)
  }
  return xml.replace(source, () => next)
}
export function docxDesignSaveOptions(
  doc: { attrs?: Record<string, unknown> },
  options: SaveOptions,
  session: DocxSession,
): SaveOptions {
  const edits = designEdits(doc)
  const next = { ...options }
  if (edits.fonts === null) delete next.themeFonts
  else if (edits.fonts) next.themeFonts = edits.fonts
  if (edits.colors === null) delete next.themeColors
  else if (edits.colors) next.themeColors = edits.colors
  if (edits.pageColor !== undefined) next.pageColor = edits.pageColor
  if (edits.trailingBorder !== undefined) {
    let trailing = next.trailingSectPr ?? session.sections.at(-1)?.sectPrXml ?? '<w:sectPr/>'
    if (next.section) trailing = applySectionSettings(trailing, next.section)
    next.trailingSectPr = patchPageBorder(trailing, edits.trailingBorder)
    delete next.section
  }
  return next
}
export function docxDesignSavePlan(doc: PmDocJson, plan: SavePlan, session: DocxSession): void {
  const nodes = (doc.content ?? []) as Json[]
  for (const node of nodes) {
    const border = node.attrs?.[PAGE_BORDER_ATTR]
    if (typeof border !== 'boolean') continue
    const anchor = node.attrs?.docxIndex
    if (anchor != null && nodes.filter((n) => n.attrs?.docxIndex === anchor).length !== 1)
      throw new Error('页面边框所在段落被复制，请重新设置边框')
    let at = anchor != null ? plan.saveBlockIndexByDocx.get(Number(anchor)) : undefined
    if (at === undefined && node.attrs?.genXml) {
      const matches = plan.saveBlocks.flatMap((b, i) =>
        b.kind === 'xml' && b.xml === node.attrs!.genXml ? [i] : [],
      )
      if (matches.length === 1) at = matches[0]
    }
    const block = at === undefined ? null : plan.saveBlocks[at]
    if (!block || at === undefined) throw new Error('页面边框所在节已变化，无法保真保存')
    if (block.kind === 'generated') {
      if (!block.block.rawPPr) throw new Error('缺少原节属性，无法保真保存页面边框')
      block.block.rawPPr = patchPageBorder(block.block.rawPPr, border)
    } else if (block.kind === 'original' || block.kind === 'xml') {
      const xml =
        block.kind === 'xml'
          ? block.xml
          : session.blocks.find((b) => b.docxIndex === block.docxIndex)?.originalXml
      if (!xml) throw new Error('缺少原节，无法保真保存页面边框')
      plan.saveBlocks[at] = { ...block, kind: 'xml', xml: patchPageBorder(xml, border) }
    } else throw new Error('当前节结构不支持保真修改页面边框')
  }
}
interface DesignSource {
  pageColor: string | null
  background: string
  pageColorSupported: boolean
  themeXml: string | null
  themeSupported: boolean
}
const sources = new WeakMap<DocxSession, Promise<DesignSource>>()
export function docxDesignSource(session: DocxSession): Promise<DesignSource> {
  let source = sources.get(session)
  if (!source) {
    source = BoundedZip.open(session.originalBytes).then(async (zip) => {
      const [document, themeXml, rels] = await Promise.all([
        zip.readText('word/document.xml'),
        zip.readText('word/theme/theme1.xml'),
        zip.readText('word/_rels/document.xml.rels'),
      ])
      const background =
        /<w:background\b[^>]*?(?:\/>|>[\s\S]*?<\/w:background>)/.exec(document ?? '')?.[0] ?? ''
      const pageColorSupported = !background || background.endsWith('/>')
      const pageColor = /\bw:color="([\da-f]{6})"/i.exec(background)?.[1]?.toUpperCase() ?? null
      const root = (xmlParser.parse(rels ?? '') as XNode[]).find(
        (node) => nameOf(node)?.split(':').at(-1) === 'Relationships',
      )
      const themeRels = (root ? childrenOf(root) : [])
        .filter((node) => nameOf(node)?.split(':').at(-1) === 'Relationship')
        .map(attrsOf)
        .filter((attrs) => attrs.Type?.endsWith('/theme'))
      const themeSupported = themeXml
        ? themeRels.length === 1 &&
          themeRels.every(
            (rel) =>
              ['theme/theme1.xml', '/word/theme/theme1.xml'].includes(rel.Target ?? '') &&
              (!rel.TargetMode || rel.TargetMode.toLowerCase() === 'internal'),
          )
        : themeRels.length === 0
      return { pageColor, background, pageColorSupported, themeXml, themeSupported }
    })
    sources.set(session, source)
  }
  return source
}
export async function liveDocxTheme(session: DocxSession, options: SaveOptions) {
  const source = await docxDesignSource(session)
  if (options.pageColor !== undefined && !source.pageColorSupported)
    throw new Error('原件包含图形页面背景，当前不能安全替换底色')
  if ((options.themeFonts || options.themeColors) && !source.themeSupported)
    throw new Error('原件使用自定义主题路径，当前不能安全修改主题')
  let xml = source.themeXml
  if (options.themeFonts || options.themeColors) {
    xml ??= buildThemeXml(
      options.themeFonts ?? { major: 'Calibri Light', minor: 'Calibri' },
      options.themeColors ?? DEFAULT_THEME_COLORS,
    )
    if (options.themeFonts) xml = applyThemeFonts(xml, options.themeFonts)
    if (options.themeColors) xml = applyThemeColors(xml, options.themeColors)
  }
  const colors = xml ? readThemeColors(xml) : null
  const attr = (name: string) => new RegExp(`\\bw:${name}="([^"]*)"`).exec(source.background)?.[1]
  const themeBackground =
    colors && attr('themeColor')
      ? resolveThemeColor(attr('themeColor')!, colors, attr('themeTint'), attr('themeShade'))
      : null
  return {
    fonts: xml
      ? ({ ...session.footnotes.parsed.themeFonts, ...readThemeFonts(xml) } as ThemeFonts)
      : null,
    colors,
    themeSupported: source.themeSupported,
    pageColorSupported: source.pageColorSupported,
    pageColor:
      options.pageColor === undefined ? (themeBackground ?? source.pageColor) : options.pageColor,
  }
}
