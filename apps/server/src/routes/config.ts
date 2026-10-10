import { Hono } from 'hono'
import {
  fetchModelsInputSchema,
  probeRequestSchema,
  updateSettingsInputSchema,
  type ModelConfig,
  type ProbeResult,
  type RuntimeConfig,
} from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import { env } from '../env.js'
import { activeStorage, assemble } from '../plugins/host.js'
import { describeModel, record } from '../services/usage.js'
import type { AppEnv } from '../types.js'

/**
 * 运行时配置：设置、插件、模型配置、数据库事实。
 *
 * ## 四块的读法与写法
 *
 * | 块 | 读 | 写 |
 * |---|---|---|
 * | `settings` | 标量键 + 来源 | `PATCH /config/settings`（单个或整批）|
 * | `plugins` | 各接缝的实现清单与状态 | 无（注册是代码事实）|
 * | `modelConfig` | 供应商列表 + 角色绑定 + 预设目录 | `PATCH /config/settings` 的 `model.config` 键 |
 * | `database` | 当前驱动 + SQLite 库文件 | 无（`DATABASE_URL` 是部署事实，不在键表里）|
 *
 * 模型配置与标量设置**走同一个写入端点**：它本来就是设置层的一个 json 键
 * （`.trellis/spec/project/architecture.md` §7.5 的键集闭集）。为它单开一个端点会造出第二条
 * 写入路径，而两条路径的校验早晚会漂移。
 */
export const configRoute = new Hono<AppEnv>()

/** 探测结果的内存缓存。**不进数据库**：它是「刚才通不通」的观测，不是配置 */
const probes = new Map<string, ProbeResult>()

configRoute.get('/', async (c) => {
  const { settings, descriptors, providers } = assemble()

  /**
   * 老的单供应商配置在新形状里的迁移**不在这里触发**。
   *
   * 它在 `provider` 插件的 `loadConfig()` 里懒执行——第一次有人读模型配置时，
   * 拿到的已经是迁移后的形状（见 `plugins/provider/src/migrate-runner.ts`）。
   * 放那里的理由是迁移要加密旧密钥，而加密口只有插件拿得到。
   */

  const entries = await settings.entries()
  const provider = activeProvider(providers)
  const [plugins, modelConfig] = await Promise.all([
    descriptors(),
    provider ? provider.overview() : Promise.resolve(emptyModelConfig()),
  ])

  return c.json({
    settings: entries,
    plugins,
    modelConfig,
    /**
     * 真相落在哪种库上。
     *
     * **由服务端回传而不是界面写死厂商名**：双后端下（D-045）写死的那一个
     * 在另一半部署里必然是错的，而设置页「真相在哪」这一行恰恰是用户拿来
     * 核对的地方——说错等于让他去找一个不存在的实例。
     *
     * 只回传库文件、不回传连接串：Postgres 的连接串里有凭据，
     * 而 `DATABASE_URL` 本身按 §7.5 是部署事实、不入键表也不下发。
     */
    database: {
      driver: env.dbDriver,
      file: env.dbDriver === 'sqlite' ? env.databaseFile : null,
    },
    /**
     * 本地模式（D-100）。与 `database` 同一条理由由服务端回传：
     * 界面要据此决定账号那一块显示什么（本地模式没有登出、没有邮箱），
     * 猜错的表现是一个点了没反应的按钮。
     */
    localMode: env.localMode,
    probes: [...probes.values()],
  } satisfies RuntimeConfig)
})

/**
 * 写入设置。**整批校验，任一键不合法则整批拒绝。**
 *
 * `null` 表示删除覆盖、回落到环境变量或默认值——那是一个真实的动作，
 * 不是「清空输入框」的副作用（`.trellis/spec/project/architecture.md` §7.5）。
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
 * 存储后端的真实探测：写一个探针对象 → 读回 → 删掉。
 *
 * ## 为什么只探「当前选中的那个」
 *
 * 探测要**写真实数据**。给未选中的后端也探一遍，等于往一个没在用的位置
 * 写东西——而用户的意图明明是「我要不要切过去」，不是「那个地方现在通不通」。
 * 想验证 S3 的配置，就把后端切过去再点探测；那时它写的就是真路径，
 * 探通即代表真的能用。
 *
 * ## 与模型探测同一条规则：显式动作，不自动触发
 *
 * 每次进设置页都写一个对象是明显的浪费，而且 S3 的写是按请求计费的
 * （`.trellis/spec/project/architecture.md` §7.8）。
 *
 * **不记账**：与模型探测不同，这里没有 token 消耗，也没有「我没怎么用怎么
 * 有记录」的问题——写一个几字节的探针对象不构成用户可感知的用量。
 */
configRoute.post('/storage-probe', async (c) => {
  const backend = activeStorage()

  const outcome = backend.probe
    ? await backend.probe()
    : { ok: true, message: `后端 ${backend.id} 没有实现探测，跳过` }

  return c.json({
    target: backend.id,
    ok: outcome.ok,
    message: outcome.message,
  })
})

/**
 * 真实探测。
 *
 * 两种粒度，因为它们的**可用时机不同**：
 *
 * | 传什么 | 探什么 | 什么时候用 |
 * |---|---|---|
 * | 空 | 全部角色各探一次 | 全部配好之后做一次总检 |
 * | `role` | 那一个角色 | 改完某个角色的模型 |
 * | `providerId` | 那一个供应商 | **刚新建、还没绑定角色**——这是它存在的理由 |
 *
 * 供应商级探测不能靠角色级替代：新建供应商时它不属于任何角色，
 * 而用户此刻最想知道的恰恰是「这个地址和密钥通不通」。
 */
configRoute.post('/probe', async (c) => {
  const { seams, providers } = assemble()
  const input = await parseInput(c, 'json', probeRequestSchema)

  const provider = requireProvider(providers)
  const startedAt = performance.now()

  /**
   * 探测也记账，但 token 三列留空（`.trellis/spec/project/architecture.md` §12.2）。
   *
   * 它是**真实调用**（发 `"ping"`、`max_tokens: 1`），不记的话用户会发现
   * 「我没怎么用，怎么有调用记录」。但它也不该混进「我的用量」——
   * 所以 `source = 'probe'` 单列一类，统计页上写「其中测试连接 N 次」。
   *
   * **token 是 null 而不是 0**：这条路径确实拿不到用量（`probe()` 的契约
   * 只回 ok 与原因）。null 是诚实的「没观测到」；填 0 会让它看起来像一次
   * 真实的零消耗调用——那正是 §12.3 要防的同一个错误。
   *
   * ## 为什么这里没有 try/catch
   *
   * 第一版加了 catch，想兜住「连不上、超时、模型名下架」那几类失败——
   * 它们也真实发出过请求。但读了 `provider.ts` 才发现 `probeProvider` / `probe`
   * 都经 `runProbe`，而它**自己吞掉所有异常**并折成 `{ ok: false, message }`
   * （`describeError` 负责把 errno 说成人话）。
   *
   * 所以「失败」在这条路径上**不是异常，是 ok:false**——下面那一行就已经
   * 覆盖了全部情形。加 catch 会是一段永不执行的代码，而它更坏的地方在于
   * **读的人会以为存在一个会抛的路径**，从而在别处再写一遍防御。
   *
   * 这个性质由 `probe-accounting.test.ts` 的断言守着：探测失败也必须落账。
   */
  const outcome = await provider.probeProvider(input.providerId, input.modelId)
  await recordProbe(input.providerId, startedAt, outcome.ok)

  const result: ProbeResult = {
    target: input.providerId,
    ok: outcome.ok,
    message: outcome.message,
    at: new Date().toISOString(),
    tookMs: outcome.tookMs,
  }

  probes.set(input.providerId, result)
  void seams
  return c.json(result)
})

/**
 * 角色级探测：探一个角色绑定的模型。
 *
 * 与供应商级分开是因为**它们的失败含义不同**：
 * 角色探测失败可能是「绑错了模型」，供应商探测失败是「这家连不上」。
 */
configRoute.post('/probe-role', async (c) => {
  const { providers } = assemble()
  const body = (await c.req.json().catch(() => ({}))) as { role?: unknown }
  const role = typeof body.role === 'string' ? body.role : ''

  const provider = requireProvider(providers)
  if (role === '') throw new HttpError(400, 'INVALID_INPUT', 'role 不能为空')

  const startedAt = performance.now()

  /**
   * 真实调用，也要记账（单列 'probe'，不混进「我的用量」）。
   *
   * 与供应商级同理：失败是 `ok: false` 而**不是异常**（`runProbe` 全兜），
   * 所以这一行覆盖了成功与失败两种情形，不需要 try/catch。
   */
  const outcome = await provider.probe(role as never)
  await recordProbe(`role:${role}`, startedAt, outcome.ok)

  const result: ProbeResult = {
    target: `role:${role}`,
    ok: outcome.ok,
    message: outcome.message,
    at: new Date().toISOString(),
    tookMs: outcome.tookMs,
  }

  probes.set(result.target, result)
  return c.json(result)
})

/**
 * 两条探测端点共用的记账。
 *
 * **抽出来是因为三处字段的取法必须一致**：`source` 恒为 `'probe'`、
 * token 三列恒为 `null`、耗时由调用方量。分开写两遍早晚会有一处漏掉
 * `source` 而被算进「我的用量」——那是个安静的错误。
 *
 * `model` 取不到（探测是按 providerId / role 走的，没有解析出模型名），
 * 记空串让统计表显示「—」，比记一个猜的模型名好。
 */
async function recordProbe(target: string, startedAt: number, ok: boolean): Promise<void> {
  const described = await describeModel('chat')

  await record({
    role: 'chat',
    source: 'probe',
    model: described.model,
    providerId: target,
    baseUrlHost: described.baseUrlHost,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    durationMs: Math.round(performance.now() - startedAt),
    ok,
    failureKind: ok ? null : 'probe',
    refId: null,
  })
}

/**
 * 拉取一个供应商的模型清单。
 *
 * 这是个**纯读**请求（D-080）：它不写配置，界面把结果拿进创建 / 编辑表单的
 * 草稿，随「保存」一起提交。所以创建表单里也能拉——那里还没有实例。
 *
 * 用 POST 而不是 GET：它要带上密钥（草稿或已存的），而那不该进 URL。
 * 密钥的解析在插件里（`fetchModels`）——界面拿不到密钥，只能传 id 或草稿。
 */
configRoute.post('/fetch-models', async (c) => {
  const { providers } = assemble()
  const provider = requireProvider(providers)
  const input = await parseInput(c, 'json', fetchModelsInputSchema)

  try {
    return c.json(await provider.fetchModels(input))
  } catch (error) {
    // 拉取失败要说清原因（密钥不对 / 没有 /models / 连不上），
    // 那些话由插件产生——它才知道这个端点的脾气
    throw new HttpError(
      400,
      'FETCH_MODELS_FAILED',
      error instanceof Error ? error.message : '拉取模型列表失败',
    )
  }
})

function emptyModelConfig(): ModelConfig {
  return { providers: [], roles: [], presets: [] }
}

/**
 * 当前生效的模型提供方。
 *
 * **取第一个**而不是按名字找：模型域的设计是「一个实现管一族协议」，
 * 将来加 Ollama 原生支持时会有第二个实现，那时需要一个「用哪个」的规则
 * （按供应商的 family 字段找）。现在只有一个实现，
 * 按 `family` 找的代码会是一条没有测试覆盖的分支——等真有第二个再加。
 */
function activeProvider(registry: ReturnType<typeof assemble>['providers']) {
  return registry.implementations()[0]?.impl ?? null
}

function requireProvider(registry: ReturnType<typeof assemble>['providers']) {
  const provider = activeProvider(registry)
  if (!provider) throw new HttpError(500, 'NO_PROVIDER', '没有注册任何模型提供方')
  return provider
}
