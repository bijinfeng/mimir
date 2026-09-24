import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ModelRoleStatus, ProviderInstance, ProviderModel, RuntimeConfig } from '@mimir/shared'
import { api } from '@/lib/api'

/**
 * 模型配置的**写入**：把一次改动提交给服务端。
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
export function modelConfigOf(config: RuntimeConfig | undefined) {
  return config?.modelConfig
}

/**
 * 提交模型配置。
 *
 * 成功后让 `['config']` 失效——服务端是唯一真相源，前端不自己维护
 * 「已保存的那份」。这样「界面上显示的值」与「服务端真正在用的值」
 * 永远一致（设置页自己那条原则，`docs/TECH.md` §7.7）。
 */
export function useSaveModelConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (draft: ModelConfigDraft) => api.updateSettings({ 'model.config': draft }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
}

/* ── 编辑动作的纯函数（组件只负责调用）──────────────────── */

/** 加一个供应商（来自预设，或用户手填的空白）*/
export function withProviderAdded(
  config: { providers: ProviderInstance[]; roles: Record<string, unknown> },
  provider: ProviderInstance,
  apiKey: string,
): { draft: ModelConfigDraft; newProviderId: string } {
  return {
    draft: {
      providers: [...config.providers, provider],
      roles: config.roles as ModelConfigDraft['roles'],
      // 新供应商的密钥只能走 keyDrafts——实例本身不带密钥（那是下发形状）
      keyDrafts: { [provider.id]: apiKey },
    },
    newProviderId: provider.id,
  }
}

/**
 * 删一个供应商，并清掉指向它的角色绑定。
 *
 * 界面上必须一起清：留着指向已删供应商的绑定，那个角色会显示成
 * 「绑定的供应商已被删除」——一个本可以避免的中间状态
 * （服务端也会兜一次，但让用户看到那个状态是不必要的）。
 */
export function withRoleBindingCleared(
  config: { providers: ProviderInstance[]; roles: Record<string, unknown> },
  providerId: string,
): ModelConfigDraft {
  return withProviderRemoved(config, providerId)
}

/** 删一个供应商。**指向它的角色绑定会自动清掉**（服务端也会兜一次）*/
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

/** 改一个供应商的字段。密钥走 `keyDrafts`（已经填好的那把不动）*/
export function withProviderChanged(
  config: { providers: ProviderInstance[]; roles: Record<string, unknown> },
  providerId: string,
  patch: Partial<Pick<ProviderInstance, 'name' | 'baseUrl' | 'models'>>,
): ModelConfigDraft {
  return {
    providers: config.providers.map((provider) =>
      provider.id === providerId ? { ...provider, ...patch } : provider,
    ),
    roles: config.roles as ModelConfigDraft['roles'],
  }
}

/** 换一个供应商的密钥。空串表示清除 */
export function withKeyDraft(
  config: { providers: ProviderInstance[]; roles: Record<string, unknown> },
  providerId: string,
  apiKey: string,
): ModelConfigDraft {
  return {
    providers: config.providers,
    roles: config.roles as ModelConfigDraft['roles'],
    keyDrafts: { [providerId]: apiKey },
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

/* ── 展示辅助 ─────────────────────────────────────────── */

/**
 * 一个角色能选哪些模型。
 *
 * **向量化角色只列 embedding 模型**——这一条是调研里发现的少数派做法
 * （`docs/RESEARCH.md`：四个成熟产品里只有两个做了类型过滤）。
 * 不做的话用户会把对话模型选进向量角色，然后运行时才静默失败。
 *
 * 判据用模型名里有没有 `embed` / `bge` 这类词。它不精确，但比
 * 「什么都不筛」好得多，而误判的代价是**用户看到一个多余的选项**，
 * 不是看到一个错误的选项——失败方向是安全的。
 */
export function modelsForRole(provider: ProviderInstance, role: string): ProviderModel[] {
  if (role !== 'embed') return provider.models

  const looksLikeEmbedding = provider.models.filter((model) =>
    /embed|bge|gte|e5|nomic/i.test(model.id),
  )

  // 一个都没有时退回全部：宁可让用户自己挑，也不要让他「没得选」却不知道为什么
  return looksLikeEmbedding.length > 0 ? looksLikeEmbedding : provider.models
}

/** 角色状态的一句话摘要。空的时候不显示（界面上不需要一行「没问题」）*/
export function roleHint(status: ModelRoleStatus): string | null {
  if (status.ready) return null
  return status.reason
}

/** 供应商卡片的语气：有密钥、有模型、绑了角色都算「配好了」*/
export function providerSummary(provider: ProviderInstance): string {
  const parts: string[] = []

  if (!provider.hasKey) parts.push('未配置密钥')
  if (provider.models.length === 0) parts.push('没有模型')

  if (parts.length === 0) return `${provider.models.length} 个模型`
  return parts.join(' · ')
}
