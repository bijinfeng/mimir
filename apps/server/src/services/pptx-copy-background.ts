import JSZip from 'jszip'
import {
  parseClrMap,
  parseTheme,
  resolveSchemeColor,
  type OpenedPptx,
  type Theme,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { topLevelChildren } from '../../../../packages/office/vendor/packages/pptx-engine/src/generate.js'
import { escapeXmlAttr } from '../../../../packages/office/vendor/packages/pptx-engine/src/xml-utils.js'
import { relsPathFor, resolveTarget } from '../../../../packages/office/src/pptx-archive.js'
import {
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_TOTAL_BYTES,
  MAX_ZIP_PARTS,
} from '../../../../packages/office/src/zip-bounds.js'

const background = /<p:bg\b[^>]*(?:\/>|>[\s\S]*?<\/p:bg>)/
const colorNode =
  /<a:(?:srgbClr|schemeClr|sysClr|scrgbClr|hslClr|prstClr)\b[^>]*(?:\/>|>[\s\S]*?<\/a:(?:srgbClr|schemeClr|sysClr|scrgbClr|hslClr|prstClr)>)/
function rootNamespaces(xml: string) {
  return [
    ...(xml.match(/<(?!\?)[\w:]+\b[^>]*>/)?.[0] ?? '').matchAll(
      /\b(?:xmlns(?::[\w.-]+)?|mc:(?:Ignorable|ProcessContent|PreserveElements|PreserveAttributes))=(?:"[^"]*"|'[^']*')/g,
    ),
  ].map((m) => m[0])
}
function themeFor(opened: OpenedPptx, path: string): { theme?: Theme; xml: string } {
  const chain = opened.archive.resolveSlideChain(path)
  const xml = chain.themePath ? (opened.archive.readText(chain.themePath) ?? '') : ''
  const theme = xml ? parseTheme(xml) : undefined
  if (theme)
    theme.clrMap = parseClrMap(
      chain.masterPath ? (opened.archive.readText(chain.masterPath) ?? undefined) : undefined,
      chain.layoutPath ? (opened.archive.readText(chain.layoutPath) ?? undefined) : undefined,
      opened.archive.readText(path) ?? undefined,
    )
  return { theme, xml }
}
/** Freeze only source scheme bases; retain native transforms and gradient children. */
function freezeSchemeColors(xml: string, theme: Theme | undefined): string {
  return xml.replace(
    /<a:schemeClr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:schemeClr>)/g,
    (_node, attrs: string, children: string | undefined) => {
      const name = /\bval=(?:"([^"]+)"|'([^']+)')/.exec(attrs)
      const color = resolveSchemeColor(name?.[1] ?? name?.[2] ?? '', theme)
      if (!color || !/^#[\da-f]{6}$/i.test(color))
        throw new Error('无法解析当前背景的主题颜色，原件未修改')
      const rest = attrs.replace(/\s*val=(?:"[^"]*"|'[^']*')/, '')
      return `<a:srgbClr${rest} val="${color.slice(1)}">${children ?? ''}</a:srgbClr>`
    },
  )
}
function childrenOf(xml: string, name: string): string[] {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(xml)
  const body = match?.[1] ?? ''
  return topLevelChildren(body, 0, body.length).map((child) => body.slice(child.start, child.end))
}
function sourceBackground(opened: OpenedPptx, path: string) {
  const chain = opened.archive.resolveSlideChain(path)
  const sourceTheme = themeFor(opened, path)
  for (const part of [path, chain.layoutPath, chain.masterPath]) {
    if (!part) continue
    const xml = opened.archive.readText(part) ?? ''
    let fragment = background.exec(xml)?.[0]
    if (!fragment) continue
    let relationshipPart = part
    const reference = /<p:bgRef\b[^>]*\bidx=(?:"(\d+)"|'(\d+)')[^>]*>([\s\S]*?)<\/p:bgRef>/.exec(
      fragment,
    )
    if (reference) {
      const index = Number(reference[1] ?? reference[2])
      const template = childrenOf(
        sourceTheme.xml,
        index >= 1001 ? 'a:bgFillStyleLst' : 'a:fillStyleLst',
      )[index >= 1001 ? index - 1001 : index - 1]
      const color = colorNode.exec(reference[3] ?? '')?.[0]
      if (!template || !color) throw new Error('当前背景引用的主题填充不存在，原件未修改')
      // The reference color's transforms precede the template's placeholder transforms.
      const instantiated = template.replace(
        /<a:schemeClr\b[^>]*\bval=(?:"phClr"|'phClr')[^>]*(?:\/>|>([\s\S]*?)<\/a:schemeClr>)/g,
        (_node, transforms: string | undefined) => {
          if (color.endsWith('/>'))
            return color.slice(0, -2) + `>${transforms ?? ''}</${/^<(a:[\w]+)/.exec(color)![1]!}>`
          return color.replace(/<\/a:[\w]+>$/, (end) => `${transforms ?? ''}${end}`)
        },
      )
      fragment = fragment.replace(reference[0], `<p:bgPr>${instantiated}<a:effectLst/></p:bgPr>`)
      relationshipPart = chain.themePath ?? part
    }
    // Source root extension namespaces remain valid on targets with different roots.
    const namespaces = new Map<string, string>()
    for (const declaration of [...rootNamespaces(sourceTheme.xml), ...rootNamespaces(xml)])
      namespaces.set(declaration.split('=')[0]!, declaration)
    fragment = fragment.replace(/<p:bg\b([^>]*)>/, (tag, attrs: string) => {
      const additions = [...namespaces]
        .filter(([key]) => !new RegExp(`\\b${key}=`).test(attrs))
        .map(([, value]) => value)
        .join(' ')
      return additions ? tag.replace(/\/?>(?=$)/, (end: string) => ` ${additions}${end}`) : tag
    })
    return { fragment, relationshipPart, theme: sourceTheme.theme }
  }
  const color = resolveSchemeColor('bg1', sourceTheme.theme) ?? '#FFFFFF'
  return {
    fragment: `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color.replace(/^#/, '')}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`,
    relationshipPart: path,
    theme: sourceTheme.theme,
  }
}
/** Current archive only: never accept caller XML, rels, themes or filesystem paths. */
export async function copyCurrentPptxBackground(
  opened: OpenedPptx,
  sourceIndex: number,
  active: () => void,
) {
  const sourceSlide = opened.deck.slides[sourceIndex]
  if (!sourceSlide) throw new Error('填充页面已失效')
  const source = sourceBackground(opened, sourceSlide.path)
  const sourceRels = opened.archive.readRels(source.relationshipPart)
  const updates = new Map<string, string>()
  let totalBytes = [...opened.archive.entries.values()].reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  )
  let partCount = opened.archive.entries.size
  const stage = (path: string, xml: string) => {
    const size = Buffer.byteLength(xml, 'utf8')
    const previous = updates.get(path)
    totalBytes +=
      size -
      (previous === undefined
        ? (opened.archive.readBytes(path)?.byteLength ?? 0)
        : Buffer.byteLength(previous, 'utf8'))
    if (!opened.archive.has(path) && previous === undefined) partCount++
    if (size > MAX_ZIP_ENTRY_BYTES || totalBytes > MAX_ZIP_TOTAL_BYTES || partCount > MAX_ZIP_PARTS)
      throw new Error('复制背景后的Office ZIP超过预算，原件未修改')
    updates.set(path, xml)
  }
  for (const slide of opened.deck.slides) {
    active()
    // Keep a source's own bytes exact; materialize inheritance on the other pages.
    if (slide === sourceSlide && slide.bgOwn) continue
    let fragment = source.fragment
    const targetTheme = themeFor(opened, slide.path).theme
    if (
      JSON.stringify(targetTheme?.colors) !== JSON.stringify(source.theme?.colors) ||
      JSON.stringify(targetTheme?.clrMap) !== JSON.stringify(source.theme?.clrMap)
    )
      fragment = freezeSchemeColors(fragment, source.theme)
    const relsPath = relsPathFor(slide.path)
    let relsXml =
      opened.archive.readText(relsPath) ??
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    const targetRels = opened.archive.readRels(slide.path)
    const mapped = new Map<string, string>()
    fragment = fragment.replace(
      /\br:(embed|link|id)=(?:"([^"]+)"|'([^']+)')/g,
      (_attribute, attr: string, double: string | undefined, single: string | undefined) => {
        const oldId = double ?? single ?? ''
        let id = mapped.get(oldId)
        if (!id) {
          const rel = sourceRels.get(oldId)
          const media = rel ? resolveTarget(source.relationshipPart, rel.target) : ''
          if (
            !rel ||
            rel.targetMode === 'External' ||
            !rel.type.endsWith('/image') ||
            !/^ppt\/media\/[^/]+$/.test(media) ||
            !opened.archive.readBytes(media)?.length
          )
            throw new Error('当前背景图片关系无效或为外部链接，原件未修改')
          id = [...targetRels.values()].find(
            (item) =>
              item.type === rel.type &&
              item.targetMode !== 'External' &&
              resolveTarget(slide.path, item.target) === media,
          )?.id
          if (!id) {
            let next = 1
            while (targetRels.has(`rId${next}`)) next++
            id = `rId${next}`
            const target = `/${media}`
            const relationship = `<Relationship Id="${id}" Type="${escapeXmlAttr(rel.type)}" Target="${escapeXmlAttr(target)}"/>`
            relsXml = relsXml
              .replace(/<\/Relationships\s*>/, `${relationship}</Relationships>`)
              .replace(
                /<Relationships\b([^>]*?)\/>/,
                `<Relationships$1>${relationship}</Relationships>`,
              )
            targetRels.set(id, { id, type: rel.type, target })
          }
          mapped.set(oldId, id)
        }
        return `r:${attr}="${id}"`
      },
    )
    const xml = opened.archive.readText(slide.path)
    if (!xml || !/<p:cSld\b/.test(xml)) throw new Error('目标幻灯片结构无效，原件未修改')
    const next = background.test(xml)
      ? xml.replace(background, () => fragment)
      : xml.replace(/<p:cSld\b[^>]*>/, (tag) => `${tag}${fragment}`)
    if (next !== xml) stage(slide.path, next)
    if (relsXml !== opened.archive.readText(relsPath) && mapped.size) stage(relsPath, relsXml)
  }
  active()
  // Prepare all target patches before producing the single atomic host result.
  const zip = new JSZip()
  for (const [path, bytes] of opened.archive.entries) zip.file(path, updates.get(path) ?? bytes)
  for (const [path, xml] of updates) if (!opened.archive.entries.has(path)) zip.file(path, xml)
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  active()
  return { bytes, changed: updates.size > 0 }
}
