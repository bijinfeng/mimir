/**
 * PDF 的文字层提取（M1-E）。
 *
 * 单独一个文件而不是塞进 `pdf.ts`：pdf.js 的加载与「项 → 行 → 段落」
 * 的拼装逻辑有十来行注释要写（那些坑都是实测出来的），
 * 混在 Parser 的实现里会把接缝的形状淹掉。
 *
 * ## 为什么用 `hasEOL` 而不是按 y 坐标聚类
 *
 * pdf.js 的 `getTextContent()` 给的每个项带一个 `hasEOL` 标记——它是
 * **解析器自己算出来的「这一行结束了」**，比我们从 `transform[5]`（y 坐标）
 * 聚类更准：同一行里字号不同的项 y 会差一点，用容差聚类要么误合并、
 * 要么误拆分，而那个容差在不同文档上要不同的值。
 *
 * ## 段落怎么来
 *
 * 行与行之间**空一行**视为段落边界，否则拼成一段（行尾补空格）。
 * PDF 里没有「段落」这个对象，所以这是启发式——但它是保守的：
 * 宁可把两段并成一段（读起来还行），也不要把一段拆成两段（读起来断）。
 *
 * ## 一个已知的取舍：中文行尾的空格
 *
 * 英文的行尾换行代表「一个空格」（词的边界），中文的不代表——
 * 「组件」和「性能」在 PDF 里换行时，拼回去不该变成「组件 性能」。
 * 判据是**行尾字符**是不是 CJK：是 CJK 就不补空格。这个判据简单且够用，
 * 而漏掉它的后果是中文 PDF 的正文里到处是空格，分词与检索都会受影响。
 */

import { createRequire } from 'node:module'
import { dirname } from 'node:path'

/** pdf.js 的文本项。只取我们用的字段，不依赖它的类型（那个类型在 legacy build 里） */
interface TextItem {
  str?: string
  hasEOL?: boolean
}

interface Extracted {
  markdown: string
  pageCount: number
}

/**
 * 从 PDF 字节提取文字。
 *
 * 传给 pdf.js 的字节必须是**拷贝**：`getDocument` 会把 ArrayBuffer
 * **transfer 给 worker**，调用方之后就拿不到自己的字节了
 * （项目里在预览路径上踩过这个坑，见 TECH §15.12 的「预览过一次之后
 * 保存的 PDF 是 0 字节」）。
 */
export async function extractPdfText(data: Uint8Array, _filename?: string): Promise<Extracted> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const task = getDocument({
    // Buffer 也满足 Uint8Array 类型，但 Buffer.slice() 仍返回 Buffer，
    // pdf.js 6 会拒绝它。构造普通 Uint8Array，同时保证 worker 接手的是副本。
    data: new Uint8Array(data),
    /**
     * 一个 worker 都不起：`getTextContent` 是纯计算，不需要渲染，
     * 所以主线程直接算最省事（起 worker 的代价在这个场景里大于收益，
     * 而且 Node 里 worker 的路径解析更容易出问题）。
     */
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    /**
     * 标准字体目录。**不给它时 pdf.js 会对每一份用标准字体的 PDF
     * 打一句警告**（`Ensure that the standardFontDataUrl ... is provided`），
     * 而那正是世界上绝大多数 PDF——日志会被这一句刷满，
     * 真正的错误反而看不见。
     *
     * 目录从 pdfjs-dist 包自己的位置算（`build/` 往上两层是包的根），
     * 不写绝对路径也不假定 node_modules 的布局：pnpm 的 `.pnpm/<pkg>@<ver>/`
     * 结构下写死路径一定会错。
     */
    standardFontDataUrl: standardFontsUrl(),
  } as Parameters<typeof getDocument>[0])

  const pdf = await task.promise

  try {
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines = itemsToLines(content.items as TextItem[])

      if (lines.length > 0) {
        /**
         * 每一页前面加一个二级标题「第 N 页」。
         *
         * 理由有两个：一是分块器会把标题当边界，页与页之间自然断开
         * （引用指回某一页时上下文不会串页）；二是引用卡片上
         * 「第 3 页」对用户比一个字符偏移直观得多。
         *
         * 单页文档不加——「第 1 页」在一页的文档里是噪音。
         */
        if (pdf.numPages > 1) pages.push(`## 第 ${pageNumber} 页`)
        pages.push(linesToMarkdown(lines))
      }
    }

    return { markdown: pages.join('\n\n'), pageCount: pdf.numPages }
  } finally {
    // 释放 pdf.js 持有的资源。不 await：`cleanup()` 在 legacy build 里
    // 返回的可能不是 Promise（实测 v6 返回 undefined），`await` 一个
    // undefined 没有害处，但那说明它的契约与文档不符——所以这里
    // 用一个不依赖返回类型的写法
    await Promise.resolve(pdf.cleanup?.()).catch(() => {})
  }
}

/** 一行：若干文本项拼起来的结果。空行（`text === ''`）表示段落边界 */
interface Line {
  text: string
}

/**
 * 文本项 → 行。
 *
 * `hasEOL` 为真的项是一行的结尾；项内部可能已经带了换行
 * （pdf.js 有时把多行塞进一个项），所以还要按 `\n` 再拆一次。
 *
 * **空行保留**（`text === ''`）：它是段落边界，丢掉它整篇会拼成一大段。
 */
function itemsToLines(items: TextItem[]): Line[] {
  const lines: Line[] = []
  let current = ''

  const pushLine = (): void => {
    lines.push({ text: current.trimEnd() })
    current = ''
  }

  for (const item of items) {
    const str = item.str ?? ''
    const parts = str.split('\n')
    for (const [index, part] of parts.entries()) {
      if (index > 0) pushLine()
      current += part
    }

    if (item.hasEOL) pushLine()
  }
  // 末尾没有 hasEOL 的残余内容也要收进来（有些 PDF 的最后一行缺这个标记）
  if (current.trim() !== '') pushLine()

  return lines
}

/**
 * 行 → Markdown。
 *
 * 空行分隔段落；同一段内的行按「CJK 不补空格」的规则拼接。
 */
function linesToMarkdown(lines: Line[]): string {
  const paragraphs: string[] = []
  let current = ''

  for (const line of lines) {
    if (line.text === '') {
      // 空行 = 段落边界。连续空行只算一个
      if (current !== '') paragraphs.push(current)
      current = ''
      continue
    }

    current = current === '' ? line.text : current + joinLine(current, line.text)
  }
  if (current !== '') paragraphs.push(current)

  return paragraphs.join('\n\n')
}

/** 行尾是 CJK 时不补空格——补了会让中文分词切出假边界 */
function joinLine(previous: string, next: string): string {
  const lastChar = previous.at(-1) ?? ''
  const firstChar = next.at(0) ?? ''
  if (isCjk(lastChar) || isCjk(firstChar)) return previous + next
  return `${previous} ${next}`
}

function isCjk(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // 中日韩统一表意文字
    (code >= 0x3000 && code <= 0x303f) || // 中日韩符号与标点
    (code >= 0xff00 && code <= 0xffef) // 全角字符
  )
}

/**
 * pdf.js 自带的标准字体目录。
 *
 * 从包入口往上两层定位（`legacy/build/pdf.mjs` → `pdfjs-dist/`），
 * **不写死 node_modules 布局**：pnpm 下真实位置是
 * `node_modules/.pnpm/pdfjs-dist@<ver>/node_modules/pdfjs-dist/`，
 * 写死路径一定会错。`createRequire` 给出的是解析后的真实位置，
 * 所以从它算起在任何包管理器下都对。
 *
 * 目录不存在时返回空串并**不抛错**：这会让 pdf.js 退回它的默认行为
 * （打一句警告、用内置的度量），而提取文字仍然正确——字体只影响渲染。
 * 为一份只是「日志里有句警告」的东西让整个提取失败是不划算的。
 */
function standardFontsUrl(): string {
  try {
    const require = createRequire(import.meta.url)
    const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
    // 末尾带斜杠：pdf.js 会在这个前缀后拼文件名
    return `${dirname(dirname(dirname(entry)))}/standard_fonts/`
  } catch {
    return ''
  }
}
