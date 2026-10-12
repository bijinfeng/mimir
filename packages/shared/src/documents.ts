import { z } from 'zod'

/**
 * 文档的来源类型。
 *
 * **`kind` 回答「它从哪来」，不回答「它是什么格式」。** 格式（PDF / Word /
 * 图片…）是 `file` 的**属性**，存在 `mime` 列里、显示在元信息行——不新增
 * `pdf` / `docx` 这类 kind。理由：`kind` 是写进 URL、筛选器与 `matchedBy`
 * 的公开值，每加一种格式就要多一组徽标色对，而「给每个类型配一个色」正是
 * `.trellis/spec/project/design.md` §0.1 明确反对的设计（见 `.trellis/spec/project/decisions.md` D-044）。
 *
 * note 是自己写的（可编辑、文件是真相）；其余都是资料（原件 + 派生正文），
 * 检索时对自己的笔记加权。`file` 是上传的原件——与抓取的资料同样只读，
 * 区别只在「原件来自本机」而不是某个 URL。
 */
export const documentKindSchema = z.enum(['note', 'web', 'wechat', 'github', 'file'])
export type DocumentKind = z.infer<typeof documentKindSchema>

/**
 * 「收集的资料」= 所有非笔记。计数与列表筛选**共用这一份**。
 *
 * 这两处曾经各写各的：计数按 `kind !== 'note'` 算，而列表的 `clip` 视图
 * 不带任何过滤条件——数字与点进去看到的条数对不上。当时全是笔记所以看不出来，
 * 而 `documentCountsSchema` 的注释早就承诺过「数字必须与点进去看到的条数一致」。
 */
export const CLIP_KINDS = [
  'web',
  'wechat',
  'github',
  'file',
] as const satisfies readonly DocumentKind[]

/**
 * 处理状态。
 *
 * 新收进来的内容直接是 `ready`（D-054）——原先它先落 `inbox`（收件箱），
 * 再由用户「完成整理」翻成 `ready`。那条两段式流程随整理条一起退役了：
 * 实测它的代价（每收一篇都要多一个动作）大于收益（用户从不按状态筛选），
 * 而「待整理」徽标在每一张新卡片上都是一个待办提醒。
 *
 * `failed` 同样保留——它表达「这条记录坏了」，与流程无关。归档状态已随
 * 归档交互整体退役（D-065）：浏览组织靠目录、标签与搜索，不再有第二个
 * 状态位，存量数据由迁移转回 `ready`。
 */
export const documentStatusSchema = z.enum(['ready', 'failed'])
export type DocumentStatus = z.infer<typeof documentStatusSchema>

/**
 * 目录路径。空字符串表示「移出目录」——不能与「不修改」混为一谈，
 * 所以 `nullable` 只是让它能表达「清空」，`undefined` 才是「不动」。
 *
 * 定义在 `noteCreateSchema` 之前：后者也引用它（Zod 的对象字面量在
 * 模块加载时就求值，引用后置的 const 会踩暂时性死区）。
 */
const folderSchema = z
  .string()
  .trim()
  .max(200)
  .refine((value) => !value.split('/').some((segment) => segment === '..'), {
    message: '目录路径不能包含 ..',
  })

export const noteCreateSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  body: z.string().default(''),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  /**
   * 建到哪个目录。**从知识库页里新建时必须带**——「直接编辑」建出的笔记
   * 要落进当前知识库，否则用户回头找不到它（库视图已没有「全部文档」页，
   * 未指派的文档只剩搜索与标签两条路）。
   */
  folder: folderSchema.optional(),
})
export type NoteCreate = z.infer<typeof noteCreateSchema>

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
   * 原件的 MIME 类型，仅 `kind === 'file'`（上传的文件）有。
   *
   * 与 `size` 一起构成「格式是属性」那条规则的落点：列表的元信息行显示
   * 「PDF · 2.4 MB」。文件类型由当前原件后缀和 MIME 呈现，kind 仍表示来源。
   */
  mime: z.string().nullable(),
  /** 当前原件的扩展名（不含点）；替换原件后随 sourceKey 更新，仅上传件有值。 */
  fileExtension: z.string().nullable(),
  /** 原件字节数，用于元信息行。null 表示这条文档没有原件（笔记与抓取的资料） */
  size: z.number().int().nullable(),
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
   * 原件的存储 key，仅上传件有。界面需要它判断「原件这一层存不存在」
   * （只有正文时不该出现「原件」页签），以及能不能显示下载按钮。
   */
  sourceKey: z.string().nullable(),
  /**
   * 正文为空的原因。`null` 有两种含义，由 `parseSupport()` 在界面层区分：
   * 「这个格式还没有提取实现」与「本来就没有可提取的文字」。
   */
  parseError: z.string().nullable(),
  /**
   * 双链。`sources` 是这篇链接出去的，`backlinks` 是链接到这篇的
   * （`.trellis/spec/project/product.md` §5.10）。由服务端解析正文里的站内链接得到，
   * 前端不重复实现一套解析——两处实现必然有一天不一致。
   */
  links: z.object({
    sources: z.array(documentLinkSchema),
    backlinks: z.array(documentLinkSchema),
  }),
})
export type DocumentDetail = z.infer<typeof documentDetailSchema>

/**
 * 列表的 kind 过滤。**逗号分隔**而不是重复参数：`?kinds=web,file`。
 *
 * 「收集的资料」这个视图要的是「除笔记之外的全部」，那是**一组** kind——
 * 而 `kind=` 只收一个值，正是它让那个视图的过滤条件长期是空的
 * （见 `CLIP_KINDS` 的注释）。既然要多值，就一次做成多值。
 */
const kindsParamSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined || value.trim() === '') return undefined
    return value.split(',').map((item) => item.trim())
  })
  .pipe(z.array(documentKindSchema).min(1).optional())

export const documentListQuerySchema = z.object({
  kind: documentKindSchema.optional(),
  /** 多选。与 `kind` 同时给出时两个条件都生效（AND） */
  kinds: kindsParamSchema,
  status: documentStatusSchema.optional(),
  tag: z.string().optional(),
  /** 按目录过滤，含子目录 */
  folder: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>

/** 标题补全仅查现存笔记，避免编辑器为 `[[` 拉取整个知识库。 */
export const noteLookupQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
})
export type NoteLookupQuery = z.infer<typeof noteLookupQuerySchema>

export const noteLookupItemSchema = z.object({ id: z.string(), title: z.string() })
export type NoteLookupItem = z.infer<typeof noteLookupItemSchema>

/**
 * 上传一个文件的结果。
 *
 * **上传与解析是两件事，一次请求里做、但分别报告。** 解析失败不构成失败：
 * 原件已经存下、列表里看得见、能下载，只是暂时搜不到内容——
 * 这正是「嵌入失败绝不让写入失败」的同一条判断（`.trellis/spec/project/architecture.md` §4.10），
 * 只不过换成了解析。所以用 `charCount` 与 `parseError` 两个字段如实报告，
 * 而不是用一个 `ok` 把两种结果混成一个。
 */
export const fileUploadResponseSchema = z.object({
  document: documentSummarySchema,
  /** 解析出的正文字符数。0 表示原件已存但正文为空 */
  charCount: z.number().int().nonnegative(),
  /** 解析失败的原因；成功时为 null。**未持久化**——它只回答「刚才那一次」 */
  parseError: z.string().nullable(),
})
export type FileUploadResponse = z.infer<typeof fileUploadResponseSchema>

/**
 * 各视图的文档数，供左导航显示。
 * 与 `DocumentListQuery` 的 kind/status 语义一一对应，界面上的数字
 * 必须与点进去看到的条数一致。
 */
export const documentCountsSchema = z.object({
  all: z.number().int(),
})
export type DocumentCounts = z.infer<typeof documentCountsSchema>

/**
 * 建议标签。
 *
 * 整理条把这几个词直接摆成按钮（`.trellis/spec/project/product.md` §5.10）——
 * 后端早就该算它，界面上没地方显示等于白算。
 * 返回的是「从这篇内容里提取出的高频词」，不是模型生成的结果，
 * 所以它没有延迟、不花钱，可以随文档打开就请求。
 */
export const suggestedTagsResponseSchema = z.object({
  items: z.array(z.string()),
})
export type SuggestedTagsResponse = z.infer<typeof suggestedTagsResponseSchema>
