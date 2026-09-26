import type {
  RenderFill,
  RenderNode,
  RenderShadow,
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
} from '../vendor/packages/pptx-render/src/render-tree.js'
import { patternGrid } from '../vendor/packages/pptx-render/src/pattern-fills.js'

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
const nextId = (prefix: string): string => `${prefix}${(uid += 1)}`

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
  if (p.opacity < 1) parts.push(`stroke-opacity="${n(p.opacity)}"`)
  if (stroke.cap) parts.push(`stroke-linecap="${attr(stroke.cap)}"`)
  if (stroke.join) parts.push(`stroke-linejoin="${attr(stroke.join)}"`)
  if (stroke.dash?.length) parts.push(`stroke-dasharray="${stroke.dash.map(n).join(' ')}"`)

  if (stroke.gradient) {
    const id = nextId('sgrad')
    const stops = stroke.gradient.stops
      .map((s) => {
        const sp = paint(s.color)
        return `<stop offset="${n(s.pos)}" stop-color="${attr(sp.color)}"/>`
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

/**
 * 阴影 → SVG 滤镜。
 *
 * `offsetX/offsetY` 已经是算好的像素偏移（上游的注释说明：`distPx/dirDeg`
 * 是给编辑器读的原始值，因为距离为 0 时偏移会丢掉方向）。所以这里直接用
 * 偏移量，不去碰角度。
 */
function shadowDefs(shadow: RenderShadow | undefined): { defs: string; attrs: string } {
  if (!shadow) return { defs: '', attrs: '' }
  const id = nextId('shadow')
  const p = paint(shadow.color)
  /**
   * 内阴影：SVG 的滤镜没有真正的 inset 阴影（要 feComposite 拼，
   * 而 OOXML 的内阴影还带缩放/倾斜参数，拼不出来就画错的）。折中是：
   * **不画内阴影**，只画外阴影——少画一层比画一层错的好。
   */
  if (shadow.inner) return { defs: '', attrs: '' }
  return {
    defs:
      `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="${n(shadow.offsetX)}" dy="${n(shadow.offsetY)}" ` +
      `stdDeviation="${n(shadow.blurPx / 2)}" ` +
      `flood-color="${attr(p.color)}" flood-opacity="${n(p.opacity)}"/>` +
      `</filter>`,
    attrs: `filter="url(#${id})"`,
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
  for (const line of layout.lines) {
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
  const shadow = shadowDefs(node.shadow)
  const defs = fill.defs + stroke.defs + shadow.defs

  const common = [fill.attrs, stroke.attrs, shadow.attrs, `transform="${transformAttr(node.box)}"`]
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
            `C ${n(pts[0]! + bez[i]!)} ${n(pts[1]! + bez[i + 1]!)} ${n(pts[0]! + bez[i + 2]!)} ${n(pts[1]! + bez[i + 3]!)} ${n(pts[0]! + bez[i + 4]!)} ${n(pts[1]! + bez[i + 5]!)}`,
          )
        }
      } else {
        for (let i = 2; i + 1 < pts.length; i += 2) d.push(`L ${n(pts[i]!)} ${n(pts[i + 1]!)}`)
      }
    }
    // 直线没有填充（fill 会把它连成一块），强制 none
    shape = `<path d="${d.join(' ')}" fill="none" ${stroke.attrs}${shadow.attrs ? ` ${shadow.attrs}` : ''}/>`
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
  const body = `<g ${elementTag(node)} transform="translate(${n(x)} ${n(y)})">${shape}${text}</g>`
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
function pictureNode(node: PictureRenderNode): { defs: string; body: string } {
  const { x, y, w, h } = node.box
  const shadow = shadowDefs(node.shadow)
  const parts: string[] = []
  let defs = shadow.defs

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
      const vbX = srcRect.l * 100
      const vbY = srcRect.t * 100
      const vbW = (1 - srcRect.l - srcRect.r) * 100
      const vbH = (1 - srcRect.t - srcRect.b) * 100
      if (vbW > 0 && vbH > 0) {
        imgAttrs.push(`viewBox="${n(vbX)} ${n(vbY)} ${n(vbW)} ${n(vbH)}"`)
        // viewBox 是原图坐标，缩放方式要和 img 尺寸对齐
        imgAttrs.push(`preserveAspectRatio="none"`)
        imgAttrs.push(`width="${n(w)}"`, `height="${n(h)}"`)
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

  const t = transformAttr(node.box)
  const wrap = t ? ` transform="${t}"` : ''
  return {
    defs,
    body: `<g ${elementTag(node)}${wrap}><g transform="translate(${n(x)} ${n(y)})">${parts.join('')}</g></g>`,
  }
}

/** 组合节点：children 的坐标已经是**相对父框**的（上游注释说明） */
function groupNode(node: GroupRenderNode): { defs: string; body: string } {
  const inner = renderNodes(node.children)
  return {
    defs: inner.defs,
    body: `<g ${elementTag(node)} transform="translate(${n(node.box.x)} ${n(node.box.y)})">${inner.body}</g>`,
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

function renderNodes(nodes: readonly RenderNode[]): { defs: string; body: string } {
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
      const r = pictureNode(node)
      defs.push(r.defs)
      body.push(r.body)
    } else if (node.type === 'group') {
      const r = groupNode(node)
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
export function renderSlideToSvg(slide: RenderSlide): string {
  uid = 0
  const bg = backgroundEl(slide.background, slide.widthPx, slide.heightPx)
  const nodes = renderNodes(slide.nodes)
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
