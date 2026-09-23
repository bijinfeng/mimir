import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict.js'

/**
 * 中文分词（`docs/TECH.md` §4.4）。
 *
 * 为什么必须做这件事：Postgres 的 `simple` / `unicode61` 分词器没有中文词边界概念，
 * 「组件性能优化」会被当成**一个** token。所以写入时用 jieba 切好、以空格连接
 * 存进 `search_text` 列，查询时用同一套分词切查询串——两边才能对上。
 *
 * **两个踩过的坑**：
 *  1. `new Jieba()` 不带词典会退化成逐字切分（「组件」→「组」「件」），
 *     必须用 `Jieba.withDict(dict)` 显式加载词典。
 *  2. `withDict` 只接收词典；idf 是 TfIdf 关键词提取用的，分词不需要。
 *
 * `@node-rs/jieba` 是 Rust 实现，有 linux-x64-gnu/musl 预编译包，
 * Node 22 直接可用，无编译步骤。
 *
 * **单独成一个包的理由**：分词是「检索」与「写入」两侧共用的同一份规则，
 * 而这两侧分别属于检索通道插件与宿主的写入路径。放在任何一侧，另一侧就要
 * 反向依赖它——那正是「插件不依赖宿主内部」要避免的。它也不属于接缝
 * （没有第二个实现可替代：换分词器等于换检索质量，是产品级决定）。
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

/**
 * 查询侧的无信息词。
 *
 * **只用于查询，不用于索引。** 索引侧必须保留全部词元——正文里的
 * 「的」「怎么」也是内容的一部分，删掉会让短语子串匹配失效。
 *
 * 查询侧则必须过滤：用户问「React 重渲染范围怎么缩小？」时，
 * 「怎么」「？」不承载任何检索意图。把它们计入分母会抬高命中门槛，
 * 于是「重渲染范围」匹配上了却被判为「命中不足」而丢掉。
 *
 * 这份表刻意只收**疑问词与结构助词**，不试图覆盖所有虚词——
 * 完整的停用词表永远不完整，而漏收的代价只是一点噪声，
 * 错收（比如把「性能」当虚词）的代价是搜不到。
 */
const QUERY_STOP_WORDS = new Set([
  '的',
  '了',
  '和',
  '与',
  '是',
  '在',
  '有',
  '不',
  '就',
  '都',
  '也',
  '还',
  '这个',
  '那个',
  '这些',
  '那些',
  '什么',
  '怎么',
  '怎样',
  '如何',
  '为什么',
  '哪个',
  '哪些',
  '哪里',
  '多少',
  '是否',
  '可以',
  '能不能',
  '以及',
  '还有',
  '我们',
  '你们',
  '他们',
  '自己',
  '一下',
  '一些',
  '一个',
  '关于',
  '对于',
])

/**
 * 把查询切成有检索意义的词。
 *
 * 三道过滤，每一道都对应一类会让召回失败的噪声：
 *  1. **纯符号/标点** —— 「？」「，」在 tsvector 里根本不存在
 *  2. **单个汉字** —— 「的」「了」几乎出现在每一篇里，毫无区分度
 *  3. **疑问词与结构助词** —— 见 QUERY_STOP_WORDS
 *
 * 去重也是必需的：重复的词会让覆盖率的分母虚高，
 * 「React React 性能」要求命中 2 个词，而实际只有 2 个不同的词。
 */
export function queryTokens(input: string): string[] {
  const tokens = tokenize(input.toLowerCase())
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    // 纯符号（含全角标点）
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    // 单个汉字无区分度；单个拉丁字母同理
    .filter((token) => !/^[\u4e00-\u9fff]$/.test(token))
    .filter((token) => !(token.length === 1 && /[a-z]/i.test(token)))
    .filter((token) => !QUERY_STOP_WORDS.has(token))

  return [...new Set(tokens)]
}
