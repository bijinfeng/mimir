import { Hono } from 'hono'
import {
  MODEL_ROLE_LABELS,
  probeRequestSchema,
  updateSettingsInputSchema,
  type ModelRoleStatus,
  type PluginDescriptor,
  type ProbeResult,
  type RuntimeConfig,
  type SettingEntry,
} from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import { assemble } from '../plugins/host.js'
import type { AppEnv } from '../types.js'

/**
 * 运行时配置：设置、插件、模型就绪状态。**这是设置页唯一的数据来源。**
 *
 * ## 为什么它可写了（M0 时是只读的）
 *
 * M0 的判断是「配置的真相是 `.env` 与代码常量，做成可写的等于让界面成为
 * 第二个真相来源」（D-025）。那是对的——当时只有 5 个模型键，没有要调的参数。
 *
 * M1 起有十几个要反复试的参数（分块大小、各通道权重、RRF k），把「调权重」
 * 变成「改 `.env` 再重启」会直接劝退调参这件事本身。所以加一层 DB 覆盖，
 * **但不放弃 `.env` 作为部署真相**：解析顺序是 `覆盖 > 环境变量 > 默认`，
 * 且每个键都在界面上显示它当前的来源（`docs/TECH.md` §7.5）。
 *
 * 键集是**闭集**：只有注册过的键能被写入，所以不存在「界面上存了但没代码读」。
 */
export const configRoute = new Hono<AppEnv>()

/** 探测结果的内存缓存。**不进数据库**：它是「刚才通不通」的观测，不是配置 */
const probes = new Map<string, ProbeResult>()

configRoute.get('/', async (c) => {
  const { settings, descriptors } = assemble()

  const entries = (await settings.entries()) as SettingEntry[]
  const plugins = (await descriptors()) as PluginDescriptor[]
  const models = await modelStatuses()

  return c.json({
    settings: entries,
    plugins,
    models,
    probes: [...probes.values()],
  } satisfies RuntimeConfig)
})

/**
 * 写入设置。**整批校验，任一键不合法则整批拒绝。**
 *
 * `null` 表示删除覆盖、回落到环境变量或默认值——那是一个真实的动作，
 * 不是「清空输入框」的副作用（`docs/TECH.md` §7.5）。
 */
configRoute.patch('/settings', async (c) => {
  const { settings } = assemble()
  const input = await parseInput(c, 'json', updateSettingsInputSchema)
  const result = await settings.update(input.values)

  if (!result.ok) {
    throw new HttpError(400, 'INVALID_SETTING', '有配置项不合法，整批未保存', result.issues)
  }

  return c.json(result)
})

/**
 * 真实探测一个模型角色：发一次最小请求。
 *
 * **显式动作，不自动触发**——每次进设置页都发一次真实调用，慢且花钱
 * （`docs/TECH.md` §7.8）。结果只存在内存：重启即回到「未测试」，
 * 比留一个可能过期的「可用」诚实。
 */
configRoute.post('/probe', async (c) => {
  const { seams } = assemble()
  const input = await parseInput(c, 'json', probeRequestSchema)

  const providers = seams.provider.implementations()
  const provider = providers[0]
  if (!provider) {
    throw new HttpError(500, 'NO_PROVIDER', '没有注册任何模型提供方')
  }

  const outcome = await provider.impl.probe(input.role as never)
  const result: ProbeResult = {
    role: input.role,
    ok: outcome.ok,
    message: outcome.message,
    at: new Date().toISOString(),
  }

  probes.set(input.role, result)
  return c.json(result)
})

/**
 * 模型角色的就绪状态。**派生值，不存**。
 *
 * 「就绪」的判据是「有可用的 provider 且它声明支持这个角色」，
 * 而不是「键有值」——键有值但地址写错、模型名下架都属于不能干活，
 * 而那只在真实调用时才知道（所以有上面那条探测端点）。
 */
async function modelStatuses(): Promise<ModelRoleStatus[]> {
  const { seams, settings } = assemble()
  const provider = seams.provider.implementations()[0]

  const modelKeys: Record<string, string> = {
    chat: 'model.chat.model',
    reasoning: 'model.reasoning.model',
    summarize: 'model.summarize.model',
    embed: 'model.embed.model',
  }

  return Promise.all(
    Object.entries(modelKeys).map(async ([role, key]) => {
      const model = await settings.getString(key)
      const supported = provider ? await provider.impl.supports(role as never) : false

      // 摘要的回落规则要在状态里如实反映：它可以用对话模型干活
      const effective =
        role === 'summarize' && model.trim() === ''
          ? await settings.getString(modelKeys.chat!)
          : model

      return {
        role,
        label: MODEL_ROLE_LABELS[role as keyof typeof MODEL_ROLE_LABELS] ?? role,
        model: effective,
        ready: supported,
        reason: supported
          ? null
          : model.trim() === '' && role === 'embed'
            ? '未配置。配了它才会有向量通道（语义检索）'
            : '需要配置 API 密钥与服务商地址',
      }
    }),
  )
}
