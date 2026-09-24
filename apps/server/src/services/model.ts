import { chat, embed, summarize } from '@tanstack/ai'
import type { ChatMiddleware, FinishInfo, StreamChunk } from '@tanstack/ai'
import type { ModelRole, UsageSource } from '@mimir/shared'
import { assemble } from '../plugins/host.js'
import { describeModel, effectiveTokens, record, tokenFields } from './usage.js'

/**
 * 模型调用的宿主侧入口。
 *
 * 这一层只做一件事：**问 provider 接缝要一个能干活的东西，然后调它**。
 * 具体用哪个工厂（`openaiCompatible` / `createOpenaiSummarize` /
 * `createOpenaiEmbedding`）、模型名怎么断言、密钥从哪来，全在
 * `plugins/provider/` 里——宿主不知道这些细节。
 *
 * 重构前这段逻辑在 `assistant.ts` 与 `assistant-stream.ts` 各抄了一份
 * （两份 `openaiCompatible`），改动模型配置要同时改两处。现在只有一份。
 *
 * ## 记账也放在这里，理由与上面同一条
 *
 * **它是唯一一条会把请求发出去的收口点**，所以用量记账放这里就不可能出现
 * 「新加一条调用路径忘了记账」（`docs/TECH.md` §12.7、D-034）。
 * 记账本身是旁路——`record()` 永不抛错，记不上账不能让问答失败。
 *
 * ## 契约边界上的断言
 *
 * `ModelAdapter.instance` 是 `unknown`（契约包不依赖 TanStack AI）。
 * 断言只在这个文件里发生，且紧贴着调用点——换模型 SDK 时改动范围可见。
 */

/**
 * 消息数组直接沿用 SDK 的类型。
 *
 * 不用自定义的 `{ role: 'user' | 'assistant'; content: string }`：流式问答的
 * 历史**由客户端经 AG-UI 带过来**，里面可能有 tool 角色或 parts 形式的 content，
 * 服务端只是把它转发给模型。自己收窄成两种角色，会在转发处产生一个
 * 只为满足类型而做的转换——那层转换不校验、不清理，纯粹是装饰。
 */
type ChatMessages = Parameters<typeof chat>[0]['messages']

export interface ModelCallOptions {
  role: ModelRole
  systemPrompts?: string[]
  messages: ChatMessages
  stream: boolean
  modelOptions?: Record<string, unknown>
  /**
   * 这次调用属于哪个功能。**必填**——记成一个笼统的 'chat' 会让
   * 「摘要花了多少」这个问题永远查不出来，而那正是分功能记账的目的。
   */
  source: UsageSource
  /** 会话 id 或文档 id，用于「这次调用是给哪篇/哪次对话花的」 */
  refId?: string | null
}

/**
 * 记一次账。**所有采集点都走这里**，保证四个字段的取法只有一份。
 *
 * `startedAt` 由调用方给：耗时是「从这个时刻到记账时刻」，
 * 而记账发生在调用之后，在这里取 `performance.now()` 只会得到 0。
 */
async function account(
  options: { role: ModelRole; source: UsageSource; refId?: string | null },
  startedAt: number,
  usage: unknown,
  failure: { ok: false; kind: string } | { ok: true } = { ok: true },
): Promise<void> {
  const tokens = tokenFields(usage)
  const described = await describeModel(options.role)

  await record({
    role: options.role,
    source: options.source,
    model: described.model,
    providerId: described.providerId,
    baseUrlHost: described.baseUrlHost,
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    totalTokens: tokens.totalTokens,
    durationMs: Math.round(performance.now() - startedAt),
    ok: failure.ok,
    failureKind: failure.ok ? null : failure.kind,
    refId: options.refId ?? null,
  })
}

/**
 * 「这次调用的用量」的容器。
 *
 * 非流式与流式都要用它，但**取值时机不同**：
 *
 * | | 谁填它 | 什么时候填 |
 * |---|---|---|
 * | 非流式 | `middleware.onFinish` | `chat()` resolve 之前 |
 * | 流式 | 同左 | 流**被消费完**之后（适配器为了拿到末尾的 usage chunk，刻意把 `RUN_FINISHED` 推迟到那时） |
 *
 * 所以它必须是一个**在流之外**的对象——这也是流式那条要包一层生成器的原因：
 * 记账要等流走完，而 `chat()` 返回时流还没开始走。
 *
 * `ok` 由 `onError` 翻成 false。让 middleware 记失败而不是只靠 catch：
 * 连接类错误是**顺着流**发出来的（`RUN_ERROR` chunk），不抛异常——
 * 只靠 catch 会漏掉最常见的那一类失败。
 */
function usageTracker(): {
  middleware: ChatMiddleware[]
  state: { ok: boolean; usage: unknown }
} {
  const state = { ok: true, usage: undefined as unknown }

  return {
    state,
    middleware: [
      {
        name: 'usage-accounting',
        onFinish: (_ctx, info: FinishInfo) => {
          state.usage = info.usage
        },
        onError: () => {
          state.ok = false
        },
      },
    ],
  }
}

/** 当前是否有可用的 provider（决定问答走「调模型」还是「只检索」） */
export async function modelReady(role: ModelRole = 'chat'): Promise<boolean> {
  const { seams } = assemble()
  const provider = seams.provider.implementations()[0]
  if (!provider) return false

  try {
    return await provider.impl.supports(role)
  } catch {
    // 取密钥失败（解密不了）也算不可用：问答会走只检索路径，
    // 而界面上「模型」分区会显示解密失败的提示
    return false
  }
}

/** 取某个角色的模型名。用于 trace 与界面上显示「这次用的哪个模型」 */
export async function modelName(role: ModelRole): Promise<string> {
  const { seams } = assemble()
  const provider = seams.provider.implementations()[0]
  if (!provider) return ''

  try {
    const adapter = await provider.impl.adapter(role)
    return adapter.model
  } catch {
    return ''
  }
}

async function adapterFor(role: ModelRole): Promise<unknown> {
  const { seams } = assemble()
  const provider = seams.provider.implementations()[0]
  if (!provider) {
    throw new Error('没有注册任何模型提供方插件')
  }

  return (await provider.impl.adapter(role)).instance
}

/**
 * 调用 TanStack AI 时的**唯一成本**：一次类型断言。
 *
 * 为什么需要它：SDK 的 `chat()` 是从适配器**静态推断**选项类型的
 * （`modelOptions` 具体能写什么键取决于适配器的泛型参数）。而我们的适配器
 * 是运行时从插件接缝取出来的，类型是 `unknown`——静态推断在此不成立。
 *
 * 断言写在整个调用上，而不是把适配器断言成 `never`：后者会把泛型推成
 * `never`，连 `messages` 都通不过，于是要在每个字段上再断言一次——
 * 那是「契约没有落到位」的典型症状。
 */
type ChatOptions = Parameters<typeof chat>[0]

/**
 * 把运行时拼出来的 middleware 挂到参数上。
 *
 * **为什么这里必須过一次 `unknown`**：SDK 的 `middleware` 选项类型是
 * `ExactMiddlewareOption`，它是从**字面量数组**推断出来的泛型——
 * 换成运行时构造的数组，那个泛型会收成 `undefined`，于是「有 middleware」
 * 在类型上与「没有 middleware」不可区分，直接断言会报「两者不重叠」。
 *
 * 这不影响 `messages` / `modelOptions` 的检查：上面的 `params` 对象各自
 * 带着类型（`messages` 是 `Parameters<typeof chat>[0]['messages']`），
 * 只有这一处注入是绕过的。
 */
function withMiddleware<T extends object>(params: T, middleware: ChatMiddleware[]): ChatOptions {
  return { ...params, middleware } as unknown as ChatOptions
}

/** 一次性对话。`role` 由调用方决定用 chat 还是 reasoning */
export async function callChat(options: ModelCallOptions & { stream: false }): Promise<string> {
  const adapter = await adapterFor(options.role)
  const startedAt = performance.now()
  const { middleware, state } = usageTracker()

  const params = {
    adapter,
    stream: false,
    ...(options.systemPrompts ? { systemPrompts: options.systemPrompts } : {}),
    messages: options.messages,
    ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
  }

  try {
    const text = await chat(withMiddleware(params, middleware))
    await account(
      options,
      startedAt,
      state.usage,
      state.ok ? { ok: true } : { ok: false, kind: 'unknown' },
    )
    return text
  } catch (error) {
    // 抛出的失败也要入账——「失败的调用可能已经计费」是失败不能漏记的原因之一
    await account(options, startedAt, state.usage, { ok: false, kind: classify(error) })
    throw error
  }
}

/** 把异常映射成一个简短的分类串。与 assistant-stream 的 classifyFailure 同一套取值 */
function classify(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number }).status

  if (status === 402 || /quota|balance|insufficient|余额/i.test(message)) return 'quota'
  if (status === 429 || /rate limit|限流/i.test(message)) return 'quota'
  if (status === 408 || /timeout|timed out|超时/i.test(message)) return 'timeout'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|不可达/i.test(message)) return 'offline'
  if (/length|max_tokens|truncat|截断/i.test(message)) return 'truncated'
  return 'timeout'
}

/**
 * 流式对话。返回 TanStack AI 的 chunk 流，由调用方按协议转发。
 *
 * ## 为什么包一层生成器，而不是在调用方记账
 *
 * 两个原因，各对应一类会静默出错的情况：
 *
 * 1. **用量的 chunk 在末尾才到**（适配器为了拿到它，刻意把 `RUN_FINISHED`
 *    推迟到迭代结束）。所以只能边透传边看，不能在 `chat()` 返回时就记账
 * 2. **记账逻辑不出这个文件**——调用方一行都不用改，将来加一条流式路径
 *    也不可能忘。这正是当初把适配器收口到 `model.ts` 换来的收益
 *
 * 透传必须**逐 chunk 原样**：中间消费掉一个 chunk 会让前端少一段正文，
 * 而那种缺失看起来像「模型偶尔抽风」。
 */
export async function streamChat(options: ModelCallOptions & { stream: true }) {
  const adapter = await adapterFor(options.role)
  const startedAt = performance.now()
  const { middleware, state } = usageTracker()

  const params = {
    adapter,
    stream: true,
    ...(options.systemPrompts ? { systemPrompts: options.systemPrompts } : {}),
    messages: options.messages,
    ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
  }

  const stream = await chat(withMiddleware(params, middleware))

  /**
   * chunk 的类型写 `StreamChunk`（SDK 从包入口导出的公开联合），
   * 而不是从这次调用的返回里推。
   *
   * 推不出来：`chat()` 的返回类型依赖适配器泛型，而我们的适配器是运行时
   * 从接缝取出的 `unknown`，于是返回类型会收成 `never`——用它标注生成器
   * 会让调用方拿到 `never`，`assistant-stream` 里 `yield chunk` 就通不过
   * AG-UI 的 chunk 类型。`StreamChunk` 是同一个东西的公开名字。
   */
  async function* accounted(): AsyncGenerator<StreamChunk> {
    let failed: string | null = null

    try {
      for await (const chunk of stream as AsyncIterable<StreamChunk>) {
        // RUN_FINISHED 的 usage 由 middleware 收（它在流走完时才有值）。
        // 这里只看错误，因为连接类错误是顺着流来的、不抛异常
        const type = (chunk as { type?: string }).type
        if (type === 'RUN_ERROR') {
          failed = classify((chunk as { message?: string }).message ?? '模型调用失败')
        }
        yield chunk
      }
    } catch (error) {
      failed = classify(error)
      throw error
    } finally {
      /**
       * **`finally` 而不是循环之后的代码。** 消费者中途放弃（前端关页面、
       * 用户取消）时生成器的 `.return()` 会在 `yield` 处终止它——
       * 循环后的语句不执行，而那一类正是最需要记下来的：
       * 模型已经在算，钱已经花了，只是没人等结果。
       *
       * 这也是「记账必须在 model.ts 里」的一个具体好处：调用方不需要知道
       * 自己放弃时还得补一次账。
       */
      await account(
        options,
        startedAt,
        state.usage,
        failed === null && state.ok ? { ok: true } : { ok: false, kind: failed ?? 'aborted' },
      )
    }
  }

  return accounted()
}

/** 向量化。M1-B 的嵌入流程用它 */
export async function callEmbed(input: string[], refId?: string | null): Promise<number[][]> {
  const adapter = await adapterFor('embed')
  const startedAt = performance.now()

  try {
    const result = await embed({
      adapter,
      input,
    } as Parameters<typeof embed>[0])

    /**
     * `result.usage` 一直是有的，重构前被丢掉了。
     * 补上它等于零成本地让「嵌入花了多少」可查，而那是量最大的一个角色
     * （一次补嵌入可能几百个分块）。
     */
    await account(
      { role: 'embed', source: 'embed', refId: refId ?? null },
      startedAt,
      (result as { usage?: unknown }).usage,
    )

    return result.embeddings.map((item) => item.vector ?? [])
  } catch (error) {
    await account({ role: 'embed', source: 'embed', refId: refId ?? null }, startedAt, undefined, {
      ok: false,
      kind: classify(error),
    })
    throw error
  }
}

/**
 * 摘要。**用 summarize 角色**，不是拿 chat 假装——
 * 两者的适配器与选项形状都不同（`docs/TECH.md` §5.2）。
 */
export async function callSummarize(text: string, refId?: string | null): Promise<string> {
  const adapter = await adapterFor('summarize')
  const startedAt = performance.now()

  try {
    const result = await summarize({
      adapter,
      text,
      stream: false,
    } as Parameters<typeof summarize>[0])

    /**
     * 摘要的 usage 直接读返回值——它走的是 summarize activity，不是 chat，
     * 所以拿不到 `middleware.onFinish`。**形状不同正是要分成两个角色的原因**
     * （`docs/TECH.md` §5.2 的第 3 条边界）。
     */
    await account(
      { role: 'summarize', source: 'summary', refId: refId ?? null },
      startedAt,
      (result as { usage?: unknown }).usage,
    )

    // 返回的是 { summary } 而不是字符串——这个形状与 chat 不同，
    // 所以调用方不能把两者互换使用
    return (result as { summary: string }).summary
  } catch (error) {
    await account(
      { role: 'summarize', source: 'summary', refId: refId ?? null },
      startedAt,
      undefined,
      { ok: false, kind: classify(error) },
    )
    throw error
  }
}

export { effectiveTokens, tokenFields }
