import type {
  GroupElement,
  PictureElement,
  Slide,
} from '../vendor/packages/pptx-engine/src/types.js'

/** The fixed engine updater is top-level and ignores target rotation. Do not leave
 * a native attachment behind when changing a child's frame in another coordinate system. */
export function pptxGroupPictureCropReason(
  slide: Slide,
  parent: GroupElement,
  picture: PictureElement,
  nativeXml?: string,
): string | undefined {
  if (!picture.nvId || !/^\d+$/.test(picture.nvId)) return '图片原生身份不明确，无法在画布裁切'
  const nativeId = picture.nvId.replace(/^0+(?=\d)/, '')
  const attached = new RegExp(`<a:(?:stCxn|endCxn)\\b[^>]*\\bid\\s*=\\s*["']0*${nativeId}["']`)
  if (slide.elements.some((element) => attached.test(element.anchor.originalXml)))
    return '此组内图片连接了连接线，暂不能同步其端点；请使用数值裁切保留原框'
  const transform = picture.transform.offset,
    group = parent.transform.offset,
    child = parent.childOffset
  if (
    ![
      transform.cx,
      transform.cy,
      group.cx,
      group.cy,
      child?.cx ?? group.cx,
      child?.cy ?? group.cy,
    ].every((value) => Number.isFinite(value) && value > 0)
  )
    return '组合或图片尺寸无效，无法在画布裁切'
  // Fixed parser leaves child anchors empty. Resolve by native cNvPr identity
  // in the owning group's original XML; never infer identity from child order.
  const candidates = [...parent.anchor.originalXml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)]
    .map((match) => match[0])
    .filter((xml) => new RegExp(`<p:cNvPr\\b[^>]*\\bid=["']${picture.nvId}["']`).test(xml))
  const xml = nativeXml ?? (candidates.length === 1 ? candidates[0]! : '')
  const nativeTransform = xml.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/)?.[0] ?? ''
  if (
    !/^<p:pic\b/.test(xml) ||
    /<mc:AlternateContent\b/.test(parent.anchor.originalXml) ||
    [...xml.matchAll(/<a:xfrm\b/g)].length !== 1 ||
    [...nativeTransform.matchAll(/<a:off\b/g)].length !== 1 ||
    [...nativeTransform.matchAll(/<a:ext\b/g)].length !== 1
  )
    return '此图片原生定位结构不明确，无法在画布裁切'
  for (const [tag, names] of [
    ['off', ['x', 'y']],
    ['ext', ['cx', 'cy']],
  ] as const) {
    const token = nativeTransform.match(new RegExp(`<a:${tag}\\b[^>]*>`))?.[0] ?? ''
    for (const name of names) {
      const values = [...token.matchAll(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'g'))]
      const value = values[0]?.[2] ?? ''
      if (
        values.length !== 1 ||
        !/^[+-]?\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        (tag === 'ext' && Number(value) <= 0)
      )
        return '图片原生定位属性不完整，无法在画布裁切'
    }
  }
  return undefined
}
