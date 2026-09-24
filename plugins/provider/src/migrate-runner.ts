import { randomUUID } from 'node:crypto'
import type { PluginSettings, SecretCodec } from '@mimir/shared'
import { coerceExisting, type InternalModelConfig } from './instances.js'
import { migrateLegacySettings, shouldMigrate } from './migrate.js'

/**
 * 迁移的执行者：读旧键 → 转换成供应商列表 → 写回。
 *
 * ## 为什么它在插件里，不在宿主里
 *
 * 两件只有插件能做的事：
 *
 *  1. **加密旧密钥**。旧密钥可能是库里的密文，也可能是环境变量里的明文，
 *     两种都要**加密后**落进新配置。加密口是 `host.secrets`，
 *     只有插件拿得到（宿主的服务层刻意没有它——`docs/TECH.md` §7.6）
 *  2. **知道新形状**。它是模型域的拥有者，转换规则在 `migrate.ts` 里
 *
 * 如果放在宿主，宿主就要读旧的 `model.*` 标量键（那是模型域的知识），
 * 还要拿到 cipher——两样都是边界泄漏。
 *
 * ## 幂等性靠状态本身，不靠标记位
 *
 * 判据是「新配置里有没有供应商」。用一个 `migrated: true` 标记位会与真实
 * 状态脱节（用户手工清空供应商后，标记位还在，迁移永远不再发生）。
 */
export async function runLegacyMigration(
  settings: PluginSettings,
  secrets: SecretCodec,
  configKey: string,
): Promise<InternalModelConfig | null> {
  const current = coerceExisting(await settings.getJson<InternalModelConfig>(configKey))

  // 已经有供应商了：不管旧键里有什么，都不该覆盖用户现在的配置
  if (current.providers.length > 0) return null

  const legacy = {
    baseUrl: await settings.getString('model.baseUrl'),
    apiKey: await readLegacyApiKey(settings),
    providerName: await settings.getString('model.providerName'),
    chatModel: await settings.getString('model.chat.model'),
    reasoningModel: await settings.getString('model.reasoning.model'),
    summarizeModel: await settings.getString('model.summarize.model'),
    embedModel: await settings.getString('model.embed.model'),
  }

  const input = {
    current,
    legacy,
    newProviderId: randomUUID(),
    // **这里必须是真正的加密**：传恒等函数会把旧密钥明文写进配置
    encrypt: (plain: string) => secrets.encrypt(plain),
  }

  if (!shouldMigrate(input)) return null

  const migrated = migrateLegacySettings(input)
  await settings.setJson(configKey, migrated)

  console.log(
    `[provider] 已把旧的单供应商配置迁移为供应商列表：${migrated.providers[0]?.name ?? ''}` +
      `（${migrated.providers[0]?.models.length ?? 0} 个模型）`,
  )

  return migrated
}

/**
 * 读旧密钥的明文。
 *
 * `getSecret` 已经处理了两种来源（库里的密文会解密，环境变量直接读），
 * 所以这里拿到的就是明文；落进新配置前会再加密一次。
 */
async function readLegacyApiKey(settings: PluginSettings): Promise<string> {
  const secret = await settings.getSecret('model.apiKey')
  return secret.ok ? secret.value : ''
}
