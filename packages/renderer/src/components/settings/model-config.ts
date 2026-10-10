import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MODEL_PURPOSE_LABELS,
  MODEL_ROLE_PURPOSES,
  inferModelPurposes,
  type FetchedModel,
  type ModelConfig,
  type ModelPurpose,
  type ModelRole,
  type ModelRoleStatus,
  type ProviderInstance,
  type ProviderModel,
  type RuntimeConfig,
} from '@mimir/shared'
import { api } from '../../lib/api'

/**
 * 模型配置的**纯函数层**：从这里读「该显示什么」、把编辑动作拼成提交形状。
 *
 * ## 为什么写操作集中在一个文件
 *
 * 模型配置是一个 json 设置键（`model.config`），所以每次改动都要提交
 * **整份配置**——服务端按 `fromWire` 合并密钥，接口形状是
 * `{ providers, roles, keyDrafts }`。
 *
 * 分散在组件里的话，每个地方都要自己拼这个形状，而拼错的后果是
 * **密钥被清掉**（少传一个 id 就会被当成「删了那把密钥」）。
 * 集中在这里，拼形状只有一份实现。
 */

/** 提交给服务端的形状。多一个 `keyDrafts`：只装这次新填的密钥 */
export interface ModelConfigDraft {
  providers: ProviderInstance[]
  roles: Record<string, { providerId: string; model: string } | null>
  /** 只装「这次新填的密钥」。空串 = 明确清除；不传 = 别动它 */
  keyDrafts?: Record<string, string>
}

/** 从服务端响应里取模型配置 */
export function modelConfigOf(config: RuntimeConfig | undefined): ModelConfig | undefined {
  return config?.modelConfig
}

/**
 * 提交模型配置。
 *
 * 成功后让 `['config']` 失效——服务端是唯一真相源，前端不自己维护
 * 「已保存的那份」。这样「界面上显示的值」与「服务端真正在用的值」
 * 永远一致（设置页自己那条原则，`.trellis/spec/project/architecture.md` §7.7）。
 */
export function useSaveModelConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (draft: ModelConfigDraft) => api.updateSettings({ 'model.config': draft }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
}

/* ── 编辑动作的纯函数（组件只负责调用）──────────────────── */

/** 角色状态数组 → 提交用的记录。`null` 表示留空（只有摘要允许） */
export function rolesToRecord(
  roles: ModelRoleStatus[],
): Record<string, { providerId: string; model: string } | null> {
  const result: Record<string, { providerId: string; model: string } | null> = {}
  for (const role of roles) {
    result[role.role] =
      role.providerId && role.model ? { providerId: role.providerId, model: role.model } : null
  }
  return result
}

/**
 * 删一个供应商，并清掉指向它的角色绑定。
 *
 * 界面上必须一起清：留着指向已删供应商的绑定，那个角色会显示成
 * 「绑定的供应商已被删除」——一个本可以避免的中间状态
 * （服务端也会兜一次，但让用户看到那个状态是不必要的）。
 */
export function withProviderRemoved(
  config: { providers: ProviderInstance[]; roles: Record<string, unknown> },
  providerId: string,
): ModelConfigDraft {
  const roles = { ...(config.roles as ModelConfigDraft['roles']) }

  for (const [role, binding] of Object.entries(roles)) {
    if (binding?.providerId === providerId) roles[role] = null
  }

  return {
    providers: config.providers.filter((provider) => provider.id !== providerId),
    roles,
  }
}

/** 绑定一个角色的模型。`null` 表示留空（只有摘要允许）*/
export function withRoleBound(
  config: { providers: ProviderInstance[]; roles: Record<string, unknown> },
  role: string,
  binding: { providerId: string; model: string } | null,
): ModelConfigDraft {
  return {
    providers: config.providers,
    roles: { ...(config.roles as ModelConfigDraft['roles']), [role]: binding },
  }
}

/**
 * 保存一个供应商（新建或编辑）后的整份草稿。
 *
 * ## 为什么「保存供应商」要动角色绑定
 *
 * 编辑把模型列表整个换掉了——被删的模型、或用途被改成不覆盖某角色的模型，
 * 都可能还挂在角色上。留着这种绑定，那个角色在下一屏显示成
 * 「绑定的模型已不在列表里」，而用户刚才只是改了个模型清单。
 * 所以保存时把**不再能服务该角色**的绑定一起清掉（服务端 `normalizeRoles`
 * 也兜一次，两层说同一件事）。
 *
 * 密钥的三态在这里收口（与 `.trellis/spec/project/architecture.md` §5.7 的表格一致）：
 * 不填 = 不带那个 id（保留已存的）；填了 = 进 `keyDrafts`；
 * 清除 = 进 `keyDrafts` 传空串。
 */
export function withProviderSaved(
  config: { providers: ProviderInstance[]; roles: Record<string, unknown> },
  saved: ProviderInstance,
  keyDraft: { value: string } | null,
): ModelConfigDraft {
  const exists = config.providers.some((provider) => provider.id === saved.id)
  const providers = exists
    ? config.providers.map((provider) => (provider.id === saved.id ? saved : provider))
    : [...config.providers, saved]

  const roles = { ...(config.roles as ModelConfigDraft['roles']) }
  for (const [role, binding] of Object.entries(roles)) {
    if (!binding || binding.providerId !== saved.id) continue
    if (!modelServesRole(saved, binding.model, role)) roles[role] = null
  }

  return {
    providers,
    roles,
    ...(keyDraft ? { keyDrafts: { [saved.id]: keyDraft.value } } : {}),
  }
}

/** 这个供应商的某个模型能不能服务某个角色（角色字符串来自服务端） */
function modelServesRole(provider: ProviderInstance, modelId: string, role: string): boolean {
  const model = provider.models.find((item) => item.id === modelId)
  if (!model) return false

  const required = MODEL_ROLE_PURPOSES[role as ModelRole]
  if (!required) return true // 未知角色不擅自清绑定，交给服务端判定
  return model.purposes.some((purpose) => required.includes(purpose))
}

/* ── 拉取结果的合并（纯函数，有测试）──────────────────── */

export interface MergeResult {
  models: ProviderModel[]
  /** 新增的模型 id（界面上高亮这几行） */
  added: string[]
  removed: number
  kept: number
  /** 新模型里有多少个用了端点回传的类型（其余是按模型名推断的） */
  typed: number
}

/**
 * 把端点清单合进当前草稿。**规则只有三条，方向都是「不覆盖用户的显式标注」**：
 *
 *  1. 已在列表里的模型：保留它的用途与 `source`（手动的保持手动）——
 *     用户标过的用途不会因为一次拉取被冲掉
 *  2. 新模型：用途取端点回传的类型，没有就按模型名推断（`inferModelPurposes`）
 *  3. 端点清单里没有的：手动的保留（那是用户加的，端点不管它），
 *     其余的移除（端点不再提供它了）
 */
export function mergeFetchedModels(current: ProviderModel[], fetched: FetchedModel[]): MergeResult {
  const byId = new Map(current.map((model) => [model.id, model]))
  const seen = new Set<string>()
  const added: string[] = []
  const models: ProviderModel[] = []
  let typed = 0
  let kept = 0

  for (const item of fetched) {
    const existing = byId.get(item.id)

    if (existing) {
      models.push({ ...existing, source: existing.source === 'manual' ? 'manual' : 'fetched' })
      kept += 1
    } else {
      if (item.purpose !== null) typed += 1
      models.push({
        id: item.id,
        source: 'fetched',
        purposes: item.purpose ? [item.purpose] : inferModelPurposes(item.id),
      })
      added.push(item.id)
    }

    seen.add(item.id)
  }

  for (const model of current) {
    if (model.source === 'manual' && !seen.has(model.id)) {
      models.push(model)
      kept += 1
    }
  }

  const removed = current.filter((model) => model.source !== 'manual' && !seen.has(model.id)).length

  return { models, added, removed, kept, typed }
}

/* ── 保存前的校验（纯函数，有测试）────────────────────── */

export interface ProviderFormInput {
  name: string
  baseUrl: string
  models: ProviderModel[]
  /** 编辑前是否已有密钥。新建时为 false */
  hasKey: boolean
  /** 这次新填的密钥（空串表示没填）*/
  keyDraft: string
  /** 用户点了「清除密钥」 */
  keyCleared: boolean
  /** `null` 表示新建 */
  editing: ProviderInstance | null
}

/**
 * 保存前的校验。键是字段名（`name` / `baseUrl` / `key`）或 `model{index}`。
 *
 * 两条容易写错、写错了又静默的规则：
 *
 *  1. **只有新建时要求密钥**。编辑时「清除」是一个显式动作——
 *     用户点它就是要清掉那把密钥，拦住等于让这个按钮永远无效
 *  2. **本地地址不要求密钥**。Ollama / LM Studio 不校验它，
 *     而「随便填一个非空值」这条要求对本地用户是个没意义的门槛
 *     （预设的 note 里就是这么说的）
 */
export function validateProviderForm(input: ProviderFormInput): Record<string, string> {
  const errors: Record<string, string> = {}

  if (input.name.trim() === '') errors.name = '请填写显示名'

  const url = input.baseUrl.trim()
  if (url === '') errors.baseUrl = '请填写接口地址'
  else if (!/^https?:\/\//i.test(url)) errors.baseUrl = '要以 http:// 或 https:// 开头'

  const seen = new Set<string>()
  input.models.forEach((model, index) => {
    const id = model.id.trim()
    if (id === '') {
      errors[`model${index}`] = '请填写模型 ID，或删掉这一行'
      return
    }
    if (seen.has(id)) {
      errors[`model${index}`] = '模型 ID 重复'
      return
    }
    seen.add(id)
    if (model.purposes.length === 0) errors[`model${index}`] = '至少标一个用途'
  })

  const isLocal = /localhost|127\.0\.0\.1|\.local(\/|:|$)/.test(url)
  const willHaveKey = input.keyCleared ? false : input.hasKey || input.keyDraft.trim() !== ''
  if (input.editing === null && !willHaveKey && !isLocal) {
    errors.key = '新供应商需要一个密钥（本地服务随便填一个）'
  }

  return errors
}

/* ── 展示辅助 ─────────────────────────────────────────── */

/**
 * 一个角色能选哪些模型。**按模型用途筛，不再按模型名猜**（D-080）。
 *
 * 用途是用户在供应商编辑页显式标注的（`MODEL_PURPOSES`），
 * 这里只做一件事：取该角色的用途集合去过滤。`模型名里有没有 embed`
 * 那套推断已经沉到 `inferModelPurposes`——它只负责给旧配置 / 拉取结果
 * 一个可改的初始值，不参与每次渲染。
 */
export function modelsForRole(provider: ProviderInstance, role: string): ProviderModel[] {
  const required = MODEL_ROLE_PURPOSES[role as ModelRole]
  // 未知角色（服务端加了角色而前端还没跟上）不过滤：宁可多给选项，
  // 也不要让用户面对一个空下拉却不知道为什么
  if (!required) return provider.models

  return provider.models.filter((model) =>
    model.purposes.some((purpose) => required.includes(purpose)),
  )
}

/** 级联选择器的一项。第一层是供应商，第二层是该角色可用的模型 */
export interface RoleOption {
  value: string
  label: string
  disabled?: boolean
  children?: RoleOption[]
}

/**
 * 一个角色的级联选项：**供应商 → 可用于该角色的模型**（D-080 修订）。
 *
 * ## 为什么合并成一个级联（用户拍板，取代两个 Select）
 *
 * 两个下拉的问题是「先选家」这个中间态：用户选了供应商、还没选模型时，
 * 那个角色处于一个半配置状态（界面上「未就绪」，而用户以为自己配好了）。
 * 级联把「选家」与「选型号」收在一次选择里——**选中叶子才算绑定**，
 * 中间态不存在。
 *
 * ## 三条填充规则
 *
 *  1. 供应商 label 带「· 缺密钥」后缀——没密钥的家选它必然失败，先说清
 *  2. **当前绑定的模型不在候选里时也要挂出来**（标「不在列表里」）：
 *     它可能是刚被拉取刷掉的名字，或用途被改了。不显示的话用户看不到
 *     自己选了什么，界面会显示成一个空选择器
 *  3. 某家一个可用模型都没有时，挂一个 **disabled 的占位项**说明原因。
 *     留空 children 会让那一层看起来「没有数据」，而用户需要知道的是
 *     「为什么没有」——去拉取、去标用途，或换一家
 */
export function roleOptions(role: ModelRoleStatus, providers: ProviderInstance[]): RoleOption[] {
  return providers.map((provider) => {
    const choices = modelsForRole(provider, role.role)

    const missing =
      role.providerId === provider.id &&
      role.model !== '' &&
      !choices.some((model) => model.id === role.model)
        ? [{ value: role.model, label: `${role.model}（不在列表里）` }]
        : []

    const children: RoleOption[] = [
      ...missing,
      ...choices.map((model) => ({ value: model.id, label: model.id })),
    ]

    return {
      value: provider.id,
      label: provider.hasKey ? provider.name : `${provider.name} · 缺密钥`,
      children:
        children.length > 0
          ? children
          : [
              {
                // value 要唯一（Cascader 用它做 key）且不可能与真实模型 id 撞
                value: `__none__:${provider.id}`,
                label: '没有可用于该角色的模型',
                disabled: true,
              },
            ],
    }
  })
}

/** 用途分布的一句话：`对话 18 · 向量化 2`。没有模型时返回空串 */
export function purposeSummary(models: ProviderModel[]): string {
  const counts = new Map<ModelPurpose, number>()
  for (const model of models) {
    for (const purpose of model.purposes) {
      counts.set(purpose, (counts.get(purpose) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([purpose, count]) => `${MODEL_PURPOSE_LABELS[purpose]} ${count}`)
    .join(' · ')
}
