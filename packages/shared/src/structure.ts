import { z } from 'zod'

/**
 * 目录树与标签 —— 「归属」与「横切」两种组织方式。
 *
 * 见 `docs/PRD.md` §5.3：目录树管归属（一个文档只能在一个位置），
 * 标签管横切（一个文档可挂多个）。两者走同一套过滤逻辑，只是筛选条件不同，
 * 避免变成两套代码。
 */

/**
 * 目录节点由**文档的 folder 字段派生**，不单独建表。
 *
 * 为什么：目录是文件系统的形状，而「文件是真相」是本项目的第一条规则。
 * 单独建一张 folders 表会立刻产生两个真相源——表里有一个目录、
 * vault 里没有对应文件夹，或者反过来。派生就不会不同步。
 */
export interface FolderNode {
  /** 完整路径，如 `技术/前端/React`。用它作为筛选条件与「归入目录」的目标 */
  path: string
  /** 展示用的末段名，如 `React` */
  name: string
  /** 该目录（含子目录）下的文档数 */
  count: number
  children: FolderNode[]
}

export const folderNodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    count: z.number().int(),
    children: z.array(folderNodeSchema),
  }),
)

export const folderListResponseSchema = z.object({
  items: z.array(folderNodeSchema),
})
export type FolderListResponse = z.infer<typeof folderListResponseSchema>

/** 标签云：名字 + 引用它的文档数，按数量降序 */
export const tagListResponseSchema = z.object({
  items: z.array(z.object({ name: z.string(), count: z.number().int() })),
})
export type TagListResponse = z.infer<typeof tagListResponseSchema>
