export interface PptxMediaSize {
  width: number
  height: number
}
export interface PptxMediaCenter {
  x: number
  y: number
}

/** Fixed GenOffice: one video pixel is one point, shrink only, fit the slide.
 * Private placement centers use normalized coordinates. Audio is a 64pt square. */
export function pptxMediaFrame(
  kind: 'video' | 'audio',
  slide: PptxMediaSize,
  natural: PptxMediaSize | null,
  center: PptxMediaCenter = { x: 0.5, y: 0.5 },
) {
  if (
    ![slide.width, slide.height].every((n) => Number.isFinite(n) && n > 0 && n <= 2147483647) ||
    ![center.x, center.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
  )
    throw new Error('媒体页面或放置位置无效')
  if (
    natural &&
    ![natural.width, natural.height].every((n) => Number.isFinite(n) && n > 0 && n <= 32768)
  )
    throw new Error('媒体原始尺寸无效')
  const fallback = kind === 'video' && !natural
  const width = kind === 'audio' ? 64 * 12700 : natural ? natural.width * 12700 : slide.width
  const height =
    kind === 'audio' ? 64 * 12700 : natural ? natural.height * 12700 : (slide.width * 9) / 16
  const scale = kind === 'audio' ? 1 : Math.min(1, slide.width / width, slide.height / height)
  const cx = Math.round(width * scale),
    cy = Math.round(height * scale)
  return {
    box: {
      x: Math.round(slide.width * center.x - cx / 2),
      y: Math.round(slide.height * center.y - cy / 2),
      cx,
      cy,
    },
    fallback,
  }
}
