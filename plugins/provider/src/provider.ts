import { chat, embed, summarize } from '@tanstack/ai'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { createOpenaiEmbedding, createOpenaiSummarize } from '@tanstack/ai-openai'
import type {
  ModelAdapter,
  ModelProvider,
  ModelRole,
  PluginSettings,
  ProviderProbe,
} from '@mimir/shared'

/**
 * OpenAI 兼容的模型提供方。**一套适配器接住 DeepSeek / 通义 / 智谱 / Kimi**，
 * 因为它们都提供 OpenAI 兼容端点。
 *
 * ## 为什么这一层必须存在（而不只是「包一层」）
 *
 * TanStack AI 的角色用的**不是同一个工厂**，差异都是实测出来的
 * （`docs/TECH.md` §5.2）：
 *
 * | 角色 | 工厂 | 需要注意 |
 * |---|---|---|
 * | chat / reasoning | `openaiCompatible({...})('model')` | 支持模型列表，覆盖兼容端点 |
 * | summarize | `createOpenaiSummarize(model, key, { baseURL })` | **另一个导出**；模型名被限制成 OpenAI 字面量联合 |
 * | embed | `createOpenaiEmbedding(model, key, { baseURL })` | 同上 |
 *
 * 把差异收在一条接缝里，上层只问「给我一个能干活的东西」。不包的后果是
 * `assistant.ts` 与 `assistant-stream.ts` 各抄一份——那正是重构前的状态，
 * 改一次模型配置要同时改两处。
 *
 * ## 密钥每次现取，不缓存
 *
 * 用户在设置页改了密钥，下一次提问就要生效——进程级缓存做不到这点。
 * 代价是每次问答多一次解密（微秒级，相比一次模型调用可忽略）。
 */

/** 每个角色对应的模型名键 */
const MODEL_KEYS: Record<ModelRole, string> = {
  chat: 'model.chat.model',
  reasoning: 'model.reasoning.model',
  // 摘要：留空时回落到对话模型，而不是「摘要不可用」——
  // 用强模型做摘要是浪费钱，不是错误（docs/TECH.md §5.7）
  summarize: 'model.summarize.model',
  embed: 'model.embed.model',
}

interface Resolved {
  baseUrl: string
  apiKey: string
  model: string
}

/*
 * 三个适配器工厂放在模块级而不是工厂函数内部：它们只依赖入参 `Resolved`，
 * 不捕获任何闭包状态。放进去会让每次调用都重建函数对象
 * （lint 的 `consistent-function-scoping` 也会指出来）。
 */

/** chat 系（含 reasoning）。返回具体类型，调用处不需要断言 */
function buildChat(resolved: Resolved) {
  return openaiCompatible({
    name: resolved.model,
    baseURL: resolved.baseUrl,
    apiKey: resolved.apiKey,
    models: [resolved.model],
  })(resolved.model)
}

/**
 * 模型名的断言**必须落到一个具体的 OpenAI 模型字面量**，不能用 `as never`。
 *
 * 断言成 `never` 会把适配器的泛型参数也推成 `never`，于是 `embed()` /
 * `summarize()` 的选项类型跟着变成 `never`，连 `input: 'ping'` 都通不过——
 * 那时就得在每个字段上再断言一次，而那是「契约没有落到位」的典型症状。
 *
 * 断言到字面量的含义是准确的：**我们声称这个端点提供 OpenAI 形状的模型**，
 * 这正是「OpenAI 兼容端点」这句话的内容。真正的模型名走运行时参数。
 */
function buildEmbedding(resolved: Resolved) {
  return createOpenaiEmbedding(resolved.model as 'text-embedding-3-small', resolved.apiKey, {
    baseURL: resolved.baseUrl,
  })
}

function buildSummarize(resolved: Resolved) {
  return createOpenaiSummarize(resolved.model as 'gpt-4o-mini', resolved.apiKey, {
    baseURL: resolved.baseUrl,
  })
}

/** 解析某个角色要用的端点、密钥与模型名 */
async function resolve(settings: PluginSettings, role: ModelRole): Promise<Resolved> {
  let model = await settings.getString(MODEL_KEYS[role])
  if (role === 'summarize' && model.trim() === '') {
    model = await settings.getString(MODEL_KEYS.chat)
  }

  const baseUrl = await settings.getString('model.baseUrl')
  const secret = await settings.getSecret('model.apiKey')

  if (!secret.ok) {
    throw new Error(
      secret.reason === 'corrupted'
        ? '已存的 API 密钥无法解密，请在设置里重新打开「模型」分区填写'
        : '还没有配置 API 密钥',
    )
  }

  return { baseUrl, apiKey: secret.value, model }
}

export function createOpenAiCompatibleProvider(settings: PluginSettings): ModelProvider {
  /**
   * 探测 chat 系：发一条最小请求。
   *
   * 判据是**真的调用一次**，不是「配置齐了就算可用」——地址填错、key 过期、
   * 模型名下架都要发一次才知道（`RESEARCH.md` §1.5 第五条）。
   * 但**不自动触发**：每次进设置页都发一次真实调用，慢且花钱。
   */
  async function probeChat(role: ModelRole): Promise<ProviderProbe> {
    const resolved = await resolve(settings, role)
    await chat({
      adapter: buildChat(resolved),
      stream: false,
      // 输出上限走 modelOptions 的 provider 原生键（顶层没有 maxTokens 选项）。
      // 只要 1 个 token：探测的目的是确认端点与鉴权能用，不是拿回答
      modelOptions: { max_tokens: 1 },
      messages: [{ role: 'user', content: 'ping' }],
    })

    return { ok: true, message: `连通，模型 ${resolved.model} 有响应` }
  }

  /** 探测 summarize：那个工厂的选项形状与 chat 不同（返回 { summary }），分开走 */
  async function probeSummarize(): Promise<ProviderProbe> {
    const resolved = await resolve(settings, 'summarize')
    await summarize({
      adapter: buildSummarize(resolved),
      text: 'ping',
      stream: false,
    })
    return { ok: true, message: `连通，摘要模型 ${resolved.model} 有响应` }
  }

  /**
   * 探测 embed：**顺带核对维度**。
   *
   * 维度对不上是必须说出来的一类失败：它不报错——只是等到第一次写入向量时
   * 才炸，而那时用户已经配好一切、以为能用了。
   */
  async function probeEmbedding(): Promise<ProviderProbe> {
    const resolved = await resolve(settings, 'embed')
    const result = await embed({
      adapter: buildEmbedding(resolved),
      input: 'ping',
    })

    const dims = result.embeddings[0]?.vector?.length ?? 0
    if (dims === 0) return { ok: false, message: '服务端返回了空向量' }

    const expected = await settings.getNumber('model.embed.dimensions')
    if (dims !== expected) {
      return {
        ok: false,
        message: `模型实际输出 ${dims} 维，与配置的 ${expected} 维不一致——把「向量维度」改成 ${dims} 再试`,
      }
    }

    return { ok: true, message: `连通，输出 ${dims} 维向量` }
  }

  return {
    id: 'openai-compatible',

    async supports(role) {
      const secret = await settings.getSecret('model.apiKey')
      if (!secret.ok) return false

      // 摘要可以回落到对话模型，所以「摘要模型名为空」不算不支持
      if (role === 'summarize') {
        const own = await settings.getString(MODEL_KEYS.summarize)
        if (own.trim() !== '') return true
        return (await settings.getString(MODEL_KEYS.chat)).trim() !== ''
      }

      const model = await settings.getString(MODEL_KEYS[role])
      return model.trim() !== ''
    },

    async adapter(role): Promise<ModelAdapter> {
      if (!(await this.supports(role))) {
        throw new Error(`模型角色 ${role} 不可用：先配置 model.apiKey 与 ${MODEL_KEYS[role]}`)
      }

      const resolved = await resolve(settings, role)
      const instance =
        role === 'embed'
          ? buildEmbedding(resolved)
          : role === 'summarize'
            ? buildSummarize(resolved)
            : buildChat(resolved)

      return { role, model: resolved.model, instance }
    },

    async probe(role) {
      // 探测**不走 adapter()**：那样只能拿到 unknown，还得再断言一次。
      // 这里直接用具体类型的工厂，类型是完整的
      try {
        if (role === 'embed') return await probeEmbedding()
        if (role === 'summarize') return await probeSummarize()
        return await probeChat(role)
      } catch (error) {
        return { ok: false, message: describeError(error) }
      }
    },
  }
}

/**
 * 把异常说成人话。
 *
 * 探测的价值全在这句话上：用户点「测试连接」失败时要知道**改哪里**——
 * 是地址、密钥，还是模型名。只说「失败」等于把排查推回给用户。
 */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''
  const status = (error as { status?: number }).status

  /**
   * 连接类错误要看**三处**：`name`、`message`、以及 `cause`。
   *
   * 实测（把 baseURL 指向一个不存在的端口）：OpenAI SDK 抛的是
   * `APIConnectionError`，而 `message` 只有一句 `"Connection error."`——
   * 里面既没有地址也没有 errno。只看 message 就会把这个原因原样显示给用户，
   * 而那句话完全不可执行（用户不知道是地址错了还是网断了）。
   *
   * `cause` 里才是底层的 `ECONNREFUSED 127.0.0.1:9`，所以它必须一起看。
   */
  const cause = (error as { cause?: unknown }).cause
  const causeText = cause instanceof Error ? `${cause.message}` : ''
  const haystack = `${name} ${message} ${causeText}`

  if (status === 401 || /unauthorized|invalid.*api.?key|鉴权/i.test(haystack)) {
    return '鉴权失败：API 密钥不对，或它不属于这个端点'
  }
  if (status === 404 || /not found|no such model|model.*not.*exist/i.test(haystack)) {
    return `模型名或路径不对（${message.slice(0, 80)}）。检查接口地址是否带 /v1，以及模型名是否已下架`
  }
  if (status === 429 || /rate limit|限流/i.test(haystack)) {
    return '被限流了。稍后重试，或检查账户额度'
  }

  const isNetwork =
    /APIConnectionError|Connection error/i.test(haystack) ||
    /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|network|超时|timeout/i.test(haystack)

  if (isNetwork) {
    // 把底层原因带出来——没有它，用户只知道「连不上」，不知道连的是哪里
    const detail = causeText || message
    return `连不上：${detail.slice(0, 120)}。检查「接口地址」是否可达、端口是否正确`
  }

  return message.slice(0, 200)
}
