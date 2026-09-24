import { isTextParseInput, type ParseInput, type ParseResult, type Parser } from '@mimir/shared'

/**
 * 纯文本直通解析器（`docs/TECH.md` §13）。
 *
 * ## 它反而证明接缝的分工是对的
 *
 * 上传一份 `.txt` 时，**字节→字符串的解码发生在宿主的上传路径里**，
 * 不在解析器里。理由：解码是会失败的（GBK 编码的中文 txt 用 UTF-8 解出来
 * 是乱码），而那个失败要变成「这个文件不是 UTF-8 文本」这句话，
 * 由编排层如实报告——这正是 `ParseInput` 的判别联合所表达的形状：
 * 文本类实现拿到的**已经是字符串**，字节类实现（docx 等）才拿字节。
 *
 * 所以这个实现的职责只剩一件：**把文本原样认领下来**。
 * 它的存在让编排层不需要为「这份文件就是纯文本」写特例——
 * 与 markdown 直通是同一个理由（见 `markdown.ts`）。
 *
 * ## 为什么正文不转义 Markdown
 *
 * 正文里如果有 `#` 或 `*`，它**不会**被渲染成标题或强调——因为界面按
 * `mime` 判断，文本类文件用等宽只读视图渲染（`FileViewer`），不走 Markdown。
 * 在这里转义反而会把原始文本改脏，而「原件是真相」这条要求正文可核对。
 */

export function createTextParser(): Parser {
  return {
    id: 'text',
    accepts: ['text'],

    async parse(input: ParseInput): Promise<ParseResult> {
      if (!isTextParseInput(input)) throw new Error('text 解析器只处理文本输入')

      return {
        markdown: input.content,
        imageCount: 0,
        parser: 'text',
      }
    },
  }
}
