import type { PluginHost } from '@mimir/shared'
import { createHtmlParser } from './html.js'
import { createMarkdownParser } from './markdown.js'

/**
 * 解析器插件包：原始内容 → 统一 Markdown。
 *
 * ## 这一层的边界（用户原话：「解析引擎只负责文档解析」）
 *
 * 它**不抓取**（那是 capturer）、**不写库**（那是宿主的写入路径）、
 * **不分块**（那是 chunker，M1-B）。
 * 输入是「一段 HTML 或 Markdown」，输出是「Markdown + 图片数」。
 *
 * 边界收得这么窄，是为了让「换一个 HTML 转换策略」或「加 PDF 解析」
 * 都不需要碰抓取器、数据库与检索——那三处各自都不知道 HTML 是怎么变过来的。
 *
 * ## M1 的 PDF / Word
 *
 * 它们在这里加文件，不在别处：`accepts` 声明 `'pdf'` 之后，
 * 编排层按声明选实现，宿主的上传路径只需要把文件内容交给注册表。
 * 现在不提前建空文件——那只会让「有没有实现」这个问题变得需要打开文件才知道。
 */
export function install(host: PluginHost): void {
  host.parser(
    {
      seam: 'parser',
      id: 'markdown',
      name: 'Markdown 直通',
      description: '内容本来就是 Markdown 时原样保留',
      file: 'plugins/parser/src/markdown.ts',
      configKeys: [],
    },
    createMarkdownParser(),
  )

  host.parser(
    {
      seam: 'parser',
      id: 'html',
      name: 'HTML 正文提取',
      description: 'Readability 去掉导航与广告，保留代码块与表格，再转成 Markdown',
      file: 'plugins/parser/src/html.ts',
      configKeys: [],
    },
    createHtmlParser(host.settings),
  )
}
