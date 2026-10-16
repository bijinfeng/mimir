import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  parseRichContent,
  richDocxOf,
  type RichParagraph,
} from '../services/document-rich-content.js'
import { richPdfOf } from '../services/document-rich-pdf.js'
import { parseDocx } from '../../../../packages/office/vendor/packages/docx-engine/src/parse.js'

const fixture = `<h1>项目报告</h1><p><strong>粗体</strong>、<em>斜体</em>、<u>下划线</u>、<s>删除线</s> <span style="color:#1357a0;background-color:#fff0aa">颜色</span> <a href="https://example.com/report?q=1&amp;x=2">查看报告</a></p><ol start="3"><li>阶段一<ul><li>嵌套项目</li></ul></li><li>阶段二</li></ol><blockquote><p>保留引用内容</p></blockquote><pre><code>const value = 1;\n  return value;</code></pre><table><thead><tr><th colspan="2">指标</th></tr></thead><tbody><tr><td rowspan="2"><strong>收入</strong><p><a href="https://example.com/cell">单元格链接</a></p></td><td>100</td></tr><tr><td><em>200</em></td></tr></tbody></table>`

describe('restricted HTML document creation', () => {
  it('writes actual DOCX rich runs, links, numbering, merged table and native equation', async () => {
    const bytes = await richDocxOf(
      parseRichContent(fixture + '<p>公式 <formula>\\frac{a}{b}</formula></p>'),
    )
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    const nums = await zip.file('word/numbering.xml')!.async('string')
    for (const token of [
      '<w:b/>',
      '<w:i/>',
      '<w:u ',
      '<w:strike/>',
      '1357A0',
      '<w:tbl>',
      '<w:gridSpan w:val="2"',
      '<w:vMerge w:val="restart"',
      '<w:vMerge/>',
      '<w:hyperlink',
      '<m:f>',
    ])
      expect(xml).toContain(token)
    expect(rels).toContain('https://example.com/report?q=1&amp;x=2')
    expect(rels).toContain('https://example.com/cell')
    expect(nums).toContain('<w:startOverride w:val="3"/>')
    const parsed = await parseDocx(bytes)
    const table = parsed.blocks.find((b) => b.type === 'table')?.table
    expect(table?.rows).toHaveLength(3)
    expect(table?.rows[0]?.[0]?.colSpan).toBe(2)
    expect(
      table?.rows[1]?.[0]?.richParas?.flatMap((p) => p.runs).find((r) => r.link)?.link?.href,
    ).toBe('https://example.com/cell')
    expect(parsed.blocks.some((b) => b.runs?.some((r) => r.math))).toBe(true)
  })

  it('lays out a rich multi-page PDF, preserves links and every long table cell', async () => {
    const rows = Array.from(
      { length: 55 },
      (_, i) => `<tr><td>记录 ${i + 1}</td><td>详情 ${i + 1} 中文表格内容</td></tr>`,
    ).join('')
    const long = `<table><tr><td>${'长单元格内容 '.repeat(450)}</td><td>尾部标记</td></tr></table>`
    const bytes = await richPdfOf(
      parseRichContent(
        fixture +
          `<table><tr><th>记录</th><th>说明</th></tr>${rows}</table>` +
          long +
          '<p>文档最终标记</p>',
      ),
    )
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(3)
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const opened = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise
    let text = '',
      links = 0
    for (let i = 1; i <= opened.numPages; i++) {
      const page = await opened.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map((item) => ('str' in item ? item.str : '')).join('')
      links += (await page.getAnnotations()).filter((a) => a.subtype === 'Link').length
      const positions = content.items.flatMap((item) =>
        'transform' in item ? [item.transform[5]] : [],
      )
      expect(Math.min(...positions)).toBeGreaterThanOrEqual(40)
      expect(Math.max(...positions)).toBeLessThanOrEqual(800)
    }
    expect(text).toContain('记录 55')
    expect(text).toContain('文档最终标记')
    expect(text).toContain('尾部标记')
    expect(text.match(/长单元格内容/g)).toHaveLength(450)
    expect(links).toBeGreaterThanOrEqual(2)
    await opened.cleanup()
  }, 20000)

  it.each([
    ['<table><tr><td colspan="0">bad</td></tr></table>', '合并单元格范围'],
    ['<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>', '各行列数'],
    ['<p><img src="https://example.com/a.png"></p>', '不支持属性'],
    ['<script>alert(1)</script><p>正文</p>', '不支持 <script>'],
    ['<p style="position:absolute">正文</p>', '不支持样式'],
    ['<p><a href="javascript:alert(1)">bad</a></p>', '链接仅支持'],
    ['<p>&#1;</p>', '无效控制字符'],
    ['<p><formula style="color:red">x</formula></p>', '不支持样式'],
    ['<p><br style="font-size:20pt"></p>', '不支持样式'],
  ])('refuses unsupported/invalid content before generating %s', (html, message) => {
    expect(() => parseRichContent(html)).toThrow(message)
  })

  it('refuses PDF formulas and absent glyphs explicitly', async () => {
    await expect(richPdfOf(parseRichContent('<p><formula>x^2</formula></p>'))).rejects.toThrow(
      '暂不支持公式排版',
    )
    await expect(richPdfOf(parseRichContent('<p>😀</p>'))).rejects.toThrow('PDF 字体不支持字符：😀')
    await expect(
      richPdfOf(parseRichContent('<p style="text-align:justify">两端对齐</p>')),
    ).rejects.toThrow('暂不支持两端对齐')
  })

  it('inherits cell/quote formatting without overriding explicit paragraph and run values', async () => {
    const model = parseRichContent(
      '<blockquote style="color:red;text-align:right"><p>引用</p><p style="text-align:center"><span style="font-style:normal;color:blue">显式</span></p></blockquote>' +
        '<table><tr><th style="font-weight:normal;text-align:right"><h2>单元格标题</h2><p style="text-align:left">左对齐</p></th></tr></table>',
    )
    const first = model.blocks[0]!,
      second = model.blocks[1]!,
      table = model.blocks[2]!
    if ('kind' in first || 'kind' in second || !('kind' in table)) throw new Error('测试结构失效')
    expect(first.format?.align).toBe('right')
    expect(first.runs[0]?.color).toBe('FF0000')
    expect(second.format?.align).toBe('center')
    expect(second.runs[0]).toMatchObject({ color: '0000FF', italic: false })
    expect(table.cells[0]?.paragraphs.map((p) => p.format?.align)).toEqual(['right', 'left'])
    expect(table.cells[0]?.paragraphs[0]?.runs[0]?.bold).toBe(false)
    const bytes = await richDocxOf(model),
      parsed = await parseDocx(bytes),
      cellParagraphs = parsed.blocks.find((b) => b.type === 'table')?.table?.rows[0]?.[0]?.richParas
    expect(cellParagraphs?.[0]).toMatchObject({ styleId: 'Heading2', align: 'right' })
    expect(cellParagraphs?.[1]?.align).toBe('left')
  })

  it('keeps list continuations in source order and numbers the parent once even with a leading nested list', async () => {
    const model = parseRichContent(
      '<ol start="3"><li><h2>父项</h2><ul><li>子项</li></ul><p>后续段落</p></li><li><ul><li>前置子项</li></ul>尾部段落</li></ol>',
    )
    const paragraphs = model.blocks.filter((b): b is RichParagraph => !('kind' in b))
    expect(paragraphs.map((p) => p.runs.map((r) => r.text).join(''))).toEqual([
      '父项',
      '子项',
      '后续段落',
      '',
      '前置子项',
      '尾部段落',
    ])
    expect(paragraphs.map((p) => p.marker)).toEqual(['3.', '•', undefined, '4.', '•', undefined])
    expect(paragraphs[2]?.format?.indentLeft).toBe(480)
    const reopened = await parseDocx(await richDocxOf(model))
    expect(reopened.blocks[0]?.styleId).toBe('Heading2')
    expect(
      reopened.blocks.flatMap((b) => (b.runs ? [b.runs.map((r) => r.text).join('')] : [])),
    ).toEqual(['父项', '子项', '后续段落', '', '前置子项', '尾部段落'])
  })

  it('preserves literal replacement tokens in authored text and links', async () => {
    const bytes = await richDocxOf(
      parseRichContent('<p>$1 $&amp; <a href="https://example.com/$&amp;">link</a></p>'),
    )
    const zip = await JSZip.loadAsync(bytes)
    const parsed = await parseDocx(bytes)
    expect(
      parsed.blocks
        .flatMap((b) => b.runs ?? [])
        .map((run) => run.text)
        .join(''),
    ).toContain('$1 $&')
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain(
      'https://example.com/$&amp;',
    )
  })

  it('keeps a usable generated source after serializing', async () => {
    const bytes = await richDocxOf(parseRichContent('普通正文\n# 标题\n- 项目'))
    const reopened = await JSZip.loadAsync(bytes)
    expect(await reopened.file('word/document.xml')!.async('string')).toContain('普通正文')
  })
})

it('renders every CJK glyph when the subset switches between font dictionaries', async () => {
  const text = '收入稳定增长本期工作'
  const bytes = await richPdfOf(parseRichContent(`<p style="font-size:20pt">${text}</p>`))
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false })
  const pdf = await task.promise
  const page = await pdf.getPage(1),
    viewport = page.getViewport({ scale: 2 })
  type RenderOptions = Parameters<typeof page.render>[0]
  const factory = pdf.canvasFactory as {
    create(
      width: number,
      height: number,
    ): {
      canvas: NonNullable<RenderOptions['canvas']>
      context: NonNullable<RenderOptions['canvasContext']>
    }
    destroy(surface: unknown): void
  }
  const surface = factory.create(viewport.width, viewport.height)
  await page.render({ canvasContext: surface.context, viewport, canvas: surface.canvas }).promise
  // Each fixed-width CJK cell must contain visible ink; text extraction alone
  // passed while the faulty FD mapping rendered several of these cells blank.
  const counts = Array.from(text, (_, i) => {
    const pixels = surface.context.getImageData(100 + i * 40, 100, 40, 65).data
    let dark = 0
    for (let p = 0; p < pixels.length; p += 4)
      if (pixels[p]! < 150 && pixels[p + 1]! < 150 && pixels[p + 2]! < 150) dark++
    return dark
  })
  expect(Math.min(...counts)).toBeGreaterThan(30)
  factory.destroy(surface)
  await task.destroy()
})
