import { z } from 'zod'

/**
 * 运行时配置的传输契约：设置、插件、模型配置。
 * **密钥绝不出现在这里**——包括供应商列表里的每一把。
 *
 * ## 三块的分工
 *
 * | 块 | 是什么 |
 * |---|---|
 * | `settings` | 标量配置项（键 → 值 + 来源） |
 * | `plugins` | 各接缝的实现清单与状态 |
 * | `modelConfig` | **模型域**：供应商列表 + 角色绑定 + 预设目录 |
 *
 * 模型配置为什么不摊平成一堆 `model.*` 标量键：供应商是一个**集合**
 * （每家一个 baseURL 与一把密钥），而标量键表达不了集合。
 * 摊平的后果见 `docs/RESEARCH.md`：某个成熟产品用「按位置对齐的三个数组」
 * 存多家供应商，删除时要手工重排下标。
 */

/* ── 设置 ─────────────────────────────────────────────── */

/**
 * 值的类型。
 *
 * `json` 是给**结构化配置**用的（供应商列表、角色绑定）：它们的形状是
 * 对象/数组，塞进字符串会丢失类型，也让校验无处可放。
 * json 值的密钥处理走 `SettingSpec.json` 的两个钩子，见那里。
 */
export const settingTypeSchema = z.enum(['string', 'number', 'boolean', 'secret', 'json'])
export type SettingType = z.infer<typeof settingTypeSchema>

export const settingSourceSchema = z.enum(['settings', 'env', 'default'])
export type SettingSource = z.infer<typeof settingSourceSchema>

export const settingRebuildSchema = z.enum(['none', 'chunks', 'embeddings'])
export type SettingRebuild = z.infer<typeof settingRebuildSchema>

/** json 值：任意可 JSON 化的结构。校验由键自己的钩子负责 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/** 一个键的值。标量、秘密类（读时为 null）或结构化 */
export type SettingValue = string | number | boolean | JsonValue | null

/**
 * json 类键的两个钩子。**密钥藏在结构化值里时，这两个钩子就是它的边界。**
 *
 * 为什么需要它们：供应商列表里每家一把密钥，而密钥
 * **既不能下发浏览器，也不能在用户改别的字段时被清掉**。
 * 前者要求读的时候摘掉，后者要求写的时候合回来。
 *
 * 把这两件事交给**拥有那个形状的插件**（而不是让设置层去猜哪一层是密钥）：
 * 设置层保持通用，插件用自己知道的语义写两个纯函数。
 */
export interface JsonSettingHooks {
  /** 服务端内部值 → 下发浏览器的形状。密钥只留一个「有没有」的布尔位 */
  toWire: (internal: unknown) => unknown
  /**
   * 浏览器提交的形状 → 要存的服务端内部值。
   *
   * `existing` 是已存的内部值：用户只改了名字、没重填密钥时，
   * 必须把已存的那把原样保留——否则「改个名字」会把密钥清掉。
   *
   * 抛 `Error` 表示拒绝这次写入，消息会出现在 400 的 issues 里。
   */
  fromWire: (incoming: unknown, existing: unknown) => unknown
}

/**
 * 一个可配置键的**完整定义**。它既是设置页的一行，也是写入时的校验规则。
 *
 * 校验跟着键走而不是写在写入端点上：两处都要校验（写入时、读环境变量时），
 * 各写一遍必然漂移，漂移的表现是「存进去了，但读出来是另一个值」。
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
  defaultValue: SettingValue
  rebuild: SettingRebuild
  /** 默认 true。置 false 的键在界面上只读显示（`description` 说明原因） */
  writable?: boolean
  /**
   * 默认 false。置 true 的键**不出现在设置列表里**，但仍可被读取。
   * 用途只有一个：迁移时要读、之后再不该有人填的旧键。
   */
  hidden?: boolean
  /** json 类键的密钥边界。非 json 类型不需要它 */
  json?: JsonSettingHooks
  /** 值已按 type 转换过。返回错误信息表示拒绝，返回 null 表示通过 */
  validate?: (value: SettingValue) => string | null
}

/** 下发的设置条目。值按类型可能是标量、结构化值或 null（秘密类） */
export const settingEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  group: z.string(),
  type: settingTypeSchema,
  /** 当前生效值。秘密类恒为 `null`——见 `configured` */
  value: z.unknown().nullable(),
  /** 秘密类：服务端是否已存有一个能解开的值 */
  configured: z.boolean(),
  source: settingSourceSchema,
  envName: z.string().nullable(),
  defaultValue: z.unknown(),
  writable: z.boolean(),
  rebuild: settingRebuildSchema,
  /** 解析时的问题（环境变量不合法、密钥解不开）。非空时界面必须显示 */
  problem: z.string().nullable(),
})
export type SettingEntry = z.infer<typeof settingEntrySchema>

/**
 * 写入设置的请求。
 *
 * `null` 表示**删除覆盖**，回落到环境变量或默认值——那是一个真实的动作，
 * 不是「清空输入框」的副作用。
 */
export const updateSettingsInputSchema = z.object({
  values: z.record(z.string(), z.unknown().nullable()),
})
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>

export const updateSettingsResponseSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({ key: z.string(), message: z.string() })).default([]),
})
export type UpdateSettingsResponse = z.infer<typeof updateSettingsResponseSchema>

/* ── 插件 ─────────────────────────────────────────────── */

export const pluginSeamSchema = z.enum(['capturer', 'parser', 'leg', 'provider', 'storage'])
export type PluginSeam = z.infer<typeof pluginSeamSchema>

/**
 * 一个实现能不能干活。**四态，不是布尔。**
 *
 * `planned`（代码还没有）与 `unavailable`（代码在但干不了活）对用户的含义
 * 完全不同：前者是「将来会有」，后者是「现在缺个东西，补上就能用」。
 */
export const pluginStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('active') }),
  z.object({ kind: z.literal('needs-config'), reason: z.string() }),
  z.object({ kind: z.literal('unavailable'), reason: z.string() }),
  z.object({ kind: z.literal('planned'), note: z.string() }),
])
export type PluginStatus = z.infer<typeof pluginStatusSchema>

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

/* ── 模型域 ───────────────────────────────────────────── */

/**
 * 模型角色。**按任务分角色，而不是按服务商分**——
 * 「摘要换一个便宜模型」是最直接的成本控制手段（`docs/TECH.md` §5.7）。
 */
export const MODEL_ROLES = ['chat', 'reasoning', 'summarize', 'embed'] as const
export type ModelRole = (typeof MODEL_ROLES)[number]

export const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  chat: '对话',
  reasoning: '深度思考',
  summarize: '摘要',
  embed: '向量化',
}

/** 模型条目从哪来。它决定了界面上能不能删、刷新时会不会被覆盖 */
export const modelSourceSchema = z.enum(['preset', 'fetched', 'manual'])
export type ModelSource = z.infer<typeof modelSourceSchema>

export const providerModelSchema = z.object({
  id: z.string(),
  source: modelSourceSchema,
})
export type ProviderModel = z.infer<typeof providerModelSchema>

/**
 * 一个**供应商实例**（下发形状）。
 *
 * 一次配置 = 一个实例，所以同一家可以配两次（两个 DeepSeek 账号、
 * 或者一个云端一个本地）——它们各有自己的密钥与模型列表。
 *
 * **没有 `apiKey` 字段**：密钥不出服务端，这里只有一个 `hasKey` 布尔位。
 * 这与标量密钥键（`configured`）是同一条规则，只是形状不同。
 */
export const providerInstanceSchema = z.object({
  id: z.string(),
  /** 它是从哪个预设建的。`custom` 表示用户全手填 */
  preset: z.string(),
  /** 显示名。用户可改，重复也无所谓（id 才是身份） */
  name: z.string(),
  /** 用哪个适配器族。对应 `provider` 接缝里某个实现的 id */
  family: z.string(),
  baseUrl: z.string(),
  hasKey: z.boolean(),
  models: z.array(providerModelSchema),
  /** 上次拉取模型的时刻。`null` 表示从没拉过（用的是预设建议的列表）*/
  modelsFetchedAt: z.string().nullable(),
})
export type ProviderInstance = z.infer<typeof providerInstanceSchema>

/**
 * 预设供应商 = **目录里的一行数据**，不是代码。
 *
 * 加一家的做法：往预设表里加一行。不需要写适配器——只要它说 OpenAI 兼容
 * 协议，同一个 `openai-compatible` 适配器族就能接住它
 * （`docs/RESEARCH.md`：四个成熟产品都有这份目录，最大的有 90 项）。
 */
export const providerPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string(),
  baseUrl: z.string(),
  /** 预设建议的模型。**没有网络时也能建起一个能用的配置** */
  models: z.array(z.string()),
  /** 这家能不能从端点拉模型列表（OpenAI 兼容的 `/models`）*/
  canFetchModels: z.boolean(),
  /** 这家特有的坑。界面上直接显示，粘贴前就把话说清楚 */
  note: z.string().nullable(),
  /** 常用的排前面（选择器按它排序）*/
  popular: z.boolean(),
})
export type ProviderPreset = z.infer<typeof providerPresetSchema>

/**
 * 角色绑定：**指向「哪个供应商的哪个模型」**，不是一个裸模型名。
 *
 * 裸模型名的问题在多供应商下立刻暴露：两家都有 `glm-4` 时无法区分，
 * 于是要么禁止重名，要么给模型名加前缀（`docs/RESEARCH.md` 记了一个
 * 因裸 id 寻址而不得不发明前缀的实例）。绑定成一对，这个问题不存在。
 */
export const roleBindingSchema = z.object({
  providerId: z.string(),
  model: z.string(),
})
export type RoleBinding = z.infer<typeof roleBindingSchema>

/** 一个角色的当前状态。`ready` 为假时 `reason` 必须说清缺什么 */
export const modelRoleStatusSchema = z.object({
  role: z.string(),
  label: z.string(),
  /** 绑定的供应商。未绑定时为 null（摘要允许留空，会回落到对话）*/
  providerId: z.string().nullable(),
  providerName: z.string().nullable(),
  model: z.string(),
  ready: z.boolean(),
  reason: z.string().nullable(),
})
export type ModelRoleStatus = z.infer<typeof modelRoleStatusSchema>

/** 模型配置全貌。设置页的「模型」分区整块由它渲染 */
export const modelConfigSchema = z.object({
  providers: z.array(providerInstanceSchema),
  roles: z.array(modelRoleStatusSchema),
  /** 预设目录（静态数据）*/
  presets: z.array(providerPresetSchema),
})
export type ModelConfig = z.infer<typeof modelConfigSchema>

/* ── 探测 ─────────────────────────────────────────────── */

/**
 * 探测结果。**不进数据库**：它是「刚才通不通」的观测，不是配置。
 * 重启即回到「未测试」，比留一个可能过期的「可用」诚实（`docs/TECH.md` §7.8）。
 */
export const probeResultSchema = z.object({
  /** 角色名（角色级探测）或供应商 id（供应商级探测）*/
  target: z.string(),
  ok: z.boolean(),
  message: z.string(),
  /** 服务端完成探测的时刻（ISO）*/
  at: z.string(),
  /** 探测耗时。给用户判断「是慢还是不通」*/
  tookMs: z.number().int().nullable(),
})
export type ProbeResult = z.infer<typeof probeResultSchema>

export const probeRequestSchema = z.object({
  /** 供应商级探测：传 providerId（[+ modelId]）*/
  providerId: z.string(),
  /** 不传时用它模型列表里第一个非 embedding 的模型 */
  modelId: z.string().optional(),
})
export type ProbeRequest = z.infer<typeof probeRequestSchema>

/* ── 顶层 ─────────────────────────────────────────────── */

export const runtimeConfigSchema = z.object({
  settings: z.array(settingEntrySchema),
  plugins: z.array(pluginDescriptorSchema),
  modelConfig: modelConfigSchema,
  probes: z.array(probeResultSchema),
})
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>
