import type { Slide, SlideSize } from '../vendor/packages/pptx-engine/src/types.js'
import { renderSlideToSvg } from './pptx-svg.js'
import {
  buildRenderSlide,
  type BuildOptions,
} from '../vendor/packages/pptx-render/src/build-slide.js'
import type { RenderSlide } from '../vendor/packages/pptx-render/src/render-tree.js'
import type { HeuristicMetrics } from '../vendor/packages/pptx-render/src/metrics.js'

/**
 * pptx 的**渲染入口**：模型进，SVG 出。
 *
 * ## 为什么再包一层
 *
 * 下面是三段各自独立的东西：`openPptx`（压缩包 → 模型）、上游
 * `buildRenderSlide`（模型 → 绘制列表）、`renderSlideToSvg`（绘制列表 → SVG）。
 * 界面不需要知道它们的分工，也**不该**知道——那三个模块都可以单独替换
 * （换渲染器、换 SVG 生成方式），而界面只问「这一页长什么样」。
 *
 * ## 只读预览与编辑共用这一层
 *
 * 两个入口（`PptxDeck` 只读、`PptxEditSession` 可编辑）在渲染看来是**同一个
 * 东西**：画布尺寸 + 幻灯片 + 图片表。所以这里收一个结构化的 `PptxRenderable`
 * ——只有「编辑器保存后要重新渲染」这一条需求，没必要为它写第二份渲染调用。
 *
 * `slides` 是**函数**而不是数组：编辑会话每次保存后模型会被替换
 * （`commit()` 之后元素锚点全变了），拿数组的调用方会一直渲染旧的那份。
 */

/** 能被渲染的东西：只读 `PptxDeck` 与 `PptxEditSession` 都满足它 */
export interface PptxRenderable {
  readonly size: SlideSize
  /** 当前幻灯片。**是函数**——编辑会话的模型会随保存变化 */
  slides(): readonly Slide[]
  /** 图片：zip 路径 → data URL */
  readonly media: ReadonlyMap<string, string>
}

export interface RenderPptxOptions {
  /** 画布宽度（px）。所有几何按它算 scale */
  fitWidthPx: number
  /**
   * 字体度量。不传用上游的启发式（按字符类别估宽度）——**够用且确定**，
   * 而精确度量要 opentype.js 读字体文件（mimir 没接，见 TECH §15.8）。
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
  deck: PptxRenderable,
  index: number,
  options: RenderPptxOptions,
): RenderedSlide | null {
  const slide = deck.slides()[index]
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
export function renderDeck(deck: PptxRenderable, options: RenderPptxOptions): RenderedSlide[] {
  const out: RenderedSlide[] = []
  for (let i = 0; i < deck.slides().length; i += 1) {
    const rendered = renderSlide(deck, i, options)
    if (rendered) out.push(rendered)
  }
  return out
}

/** 供测试与高级用法：上游的启发式度量类 */
export type PptxMetrics = HeuristicMetrics
