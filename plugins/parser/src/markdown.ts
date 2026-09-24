import { isTextParseInput, type ParseInput, type ParseResult, type Parser } from '@mimir/shared'

/**
 * Markdown 直通解析器。
 *
 * 看着像「什么都不做」，但它是一条真实存在的路径：GitHub 抓取器取回的
 * README **本来就是 Markdown**。把它再走一遍 HTML 转换是倒退——
 * 会丢掉代码块的围栏语言标注、重排表格、把 `>` 引用变成纯文本。
 *
 * 声明它的价值在于**编排层不需要为「已经是 md」写特例**：
 * 「这份内容是什么格式」由抓取器声明，选哪个解析器由注册表决定。
 */
export function createMarkdownParser(): Parser {
  return {
    id: 'markdown',
    accepts: ['markdown'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (!isTextParseInput(input)) throw new Error('markdown 解析器只处理文本输入')

      const markdown = input.content

      return {
        markdown,
        imageCount: (markdown.match(/!\[[^\]]*\]\(/g) ?? []).length,
        parser: 'markdown',
      }
    },
  }
}
