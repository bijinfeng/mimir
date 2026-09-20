import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict.js'

/**
 * 中文分词。
 *
 * 为什么必须做这件事：Postgres 的 `simple` / `unicode61` 分词器没有中文词边界概念，
 * 「组件性能优化」会被当成**一个** token。结果是用户搜「组件」永远搜不到。
 * 所以写入时用 jieba 切好、以空格连接存进 search_text 列，
 * 查询时用同一套分词切查询串，两边才能对上。
 *
 * 注意两点，都踩过坑：
 *  1. `new Jieba()` 不带词典会退化成逐字切分（「组件」→「组」「件」），
 *     必须用 `Jieba.withDict(dict)` 显式加载词典。
 *  2. `withDict` 只接收词典；idf 是 TfIdf 关键词提取用的，分词不需要。
 */
let jieba: Jieba | null = null

function getJieba(): Jieba {
  if (!jieba) {
    jieba = Jieba.withDict(dict)
  }
  return jieba
}

/** 分词并丢弃空白/标点碎片。保留英文单词与数字的完整形态。 */
export function tokenize(input: string): string[] {
  return getJieba()
    .cut(input, false)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

/**
 * 生成入库用的检索文本。
 * 先统一小写：Postgres 的 simple 配置本身会小写词元，
 * 这里提前做是为了让写入内容可读、可 diff。
 */
export function toSearchText(...parts: string[]): string {
  return tokenize(parts.join(' ').toLowerCase()).join(' ')
}

/**
 * 生成查询用的 tsquery 输入串。
 * 交给 plainto_tsquery 而不是自己拼 tsquery 语法——
 * plainto_tsquery 走参数化，用户输入的引号/冒号不会引起解析错误。
 */
export function toQueryText(input: string): string {
  return tokenize(input.toLowerCase()).join(' ')
}

/** 是否包含中日韩字符。用于决定要不要启用子串兜底检索。 */
export function hasCjk(input: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(input)
}
