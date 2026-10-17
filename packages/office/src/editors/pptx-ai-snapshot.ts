import { readPptxImageInfo } from '@mimir/shared'
import { rasterizePptxSvg, waitForPptxOutput } from '../pptx-output.js'
import { renderSlide, type PptxRenderable } from '../pptx-render.js'
import { pptxAiPresetInstruction, type PptxAiTarget } from './pptx-ai-presets.js'

export interface PptxAiSnapshotDraft {
  id: string
  /** Runtime-only source lifetime; never serialized with the image. */
  sourceIsCurrent: () => boolean
  text: string
  target: PptxAiTarget
  image: { name: string; mimeType: 'image/png'; dataUrl: string; width: number; height: number }
}

/** Uses the same immutable render tree as the canvas; never saves or edits the deck. */
export async function preparePptxAiSnapshot(
  view: PptxRenderable,
  target: PptxAiTarget,
  signal: AbortSignal,
  isCurrent: () => boolean,
  rasterize = rasterizePptxSvg,
  sourceIsCurrent: () => boolean = isCurrent,
): Promise<PptxAiSnapshotDraft> {
  const text = pptxAiPresetInstruction('beautify', target)
  const check = () => {
    signal.throwIfAborted()
    if (!isCurrent() || view.slides()[target.slideIndex]?.path !== target.slidePath)
      throw new Error('幻灯片已变化，请重新准备美化草稿')
  }
  check()
  const page = renderSlide(view, target.slideIndex, {
    fitWidthPx: 1280,
    svgIdPrefix: 'ai-snapshot',
  })
  if (!page || page.heightPx > 1920 || page.widthPx * page.heightPx > 2_457_600)
    throw new Error('幻灯片尺寸不适合生成 AI 截图')
  const operation = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
  const bytes = await waitForPptxOutput(
    rasterize(page.svg, page.widthPx, page.heightPx, operation),
    operation,
  )
  check()
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error('幻灯片截图超过 5 MiB，请简化页面后重试')
  const info = readPptxImageInfo(bytes)
  if (
    info.ext !== 'png' ||
    info.width !== Math.round(page.widthPx) ||
    info.height !== Math.round(page.heightPx)
  )
    throw new Error('幻灯片截图内容或尺寸无效，请重试')
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  const id = crypto.randomUUID()
  return {
    id,
    sourceIsCurrent,
    text: `${text}\n\n已附准备指令时本页的静态截图，请结合当前元素布局核对视觉效果。`,
    target: { ...target },
    image: {
      name: `第${target.slideIndex + 1}页截图-${id}.png`,
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${btoa(binary)}`,
      width: info.width,
      height: info.height,
    },
  }
}
