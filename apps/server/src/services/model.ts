import { chat, embed, summarize } from '@tanstack/ai'
import type { ModelRole } from '@mimir/shared'
import { assemble } from '../plugins/host.js'

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

/** 一次性对话。`role` 由调用方决定用 chat 还是 reasoning */
export async function callChat(options: ModelCallOptions & { stream: false }): Promise<string> {
  const adapter = await adapterFor(options.role)

  const params = {
    adapter,
    stream: false,
    ...(options.systemPrompts ? { systemPrompts: options.systemPrompts } : {}),
    messages: options.messages,
    ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
  }

  return chat(params as ChatOptions)
}

/** 流式对话。返回 TanStack AI 的 chunk 流，由调用方按协议转发 */
export async function streamChat(options: ModelCallOptions & { stream: true }) {
  const adapter = await adapterFor(options.role)

  const params = {
    adapter,
    stream: true,
    ...(options.systemPrompts ? { systemPrompts: options.systemPrompts } : {}),
    messages: options.messages,
    ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
  }

  return chat(params as ChatOptions)
}

/** 向量化。M1-B 的嵌入流程用它 */
export async function callEmbed(input: string[]): Promise<number[][]> {
  const adapter = await adapterFor('embed')

  const result = await embed({
    adapter,
    input,
  } as Parameters<typeof embed>[0])

  return result.embeddings.map((item) => item.vector ?? [])
}

/**
 * 摘要。**用 summarize 角色**，不是拿 chat 假装——
 * 两者的适配器与选项形状都不同（`docs/TECH.md` §5.2）。
 */
export async function callSummarize(text: string): Promise<string> {
  const adapter = await adapterFor('summarize')

  const result = await summarize({
    adapter,
    text,
    stream: false,
  } as Parameters<typeof summarize>[0])

  // 返回的是 { summary } 而不是字符串——这个形状与 chat 不同，
  // 所以调用方不能把两者互换使用（docs/TECH.md §5.2 的第 3 条边界）
  return (result as { summary: string }).summary
}
