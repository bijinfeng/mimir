import { renderSlide, type PptxRenderable } from '../pptx-render.js'

/** Rasterize our current rendered canvas, including unsaved edits. No external media or XML input. */
export async function pptxZoomSnapshot(
  deck: PptxRenderable,
  index: number,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new Error('缩放快照已取消')
  const rendered = renderSlide(deck, index, { fitWidthPx: 640, svgIdPrefix: `zoom-${index}` })
  if (!rendered || rendered.widthPx * rendered.heightPx > 1_638_400 || rendered.heightPx > 1280)
    throw new Error('幻灯片尺寸不适合生成缩放快照')
  const blob = new Blob([rendered.svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const bitmap = new Image()
      const abort = () => done(new Error('缩放快照已取消'))
      const loaded = () => done()
      const failed = () => done(new Error('无法生成幻灯片快照，请重试'))
      const timer = setTimeout(() => done(new Error('快照生成超时，请重试')), 10_000)
      const done = (error?: Error) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        bitmap.removeEventListener('load', loaded)
        bitmap.removeEventListener('error', failed)
        if (error) {
          bitmap.src = ''
          reject(error)
        } else resolve(bitmap)
      }
      signal.addEventListener('abort', abort, { once: true })
      bitmap.addEventListener('load', loaded, { once: true })
      bitmap.addEventListener('error', failed, { once: true })
      bitmap.src = url
    })
    if (signal.aborted) throw new Error('缩放快照已取消')
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(rendered.widthPx)
    canvas.height = Math.ceil(rendered.heightPx)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法生成缩放快照，请重新打开文档')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]!
  } finally {
    URL.revokeObjectURL(url)
  }
}
