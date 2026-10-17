import type {
  RenderFill,
  RenderNode,
  RenderSlide,
  RenderStroke,
  RenderTextLayout,
  GlyphRun,
  ShapeRenderNode,
  PictureRenderNode,
  GroupRenderNode,
  TableRenderNode,
  ChartRenderNode,
  ChipRenderNode,
  ArrowEndRender,
} from '../vendor/packages/pptx-render/src/render-tree.js'
import type { Slide, SlideElement, GroupElement } from '../vendor/packages/pptx-engine/src/types.js'
import { pptxPicturePlacement } from './pptx-picture-placement.js'
import { patternGrid } from '../vendor/packages/pptx-render/src/pattern-fills.js'
import {
  composePptxMatrices,
  pptxGroupMatrix,
  pptxMatrixSvg,
  type PptxMatrix,
} from './pptx-group-placement.js'

/**
 * 把 `RenderSlide`（上游的**纯数据**绘制列表）画成 SVG。
 *
 * ## 为什么是 SVG 而不是上游的 Konva
 *
 * 上游的适配层是 1858 行 Konva 代码（canvas 2D）：canvas 画出来的文字
 * **不可选中、不可搜索、不能被读屏软件读到**，导出也是位图。mimir 的预览
 * 要能选文字（用户会对着一页幻灯片复制一句话），所以走 SVG：
 * `<text>` 是真实文本节点，选中/搜索/缩放都免费。
 *
 * 这也正是上游自己的分层意图——`render-tree.ts` 顶部写着「Konva is just a
 * thin adapter that draws the RenderTree」，保真逻辑全在 RenderTree 里。
 * 换一个适配器是它的设计允许的。
 *
 * ## 保真度的边界（如实标注，不假装）
 *
 *   - **字体**用浏览器装的（`font-family` 直传）。上游走 opentype.js 读
 *     vendored 字体算精确字宽，而浏览器里字宽由系统字体决定——**换行位置
 *     会与 PowerPoint 有细微差别**。字**都**在、位置都按文件里的坐标，
 *     但一行结尾往哪儿断可能不同。要像素级一致需要 vendored 的 Calibri 等
 *     字体文件（docx 那边有，这里没接）
 *   - **阴影/发光/倒影**只画近似（SVG filter），不追求逐像素
 *   - **渐变**按 SVG linearGradient 画，`scaled` 的按 box 比例算角度
 *   - **图案填充**按上游的 8×8 位掩码画成 `<pattern>`
 *   - **SmartArt / OLE** 有预渲染图形就画（上游解析好的），没有就画占位块
 *
 * ## 文字为什么按 run 而非整行画
 *
 * 一行里的每个 run 有自己的 x（布局引擎算的），所以逐 run 放 `<text>`。
 * 好处是每个 run 的 x 就是文件里的位置，缩放时不会累积误差；代价是一个
 * 汉字一个 `<text>` 元素（上千个元素时 DOM 会变重）。实测一份 3 页的
 * 演示文稿约 200 个元素，可接受。
 */

/** 把 HTML 属性值里的特殊字符转义（文字内容用 escapeText） */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 数字输出：定长小数，避免 `0.30000000000000004` 这类噪声撑大产物 */
function n(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return (Math.round(value * 100) / 100).toString()
}

/** 唯一 id 计数器（渐变/图案/裁剪都要 id，同一页里不能重名） */
let uid = 0
let namespace = ''
const nextId = (prefix: string): string => `${namespace}${prefix}${(uid += 1)}`

/** 把 `#RRGGBBAA` 拆成 `#RRGGBB` + `fill-opacity`（SVG 不认 8 位十六进制色） */
function paint(color: string): { color: string; opacity: number } {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(color)
  if (!m) return { color, opacity: 1 }
  return { color: `#${m[1]}`, opacity: Number.parseInt(m[2]!, 16) / 255 }
}

/**
 * 一个填充 → SVG 属性（可能带 `<defs>`）。
 *
 * 返回 `defs` 与 `attr`：渐变与图案需要先在 `<defs>` 里定义，再由 `url(#id)` 引用。
 */
function fillAttrs(fill: RenderFill | undefined): { defs: string; attrs: string } {
  if (!fill) return { defs: '', attrs: 'fill="none"' }

  switch (fill.kind) {
    case 'none':
      return { defs: '', attrs: 'fill="none"' }

    case 'solid': {
      const p = paint(fill.color)
      return {
        defs: '',
        attrs: `fill="${attr(p.color)}"${p.opacity < 1 ? ` fill-opacity="${n(p.opacity)}"` : ''}`,
      }
    }

    case 'gradient': {
      const id = nextId('grad')
      const stops = fill.stops
        .map((s) => {
          const p = paint(s.color)
          return `<stop offset="${n(s.pos)}" stop-color="${attr(p.color)}"${
            p.opacity < 1 ? ` stop-opacity="${n(p.opacity)}"` : ''
          }/>`
        })
        .join('')

      if (fill.radial || fill.path) {
        /**
         * 径向渐变。上游的语义是 `<a:path>`（circle/rect/shape）+ `<a:fillToRect>`
         * 给的焦点；SVG 的 `radialGradient` 用 `cx/cy/r` 表达同一个意思。
         */
        const cx = fill.center?.x ?? 0.5
        const cy = fill.center?.y ?? 0.5
        return {
          defs: `<radialGradient id="${id}" cx="${n(cx)}" cy="${n(cy)}" r="0.75">${stops}</radialGradient>`,
          attrs: `fill="url(#${id})"`,
        }
      }

      /**
       * 线性渐变。OOXML 的 `angleDeg` 是**顺时针、0 = 从左到右**；
       * SVG 的 `x1/y1/x2/y2` 用 objectBoundingBox 坐标，所以要把角度换算成
       * 单位方框上的两个端点。
       */
      const rad = ((fill.angleDeg ?? 0) * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const x1 = 0.5 - cos / 2
      const y1 = 0.5 - sin / 2
      const x2 = 0.5 + cos / 2
      const y2 = 0.5 + sin / 2
      return {
        defs: `<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stops}</linearGradient>`,
        attrs: `fill="url(#${id})"`,
      }
    }

    case 'image': {
      /**
       * 图片填充：用 `<pattern>` 把图片平铺，或按 stretch 画一次。
       * 取不到 dataUrl（媒体没解析出来）时退化为灰色，而不是留 transparent
       * ——透明会让「这里本该有一张图」这件事看不出来。
       */
      const id = nextId('imgfill')
      if (!fill.dataUrl) {
        return { defs: '', attrs: 'fill="rgba(128,128,128,0.15)"' }
      }
      if (fill.mode === 'tile') {
        const size = fill.tile ? `${n(fill.tile.scaleX * 100)}%` : '100%'
        return {
          defs:
            `<pattern id="${id}" width="${size}" height="${size}" patternUnits="objectBoundingBox">` +
            `<image href="${attr(fill.dataUrl)}" width="${size}" height="${size}" preserveAspectRatio="none"/>` +
            `</pattern>`,
          attrs: `fill="url(#${id})"`,
        }
      }
      // stretch：把图片按 fillRect 内缩后拉伸填满
      const r = fill.fillRect
      const inset = r
        ? ` x="${n(r.l * 100)}%" y="${n(r.t * 100)}%" width="${n((1 - r.l - r.r) * 100)}%" height="${n((1 - r.t - r.b) * 100)}%"`
        : ' width="100%" height="100%"'
      return {
        defs:
          `<pattern id="${id}" width="1" height="1" patternUnits="objectBoundingBox">` +
          `<image href="${attr(fill.dataUrl)}"${inset} preserveAspectRatio="none"/>` +
          `</pattern>`,
        attrs: `fill="url(#${id})"`,
      }
    }

    case 'pattern': {
      const id = nextId('pat')
      const mask = patternGrid(fill.preset)
      const cell = Math.max(1, fill.cellPx)
      // 8×8 掩码逐格画成 1×1 的小方块（掩码是 8×8，所以最多 64 个 rect）
      let dots = ''
      for (const [row, line] of mask.entries()) {
        for (const [col, on] of line.entries()) {
          if (!on) continue
          dots += `<rect x="${n(col)}" y="${n(row)}" width="1" height="1"/>`
        }
      }
      const fg = paint(fill.fg)
      const bg = paint(fill.bg)
      return {
        defs:
          `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" ` +
          // 图案要跟着画布缩放，否则缩放时密度就错了
          `patternTransform="scale(${n(cell / 8)})">` +
          `<rect width="8" height="8" fill="${attr(bg.color)}"/>` +
          `<g fill="${attr(fg.color)}">${dots}</g>` +
          `</pattern>`,
        attrs: `fill="url(#${id})"`,
      }
    }
  }
}

/** 描边 → SVG 属性。`width=0` 或 `none` 视为无描边（与渲染层的判断一致） */
function strokeAttrs(stroke: RenderStroke | undefined): { defs: string; attrs: string } {
  if (!stroke || stroke.widthPx === 0) return { defs: '', attrs: 'stroke="none"' }

  const p = paint(stroke.color)
  const parts = [`stroke="${attr(p.color)}"`, `stroke-width="${n(stroke.widthPx)}"`]
  if (!stroke.gradient && p.opacity < 1) parts.push(`stroke-opacity="${n(p.opacity)}"`)
  if (stroke.cap) parts.push(`stroke-linecap="${attr(stroke.cap)}"`)
  if (stroke.join) parts.push(`stroke-linejoin="${attr(stroke.join)}"`)
  if (stroke.dash?.length) parts.push(`stroke-dasharray="${stroke.dash.map(n).join(' ')}"`)

  if (stroke.gradient) {
    const id = nextId('sgrad')
    const stops = stroke.gradient.stops
      .map((s) => {
        const sp = paint(s.color)
        return `<stop offset="${n(s.pos)}" stop-color="${attr(sp.color)}"${sp.opacity < 1 ? ` stop-opacity="${n(sp.opacity)}"` : ''}/>`
      })
      .join('')
    const rad = ((stroke.gradient.angleDeg ?? 0) * Math.PI) / 180
    return {
      defs:
        `<linearGradient id="${id}" x1="${n(0.5 - Math.cos(rad) / 2)}" y1="${n(0.5 - Math.sin(rad) / 2)}" ` +
        `x2="${n(0.5 + Math.cos(rad) / 2)}" y2="${n(0.5 + Math.sin(rad) / 2)}">${stops}</linearGradient>`,
      attrs: `stroke="url(#${id})" ${parts.slice(1).join(' ')}`,
    }
  }

  return { defs: '', attrs: parts.join(' ') }
}

/** Endpoint sizes are already in local px; SVG follows the actual path tangent, including curves. */
function connectorMarker(
  end: ArrowEndRender | undefined,
  stroke: RenderStroke | undefined,
  strokeAttributes: string,
): { defs: string; id?: string } {
  if (!end || !stroke || stroke.widthPx <= 0) return { defs: '' }
  const id = nextId('arrow')
  const w = end.widthPx / 2
  const l = end.lengthPx
  // Reuse the resolved stroke paint (including gradient/alpha), without dashing the arrowhead.
  const color = /stroke="([^"]+)"/.exec(strokeAttributes)?.[1] ?? 'none'
  // Gradient color is only its first-stop fallback, not an extra overall alpha.
  const opacity = stroke.gradient ? 1 : paint(stroke.color).opacity
  const fill = `fill="${color}"${opacity < 1 ? ` fill-opacity="${n(opacity)}"` : ''}`
  let body: string
  if (end.type === 'oval') {
    body = `<ellipse cx="0" cy="0" rx="${n(l / 2)}" ry="${n(w)}" ${fill}/>`
  } else if (end.type === 'arrow') {
    const solidStroke = strokeAttributes.replace(/ stroke-dasharray="[^"]*"/, '')
    body = `<path d="M ${n(-l)} ${n(-w)} L 0 0 L ${n(-l)} ${n(w)}" fill="none" ${solidStroke}/>`
  } else {
    const rear =
      end.type === 'diamond'
        ? `L ${n(-l / 2)} ${n(-w)} L ${n(-l)} 0 L ${n(-l / 2)} ${n(w)}`
        : end.type === 'stealth'
          ? `L ${n(-l)} ${n(-w)} L ${n(-l * 0.65)} 0 L ${n(-l)} ${n(w)}`
          : `L ${n(-l)} ${n(-w)} L ${n(-l)} ${n(w)}`
    body = `<path d="M 0 0 ${rear} Z" ${fill}/>`
  }
  return {
    id,
    // refX/refY put the arrow tip at the endpoint; start arrows face away from the path.
    defs: `<marker id="${id}" markerUnits="userSpaceOnUse" markerWidth="${n(l)}" markerHeight="${n(end.widthPx)}" refX="0" refY="0" orient="auto-start-reverse" overflow="visible">${body}</marker>`,
  }
}

/**
 * 阴影 → SVG 滤镜。
 *
 * `offsetX/offsetY` 已经是算好的像素偏移（上游的注释说明：`distPx/dirDeg`
 * 是给编辑器读的原始值，因为距离为 0 时偏移会丢掉方向）。所以这里直接用
 * 偏移量，不去碰角度。
 */
/** SVG approximations share one filter so combining effects does not overwrite a prior filter. */
function objectEffects(
  node: ShapeRenderNode | PictureRenderNode,
  body: string,
): { defs: string; body: string } {
  let defs = ''
  const steps: string[] = []
  const merge: string[] = []
  if (node.glow) {
    const p = paint(node.glow.color)
    steps.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${n(node.glow.blurPx / 2)}" result="glowBlur"/><feFlood flood-color="${attr(p.color)}" flood-opacity="${n(p.opacity)}" result="glowColor"/><feComposite in="glowColor" in2="glowBlur" operator="in" result="glow"/>`,
    )
    merge.push('<feMergeNode in="glow"/>')
  }
  if (node.shadow && !node.shadow.inner) {
    const p = paint(node.shadow.color)
    steps.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${n(node.shadow.blurPx / 2)}" result="shadowBlur"/><feOffset in="shadowBlur" dx="${n(node.shadow.offsetX)}" dy="${n(node.shadow.offsetY)}" result="shadowOffset"/><feFlood flood-color="${attr(p.color)}" flood-opacity="${n(p.opacity)}" result="shadowColor"/><feComposite in="shadowColor" in2="shadowOffset" operator="in" result="shadow"/>`,
    )
    merge.push('<feMergeNode in="shadow"/>')
  }
  let source = 'SourceGraphic'
  if (node.softEdgePx) {
    steps.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${n(node.softEdgePx / 2)}" result="softAlpha"/><feComposite in="SourceGraphic" in2="softAlpha" operator="in" result="softSource"/>`,
    )
    source = 'softSource'
  }
  merge.push(`<feMergeNode in="${source}"/>`)
  if (node.shadow?.inner) {
    const p = paint(node.shadow.color)
    steps.push(
      `<feComponentTransfer in="SourceAlpha" result="inverseAlpha"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur in="inverseAlpha" stdDeviation="${n(node.shadow.blurPx / 2)}" result="innerBlur"/><feOffset in="innerBlur" dx="${n(node.shadow.offsetX)}" dy="${n(node.shadow.offsetY)}" result="innerOffset"/><feComposite in="innerOffset" in2="SourceAlpha" operator="in" result="innerClip"/><feFlood flood-color="${attr(p.color)}" flood-opacity="${n(p.opacity)}" result="innerColor"/><feComposite in="innerColor" in2="innerClip" operator="in" result="innerShadow"/>`,
    )
    merge.push('<feMergeNode in="innerShadow"/>')
  }
  let filter = ''
  if (steps.length) {
    const id = nextId('effects')
    defs += `<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">${steps.join('')}<feMerge>${merge.join('')}</feMerge></filter>`
    filter = ` filter="url(#${id})"`
  }
  if (!node.reflection) return { defs, body: `<g${filter}>${body}</g>` }
  const id = nextId('reflectionSource'),
    gradient = nextId('reflectionFade'),
    mask = nextId('reflectionMask'),
    blur = nextId('reflectionBlur')
  const { w, h } = node.box
  const top = h + node.reflection.distPx
  const end = top + h * node.reflection.endPos
  defs += `<linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(top)}" x2="0" y2="${n(Math.max(top + 0.01, end))}"><stop offset="0" stop-color="white" stop-opacity="${n(node.reflection.startAlpha)}"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><mask id="${mask}" maskUnits="userSpaceOnUse" x="${n(-w)}" y="${n(top)}" width="${n(w * 3)}" height="${n(h)}"><rect x="${n(-w)}" y="${n(top)}" width="${n(w * 3)}" height="${n(h)}" fill="url(#${gradient})"/></mask><filter id="${blur}"><feGaussianBlur stdDeviation="${n(node.reflection.blurPx / 2)}"/></filter>`
  return {
    defs,
    body: `<g id="${id}"${filter}>${body}</g><g mask="url(#${mask})"><use href="#${id}" transform="translate(0 ${n(h * 2 + node.reflection.distPx)}) scale(1 -1)" filter="url(#${blur})"/></g>`,
  }
}

/**
 * 一个 run 的**样式指纹**：这些属性相同的相邻 run 可以合进同一个 `<text>`。
 * 位置不参与——位置是逐个 run 给的（见 `textLayout`）。
 */
function styleKey(run: GlyphRun): string {
  return [
    run.baselineY.toFixed(2),
    run.fontFamily,
    run.fontSizePx.toFixed(2),
    run.color,
    run.bold ? 'b' : '',
    run.italic ? 'i' : '',
    run.underline ? 'u' : '',
    run.strike ? 's' : '',
    run.letterSpacingPx?.toFixed(2) ?? '',
    run.justifyExtraPx?.toFixed(2) ?? '',
    run.rtl ? 'rtl' : '',
    run.rotate90 ? 'r90' : '',
    run.rotate270 ? 'r270' : '',
    run.outline ? `o${run.outline.color}${run.outline.widthPx}` : '',
    run.link ?? '',
  ].join('|')
}

/**
 * 一段排好的文字 → 若干 `<text>`。
 *
 * ## 一个 run 就是一个 `<text>`
 *
 * 这一点必须说清楚，因为它反直觉：`GlyphRun.text` 是**一个词或一个片段**
 * （CJK 逐字，拉丁文按词），`run.x` 是这个片段的起点，`run.widthPx` 是它的
 * 总宽。**不是**「一个 run 一个字」。
 *
 * 所以最直白的画法是**一个 run 一个 `<text>`**，让浏览器去排这个片段内部的
 * 字形（那是它擅长的事：连字、字距调整都对）——上游的 Konva 适配器就是这么
 * 做的（`glyphToDraw` 返回 `{ text: run.text, x: run.x }`，交给 canvas
 * `fillText` 画整段）。
 *
 * ## 曾经写错的一版（记下来免得再踩）
 *
 * 第一版把每个 run 的 x 拼成 SVG 的**逐字坐标列表**（`x="10 20 30"`），
 * 以为「一个 run 一个字」，于是那份列表的项数与文字的字数对不上——
 * SVG 的规则是「有多余的字按常规排版接着放」，于是「2026」被拆成
 * 「2  026」那样带空档的样子。**症状是文字间距不对，而不是报错**，
 * 只有真去看渲染结果才发现。
 *
 * ## 合并相邻同样式的 run
 *
 * 合并的前提是**位置也能顺次接上**：同一样式、`x` 恰好等于上一个 run 的
 * 终点（误差 < 0.5px）才合。否则整段会被浏览器的自然排版重排，
 * 与文件里的位置脱节。不满足就断开——多几个 `<text>` 元素不花钱，
 * 位置错了才要命。
 */
function textLayout(
  layout: RenderTextLayout | undefined,
  offsetX: number,
  offsetY: number,
): string {
  if (!layout || layout.lines.length === 0) return ''

  const parts: string[] = []
  let paragraph = -1
  for (const line of layout.lines) {
    if (paragraph < 0 || line.paraStart !== false) {
      if (paragraph >= 0) parts.push('</g>')
      paragraph++
      parts.push(`<g data-pptx-paragraph="${paragraph}">`)
    }
    /** 当前累积的样式段 */
    let group: GlyphRun[] = []
    /** 上一个 run 的右边界（用来判断能不能接着合） */
    let groupRight = 0

    const flush = () => {
      if (group.length === 0) return
      parts.push(textEl(group, offsetX, offsetY))
      group = []
    }

    for (const run of line.runs) {
      if (run.text === '') continue

      /**
       * 图片项目符号（`<a:buBlip>`）：上游把 glyph 文本置空、把图片放在
       * `image` 字段里，并给出 `widthPx`（图宽）与 `ascentPx`（图高）。
       * 它不是文字，单独画，且**打断**当前的样式段。
       */
      if (run.image) {
        flush()
        const w = run.widthPx
        const h = run.ascentPx ?? run.fontSizePx
        parts.push(
          `<image href="${attr(run.image)}" x="${n(offsetX + run.x)}" ` +
            `y="${n(offsetY + run.baselineY - h)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none"/>`,
        )
        groupRight = run.x + run.widthPx
        continue
      }

      const prev = group.at(-1)
      // 样式不同、或位置接不上（引擎的 x 与自己算的宽度有累计误差），就断开
      const styleChanged = prev != null && styleKey(prev) !== styleKey(run)
      const gap = prev != null ? Math.abs(run.x - groupRight) : 0
      if (prev && (styleChanged || gap > 0.5 || prev.rtl || run.rtl)) flush()

      if (group.length === 0) groupRight = run.x + run.widthPx
      else groupRight = Math.max(groupRight, run.x + run.widthPx)
      group.push(run)
    }
    flush()
  }
  if (paragraph >= 0) parts.push('</g>')
  return parts.join('')
}

/** 一个样式段 → 一个 `<text>`（段内文字由浏览器按自己的字体度量排版） */
function textEl(group: readonly GlyphRun[], offsetX: number, offsetY: number): string {
  const head = group[0]!
  const p = paint(head.color)

  const attrs = [
    `x="${n(offsetX + head.x)}"`,
    `y="${n(offsetY + head.baselineY)}"`,
    // 字号用 CSS px：SVG 的 user unit 就是 px，两边一致
    `font-size="${n(head.fontSizePx)}"`,
    `font-family="${attr(head.fontFamily)}"`,
    `fill="${attr(p.color)}"`,
    // 空格是内容（`xml:space` 不保留的话前后空白会被 XML 处理器吃掉）
    'xml:space="preserve"',
  ]
  if (p.opacity < 1) attrs.push(`fill-opacity="${n(p.opacity)}"`)
  if (head.bold) attrs.push('font-weight="700"')
  if (head.italic) attrs.push('font-style="italic"')
  if (head.outline)
    attrs.push(
      `stroke="${attr(paint(head.outline.color).color)}"`,
      `stroke-width="${n(head.outline.widthPx)}"`,
      'paint-order="stroke fill"',
      'stroke-linejoin="round"',
    )
  if (head.rtl) attrs.push('direction="rtl"')

  /**
   * 字距。SVG 的 `letter-spacing` 是「每个字后面加多少」，与 canvas 的
   * `letterSpacing` 语义一致（上游 Konva 适配器也这么接的）。
   * `justifyExtraPx` 是两端对齐时摊进来的额外间距，同样加上。
   */
  const spacing = (head.letterSpacingPx ?? 0) + (head.justifyExtraPx ?? 0)
  if (spacing) attrs.push(`letter-spacing="${n(spacing)}"`)

  const decorations: string[] = []
  if (head.underline) decorations.push('underline')
  if (head.strike) decorations.push('line-through')
  if (decorations.length) attrs.push(`text-decoration="${decorations.join(' ')}"`)

  /**
   * 旋转的字（竖排的拉丁词、`vert270` 的整块）：SVG 没有「原地转 90°」的
   * 文字属性，只能 `transform`，锚点是 `x/baselineY`（上游定义的旋转中心）。
   */
  if (head.rotate90) {
    attrs.push(`transform="rotate(90 ${n(offsetX + head.x)} ${n(offsetY + head.baselineY)})"`)
  } else if (head.rotate270) {
    attrs.push(`transform="rotate(-90 ${n(offsetX + head.x)} ${n(offsetY + head.baselineY)})"`)
  }

  /**
   * 超链接（`run.link`）：`slide:N` 是**片内跳转**，在只读预览里没有可跳的
   * 目标，所以不画成链接；URL 类画成真链接（新窗口打开）——让链接可用，
   * 又不给出会静默失败的假动作。
   */
  const text = group.map((r) => escapeText(r.text)).join('')
  const link = group.find((r) => r.link && !r.link.startsWith('slide:'))?.link
  const body = link
    ? `<a href="${attr(link)}" target="_blank" rel="noreferrer noopener">${text}</a>`
    : text

  return `<text ${attrs.join(' ')}>${body}</text>`
}

/** 形状/文本框节点 */
function shapeNode(node: ShapeRenderNode): { defs: string; body: string } {
  const { x, y, w, h } = node.box
  const fill = fillAttrs(node.fill)
  const stroke = strokeAttrs(node.stroke)
  let defs = fill.defs + stroke.defs

  const common = [fill.attrs, stroke.attrs, `transform="${transformAttr(node.box)}"`]
    .filter(Boolean)
    .join(' ')

  let shape = ''
  if (node.line) {
    // 连接线/直线：折线（可带贝塞尔控制点）画成 path
    const pts = node.line.points
    const d: string[] = []
    if (pts.length >= 2) {
      d.push(`M ${n(pts[0]!)} ${n(pts[1]!)}`)
      const bez = node.line.bezier
      if (bez && bez.length >= 6) {
        for (let i = 0; i + 5 < bez.length; i += 6) {
          d.push(
            `C ${n(bez[i]!)} ${n(bez[i + 1]!)} ${n(bez[i + 2]!)} ${n(bez[i + 3]!)} ${n(bez[i + 4]!)} ${n(bez[i + 5]!)}`,
          )
        }
      } else {
        for (let i = 2; i + 1 < pts.length; i += 2) d.push(`L ${n(pts[i]!)} ${n(pts[i + 1]!)}`)
      }
    }
    const head = connectorMarker(
      pts.length >= 4 ? node.line.headEnd : undefined,
      node.stroke,
      stroke.attrs,
    )
    const tail = connectorMarker(
      pts.length >= 4 ? node.line.tailEnd : undefined,
      node.stroke,
      stroke.attrs,
    )
    defs += head.defs + tail.defs
    const markers = `${head.id ? ` marker-start="url(#${head.id})"` : ''}${tail.id ? ` marker-end="url(#${tail.id})"` : ''}`
    // Flips are baked into points by the render tree; box rotation still applies to the whole path.
    shape = `<path d="${d.join(' ')}" fill="none" ${stroke.attrs}${markers} transform="${transformAttr(node.box)}"/>`
  } else if (node.pathData || node.fillPathData || node.strokePathData) {
    // 自定义几何 / 弧类预设：主路径填充+描边，另有 fill-only 与 stroke-only 子路径
    const parts: string[] = []
    if (node.pathData) parts.push(`<path d="${attr(node.pathData)}" ${common}/>`)
    if (node.fillPathData) parts.push(`<path d="${attr(node.fillPathData)}" ${fill.attrs}/>`)
    if (node.strokePathData)
      parts.push(`<path d="${attr(node.strokePathData)}" fill="none" ${stroke.attrs}/>`)
    shape = parts.join('')
  } else if (node.polygonPoints && node.polygonPoints.length >= 6) {
    const pts: string[] = []
    for (let i = 0; i + 1 < node.polygonPoints.length; i += 2) {
      pts.push(`${n(node.polygonPoints[i]!)},${n(node.polygonPoints[i + 1]!)}`)
    }
    shape = `<polygon points="${pts.join(' ')}" ${common}/>`
  } else if (node.cornerRadiusPx && node.cornerRadiusPx > 0) {
    // roundRect 类：圆角矩形（`cornerRadiusPx` 是上游算好的半径）
    shape = `<rect width="${n(w)}" height="${n(h)}" rx="${n(node.cornerRadiusPx)}" ${common}/>`
  } else if (node.presetGeometry === 'ellipse' || node.presetGeometry === 'circle') {
    shape = `<ellipse cx="${n(w / 2)}" cy="${n(h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${common}/>`
  } else {
    // 其余预设几何上游已退化为矩形（`preset-geometry.ts` 的注释说明）
    shape = `<rect width="${n(w)}" height="${n(h)}" ${common}/>`
  }

  // 形状自带的文字画在几何之上（PowerPoint 的 z 序就是这样）
  const text = textLayout(node.text, 0, 0)
  const effects = objectEffects(node, shape + text)
  defs += effects.defs
  const body = `<g ${elementTag(node)} transform="translate(${n(x)} ${n(y)})">${effects.body}</g>`
  return { defs, body }
}

/**
 * 元素的身份标签：`data-element-id` + `data-element-kind`。
 *
 * ## 为什么渲染器要输出它
 *
 * 编辑器要回答「用户点的是哪个元素」，而 SVG 是字符串注入的——React 那边
 * 拿不到节点引用。所以把身份写进 DOM，界面用事件代理
 * （`closest('[data-element-id]')`）取回来。
 *
 * 这个属性是**给交互层用的契约**，不是装饰：改名会让点选静默失效
 * （点上去没反应，像是「这个元素不能编辑」）。`pptx-save.test.ts` 有一条
 * 断言守它。
 *
 * `sourceId` 是上游给渲染节点的**源元素 id**，与 `Slide.elements[].id` 同一个
 * 命名空间——保存时的脏标记与 `setText` 都是按它找元素的。
 */
function elementTag(node: RenderNode): string {
  return `data-element-id="${attr(node.sourceId)}" data-element-kind="${attr(node.type)}"`
}

/** 旋转/翻转变换。OOXML 的 rot 绕**框中心**顺时针（与 CSS 一致） */
function transformAttr(box: {
  x: number
  y: number
  w: number
  h: number
  rotationDeg: number
  flipH?: boolean
  flipV?: boolean
}): string {
  if (!box.rotationDeg && !box.flipH && !box.flipV) return ''
  const cx = box.w / 2
  const cy = box.h / 2
  const parts: string[] = []
  if (box.flipH || box.flipV) {
    parts.push(`translate(${n(box.flipH ? box.w : 0)} ${n(box.flipV ? box.h : 0)})`)
    parts.push(`scale(${box.flipH ? -1 : 1} ${box.flipV ? -1 : 1})`)
    // 翻转后坐标系回到了左上角，旋转中心要相应还原
    if (box.rotationDeg) {
      parts.push(
        `translate(${n(cx)} ${n(cy)}) rotate(${n(box.rotationDeg)}) translate(${n(-cx)} ${n(-cy)})`,
      )
    }
  } else {
    parts.push(
      `translate(${n(cx)} ${n(cy)}) rotate(${n(box.rotationDeg)}) translate(${n(-cx)} ${n(-cy)})`,
    )
  }
  return parts.join(' ')
}

/** 图片节点 */
type PictureSourceContext = {
  elements?: readonly SlideElement[]
  parent?: GroupElement
  emuScale: number
  childScale?: { x: number; y: number }
}
function pictureNode(
  node: PictureRenderNode,
  context: PictureSourceContext,
): { defs: string; body: string } {
  const { x, y, w, h } = node.box
  const parts: string[] = []
  let defs = ''

  // 背景色（OLE 预览的白底、元文件的透明底）先铺一层
  if (node.bgColor)
    parts.push(`<rect width="${n(w)}" height="${n(h)}" fill="${attr(node.bgColor)}"/>`)

  if (node.dataUrl) {
    const srcRect = node.srcRect
    const opacity = node.opacity != null && node.opacity < 1 ? ` opacity="${n(node.opacity)}"` : ''
    const imgAttrs = [`href="${attr(node.dataUrl)}"`, `width="${n(w)}"`, `height="${n(h)}"`]
    /**
     * 裁剪（`<a:srcRect>`）：上游给的是「从每条边裁掉的比例」。SVG 里用
     * `viewBox` 表达同一个意思——viewBox 是原图坐标系里的可见矩形。
     */
    if (srcRect) {
      const remainingW = 1 - srcRect.l - srcRect.r,
        remainingH = 1 - srcRect.t - srcRect.b
      if (remainingW > 0 && remainingH > 0) {
        imgAttrs.splice(1)
        imgAttrs.push(
          `x="${n((-w * srcRect.l) / remainingW)}"`,
          `y="${n((-h * srcRect.t) / remainingH)}"`,
          `width="${n(w / remainingW)}"`,
          `height="${n(h / remainingH)}"`,
          'preserveAspectRatio="none"',
        )
      }
    }

    /**
     * 非矩形轮廓（圆形头像、圆角相框）：上游已经把可用的三种裁法算进
     * `node.clip`（圆角半径 / 预设多边形 / 自定义路径），这里照着裁。
     */
    const clip = node.clip
    if (clip) {
      const id = nextId('clip')
      let shape = ''
      if (clip.pathData) shape = `<path d="${attr(clip.pathData)}"/>`
      else if (clip.polygonPoints && clip.polygonPoints.length >= 6) {
        const pts: string[] = []
        for (let i = 0; i + 1 < clip.polygonPoints.length; i += 2) {
          pts.push(`${n(clip.polygonPoints[i]!)},${n(clip.polygonPoints[i + 1]!)}`)
        }
        shape = `<polygon points="${pts.join(' ')}"/>`
      } else if (clip.cornerRadiusPx && clip.cornerRadiusPx > 0) {
        shape = `<rect width="${n(w)}" height="${n(h)}" rx="${n(clip.cornerRadiusPx)}"/>`
      }
      if (shape) {
        defs += `<clipPath id="${id}">${shape}</clipPath>`
        parts.push(`<image ${imgAttrs.join(' ')}${opacity} clip-path="url(#${id})"/>`)
      } else {
        parts.push(`<image ${imgAttrs.join(' ')}${opacity}/>`)
      }
    } else {
      parts.push(`<image ${imgAttrs.join(' ')}${opacity}/>`)
    }
  } else {
    /**
     * 图片数据取不到（媒体部件缺失/格式不支持）：画一个灰色占位块，
     * **不留空白**——空白会让「这里本该有图」这件事看不出来。
     */
    parts.push(
      `<rect width="${n(w)}" height="${n(h)}" fill="rgba(128,128,128,0.18)" ` +
        `stroke="rgba(128,128,128,0.35)" stroke-dasharray="4 4"/>`,
    )
    parts.push(
      `<text x="${n(w / 2)}" y="${n(h / 2)}" text-anchor="middle" dominant-baseline="middle" ` +
        `font-size="12" fill="rgba(128,128,128,0.9)">图片未解析</text>`,
    )
  }

  if (node.media) {
    const badge = Math.min(w, h) * 0.22
    const cx = w / 2,
      cy = h / 2
    parts.push(
      `<g aria-label="${node.media === 'video' ? '视频' : '音频'}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(badge)}" fill="#15171ccc"/>`,
    )
    if (node.media === 'video')
      parts.push(
        `<path d="M ${n(cx - badge * 0.3)} ${n(cy - badge * 0.55)} L ${n(cx + badge * 0.6)} ${n(cy)} L ${n(cx - badge * 0.3)} ${n(cy + badge * 0.55)} Z" fill="white"/>`,
      )
    else
      parts.push(
        `<g transform="translate(${n(cx - badge * 0.6)} ${n(cy - badge * 0.6)}) scale(${n(badge / 20)})" stroke="white" fill="none" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M 4 9 L 9 9 L 16 3 L 16 21 L 9 15 L 4 15 Z"/><path d="M 20 7 Q 25 12 20 17"/></g>`,
      )
    parts.push('</g>')
  }
  let content = parts.join('')
  if (node.srcRect) {
    const clip = nextId('cropFrame')
    defs += `<clipPath id="${clip}"><rect width="${n(w)}" height="${n(h)}"/></clipPath>`
    content = `<g clip-path="url(#${clip})">${content}</g>`
  }
  const effects = objectEffects(node, content)
  defs += effects.defs
  const candidates = context.elements?.filter((element) => element.id === node.sourceId) ?? []
  const source =
    candidates.length === 1 && candidates[0]?.type === 'picture' ? candidates[0] : undefined
  const placement =
    source &&
    pptxPicturePlacement(
      source,
      {
        width: context.emuScale,
        height: context.emuScale,
        slideWidth: 1,
        slideHeight: 1,
      },
      context.parent,
    )
  // Pictures need S·R·F from their original source, not R applied to an already
  // anisotropically scaled box. Draw content/clip/effects in their existing box,
  // then map that box into native picture-local pixels and the parent's chOff scale.
  let localMatrix = placement?.localMatrix
  if (placement && context.parent && context.childScale) {
    // A nested group's placed box already includes ancestor scaling. Its actual
    // child mapping may therefore differ from the raw native parent's ext/chExt.
    const child = context.parent.childOffset ?? context.parent.transform.offset
    const { x: sx, y: sy } = context.childScale
    localMatrix = composePptxMatrices(
      [sx, 0, 0, sy, -child.x * context.emuScale * sx, -child.y * context.emuScale * sy],
      placement.nativeMatrix,
    )
  }
  let matrix: PptxMatrix | null =
    placement && localMatrix
      ? composePptxMatrices(localMatrix, [placement.box.w / w, 0, 0, placement.box.h / h, 0, 0])
      : pptxGroupMatrix(node.box)
  if (!placement && context.childScale) {
    const sx = context.childScale.x,
      sy = context.childScale.y
    const quarter = sx !== sy && Math.abs((((node.box.rotationDeg % 180) + 180) % 180) - 90) < 0.5
    const rawW = w / (quarter ? sy : sx),
      rawH = h / (quarter ? sx : sy)
    const raw = pptxGroupMatrix({ ...node.box, x: 0, y: 0, w: rawW, h: rawH })
    if (raw)
      matrix = composePptxMatrices(
        [sx, 0, 0, sy, x + w / 2 - (rawW * sx) / 2, y + h / 2 - (rawH * sy) / 2],
        composePptxMatrices(raw, [rawW / w, 0, 0, rawH / h, 0, 0]),
      )
  }
  return {
    defs,
    body: `<g ${elementTag(node)} transform="${matrix ? pptxMatrixSvg(matrix) : `translate(${n(x)} ${n(y)})`}">${effects.body}</g>`,
  }
}

/** 组合节点：children 的坐标已经是**相对父框**的（上游注释说明） */
function groupNode(
  node: GroupRenderNode,
  context: PictureSourceContext,
): { defs: string; body: string } {
  const matches = context.elements?.filter((element) => element.id === node.sourceId) ?? []
  const source = matches.length === 1 && matches[0]?.type === 'group' ? matches[0] : undefined
  const inner = renderNodes(node.children, {
    elements: source?.children,
    parent: source,
    emuScale: context.emuScale,
    childScale: { x: node.childScaleX ?? 1, y: node.childScaleY ?? 1 },
  })
  const matrix = pptxGroupMatrix(node.box)
  // buildGroup already applied childScaleX/Y. Only the parent's centered rotation
  // and flip remain; retain the existing translation-only markup for identity groups.
  const transform =
    matrix && (node.box.rotationDeg || node.box.flipH || node.box.flipV)
      ? pptxMatrixSvg(matrix)
      : `translate(${n(node.box.x)} ${n(node.box.y)})`
  return {
    defs: inner.defs,
    body: `<g ${elementTag(node)} transform="${transform}">${inner.body}</g>`,
  }
}

/** 表格节点：单元格逐个定位（坐标相对表格左上角） */
function tableNode(node: TableRenderNode): { defs: string; body: string } {
  const parts: string[] = []
  let defs = ''

  // 表格底纹（`<a:tblBg>`）画在所有单元格之下
  if (node.bgFill) {
    const bg = fillAttrs(node.bgFill)
    defs += bg.defs
    parts.push(`<rect width="${n(node.box.w)}" height="${n(node.box.h)}" ${bg.attrs}/>`)
  }

  for (const cell of node.cells) {
    const fill = fillAttrs(cell.fill)
    defs += fill.defs
    const w = cell.w
    const h = cell.h
    if (fill.attrs !== 'fill="none"') {
      parts.push(
        `<rect x="${n(cell.x)}" y="${n(cell.y)}" width="${n(w)}" height="${n(h)}" ${fill.attrs}/>`,
      )
    }

    // 四边描边各自可能是独立的（Excel/PPT 里常见只画下边线）
    for (const [side, s] of [
      ['t', cell.borders?.t],
      ['r', cell.borders?.r],
      ['b', cell.borders?.b],
      ['l', cell.borders?.l],
    ] as const) {
      if (!s || s.widthPx === 0) continue
      const st = strokeAttrs(s)
      defs += st.defs
      const line =
        side === 't'
          ? [cell.x, cell.y, cell.x + w, cell.y]
          : side === 'b'
            ? [cell.x, cell.y + h, cell.x + w, cell.y + h]
            : side === 'l'
              ? [cell.x, cell.y, cell.x, cell.y + h]
              : [cell.x + w, cell.y, cell.x + w, cell.y + h]
      parts.push(
        `<line x1="${n(line[0]!)}" y1="${n(line[1]!)}" x2="${n(line[2]!)}" y2="${n(line[3]!)}" ${st.attrs}/>`,
      )
    }

    parts.push(textLayout(cell.text, cell.x, cell.y))
  }

  return {
    defs,
    body: `<g ${elementTag(node)} transform="translate(${n(node.box.x)} ${n(node.box.y)})">${parts.join('')}</g>`,
  }
}

/** 图表节点：上游给的是**已算好的图元**（柱、折线、扇形、标签），逐个画 */
function chartNode(node: ChartRenderNode): { defs: string; body: string } {
  const parts: string[] = []
  let defs = ''

  if (node.bgFill) {
    const bg = fillAttrs(node.bgFill)
    defs += bg.defs
    parts.push(`<rect width="${n(node.box.w)}" height="${n(node.box.h)}" ${bg.attrs}/>`)
  }

  // 绘图区（画在网格线之下）
  if (node.plotRect) {
    const p = node.plotRect
    const fill = fillAttrs(p.fill)
    defs += fill.defs
    const stroke = p.borderColor
      ? ` stroke="${attr(p.borderColor)}" stroke-width="${n(p.borderWidthPx ?? 1)}"`
      : ''
    parts.push(
      `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" ${fill.attrs}${stroke}/>`,
    )
  }

  for (const gl of node.gridLines) {
    parts.push(
      `<line x1="${n(gl.x1)}" y1="${n(gl.y1)}" x2="${n(gl.x2)}" y2="${n(gl.y2)}" ` +
        `stroke="${attr(gl.color)}" stroke-width="${n(gl.widthPx ?? 1)}"` +
        `${gl.dash?.length ? ` stroke-dasharray="${gl.dash.map(n).join(' ')}"` : ''}/>`,
    )
  }
  for (const al of node.axisLines) {
    parts.push(
      `<line x1="${n(al.x1)}" y1="${n(al.y1)}" x2="${n(al.x2)}" y2="${n(al.y2)}" ` +
        `stroke="${attr(al.color)}" stroke-width="${n(al.widthPx)}"/>`,
    )
  }

  // 柱 / 色块
  for (const bar of node.bars) {
    const fill = fillAttrs(bar.fill ?? { kind: 'solid', color: bar.color })
    defs += fill.defs
    parts.push(
      `<rect x="${n(bar.x)}" y="${n(bar.y)}" width="${n(bar.w)}" height="${n(bar.h)}" ${fill.attrs}/>`,
    )
  }
  for (const sw of node.swatches) {
    parts.push(
      `<rect x="${n(sw.x)}" y="${n(sw.y)}" width="${n(sw.w)}" height="${n(sw.h)}" fill="${attr(sw.color)}"/>`,
    )
  }

  // 折线 / 面积
  for (const poly of node.polylines) {
    const pts: string[] = []
    for (let i = 0; i + 1 < poly.points.length; i += 2) {
      pts.push(`${n(poly.points[i]!)},${n(poly.points[i + 1]!)}`)
    }
    const tag = poly.closed ? 'polygon' : 'polyline'
    parts.push(
      `<${tag} points="${pts.join(' ')}" fill="${poly.fill ? attr(poly.fill) : 'none'}" ` +
        `stroke="${attr(poly.color)}" stroke-width="${n(poly.widthPx)}"` +
        `${poly.dash?.length ? ` stroke-dasharray="${poly.dash.map(n).join(' ')}"` : ''}/>`,
    )
  }

  // 数据点
  for (const mk of node.markers) {
    parts.push(`<circle cx="${n(mk.x)}" cy="${n(mk.y)}" r="${n(mk.r)}" fill="${attr(mk.color)}"/>`)
  }

  // 自由路径（伪 3D 饼图的侧壁等）
  for (const path of node.paths ?? []) {
    parts.push(
      `<path d="${attr(path.d)}" fill="${attr(path.fill)}"` +
        `${path.stroke ? ` stroke="${attr(path.stroke)}"` : ''}` +
        `${path.strokeWidthPx ? ` stroke-width="${n(path.strokeWidthPx)}"` : ''}/>`,
    )
  }

  /**
   * 饼图/圆环扇区。上游给的是 Konva 的 Arc 语义（12 点方向 = -90°，顺时针），
   * SVG 的 `path` 圆弧用同一个角度约定，直接换算即可。
   */
  for (const wedge of node.wedges ?? []) {
    const { cx, cy, outerR, innerR, startDeg, sweepDeg } = wedge
    const toXY = (deg: number, r: number): [number, number] => {
      const rad = (deg * Math.PI) / 180
      return [cx + Math.cos(rad) * r, cy + Math.sin(rad) * r]
    }
    const [x1, y1] = toXY(startDeg, outerR)
    const [x2, y2] = toXY(startDeg + sweepDeg, outerR)
    const large = Math.abs(sweepDeg) > 180 ? 1 : 0
    const sweepFlag = sweepDeg >= 0 ? 1 : 0
    let d = `M ${n(x1)} ${n(y1)} A ${n(outerR)} ${n(outerR)} 0 ${large} ${sweepFlag} ${n(x2)} ${n(y2)}`
    if (innerR > 0) {
      const [x3, y3] = toXY(startDeg + sweepDeg, innerR)
      const [x4, y4] = toXY(startDeg, innerR)
      d += ` L ${n(x3)} ${n(y3)} A ${n(innerR)} ${n(innerR)} 0 ${large} ${sweepFlag === 1 ? 0 : 1} ${n(x4)} ${n(y4)} Z`
    } else {
      d += ` L ${n(cx)} ${n(cy)} Z`
    }
    const fill = wedge.noFill ? 'none' : attr(wedge.color)
    const stroke = wedge.stroke
      ? ` stroke="${attr(wedge.stroke)}" stroke-width="${n(wedge.strokeWidthPx ?? 1)}"`
      : ' stroke="#fff" stroke-width="1"'
    parts.push(`<path d="${d}" fill="${fill}"${stroke}/>`)
  }

  // 文本标签（轴刻度、图例、标题）
  for (const label of node.labels) {
    const transform = label.rotationDeg
      ? ` transform="rotate(${n(label.rotationDeg)} ${n(label.x)} ${n(label.y)})"`
      : ''
    parts.push(
      `<text x="${n(label.x)}" y="${n(label.y + label.fontSizePx)}" ` +
        `font-size="${n(label.fontSizePx)}" font-family="${attr(label.fontFamily ?? 'Calibri, sans-serif')}" ` +
        `fill="${attr(label.color)}"${label.bold ? ' font-weight="700"' : ''}` +
        `${label.italic ? ' font-style="italic"' : ''}${transform}>${escapeText(label.text)}</text>`,
    )
  }

  // 图表边框（所有图元之上）
  if (node.border) {
    parts.push(
      `<rect width="${n(node.box.w)}" height="${n(node.box.h)}" fill="none" ` +
        `stroke="${attr(node.border.color)}" stroke-width="${n(node.border.widthPx)}"/>`,
    )
  }

  return {
    defs,
    body: `<g ${elementTag(node)} transform="translate(${n(node.box.x)} ${n(node.box.y)})">${parts.join('')}</g>`,
  }
}

/** 未解析元素的占位块（SmartArt / OLE / 媒体…）。有预渲染图形时上游已给出内容 */
function chipNode(node: ChipRenderNode): string {
  const { x, y, w, h } = node.box
  return (
    `<g ${elementTag(node)} transform="translate(${n(x)} ${n(y)})">` +
    `<rect width="${n(w)}" height="${n(h)}" fill="rgba(128,128,128,0.10)" ` +
    `stroke="rgba(128,128,128,0.30)" stroke-dasharray="4 4" rx="4"/>` +
    `<text x="${n(w / 2)}" y="${n(h / 2)}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-size="12" fill="rgba(128,128,128,0.9)">${escapeText(node.label)}</text>` +
    `</g>`
  )
}

function renderNodes(
  nodes: readonly RenderNode[],
  context: PictureSourceContext,
): { defs: string; body: string } {
  const defs: string[] = []
  const body: string[] = []

  /**
   * 六个分支**逐个写全**，最后一个是 `placeholder-chip`。
   *
   * 不写成 `if (shape) … else`：上游的 `RenderNodeBase` 把 `type` 声明为
   * 整个 `RenderNodeType` 联合，于是「前面的条件排除了什么」不能推出
   * 「最后的 else 是什么」——TS 会在最后一个分支里保留 `ShapeRenderNode`，
   * 报「Shape 缺少 kind/label」。逐个写全是唯一能让类型收窄成立的形式。
   */
  for (const node of nodes) {
    if (node.type === 'shape' || node.type === 'text') {
      const r = shapeNode(node)
      defs.push(r.defs)
      body.push(r.body)
    } else if (node.type === 'picture') {
      const r = pictureNode(node, context)
      defs.push(r.defs)
      body.push(r.body)
    } else if (node.type === 'group') {
      const r = groupNode(node, context)
      defs.push(r.defs)
      body.push(r.body)
    } else if (node.type === 'table') {
      const r = tableNode(node)
      defs.push(r.defs)
      body.push(r.body)
    } else if (node.type === 'chart') {
      const r = chartNode(node)
      defs.push(r.defs)
      body.push(r.body)
    } else if (node.type === 'placeholder-chip') {
      body.push(chipNode(node))
    }
  }

  return { defs: defs.filter(Boolean).join(''), body: body.join('') }
}

/** 背景填充 → 铺满画布的矩形 */
function backgroundEl(
  fill: RenderSlide['background'],
  w: number,
  h: number,
): { defs: string; body: string } {
  // 默认白底：ppt 的默认背景就是白的，透明会让深色主题下文字看不清
  if (!fill || fill.kind === 'none') return { defs: '', body: '' }
  const f = fillAttrs(fill)
  return { defs: f.defs, body: `<rect width="${n(w)}" height="${n(h)}" ${f.attrs}/>` }
}

/**
 * 渲染一页 → SVG 字符串。
 *
 * 产出的是**完整可用**的 `<svg>`（含 `xmlns`），可以直接塞进 React 的
 * `dangerouslySetInnerHTML`，也可以单独存成 `.svg` 文件。
 */
export function renderSlideToSvg(slide: RenderSlide, idPrefix = '', source?: Slide): string {
  uid = 0
  // Encode each code point so caller namespaces stay unique and safe in SVG URL fragments.
  namespace = idPrefix
    ? `pptx-${Array.from(idPrefix, (character) => character.codePointAt(0)!.toString(16)).join('-')}-`
    : ''
  const bg = backgroundEl(slide.background, slide.widthPx, slide.heightPx)
  const nodes = renderNodes(slide.nodes, {
    elements: source?.elements,
    emuScale: (slide.scale * 96) / 914400,
  })
  const defs = bg.defs + nodes.defs

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(slide.widthPx)} ${n(slide.heightPx)}" `,
    `width="${n(slide.widthPx)}" height="${n(slide.heightPx)}">`,
    defs ? `<defs>${defs}</defs>` : '',
    bg.body,
    nodes.body,
    '</svg>',
  ].join('')
}
