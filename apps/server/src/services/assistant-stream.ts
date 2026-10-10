import type { StreamChunk } from '@tanstack/ai'
import { chatParamsFromRequestBody, toServerSentEventsResponse } from '@tanstack/ai'
import type { Citation, FailureKind, Trace, TraceStep } from '@mimir/shared'
import { EVENT_CITATIONS, EVENT_CONVERSATION, EVENT_FAILURE, EVENT_TRACE } from '@mimir/shared'
import { toQueryText } from '@mimir/tokenizer'
import { nanoid } from 'nanoid'
import { assemble } from '../plugins/host.js'
import { assembleCitations, searchChunks, type AssembledCitation } from '../search/index.js'
import { appendMessage, createConversation, ensureTitle, getConversation } from './conversations.js'
import { streamChat as streamModelChat, modelReady } from './model.js'
import { getDocument } from './documents.js'

/**
 * 通道名的中文标签（trace 用）。与 `assistant.ts` 同一套取值，
 * 未知的通道名原样显示——加通道时不需要回来改
 */
const CHANNEL_LABELS: Record<string, string> = {
  keyword: '词级召回',
  substring: '子串兜底',
  vector: '语义向量',
}

/** 每篇最多贡献几条引用（`retrieval.maxChunksPerDoc`，§4.11 的第 3 步） */
async function maxChunksPerDoc(): Promise<number> {
  const { settings } = assemble()
  return settings.getNumber('retrieval.maxChunksPerDoc')
}

/**
 * 流式问答（AG-UI 协议）。
 *
 * 请求由前端的 AG-UI 运行时生成（`@assistant-ui/react-ag-ui`）：body 是
 * AG-UI 的 `RunAgentInput`，mimir 自己的参数走 `forwardedProps`
 * （运行时的 `runConfig.custom` 会挂到 `forwardedProps.runConfig` 下）。
 *
 * ## 为什么会话 id 在 body 里而不是 URL 里
 *
 * 连接地址一旦跟着会话变化，客户端就会**重建 agent**，
 * 而重建会把正在进行的流切断。让地址固定、把 id 放进 forwardedProps，
 * 这个问题就不存在了。代价是新建会话时客户端不知道 id，
 * 所以服务端用 `mimir.conversation` 事件回传——客户端那一侧则在请求发出
 * 之前先建会话（`onRunInitialized` 里，见 apps/web 的 chat-io）。
 *
 * ## 事件顺序
 *
 *   RUN_STARTED → conversation → trace → citations → 正文 → trace(整轮耗时) → RUN_FINISHED
 *
 * 前几个在**模型还没开始生成时**就发出去，于是引用卡片与检索过程
 * 立刻出现，用户不会对着空白等模型。
 *
 * **生命周期括号由服务端拥有。** 这一条是 2026-10 的修复（D-099）：
 * 在这之前这条流里**没有**服务端自己的 RUN_STARTED / RUN_FINISHED——
 * 只有模型那一趟的（顺着 `for await` 转发出来），于是：
 *
 *  - 流的第一条事件往往是 `CUSTOM`（会话 id / 检索过程），而 AG-UI 的
 *    客户端在**流开头**就校验「第一条必须是 RUN_STARTED」——实测
 *    `@ag-ui/client@0.0.59` 直接抛 `AGUIError: First event must be 'RUN_STARTED'`，
 *    整轮问答一个字节都到不了界面
 *  - 终局那份「整轮耗时」的 trace 发在模型的 RUN_FINISHED **之后**，
 *    同样被拒：`Cannot send event type 'CUSTOM': The run has already finished`
 *  - 只检索那条路径（`textOnlyStream`）一条生命周期事件都没有
 *
 * 所以现在：函数第一件事发自己的 RUN_STARTED，模型流里的 RUN_STARTED /
 * RUN_FINISHED 当作**模型那一趟的内部事件**不转发（叠加会命中
 * `Cannot send 'RUN_STARTED' while a run is still active`），终局 trace
 * 抢在自己的 RUN_FINISHED 之前。写成一条测试守着
 * （`src/test/chat-stream.test.ts`，它把真实响应字节喂给 @ag-ui/client）。
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

  const result = await searchChunks({ q: question, limit: 8 })

  const byChannel = (name: string) =>
    result.hits.filter((hit) => hit.matchedBy.includes(name)).length

  if (result.hits.length > 0) {
    // 这一行是 trace 里最有信息量的一条：它把「词级命中」与「子串兜底命中」
    // 分开报。看到「子串兜底 1 段」就知道是分词没切对但被兜住了，
    // 两个都是 0 才是真的没存过（.trellis/spec/project/product.md §5.6）。
    //
    // 通道名**不写死**：`channels` 来自注册表，M1-C 加上向量通道后
    // 这里无需改动（每个就绪的通道各报一行）
    const parts = result.channels.map((name) => {
      const label = CHANNEL_LABELS[name] ?? name
      return `${label} ${byChannel(name)} 段`
    })
    steps.push({ icon: 'search', text: '通道召回结果', meta: parts.join(' · ') })
  }

  // 引用组装：相邻分块合并 + 每篇上限（§4.11 的第 2、3 步）。
  // 上限从设置来（`retrieval.maxChunksPerDoc`），默认 3
  const maxPerDoc = await maxChunksPerDoc()
  const assembled = await assembleCitations(result.hits, { limit: 8, maxPerDoc })
  const citations = buildCitations(assembled)
  const documentCount = new Set(citations.map((item) => item.documentId)).size

  if (citations.length > 0) {
    steps.push({
      icon: 'read',
      text: '读取命中的文档并合并相邻分块',
      meta: `来自 ${documentCount} 个文档，共 ${citations.length} 段`,
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

/**
 * 引用卡片由**组装好的分块段**给出（M1-C，§4.11）。
 *
 * 偏移是分块自己的真实区间，不再是查询词猜出来的位置——「跳回原文并高亮」
 * 因此落在正确的地方。截断到 `PER_CITATION_CHARS` 时 `end` 跟着缩：
 * 契约里它的含义是「这段文字在正文里的结束位置」，不能与 snippet 对不上。
 */
function buildCitations(assembled: AssembledCitation[]): Citation[] {
  const citations: Citation[] = []
  let budget = CONTEXT_CHAR_BUDGET

  for (const item of assembled) {
    if (budget <= 0) break
    const text = item.text.slice(0, Math.min(PER_CITATION_CHARS, budget))
    budget -= text.length

    citations.push({
      documentId: item.documentId,
      // 来源的联合类型在契约里收窄，而检索层只保证「它是 documents.kind」
      // （core 不认识这个枚举）。断言发生在**构造 Citation 的这一个点**上
      kind: item.kind as Citation['kind'],
      title: item.title,
      snippet: text,
      start: item.start,
      end: item.start + text.length,
      matchedBy: item.matchedBy,
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
 * （`.trellis/spec/project/product.md` §5.8：失败路径要回答「这次花钱了吗」）。
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
 *
 * **它的生命周期括号由 `createStream` 补**（这里的 RUN_STARTED / RUN_FINISHED
 * 由外层统一发，见文件头的事件顺序一节）：这一段只负责正文本身。
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
  /**
   * 第二轮参数通道：`forwardedProps.runConfig`。
   *
   * assistant-ui 的 AG-UI 运行时把 `runConfig.custom` 放在这一层
   * （`AgUiThreadRuntimeCore` 的 buildRunInput：
   * `...runConfig?.custom ? { runConfig: runConfig.custom } : {}`），
   * 而 top-level 那几个键是旧前端（TanStack `useChat`）的写法——新前端也
   * 用它，但只用于 `conversationId`（agent 在请求发出前注入的那个），
   * 其余三个走 runConfig。
   *
   * 两条都认，**顶层优先**（它更具体：注入发生在运行时合并之后）。
   *
   * 这是「排队的那条消息带着自己那轮的检索范围」的前提：队列里存的是
   * 完整的 AppendMessage，runConfig 随它一路到服务端。
   */
  const runConfig =
    typeof props.runConfig === 'object' && props.runConfig !== null
      ? (props.runConfig as Record<string, unknown>)
      : {}
  const pick = (key: 'conversationId' | 'documentId'): unknown =>
    props[key] === undefined ? runConfig[key] : props[key]

  return {
    ...(typeof pick('conversationId') === 'string'
      ? { conversationId: pick('conversationId') as string }
      : {}),
    ...(typeof pick('documentId') === 'string' ? { documentId: pick('documentId') as string } : {}),
    deepReasoning: props.deepReasoning === true || runConfig.deepReasoning === true,
    ...(props.scope === 'search' || runConfig.scope === 'search'
      ? { scope: 'search' as const }
      : {}),
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

  /**
   * **这一轮问答的生命周期括号由服务端拥有**（见文件头的事件顺序一节）。
   *
   * runId 是服务端生成的：它标识的是「这一轮问答」，与模型那一趟调用不是
   * 同一个生命周期——只检索那条路径压根不调模型，却同样是一轮。
   * threadId 用会话 id（AG-UI 的 thread 就是我们的会话）。
   */
  const runId = `run_${nanoid(16)}`
  yield { type: 'RUN_STARTED', runId, threadId: conversationId } as StreamChunk

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
  // 区别只在 `searchOnlyAnswer` 的措辞里，用户反正都得到一个「没有花钱」的答案。
  // 它同样要收一对生命周期括号：没有模型不等于「没有这一轮」。
  // （这一条路径**不补发**终局那份整轮耗时的 trace：它没有模型那一趟，
  //  检索耗时就是全部，先发的那份已经是对的）
  if (props.scope === 'search' || !(await modelReady('chat'))) {
    const text = searchOnlyAnswer(question, retrieval.citations)
    for await (const chunk of textOnlyStream(text)) yield chunk
    await persistAssistant(conversationId, text, retrieval, null, turnStartedAt)
    yield runFinished(runId, conversationId, undefined)
    return
  }

  // 历史消息由客户端带过来（AG-UI 的运行时维护整段对话），服务端不重复维护一份。
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
    /** 模型那一趟报的用量。原先它随 RUN_FINISHED 一起流出去，现在剥掉生命周期
        事件之后要单独接住，挂在我们自己那条 RUN_FINISHED 的 metadata 上继续往
        前传（AG-UI 的 schema 不认顶层 usage 之外的扩展，metadata 是它认的口子） */
    let modelUsage: unknown

    for await (const chunk of stream) {
      const type = (chunk as { type?: string }).type

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
      if (type === 'RUN_ERROR') {
        streamError = (chunk as { message?: string }).message ?? '模型调用失败'
      }

      /**
       * **模型那一趟的 RUN_STARTED / RUN_FINISHED 不转发。**
       *
       * 它们说的是「模型调用开始了/结束了」，而这一轮问答的生命周期由
       * 上面那条 RUN_STARTED 拥有——叠加会命中 AG-UI 客户端的
       * `Cannot send 'RUN_STARTED' while a run is still active`，
       * 而 RUN_FINISHED 更糟：它之后再有 CUSTOM（下面那份整轮耗时的 trace）
       * 就发不出去了（`Cannot send event type 'CUSTOM': The run has already
       * finished`），用户永远看不到真实耗时。
       *
       * 两条都在本机用 @ag-ui/client@0.0.59 复现过。
       * 失败时 `RUN_ERROR` 仍然透传——它是「这一轮坏了」的事实，
       * 由客户端的 run 状态机收尾；分类信息另有 mimir.failure。
       */
      const isModelLifecycle = type === 'RUN_STARTED' || type === 'RUN_FINISHED'

      // 模型那一趟的用量随它的 RUN_FINISHED 到，剥掉事件本身之前先接住
      if (type === 'RUN_FINISHED') {
        modelUsage = (chunk as { usage?: unknown }).usage
      }

      // 失败时不把框架的 RUN_ERROR 直接透传，由下面统一发带分类的事件。
      // 否则前端会先收到一个无分类的错误、再收到一个带分类的，两套说法
      if (!isModelLifecycle && streamError === null) yield chunk
    }

    if (streamError !== null) {
      throw new Error(streamError)
    }

    // 整轮结束：再发一次带完整耗时的检索过程，覆盖掉先发的那一份。
    // 这样实时看到的数字与落库的、刷新后重放的数字是同一个。
    // **必须在自己的 RUN_FINISHED 之前**——之后发的 CUSTOM 客户端不收
    yield {
      type: 'CUSTOM',
      name: EVENT_TRACE,
      value: { trace: withTurnDuration(retrieval.trace, turnStartedAt) },
    } as StreamChunk

    await persistAssistant(conversationId, answer, retrieval, null, turnStartedAt)

    yield runFinished(runId, conversationId, modelUsage)
  } catch (error) {
    // 失败路径每类给不同出路（.trellis/spec/project/product.md §5.8）。分类是**服务端的知识**：
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
    // 前端按前者选出路、按后者显示原因，所以两者都要。
    //
    // 顺序说明：`RUN_ERROR` 是**终局事件**（客户端在那之后不再收任何事件，
    // 见 @ag-ui/client 的 `Cannot send event type 'CUSTOM': The run has
    // already finished`），所以带分类的 mimir.failure 必须排在它前面——
    // 实测这个顺序（RUN_STARTED → … → CUSTOM(failure) → RUN_ERROR）客户端
    // 正常收到分类并进入错误态
    yield { type: 'CUSTOM', name: EVENT_FAILURE, value: { failure, message: text } } as StreamChunk
    yield { type: 'RUN_ERROR', message: text } as StreamChunk
  }
}

/**
 * `RUN_FINISHED`。
 *
 * 抽成函数的原因只有一条：它必须与开头那条 `RUN_STARTED` **共用同一个
 * runId 与 threadId**（客户端按 runId 判断「这是不是当前这一轮的结束」，
 * 对不上会被当成游离事件）。
 *
 * 失败那条出口不用它——`RUN_ERROR` 自己就是终局事件。
 */
function runFinished(runId: string, threadId: string, usage: unknown): StreamChunk {
  return {
    type: 'RUN_FINISHED',
    runId,
    threadId,
    /**
     * 模型那一趟报的用量挂在这里。
     *
     * 它原先搭着模型自己的 `RUN_FINISHED` 流出去，而那条现在被剥掉了——
     * 不接住的话这份用量就凭空消失。顶层 `usage` 是 TanStack 的扩展字段，
     * AG-UI 的 schema 只认 `metadata`（不认的键会被 zod 静默 strip），
     * 所以放这里。
     *
     * 目前**没有消费者**：界面上的上下文容量读的是 `usageLog`（服务端记的账），
     * 与这份不是同一个来源。保留它是为了「剥事件时不顺手丢数据」。
     */
    ...(usage === undefined ? {} : { metadata: { tanstack: { usage } } }),
  } as StreamChunk
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

/** 把异常映射成前端能识别的失败类型。四类的区分是刻意的，见 .trellis/spec/project/product.md §5.8 */
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
