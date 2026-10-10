import { Unzip, UnzipInflate } from 'fflate'
import { FILE_MAX_BYTES } from '@mimir/shared'

/**
 * OOXML（`.docx` / `.xlsx` / `.pptx`）提取的共用底座。
 *
 * ## 为什么用 fflate 而不是 mammoth / SheetJS
 *
 * 我们要的只是「从 ZIP 里取出 XML，再抽出文字」。mammoth 与 SheetJS 各自
 * 是一棵比这大得多的树（SheetJS 还有 npm 分发停更与 CVE 的历史），
 * 而它们真正值钱的排版还原能力我们用不上——正文层是**文本提取**，
 * 不是「在浏览器里还原 Word 版式」。
 *
 * fflate：MIT、零运行时依赖。解压走流回调，避免压缩包上限被误当成内存上限。
 *
 * ## 三个格式的共同形状
 *
 * OOXML 就是一个 zip：
 *
 * ```
 * .docx  word/document.xml          正文段落
 * .xlsx  xl/sharedStrings.xml       共享字符串（单元格里的文字在这里）
 *        xl/worksheets/sheet1.xml    单元格（引用共享字符串的下标）
 * .pptx  ppt/slides/slide1.xml      每页的文字
 * ```
 *
 * ## 解压预算
 *
 * 压缩包 ≤ 50 MiB 不等于解压后有上界。共用读取层只解需要的 XML，
 * 按实际输出限制单条 16 MiB、累计 64 MiB；ZIP 声明的大小只用于提前拒绝。
 * 原件依然保存，超限只让正文提取失败（D-109）。
 */

export const MAX_XML_ENTRY_BYTES = 16 * 1024 * 1024
export const MAX_TOTAL_XML_BYTES = 64 * 1024 * 1024
export const MAX_ZIP_PARTS = 10_000

export interface OoxmlArchive {
  read(path: string): string | null
  list(prefix: string, suffix?: string): string[]
}

/**
 * 一次扫描 ZIP；只解调用方需要的 XML。小块输入让单次 inflate 的输出
 * 不会远超上限，实际计数才是最终边界（ZIP 元数据不可信）。
 */
export function openOoxmlArchive(
  data: Uint8Array,
  selectXml: (path: string) => boolean,
  limits: { entryBytes: number; totalBytes: number; parts: number } = {
    entryBytes: MAX_XML_ENTRY_BYTES,
    totalBytes: MAX_TOTAL_XML_BYTES,
    parts: MAX_ZIP_PARTS,
  },
): OoxmlArchive {
  if (data.byteLength > FILE_MAX_BYTES) throw new Error('Office 原件超过 50 MiB，无法提取正文')

  const names: string[] = []
  const seen = new Set<string>()
  const xml = new Map<string, string>()
  let totalBytes = 0
  const unzip = new Unzip((file) => {
    if (seen.has(file.name)) throw new Error(`Office ZIP 含重复部件：${file.name}`)
    seen.add(file.name)
    names.push(file.name)
    if (names.length > limits.parts) throw new Error(`Office ZIP 部件数超过 ${limits.parts}`)
    if (!selectXml(file.name)) return

    if (file.originalSize !== undefined && file.originalSize > limits.entryBytes) {
      throw new Error(`Office XML 部件过大：${file.name}（上限 ${limits.entryBytes} 字节）`)
    }
    if (file.originalSize !== undefined && totalBytes + file.originalSize > limits.totalBytes) {
      throw new Error(`Office XML 累计解压量超过 ${limits.totalBytes} 字节`)
    }

    const decoder = new TextDecoder('utf-8')
    const chunks: string[] = []
    let entryBytes = 0
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      if (chunk) {
        entryBytes += chunk.byteLength
        totalBytes += chunk.byteLength
        if (entryBytes > limits.entryBytes) {
          throw new Error(`Office XML 部件过大：${file.name}（上限 ${limits.entryBytes} 字节）`)
        }
        if (totalBytes > limits.totalBytes) {
          throw new Error(`Office XML 累计解压量超过 ${limits.totalBytes} 字节`)
        }
        chunks.push(decoder.decode(chunk, { stream: true }))
      }
      if (final) {
        chunks.push(decoder.decode())
        xml.set(file.name, chunks.join(''))
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  const INPUT_CHUNK_BYTES = 1024
  for (let offset = 0; offset < data.byteLength; offset += INPUT_CHUNK_BYTES) {
    const end = Math.min(offset + INPUT_CHUNK_BYTES, data.byteLength)
    unzip.push(data.subarray(offset, end), end === data.byteLength)
  }
  if (data.byteLength === 0) unzip.push(data, true)

  return {
    read: (path) => xml.get(path) ?? null,
    list: (prefix, suffix = '') =>
      sortedNaturally(names.filter((name) => name.startsWith(prefix) && name.endsWith(suffix))),
  }
}

/** 按自然序排序（不改原数组）：`slide2` 排在 `slide10` 前面 */
export function sortedNaturally(names: readonly string[]): string[] {
  return [...names].toSorted(naturalCompare)
}

/** 数字段按数值比，其余按字典序。`slide2` < `slide10` */
export function naturalCompare(a: string, b: string): number {
  const left = numberChunks(a)
  const right = numberChunks(b)

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i]
    const r = right[i]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (l === r) continue

    const ln = Number(l)
    const rn = Number(r)
    const bothNumbers = !Number.isNaN(ln) && !Number.isNaN(rn)
    if (bothNumbers) return ln - rn
    return l < r ? -1 : 1
  }
  return 0
}

/** 拆成数字段与非数字段。提出去是因为它不捕获任何东西 */
function numberChunks(value: string): string[] {
  return value.match(/\d+|\D+/g) ?? []
}

/**
 * XML → 纯文本。**这不是一个通用 XML 解析器**，是一个针对 OOXML 的抽取器。
 *
 * 做法：先把结构性的空元素（段落、换行、制表、单元格）换成**标记字符**，
 * 再剥掉所有标签、解开实体。比引一个 DOM 实现轻得多，而 OOXML 的文本
 * 恰恰都在叶子节点里（文字就是标签之间的内容），所以够用。
 *
 * 换行标记用 `\n`、单元格分隔用 `\t`：它们随后会被各提取器转成 Markdown
 * 的段落与表格。用不可见字符（如 `\u0000`）当哨兵是不行的——
 * XML 里本来就不允许它，解析出来会被当成垃圾。
 */
export function xmlToText(xml: string): string {
  return (
    xml
      // 段落 / 换行 / 分页 → 段落分隔。w:br 与 w:cr 是 Word 的软换行
      .replace(/<w:p\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<w:cr\b[^>]*\/>/g, '\n')
      .replace(/<a:p>/g, '\n')
      .replace(/<\/a:p>/g, '\n')
      .replace(/<a:br\b[^>]*\/>/g, '\n')
      // 制表符：表格里靠它分隔单元格
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      // 剥掉所有标签
      .replace(/<[^>]+>/g, '')
      // 实体。顺序有讲究：&amp; 必须最后解，否则 &#38;lt; 这类会二次展开
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      .replace(/&amp;/g, '&')
  )
}

/**
 * 收尾：把抽取结果整成可读的 Markdown 段落。
 *
 * 三件事都是实测需要的：
 *  - 逐行 trim（OOXML 的缩进与空白会原样带出来，中文段首会莫名多出空格）
 *  - 折叠连续空行（一个 Word 段落会产出多个 `\n`，不折叠会满屏空行）
 *  - 去掉零宽字符（Word 会插入 U+200B 之类的排版控制符，检索时会变成脏 token）
 */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
