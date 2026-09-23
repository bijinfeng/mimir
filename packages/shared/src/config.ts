import { z } from 'zod'

/**
 * 生效中的运行时配置（只读）。
 *
 * 设置页的形状是「插件注册表的人类可读视图」（`docs/TECH.md` §7.4）：
 * 每一行显示的必须是**服务端真正在用的值**。早期版本把这些值硬编码在
 * 前端，于是 `MODEL_CHAT_MODEL` 一改，设置页就显示一个不存在的模型名——
 * 这与「画一个存不进去的假表单」是同一类问题：用户拿它做判断，它却在说谎。
 *
 * **绝不包含 `MODEL_API_KEY`。** 密钥只存在服务端，不下发浏览器
 * （`apps/web/AGENTS.md`）。这个类型里所有字段都是可以公开的：
 * baseURL 与模型名不是秘密，泄漏它们不构成风险。
 */
export const runtimeConfigSchema = z.object({
  models: z.object({
    /** 配了 key 与 baseURL 才是 true。false 时问答走「只检索」路径 */
    configured: z.boolean(),
    provider: z.string(),
    baseUrl: z.string(),
    chat: z.string(),
    reasoning: z.string(),
  }),
  retrieval: z.object({
    /** 融合公式 weight/(k+rank) 里的 k */
    rrfK: z.number().int(),
    /** 每个通道各取多少候选再融合 */
    perLegLimit: z.number().int(),
    /** 已注册的通道与权重。顺序即注册顺序 */
    legs: z.array(z.object({ name: z.string(), weight: z.number() })),
  }),
})
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>
