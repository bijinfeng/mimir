import { z } from 'zod'
import { MODEL_ROLES } from './seams.js'

/**
 * 运行时配置的传输契约：设置、插件、模型就绪状态。**只读，密钥绝不出现在这里。**
 *
 * 设置页的形状是「插件注册表的人类可读视图」（`docs/TECH.md` §7.7）：
 * 每一行显示的必须是**服务端真正在用的值**。早期版本把这些值硬编码在
 * 前端，于是 `MODEL_CHAT_MODEL` 一改，设置页就显示一个不存在的模型名——
 * 这与「画一个存不进去的假表单」是同一类问题：用户拿它做判断，它却在说谎。
 *
 * 密钥只存在服务端并加密落库，下发前剔除（`docs/TECH.md` §7.6）。
 * 秘密类键在协议里只有一个 `configured` 布尔位，值一个字都不给——
 * 连密文也不给：那东西没有用处，却会让「密钥到底有没有下发」这个问题
 * 变得需要读服务端代码才能回答。
 */

/* ── 设置 ─────────────────────────────────────────────── */

export const settingTypeSchema = z.enum(['string', 'number', 'boolean', 'secret'])
export type SettingType = z.infer<typeof settingTypeSchema>

/**
 * 值的来源。**这是界面上最有信息量的一列**：用户需要知道
 * 「我现在看到的是我改过的，还是环境变量里的，还是没人配过的默认值」。
 */
export const settingSourceSchema = z.enum(['settings', 'env', 'default'])
export type SettingSource = z.infer<typeof settingSourceSchema>

/** 改了之后要重做什么。`none` 之外的值意味着界面上要给出重建入口 */
export const settingRebuildSchema = z.enum(['none', 'chunks', 'embeddings'])
export type SettingRebuild = z.infer<typeof settingRebuildSchema>

/**
 * 一个可配置键的**完整定义**。它既是设置页的一行，也是写入时的校验规则。
 *
 * ## 为什么校验函数跟着键走，而不是写在写入端点上
 *
 * 两处都要校验：PATCH 端点（写入时）与解析层（读环境变量时——`.env` 里的
 * 值也可能是坏的）。把规则放在键的定义里，两者用的是同一份；
 * 各写一遍必然漂移，而漂移的表现是「存进去了，但读出来是另一个值」。
 *
 * ## 插件可以自带键
 *
 * `PluginDeclaration.params` 里的键会被并进这份表，所以加一个检索通道
 * 不需要回来改核心的键表——**加一个实现＝加一个文件**这条规则在配置层也成立。
 * 插件的键也走同一套下拉/校验/来源显示，没有二等公民。
 */
export interface SettingSpec {
  key: string
  label: string
  description: string
  /** 设置页的分区，与 `?section=` 一致 */
  group: string
  type: SettingType
  /** 对应的环境变量名。没有部署级对应物的键是 null */
  envName: string | null
  defaultValue: string | number | boolean
  /** 改了要不要重做某件事。`none` 之外的值意味着界面上要给出重建入口 */
  rebuild: SettingRebuild
  /** 默认 true。置 false 的键在界面上只读显示（`description` 说明原因） */
  writable?: boolean
  /** 值已按 type 转换过。返回错误信息表示拒绝，返回 null 表示通过 */
  validate?: (value: string | number | boolean) => string | null
}

export const settingEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  group: z.string(),
  type: settingTypeSchema,
  /**
   * 当前生效值。秘密类恒为 `null`——见 `configured`。
   *
   * 用联合类型而不是 `string`：布尔开关在界面上是 Switch，数字是 InputNumber，
   * 全部转成字符串再转回来是多一层会出错的地方。
   */
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  /** 秘密类：服务端是否已存有一个能解开的值 */
  configured: z.boolean(),
  source: settingSourceSchema,
  /** 对应的环境变量名。界面上显示它，用户才知道去 `.env` 里改什么 */
  envName: z.string().nullable(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]),
  /** 是否可写。false 时界面只读显示，`description` 里说明原因 */
  writable: z.boolean(),
  rebuild: settingRebuildSchema,
  /**
   * 解析过程中遇到的问题：环境变量值不合法、密钥解不开。
   * 非空时界面**必须**显示它——静默回落会让人以为配置没生效是自己的错。
   */
  problem: z.string().nullable(),
})
export type SettingEntry = z.infer<typeof settingEntrySchema>

/**
 * 写入设置的请求。
 *
 * `null` 表示**删除覆盖**，回落到环境变量或默认值——那是一个真实的动作，
 * 不是「清空输入框」的副作用。界面上每行都有这个按钮，
 * 而不是让用户猜「改成空串行不行」（空串与非空串的语义差异是这类界面上
 * 最常见的困惑）。
 */
export const updateSettingsInputSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>

export const updateSettingsResponseSchema = z.object({
  ok: z.boolean(),
  /** 被拒绝的键与原因。整批拒绝时返回，前端据此在对应字段上标红 */
  issues: z.array(z.object({ key: z.string(), message: z.string() })).default([]),
})
export type UpdateSettingsResponse = z.infer<typeof updateSettingsResponseSchema>

/* ── 插件 ─────────────────────────────────────────────── */

export const pluginSeamSchema = z.enum(['capturer', 'parser', 'leg', 'provider'])
export type PluginSeam = z.infer<typeof pluginSeamSchema>

/**
 * 一个实现能不能干活。**四态，不是布尔。**
 *
 * `planned`（代码还没有）与 `unavailable`（代码在但干不了活）对用户的含义
 * 完全不同：前者是「将来会有」，后者是「现在缺个东西，补上就能用」。
 * 用布尔表达会让「待开发」的项目显示成红色的「不可用」——那是在说它坏了。
 *
 * 状态由 core 从插件声明的 `requires` / `unavailable()` 算出来
 * （见 `plugin.ts`），不是各实现自己编的字符串。
 */
export const pluginStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('active') }),
  z.object({ kind: z.literal('needs-config'), reason: z.string() }),
  z.object({ kind: z.literal('unavailable'), reason: z.string() }),
  z.object({ kind: z.literal('planned'), note: z.string() }),
])
export type PluginStatus = z.infer<typeof pluginStatusSchema>

/** 传输层的插件条目：插件声明 + core 算好的状态 */
export const pluginDescriptorSchema = z.object({
  seam: pluginSeamSchema,
  id: z.string(),
  name: z.string(),
  description: z.string(),
  file: z.string(),
  configKeys: z.array(z.string()),
  status: pluginStatusSchema,
})
export type PluginDescriptor = z.infer<typeof pluginDescriptorSchema>

/* ── 模型角色 ─────────────────────────────────────────── */

export const modelRoleStatusSchema = z.object({
  role: z.string(),
  label: z.string(),
  /** 这个角色当前用哪个模型名。未配置时为空串 */
  model: z.string(),
  /** 能不能干活。embed 为 false 时向量通道不注册 */
  ready: z.boolean(),
  /** 不能干活时的原因。ready 为 true 时是 null */
  reason: z.string().nullable(),
})
export type ModelRoleStatus = z.infer<typeof modelRoleStatusSchema>

/* ── 顶层 ─────────────────────────────────────────────── */

/**
 * 探测（真实调用一次）的结果。**不进数据库**：
 * 它是「刚才通不通」的观测，不是配置。重启即回到「未测试」，
 * 比留一个可能过期的「可用」诚实（`docs/TECH.md` §7.8）。
 */
export const probeResultSchema = z.object({
  role: z.string(),
  ok: z.boolean(),
  message: z.string(),
  /** 服务端完成探测的时刻（ISO），界面显示「刚刚」/「3 分钟前」 */
  at: z.string(),
})
export type ProbeResult = z.infer<typeof probeResultSchema>

/** 探测请求：只给角色名，密钥由服务端从库里取——密钥不回浏览器也不回环一趟 */
export const probeRequestSchema = z.object({
  role: z.string(),
})
export type ProbeRequest = z.infer<typeof probeRequestSchema>

export const runtimeConfigSchema = z.object({
  /** 所有注册在 spec 里的键，含未设置的那些——界面要显示它们才能让用户去设 */
  settings: z.array(settingEntrySchema),
  plugins: z.array(pluginDescriptorSchema),
  models: z.array(modelRoleStatusSchema),
  /** 最近一次探测结果，按角色 */
  probes: z.array(probeResultSchema),
})
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>

/**
 * 模型角色的中文名。界面上显示它而不是 `chat` / `embed`——
 * 那一列是给用户做判断的，不是给开发者看的。
 */
export const MODEL_ROLE_LABELS: Record<(typeof MODEL_ROLES)[number], string> = {
  chat: '对话',
  reasoning: '深度思考',
  summarize: '摘要',
  embed: '向量化',
}
