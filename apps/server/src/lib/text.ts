import { createHash } from 'node:crypto'
import { tokenize } from '@mimir/tokenizer'

/** 正文哈希。用于判断内容是否变化，决定要不要重新解析/重新嵌入。 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32)
}

/**
 * 去掉 Markdown 语法标记，只留文字。**列表摘要与检索摘要共用这一份**。
 *
 * 摘要的位置（库卡片、命令面板、引用片段）回答的是「这段在说什么」，
 * 而不是「原文长什么样」——`#`、`**`、表格竖线留在里面会打断句子，
 * 读起来像源码。而正文本身的渲染由界面负责，标记不在这里丢。
 *
 * 为什么抽出来：这个"清洗"曾经只做在浏览路径上（`toExcerpt`），检索路径
 * 直接 `body.slice(...)` 原样给前端——于是**同一份文档**在库卡片里是干净的、
 * 在命令面板的搜索结果里带着 `#` 与 `**`。两条路径各写一遍清洗必然漂移，
 * 所以规则只有这一处。
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // 围栏代码块整体丢掉
      .replace(/```[\s\S]*?```/g, ' ')
      // 行内代码保留内容
      .replace(/`([^`]*)`/g, '$1')
      // 图片整体丢掉，链接只留文字
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}[-*+]\s+/gm, '')
      .replace(/^\s{0,3}\d+\.\s+/gm, '')
      .replace(/[*_~]{1,3}/g, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * 列表与搜索结果用的纯文本摘要。
 * 去掉 Markdown 语法标记，让预览读起来是「内容」而不是「源码」。
 */
export function toExcerpt(markdown: string, maxLength = 200): string {
  const plain = stripMarkdown(markdown)

  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength).trimEnd()}…`
}

/**
 * 上传的文本文件 → 字符串。**解不开就抛错，不静默替换。**
 *
 * `new TextDecoder()` 默认不抛错——遇到非法字节会插入 U+FFFD 替换字符。
 * 一份 GBK 编码的中文 txt 于是变成满屏 `��`，而库照常入库、检索照常建索引，
 * 用户搜什么都搜不到、看到的是一片乱码。这与「中文必须预分词」是同一类问题：
 * **静默降级比报错更糟**，所以用 `fatal: true`。
 *
 * 顺带做两件配套的小事：
 *  - **去 BOM**：Windows 记事本存的 txt 前面有个 U+FEFF，留着它会出现在正文首字
 *  - **CRLF → LF**：不换掉的话，渲染与检索里会多出一堆多余空行
 *
 * 不做编码自动探测（GBK/GB18030 等）：那要引入 iconv 加一套猜测逻辑，
 * 而**猜错就是乱码入库**——比明确失败更差。中文 txt 请先转成 UTF-8。
 *
 * 这个函数在**宿主**而不是 `@mimir/shared`：它依赖 `TextDecoder`，
 * 而 shared 的 tsconfig 只有 `lib: ["ES2023"]`（不引 DOM 全局，也不引
 * `@types/node`），刻意保持环境中性——它是前后端共用的契约包。
 * 解码是服务端上传路径的事，放在这里与它的使用位置一致。
 */
export function decodeUtf8(data: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    throw new Error('文件不是 UTF-8 编码的文本（中文 txt 常见 GBK 编码，需先转成 UTF-8）')
  }

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text.replace(/\r\n?/g, '\n')
}

/**
 * 二进制探测：前 8KB 里出现 NUL 或控制字符就当作非文本。
 *
 * 与 `file(1)` 的启发式一致。用途是**在解码之前**先挡一道：一份改名为 `.txt`
 * 的 jpg 多半会解码失败（好），但一份恰好全是合法 UTF-8 字节的二进制有可能
 * 解出一堆控制字符——那时正文毫无意义，还会把无意义的字节串进检索索引。
 */
export function looksBinary(data: Uint8Array): boolean {
  const limit = Math.min(data.byteLength, 8192)
  for (let i = 0; i < limit; i += 1) {
    const byte = data[i]
    if (byte === undefined) continue
    if (byte === 0) return true
    // 允许 tab / LF / FF / CR，其余 C0 控制字符视为二进制信号
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return true
  }
  return false
}

/**
 * 上传路径的文本解码：先判二进制，再严格解码。
 *
 * 两步收在一起，因为服务端要用它产出 `parse_error` 的文案，而测试要用
 * **同一份规则**验证「GBK 的 txt 不会被静默入库」。
 */
export function decodeUploadedText(data: Uint8Array): string {
  if (looksBinary(data)) throw new Error('这个文件看起来是二进制内容，不是文本')
  return decodeUtf8(data)
}

/**
 * 把用户输入变成安全的文件名片段。
 * 保留中文——文件系统支持，而且可读性远好于音译。
 */
export function slugify(title: string, maxLength = 60): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[\s/\\:*?"<>|]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

  return slug.slice(0, maxLength) || 'untitled'
}

/**
 * 正文里出现次数最多的关键词。M0 用它做标签建议，不调用模型。
 *
 * 必须复用 jieba 分词，不能用一个贪婪正则去抓「连续汉字」——
 * 后者会把整句「组件很重要」当成一个词，得到的建议完全没法用。
 */
export function topTerms(markdown: string, limit = 8): string[] {
  const stop = new Set([
    '的',
    '了',
    '和',
    '是',
    '在',
    '我',
    '有',
    '就',
    '不',
    '也',
    '都',
    '而',
    '及',
    '与',
    '这',
    '那',
    '你',
    '他',
    '它',
    '们',
    '上',
    '下',
    '中',
    '为',
    '以',
    '对',
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'to',
    'in',
    'is',
    'it',
    'for',
    'on',
    'this',
    'that',
    'with',
    'as',
    'be',
    'are',
    'was',
    'by',
    'at',
    'from',
  ])

  // 只统计正文，不统计代码块——代码里的标识符不是「主题词」
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
  const counts = new Map<string, number>()

  for (const token of tokenize(prose)) {
    const term = token.toLowerCase()
    if (stop.has(term)) continue
    if (/^[\p{Script=Han}]+$/u.test(term)) {
      // 单个汉字信息量太低，不做建议
      if (term.length < 2) continue
    } else if (!/^[a-z][a-z0-9+#.-]{1,}$/.test(term)) {
      continue
    }
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term)
}
