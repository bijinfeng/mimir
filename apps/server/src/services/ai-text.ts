import type { UsageSource } from '@mimir/shared'
import type { RewriteAction } from '@mimir/shared'
import { callChat, callSummarize, modelName, modelReady } from './model.js'

/**
 * 「文本进、文本出」的三条能力：摘要、AI 标签建议、内联改写
 * （`.trellis/spec/project/product.md` §4 M1）。
 *
 * ## 为什么三条能力共用一个文件
 *
 * 它们的形状完全一样——**给模型一段文本，要回一段文本**。差别只在
 * 提示词与「输出怎么解释」。各写一个文件会让三处各自处理
 * 「没配模型怎么办」「模型挂了怎么办」，而那是同一个问题的三份答案。
 *
 * ## 没配模型时**如实说**，不静默降级
 *
 * 摘要与改写没有「本地兜底」这种东西——摘要不出来就是摘要不出来。
 * 所以这条路返回 `usedModel: false` 与一句说明，界面据此说
 * 「需要先配置模型」，而不是显示一段看似成功的空文本。
 * （注意这与问答的「只检索」路径不同：那条**有**本地可做的事，
 * 所以它是一条真实的产品路径，见 `assistant.ts` 的头注释。）
 *
 * ## 用哪个角色
 *
 * | 能力 | 角色 | 为什么 |
 * |---|---|---|
 * | 摘要 | `summarize` | 它有自己的适配器与调用形状（§5.2 的第 3 条边界） |
 * | 标签建议 | `chat` | 要的是分类判断能力，与对话同一类 |
 * | 内联改写 | `chat` | 要的是生成质量，与对话同一类 |
 */

/** 摘要：一段话，不要小标题、不要列表——界面位置只有几行 */
const SUMMARY_PROMPT = `把下面的内容总结成一段话。要求：
1. 只写 2–3 句，直接说「讲了什么」，不要写「本文介绍了」这类套话
2. 保留具体的技术名词、数字与人名——它们是这段话里最有价值的部分
3. 用中文。如果原文是英文，也用中文总结
4. 不要加小标题、列表或 Markdown 标记，就是一段连贯的话`

/** 标签建议：一行一个，便于机械切分 */
const TAGS_PROMPT = `从下面的内容里提取 3–6 个标签。要求：
1. 每个标签 2–8 个字，是**名词或专有名词**（如「向量检索」「React Compiler」）
2. 不要出现「总结」「介绍」「技术」这类没有区分度的词
3. 每行一个标签，不要编号、不要逗号、不要引号
4. 只输出标签本身，不要任何解释`

/** 四种改写动作的指令。它们是产品文案的一部分，会随反馈调整 */
const REWRITE_PROMPTS: Record<RewriteAction, string> = {
  rewrite: '把下面的内容改写一遍：保持原意与信息量，但换一种更清楚的说法',
  translate: '把下面的内容翻译成中文。如果原文已经是中文，就翻译成英文',
  shorten: '把下面的内容精简：只保留核心信息，删掉重复与铺垫，篇幅压到原文的一半左右',
  expand: '把下面的内容扩写：补充必要的背景与细节，让不熟悉这个话题的人也能看懂',
}

/** 改写动作的中文名，用在「没配模型」的说明里 */
const REWRITE_LABELS: Record<RewriteAction, string> = {
  rewrite: '改写',
  translate: '翻译',
  shorten: '精简',
  expand: '扩写',
}

export interface AiTextOutcome {
  text: string
  model: string
  usedModel: boolean
}

/**
 * 没配模型时的说明。
 *
 * **明确说没花钱**——与失败路径的规矩一致（`.trellis/spec/project/product.md` §5.8：
 * 失败路径要回答「这次花钱了吗」）。
 */
function notConfigured(feature: string): AiTextOutcome {
  return {
    text: `${feature}需要先配置模型（设置 › 模型 › 任务分配）。没有调用模型，也没有产生费用。`,
    model: '',
    usedModel: false,
  }
}

/**
 * 生成摘要。走 `summarize` 角色——它有自己的适配器与调用形状（§5.2）。
 *
 * 摘要有**回落**：`summarize` 角色留空时会用对话模型（TECH §5.7 的
 * 「留空回落 chat」）。所以判据是 `modelReady('summarize')`——
 * provider 自己解析回落，这里不需要知道那么多。
 */
export async function summarizeText(text: string, refId?: string): Promise<AiTextOutcome> {
  if (!(await modelReady('summarize'))) return notConfigured('自动摘要')

  const model = await modelName('summarize')

  /**
   * 提示词与正文之间用明确的分隔线隔开。
   *
   * 正文是**用户的内容**，而笔记里完全可以写着「忽略上面的要求」——
   * 纯拼接会让那句话看起来像指令。分隔线不解决提示注入（没有任何
   * 文本手段能彻底解决），但它让「哪里是指令、哪里是素材」在提示里
   * 有明确的边界，模型照做的概率低得多。
   */
  const summary = await callSummarize(`${SUMMARY_PROMPT}\n\n---\n${text}`, refId ?? null)
  return { text: summary, model, usedModel: true }
}

/**
 * AI 标签建议。
 *
 * 输出是「一行一个标签」的文本，这里做**机械清洗**：去掉编号、引号与
 * 项目符号，丢掉空行与过长的行。不让模型直接输出 JSON——它常常会加上
 * ```json 围栏或一段解释，而那些都要在这里再剥一层；一行一个的容错率高得多。
 */
export async function suggestTagsAi(
  title: string,
  body: string,
  options: { exclude?: readonly string[]; refId?: string } = {},
): Promise<{ tags: string[]; model: string; usedModel: boolean }> {
  if (!(await modelReady('chat'))) {
    return { tags: [], model: '', usedModel: false }
  }

  const model = await modelName('chat')
  const content = `标题：${title}\n\n${body.slice(0, 6000)}`
  const raw = await callChatOnce(`${TAGS_PROMPT}\n\n---\n${content}`, 'tag', options.refId)

  const excluded = new Set((options.exclude ?? []).map((tag) => tag.toLowerCase()))

  const tags = raw
    .split('\n')
    .map((line) =>
      line
        // 编号（`1. ` / `1、`）与项目符号
        .replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '')
        // 引号与首尾空白
        .replace(/^["'「『]+|["'」』]+$/g, '')
        .trim(),
    )
    .filter((line) => line.length >= 2 && line.length <= 20)
    .filter((line) => !excluded.has(line.toLowerCase()))
    // 去重（模型偶尔会重复），保持出现顺序
    .filter((line, index, list) => list.indexOf(line) === index)
    .slice(0, 6)

  return { tags, model, usedModel: true }
}

/**
 * 内联改写（`.trellis/spec/project/product.md` §4 M1：选中一段 → 改写 / 翻译 / 精简 / 扩写）。
 *
 * 与摘要的分工：这条路走 `chat` 角色。改写要的是**生成质量**，
 * 而 chat 角色正是为此配置的；`summarize` 角色是给「压缩」用的。
 */
export async function rewriteText(
  text: string,
  action: RewriteAction,
  options: { instruction?: string; refId?: string } = {},
): Promise<AiTextOutcome> {
  if (!(await modelReady('chat'))) return notConfigured(REWRITE_LABELS[action])

  const model = await modelName('chat')

  const parts = [
    REWRITE_PROMPTS[action],
    '',
    '要求：只输出改写后的内容本身，不要任何前言、解释、引号或 Markdown 围栏。',
    // 额外的用户指令（如「面向新手」）放在规则之后、正文之前
    ...(options.instruction ? ['', `补充要求：${options.instruction}`] : []),
    '',
    '---',
    text,
  ]

  const rewritten = await callChatOnce(parts.join('\n'), 'rewrite', options.refId)
  return { text: rewritten, model, usedModel: true }
}

/**
 * 调一次非流式的 `callChat`。
 *
 * 单独包一层是为了把「messages 的形状」收在一处：三处调用各拼一次
 * `[{ role: 'user', content }]` 时，有一处写成 `{ role: 'text' }`
 * 不一定会报错——SDK 可能把它当成空消息，模型于是返回一段无关的话。
 */
async function callChatOnce(prompt: string, source: UsageSource, refId?: string): Promise<string> {
  return callChat({
    role: 'chat',
    messages: [{ role: 'user', content: prompt }] as never,
    stream: false,
    source,
    refId: refId ?? null,
  })
}
