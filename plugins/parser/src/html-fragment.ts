import type { ParseInput, ParseResult, Parser } from '@mimir/shared'
import { htmlToMarkdown } from './html.js'

/**
 * HTML **片段** → Markdown（M1-E）。
 *
 * ## 与 `html` 实现的分工
 *
 * | 输入 | 找正文吗 | 用在 |
 * |---|---|---|
 * | `html`（整个网页） | 要——Readability 从导航、广告、页脚里挑出 article | 粘贴 URL、公众号、抓取 |
 * | `html-fragment` | 不要——给的就是正文 | RSS / Atom 的 `content:encoded` |
 *
 * feed 的 `content:encoded` 按规范就是**文章正文**。把它交给 Readability
 * 会得到两种坏结果之一：片段太短时它返回 null（实测两行片段就是），
 * 于是整条退化成裸 HTML 里带着 `<h1>`；片段够长时它会**二次截断**
 * （按「最像文章的那一块」再挑一次），可能丢掉列表与代码块。
 *
 * 所以这一段直接走 `htmlToMarkdown`——它没有「找」这一步，
 * 只有转换。**复用同一个转换函数**：两条路对同一段 HTML 的结果必须一致，
 * 否则同一篇文章在「抓网页」与「读 feed」两个入口下读起来是两个东西。
 *
 * ## 这个实现为什么这么短
 *
 * 它没有解析策略可言。它的价值在**声明**上：让调用的那条路能说
 * 「我知道这不是一整页」（`accepts` 是宿主选实现的依据），
 * 而不是在编排层写一个 `if (fromFeed)`。
 */
export function createHtmlFragmentParser(): Parser {
  return {
    id: 'html-fragment',
    accepts: ['html-fragment'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (input.type !== 'html-fragment') throw new Error('html-fragment 解析器只处理片段输入')

      const markdown = htmlToMarkdown(input.content)
      return {
        markdown,
        imageCount: (input.content.match(/<img\b/gi) ?? []).length,
        parser: 'html-fragment',
      }
    },
  }
}
