import type { Slide, SlideSize, TextElement } from '../vendor/packages/pptx-engine/src/types.js'
import type { PptxLink } from './pptx-metadata.js'
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
  links?(slideIndex: number): ReadonlyMap<string, PptxLink>
  readonly size: SlideSize
  /** 当前幻灯片。**是函数**——编辑会话的模型会随保存变化 */
  slides(): readonly Slide[]
  /** 图片：zip 路径 → data URL */
  readonly media: ReadonlyMap<string, string>
}

export interface RenderPptxOptions {
  /** 画布宽度（px）。所有几何按它算 scale */
  fitWidthPx: number
  /** Stable namespace for each inline SVG instance (canvas, thumbnail, presentation). */
  svgIdPrefix?: string
  /**
   * 字体度量。不传用上游的启发式（按字符类别估宽度）——**够用且确定**，
   * 而精确度量要 opentype.js 读字体文件（mimir 没接，见 TECH §15.8）。
   */
  metrics?: BuildOptions['metrics']
}

/**
 * 缺几何的文本框按幻灯片尺寸回填一个默认框（比例，不是写死的 EMU）。
 *
 * ## 为什么需要这一层
 *
 * `<p:sp>` 的几何来自三处之一：自己的 `<a:xfrm>`、占位符链（版式 → 母版）、
 * 或者——什么都没有。前两条上游都解析了，第三条就落在 `(0, 0, 0, 0)`。而 0×0
 * 的框不是「看不见」，是**文字被逐字竖排**：`layoutText` 的可用宽度是
 * `max(0 - 左右内边距, 1) = 1px`，于是每个汉字占一行（实测一份这样的样例：
 * 46 个 `<text>`、44 行，字压在字上、整列冲出纸外）。看着像文件坏了，其实
 * 是渲染器对「缺几何」没有兜底。
 *
 * ## 为什么在渲染层，而不是补进模型
 *
 * 文件里没有的东西不该由我们编出来：模型是保存路径的输入（补丁式保存按
 * `anchor.originalXml` 回填未改动的元素），而 vendor 明令不改
 * （`vendor/UPSTREAM.json`）。这里返回的是**新对象**，模型一个字节都不动，
 * 所以「渲染兜底」与「保存原样」互不影响。
 *
 * ## 为什么按比例而不是固定 EMU
 *
 * 4:3 与 16:9 的 `sldSz` 不同，写死 9 英寸的框在窄画布上会顶到右边。比例取
 * 「左右各留 5%、高 20%」：10 × 7.5 英寸的幻灯片上就是 x=0.5in / w=9in /
 * h=1.5in，也就是 Office 里那个默认文本框的大小。多个缺几何的框**竖向排开**
 * （`FALLBACK_BOX_GAP`），否则它们会叠在同一处、又变成一次「字压在字上」。
 *
 * ## 只碰**有文字**的 text/shape
 *
 * 没有文字的形状（色带、占位块）缺几何时本来就画不出东西——凭空补一个框反而
 * 会冒出一块底色，那不是修复，是编内容。`noGeometry` 那条注释是同一个判断：
 * 生成器掉了几何的标题条在 PowerPoint 里确实不可见。
 *
 * ## 边界（如实记着）
 *
 * 组内子元素不走这条：`placeTransform` 用的是组自己的子坐标系，给它按幻灯片
 * 比例补一个框会算错。缺几何的组内文本仍然按 0×0 渲染——那是另一个坐标系，
 * 要单独处理。
 */
const FALLBACK_BOX = { x: 0.05, y: 0.06, w: 0.9, h: 0.2 } as const
/** 第 n 个缺几何的框往下让 `h + gap`，避免叠在一起 */
const FALLBACK_BOX_GAP = 0.04
/** `sldSz` 缺失时的兜底尺寸。与上游 `makeViewport` 同一对默认值：10 × 7.5 英寸 */
const DEFAULT_SLIDE_CX = 9144000
const DEFAULT_SLIDE_CY = 6858000

/** 回填缺几何的文本框。返回新对象；`filled` 是回填了几个（界面据此如实说明） */
function withFallbackGeometry(slide: Slide, size: SlideSize): { slide: Slide; filled: number } {
  const cx = size.cx > 0 ? size.cx : DEFAULT_SLIDE_CX
  const cy = size.cy > 0 ? size.cy : DEFAULT_SLIDE_CY
  let filled = 0
  const elements = slide.elements.map((el) => {
    if (el.type !== 'text' && el.type !== 'shape') return el
    const text = (el as TextElement).text
    // 没有文字的图形不补——见上面「只碰有文字的 text/shape」
    if (!text || text.paragraphs.length === 0) return el
    const offset = el.transform.offset
    // 宽与高**都要有**：只缺一个的框同样是坏的（宽 0 就是逐字竖排那条）
    if (offset.cx > 0 && offset.cy > 0) return el
    const top = cy * (FALLBACK_BOX.y + filled * (FALLBACK_BOX.h + FALLBACK_BOX_GAP))
    filled += 1
    return {
      ...el,
      transform: {
        ...el.transform,
        offset: {
          x: Math.round(cx * FALLBACK_BOX.x),
          y: Math.round(top),
          cx: Math.round(cx * FALLBACK_BOX.w),
          cy: Math.round(cy * FALLBACK_BOX.h),
        },
      },
    }
  })
  return filled === 0 ? { slide, filled } : { slide: { ...slide, elements }, filled }
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
  /**
   * 这一页有几个文本框**文件里没有几何**、由 `withFallbackGeometry` 按默认框
   * 渲染。界面据此在状态行如实说明（DESIGN §0.2）——用户看到的框不是文件里的
   * 框，不说的话他会以为这就是原件的样子。
   */
  geometryFilled: number
  /** 绘制列表本身。界面通常不用，但它让「渲染」与「画出来」可以分开测 */
  tree: RenderSlide
}

/**
 * 渲染一页。`deck.media` 直接接给上游的 `MediaResolver`（它要的正是
 * `zip 路径 → data URL` 这个形状）。
 */
const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderSlide(
  deck: PptxRenderable,
  index: number,
  options: RenderPptxOptions,
): RenderedSlide | null {
  const source = deck.slides()[index]
  if (!source) return null

  // 缺几何的文本框先回填（原因见 withFallbackGeometry），再交给上游布局
  const { slide, filled } = withFallbackGeometry(source, deck.size)

  const tree = buildRenderSlide(slide, deck.size, {
    fitWidthPx: options.fitWidthPx,
    ...(options.metrics ? { metrics: options.metrics } : {}),
    media: (ref) => deck.media.get(ref),
    // 页码字段（`<a:fld type="slidenum">`）显示这一页的实际序号
    slideNo: index + 1,
  })

  let svg = renderSlideToSvg(tree, `${options.svgIdPrefix ?? 'deck'}-slide-${index}`)

  const links = deck.links?.(index)
  const badges: string[] = []
  for (const [id, link] of links ?? []) {
    svg = svg.replace(
      `data-element-id="${escapeAttr(id)}"`,
      `data-element-id="${escapeAttr(id)}" data-pptx-link="${escapeAttr(JSON.stringify(link))}"`,
    )
    const node = tree.nodes.find((item) => item.sourceId === id)
    if (node)
      badges.push(
        `<svg x="${node.box.x + node.box.w - 16}" y="${node.box.y + 2}" width="14" height="14" viewBox="0 0 16 16" pointer-events="none"><title>对象包含超链接</title><path d="M6 10l4-4M5 7 3 9a3 3 0 0 0 4 4l2-2M7 5l2-2a3 3 0 0 1 4 4l-2 2" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      )
  }
  if (badges.length) svg = svg.replace('</svg>', `${badges.join('')}</svg>`)
  return {
    svg,
    widthPx: tree.widthPx,
    heightPx: tree.heightPx,
    hidden: tree.hidden === true,
    geometryFilled: filled,
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
