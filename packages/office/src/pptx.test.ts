import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openPptx } from './pptx.js'
import type { Slide } from '../vendor/packages/pptx-engine/src/types.js'
import { buildRenderSlide } from '../vendor/packages/pptx-render/src/build-slide.js'
import { HeuristicMetrics } from '../vendor/packages/pptx-render/src/metrics.js'
import { XMLValidator } from 'fast-xml-parser'
import { renderSlideToSvg } from './pptx-svg.js'

/**
 * pptx 的**打开**（`src/pptx.ts` + `src/pptx-archive.ts`）。
 *
 * 守的是「幻灯片最终长什么样」这件事里最容易静默出错的两处：
 *
 *  1. **占位符的位置不在幻灯片里**。用版式建的标题页，`slide1.xml` 里两个
 *     占位符的 `<p:spPr/>` 是空的——位置在 `slideLayout1.xml`。不走上溯的话
 *     它们会叠在 (0,0)，画面看着「有字」但版式全错
 *  2. **主题/母版给的不只是颜色**。字号、锚点、内边距都可能来自母版，
 *     漏一层就是「字都在，但大小与位置都不对」
 *
 * 夹具是 python-pptx 现造的（`tests/fixtures/make-pptx-fixtures.py`）：
 * 自造的而不是 vendored 的，因为这里测的是**我们的装配**，需要能精确断言
 * 某一句文字落在哪个坐标。
 */
const EMPTY_DECK = new URL('../tests/fixtures/empty-deck.pptx', import.meta.url)
const TITLE_LAYOUT = new URL('../tests/fixtures/title-layout.pptx', import.meta.url)

function load(url: URL): Uint8Array {
  return new Uint8Array(readFileSync(url))
}

describe('openPptx', () => {
  it('读出画布尺寸与幻灯片顺序', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    // 默认 10 × 7.5 英寸
    expect(deck.size.cx).toBe(9144000)
    expect(deck.size.cy).toBe(6858000)
    expect(deck.slides()).toHaveLength(1)
    expect(deck.slides()[0]?.path).toBe('ppt/slides/slide1.xml')
  })

  it('损坏的文件给出可读的错误（不是渲染一张空画布）', async () => {
    await expect(openPptx(new TextEncoder().encode('not a zip at all'))).rejects.toThrow(
      /不是一份有效的 pptx|End of data reached|Can't find end of central directory/,
    )
  })
})

describe('版式与母版上溯', () => {
  it('占位符的位置从**母版**取（幻灯片与版式里都没有）', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    const slide = deck.slides()[0]!

    /**
     * 这个夹具刻意选了一条**两级**上溯链：`slide1.xml` 里占位符的
     * `<p:spPr/>` 是空的，它引的 `slideLayout2.xml` 里**也是**空的——
     * 位置只在 `slideMaster1.xml` 里。
     *
     * 母版给的标题框：off (457200, 274638) ext (8229600, 1143000) EMU。
     * 画布 9144000 × 6858000 EMU，渲染到 960px 宽时 scale = 960/9144000，
     * 于是 x = 457200 × scale ≈ 48px、y = 274638 × scale ≈ 28.8px。
     * **不上溯的话这两个值都是 0**——字都在，但整页版式叠在左上角。
     */
    expect(slide.originalXml).not.toMatch(/<a:xfrm>/)
    const layoutPath = 'ppt/slideLayouts/slideLayout2.xml'
    expect(slide.layoutPath).toBe(layoutPath)

    const tree = buildRenderSlide(slide, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    const title = tree.nodes.find(
      (n) => (n.type === 'shape' || n.type === 'text') && n.text != null,
    )
    expect(title, '标题占位符应当渲染成一个节点').toBeDefined()

    const scale = 960 / deck.size.cx
    expect(title!.box.x).toBeCloseTo(457200 * scale, 0)
    expect(title!.box.y).toBeCloseTo(274638 * scale, 0)
    expect(title!.box.w).toBeCloseTo(8229600 * scale, 0)
  })

  it('幻灯片自己的文字被解析出来（含多段落）', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    const tree = buildRenderSlide(deck.slides()[0]!, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    /**
     * 一个 `GlyphRun` 是**一段连续同格式的文字**，但布局引擎会把每个字拆成
     * 独立的 run（每个字要拿自己的 x 去定位）。所以断言要按行拼起来看，
     * 而不是拿 run 文本去比对。
     *
     * 另外布局引擎会**注入**项目符号（`isBullet`）——正文占位符的段落带
     * 项目符号，那是它按母版的 `lstStyle` 加上去的，不是文件里的文字。
     * 断言要跳过它们，否则测的是「有没有项目符号」而不是「正文在不在」。
     */
    const lines = tree.nodes
      .filter((n) => n.type === 'shape' || n.type === 'text')
      .flatMap((n) => (n.type === 'shape' || n.type === 'text' ? (n.text?.lines ?? []) : []))
      .map((line) =>
        line.runs
          .filter((r) => !r.isBullet)
          .map((r) => r.text)
          .join(''),
      )

    expect(lines).toContain('用版式建的标题页')
    expect(lines).toContain('第一条')
    expect(lines).toContain('第二条')
  })

  it('文字定位到版式给的框里（x 有值，不是都堆在 0）', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    const tree = buildRenderSlide(deck.slides()[0]!, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    const title = tree.nodes.find(
      (n) => (n.type === 'shape' || n.type === 'text') && n.text != null,
    )
    expect(title).toBeDefined()
    // 版式里标题左边界 685800 EMU → 960px 宽下约 72px，上边界约 224px
    const first = title!.type === 'shape' || title!.type === 'text' ? title!.text : undefined
    const run = first?.lines[0]?.runs[0]
    expect(run).toBeDefined()
    // 内边距 + 版式给的偏移；不上溯的话这两个值都会是 0
    expect(run!.x).toBeGreaterThan(0)
    expect(run!.baselineY).toBeGreaterThan(0)
  })
})

describe('空演示文稿', () => {
  it('没有幻灯片时报错，而不是给一张空白画布', async () => {
    await expect(openPptx(load(EMPTY_DECK))).rejects.toThrow(/没有幻灯片/)
  })
})

describe('SVG 渲染', () => {
  it('产出合法的 SVG，且文字是**可选中的文本节点**（不是位图）', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    const tree = buildRenderSlide(deck.slides()[0]!, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    const svg = renderSlideToSvg(tree)

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    // viewBox 用渲染尺寸，缩放时由 CSS 决定
    expect(svg).toContain('viewBox="0 0 960 720"')

    /*
     * 这一条是走 SVG 而不是 canvas 的**全部理由**：`<text>` 是真实文本节点，
     * 浏览器里可以选中、可以 Ctrl+F 搜到、读屏软件能读。canvas 画的字
     * 只是像素。断言文字真的在 `<text>` 里，而不是在某个 data 属性里。
     */
    expect(svg).toMatch(/<text[^>]*>用版式建的标题页<\/text>/)
    /*
     * 正文那两行前面带着 `•`——项目符号是**布局引擎按母版 lstStyle 注入**的
     * （`isBullet` run），不是文件里的文字。它与正文之间有一段缩进（符号在
     * x=0、正文在 x=36），位置接不上所以**分成两个元素**——这正是
     * 「位置接不上就别合」那条规则的体现。
     */
    expect(svg).toMatch(/<text[^>]*>•<\/text>/)
    expect(svg).toMatch(/<text[^>]*>第一条<\/text>/)

    /*
     * 一个 `GlyphRun` 是**一个词或一个片段**（CJK 逐字，拉丁文按词），
     * `run.x` 是它的起点。所以一个 run 对应一个 `<text>`，让浏览器去排
     * 片段内部——这与上游 Konva 适配器的做法一致（`fillText(run.text, run.x)`）。
     */
    expect(svg).toMatch(/<text[^>]*>用版式建的标题页<\/text>/)
  })

  it('每个 text 只有一个 x 坐标（多值会被浏览器当逐字定位，把词拆开）', async () => {
    /*
     * 守的是一个**踩过的坑**（`pptx-svg.ts` 的 `textLayout` 注释里记着）：
     * 第一版误以为「一个 run 一个字」，把每个 run 的 x 拼成 SVG 的**逐字
     * 坐标列表**（`x="0 21 42 64"`）。
     *
     * SVG 的规则是「字比坐标多时，多出来的按常规排版接着放」——于是
     * 「2026」这类一个 run 里的多字符词会被拆出空档（渲染出来是
     * 「2  026」）。**症状是字距不对，不报错**，只有真去看才发现。
     *
     * 所以这里断言：每个 `<text>` 的 x 只有一个值。
     */
    const deck = await openPptx(load(TITLE_LAYOUT))
    const tree = buildRenderSlide(deck.slides()[0]!, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    const svg = renderSlideToSvg(tree)

    const xValues = [...svg.matchAll(/<text[^>]*\sx="([^"]+)"/g)].map((m) => m[1]!)
    expect(xValues.length).toBeGreaterThan(0)
    for (const value of xValues) {
      expect(value.split(/\s+/), `x="${value}" 有多个坐标`).toHaveLength(1)
    }
  })

  it('相邻同格式且位置接得上的 run 合成一个 text', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    const slide = structuredClone(deck.slides()[0]!) as Slide
    const el = slide.elements.find((e) => (e as { text?: unknown }).text != null)
    const body = (el as { text: { paragraphs: Array<{ runs: Array<{ text: string }> }> } }).text
    body.paragraphs.push({ runs: [{ text: '甲乙' }, { text: '丙丁' }] } as never)

    const tree = buildRenderSlide(slide, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    const svg = renderSlideToSvg(tree)
    // 同格式相邻 → 合起来一个元素（而不是两个各自定位的）
    expect(svg).toMatch(/<text[^>]*>甲乙丙丁<\/text>/)
  })

  it('XML 转义：文字里的尖括号与 & 不会破坏文档结构', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    const slide = structuredClone(deck.slides()[0]!) as Slide
    // 塞一句带特殊字符的话（模拟文件里本来就有这类文字）
    const el = slide.elements.find((e) => (e as { text?: unknown }).text != null)
    const body = (el as { text: { paragraphs: Array<{ runs: Array<{ text: string }> }> } }).text
    body.paragraphs.push({ runs: [{ text: 'A & B <tag> "q"' }] } as never)

    const tree = buildRenderSlide(slide, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    const svg = renderSlideToSvg(tree)
    expect(svg).toContain('A &amp; B &lt;tag&gt; "q"')
    // 未转义的话这里会出现裸的 <tag>，SVG 就成了非法 XML
    expect(svg).not.toContain('<tag>')
    /*
     * 还要能**被解析**：XML 是「一处坏了整份文档都读不出来」的格式，
     * 而症状是「整页空白」而不是「那句话显示不对」——所以用真解析器验一次，
     * 不靠肉眼比对字符串。
     */
    expect(XMLValidator.validate(svg)).toBe(true)
  })

  it('图片数据缺失时画占位块，不留空白', async () => {
    const deck = await openPptx(load(TITLE_LAYOUT))
    const slide = structuredClone(deck.slides()[0]!) as Slide
    slide.elements.push({
      id: 'test-pic',
      type: 'picture',
      transform: {
        offset: { x: 0, y: 0, cx: 914400, cy: 914400 },
        rot: 0,
        flipH: false,
        flipV: false,
      },
      mediaRef: 'ppt/media/missing.png',
    } as never)

    const tree = buildRenderSlide(slide, deck.size, {
      fitWidthPx: 960,
      metrics: new HeuristicMetrics(),
    })
    const svg = renderSlideToSvg(tree)
    expect(svg).toContain('图片未解析')
  })
})
