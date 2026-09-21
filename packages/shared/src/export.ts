import { z } from 'zod'

/**
 * 全量导出（`docs/PRD.md` §4 M0）。
 *
 * 为什么这是一条硬需求而不是锦上添花：这个产品的存储规则是
 * 「Markdown 文件是真相」，那就必须证明**内容可以脱离这个应用被拿走**。
 * 一个只能在自己的 UI 里读的知识库，和一个上锁的柜子没有区别。
 *
 * 两种形状各有用途：
 * - markdown：人读的，也是迁移到其它工具（Obsidian / Typora）的入口
 * - json：机读的，含元数据与对话，用于备份与再导入
 */
export const exportQuerySchema = z.object({
  format: z.enum(['markdown', 'json']).default('markdown'),
})
export type ExportQuery = z.infer<typeof exportQuerySchema>

export const exportStatsSchema = z.object({
  documents: z.number().int(),
  notes: z.number().int(),
  conversations: z.number().int(),
  /** 导出体积（字节），用于界面提示「大概多大」 */
  bytes: z.number().int(),
})
export type ExportStats = z.infer<typeof exportStatsSchema>
