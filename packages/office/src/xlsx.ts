import { BoundedZip } from './zip-bounds.js'

/**
 * xlsx 的**网格模型**（浏览器侧只读预览）。
 *
 * ## 为什么不用上游的 xlsx-gateway
 *
 * 它的读取路径依赖 **13.7K 行的 Rust 侧车**（会话式读表 + 公式重算），
 * 而那是为「可编辑的电子表格」准备的。mimir 只需要**把表画出来**——
 * 「预览」与「编辑」的成本在这里差一个数量级（`.trellis/spec/project/architecture.md` §15.7）。
 *
 * ## 与 PDF / Office 那条老规矩一致
 *
 * 不猜、不静默降级：
 *   - 日期不还原（xlsx 里是序列号 + numFmtId 样式）。猜错的后果是把普通
 *     数字显示成日期，所以如实显示序列号——与 `plugins/parser/src/xlsx.ts`
 *     同一条判断
 *   - 公式格显示缓存值（Excel 存的那份），不重算。单元格上标注它是公式
 *   - 合并单元格如实按 `mergeCells` 跨越，不假装没合并
 *
 * ## 只读的三个边界
 *
 *   - 不解析条件格式、图表、数据透视（画不出来就留空，而不是画错的示意）
 *   - 不解析数字格式（`numFmtId`）—— 只保留原始值
 *   - 列宽按 xlsx 的字符宽度近似换算，行高按点值换算；两者都是**近似**，
 *     目的是让表格可读，不是像素级还原
 *
 * ## 行列带真实坐标，不是数组下标
 *
 * 每个格带 `col`、每行带 `number`——都从 `A1` 引用里读出来的**文件里的位置**。
 * 理由有两个，都不是为了好看：
 *
 *   1. Excel 会跳过空格的 `<c>`、整空地丢掉 `<row>`。按「第几个解析到的」
 *      编号，行会整体上移、列会整体左移，而画出来的表**看起来是正常的**
 *   2. 界面用它们当渲染 key。React 反对的是「有身份却用位置冒充」，
 *      而表格的位置**就是**身份——所以身份得由解析器给出，不是 `map` 的
 *      第二个参数（`.trellis/spec/project/rules.md` 铁律 1：改结构，不是关诊断）
 */

export interface XlsxCell {
  /** 显示文本 */
  text: string
  /** 列号（0 开始），来自 `r="C3"` 的列字母 */
  col: number
  /** 这个格是公式（显示的是缓存值） */
  formula?: boolean
  /** 数字右对齐、文本左对齐——对齐方式是最省力的可读性提升 */
  numeric?: boolean
  /** 跨列 / 跨行（合并单元格，1 表示不跨） */
  colSpan: number
  rowSpan: number
  /** 被合并覆盖掉的格（渲染时跳过） */
  covered?: boolean
}

export interface XlsxRow {
  /**
   * Excel 行号（1 开始）。**整行空白的行被丢掉了**，所以它可能跳号——
   * 所以界面要把行号显示出来：跳号是事实，让它可见比让整表默默上移好。
   */
  number: number
  /** 行高（px，近似） */
  height: number
  cells: XlsxCell[]
}

export interface XlsxColumn {
  /** 列号（0 开始） */
  col: number
  /** 列宽（px，近似） */
  width: number
}

export interface XlsxSheet {
  /** 工作表名，来自 `workbook.xml`（Excel 里页签上的那个名字） */
  name: string
  /**
   * 这张表在 zip 里的路径（`xl/worksheets/sheet1.xml`）。
   *
   * 编辑路径要用它定位「改哪个 XML」——名字不行（名字可以重名，而且中文名
   * 与文件名的对应关系只在 `workbook.xml` + rels 里）。
   */
  entry: string
  /**
   * 这张表在 Excel 里是隐藏的（`state="hidden"` / `"veryHidden"`）。
   * 我们仍然列出它、但**标注**：Excel 不显示隐藏页签，而悄悄少一张表
   * 会让用户以为文件里没有它（「不静默」这条规矩）。
   */
  hidden?: boolean
  rows: XlsxRow[]
  columns: XlsxColumn[]
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[]
}

/** 默认列宽（xlsx 未声明时）：8.43 字符 ≈ 64px，与 Excel 的默认一致 */
const DEFAULT_COL_WIDTH = 64
const DEFAULT_ROW_HEIGHT = 20

/**
 * 字符数与像素的换算。
 *
 * Excel 的列宽单位是「能放下多少个 `0` 字符」，换算成像素是
 * `width * 7 + 5`（Calibri 11 的近似值）。这是**近似**——字体不同会偏，
 * 但表格的可读性只依赖「列宽大致成比例」。
 */
const colWidthToPx = (chars: number): number => Math.round(chars * 7 + 5)
/** 行高的单位是点（1/72 英寸），96dpi 下 1pt = 4/3 px */
const rowHeightToPx = (pt: number): number => Math.round((pt * 4) / 3)

export async function readXlsx(bytes: Uint8Array): Promise<XlsxWorkbook> {
  return readXlsxArchive(await BoundedZip.open(bytes))
}

/** 编辑路径复用同一份已解压的 XML 与预算，不重复加载 ZIP。 */
export async function readXlsxArchive(zip: BoundedZip): Promise<XlsxWorkbook> {
  const shared = await readSharedStrings(zip)

  const sheets: XlsxSheet[] = []
  for (const ref of await listSheets(zip)) {
    const xml = await zip.readText(ref.entry)
    if (!xml) continue
    const sheet = parseSheet(xml, shared, ref.name, ref.entry)
    if (ref.hidden) sheet.hidden = true
    if (sheet.rows.length > 0) sheets.push(sheet)
  }

  if (sheets.length === 0) throw new Error('这份表格里没有可显示的内容（可能是空表或全是图表）')
  return { sheets }
}

interface SheetRef {
  /** zip 里的路径，如 `xl/worksheets/sheet1.xml` */
  entry: string
  /** Excel 页签上的名字 */
  name: string
  hidden: boolean
}

/**
 * 工作表的**顺序、名字与隐藏状态**都要从 `workbook.xml` + 它的 rels 拿。
 *
 * 为什么不能只用文件名：
 *
 *   - 顺序不是文件序号。`sheet1.xml` 可以排在 `sheet2.xml` 后面——页签顺序
 *     由 `workbook.xml` 里 `<sheet>` 的**出现顺序**决定
 *   - 名字不在工作表文件里。`sheet1.xml` 里没有「销售数据」这四个字，
 *     只有 `workbook.xml` 的 `<sheet name="…">` 才有
 *
 * 所以之前按文件名编号、把表叫「工作表 1」，用户拿预览对原件时会看到
 * **一个不存在的名字**——而界面上看着是正常的。
 *
 * 解析不出来时退回「按文件名排序 + 工作表 N」：那时给的名称是**我们编的**
 * （与 `plugins/parser/src/xlsx.ts` 的文本提取同一条退路），而不是错的。
 */
async function listSheets(zip: BoundedZip): Promise<SheetRef[]> {
  const workbook = await zip.readText('xl/workbook.xml')
  const rels = await zip.readText('xl/_rels/workbook.xml.rels')

  if (workbook && rels) {
    const targets = new Map<string, string>()
    for (const rel of rels.matchAll(/<Relationship\b([^>]*)\/?>(?:([\s\S]*?)<\/Relationship>)?/g)) {
      const attrs = `${rel[1] ?? ''} ${rel[2] ?? ''}`
      const id = /Id="([^"]+)"/.exec(attrs)?.[1]
      const target = /Target="([^"]+)"/.exec(attrs)?.[1]
      if (id && target) targets.set(id, normalizeTarget(target))
    }

    const refs: SheetRef[] = []
    for (const sheet of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const attrs = sheet[1] ?? ''
      const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1] ?? ''
      const name = decodeXml(/name="([^"]*)"/.exec(attrs)?.[1] ?? '')
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

  return zip
    .list('xl/worksheets/')
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .toSorted((a, b) => sheetIndex(a) - sheetIndex(b))
    .map((entry) => ({ entry, name: fallbackName(entry), hidden: false }))
}

/** rels 里的 Target 可能是相对 `xl/` 的（`worksheets/sheet1.xml`）也可能是绝对路径 */
function normalizeTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  return target.startsWith('xl/') ? target : `xl/${target}`
}

function fallbackName(entry: string): string {
  const number = /sheet(\d+)\.xml$/.exec(entry)?.[1]
  return `工作表 ${number ?? '?'}`
}

/** `xl/worksheets/sheet12.xml` → 12；解析不出返回 0 */
function sheetIndex(entry: string): number {
  return Number(/sheet(\d+)\.xml$/.exec(entry)?.[1] ?? 0)
}

async function readSharedStrings(zip: BoundedZip): Promise<string[]> {
  const xml = await zip.readText('xl/sharedStrings.xml')
  if (!xml) return []

  /**
   * 每个 `<si>` 里的多个 `<t>` 要**拼起来**：富文本被切成多个 run，
   * 只取第一个会让「加粗的那部分」之后的内容整段消失。
   * 索引严格按 `<si>` 出现顺序（从 0 开始）——`<c t="s"><v>17</v></c>` 里的
   * 17 就是这个数组的下标。
   */
  const out: string[] = []
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...(si[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
      decodeXml(m[1] ?? ''),
    )
    out.push(parts.join(''))
  }
  // 自闭合的 <si/> 也要占位，否则后续下标整体前移
  const selfClosing = (xml.match(/<si\b[^>]*\/>/g) ?? []).length
  for (let i = 0; i < selfClosing; i += 1) out.push('')
  return out
}

function parseSheet(xml: string, shared: string[], name: string, entry: string): XlsxSheet {
  const rows: XlsxRow[] = []
  /** 上一个出现过的行号。`r` 是可选属性，缺了要按 Excel 的规矩顺延 */
  let lastNumber = 0

  for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const attrs = row[1] ?? ''
    const declared = Number(/r="(\d+)"/.exec(attrs)?.[1] ?? NaN)
    const number = Number.isInteger(declared) ? declared : lastNumber + 1
    lastNumber = number

    const cells: XlsxCell[] = []
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const cellAttrs = cell[1] ?? cell[3] ?? ''
      const inner = cell[2] ?? ''
      /**
       * 空单元格要**补占位**：Excel 会整个跳过空格的 `<c>`，按顺序填会让
       * 整行向左错位。`r="C3"` 里的列字母给了真实位置。
       */
      const column = columnOf(/r="([A-Z]+)\d+"/.exec(cellAttrs)?.[1] ?? '')
      if (column >= 0) {
        for (let i = cells.length; i < column; i += 1) cells.push(emptyCell(i))
      }
      cells.push(cellOf(cellAttrs, inner, shared, cells.length))
    }

    // 整行全空的行不输出（Excel 常在数据下方保留大量空行）
    if (!cells.some((cell) => cell.text !== '')) continue

    const ht = Number(/ht="([\d.]+)"/.exec(attrs)?.[1] ?? NaN)
    rows.push({
      number,
      height: Number.isFinite(ht) ? rowHeightToPx(ht) : DEFAULT_ROW_HEIGHT,
      cells,
    })
  }

  const mergedMaxCol = applyMerges(xml, rows)
  /**
   * 表的宽度取三者最大：最宽的行、合并区域的最右列。
   * 合并区域**必须算进来**——标题行 `A1:C1` 里的 B1/C1 是空的，
   * Excel 就不写它们的 `<c>`，只看行宽会把表截成 1 列，而格子上还挂着
   * `colSpan="3"`（表格会散架，且是静默的）。
   */
  const width = Math.max(0, mergedMaxCol + 1, ...rows.map((row) => row.cells.length))

  /* 补齐到等宽：表格的每一行必须有同样多的格子，否则列会错位 */
  const padded: XlsxRow[] = []
  for (const row of rows) {
    const cells = [...row.cells]
    for (let i = cells.length; i < width; i += 1) cells.push(emptyCell(i))
    padded.push({ number: row.number, height: row.height, cells })
  }

  return { name, entry, rows: padded, columns: readColWidths(xml, width) }
}

function emptyCell(col: number): XlsxCell {
  return { text: '', col, colSpan: 1, rowSpan: 1 }
}

/** `A` → 0，`B` → 1，`AA` → 26。没有引用时返回 -1（按出现顺序追加） */
function columnOf(letters: string): number {
  if (letters === '') return -1
  let index = 0
  for (const char of letters.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

/**
 * 一个格的内容。
 *
 * 三种存法（这是 xlsx 最容易做错的地方，`plugins/parser/src/xlsx.ts` 有详述）：
 * 共享字符串查表、内联字符串直读、其余取字面值。
 *
 * 公式格（`<f>`）额外标注：显示的是 Excel 算好的缓存值，我们没有重算能力。
 */
function cellOf(attrs: string, inner: string, shared: string[], col: number): XlsxCell {
  const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? ''
  const isFormula = /<f\b/.test(inner)

  if (type === 's') {
    const index = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]?.trim() ?? '')
    const text = Number.isInteger(index) ? (shared[index] ?? '') : ''
    return { text, col, colSpan: 1, rowSpan: 1, ...(isFormula ? { formula: true } : {}) }
  }

  if (type === 'inlineStr') {
    const parts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
      decodeXml(m[1] ?? ''),
    )
    return { text: parts.join(''), col, colSpan: 1, rowSpan: 1 }
  }

  const value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '')
  /**
   * 数值判定：`t` 缺失或 `t="n"` 且值能当数字解析。用它做右对齐——
   * Excel 里数字右对齐、文本左对齐，这是最省力也最有效的可读性提升。
   */
  const numeric = (type === '' || type === 'n') && value !== '' && Number.isFinite(Number(value))
  return {
    text: value,
    col,
    numeric,
    colSpan: 1,
    rowSpan: 1,
    ...(isFormula ? { formula: true } : {}),
  }
}

/**
 * 合并单元格。
 *
 * `<mergeCells><mergeCell ref="A1:C1"/></mergeCells>` 表示 A1 跨到 C1：
 * 左上角那格获得跨距，其余格标记 `covered`（渲染时跳过）——**不能删掉它们**，
 * 否则列位置会整体左移。
 *
 * 返回合并区域覆盖到的最右列（表宽要用）。
 */
function applyMerges(xml: string, rows: XlsxRow[]): number {
  let maxCol = -1

  for (const merge of xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
    const start = parseRef(merge[1] ?? '')
    const end = parseRef(merge[2] ?? '')
    if (!start || !end) continue
    maxCol = Math.max(maxCol, end.col)

    const startRow = rows.findIndex((row) => row.number === start.row)
    if (startRow < 0) continue
    const anchor = rows[startRow]?.cells[start.col]
    if (!anchor) continue

    /**
     * 跨距按**渲染出来的行**算，不是文件里的行号相减：跨过的空行被丢掉了，
     * 用行号差会得到一个后面根本没有那么多行的 `rowSpan`（表格会散架）。
     */
    let endRow = startRow
    for (let i = startRow; i < rows.length && (rows[i]?.number ?? Infinity) <= end.row; i += 1) {
      endRow = i
    }

    anchor.colSpan = end.col - start.col + 1
    anchor.rowSpan = endRow - startRow + 1
    for (let r = startRow; r <= endRow; r += 1) {
      for (let c = start.col; c <= end.col; c += 1) {
        if (r === startRow && c === start.col) continue
        const cell = rows[r]?.cells[c]
        if (cell) {
          cell.text = ''
          cell.covered = true
        }
      }
    }
  }

  return maxCol
}

function parseRef(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!match) return null
  return { col: columnOf(match[1] ?? ''), row: Number(match[2]) }
}

/** `<cols><col min="1" max="1" width="12.5"/></cols>` → 每列的像素宽 */
function readColWidths(xml: string, count: number): XlsxColumn[] {
  const columns = Array.from({ length: count }, (_, col) => ({ col, width: DEFAULT_COL_WIDTH }))

  for (const col of xml.matchAll(/<col\b[^>]*\/>/g)) {
    const attrs = col[0]
    const min = Number(/min="(\d+)"/.exec(attrs)?.[1] ?? 1)
    const max = Number(/max="(\d+)"/.exec(attrs)?.[1] ?? min)
    const width = Number(/width="([\d.]+)"/.exec(attrs)?.[1] ?? NaN)
    if (!Number.isFinite(width)) continue
    for (let i = min - 1; i < Math.min(max, count); i += 1) {
      const target = columns[i]
      if (target) target.width = colWidthToPx(width)
    }
  }

  return columns
}

/** XML 实体与数字实体。`&amp;` 这类不解会让单元格显示成 `&amp;` 字面量 */
function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
