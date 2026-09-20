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
  snippet: searchSnippetSchema,
  /** 该命中来源：关键词还是向量。前端据此显示来源标签 */
  matchedBy: z.array(z.enum(['keyword', 'vector'])),
  score: z.number(),
})
export type SearchHit = z.infer<typeof searchHitSchema>

export const searchResponseSchema = z.object({
  mode: searchModeSchema,
  /** 实际生效的检索通道，便于排查「为什么没走向量」 */
  channels: z.array(z.enum(['keyword', 'vector'])),
  tookMs: z.number(),
  total: z.number().int(),
  hits: z.array(searchHitSchema),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>
