import type { PptxDeck } from './pptx.js'
import { renderSlideToSvg } from './pptx-svg.js'
import {
  buildRenderSlide,
  type BuildOptions,
} from '../vendor/packages/pptx-render/src/build-slide.js'
import type { RenderSlide } from '../vendor/packages/pptx-render/src/render-tree.js'
import type { HeuristicMetrics } from '../vendor/packages/pptx-render/src/metrics.js'

/**
 * pptx 预览的**对外入口**：字节进，SVG 出。
 *
 * ## 为什么再包一层
 *
 * 下面是三段各自独立的东西：`openPptx`（压缩包 → 模型）、上游
 * `buildRenderSlide`（模型 → 绘制列表）、`renderSlideToSvg`（绘制列表 → SVG）。
 * 界面不需要知道它们的分工，也**不该**知道——那三个模块都可以单独替换
 * （换渲染器、换 SVG 生成方式），而界面只问「这一页长什么样」。
 *
 * ## 画布宽度是参数，不是常量
 *
 * `fitWidthPx` 决定所有坐标的精度：坐标是 EMU × scale 算出来的，scale 由它
 * 定。定得太小（比如 480）会让小字号的文字在放大时糊；太大则是无谓的元素
 * 数量。界面按容器宽度传一个值（现在传 960），**不要**在这里写死。
 */

/** 打开一份 pptx：模型 + 图片都在返回值里，之后渲染是纯同步的 */
export type { PptxDeck } from './pptx.js'
export { openPptx } from './pptx.js'
export interface RenderPptxOptions {
  /** 画布宽度（px）。所有几何按它算 scale */
  fitWidthPx: number
  /**
   * 字体度量。不传用上游的启发式（按字符类别估宽度）——**够用且确定**，
   * 而精确度量要 opentype.js 读字体文件（mimir 没接，见 TECH §15.7）。
   */
  metrics?: BuildOptions['metrics']
}

/** 一页的渲染结果 */
export interface RenderedSlide {
  /** 完整可用的 `<svg>` 字符串（含 `xmlns`） */
  svg: string
  /** 宽度 / 高度（px，与 `fitWidthPx` 同比例） */
  widthPx: number
  heightPx: number
  /** 这一页在放映时被跳过（`<p:sld show="0">`） */
  hidden: boolean
  /** 绘制列表本身。界面通常不用，但它让「渲染」与「画出来」可以分开测 */
  tree: RenderSlide
}

/**
 * 渲染一页。`deck.media` 直接接给上游的 `MediaResolver`（它要的正是
 * `zip 路径 → data URL` 这个形状）。
 */
export function renderSlide(
  deck: PptxDeck,
  index: number,
  options: RenderPptxOptions,
): RenderedSlide | null {
  const slide = deck.slides[index]
  if (!slide) return null

  const tree = buildRenderSlide(slide, deck.size, {
    fitWidthPx: options.fitWidthPx,
    ...(options.metrics ? { metrics: options.metrics } : {}),
    media: (ref) => deck.media.get(ref),
    // 页码字段（`<a:fld type="slidenum">`）显示这一页的实际序号
    slideNo: index + 1,
  })

  return {
    svg: renderSlideToSvg(tree),
    widthPx: tree.widthPx,
    heightPx: tree.heightPx,
    hidden: tree.hidden === true,
    tree,
  }
}

/** 全部页的渲染结果（一次性算完；一份演示文稿通常几十页，很快） */
export function renderDeck(deck: PptxDeck, options: RenderPptxOptions): RenderedSlide[] {
  const out: RenderedSlide[] = []
  for (let i = 0; i < deck.slides.length; i += 1) {
    const rendered = renderSlide(deck, i, options)
    if (rendered) out.push(rendered)
  }
  return out
}

/** 供测试与高级用法：上游的启发式度量类 */
export type PptxMetrics = HeuristicMetrics
