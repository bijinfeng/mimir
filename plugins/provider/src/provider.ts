import { chat, embed, summarize } from '@tanstack/ai'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { createOpenaiEmbedding, createOpenaiSummarize } from '@tanstack/ai-openai'
import type {
  ModelAdapter,
  ModelProvider,
  ModelRole,
  ProviderInstance,
  ProviderOverview,
  ProviderProbe,
  PluginSettings,
  SecretCodec,
} from '@mimir/shared'
import { MODEL_ROLES, MODEL_ROLE_LABELS as LABELS } from '@mimir/shared'
import {
  coerceExisting,
  findPreset,
  wireProviders,
  withFetchedModels,
  type InternalModelConfig,
  type InternalProvider,
} from './instances.js'
import { runLegacyMigration } from './migrate-runner.js'
import { PROVIDER_PRESETS } from './presets.js'

/**
 * OpenAI 兼容的模型提供方。**一套适配器接住 DeepSeek / 通义 / 智谱 / Kimi /
 * 硅基流动 / Ollama**，因为它们都提供 OpenAI 兼容端点。
 *
 * ## 它管的是「协议」，不是「家」
 *
 * 配置形状是「供应商实例列表」：每家一个实例，各有自己的 baseURL、
 * 密钥与模型列表，所以同一家可以配两次（两个账号、或一个云端一个本地）。
 * **加一家服务商是往预设目录里加一行数据**（`presets.ts`），不是改这个文件。
 *
 * ## 三个角色的工厂函数不同（这是这一层存在的理由）
 *
 * | 角色 | 工厂 |
 * |---|---|
 * | chat / reasoning | `openaiCompatible({...})('model')` |
 * | summarize | `createOpenaiSummarize(model, key, { baseURL })` |
 * | embed | `createOpenaiEmbedding(model, key, { baseURL })` |
 *
 * 收在一个文件里，「换服务商」才不需要动三处。
 */

/** 模型配置的键。它一个键装下整个模型域（供应商是集合，标量键表达不了）*/
const CONFIG_KEY = 'model.config'

/** 预设里没有标注角色的模型 → 按它的 id 猜能不能用来做向量化 */
const EMBEDDING_HINTS = ['embed', 'bge', 'gte', 'e5', 'text-embedding', 'nomic']

/*
 * 三个适配器工厂放模块级而不是工厂函数内部：它们只依赖入参，不捕获任何
 * 闭包状态。放进去会让每次 `adapter()` 调用都重建三个函数对象
 * （lint 的 `consistent-function-scoping` 也会指出来）。
 */

/** chat 系（含 reasoning）*/
function buildChat(baseUrl: string, apiKey: string, model: string) {
  return openaiCompatible({
    name: model,
    baseURL: baseUrl,
    apiKey,
    models: [model],
  })(model)
}

/**
 * 模型名的断言**必须落到一个具体的 OpenAI 模型字面量**，不能用 `as never`：
 * 断言成 `never` 会把泛型参数也推成 `never`，于是 `embed()` 的选项类型
 * 跟着变成 `never`，连 `input: 'ping'` 都通不过。
 *
 * 断言到字面量的含义是准确的：**我们声称这个端点提供 OpenAI 形状的模型**，
 * 这正是「OpenAI 兼容」这句话的内容。
 */
function buildEmbedding(baseUrl: string, apiKey: string, model: string) {
  return createOpenaiEmbedding(model as 'text-embedding-3-small', apiKey, { baseURL: baseUrl })
}

function buildSummarize(baseUrl: string, apiKey: string, model: string) {
  return createOpenaiSummarize(model as 'gpt-4o-mini', apiKey, { baseURL: baseUrl })
}

function looksLikeEmbedding(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return EMBEDDING_HINTS.some((hint) => lower.includes(hint))
}

export function createOpenAiCompatibleProvider(
  settings: PluginSettings,
  secrets: SecretCodec,
): ModelProvider {
  /**
   * 读模型域配置。**每次都从设置层现取**（那里有缓存），
   * 所以用户在界面上改完立即生效——模型域的值不像密钥那样有解密成本，
   * 一个进程内的整体读取已经足够便宜。
   */
  async function loadConfig(): Promise<InternalModelConfig> {
    const raw = await settings.getJson<InternalModelConfig>(CONFIG_KEY)

    /**
     * 老配置的迁移在这里发生（懒执行）。
     *
     * 放在这里而不是启动时：迁移要读旧键，而那些键的读取要走设置层，
     * 启动阶段设置层可能还没造好（`host.ts` 的两阶段装配）。
     * 放在读取路径上的好处是不依赖任何启动顺序——**第一次有人读配置，
     * 它就已经是迁移后的形状**。
     *
     * `runLegacyMigration` 自己保证幂等（见那里的注释）。
     */
    const migrated = await runLegacyMigration(settings, secrets, CONFIG_KEY)
    return migrated ?? coerceExisting(raw)
  }

  /** 找实例，并解开它的密钥。失败时说清是哪一步 */
  async function resolveInstance(
    providerId: string,
  ): Promise<{ instance: InternalProvider; apiKey: string }> {
    const config = await loadConfig()
    const instance = config.providers.find((item) => item.id === providerId)
    if (!instance) throw new Error('供应商不存在')

    const apiKey = decryptKey(instance)
    return { instance, apiKey }
  }

  function decryptKey(instance: InternalProvider): string {
    if (instance.apiKey === '') throw new Error(`供应商「${instance.name}」还没有配置密钥`)

    const plain = secrets.decrypt(instance.apiKey)
    if (!plain.ok) {
      throw new Error(
        `供应商「${instance.name}」的密钥无法解密（AUTH_SECRET 换过？），请在设置里重新填写`,
      )
    }
    return plain.value
  }

  /** 角色当前绑到了哪个实例的哪个模型 */
  async function bindingOf(
    role: ModelRole,
  ): Promise<{ instance: InternalProvider; model: string } | null> {
    const config = await loadConfig()

    let binding = config.roles[role] ?? null

    /**
     * 摘要留空时回落到对话角色。
     *
     * 这是刻意的：摘要用强模型只是浪费钱，不是错误
     * （`docs/TECH.md` §5.7）。而**向量化没有回落**——
     * 拿对话模型算向量是错的，所以它没配就是「向量通道不可用」。
     */
    if (!binding && role === 'summarize') binding = config.roles.chat ?? null
    if (!binding) return null

    const instance = config.providers.find((item) => item.id === binding.providerId)
    if (!instance) return null

    return { instance, model: binding.model }
  }

  return {
    id: 'openai-compatible',

    async overview(): Promise<ProviderOverview> {
      const config = await loadConfig()

      const roles = MODEL_ROLES.map((role) => {
        const binding = config.roles[role] ?? null
        const label = LABELS[role]

        // 摘要是唯一允许留空的角色（它会回落到对话）
        if (!binding) {
          return {
            role,
            label,
            providerId: null,
            providerName: null,
            model: '',
            ready: false,
            reason: role === 'summarize' ? '留空时回落到对话模型' : '还没有选择模型',
          }
        }

        const instance = config.providers.find((item) => item.id === binding.providerId)

        if (!instance) {
          // 绑定指向一个已被删掉的供应商。`fromWire` 会清掉这种绑定，
          // 但配置可能是手改的（或迁移途中），所以这里再兜一次
          return {
            role,
            label,
            providerId: null,
            providerName: null,
            model: '',
            ready: false,
            reason: '绑定的供应商已被删除，请重新选择',
          }
        }

        const missing: string[] = []
        if (instance.apiKey === '') missing.push('密钥')
        if (binding.model.trim() === '') missing.push('模型')

        // 密钥能不能解开也算「就绪」的一部分：解不开与没配对用户是不同的原因，
        // 但都不能干活
        let problem: string | null = null
        if (missing.length === 0) {
          const decrypted = secrets.decrypt(instance.apiKey)
          if (!decrypted.ok) problem = '密钥无法解密，请重新填写'
        }

        return {
          role,
          label,
          providerId: instance.id,
          providerName: instance.name,
          model: binding.model,
          ready: missing.length === 0 && problem === null,
          reason:
            missing.length > 0 ? `供应商「${instance.name}」缺少 ${missing.join('、')}` : problem,
        }
      })

      return {
        // 摘密钥只有一处实现（`toWire`），不在这里重写一遍——
        // 两份「哪些字段下发」的清单必然漂移，而漂移的表现是密钥泄漏
        providers: wireProviders(config.providers),
        roles,
        presets: [...PROVIDER_PRESETS],
      }
    },

    async supports(role) {
      try {
        return (await bindingOf(role)) !== null
      } catch {
        return false
      }
    },

    async adapter(role): Promise<ModelAdapter> {
      const bound = await bindingOf(role)
      if (!bound) {
        throw new Error(
          role === 'summarize'
            ? '摘要角色没有可用模型：对话角色还没配置'
            : `角色「${LABELS[role]}」还没有选择模型`,
        )
      }

      const apiKey = decryptKey(bound.instance)
      const { baseUrl } = bound.instance

      // 按角色分派到具体工厂，再作为 unknown 交出（契约里 instance 是 unknown，
      // 因为契约包不依赖 AI SDK）。断言只在调用边界发生
      const instance =
        role === 'embed'
          ? buildEmbedding(baseUrl, apiKey, bound.model)
          : role === 'summarize'
            ? buildSummarize(baseUrl, apiKey, bound.model)
            : buildChat(baseUrl, apiKey, bound.model)

      return { role, model: bound.model, instance }
    },

    async probe(role) {
      return runProbe(async () => {
        const bound = await bindingOf(role)
        if (!bound) return { ok: false, message: `角色「${LABELS[role]}」还没有选择模型` }

        const apiKey = decryptKey(bound.instance)

        /*
         * **按角色分支构造适配器**，而不是拿一个联合类型的返回值到处传。
         *
         * 原因在类型上：三种适配器是三个不同类，合成一个联合传给
         * `embed()` / `chat()` 只能靠 `as never` 压过去，而 `as never`
         * 会把选项类型也推成 `never`——于是 `input: 'ping'` 都通不过，
         * 得在每个字段上再断言一次（`docs/TECH.md` §5.2 记过这个坑）。
         *
         * 每个分支用自己那个具体工厂，类型就是完整的。
         */
        if (role === 'embed') {
          const result = await embed({
            adapter: buildEmbedding(bound.instance.baseUrl, apiKey, bound.model),
            input: 'ping',
          })
          const dims = result.embeddings[0]?.vector?.length ?? 0
          if (dims === 0) return { ok: false, message: '服务端返回了空向量' }

          // 维度对不上必须说出来：它不报错，只是等到第一次写入向量时才炸，
          // 而那时用户已经配好一切、以为能用了
          const expected = await settings.getNumber('model.embed.dimensions')
          if (dims !== expected) {
            return {
              ok: false,
              message: `实际输出 ${dims} 维，与配置的 ${expected} 维不一致——把「向量维度」改成 ${dims} 再试`,
            }
          }
          return { ok: true, message: `连通，输出 ${dims} 维向量` }
        }

        if (role === 'summarize') {
          await summarize({
            adapter: buildSummarize(bound.instance.baseUrl, apiKey, bound.model),
            text: 'ping',
            stream: false,
          })
          return { ok: true, message: `连通，摘要模型 ${bound.model} 有响应` }
        }

        await chat({
          adapter: buildChat(bound.instance.baseUrl, apiKey, bound.model),
          stream: false,
          // 输出上限走 modelOptions 的 provider 原生键（顶层没有 maxTokens），
          // 只要 1 个 token：目的是确认端点与鉴权可用，不是拿回答
          modelOptions: { max_tokens: 1 },
          messages: [{ role: 'user', content: 'ping' }],
        })

        return { ok: true, message: `连通，模型 ${bound.model} 有响应` }
      })
    },

    async probeProvider(providerId, modelId) {
      return runProbe(async () => {
        const { instance, apiKey } = await resolveInstance(providerId)

        /**
         * 探测哪个模型？优先用它自己列表里的第一个聊天模型。
         *
         * 这一步的目的是「验证这个供应商能不能用」，所以**不应该依赖角色绑定**
         * ——新建供应商时它还没绑定任何角色。挑模型也不该挑 embedding
         * （它要一次不同的调用），所以按名字猜一下。
         */
        const candidate =
          modelId ??
          instance.models.find((model) => !looksLikeEmbedding(model.id))?.id ??
          instance.models[0]?.id ??
          ''

        if (candidate === '') {
          // 没有模型也能验证**密钥与地址**：拉一次模型列表就够了，
          // 而且它不花 token
          const listed = await fetchModels(instance, apiKey)
          return {
            ok: true,
            message: `连通，端点报告 ${listed.length} 个模型`,
          }
        }

        await chat({
          adapter: buildChat(instance.baseUrl, apiKey, candidate),
          stream: false,
          modelOptions: { max_tokens: 1 },
          messages: [{ role: 'user', content: 'ping' }],
        })

        return { ok: true, message: `连通，模型 ${candidate} 有响应` }
      })
    },

    async refreshModels(providerId): Promise<ProviderInstance> {
      const { instance, apiKey } = await resolveInstance(providerId)
      const models = await fetchModels(instance, apiKey)
      const fetchedAt = new Date().toISOString()

      // 拉取成功就写回：界面下次读到的就是这个新列表。
      // 保留用户手加的模型（withFetchedModels 的职责）
      const updated = withFetchedModels(instance, models, fetchedAt)
      await saveInstance(updated)

      return wireProviders([updated])[0]!
    },
  }

  /** 拉模型列表：OpenAI 兼容的 `GET /models`。不花 token */
  async function fetchModels(instance: InternalProvider, apiKey: string): Promise<string[]> {
    const url = `${instance.baseUrl.replace(/\/+$/, '')}/models`

    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      // 带上 cause：原始异常里有 errno 与地址，丢它会让排查断在这里
      throw new Error(describeNetworkError(error, instance.baseUrl), { cause: error })
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('鉴权失败：密钥不对，或它不属于这个端点')
    }
    if (response.status === 404) {
      throw new Error(`这个端点没有 /models（404）。检查接口地址是否带 /v1；也可以手工添加模型`)
    }
    if (!response.ok) {
      throw new Error(`端点返回 ${response.status}`)
    }

    const body = (await response.json().catch(() => null)) as { data?: unknown } | null
    const items = Array.isArray(body?.data) ? body.data : []

    // `{ data: [{ id }] }` 是 OpenAI 的形状；有些端点直接给数组
    const ids = items
      .map((item) => (item as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '')

    if (ids.length === 0) {
      throw new Error('端点没有返回任何模型。可能是它在内存里还没加载模型（本地推理服务常见）')
    }

    return [...new Set(ids)].toSorted()
  }

  /** 写回一个实例（按 id 替换）*/
  async function saveInstance(updated: InternalProvider): Promise<void> {
    const config = await loadConfig()
    const providers = config.providers.map((item) => (item.id === updated.id ? updated : item))
    await settings.setJson(CONFIG_KEY, { ...config, providers })
  }
}

/**
 * 探测的收口：计时 + 错误翻译。
 *
 * 探测的价值全在那句话上——用户点「测试连接」失败时要知道**改哪里**。
 * 只说「失败」等于把排查推回给用户。
 */
async function runProbe(
  action: () => Promise<{ ok: boolean; message: string }>,
): Promise<ProviderProbe> {
  const startedAt = performance.now()

  try {
    const result = await action()
    return { ...result, tookMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    return {
      ok: false,
      message: describeError(error),
      tookMs: Math.round(performance.now() - startedAt),
    }
  }
}

/**
 * 把异常说成人话。
 *
 * 三个地方一起看：`name`、`message`、`cause`。
 * 实测（把 baseURL 指向一个不存在的端口）：SDK 抛 `APIConnectionError`，
 * 而 `message` 只有一句 `"Connection error."`——里面既没有地址也没有 errno，
 * 原样显示给用户完全不可执行。底层原因在 `cause` 里。
 */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''
  const status = (error as { status?: number }).status
  const cause = (error as { cause?: unknown }).cause
  const causeText = cause instanceof Error ? cause.message : ''
  const haystack = `${name} ${message} ${causeText}`

  /**
   * 鉴权失败的判据要**双向**匹配。
   *
   * 实测：DeepSeek 的原文是 `401 Authentication Fails, Your api key: **** is invalid`
   * ——「api key」在「invalid」**之前**，所以只写 `invalid.*api.?key`
   * 会漏掉它，用户看到的就是一句英文原文（而这一层的职责恰恰是
   * 把它翻成可执行的提示）。
   */
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|authentication fail|invalid.*api.?key|api.?key.*invalid|鉴权|认证失败/i.test(
      haystack,
    )
  ) {
    return '鉴权失败：API 密钥不对，或它不属于这个端点'
  }
  if (status === 404 || /not found|no such model|model.*not.*exist/i.test(haystack)) {
    return `模型名或路径不对（${message.slice(0, 80)}）。检查接口地址是否带 /v1，以及模型名是否已下架`
  }
  if (status === 429 || /rate limit|限流/i.test(haystack)) {
    return '被限流了。稍后重试，或检查账户额度'
  }
  if (
    /APIConnectionError|Connection error|fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|network|超时|timeout/i.test(
      haystack,
    )
  ) {
    return `连不上（${(causeText || message).slice(0, 100)}）。检查接口地址与网络`
  }

  return message.slice(0, 200)
}

function describeNetworkError(error: unknown, baseUrl: string): string {
  const message = error instanceof Error ? error.message : String(error)
  const cause = (error as { cause?: unknown }).cause
  const detail = cause instanceof Error ? cause.message : message
  return `连不上 ${baseUrl}（${detail.slice(0, 100)}）。检查地址是否可达、端口是否正确`
}

export { findPreset }
