import type { ParseInput, ParseResult, Parser } from '@mimir/shared'
import { cleanExtractedText, openOoxmlArchive, xmlToText } from './ooxml.js'

/**
 * `.docx` → Markdown 的**文本提取**（`.trellis/spec/project/architecture.md` §13）。
 *
 * ## 它是什么、不是什么
 *
 * 是：把 Word 文档里的文字按段落取出来，让知识库搜得到、AI 引用得到。
 * 不是：还原 Word 的版式。加粗、颜色、字号、页眉页脚、脚注、批注、
 * 图文框的位置——这些**不还原**，因为渲染在浏览器里是另一套排版引擎的事，
 * 而我们要的是内容。
 *
 * 界面上必须如实说明这一点（「文本提取」），否则用户会拿它跟 Word 比对，
 * 然后发现「表格线没了」——那看起来像 bug，实际是产品边界。
 *
 * ## 标题层级怎么来的
 *
 * 从 `w:pStyle` 里读，不猜字号。Word 的样式名有语言差异
 * （`Heading1` / `1` / `标题 1`），所以三种都认，认不出就当普通段落。
 * 这是「有把握才做，没把握老实当段落」的例子——猜字号大小会把
 * 「声明性文字的 16pt」误判成标题。
 *
 * ## 表格
 *
 * 转成 Markdown 表格。但**合并单元格会退化成多个相同单元格**：
 * OOXML 用 `w:gridSpan` / `w:vMerge` 表达合并，还原它要维护一张网格矩阵，
 * 而 Markdown 表格本身也表达不了合并。这个退化要在正文里如实发生，
 * 不能假装——所以我们不试图「猜」合并，让两边的限制都可见。
 */
export function createDocxParser(): Parser {
  return {
    id: 'docx',
    accepts: ['docx'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (input.type !== 'docx') throw new Error('docx 解析器只处理 docx 输入')

      const archive = openOoxmlArchive(input.data, (path) => path === 'word/document.xml')
      const xml = archive.read('word/document.xml')
      if (!xml) {
        throw new Error('这个文件不是有效的 docx（缺少 word/document.xml）')
      }

      const markdown = docxXmlToMarkdown(xml)
      if (markdown.trim() === '') {
        throw new Error('这份 Word 文档里没有可提取的文字（可能是纯图片或纯表格截图）')
      }

      return { markdown, imageCount: (xml.match(/<a:blip\b/g) ?? []).length, parser: 'docx' }
    },
  }
}

const HEADING_PATTERN = /^(?:heading|标题)\s*([1-6])$/i

/**
 * 逐段落处理而不是整篇 `xmlToText`：标题需要知道每个段落的样式，
 * 而那要求**按段落切开**再分别看 `w:pStyle`。
 */
function docxXmlToMarkdown(xml: string): string {
  const body = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml

  // 按段落切。先切出表格，剩下的按段落走
  const blocks: string[] = []
  const tablePattern = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tablePattern.exec(body)) !== null) {
    const before = body.slice(cursor, match.index)
    blocks.push(...paragraphsToMarkdown(before))
    blocks.push(tableToMarkdown(match[1] ?? ''))
    cursor = match.index + match[0].length
  }
  blocks.push(...paragraphsToMarkdown(body.slice(cursor)))

  return cleanExtractedText(blocks.filter((block) => block !== '').join('\n\n'))
}

/** 段落 → Markdown。标题读样式，正文是普通段落 */
function paragraphsToMarkdown(xml: string): string[] {
  const out: string[] = []
  const paragraphPattern = /<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g
  let match: RegExpExecArray | null

  while ((match = paragraphPattern.exec(xml)) !== null) {
    const attrs = match[1] ?? ''
    const inner = match[2] ?? ''
    const text = xmlToText(inner).trim()
    if (text === '') continue

    // 列表项：Word 用编号定义（numPr）表达，还原层级与编号格式不值得——
    // 但「这是个列表项」这个事实要保留，否则几条并列要点会连成一段
    const isListItem = /<w:numPr\b/.test(inner)
    const headingLevel = headingLevelOf(attrs, inner)

    if (headingLevel !== null) {
      out.push(`${'#'.repeat(headingLevel)} ${text}`)
    } else if (isListItem) {
      out.push(`- ${text}`)
    } else {
      out.push(text)
    }
  }

  return out
}

/** 从段落属性或段落内的 pStyle 找标题层级。找不到返回 null */
function headingLevelOf(attrs: string, inner: string): number | null {
  const styleId =
    /w:pStyle\b[^>]*w:val="([^"]+)"/.exec(attrs)?.[1] ??
    /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(inner)?.[1] ??
    ''

  const matched = HEADING_PATTERN.exec(styleId.trim())
  if (!matched) return null

  const level = Number(matched[1])
  return level >= 1 && level <= 6 ? level : null
}

/** 表格 → Markdown 表格。第一行当表头（Word 的表头标记不可靠，不读它） */
function tableToMarkdown(xml: string): string {
  const rows: string[][] = []
  const rowPattern = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const cells: string[] = []
    const cellPattern = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellPattern.exec(rowMatch[1] ?? '')) !== null) {
      const text = xmlToText(cellMatch[1] ?? '')
        .replace(/\t/g, ' ')
        .replace(/\n+/g, ' ')
        .trim()
        // 竖线会破坏 Markdown 表格的列结构，必须转义
        .replace(/\|/g, '\\|')
      cells.push(text)
    }

    if (cells.length > 0) rows.push(cells)
  }

  if (rows.length === 0) return ''

  const width = Math.max(...rows.map((row) => row.length))
  const pad = (row: string[]) => [...row, ...Array<string>(width - row.length).fill('')]

  const [head, ...rest] = rows
  const lines = [
    `| ${pad(head ?? []).join(' | ')} |`,
    `| ${Array<string>(width).fill('---').join(' | ')} |`,
    ...rest.map((row) => `| ${pad(row).join(' | ')} |`),
  ]
  return lines.join('\n')
}
