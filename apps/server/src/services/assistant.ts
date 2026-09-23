import type { AskInput, AskResponse, Citation, FailureKind, Trace, TraceStep } from '@mimir/shared'
import { toQueryText } from '@mimir/tokenizer'
import { search } from '../search/index.js'
import { appendMessage, getConversation } from './conversations.js'
import { callChat, modelReady } from './model.js'
import { getDocument } from './documents.js'

/**
 * 问答。
 *
 * 两条路径，按**有没有配模型**分叉，而不是按用户选了什么：
 *
 *  1. 配了 `MODEL_API_KEY`：检索 → 组装上下文 → 调模型 → 带引用回答
 *  2. 没配（或显式 scope=search）：只检索，把命中的分块列出来
 *
 * 第二条不是「降级」而是**产品的一部分**：`docs/PRD.md` §5.8 明确要求
 * 「网络不可达时只用检索不调模型」——检索在本地 Postgres、笔记在本地文件，
 * 离线不是全盘瘫痪。所以这条路径要能独立工作，并且明确告诉用户
 * 「没有调模型，所以没花钱」。
 *
 * 关于 trace：这些数字全部来自**真实的检索结果**，不是渲染时编的。
 * 编的数字比没有数字更糟——用户会拿它做判断（「是没存过还是分词没匹配上」），
 * 而假数字会让他得出错误结论。见 `docs/PRD.md` §5.6。
 */

/** 上下文预算。按字符数粗略限制，避免把整库塞进 prompt。 */
const CONTEXT_CHAR_BUDGET = 6000

/** 每个命中给多少字的原文。比检索片段长，让模型有足够上下文 */
const PER_CITATION_CHARS = 1200

const SYSTEM_PROMPT = `你是 mimir 的问答助手，帮用户回顾他自己的知识库。

规则：
1. 只根据【资料】回答。资料里没有的内容，明确说「知识库里没有相关记录」，不要用通用知识补全。
2. 资料里的事实要标注来源编号，写成 [1] [2] 这样的形式。
3. 用中文回答，简洁直接。不要写「根据提供的资料」这类套话。
4. 如果资料只能部分回答问题，说明哪部分能答、哪部分没有记录。`

export interface AskParams extends AskInput {
  conversationId: string
}

export async function ask(params: AskParams): Promise<AskResponse> {
  // 先落用户消息：即使后面模型调用失败，用户的提问也不会丢
  const userMessage = await appendMessage({
    conversationId: params.conversationId,
    role: 'user',
    text: params.question,
  })

  const retrieval = await retrieve(params)

  const wantsSearchOnly = params.scope === 'search' || !(await modelReady('chat'))
  if (wantsSearchOnly) {
    const assistant = await appendMessage({
      conversationId: params.conversationId,
      role: 'assistant',
      text: searchOnlyAnswer(params.question, retrieval.citations),
      trace: retrieval.trace,
      citations: retrieval.citations,
    })
    return { conversationId: params.conversationId, messages: [userMessage, assistant] }
  }

  try {
    const answer = await callModel(params, retrieval)
    const assistant = await appendMessage({
      conversationId: params.conversationId,
      role: 'assistant',
      text: answer,
      // 耗时在这里才完整（包含模型调用），所以回来补上
      trace: { ...retrieval.trace, tookMs: Math.round(performance.now() - retrieval.startedAt) },
      citations: retrieval.citations,
    })
    return { conversationId: params.conversationId, messages: [userMessage, assistant] }
  } catch (error) {
    // 失败路径每类给不同出路（docs/PRD.md §5.8）。这里把异常映射成
    // 前端能识别的一类，前端据此渲染对应的出路按钮，而不是统一一个「重试」。
    const assistant = await appendMessage({
      conversationId: params.conversationId,
      role: 'assistant',
      text: error instanceof Error ? error.message : String(error),
      trace: { ...retrieval.trace, tookMs: Math.round(performance.now() - retrieval.startedAt) },
      citations: retrieval.citations,
      failure: classifyFailure(error),
    })
    return { conversationId: params.conversationId, messages: [userMessage, assistant] }
  }
}

interface Retrieval {
  citations: Citation[]
  trace: Trace
  /** 组装好的上下文文本，仅在调模型时用到 */
  context: string
  /** 命中数，用于 trace */
  total: number
  hitDocumentCount: number
  /** 检索开始时刻。总耗时要把模型调用算进去，所以起点要带出来 */
  startedAt: number
}

/**
 * 检索 + 组装引用。
 *
 * `scope=document` 时把检索范围锁到单篇——对应原型输入框里那个
 * 「范围：当前文档」pill，也是文档工具条「问 AI」的行为。
 */
async function retrieve(params: AskParams): Promise<Retrieval> {
  const startedAt = performance.now()
  const steps: TraceStep[] = [{ icon: 'think', text: '先把问题拿去知识库里找相关内容' }]

  const keywords = toQueryText(params.question).split(' ').filter(Boolean)
  steps.push({
    icon: 'search',
    text: '用 jieba 切分查询词',
    keywords,
  })

  if (params.scope === 'document' && params.documentId) {
    const doc = await getDocument(params.documentId)
    if (!doc) {
      steps.push({ icon: 'check', text: '指定的文档不存在，改为检索全库' })
      return {
        citations: [],
        trace: finishTrace(steps, 0, 0, startedAt),
        context: '',
        total: 0,
        hitDocumentCount: 0,
        startedAt,
      }
    }

    // 单篇模式下不做通道召回：用户已经指明是哪一篇，
    // 再跑一遍检索只会引入「为什么搜的是这篇但引用了别的」的困惑
    const snippet = doc.body.slice(0, PER_CITATION_CHARS)
    steps.push({
      icon: 'read',
      text: '范围限定在这一篇，读取全文',
      meta: `${doc.body.length} 字`,
    })

    const citation: Citation = {
      documentId: doc.id,
      kind: doc.kind,
      title: doc.title,
      snippet,
      start: 0,
      end: Math.min(snippet.length, doc.body.length),
      matchedBy: ['scope'],
    }

    steps.push({ icon: 'check', text: '确认没有遗漏，生成回答' })
    return {
      citations: [citation],
      trace: finishTrace(steps, 1, 1, startedAt),
      context: formatContext([citation]),
      total: 1,
      hitDocumentCount: 1,
      startedAt,
    }
  }

  const result = await search({ q: params.question, limit: 8 })

  if (result.hits.length > 0) {
    // 这一行是 trace 里最有信息量的一条：它区分了「词级命中」与「子串兜底命中」。
    // 用户看到「子串兜底 1 段」时就知道是分词没切对但被兜住了，
    // 看到两个都是 0 才是真的没存过。见 docs/PRD.md §5.6。
    //
    // 契约里的 matchedBy 是 ['keyword','vector']，而 M0 实际注册的通道是
    // keyword / substring。这里按通道名直接统计，避免依赖枚举——
    // M1 加向量通道时这一行不用改。
    const byChannel = (name: string) =>
      result.hits.filter((hit) => (hit.matchedBy as string[]).includes(name)).length

    steps.push({
      icon: 'search',
      text: '通道召回结果',
      meta: `词级召回 ${byChannel('keyword')} 段 · 子串兜底 ${byChannel('substring')} 段`,
    })
  }

  const citations = buildCitations(result.hits)
  const hitDocumentCount = new Set(citations.map((item) => item.documentId)).size

  if (citations.length > 0) {
    steps.push({
      icon: 'read',
      text: '读取命中的文档并合并相邻分块',
      meta: `来自 ${hitDocumentCount} 个文档，共 ${citations.length} 个分块`,
    })
  }

  steps.push({
    icon: 'check',
    text: citations.length > 0 ? '确认没有遗漏，生成回答' : '知识库里没有找到相关内容',
  })

  return {
    citations,
    trace: finishTrace(steps, 1, result.hits.length > 0 ? 2 : 1, startedAt),
    context: formatContext(citations),
    total: citations.length,
    hitDocumentCount,
    startedAt,
  }
}

function buildCitations(hits: Awaited<ReturnType<typeof search>>['hits']): Citation[] {
  const citations: Citation[] = []
  let budget = CONTEXT_CHAR_BUDGET

  for (const hit of hits) {
    if (budget <= 0) break
    const text = hit.snippet.text.slice(0, Math.min(PER_CITATION_CHARS, budget))
    budget -= text.length

    citations.push({
      documentId: hit.documentId,
      kind: hit.kind,
      title: hit.title,
      snippet: text,
      start: hit.snippet.start,
      end: hit.snippet.start + text.length,
      matchedBy: hit.matchedBy,
    })
  }

  return citations
}

/** 组装成带编号的上下文，编号与 citations 数组下标一一对应 */
function formatContext(citations: Citation[]): string {
  if (citations.length === 0) return '（知识库里没有检索到相关内容）'

  return citations
    .map((cite, index) => `【${index + 1}】${cite.title}\n${cite.snippet}`)
    .join('\n\n---\n\n')
}

/** trace 的收口：轮次、工具数、耗时只在这里算一次，避免各分支各写一遍 */
function finishTrace(steps: TraceStep[], rounds: number, tools: number, startedAt: number): Trace {
  return { rounds, tools, tookMs: Math.round(performance.now() - startedAt), steps }
}

/**
 * 没有模型时的回答。
 *
 * 刻意不生成「我找到了 N 条内容」这种话术——那是模型该做的事。
 * 检索路径的职责是把命中的原文**原样**交给用户，并说清楚没有花钱。
 */
function searchOnlyAnswer(question: string, citations: Citation[]): string {
  if (citations.length === 0) {
    return `知识库里没有找到与「${question}」相关的内容。\n\n如果确认存过，可能是分词没切对——试试换个说法，或者检查该文档是否已重建索引。`
  }

  const lines = citations.map(
    (cite, index) =>
      `${index + 1}. 《${cite.title}》\n   ${cite.snippet.slice(0, 200).replace(/\n/g, ' ')}…`,
  )

  return [
    `没有调用模型（未配置，或你选了「只用检索」）。下面是检索命中的 ${citations.length} 个分块，原文未经过改写：`,
    '',
    ...lines,
  ].join('\n')
}

async function callModel(params: AskParams, retrieval: Retrieval): Promise<string> {
  // 对话历史作为上下文带上，让追问能接住上文。
  // 截断到最近若干轮：更早的内容对当前问题帮助有限，却会挤掉检索到的原文。
  const history = await loadHistory(params.conversationId, 6)

  // 适配器不再在这里构造——它在 provider 接缝里（plugins/provider/）。
  // 宿主只知道「要哪个角色」，不知道用的是哪个工厂、模型名怎么断言
  return callChat({
    role: params.deepReasoning ? 'reasoning' : 'chat',
    stream: false,
    systemPrompts: [SYSTEM_PROMPT],
    messages: [
      ...history,
      {
        role: 'user',
        content: `【资料】\n${retrieval.context}\n\n【问题】\n${params.question}`,
      },
    ],
  })
}

async function loadHistory(
  conversationId: string,
  limit: number,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const conversation = await getConversation(conversationId)
  if (!conversation) return []

  return (
    conversation.messages
      .filter((message) => !message.failure && message.text.trim())
      .slice(-limit)
      // 最后一条是本次提问，已经单独带上下文传了，避免重复
      .slice(0, -1)
      .map((message) => ({
        role: message.role,
        content: message.text.slice(0, 1500),
      }))
  )
}

/**
 * 把异常映射成前端能识别的失败类型。
 *
 * 四类的区分是刻意的（`docs/PRD.md` §5.8）：它们对用户的下一步动作完全不同——
 * 额度用尽要去充值或换模型，超时要缩小范围，被截断要接着生成，
 * 网络不可达可以先用检索。合并成一个「失败了」等于把判断推回给用户。
 */
export function classifyFailure(error: unknown): FailureKind {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number }).status

  if (status === 402 || /quota|balance|insufficient|余额/i.test(message)) return 'quota'
  if (status === 408 || /timeout|timed out|超时/i.test(message)) return 'timeout'
  if (status === 429 || /rate limit|限流/i.test(message)) return 'quota'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|不可达/i.test(message)) return 'offline'
  if (/length|max_tokens|truncat|截断/i.test(message)) return 'truncated'

  // 认不出来的当超时处理：它是最温和的一类（可重试、内容没丢），
  // 猜错的代价最小。猜成「额度用尽」会让用户去充值，那是真的花钱。
  return 'timeout'
}
