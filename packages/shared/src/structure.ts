import { z } from 'zod'

/**
 * 目录树与标签 —— 「归属」与「横切」两种组织方式。
 *
 * 见 `.trellis/spec/project/product.md` §5.3：目录树管归属（一个文档只能在一个位置），
 * 标签管横切（一个文档可挂多个）。两者走同一套过滤逻辑，只是筛选条件不同，
 * 避免变成两套代码。
 */

/**
 * 目录节点（D-068 起为**实体**）。
 *
 * 曾经由文档的 folder 字段纯派生、不建表——那条决策随「目录要在侧边栏
 * 直接增删改移」退役：空目录没有文档、在派生模型里无处存在。现在
 * `folders` 表是**树结构的唯一真相**，`documents.folder` 是**归档指派**
 * （冗余路径串，过滤与统计不走树）；两边的一致性由服务端维护——
 * 指派到新路径时自动补建祖先行（mkdir -p），改/删目录时批量重写指派。
 */
export interface FolderNode {
  /** 完整路径，如 `技术/前端/React`。用它作为筛选条件与「归入目录」的目标 */
  path: string
  /** 展示用的末段名，如 `React` */
  name: string
  /** 该目录（含子目录）下的文档数 */
  count: number
  /** 知识库描述（D-078）。创建时填写，可为空串 */
  description: string | null
  /** 知识库图标的键（FOLDER_ICONS 之一）。null = 未选，树里回退默认文件夹图标 */
  icon: string | null
  /**
   * 知识库短码（如 `7ZZRF7`）。只有**顶层**（知识库自己）在界面上使用；
   * 子目录也生成一份，是为了「子目录被提升为顶层」时不用补号。
   * 建库时生成、改名/移动不变——路径就是身份，短码只是给人念的别名。
   */
  code: string | null
  children: FolderNode[]
}

export const folderNodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    count: z.number().int(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    code: z.string().nullable(),
    children: z.array(folderNodeSchema),
  }),
)

export const folderListResponseSchema = z.object({
  items: z.array(folderNodeSchema),
})
export type FolderListResponse = z.infer<typeof folderListResponseSchema>

/**
 * 目录路径。与 `documents.ts` 里归档指派的 folder 同一条规则：
 * 不能含空段、不能越出 vault（`..`）。
 */
export const folderPathSchema = z
  .string()
  .trim()
  .min(1, '目录名不能为空')
  .max(200)
  .refine((value) => !value.split('/').some((segment) => segment === ''), {
    message: '目录路径不能有连续的 /',
  })
  .refine((value) => !value.split('/').some((segment) => segment === '..'), {
    message: '目录路径不能包含 ..',
  })

/** 新建目录。路径含父级（mkdir -p 语义），如 `技术/前端` */
/**
 * 知识库图标的键与标签（D-078）。键落库（`folders.icon`），标签给选择器
 * 与读屏；放在 shared 是因为服务端要按它校验创建参数——只此一份口径。
 */
export const FOLDER_ICONS = [
  { key: 'humanities', label: '人文' },
  { key: 'history', label: '历史' },
  { key: 'social', label: '社科' },
  { key: 'law', label: '法律' },
  { key: 'science', label: '科学' },
  { key: 'natural', label: '理科' },
  { key: 'tech', label: '技术' },
  { key: 'computer', label: '计算机' },
  { key: 'engineering', label: '工程' },
  { key: 'education', label: '教育' },
  { key: 'business', label: '商业' },
  { key: 'art', label: '艺术' },
  { key: 'language', label: '语言' },
] as const

export const FOLDER_ICON_KEYS = [
  'humanities',
  'history',
  'social',
  'law',
  'science',
  'natural',
  'tech',
  'computer',
  'engineering',
  'education',
  'business',
  'art',
  'language',
] as const

export type FolderIconKey = (typeof FOLDER_ICON_KEYS)[number]

export const folderCreateSchema = z.object({
  path: folderPathSchema,
  /** 知识库描述。截断到 2000 字由服务端兜底，前端用 maxLength 先拦 */
  description: z.string().max(2000).optional(),
  /** 图标键（FOLDER_ICONS 之一）；不传 = 未选 */
  icon: z.enum(FOLDER_ICON_KEYS).optional(),
})

/**
 * 改名与移动是同一个操作：把 `from` 子树整体搬到 `to`。
 * `技术/前端 → 技术/后端` 是改名，`技术/前端 → 归档/前端` 是移动。
 */
export const folderMoveSchema = z.object({
  from: folderPathSchema,
  to: folderPathSchema,
  /** Omitted preserves the description; an empty string clears it. */
  description: z.string().max(2000).optional(),
})

export const folderDeleteSchema = z.object({ path: folderPathSchema })

/** 改名 / 移动的结果：受影响的文档数（含子目录），界面据此提示 */
export const folderMoveResponseSchema = z.object({
  moved: z.number().int(),
  /** Additive fields: older servers only return moved. */
  path: folderPathSchema.optional(),
  description: z.string().nullable().optional(),
})
export type FolderMoveResponse = z.infer<typeof folderMoveResponseSchema>

/** FOLDER_UPDATE_FAILED details. Never blindly retry an incompletely restored move. */
export const folderUpdateRecoverySchema = z.object({
  code: z.string().nullable(),
  path: folderPathSchema.nullable(),
  description: z.string().nullable(),
  retrySafe: z.boolean(),
})
export type FolderUpdateRecovery = z.infer<typeof folderUpdateRecoverySchema>

/** 删除目录的结果：目录里原有几篇文档被移出（文档本身不删） */
export const folderDeleteResponseSchema = z.object({ cleared: z.number().int() })
export type FolderDeleteResponse = z.infer<typeof folderDeleteResponseSchema>

/** 标签云：名字 + 引用它的文档数，按数量降序 */
export const tagListResponseSchema = z.object({
  items: z.array(z.object({ name: z.string(), count: z.number().int() })),
})
export type TagListResponse = z.infer<typeof tagListResponseSchema>
