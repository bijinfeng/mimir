import type { PptxImageExtension } from '@mimir/shared'
import type { PptxManualPicture } from '@mimir/shared'
import {
  addImageMediaAndRel,
  cleanupSupersededSlideResources,
  groupChildSlices,
  patchGroupChildXml,
  patchSlideXml,
  type OpenedPptx,
  type Slide,
} from '../vendor/packages/pptx-engine/src/index.js'
import {
  groupChildDurableId,
  matchesElementRef,
} from '../vendor/packages/pptx-engine/src/identity.js'
import { patchPictureSrcRect } from '../vendor/packages/pptx-engine/src/generate.js'

/** Fixed GenOffice 480548fd: direct group slices + native picture byte surgery. */
export function resolvePptxGroupPicture(
  slide: Slide,
  target: { group: string; elementId: string },
) {
  const parents = slide.elements.filter((item) => matchesElementRef(item, target.group))
  const parent = parents.length === 1 ? parents[0] : undefined
  if (parent?.type !== 'group' || !/^<p:grpSp\b/.test(parent.anchor.originalXml))
    throw new Error('父组合已失效或使用兼容分支，请重新选择普通组合')
  const children = parent.children.filter(
    (item) =>
      matchesElementRef(item, target.elementId) ||
      groupChildDurableId(parent, item) === target.elementId,
  )
  const picture = children.length === 1 ? children[0] : undefined
  if (picture?.type !== 'picture' || picture.media)
    throw new Error('请选择顶层组合的直接普通图片成员；深层组合和媒体封面暂不支持')
  const slices = groupChildSlices(parent.anchor.originalXml).filter(
    (slice) => slice.nvId === picture.nvId,
  )
  const xml = slices.length === 1 && picture.nvId ? slices[0]!.xml : ''
  const fills = [...xml.matchAll(/<p:blipFill\b[^>]*>[\s\S]*?<\/p:blipFill>/g)]
  const fill = fills.length === 1 ? fills[0]![0] : ''
  if (
    !/^<p:pic\b/.test(xml) ||
    /<mc:AlternateContent\b|<(?:\w+:)?model3d\b/.test(xml) ||
    [...xml.matchAll(/<p:blipFill\b/g)].length !== 1 ||
    !fill ||
    [...xml.matchAll(/<a:blip\b/g)].length !== 1 ||
    !/<a:blip\b[^>]*(?:\/>|>[\s\S]*?<\/a:blip>)/.test(fill)
  )
    throw new Error('此图片原生结构无法安全修改，请选择普通嵌入图片')
  return { parent, picture, xml }
}

function publishPictureXml(
  slide: Slide,
  resolved: ReturnType<typeof resolvePptxGroupPicture>,
  xml: string,
) {
  const { parent, picture } = resolved
  if (!patchGroupChildXml(parent, picture, () => xml))
    throw new Error('组合图片原生位置已失效，未应用修改')
  picture.anchor.originalXml = xml
  picture.dirty = picture.dirtyTransform = picture.dirtyFill = picture.dirtyStroke = false
  picture.dirtySrcRect = false
  picture.dirtyPPr = undefined
  slide.structureDirty = true
}

export function editPptxGroupPicture(slide: Slide, input: PptxManualPicture): boolean {
  const resolved = resolvePptxGroupPicture(slide, input)
  let xml = resolved.xml
  if (input.srcRect !== undefined) xml = patchPictureSrcRect(xml, input.srcRect)
  if (input.opacity !== undefined)
    xml = xml.replace(/<a:blip\b[^>]*(?:\/>|>[\s\S]*?<\/a:blip>)/, (blip) => {
      const clean = blip.replace(
        /<a:alphaModFix\b[^>]*\/>|<a:alphaModFix\b[^>]*>[\s\S]*?<\/a:alphaModFix>/g,
        '',
      )
      if (input.opacity === 1) return clean
      const alpha = `<a:alphaModFix amt="${Math.round(input.opacity! * 100000)}"/>`
      return clean.endsWith('/>')
        ? clean.slice(0, -2) + `>${alpha}</a:blip>`
        : clean.replace(/(<a:blip\b[^>]*>)/, `$1${alpha}`)
    })
  if (xml === resolved.xml) return false
  publishPictureXml(slide, resolved, xml)
  if (input.srcRect !== undefined) resolved.picture.srcRect = input.srcRect ?? undefined
  if (input.opacity !== undefined)
    resolved.picture.opacity = input.opacity === 1 ? undefined : input.opacity
  return true
}

/** Caller checks actual file format and equal original dimensions before keepCrop. */
export function replacePptxGroupPicture(
  opened: OpenedPptx,
  slide: Slide,
  target: { group: string; elementId: string },
  bytes: Uint8Array,
  ext: PptxImageExtension,
  keepCrop: boolean,
): string {
  const resolved = resolvePptxGroupPicture(slide, target)
  const previousXml = patchSlideXml(slide)
  const added = addImageMediaAndRel(opened, slide, bytes, ext)
  if (!added) throw new Error('无法嵌入此图片，原有图片已保留')
  let xml = resolved.xml.replace(/<a:blip\b[^>]*(?:\/>|>[\s\S]*?<\/a:blip>)/, (blip) => {
    const updated = blip.replace(/<a:blip\b[^>]*\/?>/, (tag) => {
      const clean = tag.replace(/\s+r:(?:embed|link)=(?:"[^"]*"|'[^']*')/g, '')
      return clean.replace(/<a:blip\b/, `<a:blip r:embed="${added.rid}"`)
    })
    // PowerPoint prefers the old SVG fallback unless its blip extension is removed.
    // Scope cleanup to this blip, preserving all unrelated shape extensions.
    const withoutSvg = updated.replace(/<a:ext\b[^>]*>\s*<\w+:svgBlip\b[\s\S]*?<\/a:ext>/g, '')
    return withoutSvg === updated ? updated : withoutSvg.replace(/<a:extLst>\s*<\/a:extLst>/g, '')
  })
  if (!keepCrop) xml = patchPictureSrcRect(xml, null)
  publishPictureXml(slide, resolved, xml)
  resolved.picture.mediaRef = added.mediaPath
  delete resolved.picture.dataUrl
  if (!keepCrop) delete resolved.picture.srcRect
  cleanupSupersededSlideResources(opened, slide, previousXml, patchSlideXml(slide))
  return groupChildDurableId(resolved.parent, resolved.picture) ?? resolved.picture.id
}
