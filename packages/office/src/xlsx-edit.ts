import JSZip from 'jszip'
import { readXlsx, type XlsxWorkbook } from './xlsx.js'

/**
 * xlsx 的**单元格文字编辑**（补丁式保存）。
 *
 * ## 为什么不用上游那条路
 *
 * 上游的 xlsx 读写整条走 **13.7K 行 Rust 侧车**（`apps/sheets/native/xlsx-engine`，
 * 会话式读表 + 公式重算 + 交叉编译进桌面包）。浏览器里没有那条路，也不该有
 * ——它买的核心能力是「可编辑的电子表格」（虚拟化渲染、公式引擎、Univer
 * 级别的模型），而 mimir 要的是**改一个格子的字**。
 *
 * ## 所以走 pptx 那条已验证的路子：补丁
 *
 * 改一个单元格只重写**那一张 sheet 的 XML**，zip 里其余条目逐字节原样写回
 * （与 `pptx-save.ts` 同一条承诺，理由也一样：Excel 的 XML 里有大量我们没
 * 建模的东西——条件格式、数据验证、图表、透视表、切片器——整体重建会静默
 * 丢掉它们）。
 *
 * ## 三条不能违反的规矩
 *
 * ### 1. 绝不改 `sharedStrings.xml`
 *
 * **共享字符串是共享的**：`<c t="s"><v>17</v></c>` 里的 17 指向
 * `sharedStrings.xml` 的第 17 项，而**多个单元格会指向同一项**（这正是它
 * 叫「共享」的原因）。改那一项会让所有引用它的格子一起变——用户改 A1，
 * D7 也跟着变了，而且没有任何提示。
 *
 * 所以新文本一律写成**内联字符串**（`t="inlineStr"`）：它是 OOXML 里合法的
 * 另一种存法，作用域就是这个格子。代价是文件里多一份重复文本（几字节），
 * 换来的是「改一个格子只影响那一个格子」。
 *
 * ### 2. 公式格被覆盖时要连公式一起清掉
 *
 * 用户在格子里输入值，就是**覆盖**原来的内容（电子表格的语义）。所以
 * **`<f>` 必须一起删**——只换 `<v>` 而留着 `<f>` 的话，Excel 打开时会
 * 按公式重算，用户输入的值被悄悄丢掉。
 *
 * 反过来：我们**不重算**任何公式。改了一个被别的公式引用的格子，那些公式
 * 的缓存值就旧了（Excel 打开时会重算，我们的预览显示的是旧缓存值）。
 * 这一点在界面上如实说明。
 *
 * ### 3. 只支持文字与数字，不碰样式
 *
 * 单元格的样式（`s="3"` 指向 `styles.xml`）**原样保留**——所以改文字不会
 * 掉格式（颜色、边框、数字格式都还在）。日期不还原这条规矩（`xlsx.ts`）
 * 在这里同样适用：输入的文字原样存进去，不猜它是日期。
 */

export interface XlsxCellRef {
  /** 工作表序号（与 `readXlsx` 返回的 sheets 下标一致） */
  sheet: number
  /** 行号（1 开始，**文件里的行号**，不是渲染序） */
  row: number
  /** 列号（0 开始） */
  col: number
}

export interface XlsxEditSession {
  /** 当前模型（改过之后要重新读，所以是函数） */
  workbook(): XlsxWorkbook
  /**
   * 渲染用的不可变快照。
   *
   * 与 `PptxEditSession.view()` 同一条理由：编辑是就地改的，直接拿
   * `workbook()` 当 React 依赖不会触发重算（引用没变），界面会停在旧内容上。
   */
  view(): XlsxWorkbook
  /** 这个格子现在的文字（空串表示空或不存在） */
  cellText(ref: XlsxCellRef): string
  /** 这个格子是公式吗（界面要据此提示「会被覆盖」） */
  isFormula(ref: XlsxCellRef): boolean
  /**
   * 写一个格子的文字。返回 false 表示这张表不存在（调用方应提示）。
   *
   * 传空串 = 清空这个格子（写一个空的内联字符串，而不是删掉 `<c>`——
   * 删掉会让它与相邻格的样式继承关系变化）。
   */
  setCell(ref: XlsxCellRef, text: string): boolean
  /** 有未保存的改动吗 */
  isDirty(): boolean
  /** 序列化成字节。**不修改会话状态**（保存成功后才 `commit()`） */
  save(): Promise<Uint8Array>
  /**
   * 保存成功后调用：把内存里改过的表 XML 与刚写出的字节对齐。
   *
   * **必须在 `save()` 成功之后调用**，否则第二次编辑会拿旧 XML 拼字节、
   * 把上一次的改动静默回滚（与 `PptxEditSession.commit()` 同一个坑）。
   */
  commit(): void
}

/**
 * 打开一份 xlsx 以编辑。
 *
 * 与 `readXlsx`（只读预览）共用同一套解析——预览那侧不保留 `entries`
 * （不保存），而这里要（未改动的条目原样写回）。
 */
export async function openXlsxForEdit(bytes: Uint8Array): Promise<XlsxEditSession> {
  const archive = await JSZip.loadAsync(bytes)
  const workbook = await readXlsx(bytes)

  /** 每个条目一次解压（改动只发生在 sheet XML 上，其余原样持有） */
  const entries = new Map<string, Uint8Array>()
  for (const name of Object.keys(archive.files)) {
    const file = archive.files[name]
    if (!file || file.dir) continue
    entries.set(name, await file.async('uint8array'))
  }

  /** 改过的表：entry 路径 → 新的 XML 文本 */
  const patched = new Map<string, string>()
  /** 快照（没改动时同一个对象，改动后换新对象——见 `view()`） */
  let cached: XlsxWorkbook | null = null

  const assertSheet = (index: number): string | null => workbook.sheets[index]?.entry ?? null

  return {
    workbook: () => workbook,
    view() {
      cached ??= { sheets: workbook.sheets }
      return cached
    },

    cellText(ref) {
      const sheet = workbook.sheets[ref.sheet]
      const row = sheet?.rows.find((r) => r.number === ref.row)
      return row?.cells[ref.col]?.text ?? ''
    },

    isFormula(ref) {
      const sheet = workbook.sheets[ref.sheet]
      const row = sheet?.rows.find((r) => r.number === ref.row)
      return row?.cells[ref.col]?.formula === true
    },

    setCell(ref, text) {
      const entry = assertSheet(ref.sheet)
      if (!entry) return false

      const current = patched.get(entry) ?? decode(entries.get(entry))
      if (current === null) return false

      const next = writeCellText(current, ref.row, ref.col, text)
      // 格子的引用没找到、又插不进去（表结构非预期）时如实返回失败
      if (next === null) return false

      patched.set(entry, next)
      cached = null
      return true
    },

    isDirty: () => patched.size > 0,

    async save() {
      const zip = new JSZip()
      for (const [path, data] of entries) {
        const replacement = patched.get(path)
        if (replacement !== undefined) {
          // 与 pptx 同一处坑：JSZip 默认给父目录补目录条目，而 Excel 写的包里没有
          zip.file(path, replacement, { createFolders: false })
          continue
        }
        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
        zip.file(path, data, {
          createFolders: false,
          // 与上游 pptx 同一条判断：只有 XML 值得 deflate，媒体/字体本身已压缩
          ...(ext === 'xml' || ext === 'rels' ? {} : { compression: 'STORE' as const }),
        })
      }
      return zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })
    },

    commit() {
      /**
       * 把改过的 XML 烧回 `entries`，并**重新解析**模型——下一轮编辑要基于
       * 新内容（列宽、合并单元格、行号都可能因为这次改动而不同），拿旧模型
       * 继续改会与新 XML 脱节。
       */
      for (const [path, xml] of patched) entries.set(path, encode(xml))
      patched.clear()
      cached = null
    },
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

function decode(bytes: Uint8Array | undefined): string | null {
  return bytes ? decoder.decode(bytes) : null
}
function encode(text: string): Uint8Array {
  return encoder.encode(text)
}

/**
 * 把一个格子的文字写进 sheet XML。
 *
 * 返回新的 XML；**格子的引用既找不到也插不进去时返回 null**（调用方据此
 * 提示失败，而不是静默什么都不做）。
 *
 * ## 三种情况的处理
 *
 *   - 格子**已存在**：整段 `<c …>…</c>` 换成新的内联字符串格
 *   - 格子**不存在但行存在**：按列号插到正确位置（`<row>` 里的 `<c>` 必须
 *     按列号升序——顺序错了 Excel 会拒开，而这是**静默**的：我们的预览
 *     照常显示）
 *   - 行**不存在**：返回 null（这一版不改行结构；界面只能点现有的格）
 */
function writeCellText(xml: string, rowNumber: number, col: number, text: string): string | null {
  const ref = `${columnLetters(col)}${rowNumber}`
  const cellXml = inlineCellXml(ref, text)

  /** 先找这一行 */
  const row = findRow(xml, rowNumber)
  if (!row) return null

  const cells = [...row.inner.matchAll(/<c\b([^>]*?)(\/>|>[\s\S]*?<\/c>)/g)]
  for (const cell of cells) {
    const attrs = cell[1] ?? ''
    if (cellRef(attrs) !== ref) continue
    // 找到了：整段替换（`<f>`、`<v>`、已有的样式引用一起被新的格取代）
    const start = row.start + row.innerStart + cell.index
    const end = start + cell[0].length
    return xml.slice(0, start) + cellXml + xml.slice(end)
  }

  /**
   * 没找到 → 按列号插进这一行。
   *
   * 判据是「本格的列号 < 后一个格的列号」——要**按列号比**而不是按出现顺序，
   * 因为空格的 `<c>` 会被 Excel 整个跳过（`xlsx.ts` 顶部的同一个坑）。
   */
  let insertAt = row.inner.length
  for (const cell of cells) {
    // 只取列字母：`columnOf` 要的是 `A` 而不是 `A5`（传整个引用会算出一个
    // 荒谬的列号，而后果是插入位置错到行首——**静默**的，预览照常显示）
    const other = columnOf(columnLettersOf(cellRef(cell[1] ?? '')))
    if (other > col) {
      insertAt = cell.index
      break
    }
  }

  const at = row.start + row.innerStart + insertAt
  return xml.slice(0, at) + cellXml + xml.slice(at)
}

/** 一个 `<row>` 的位置与内容 */
interface RowSpan {
  /** `<row …>` 起始下标 */
  start: number
  /** 行内容的起始下标（`<row …>` 之后） */
  innerStart: number
  /** 行内容（不含 `<row>` 标签本身） */
  inner: string
}

function findRow(xml: string, rowNumber: number): RowSpan | null {
  for (const m of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    if (Number(/r="(\d+)"/.exec(m[1] ?? '')?.[1] ?? NaN) !== rowNumber) continue
    const open = m[0].indexOf('>') + 1
    return { start: m.index, innerStart: open, inner: m[2] ?? '' }
  }
  return null
}

/** 一个 `<c>` 的 `r="A1"` 引用（没有 `r` 属性时返回空串） */
function cellRef(attrs: string): string {
  return /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? ''
}

/** `A5` → `A`。`columnOf` 要的是列字母，不是整个引用 */
function columnLettersOf(ref: string): string {
  return /^([A-Z]+)/.exec(ref)?.[1] ?? ''
}

/**
 * 一个内联字符串格。
 *
 * `t="inlineStr"` + `<is><t>` 是 OOXML 里合法的一种存法，**作用域就是这个
 * 格子**——这就是不改 `sharedStrings.xml` 的办法（见文件头第 1 条）。
 *
 * `xml:space="preserve"`：前后有空格时必须写，否则 XML 处理器会把它们吃掉
 * （用户输入的 " abc " 变成 "abc"）。
 */
function inlineCellXml(ref: string, text: string): string {
  const preserve = text !== text.trim() ? ' xml:space="preserve"' : ''
  return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${escapeXmlText(text)}</t></is></c>`
}

/**
 * XML 文本转义。
 *
 * **只转三个**（`&` `<` `>`）：它们在 XML 里必须转义。引号不用转——我们写的是
 * 文本节点而不是属性值。顺序有讲究：`&` 必须**最先**，否则 `&lt;` 会变成
 * `&amp;lt;`（显示成字面量 `&lt;`）。
 */
function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** `0` → `A`，`1` → `B`，`26` → `AA`（`xlsx.ts` 里那个的逆运算） */
function columnLetters(col: number): string {
  let n = col + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** `A` → 0，`AA` → 26。空串返回 -1（没有引用时当作「排在最后」） */
function columnOf(letters: string): number {
  if (letters === '') return -1
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}
