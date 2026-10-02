import type { ParseInput, ParseResult, Parser } from '@mimir/shared'

/**
 * `.pdf` → Markdown 的**文本提取**（M1-E，`docs/TECH.md` §13 / §15.12）。
 *
 * ## 选型：pdf.js（复用已有的依赖）
 *
 * `RESEARCH.md` 的规矩是「选型要有依据」。这里不需要新选型：
 * **pdf.js 已经在仓库里**（`packages/office` 用它做页面预览），
 * 它的 `getTextContent()` 正是「把一页的文字按项取出来」的官方 API。
 * 再引入一个 PDF 文本库（pdf-parse / pdfium）会带来第二份 PDF 解析实现，
 * 而两份实现对同一份文件的结论可能不同——那是「谁说的算」的问题。
 *
 * ## 为什么在 Node 里也算得动
 *
 * pdf.js 有 legacy build（`pdfjs-dist/legacy/build/pdf.mjs`），
 * 它不依赖浏览器 API、能在 Node 里跑（`packages/office` 的 PDF 预览
 * 走的是浏览器路径，两条路径共用同一个版本）。
 *
 * ## 提取的是什么、不是什么
 *
 * 是：**文字层**。有文字层的 PDF（绝大多数电子生成的）能拿到内容。
 * 不是：扫描件的 OCR——那种文件里根本没有文字对象，只有一张图。
 * 这时如实报「没有可提取的文字」，而不是返回空字符串让界面显示空白
 * （空白等于说「这个文件是空的」，而它其实有内容、只是没有文字层）。
 *
 * ## 版面还原的边界
 *
 * 按页顺序、按 pdf.js 给出的项顺序拼起来，**不试图还原分栏与表格**：
 * PDF 的文字是坐标上的绘制指令，没有「段落」这个概念，
 * 还原版面要另一套启发式（按 y 坐标聚类成行、按 x 排序），
 * 而那套启发式在双栏排版上会把两栏交错成一句话。
 * 宁可给出「能读、能搜、能被引用」的连续文字，也不假装还原了版式。
 */
export function createPdfParser(): Parser {
  return {
    id: 'pdf',
    accepts: ['pdf'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (input.type !== 'pdf') throw new Error('pdf 解析器只处理 pdf 输入')

      /**
       * 动态 import：pdf.js 是**大包**（legacy build 约 1MB），而绝大多数
       * 上传不是 PDF。顶层 import 会让服务端启动时就把它加载进来，
       * 那是白白拖慢每一次启动。
       */
      const { extractPdfText } = await import('./pdf-extract.js')
      const { markdown, pageCount } = await extractPdfText(input.data, input.filename)

      if (markdown.trim() === '') {
        throw new Error(
          `这 ${pageCount} 页 PDF 里没有可提取的文字（可能是扫描件或纯图片）。` +
            '原件已保存，可下载查看',
        )
      }

      return { markdown, imageCount: 0, parser: 'pdf' }
    },
  }
}
