import { z } from 'zod'

/**
 * 文档类型。一条规则贯穿全局：不管来源是什么，入库后统一成为 Markdown。
 * note 是自己写的（可编辑、文件是真相）；
 * 其余是抓取的资料（只读快照 + 派生正文），检索时对自己的笔记加权。
 */
export const documentKindSchema = z.enum(['note', 'web', 'wechat', 'github', 'pdf', 'file'])
export type DocumentKind = z.infer<typeof documentKindSchema>

/**
 * 处理状态。inbox 是默认落点——先收进来，之后再整理。
 * 没有「收件箱」这一步，知识库会死于收集摩擦。
 */
export const documentStatusSchema = z.enum(['inbox', 'ready', 'failed', 'archived'])
export type DocumentStatus = z.infer<typeof documentStatusSchema>

export const noteCreateSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  body: z.string().default(''),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
})
export type NoteCreate = z.infer<typeof noteCreateSchema>

export const noteUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  status: documentStatusSchema.optional(),
})
export type NoteUpdate = z.infer<typeof noteUpdateSchema>

export const documentSummarySchema = z.object({
  id: z.string(),
  kind: documentKindSchema,
  status: documentStatusSchema,
  title: z.string(),
  /** 纯文本摘要，用于列表预览与搜索结果 */
  excerpt: z.string(),
  tags: z.array(z.string()),
  /** 相对项目根的 vault 路径，仅 note 有 */
  path: z.string().nullable(),
  url: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type DocumentSummary = z.infer<typeof documentSummarySchema>

export const documentDetailSchema = documentSummarySchema.extend({
  body: z.string(),
})
export type DocumentDetail = z.infer<typeof documentDetailSchema>

export const documentListQuerySchema = z.object({
  kind: documentKindSchema.optional(),
  status: documentStatusSchema.optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>
