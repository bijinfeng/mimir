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

/**
 * 目录路径。空字符串表示「移出目录」——不能与「不修改」混为一谈，
 * 所以 `nullable` 只是让它能表达「清空」，`undefined` 才是「不动」。
 */
const folderSchema = z
  .string()
  .trim()
  .max(200)
  .refine((value) => !value.split('/').some((segment) => segment === '..'), {
    message: '目录路径不能包含 ..',
  })

export const noteUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  status: documentStatusSchema.optional(),
  /** 归入目录。传空串表示移出目录 */
  folder: folderSchema.optional(),
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
  /**
   * 所属目录，如 `技术/前端/React`。目录树由它派生，不另建表——
   * 见 `packages/shared/src/structure.ts` 的说明。
   */
  folder: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type DocumentSummary = z.infer<typeof documentSummarySchema>

/** 双链两侧的一条。只需要能显示和能跳转 */
export const documentLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: documentKindSchema,
})
export type DocumentLink = z.infer<typeof documentLinkSchema>

export const documentDetailSchema = documentSummarySchema.extend({
  body: z.string(),
  /**
   * 双链。`sources` 是这篇链接出去的，`backlinks` 是链接到这篇的
   * （`docs/PRD.md` §5.10）。由服务端解析正文里的站内链接得到，
   * 前端不重复实现一套解析——两处实现必然有一天不一致。
   */
  links: z.object({
    sources: z.array(documentLinkSchema),
    backlinks: z.array(documentLinkSchema),
  }),
})
export type DocumentDetail = z.infer<typeof documentDetailSchema>

export const documentListQuerySchema = z.object({
  kind: documentKindSchema.optional(),
  status: documentStatusSchema.optional(),
  tag: z.string().optional(),
  /** 按目录过滤，含子目录 */
  folder: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>

/**
 * 各视图的文档数，供左导航显示。
 * 与 `DocumentListQuery` 的 kind/status 语义一一对应，界面上的数字
 * 必须与点进去看到的条数一致。
 */
export const documentCountsSchema = z.object({
  inbox: z.number().int(),
  all: z.number().int(),
  note: z.number().int(),
  clip: z.number().int(),
})
export type DocumentCounts = z.infer<typeof documentCountsSchema>

/**
 * 建议标签。
 *
 * 整理条把这几个词直接摆成按钮（`docs/PRD.md` §5.10）——
 * 后端早就该算它，界面上没地方显示等于白算。
 * 返回的是「从这篇内容里提取出的高频词」，不是模型生成的结果，
 * 所以它没有延迟、不花钱，可以随文档打开就请求。
 */
export const suggestedTagsResponseSchema = z.object({
  items: z.array(z.string()),
})
export type SuggestedTagsResponse = z.infer<typeof suggestedTagsResponseSchema>
