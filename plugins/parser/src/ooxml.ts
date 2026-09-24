import { unzipSync } from 'fflate'

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
 * fflate：MIT、零运行时依赖、解压一个 50MB 内的 OOXML 足够快。
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
 * ## `unzipSync` 会不会吃掉内存
 *
 * 会用。上限 50MB 的 zip 解压后可能到数百 MB（XML 冗余度高）。
 * 这是**已知且接受**的代价：单用户自托管、同时最多一个上传，
 * 而换流式解压要让每个提取器都变成流式状态机——复杂度换不来东西。
 * 超限的文件在上传端点就被挡住了（`FILE_MAX_BYTES`）。
 */

/** 取出一个 XML 条目的文本内容。条目不存在时返回 null（而不是抛错） */
export function readZipEntry(data: Uint8Array, path: string): string | null {
  const files = unzipSync(data, { filter: (file) => file.name === path })
  const entry = files[path]
  if (!entry) return null
  return new TextDecoder('utf-8').decode(entry)
}

/**
 * 列出 zip 里匹配某个前缀的条目名（按名排序）。
 *
 * 排序是必要的：`sheet1.xml` / `sheet10.xml` / `sheet2.xml` 的字典序不等于
 * 工作表顺序，而不排序的话「第 3 张表」在导出的正文里会跳到第 10 张前面。
 */
export function listZipEntries(data: Uint8Array, prefix: string, suffix = ''): string[] {
  const names: string[] = []
  unzipSync(data, {
    filter: (file) => {
      if (file.name.startsWith(prefix) && file.name.endsWith(suffix)) names.push(file.name)
      return false
    },
  })
  return sortedNaturally(names)
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
