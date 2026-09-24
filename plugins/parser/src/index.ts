import type { PluginHost } from '@mimir/shared'
import { createDocxParser } from './docx.js'
import { createHtmlParser } from './html.js'
import { createMarkdownParser } from './markdown.js'
import { createPptxParser } from './pptx.js'
import { createTextParser } from './text.js'
import { createXlsxParser } from './xlsx.js'

/**
 * 解析器插件包：原始内容 → 统一 Markdown。
 *
 * ## 这一层的边界（用户原话：「解析引擎只负责文档解析」）
 *
 * 它**不抓取**（那是 capturer）、**不写库**（那是宿主的写入路径）、
 * **不分块**（那是 chunker，M1-B）。
 * 输入是「一段 HTML / Markdown」或「一个 Office 文件的字节」，
 * 输出是「Markdown + 图片数」。
 *
 * 边界收得这么窄，是为了让「换一个 HTML 转换策略」或「加一种文件格式」
 * 都不需要碰抓取器、数据库与检索——那三处各自都不知道内容是怎么变过来的。
 *
 * ## 输入分成两类（`docs/TECH.md` §7.2 的 `ParseInput` 判别联合）
 *
 * | 类 | 谁 | 拿到什么 |
 * |---|---|---|
 * | 文本类 | markdown / html / text | 已经是字符串 |
 * | 字节类 | docx / xlsx / pptx | 原件字节（它们是 ZIP 容器） |
 *
 * **字节→字符串的解码不在这一层**：`.txt` 的解码会失败（GBK），
 * 而那个失败要由编排层说成「这个文件不是 UTF-8 文本」，所以宿主在上传路径里
 * 先解码、再交给 `text` 实现。这里拿到的永远是能直接用的字符串。
 *
 * ## 旧版 Office 与 PDF 为什么不在这里
 *
 * `.doc` / `.xls` / `.ppt` 不是 ZIP 而是 OLE 复合文档，要另一套解析，
 * 收益远小于代价——上传能存、能下载，只是没有可搜的正文。
 * PDF 的**文本提取**还没有实现（它需要另一套库，选型见 `docs/RESEARCH.md` 的规矩），
 * 但 PDF 的**预览**不依赖提取（浏览器自带阅读器），所以它现在可用。
 * 这两条都在设置页的解析分区如实显示（`planned` 状态）。
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

  host.parser(
    {
      seam: 'parser',
      id: 'text',
      name: '纯文本直通',
      description: 'txt / csv / json / 代码等文本文件，按 UTF-8 读取（非 UTF-8 会如实报错）',
      file: 'plugins/parser/src/text.ts',
      configKeys: [],
    },
    createTextParser(),
  )

  host.parser(
    {
      seam: 'parser',
      id: 'docx',
      name: 'Word 文本提取',
      description: '按段落提取文字与标题层级。不还原字体、颜色、页眉页脚与批注',
      file: 'plugins/parser/src/docx.ts',
      configKeys: [],
    },
    createDocxParser(),
  )

  host.parser(
    {
      seam: 'parser',
      id: 'xlsx',
      name: 'Excel 文本提取',
      description: '每个工作表转成一张表格，含共享字符串。日期显示为序列号，不猜格式',
      file: 'plugins/parser/src/xlsx.ts',
      configKeys: [],
    },
    createXlsxParser(),
  )

  host.parser(
    {
      seam: 'parser',
      id: 'pptx',
      name: 'PowerPoint 文本提取',
      description: '按页提取文字与分块。读不到演讲者备注，顺序按形状定义顺序',
      file: 'plugins/parser/src/pptx.ts',
      configKeys: [],
    },
    createPptxParser(),
  )
}
