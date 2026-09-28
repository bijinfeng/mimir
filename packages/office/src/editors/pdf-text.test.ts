/**
 * 文字层与查找的实测。
 *
 * 断言方式与 `pdf-pages.test.ts` 一致：**用 pdf.js 自己读回**（被测代码只用
 * 它取文字），所以这里验的是「矩形到底框在哪儿」。四条最容易静默错的：
 *
 *   1. 旋转 90/270 时矩形跟着转（角度分支写错只会让高亮跑偏，不报错）
 *   2. 中文搜得到（这是 cmaps 之外的另一条中文链路）
 *   3. 大小写与全词匹配的边界（含中文——中文没有词边界）
 *   4. 命中落在一段中间时按比例切（不许把整段都框上）
 */

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { buildPdfTextIndex, searchPdfText, type PdfMatch, type PdfTextSource } from './pdf-text.js'

/**
 * 造一份**中文** PDF（Type0/Identity-H 的 CID 字体，不内嵌，靠 ToUnicode 映射）。
 *
 * ## 为什么不用 pdf-lib 的 `drawText` 写中文
 *
 * pdf-lib 走 WinAnsi 编码，写不了汉字；要写汉字得内嵌一份 CJK 字体，而它内嵌
 * 自定义字体需要一个 fontkit 插件（不在依赖里）+ 一份 10MB 的字体文件。
 *
 * 而「中文 PDF」在真实世界里的形状恰恰就是**这份手工拼出来的样子**：字体没
 * 内嵌、字符到 Unicode 的映射在 ToUnicode 里（那份映射缺失时，界面上就是
 * TECH §15.12 记的「整段空白」）。所以这一份夹具比内嵌字体的版本更接近现场。
 */
function makeCidPdf(cids = '00010002'): Uint8Array {
  // BT /F1 24 Tf 50 300 Td <00010002> Tj ET —— 两个字形的 id 是 0001 / 0002
  const content = `BT /F1 24 Tf 50 300 Td <${cids}> Tj ET\n`
  const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
2 beginbfchar
<0001> <7EC4>
<0002> <4EF6>
endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /NotoSansSC /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSansSC /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 /W [1 [1000 1000]] >>',
    `<< /Length ${toUnicode.length} >>\nstream\n${toUnicode}\nendstream`,
    '<< /Type /FontDescriptor /FontName /NotoSansSC /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>',
  ]
  let out = '%PDF-1.7\n'
  const offsets: number[] = []
  objects.forEach((body, position) => {
    offsets.push(out.length)
    out += `${position + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

/** 测试用的加载器：与 pdf-render 的缓存同样的语义（同一份字节 → 同一个文档） */
const cache = new Map<Uint8Array, Promise<PDFDocumentProxy>>()
function documentFor(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  let doc = cache.get(bytes)
  if (doc === undefined) {
    const task = getDocument({ data: bytes.slice() })
    doc = task.promise
    cache.set(bytes, doc)
  }
  return doc
}

const NO_OPTIONS = { matchCase: false, wholeWord: false }

/** 造一份 PDF：一页一段文字，可指定落点 */
async function makePdf(
  specs: readonly { text: string; width: number; height: number; x?: number; y?: number }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const spec of specs) {
    const page = doc.addPage([spec.width, spec.height])
    page.drawText(spec.text, {
      x: spec.x ?? 50,
      y: spec.y ?? spec.height - 100,
      size: 12,
      font,
    })
  }
  return doc.save()
}

/** 一页原件的索引源 */
function sourceOf(bytes: Uint8Array, index = 0, rotation = 0): PdfTextSource {
  return { bytes, index, rotation }
}

async function indexOf(sources: readonly PdfTextSource[]) {
  return buildPdfTextIndex(sources, documentFor)
}

describe('buildPdfTextIndex', () => {
  it('取出每页的文字（页序就是布局顺序）', async () => {
    const bytes = await makePdf([
      { text: 'alpha', width: 300, height: 400 },
      { text: 'beta', width: 300, height: 400 },
    ])
    const index = await indexOf([sourceOf(bytes, 0), sourceOf(bytes, 1)])
    expect(index.pages.map((page) => page.text)).toEqual(['alpha', 'beta'])
    expect(index.pagesWithText).toBe(2)
  })

  it('白色页没有文字：索引里占位，页号不错位', async () => {
    const bytes = await makePdf([{ text: 'first', width: 300, height: 400 }])
    const index = await indexOf([
      sourceOf(bytes, 0),
      // 空白页（没有来源）
      { bytes: null, index: 0, rotation: 0 },
      sourceOf(bytes, 0, 90),
    ])
    expect(index.pages).toHaveLength(3)
    expect(index.pages[1]?.text).toBe('')
    expect(searchPdfText(index, 'first', NO_OPTIONS).map((match) => match.page)).toEqual([0, 2])
  })

  it('扫描件（没有文字层）如实报 0 页有文字', async () => {
    const bytes = await makePdf([])
    const index = await indexOf([sourceOf(bytes)])
    expect(index.pagesWithText).toBe(0)
    expect(searchPdfText(index, '任何', NO_OPTIONS)).toEqual([])
  })
})

describe('矩形：与画面同一套坐标', () => {
  it('不旋转时，命中矩形落在文字实际占的位置上', async () => {
    // 300×400 的页，文字画在 (50, 300)，12pt
    const bytes = await makePdf([{ text: 'Hello', width: 300, height: 400 }])
    const index = await indexOf([sourceOf(bytes)])
    const [match] = searchPdfText(index, 'Hello', NO_OPTIONS)
    const rect = match!.rects[0]!

    // 左边 50/300 ≈ 0.1667；这一段就是整串，所以宽度是文字宽度占比
    expect(rect.x).toBeCloseTo(50 / 300, 3)
    // 基线上方：canvas 的 y = 400 - 300 - 字高 → 顶部约 (400-300-12)/400
    expect(rect.y).toBeGreaterThan(0.2)
    expect(rect.y + rect.height).toBeLessThan(0.3)
    // 命中整段时不加 inset（整段都亮）
    expect(rect.insetLeft).toBeUndefined()
    expect(rect.insetRight).toBeUndefined()
  })

  it('命中落在一段中间：按比例切，不把整段框上', async () => {
    const bytes = await makePdf([{ text: 'zzzzTARGETzzzz', width: 300, height: 400 }])
    const index = await indexOf([sourceOf(bytes)])
    const [match] = searchPdfText(index, 'TARGET', NO_OPTIONS)
    const rect = match!.rects[0]!
    // 段一共 14 个字符，左边 4 个（zzzz）、右边 4 个（zzzz）被切掉
    expect(rect.insetLeft).toBeCloseTo(4 / 14, 5)
    expect(rect.insetRight).toBeCloseTo(4 / 14, 5)
    // 段的左边缘没动，位置仍然是整段的（切的是段内部的 inset）
    expect(rect.x).toBeCloseTo(50 / 300, 3)
  })

  it('旋转 90 度：矩形跟着转（宽高关系反过来）', async () => {
    // 竖版 300×400，文字画在顶部；转 90 度后文字跑到右侧竖排
    const bytes = await makePdf([{ text: 'Rotated', width: 300, height: 400 }])
    const upright = await indexOf([sourceOf(bytes, 0, 0)])
    const turned = await indexOf([sourceOf(bytes, 0, 90)])

    const a = searchPdfText(upright, 'Rotated', NO_OPTIONS)[0]!.rects[0]!
    const b = searchPdfText(turned, 'Rotated', NO_OPTIONS)[0]!.rects[0]!

    // 转 90 度之后：原来横向的一段变成纵向的一段
    expect(a.width).toBeGreaterThan(a.height)
    expect(b.width).toBeLessThan(b.height)
    // 都还在页面内
    for (const rect of [a, b]) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(1.001)
      expect(rect.y + rect.height).toBeLessThanOrEqual(1.001)
    }
  })

  it('空白页与不存在的来源不会炸，也不报命中', async () => {
    const bytes = await makePdf([{ text: 'only', width: 300, height: 400 }])
    const index = await indexOf([{ bytes: null, index: 0, rotation: 0 }, sourceOf(bytes, 0, 180)])
    const matches = searchPdfText(index, 'only', NO_OPTIONS)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.page).toBe(1)
  })
})

describe('搜索', () => {
  it('空串不报匹配（否则每敲一下都「1 / 2847」）', async () => {
    const bytes = await makePdf([{ text: 'aaaa', width: 300, height: 400 }])
    const index = await indexOf([sourceOf(bytes)])
    expect(searchPdfText(index, '', NO_OPTIONS)).toEqual([])
  })

  it('不区分大小写是默认；区分大小写时按原样比', async () => {
    const bytes = await makePdf([{ text: 'Report report REPORT', width: 400, height: 400 }])
    const index = await indexOf([sourceOf(bytes)])
    expect(searchPdfText(index, 'report', NO_OPTIONS)).toHaveLength(3)
    expect(searchPdfText(index, 'report', { matchCase: true, wholeWord: false })).toHaveLength(1)
    expect(searchPdfText(index, 'REPORT', { matchCase: true, wholeWord: false })).toHaveLength(1)
  })

  it('全词匹配：英文按 ASCII 词边界', async () => {
    const bytes = await makePdf([{ text: 'cat concat cat.', width: 400, height: 400 }])
    const index = await indexOf([sourceOf(bytes)])
    expect(searchPdfText(index, 'cat', NO_OPTIONS)).toHaveLength(3)
    // `concat` 里的那一个不算（左边是 n）；`cat.` 的右边是句点，算
    expect(searchPdfText(index, 'cat', { matchCase: false, wholeWord: true })).toHaveLength(2)
  })

  it('**中文搜得到**（CID 字体 + ToUnicode，与真实的中文 PDF 同形）', async () => {
    const bytes = makeCidPdf()
    const index = await indexOf([sourceOf(bytes)])

    // 文字层真的读出了汉字（这一条同时证明 cmaps 之外的这条链路是通的）
    expect(index.pages[0]?.text).toBe('组件')

    const [match] = searchPdfText(index, '组件', NO_OPTIONS)
    expect(match).toBeDefined()
    expect(match!.rects).toHaveLength(1)
    // 24pt 的两个字画在 (50, 300)，300×400 的页上
    const rect = match!.rects[0]!
    expect(rect.x).toBeCloseTo(50 / 300, 2)
    expect(rect.y).toBeGreaterThan(0.15)
    expect(rect.y + rect.height).toBeLessThan(0.3)

    // 单个汉字也搜得到（子串匹配）
    expect(searchPdfText(index, '件', NO_OPTIONS)).toHaveLength(1)
    expect(searchPdfText(index, '组', NO_OPTIONS)).toHaveLength(1)
  })

  it('中文的「全词匹配」不挡住子串（中文没有词边界，硬切会让中文搜不到）', async () => {
    const bytes = makeCidPdf()
    const index = await indexOf([sourceOf(bytes)])
    expect(searchPdfText(index, '组件', { matchCase: false, wholeWord: true })).toHaveLength(1)
  })

  it('跨段命中给多个矩形（换行处一个，下一行再一个）', async () => {
    const index = {
      pages: [
        {
          page: 0,
          chunks: [
            { text: '这是组件\n', rect: { x: 0, y: 0, width: 0.5, height: 0.05 } },
            { text: '性能优化的说明', rect: { x: 0, y: 0.05, width: 0.4, height: 0.05 } },
          ],
          text: '这是组件\n性能优化的说明',
          starts: [0, 5],
        },
      ],
      pagesWithText: 1,
    }
    const across = searchPdfText(index, '组件\n性能', NO_OPTIONS)[0]!
    expect(across.rects).toHaveLength(2)
    // 第一段从「组件」开始（左边切掉「这是」两个字，段共 5 个字符）
    expect(across.rects[0]?.insetLeft).toBeCloseTo(2 / 5, 5)
    // 第二段只覆盖前两个字（段共 7 个字符，右边切掉 5 个）
    expect(across.rects[1]?.insetRight).toBeCloseTo(5 / 7, 5)
  })

  it('命中不重叠（`aaaaa` 里找 `aa` 报 2 处，与浏览器一致）', async () => {
    const bytes = await makePdf([{ text: 'aaaaa', width: 300, height: 400 }])
    const index = await indexOf([sourceOf(bytes)])
    // 位置 0 与 2；位置 1、3 是重叠的，不报（浏览器也是这样）
    expect(searchPdfText(index, 'aa', NO_OPTIONS)).toHaveLength(2)
  })

  it('跨行（hasEOL）的串不该被当成连在一起', async () => {
    const index = {
      pages: [
        {
          page: 0,
          chunks: [
            { text: '尾巴\n', rect: { x: 0, y: 0, width: 0.1, height: 0.05 } },
            { text: '开头', rect: { x: 0, y: 0.05, width: 0.1, height: 0.05 } },
          ],
          text: '尾巴\n开头',
          starts: [0, 3],
        },
      ],
      pagesWithText: 1,
    }
    expect(searchPdfText(index, '巴开', NO_OPTIONS)).toEqual([])
    expect(searchPdfText(index, '尾巴', NO_OPTIONS)).toHaveLength(1)
  })

  it('命中的 text 是命中处的原文（状态行要显示它）', async () => {
    const bytes = await makePdf([{ text: 'find me here', width: 400, height: 400 }])
    const index = await indexOf([sourceOf(bytes)])
    const matches: PdfMatch[] = searchPdfText(index, 'me', NO_OPTIONS)
    expect(matches[0]?.text).toBe('me')
  })
})
