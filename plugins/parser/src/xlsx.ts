import type { ParseInput, ParseResult, Parser } from '@mimir/shared'
import { cleanExtractedText, openOoxmlArchive, xmlToText, type OoxmlArchive } from './ooxml.js'

/**
 * `.xlsx` → Markdown 的**文本提取**（`.trellis/spec/project/architecture.md` §13）。
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
 *
 * ## 工作表的名字取自 `workbook.xml`
 *
 * 名字不在工作表文件里：`sheet1.xml` 里没有「销售数据」四个字。正文大纲写
 * 「工作表 1」而预览里写「销售数据」，同一份文件就有了两个名字——所以两边
 * 都从 `workbook.xml` 读（`packages/office/src/xlsx.ts` 是同一套逻辑）。
 */
export function createXlsxParser(): Parser {
  return {
    id: 'xlsx',
    accepts: ['xlsx'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (input.type !== 'xlsx') throw new Error('xlsx 解析器只处理 xlsx 输入')

      const archive = openOoxmlArchive(
        input.data,
        (path) =>
          path === 'xl/sharedStrings.xml' ||
          path === 'xl/workbook.xml' ||
          path === 'xl/_rels/workbook.xml.rels' ||
          /^xl\/worksheets\/.+\.xml$/.test(path),
      )
      const shared = readSharedStrings(archive)
      const sheets = listSheets(archive)
      if (sheets.length === 0) throw new Error('这个文件里没有工作表（不是有效的 xlsx？）')

      const sections: string[] = []
      for (const sheet of sheets) {
        const xml = archive.read(sheet.entry)
        if (!xml) continue

        const table = sheetToMarkdown(xml, shared)
        if (table === '') continue

        // 隐藏的页签在 Excel 里看不到；这里照实标注，而不是悄然略过
        sections.push(`## ${sheet.hidden ? `${sheet.name}（隐藏）` : sheet.name}\n\n${table}`)
      }

      if (sections.length === 0) {
        throw new Error('这份表格里没有可提取的文字（可能全是图片或空白单元格）')
      }

      return { markdown: cleanExtractedText(sections.join('\n\n')), imageCount: 0, parser: 'xlsx' }
    },
  }
}

interface SheetRef {
  /** zip 里的路径 */
  entry: string
  name: string
  hidden: boolean
}

/**
 * 工作表清单：名字、顺序、隐藏状态。
 *
 * 顺序与名字只在 `xl/workbook.xml` 里，`r:id` → 文件路径的映射在它的 rels 里：
 *
 * ```xml
 * <sheet name="销售数据" sheetId="1" r:id="rId3"/>
 * ```
 *
 * 页签顺序由 `<sheet>` 的出现顺序决定——`sheet1.xml` 可以排在 `sheet2.xml`
 * 之后。所以按文件名编号不只名字是错的，顺序也可能是错的。
 *
 * 读不到时退回「工作表 N」：那时名字是**我们编的**（一眼能看出），不是错的。
 */
function listSheets(archive: OoxmlArchive): SheetRef[] {
  const workbook = archive.read('xl/workbook.xml')
  const rels = archive.read('xl/_rels/workbook.xml.rels')

  if (workbook && rels) {
    const targets = new Map<string, string>()
    for (const rel of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const attrs = rel[1] ?? ''
      const id = /Id="([^"]+)"/.exec(attrs)?.[1]
      const target = /Target="([^"]+)"/.exec(attrs)?.[1]
      if (id && target) targets.set(id, normalizeTarget(target))
    }

    const refs: SheetRef[] = []
    for (const sheet of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const attrs = sheet[1] ?? ''
      const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1] ?? ''
      const name = xmlToText(/name="([^"]*)"/.exec(attrs)?.[1] ?? '')
      const state = /state="([^"]+)"/.exec(attrs)?.[1] ?? ''

      const entry = targets.get(rid)
      /**
       * 只认 `xl/worksheets/*.xml`：`<sheet>` 也能指向图表页（chartsheet），
       * 那不是网格，交给它只会得到一张空表。
       */
      if (!entry || !/^xl\/worksheets\/.+\.xml$/.test(entry)) continue
      refs.push({ entry, name: name || fallbackName(entry), hidden: state !== '' })
    }
    if (refs.length > 0) return refs
  }

  return archive.list('xl/worksheets/', '.xml').map((entry) => ({
    entry,
    name: fallbackName(entry),
    hidden: false,
  }))
}

/** rels 里的 Target 可能是相对 `xl/` 的（`worksheets/sheet1.xml`）也可能是绝对路径 */
function normalizeTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  return target.startsWith('xl/') ? target : `xl/${target}`
}

/** `xl/worksheets/sheet2.xml` → `工作表 2`。解析不出序号时用「工作表 ?」 */
function fallbackName(entry: string): string {
  const number = /sheet(\d+)\.xml$/.exec(entry)?.[1]
  return `工作表 ${number ?? '?'}`
}

/**
 * 共享字符串表。
 *
 * 注意 `<si>` 里可能是多个 `<t>`（富文本被切成多个 run），要拼起来——
 * 只取第一个 `<t>` 会让「**加粗**的部分」之后的内容整段消失。
 * 索引严格按 `<si>` 的出现顺序（从 0 开始）。
 */
function readSharedStrings(archive: OoxmlArchive): string[] {
  const xml = archive.read('xl/sharedStrings.xml')
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
