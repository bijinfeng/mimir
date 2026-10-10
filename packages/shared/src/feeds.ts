import { z } from 'zod'

/**
 * RSS / Atom 订阅的契约（M1-E，`.trellis/spec/project/product.md` §3.1）。
 *
 * 订阅是**来源的一种**——收进来的文章仍然落在 `documents`（铁律 3：
 * 所有内容统一成为 Markdown）。这里的形状只描述「订阅关系」本身，
 * 不描述文章：文章的形状永远是 `DocumentSummary`。
 */

export const feedSummarySchema = z.object({
  url: z.string(),
  title: z.string(),
  folder: z.string().nullable(),
  /** 上次**成功**拉取的时间。null = 还没成功过。失败时它不动 */
  lastFetchedAt: z.string().nullable(),
  /** 上次失败的说明。**成功时会被清空**——永不清空的错误字段会让人以为它一直在坏 */
  lastError: z.string().nullable(),
  itemCount: z.number().int(),
})
export type FeedSummary = z.infer<typeof feedSummarySchema>

export const feedCreateSchema = z.object({
  /** feed 地址本身（不是站点首页）。`https://example.com/feed.xml` 这种 */
  url: z.string().url('请输入完整的 URL'),
  folder: z.string().optional(),
})
export type FeedCreate = z.infer<typeof feedCreateSchema>

export const feedUpdateSchema = z.object({
  url: z.string(),
  title: z.string().max(200).optional(),
  folder: z.string().nullable().optional(),
})
export type FeedUpdate = z.infer<typeof feedUpdateSchema>

export const feedRefreshResultSchema = z.object({
  url: z.string(),
  imported: z.number().int(),
  skipped: z.number().int(),
  scanned: z.number().int(),
  error: z.string().nullable(),
})
export type FeedRefreshResult = z.infer<typeof feedRefreshResultSchema>
