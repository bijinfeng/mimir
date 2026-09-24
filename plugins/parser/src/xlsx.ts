import type { ParseInput, ParseResult, Parser } from '@mimir/shared'
import { cleanExtractedText, listZipEntries, readZipEntry, xmlToText } from './ooxml.js'

/**
 * `.xlsx` → Markdown 的**文本提取**（`docs/TECH.md` §13）。
 *
 * ## 单元格里的文字存在两个地方
 *
 * 这是 xlsx 与 docx 最大的不同，也是最容易做错的一处：
 *
 * ```
 * 内联字符串  <c t="inlineStr"><is><t>张三</t></is></c>      直接可读
 * 共享字符串  <c t="s"><v>17</v></c>  →  sharedStrings.xml 的第 17 项
 * 数字 / 日期 <c><v>42</v></c>                                字面值
 * ```
 *
 * 只读 `sheet1.xml` 的话，凡是共享字符串（Excel 里**绝大多数文本**）都会
 * 变成一串数字下标——「17 18 19」那种正文，看起来像解析成功，实际全是垃圾。
 * 所以必须两道都读，且**下标是从 0 开始的**（不是从 1）。
 *
 * ## 日期不还原
 *
 * 日期在 xlsx 里是序列号加样式（`s="3"` 指向 styles.xml 里的日期格式）。
 * 还原它要读 `numFmtId` 与内置格式表，而**猜错的后果是把一个普通数字显示成
 * 日期**。所以这里如实显示序列号，不猜——用户要看日期原样打开原件。
 *
 * ## 表格结构尽量保留
 *
 * 每个工作表转成一个 Markdown 表格。空单元格留空位（不塌缩），
 * 因为塌缩会让列错位——那是比多几个空列严重得多的错误。
 */
export function createXlsxParser(): Parser {
  return {
    id: 'xlsx',
    accepts: ['xlsx'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (input.type !== 'xlsx') throw new Error('xlsx 解析器只处理 xlsx 输入')

      const shared = readSharedStrings(input.data)
      const sheetNames = listZipEntries(input.data, 'xl/worksheets/', '.xml')
      if (sheetNames.length === 0) throw new Error('这个文件里没有工作表（不是有效的 xlsx？）')

      const sections: string[] = []
      for (const [index, entry] of sheetNames.entries()) {
        const xml = readZipEntry(input.data, entry)
        if (!xml) continue

        const table = sheetToMarkdown(xml, shared)
        if (table === '') continue

        // 工作表名从 workbook.xml + rels 关联才能拿到，链太长；
        // 用序号 + 文件名更诚实（不编一个可能错的名字）
        const name = sheetLabel(entry, index)
        sections.push(`## ${name}\n\n${table}`)
      }

      if (sections.length === 0) {
        throw new Error('这份表格里没有可提取的文字（可能全是图片或空白单元格）')
      }

      return { markdown: cleanExtractedText(sections.join('\n\n')), imageCount: 0, parser: 'xlsx' }
    },
  }
}

/** `xl/worksheets/sheet2.xml` → `工作表 2`。解析不出序号时用「工作表」 */
function sheetLabel(entry: string, fallbackIndex: number): string {
  const number = /sheet(\d+)\.xml$/.exec(entry)?.[1]
  return `工作表 ${number ?? fallbackIndex + 1}`
}

/**
 * 共享字符串表。
 *
 * 注意 `<si>` 里可能是多个 `<t>`（富文本被切成多个 run），要拼起来——
 * 只取第一个 `<t>` 会让「**加粗**的部分」之后的内容整段消失。
 * 索引严格按 `<si>` 的出现顺序（从 0 开始）。
 */
function readSharedStrings(data: Uint8Array): string[] {
  const xml = readZipEntry(data, 'xl/sharedStrings.xml')
  if (!xml) return []

  const out: string[] = []
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let match: RegExpExecArray | null

  while ((match = itemPattern.exec(xml)) !== null) {
    const inner = match[1] ?? ''
    const parts: string[] = []
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let textMatch: RegExpExecArray | null
    while ((textMatch = textPattern.exec(inner)) !== null) {
      parts.push(xmlToText(textMatch[1] ?? ''))
    }
    // 自闭合的 <t/> 表示空字符串，parts 会是空数组——仍然要占一个下标位
    out.push(parts.join(''))
  }

  return out
}

/**
 * 一个工作表 → Markdown 表格。
 *
 * `r="B3"` 这种单元格引用里的列字母决定列位置——**必须用它，不能用出现顺序**：
 * 表格里有空单元格时 Excel 会整个跳过那个 `<c>`，按顺序填会让整行向左错位。
 */
function sheetToMarkdown(xml: string, shared: string[]): string {
  const rows: string[][] = []
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const cells: string[] = []
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellPattern.exec(rowMatch[1] ?? '')) !== null) {
      const attrs = cellMatch[1] ?? ''
      const inner = cellMatch[2] ?? ''
      const column = columnIndexOf(/r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? '')

      // 空单元格要占位，否则整行向左错位
      if (column >= 0) {
        while (cells.length < column) cells.push('')
      }
      cells.push(cellText(attrs, inner, shared))
    }

    // 整行全空的行不输出（Excel 常在数据下方保留大量空行）
    if (cells.some((cell) => cell !== '')) rows.push(cells)
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

/** `A` → 0，`B` → 1，`AA` → 26。空串返回 -1（没有引用时按顺序追加） */
function columnIndexOf(letters: string): number {
  if (letters === '') return -1
  let index = 0
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return index - 1
}

/** 表格单元格里的文字要转义竖线、折叠空白——否则会破坏 Markdown 表格的结构 */
function escapeCell(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\n+/g, ' ').trim().replace(/\|/g, '\\|')
}

/** 一个单元格的文字。共享字符串查表、内联字符串直读、其余取字面值 */
function cellText(attrs: string, inner: string, shared: string[]): string {
  const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? ''
  if (type === 's') {
    // 共享字符串：<v> 里是下标而不是文字
    const ref = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]?.trim() ?? ''
    const index = Number(ref)
    return escapeCell(Number.isInteger(index) ? (shared[index] ?? '') : '')
  }

  if (type === 'inlineStr') {
    const parts: string[] = []
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let match: RegExpExecArray | null
    while ((match = textPattern.exec(inner)) !== null) parts.push(xmlToText(match[1] ?? ''))
    return escapeCell(parts.join(''))
  }

  const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ''
  return escapeCell(xmlToText(value))
}
