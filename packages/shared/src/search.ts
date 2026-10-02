import { z } from 'zod'
import { documentKindSchema } from './documents.js'

/**
 * 搜索模式：
 * - keyword：全文检索，快、准、无 AI 调用。默认。
 * - semantic：向量检索，M1 上线。
 * - hybrid：加权 RRF 融合，M1 上线。
 *
 * M0 只实现 keyword；保留枚举是为了让前端与 API 契约不用随 M1 改。
 */
export const searchModeSchema = z.enum(['keyword', 'semantic', 'hybrid'])
export type SearchMode = z.infer<typeof searchModeSchema>

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, '查询不能为空').max(500),
  mode: searchModeSchema.default('keyword'),
  kind: documentKindSchema.optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type SearchQuery = z.infer<typeof searchQuerySchema>

/**
 * 调用方传进来的形状（默认值可省略）。
 *
 * 服务端要的是 `SearchQuery`（默认值已填好），而前端调用时不该被迫重复
 * 写 `mode: 'keyword'`——那是契约里的默认值，不是调用方的责任。
 * 所以两个类型都暴露：服务端用前者，客户端用后者。
 */
export type SearchQueryInput = z.input<typeof searchQuerySchema>

/** 命中片段，带高亮用的字符区间，供前端精确标红 */
export const searchSnippetSchema = z.object({
  text: z.string(),
  /** 相对整个正文的字符偏移，用于「跳回原文」 */
  start: z.number().int(),
  end: z.number().int(),
})
export type SearchSnippet = z.infer<typeof searchSnippetSchema>

export const searchHitSchema = z.object({
  documentId: z.string(),
  kind: documentKindSchema,
  title: z.string(),
  path: z.string().nullable(),
  url: z.string().nullable(),
  /**
   * 上传件的格式与大小，随命中一起返回。
   *
   * 为什么检索结果也要带这两个字段：中栏的列表项**只有一种渲染形态**
   * （`docs/DESIGN.md` §8.2），搜索结果与浏览结果长得一模一样。少了它们，
   * 搜到一个 PDF 时那一行会缺掉「PDF · 2.4 MB」——同一份文档在两种入口下
   * 显示不同，会让人以为搜到的是另一条东西。
   */
  mime: z.string().nullable(),
  size: z.number().int().nullable(),
  snippet: searchSnippetSchema,
  /**
   * 该命中来自哪些通道。
   *
   * 是 `string[]` 而不是字面量联合：通道名来自 `plugins/leg/` 的注册表，
   * 接口约定里 `RetrievalLeg.name` 就是「写进 matchedBy 的那个名字」
   * （见 `docs/TECH.md` §7.3）。写死枚举会让「加一个通道」变成
   * 「改契约 + 改前端 + 改测试」——而加通道按设计应该只是加一个文件。
   *
   * 前端把技术名翻成人话（词级召回 / 子串兜底），未知的通道名原样显示。
   */
  matchedBy: z.array(z.string()),
  score: z.number(),
})
export type SearchHit = z.infer<typeof searchHitSchema>

export const searchResponseSchema = z.object({
  mode: searchModeSchema,
  /**
   * 实际生效的检索通道，便于排查「为什么没走向量」。
   * 同 matchedBy，它反映的是注册表里的实现，不写死枚举。
   */
  channels: z.array(z.string()),
  tookMs: z.number(),
  total: z.number().int(),
  hits: z.array(searchHitSchema),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>

/**
 * 补嵌入的请求（`POST /maintenance/embed`，M1-B）。
 *
 * `limit` 是**这一轮最多嵌几条**，不是「要嵌完」——分批让这一步可中断，
 * 而重入的判据是向量表里有没有行（`docs/TECH.md` §4.10），
 * 所以中断之后接着调一次就行。
 */
export const embedRequestSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(64),
})
export type EmbedRequest = z.infer<typeof embedRequestSchema>
