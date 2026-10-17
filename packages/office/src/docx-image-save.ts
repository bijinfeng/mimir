import type { Block } from '../vendor/packages/docx-engine/src/types.js'
import type { PmDocJson } from './docx.js'

const normalize = (value: unknown) => ((Math.round(Number(value) || 0) % 360) + 360) % 360

/**
 * The fixed native image patch edits an existing pic:spPr/a:xfrm only. Some
 * valid producer drawings omit it entirely (including our real corpus image).
 * Seed the missing transform in a copied baseline only when an actual image
 * transform changed; native patching still writes rotation/flip/effectExtent.
 */
export function docxImageSaveBaselines<T extends readonly Block[]>(
  edited: PmDocJson,
  blocks: T,
): T | Block[] {
  const targets = new Map<number, Record<string, unknown>>()
  for (const node of edited.content ?? []) {
    const attrs = node.attrs as Record<string, unknown> | undefined
    if (
      node.type === 'docProtected' &&
      attrs?.blockType === 'image' &&
      typeof attrs.docxIndex === 'number'
    )
      targets.set(attrs.docxIndex, attrs)
  }
  let changed = false
  const result = blocks.map((block) => {
    if (block.type !== 'image' || block.docxIndex === null) return block
    const attrs = targets.get(block.docxIndex)
    if (!attrs || !block.originalXml) return block
    if (
      normalize(attrs.imageRotDeg) === normalize(block.imageRotDeg) &&
      !!attrs.imageFlipH === !!block.imageFlipH &&
      !!attrs.imageFlipV === !!block.imageFlipV
    )
      return block
    const pics = [...block.originalXml.matchAll(/<pic:pic\b[^>]*>[\s\S]*?<\/pic:pic>/g)]
    if (pics.length !== 1)
      throw new Error('这张图片的绘图结构不支持旋转或翻转，请替换为普通图片后重试')
    const pic = pics[0]![0]
    // A normal paired xfrm is already handled without any baseline change.
    const xfrm = /<pic:spPr\b[^>]*>[\s\S]*?<a:xfrm\b([^>]*)>/.exec(pic)
    if (xfrm && !/\/\s*$/.test(xfrm[1]!)) return block
    const extent = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(block.originalXml)
    const cx = Number(extent?.[1]) || Math.round((block.imageWidthPx ?? 0) * 9525)
    const cy = Number(extent?.[2]) || Math.round((block.imageHeightPx ?? 0) * 9525)
    if (!(Number.isFinite(cx) && Number.isFinite(cy) && cx > 0 && cy > 0))
      throw new Error('图片缺少有效原始尺寸，无法保存旋转或翻转')
    const geometry = `<a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/>`
    const seed = `<a:xfrm>${geometry}</a:xfrm>`
    let next: string
    if (xfrm) {
      // Expand self-closing xfrm; its existing rotation/flip attributes survive
      // until native patchImageParagraphXml applies the current requested state.
      next = pic.replace(
        /(<pic:spPr\b[^>]*>[\s\S]*?)<a:xfrm\b([^>]*)\/>/,
        (_all, prefix: string, xfrmAttrs: string) =>
          `${prefix}<a:xfrm${xfrmAttrs}>${geometry}</a:xfrm>`,
      )
    } else if (/<pic:spPr\b[^>]*\/>/.test(pic)) {
      next = pic.replace(/<pic:spPr\b([^>]*)\/>/, `<pic:spPr$1>${seed}</pic:spPr>`)
    } else if (/<pic:spPr\b[^>]*>/.test(pic)) {
      next = pic.replace(/(<pic:spPr\b[^>]*>)/, `$1${seed}`)
    } else {
      next = pic.replace('</pic:pic>', `<pic:spPr>${seed}</pic:spPr></pic:pic>`)
    }
    if (next === pic) throw new Error('无法保存这张图片的变换，请重新打开后重试')
    changed = true
    return { ...block, originalXml: block.originalXml.replace(pic, next) }
  })
  return changed ? result : blocks
}
