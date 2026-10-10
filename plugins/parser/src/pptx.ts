import type { ParseInput, ParseResult, Parser } from '@mimir/shared'
import { cleanExtractedText, openOoxmlArchive, xmlToText, type OoxmlArchive } from './ooxml.js'

/**
 * `.pptx` → Markdown 的**文本提取**（`docs/TECH.md` §13）。
 *
 * ## 一页一节的形状
 *
 * 幻灯片天然是**分节**的内容，所以按页输出 `## 第 N 页`，每页的文字是按
 * 文本框（`<p:sp>`）分组的——保留这个分组很重要：演讲提纲里
 * 「标题 / 三个要点 / 结论」靠的就是分组，全部摊平成一坨会读不出结构。
 *
 * ## 三处会丢东西的地方（都是刻意的）
 *
 * 1. **备注页（notesSlides）不读。** 它是给演讲者看的，不是给读者看的；
 *    读进来会让每页正文后面多出一段不属于页面的文字
 * 2. **顺序按形状在 XML 里的出现顺序**，不按视觉位置。幻灯片上形状可以
 *    绝对定位、互相交叠，还原「视觉上的阅读顺序」需要一个版式引擎。
 *    所以顺序可能与你眼睛看到的略有出入——这是已知限制，不是 bug
 * 3. **表格在 pptx 里是 `<a:tbl>`**，与 docx 的 `w:tbl` 不同命名空间；
 *    这里退化成按行取文字（用「 / 」分隔），不转 Markdown 表格——
 *    幻灯片上的表格往往很短，转成表格反而不如一行文字清楚
 *
 * 图片里的文字（扫描件、贴图）提取不到——需要 OCR，明确不做（`PRD.md` §1）。
 */
export function createPptxParser(): Parser {
  return {
    id: 'pptx',
    accepts: ['pptx'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (input.type !== 'pptx') throw new Error('pptx 解析器只处理 pptx 输入')

      const archive = openOoxmlArchive(input.data, (path) => /^ppt\/slides\/[^/]+\.xml$/.test(path))
      const slides = archive.list('ppt/slides/', '.xml')
      if (slides.length === 0) throw new Error('这个文件里没有幻灯片（不是有效的 pptx？）')

      const sections: string[] = []
      for (const [index, entry] of slides.entries()) {
        const xml = archive.read(entry)
        if (!xml) continue

        const text = slideText(xml)
        if (text === '') continue

        sections.push(`## 第 ${index + 1} 页\n\n${text}`)
      }

      if (sections.length === 0) {
        throw new Error('这份幻灯片里没有可提取的文字（可能整篇都是图片）')
      }

      return {
        markdown: cleanExtractedText(sections.join('\n\n')),
        imageCount: countImages(archive, slides),
        parser: 'pptx',
      }
    },
  }
}

/** 一页的文字。形状之间空一行，形状内部的段落各占一行 */
function slideText(xml: string): string {
  const blocks: string[] = []
  // 一个形状：<p:sp>…</p:sp>。图片形状里没有 <a:t>，会自然产出空串被过滤
  const shapePattern = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g
  let match: RegExpExecArray | null

  while ((match = shapePattern.exec(xml)) !== null) {
    const inner = match[1] ?? ''
    // 形状内的段落：<a:p>…</a:p>
    const lines: string[] = []
    const paragraphPattern = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g
    let paragraphMatch: RegExpExecArray | null

    while ((paragraphMatch = paragraphPattern.exec(inner)) !== null) {
      const text = xmlToText(paragraphMatch[1] ?? '').trim()
      if (text !== '') lines.push(text)
    }

    if (lines.length > 0) blocks.push(lines.join('\n'))
  }

  return blocks.join('\n\n')
}

/**
 * 图片数。pptx 的图片写在 `ppt/media/` 下，所以直接数那里的条目——
 * 比数 `<a:blip>` 更准（同一个图片被多页引用时 blip 会出现多次，
 * 而 media 里的文件只有一个）。
 */
function countImages(archive: OoxmlArchive, slides: string[]): number {
  const media = archive.list('ppt/media/')
  if (media.length > 0) return media.length
  // 兜底：没有 media 目录时按引用数（老版本 PowerPoint 偶尔不用 media/）
  return slides.length
}
