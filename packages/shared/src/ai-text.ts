import { z } from 'zod'

/**
 * M1-D 的契约：摘要、AI 标签建议、内联改写（`.trellis/spec/project/product.md` §4 M1）。
 *
 * ## 一个文件、一个形状，三条能力共用
 *
 * 三个动作本质是同一件事——**把一段文本交给模型，要回一段文本**——
 * 差别只在提示词与输出怎么用。所以它们共享一个请求形状
 * （`AiTextRequest`）与一个响应形状（`AiTextResponse`），
 * 而不是三个各写一遍的端点契约。
 *
 * 各自的差异写在提示词里（`services/ai-text.ts`），不写进契约：
 * 契约描述的是「能传什么、会得到什么」，而提示词是产品文案，它会改。
 */

/** 内联改写的四种动作（与编辑器选区工具条的按钮一一对应） */
export const rewriteActionSchema = z.enum(['rewrite', 'translate', 'shorten', 'expand'])
export type RewriteAction = z.infer<typeof rewriteActionSchema>

/**
 * 一次「文本进、文本出」的模型调用。
 *
 * `documentId` 是**可选的**：带了就有记账归属（`usage_log.ref_id`），
 * 没带也能用（例如编辑器里对一段尚未保存的文字做改写）。
 * 不给它编一个假 id——账本里的归属错了比空着更糟。
 */
export const aiTextRequestSchema = z.object({
  /** 待处理的文本。上限按「一次模型调用能吞下的合理量」定，不是技术硬限制 */
  text: z.string().min(1, '没有可处理的文本').max(20000, '一次最多处理 2 万字'),
  /** 摘要 / 标签建议用不到它；改写用它区分动作 */
  action: rewriteActionSchema.optional(),
  /** 改写时的额外要求（如「面向新手」）。自由文本，作为补充指令进提示词 */
  instruction: z.string().max(500).optional(),
  documentId: z.string().optional(),
})
export type AiTextRequest = z.infer<typeof aiTextRequestSchema>

export const aiTextResponseSchema = z.object({
  /**
   * 模型产出的文本。**三条能力各自解释它**：
   * 摘要 = 一段话；改写 = 改写后的原文；标签建议 = 换行分隔的标签
   */
  text: z.string(),
  /** 这次用了哪个模型。界面显示「由 X 生成」——用户需要知道是谁说的 */
  model: z.string(),
  /** 是否走了模型。false = 没配模型，`text` 里是说明而不是结果 */
  usedModel: z.boolean(),
})
export type AiTextResponse = z.infer<typeof aiTextResponseSchema>

/**
 * AI 标签建议的响应。
 *
 * 与统计版（`/:id/suggested-tags`，jieba 词频）**共用一个端点名但语义不同**：
 * 那一条是 M0 的「整理」，这一条是 M1 的「AI 建议」。两条都保留是因为
 * 它们回答的问题不同——统计版零成本、随开随算；AI 版要花钱、要用户点一下。
 */
export const aiTagsResponseSchema = z.object({
  tags: z.array(z.string()),
  model: z.string(),
  usedModel: z.boolean(),
})
export type AiTagsResponse = z.infer<typeof aiTagsResponseSchema>
