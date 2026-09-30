import type { StreamChunk } from '@tanstack/ai'
import { chatParamsFromRequestBody, toServerSentEventsResponse } from '@tanstack/ai'
import type { Citation, FailureKind, Trace, TraceStep } from '@mimir/shared'
import { EVENT_CITATIONS, EVENT_CONVERSATION, EVENT_FAILURE, EVENT_TRACE } from '@mimir/shared'
import { toQueryText } from '@mimir/tokenizer'
import { search } from '../search/index.js'
import { appendMessage, createConversation, ensureTitle, getConversation } from './conversations.js'
import { streamChat as streamModelChat, modelReady } from './model.js'
import { getDocument } from './documents.js'

/**
 * 流式问答（AG-UI 协议）。
 *
 * 请求由前端的 `useChat` 生成：body 是 AG-UI 的 `RunAgentInput`，
 * mimir 自己的参数走 `forwardedProps`（`sendMessage(text, { body })` 会合并进去）。
 *
 * ## 为什么会话 id 在 body 里而不是 URL 里
 *
 * 连接地址一旦跟着会话变化，`useChat` 就会**重建 ChatClient**，
 * 而重建会把正在进行的流切断。让地址固定、把 id 放进 forwardedProps，
 * 这个问题就不存在了。代价是新建会话时客户端不知道 id，
 * 所以服务端用 `mimir.conversation` 事件回传。
 *
 * ## 事件顺序
 *
 *   conversation → trace → citations → 正文
 *
 * 前几个在**模型还没开始生成时**就发出去，于是引用卡片与检索过程
 * 立刻出现，用户不会对着空白等模型。
 *
 * 为什么用自定义事件而不是协议原生的 part：trace 是结构化的分步记录
 * （每步带图标、关键词、具体数字），而原生 thinking part 只是一个字符串；
 * citations 含文档 id 与字符偏移，协议里也没有对应形状。
 */

/** forwardedProps 里 mimir 自己的字段 */
interface MimirProps {
  conversationId?: string
  documentId?: string
  deepReasoning?: boolean
  /**
   * 只用检索，不调模型（与 `/ask` 的 `scope` 语义对齐）。
   *
   * 失败卡片上的「只检索，不调模型」是 PRD §5.8 的一类出路，原先的实现是
   * 把「只检索，不调模型，把命中的原文列出来」当成**问题文本**重发——
   * 检索于是拿这句指令去查词、模型也照常被调用，点下去必然再失败一次。
   *
   * 这个字段是那次修复的落点：认它就走下面 `!modelReady` 那条同一条分支
   * （命中原文原样列出、说明没有花钱），只是原因从「没配模型」变成
   * 「用户选了只检索」。
   */
  scope?: 'search'
}

const CONTEXT_CHAR_BUDGET = 6000
const PER_CITATION_CHARS = 1200

const SYSTEM_PROMPT = `你是 mimir 的问答助手，帮用户回顾他自己的知识库。

规则：
1. 只根据【资料】回答。资料里没有的内容，明确说「知识库里没有相关记录」，不要用通用知识补全。
2. 资料里的事实要标注来源编号，写成 [1] [2] 这样的形式。
3. 用中文回答，简洁直接。不要写「根据提供的资料」这类套话。
4. 如果资料只能部分回答问题，说明哪部分能答、哪部分没有记录。`

interface Retrieval {
  citations: Citation[]
  trace: Trace
  context: string
}

async function retrieve(question: string, documentId?: string): Promise<Retrieval> {
  const startedAt = performance.now()
  const steps: TraceStep[] = [{ icon: 'think', text: '先把问题拿去知识库里找相关内容' }]

  const keywords = toQueryText(question).split(' ').filter(Boolean)
  steps.push({ icon: 'search', text: '用 jieba 切分查询词', keywords })

  // 单篇模式：用户已经指明是哪一篇，不再跑通道召回。
  // 否则会出现「问的是这篇，引用却来自别的文档」的困惑
  if (documentId) {
    const doc = await getDocument(documentId)
    if (doc) {
      const snippet = doc.body.slice(0, PER_CITATION_CHARS)
      steps.push({
        icon: 'read',
        text: '范围限定在这一篇，读取全文',
        meta: `${doc.body.length} 字`,
      })
      steps.push({ icon: 'check', text: '确认没有遗漏，生成回答' })

      const citation: Citation = {
        documentId: doc.id,
        kind: doc.kind,
        title: doc.title,
        snippet,
        start: 0,
        end: snippet.length,
        matchedBy: ['scope'],
      }

      return {
        citations: [citation],
        trace: { rounds: 1, tools: 1, tookMs: Math.round(performance.now() - startedAt), steps },
        context: formatContext([citation]),
      }
    }
    steps.push({ icon: 'check', text: '指定的文档不存在，改为检索全库' })
  }

  const result = await search({ q: question, limit: 8 })

  const byChannel = (name: string) =>
    result.hits.filter((hit) => (hit.matchedBy as string[]).includes(name)).length

  if (result.hits.length > 0) {
    // 这一行是 trace 里最有信息量的一条：它把「词级命中」与「子串兜底命中」
    // 分开报。看到「子串兜底 1 段」就知道是分词没切对但被兜住了，
    // 两个都是 0 才是真的没存过（docs/PRD.md §5.6）
    steps.push({
      icon: 'search',
      text: '通道召回结果',
      meta: `词级召回 ${byChannel('keyword')} 段 · 子串兜底 ${byChannel('substring')} 段`,
    })
  }

  const citations = buildCitations(result.hits)
  const documentCount = new Set(citations.map((item) => item.documentId)).size

  if (citations.length > 0) {
    steps.push({
      icon: 'read',
      text: '读取命中的文档并合并相邻分块',
      meta: `来自 ${documentCount} 个文档，共 ${citations.length} 个分块`,
    })
  }

  steps.push({
    icon: 'check',
    text: citations.length > 0 ? '确认没有遗漏，生成回答' : '知识库里没有找到相关内容',
  })

  return {
    citations,
    trace: {
      rounds: 1,
      tools: result.hits.length > 0 ? 2 : 1,
      tookMs: Math.round(performance.now() - startedAt),
      steps,
    },
    context: formatContext(citations),
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

/** 编号与 citations 数组下标一一对应，模型引用 [1] 就能对上第一张卡片 */
function formatContext(citations: Citation[]): string {
  if (citations.length === 0) return '（知识库里没有检索到相关内容）'
  return citations
    .map((cite, i) => `【${i + 1}】${cite.title}\n${cite.snippet}`)
    .join('\n\n---\n\n')
}

/**
 * 没有配模型时的回答。
 *
 * 刻意不生成「我找到了 N 条内容」这种话术——那是模型该做的事。
 * 这条路径的职责是把命中的原文**原样**交给用户，并说清楚没有花钱
 * （`docs/PRD.md` §5.8：失败路径要回答「这次花钱了吗」）。
 */
function searchOnlyAnswer(question: string, citations: Citation[]): string {
  if (citations.length === 0) {
    return `知识库里没有找到与「${question}」相关的内容。\n\n如果确认存过，可能是分词没切对——试试换个说法，或者检查该文档是否已重建索引。`
  }

  return [
    `没有调用模型（未配置，或你选了「只用检索」）。下面是检索命中的 ${citations.length} 个分块，原文未经过改写：`,
    '',
    ...citations.map(
      (cite, i) =>
        `${i + 1}. 《${cite.title}》\n   ${cite.snippet.slice(0, 200).replace(/\n/g, ' ')}…`,
    ),
  ].join('\n')
}

/**
 * 把一段纯文本包装成 AG-UI 文本流。
 *
 * 没有模型时也走同一个协议：前端只认一种流形状，不该为「检索模式」
 * 再写一套渲染路径——那样两条路径的差异会日积月累变成两套 UI。
 */
async function* textOnlyStream(text: string): AsyncGenerator<StreamChunk> {
  const messageId = `msg-${Date.now()}`
  yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' } as StreamChunk
  yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: text } as StreamChunk
  yield { type: 'TEXT_MESSAGE_END', messageId } as StreamChunk
}

/** 从 AG-UI 请求体里取 mimir 的参数 */
function mimirProps(forwarded: Record<string, unknown> | undefined): MimirProps {
  const props = forwarded ?? {}
  return {
    ...(typeof props.conversationId === 'string' ? { conversationId: props.conversationId } : {}),
    ...(typeof props.documentId === 'string' ? { documentId: props.documentId } : {}),
    deepReasoning: props.deepReasoning === true,
    ...(props.scope === 'search' ? { scope: 'search' as const } : {}),
  }
}

/** 从 AG-UI 请求体的消息列表里取最后一条用户消息作为本次提问 */
function lastUserQuestion(messages: { role: string; content?: unknown }[]): string {
  const last = messages.findLast((item) => item.role === 'user')
  if (!last) return ''

  if (typeof last.content === 'string') return last.content

  // 多模态消息：content 是 parts 数组，取其中的文本部分
  if (Array.isArray(last.content)) {
    return last.content
      .filter(
        (part): part is { type: string; text?: string } =>
          typeof part === 'object' && part !== null,
      )
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('')
  }

  return ''
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function streamChat(requestBody: unknown): Promise<Response> {
  const parsed = await chatParamsFromRequestBody(requestBody).catch(() => null)
  if (!parsed) {
    return errorResponse(400, 'AGUI_INVALID', '请求体不符合 AG-UI 协议')
  }

  const props = mimirProps(parsed.forwardedProps)
  const question = lastUserQuestion(parsed.messages as { role: string; content?: unknown }[]).trim()

  if (!question) {
    return errorResponse(400, 'INVALID_INPUT', '没有找到用户消息')
  }

  // 会话不存在或没传就新建一个。空会话只在这一瞬间存在，紧接着就落用户消息
  let conversationId = props.conversationId
  let isNew = false

  if (conversationId) {
    const existing = await getConversation(conversationId)
    if (!existing) conversationId = undefined
  }
  if (!conversationId) {
    conversationId = (await createConversation()).id
    isNew = true
  }

  await ensureTitle(conversationId, question)
  // 用户消息先落库：即使模型调用失败，提问本身不会丢
  await appendMessage({ conversationId, role: 'user', text: question })

  const retrieval = await retrieve(question, props.documentId)

  return toServerSentEventsResponse(
    createStream({ conversationId, question, props, retrieval, isNew, requestBody }),
  )
}

interface StreamParams {
  conversationId: string
  question: string
  props: MimirProps
  retrieval: Retrieval
  isNew: boolean
  requestBody: unknown
}

async function* createStream(params: StreamParams): AsyncGenerator<StreamChunk> {
  const { conversationId, question, props, retrieval, isNew } = params
  /**
   * 整轮耗时从这里开始算。
   *
   * `retrieval.trace.tookMs` 只量了检索那一段（常常是几毫秒），而用户在
   * 「思考 N 轮 · 耗时 Xs」里想看的是**这次提问总共等了多久**——包括模型。
   * 用检索的时间会让失败时显示「耗时 0.0s」，看起来像什么都没做。
   */
  const turnStartedAt = performance.now()

  // 让前端拿到会话 id（新会话时它还不知道）
  if (isNew) {
    yield {
      type: 'CUSTOM',
      name: EVENT_CONVERSATION,
      value: { conversationId },
    } as StreamChunk
  }

  /**
   * 检索过程**先发一次**（只有检索耗时）。
   *
   * 必须抢在模型之前发：它就是用来告诉用户「正在检索、检索完了什么」的，
   * 等模型结束再发就失去了意义。代价是此刻还量不到模型的耗时，
   * 所以这一份的 tookMs 只是检索那一段——下面在整轮结束后会**再发一次**
   * 带完整耗时的版本覆盖它。
   */
  yield { type: 'CUSTOM', name: EVENT_TRACE, value: { trace: retrieval.trace } } as StreamChunk
  yield {
    type: 'CUSTOM',
    name: EVENT_CITATIONS,
    value: { citations: retrieval.citations },
  } as StreamChunk

  // 只检索：用户显式选了这条出路，或没配模型。两条走同一条分支——
  // 区别只在 `searchOnlyAnswer` 的措辞里，用户反正都得到一个「没有花钱」的答案
  if (props.scope === 'search' || !(await modelReady('chat'))) {
    const text = searchOnlyAnswer(question, retrieval.citations)
    for await (const chunk of textOnlyStream(text)) yield chunk
    await persistAssistant(conversationId, text, retrieval, null, turnStartedAt)
    return
  }

  // 历史消息由客户端带过来（useChat 维护整段对话），服务端不重复维护一份。
  // 最后一条是本次提问，已经单独带上下文传了，所以去掉避免重复
  const parsed = await chatParamsFromRequestBody(params.requestBody).catch(() => null)
  const history = (parsed?.messages ?? []).slice(0, -1)

  try {
    // 适配器由 provider 接缝提供——这里只说「要哪个角色」。
    // 记账在 model.ts 里完成（它包住了整条流），这里只声明这次是哪个功能的调用
    const stream = await streamModelChat({
      role: props.deepReasoning ? 'reasoning' : 'chat',
      stream: true,
      systemPrompts: [SYSTEM_PROMPT],
      source: 'chat',
      refId: conversationId,
      messages: [
        ...history,
        { role: 'user', content: `【资料】\n${retrieval.context}\n\n【问题】\n${question}` },
      ],
    })

    let answer = ''
    let streamError: string | null = null

    for await (const chunk of stream) {
      // 累积正文用于落库：模型的文本以 TEXT_MESSAGE_CONTENT 的 delta 到达，
      // 而落库要的是完整文本
      const delta = (chunk as { delta?: unknown }).delta
      if (typeof delta === 'string') answer += delta

      /**
       * 失败的两种到达方式，都要处理。
       *
       * 实测（把 baseURL 指向一个不存在的端口）：**连接类错误不会抛出**——
       * 适配器把它转成一个 `RUN_ERROR` chunk 顺着流发出来，于是
       * `for await` 正常结束，下面的 catch 根本不会执行。
       * 只写 catch 的话，前端收到一个没有任何分类信息的 RUN_ERROR，
       * 「每类失败给不同出路」就退化成了一句通用错误。
       *
       * 所以这里既看 chunk，也保留 catch 兜住真正抛出的异常。
       */
      if ((chunk as { type?: string }).type === 'RUN_ERROR') {
        streamError = (chunk as { message?: string }).message ?? '模型调用失败'
      }

      // 失败时不把框架的 RUN_ERROR 直接透传，由下面统一发带分类的事件。
      // 否则前端会先收到一个无分类的错误、再收到一个带分类的，两套说法
      if (streamError === null) yield chunk
    }

    if (streamError !== null) {
      throw new Error(streamError)
    }

    // 整轮结束：再发一次带完整耗时的检索过程，覆盖掉先发的那一份。
    // 这样实时看到的数字与落库的、刷新后重放的数字是同一个
    yield {
      type: 'CUSTOM',
      name: EVENT_TRACE,
      value: { trace: withTurnDuration(retrieval.trace, turnStartedAt) },
    } as StreamChunk

    await persistAssistant(conversationId, answer, retrieval, null, turnStartedAt)
  } catch (error) {
    // 失败路径每类给不同出路（docs/PRD.md §5.8）。分类是**服务端的知识**：
    // 它看得到 HTTP 状态码与原始错误，而前端只看到一句被规范化过的文本。
    const failure = classifyFailure(error)
    const text = error instanceof Error ? error.message : String(error)

    // 失败也留一条助手消息，而不是只在流里报错——刷新之后这条记录还在，
    // 用户能回头查「当时为什么失败」
    await persistAssistant(conversationId, text, retrieval, failure, turnStartedAt)

    // 失败也是「这一轮结束了」，同样要把完整耗时补上——
    // 否则实时看到的永远是先发那份的「耗时 0.0s」
    yield {
      type: 'CUSTOM',
      name: EVENT_TRACE,
      value: { trace: withTurnDuration(retrieval.trace, turnStartedAt) },
    } as StreamChunk

    // 先推自定义事件（带分类），再推协议层的 RUN_ERROR（带原文）。
    // 前端按前者选出路、按后者显示原因，所以两者都要
    yield { type: 'CUSTOM', name: EVENT_FAILURE, value: { failure, message: text } } as StreamChunk
    yield { type: 'RUN_ERROR', message: text } as StreamChunk
  }
}

/**
 * 把检索过程的耗时换成整轮耗时。
 *
 * `retrieval.trace.tookMs` 只量了检索那一段（常常几毫秒），而用户看
 * 「思考 N 轮 · 耗时 Xs」时想知道的是**这次提问总共等了多久**。
 * 用检索的时间会让失败时显示「耗时 0.0s」，看起来像什么都没做。
 */
function withTurnDuration(trace: Trace, turnStartedAt: number): Trace {
  return { ...trace, tookMs: Math.round(performance.now() - turnStartedAt) }
}

async function persistAssistant(
  conversationId: string,
  text: string,
  retrieval: Retrieval,
  failure: FailureKind | null,
  turnStartedAt: number,
): Promise<void> {
  await appendMessage({
    conversationId,
    role: 'assistant',
    text,
    // 与上面推给前端的那一份用同一个函数：两处的耗时必须是同一个数
    trace: withTurnDuration(retrieval.trace, turnStartedAt),
    citations: retrieval.citations,
    failure,
  })
}

/** 把异常映射成前端能识别的失败类型。四类的区分是刻意的，见 docs/PRD.md §5.8 */
export function classifyFailure(error: unknown): FailureKind {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number }).status

  if (status === 402 || /quota|balance|insufficient|余额/i.test(message)) return 'quota'
  if (status === 429 || /rate limit|限流/i.test(message)) return 'quota'
  if (status === 408 || /timeout|timed out|超时/i.test(message)) return 'timeout'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|不可达/i.test(message)) return 'offline'
  if (/length|max_tokens|truncat|截断/i.test(message)) return 'truncated'

  // 认不出来的当超时处理：它是最温和的一类（可重试、内容没丢），
  // 猜错的代价最小。猜成「额度用尽」会让用户去充值，那是真的花钱
  return 'timeout'
}
