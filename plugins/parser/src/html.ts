import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import type { ParseInput, ParseResult, Parser, PluginSettings } from '@mimir/shared'
import { isTextParseInput } from '@mimir/shared'

/**
 * HTML → Markdown 解析器。
 *
 * ## 它是 parser 接缝的第一个实现
 *
 * 接缝的意义在这条路径上立刻体现出来：抓取来的网页与公众号文章都是 HTML，
 * 而「HTML 怎么变成 Markdown」是一个**独立于来源**的问题。
 * 放在抓取器里的话，加一种 HTML 转换策略（比如换掉 turndown、
 * 或按站点走不同的清洗规则）就要改三个抓取器。
 *
 * ## 两个必须处理的现实约束
 *
 * 1. **`<section>` 标签的换行语义**：微信与不少中文站点用 `<section>` 组织段落，
 *    turndown 默认会丢掉它们的分隔，结果是整篇挤成一坨
 * 2. **代码块与表格要保留**：它们是技术内容的主要载体（`docs/PRD.md` §3.1）
 *
 * ## 为什么不用 `new JSDOM()`
 *
 * linkedom 比 jsdom 轻得多，而 Readability 只用到标准 DOM 接口，
 * 不依赖 jsdom 的扩展。解析一篇网页不值得起一个完整 DOM 实现。
 */

/**
 * Readability 期望一个 DOM 的 `Document`，而服务端的 tsconfig 刻意不含 DOM 的
 * lib（`lib: ["ES2023"]`）——给服务端引入 DOM 全局会让人以为 `document`
 * 真的存在。所以从构造函数反推参数类型，而不是直接写 `Document`。
 */
type DomDocument = ConstructorParameters<typeof Readability>[0]

/** HTML → Markdown。抽成函数是因为两个入口（正文提取/整页转换）都要用 */
export function htmlToMarkdown(html: string): string {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })

  // 中文站点用 <section> 组织段落，turndown 默认会丢掉它们的换行语义
  service.addRule('section', {
    filter: ['section'],
    replacement: (content) => `\n\n${content}\n\n`,
  })

  return service.turndown(html)
}

export function createHtmlParser(_settings: PluginSettings): Parser {
  return {
    id: 'html',
    accepts: ['html'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (!isTextParseInput(input)) throw new Error('html 解析器只处理文本输入')

      const { document } = parseHTML(input.content)

      // Readability 会**改写**传入的 document，所以要先取一份标题
      const fallbackTitle = document.title?.trim() ?? ''

      /**
       * Readability 在遇到**结构不完整**的 HTML 时会抛内部错误
       * （实测：一段只有 `<script>` 的片段会让 linkedom 报
       * `Cannot destructure property 'firstElementChild'`）。
       *
       * 那句技术错误不该出现在界面上——上传件的 `parse_error` 是**给用户看的**。
       * 所以这里把它包成一句人话：这个文件不是一份完整的网页。
       */
      let article: { content?: string | null } | null = null
      try {
        article = new Readability(document as unknown as DomDocument).parse() as {
          content?: string | null
        } | null
      } catch {
        throw new Error('这个文件不是一份完整的网页（缺少 html / body 结构）')
      }

      if (!article?.content) {
        // 提取失败不是「返回空字符串」——那会让一篇没有正文的文档静默入库，
        // 用户在列表里看到一条空记录，而不知道发生了什么
        throw new Error(
          `没能从页面里提取出正文（可能是纯 JS 渲染的页面）。${fallbackTitle ? `页面标题：${fallbackTitle}` : ''}`,
        )
      }

      return {
        markdown: htmlToMarkdown(article.content),
        imageCount: (article.content.match(/<img\b/gi) ?? []).length,
        parser: 'html',
      }
    },
  }
}
