import { randomUUID } from 'node:crypto'
import {
  MODEL_PURPOSES,
  MODEL_ROLE_PURPOSES,
  inferModelPurposes,
  type ModelRole,
  type ModelPurpose,
  type ProviderInstance,
  type ProviderModel,
  type ProviderPreset,
  type RoleBinding,
  type SecretCodec,
} from '@mimir/shared'
import { findPreset, inferPresetId } from './presets.js'

/**
 * 供应商实例的存取：**加密、脱敏、密钥合并、模型用途归一化**。
 *
 * 这个文件是模型配置里最容易出错的一处，所以它只做这一件事，
 * 且有独立的测试（`instances.test.ts`）。
 *
 * ## 落库形状 vs 下发形状
 *
 * | | 落库（内部）| 下发（`ProviderInstance`）|
 * |---|---|---|
 * | 密钥 | `apiKey: 'enc:v1:...'` | 没有这个字段 |
 * | 有没有密钥 | —— | `hasKey: boolean` |
 *
 * 两个形状的差异必须**只在这两个函数里**发生（`toInternal` / `toWire`）。
 * 散在别处就会出现「某个端点把密文发出去了」而没有任何报错。
 */

/**
 * 内部形状：落库的那一份。
 *
 * 它比 `ProviderInstance` 多一个 `apiKey`（密文）。两者的字段名刻意一致，
 * 这样 `toWire` 是纯粹的「删一个字段 + 加一个布尔位」，
 * 不需要维护一张字段映射表（映射表会随字段增删而漂移）。
 */
export interface InternalProvider extends Omit<ProviderInstance, 'hasKey'> {
  /** 密文（`enc:v1:` 前缀）。空串表示没配 */
  apiKey: string
}

export interface InternalRoleBinding extends RoleBinding {}

export interface InternalModelConfig {
  providers: InternalProvider[]
  /** 角色 → 绑定。`null` 表示留空（摘要允许留空，会回落到对话）*/
  roles: Partial<Record<ModelRole, InternalRoleBinding | null>>
  /**
   * 已废弃的键值，迁移时读一次就丢弃。
   *
   * 保留它是为了让老配置能平滑转换（`.trellis/spec/project/decisions.md` D-039）：
   * 用户升级后不该重新填一遍密钥。迁移完成后这里会被清空。
   */
  migratedFrom?: { baseUrl?: string; apiKey?: string; chatModel?: string }
}

export function emptyModelConfig(): InternalModelConfig {
  return { providers: [], roles: {} }
}

/* ── 落库 → 下发（脱敏）──────────────────────────────── */

/**
 * 摘掉密钥。
 *
 * ## 逐字段构造（白名单），不用解构 + 展开
 *
 * 解构写法（`const { apiKey, ...rest } = provider`）看起来更简洁，
 * 但它有个隐患：**将来新增的密钥类字段会自动落进 `rest` 并下发出去**。
 * 白名单的失败方向是安全的——忘了加一个字段 = 界面上少一个字段，
 * 而不是密钥泄漏。
 *
 * ## 只有这一处实现
 *
 * `toWire`（`overview()` 走它）只调这一个函数。两份「哪些字段下发」的
 * 清单必然漂移，而那种漂移的症状是密钥泄漏，且没有任何报错。
 */
export function wireProviders(providers: InternalProvider[]): ProviderInstance[] {
  return providers.map((provider) => ({
    id: provider.id,
    preset: provider.preset,
    name: provider.name,
    family: provider.family,
    baseUrl: provider.baseUrl,
    hasKey: provider.apiKey !== '',
    models: provider.models,
    modelsFetchedAt: provider.modelsFetchedAt,
  }))
}

export function toWire(internal: InternalModelConfig): unknown {
  return {
    providers: wireProviders(internal.providers),
    roles: internal.roles,
    // migratedFrom 不下发：它是迁移的中间产物（里面可能有旧密钥），
    // 界面上没有任何用途
  }
}

/* ── 下发 → 落库（合并密钥）──────────────────────────── */

export interface MergeResult {
  config: InternalModelConfig
  /** 提交的供应商里有几个 id 在已存配置里找不到（用户在两个标签页里各改了一半）*/
  unknownProviderIds: string[]
}

/**
 * 把浏览器提交的形状合回内部形状。
 *
 * ## 密钥必须按 id 合并，不能整体覆盖
 *
 * 界面拿不到密钥，所以它提交的每个供应商都不带 `apiKey`。有两种情况要分开：
 *
 *  1. **已存在的供应商**（id 匹配上）：保留已存的那把密钥。
 *     否则用户改一下名字就把密钥清掉了，而界面上完全看不出发生了什么
 *  2. **新增的供应商**：密钥来自 `keyDrafts`（用户在输入框里新填的那把）
 *
 * 所以提交的形状里额外带一个 `keyDrafts: Record<providerId, string>`——
 * 只装「这次新填的密钥」，不装已存的那些。
 *
 * ## 明确清除密钥
 *
 * 用户要清掉一把密钥时，在 `keyDrafts` 里传空串。空串与「没传」必须区分开：
 * 前者是「删掉它」，后者是「别动它」。
 */
export function fromWire(input: unknown, existing: unknown, cipher: SecretCodec): MergeResult {
  const incoming = (input ?? {}) as {
    providers?: unknown
    roles?: unknown
    keyDrafts?: unknown
  }

  const existingConfig = coerceExisting(existing)

  if (!Array.isArray(incoming.providers)) {
    throw new Error('providers 必须是数组')
  }

  const keyDrafts = (incoming.keyDrafts ?? {}) as Record<string, unknown>
  const byId = new Map(existingConfig.providers.map((provider) => [provider.id, provider]))
  const unknownProviderIds: string[] = []
  const providers: InternalProvider[] = []

  for (const raw of incoming.providers) {
    const item = raw as Partial<ProviderInstance> & { id?: unknown }

    if (typeof item.id !== 'string' || item.id === '') {
      throw new Error('每个供应商都要有一个 id')
    }
    if (typeof item.baseUrl !== 'string' || item.baseUrl.trim() === '') {
      throw new Error(`供应商 ${item.name ?? item.id} 缺少接口地址`)
    }
    if (!/^https?:\/\//i.test(item.baseUrl.trim())) {
      throw new Error(`供应商 ${item.name ?? item.id} 的接口地址必须以 http:// 或 https:// 开头`)
    }

    const before = byId.get(item.id)
    if (!before && !(item.id in keyDrafts)) {
      // 新增的供应商必须有密钥。没有的话它连一次请求都发不出去，
      // 而界面上会显示成一个「已配置」的卡片
      unknownProviderIds.push(item.id)
    }

    providers.push({
      id: item.id,
      preset: typeof item.preset === 'string' ? item.preset : inferPresetId(item.baseUrl),
      name: typeof item.name === 'string' && item.name.trim() !== '' ? item.name.trim() : item.id,
      family: typeof item.family === 'string' ? item.family : 'openai-compatible',
      baseUrl: item.baseUrl.trim().replace(/\/+$/, ''),
      apiKey: resolveApiKey(item.id, before?.apiKey ?? '', keyDrafts, cipher),
      models: normalizeModels(item.models),
      modelsFetchedAt: typeof item.modelsFetchedAt === 'string' ? item.modelsFetchedAt : null,
    })
  }

  return {
    config: {
      providers,
      roles: normalizeRoles(incoming.roles, providers),
      ...(existingConfig.migratedFrom ? { migratedFrom: existingConfig.migratedFrom } : {}),
    },
    unknownProviderIds,
  }
}

/** 密钥的三种来源：这次新填的 > 已存的 > 空 */
function resolveApiKey(
  id: string,
  stored: string,
  keyDrafts: Record<string, unknown>,
  cipher: SecretCodec,
): string {
  if (id in keyDrafts) {
    const draft = keyDrafts[id]

    // 空串 / null = 明确清除
    if (draft === null || draft === '') return ''

    if (typeof draft !== 'string') throw new Error(`供应商 ${id} 的密钥格式不对`)
    return cipher.encrypt(draft.trim())
  }

  // 没传草稿 = 别动它
  return stored
}

function normalizeModels(raw: unknown): ProviderModel[] {
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const models: ProviderModel[] = []

  for (const item of raw) {
    const id = typeof item === 'string' ? item : ((item as { id?: unknown }).id as string)
    if (typeof id !== 'string' || id.trim() === '' || seen.has(id)) continue

    const trimmed = id.trim()
    seen.add(trimmed)
    models.push({
      id: trimmed,
      source: normalizeSource((item as { source?: unknown }).source),
      purposes: normalizePurposes((item as { purposes?: unknown }).purposes, trimmed),
    })
  }

  return models
}

/**
 * 用途归一化。**空数组是回填的触发条件**，不是保留状态。
 *
 * 三个到达这里的来源：用户提交（可能忘标）、旧配置（没有这个字段）、
 * 端点拉取（没回传类型）。三者的正确落库形状是同一个——按模型名推断出
 * 一个可改的显式标注。留着空数组会让模型从所有角色的下拉里消失，
 * 而用户看不出为什么。
 */
function normalizePurposes(raw: unknown, modelId: string): ModelPurpose[] {
  if (!Array.isArray(raw)) return inferModelPurposes(modelId)

  const known = new Set<string>(MODEL_PURPOSES)
  const purposes = [
    ...new Set(
      raw.filter((item): item is ModelPurpose => typeof item === 'string' && known.has(item)),
    ),
  ]

  return purposes.length > 0 ? purposes : inferModelPurposes(modelId)
}

function normalizeSource(raw: unknown): ProviderModel['source'] {
  return raw === 'preset' || raw === 'fetched' || raw === 'manual' ? raw : 'manual'
}

/**
 * 角色绑定。
 *
 * 两条丢弃规则，它们的共同点都是「这个绑定干活时会失败或干错活」：
 *
 *  1. 指向不存在的供应商——删掉一个供应商时，指着它的角色自动变成
 *     「未绑定」，比悄悄指向一个不存在的 id 好（后者在提问时才报错）
 *  2. 指向一个**没有该角色所需用途**的模型——比如向量化角色绑着一个
 *     只标了「对话」的模型。用途是用户声明的「这个模型能不能干这个活」，
 *     声明与绑定矛盾时不保留绑定
 *
 * 两条都是**显式置空**而不是跳过：跳过会让库里保留上一次的绑定
 * （整份配置是覆盖写，缺一个 key 就是「删掉它」），于是指向已删供应商的
 * 绑定会在库里复活。
 */
function normalizeRoles(
  raw: unknown,
  providers: InternalProvider[],
): Partial<Record<ModelRole, InternalRoleBinding | null>> {
  const byId = new Map(providers.map((provider) => [provider.id, provider]))
  const roles: Partial<Record<ModelRole, InternalRoleBinding | null>> = {}
  const source = (raw ?? {}) as Record<string, unknown>

  for (const role of ['chat', 'reasoning', 'summarize', 'embed'] as const) {
    const value = source[role]
    if (value === null || value === undefined) {
      roles[role] = null
      continue
    }

    const binding = value as Partial<RoleBinding>

    if (
      typeof binding.providerId !== 'string' ||
      typeof binding.model !== 'string' ||
      binding.model.trim() === ''
    ) {
      roles[role] = null
      continue
    }

    const provider = byId.get(binding.providerId)
    if (!provider) {
      roles[role] = null
      continue
    }

    const model = provider.models.find((item) => item.id === binding.model)
    if (!model || !canServe(model, role)) {
      roles[role] = null
      continue
    }

    roles[role] = { providerId: binding.providerId, model: binding.model }
  }

  return roles
}

/**
 * 一个模型能不能服务某个角色。**候选过滤与绑定校验共用这一条**——
 * 分成两份就会漂移成「下拉里能选、保存后被清掉」这种自相矛盾的行为。
 */
export function canServe(model: ProviderModel, role: ModelRole): boolean {
  const required = MODEL_ROLE_PURPOSES[role]
  return model.purposes.some((purpose) => required.includes(purpose))
}

/* ── 其它小工具 ───────────────────────────────────────── */

/**
 * 把库里那份（可能是 undefined / 坏掉的）收敛成一个可用的形状。
 *
 * **读取路径也要过 `normalizeModels`**：旧配置的模型条目没有 `purposes`
 * 字段，直接下发会让界面拿到 `undefined`——而界面对它做 `.purposes.some(...)`，
 * 那会在下拉渲染时崩掉。回填按模型名推断，与写入路径同一份实现。
 */
export function coerceExisting(raw: unknown): InternalModelConfig {
  if (!raw || typeof raw !== 'object') return emptyModelConfig()

  const value = raw as Partial<InternalModelConfig>
  const providers: InternalProvider[] = []

  if (Array.isArray(value.providers)) {
    for (const provider of value.providers as InternalProvider[]) {
      const normalized = Object.assign({}, provider, { models: normalizeModels(provider.models) })
      providers.push(normalized)
    }
  }

  return {
    providers,
    roles: (value.roles ?? {}) as InternalModelConfig['roles'],
    ...(value.migratedFrom ? { migratedFrom: value.migratedFrom } : {}),
  }
}

/**
 * 从预设建一个新实例。
 *
 * 密钥单独返回（不进实例）：调用方要把它加到 `keyDrafts` 里提交，
 * 而实例本身永远是「脱敏」的形状。这样「实例里有没有密钥」这个问题
 * 只有一个答案。
 */
export function fromPreset(
  preset: ProviderPreset,
  options: { name?: string; apiKey: string },
): { instance: ProviderInstance; apiKey: string } {
  return {
    instance: {
      id: randomUUID(),
      preset: preset.id,
      name: options.name?.trim() || preset.name,
      family: preset.family,
      baseUrl: preset.baseUrl,
      // 预设的模型先当作 'preset' 来源与推断用途，拉取后才能被端点清单取代
      models: preset.models.map((id) => ({
        id,
        source: 'preset' as const,
        purposes: inferModelPurposes(id),
      })),
      hasKey: options.apiKey !== '',
      modelsFetchedAt: null,
    },
    apiKey: options.apiKey,
  }
}

export { findPreset, inferPresetId }
