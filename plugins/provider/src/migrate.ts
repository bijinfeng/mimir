import type { ModelRole, ProviderInstance, RoleBinding } from '@mimir/shared'
import { inferPresetId } from './presets.js'
import type { InternalModelConfig, InternalProvider } from './instances.js'

/**
 * 把**旧的单供应商配置**转成供应商列表。
 *
 * ## 为什么必须有这一步
 *
 * M1-A 的形状是四个标量键（`model.baseUrl` / `model.apiKey` /
 * `model.chat.model` / …），一次只能接一个端点。新的形状是供应商列表。
 * 没有迁移的话，**已配好的用户升级后要重新填一遍密钥**——而他们多半
 * 不记得那串 key 了（库里有加密的那份，但界面上看不到）。
 *
 * ## 迁移是「一次性读取」，不是「双向同步」
 *
 * 迁移只在**新配置里一个供应商都没有**时发生一次，之后旧键就只是历史残留
 * （它们被标记为 `hidden`，不再出现在设置页）。做成双向同步会让两个形状
 * 同时是真相源——那正是 D-029 要避免的「两个真相源」。
 *
 * ## 旧键的值从哪来
 *
 * 由调用方（宿主装配层）传进来：它才知道怎么读标量设置键。
 * 这样这个模块是**纯函数**，可以脱离设置层测试。
 */
export interface LegacyModelSettings {
  baseUrl?: string | undefined
  apiKey?: string | undefined
  providerName?: string | undefined
  chatModel?: string | undefined
  reasoningModel?: string | undefined
  summarizeModel?: string | undefined
  embedModel?: string | undefined
  embedDimensions?: number | undefined
}

export interface MigrationInput {
  /** 新配置（可能是空的）*/
  current: InternalModelConfig
  legacy: LegacyModelSettings
  /** 新生成的供应商 id */
  newProviderId: string
  /** 加密函数（旧密钥是明文来的，要加密后落库）*/
  encrypt: (plain: string) => string
}

/**
 * 需要迁移吗。
 *
 * 判据是「新配置里没有供应商」**且**「旧配置里配过 baseURL 或密钥」。
 * 两个条件都要：只满足前者的话，一个全新的部署会被迁移逻辑塞进一个
 * 凭空造出来的供应商（用默认 baseURL），而用户从没配过任何东西。
 */
export function shouldMigrate(input: MigrationInput): boolean {
  if (input.current.providers.length > 0) return false

  const { legacy } = input
  const hasLegacyConfig =
    (legacy.baseUrl !== undefined && legacy.baseUrl !== '') ||
    (legacy.apiKey !== undefined && legacy.apiKey !== '')

  return hasLegacyConfig
}

export function migrateLegacySettings(input: MigrationInput): InternalModelConfig {
  const { legacy, newProviderId, encrypt } = input

  const baseUrl = (legacy.baseUrl ?? '').trim().replace(/\/+$/, '')
  const apiKey = (legacy.apiKey ?? '').trim()

  const preset = inferPresetId(baseUrl)

  /**
   * 模型列表从旧的角色绑定反推。
   *
   * 这一点很重要：用户配过的模型名**必须在迁移后仍然可用**，
   * 否则迁移就等于「把你的配置清了」。来源标 `preset` 是因为
   * 我们无法区分它是手填的还是当年从预设来的——标 `manual`
   * 会让「拉取模型」时把它当成用户手加的而永久保留。
   */
  const models = uniqueModels([
    legacy.chatModel,
    legacy.reasoningModel,
    legacy.summarizeModel,
    legacy.embedModel,
  ])

  const provider: InternalProvider = {
    id: newProviderId,
    preset,
    // 旧配置里没有「名字」这个概念，用服务商标识或预设名
    name: (legacy.providerName ?? '').trim() || presetDisplayName(preset),
    family: 'openai-compatible',
    baseUrl,
    // 旧密钥是明文（或来自环境变量），迁移时加密落库
    apiKey: apiKey === '' ? '' : encrypt(apiKey),
    models: models.map((id) => ({ id, source: 'preset' as const })),
    modelsFetchedAt: null,
  }

  return {
    providers: [provider],
    roles: {
      chat: binding(legacy.chatModel, provider.id),
      reasoning: binding(legacy.reasoningModel, provider.id),
      // 摘要留空是合法的（会回落到对话），所以旧值为空时不写绑定
      summarize: binding(legacy.summarizeModel, provider.id),
      embed: binding(legacy.embedModel, provider.id),
    },
  }
}

function binding(model: string | undefined, providerId: string): RoleBinding | null {
  const trimmed = (model ?? '').trim()
  return trimmed === '' ? null : { providerId, model: trimmed }
}

function uniqueModels(values: (string | undefined)[]): string[] {
  return [...new Set(values.map((value) => (value ?? '').trim()).filter((value) => value !== ''))]
}

function presetDisplayName(presetId: string): string {
  // 这里不 import presets 的查询函数是为了避免循环依赖的可能性；
  // 名字不准不影响功能，用户随时能改
  return presetId === 'custom' ? '默认供应商' : presetId
}

export type { ModelRole, ProviderInstance }
