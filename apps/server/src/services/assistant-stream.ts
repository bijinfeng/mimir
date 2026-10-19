import type { StreamChunk } from '@tanstack/ai'
import { chatParamsFromRequestBody, toServerSentEventsResponse } from '@tanstack/ai'
import type {
  ChatAttachmentRef,
  ChatModelSelection,
  FailureKind,
  RetrievalScope,
} from '@mimir/shared'
import {
  EVENT_CITATIONS,
  EVENT_CONVERSATION,
  EVENT_FAILURE,
  retrievalScopeSchema,
  chatModelSelectionSchema,
  chatHistoryMessageIdsSchema,
  EVENT_MESSAGE_IDENTITY,
  chatAttachmentRefSchema,
} from '@mimir/shared'
import { z } from 'zod'
import { selectedConversationMessages } from './chat-history-selection.js'
import { prepareChatAttachmentContext, bindChatAttachments } from './chat-attachments.js'
import {
  attachmentSystemPrompts,
  attachmentModelInput,
  attachmentQuestion,
  validateAttachmentModel,
  validateAttachmentWindow,
} from './chat-model-input.js'
import { nanoid } from 'nanoid'
import {
  prepareRetrieval,
  verifiedRetrievalHistory,
  SYSTEM_PROMPT,
  type Retrieval,
} from './retrieval-preparation.js'
import { normalizeRetrievalScope } from './retrieval-scope.js'
import {
  appendMessage,
  createConversation,
  ensureConversationScope,
  ensureTitle,
  getConversation,
} from './conversations.js'
import { hasImageInput } from './pptx-snapshot-input.js'
import { streamChat as streamModelChat, modelReady, selectedModel } from './model.js'
import { searchOnlyAnswer } from './search-only-answer.js'
import { streamDocxAgent } from './docx-agent-stream.js'
import { classifyFailure } from './chat-failure.js'
export { classifyFailure } from './chat-failure.js'

/** forwardedProps 里 mimir 自己的字段 */
interface MimirProps {
  retrievalScope?: RetrievalScope
  conversationId?: string
  documentId?: string
  deepReasoning?: boolean
  modelSelection?: ChatModelSelection
  attachments?: ChatAttachmentRef[]
  historyMessageIds?: string[]
  /**
   * 只用检索，不调模型（与 `/ask` 的 `scope` 语义对齐）。
   *
   * 失败卡片上的「只检索，不调模型」是 PRD §5.8 的一类出路，原先的实现是
   * 把「只检索，不调模型，把命中的原文列出来」当成**问题文本**重发——
   * 检索于是拿这句指令去查词、模型也照常被调用，点下去必然再失败一次。
   *
   * 这个字段是那次修复的落点：认它就走下面 `!modelReady` 那条同一条分支
   * （原文由引用卡展示、说明未调用模型），只是原因从「没配模型」变成
   * 「用户选了只检索」。
   */
  scope?: 'search'
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
async function* textOnlyStream(
  text: string,
  messageId = `msg-${Date.now()}`,
): AsyncGenerator<StreamChunk> {
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

  const rawScope = props.retrievalScope ?? runConfig.retrievalScope
  const retrievalScope = rawScope === undefined ? undefined : retrievalScopeSchema.parse(rawScope)
  return {
    ...(retrievalScope ? { retrievalScope } : {}),
    ...((props.historyMessageIds ?? runConfig.historyMessageIds) !== undefined
      ? {
          historyMessageIds: chatHistoryMessageIdsSchema.parse(
            props.historyMessageIds ?? runConfig.historyMessageIds,
          ),
        }
      : {}),
    ...((props.attachments ?? runConfig.attachments) !== undefined
      ? {
          attachments: z
            .array(chatAttachmentRefSchema)
            .max(4)
            .parse(props.attachments ?? runConfig.attachments),
        }
      : {}),
    ...((props.modelSelection ?? runConfig.modelSelection) !== undefined
      ? {
          modelSelection: chatModelSelectionSchema.parse(
            props.modelSelection ?? runConfig.modelSelection,
          ),
        }
      : {}),
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
export async function streamChat(requestBody: unknown, signal?: AbortSignal): Promise<Response> {
  const parsed = await chatParamsFromRequestBody(requestBody).catch(() => null)
  if (!parsed) {
    return errorResponse(400, 'AGUI_INVALID', '请求体不符合 AG-UI 协议')
  }

  const agentProps = parsed.forwardedProps.runConfig
  if (
    parsed.forwardedProps.documentAgent === true ||
    parsed.forwardedProps.docxAgent === true ||
    (typeof agentProps === 'object' &&
      agentProps !== null &&
      ((agentProps as Record<string, unknown>).documentAgent === true ||
        (agentProps as Record<string, unknown>).docxAgent === true))
  ) {
    return streamDocxAgent(parsed, undefined, signal)
  }

  if (hasImageInput(parsed.messages))
    return errorResponse(
      422,
      'IMAGE_AGENT_REQUIRED',
      '带截图的指令需要当前文档的 Agent 和视觉模型，不能仅检索知识库；请移除截图或配置模型',
    )

  let props: MimirProps
  try {
    props = mimirProps(parsed.forwardedProps)
  } catch {
    return errorResponse(400, 'INVALID_SCOPE', '检索范围或模型选择不合法')
  }
  if (props.modelSelection) {
    try {
      await selectedModel(props.modelSelection)
    } catch (error) {
      return errorResponse(
        422,
        'MODEL_SELECTION_INVALID',
        error instanceof Error ? error.message : '模型选择已失效',
      )
    }
  }
  const retrievalScope = await normalizeRetrievalScope(
    props.retrievalScope ??
      (props.documentId ? { type: 'document', documentId: props.documentId } : { type: 'all' }),
  )
  let question = lastUserQuestion(parsed.messages as { role: string; content?: unknown }[]).trim()

  if (!question && !props.attachments?.length) {
    return errorResponse(400, 'INVALID_INPUT', '没有找到用户消息')
  }

  // 会话不存在或没传就新建一个。空会话只在这一瞬间存在，紧接着就落用户消息
  let conversationId = props.conversationId
  let isNew = false
  let verifySources = props.retrievalScope !== undefined

  if (conversationId) {
    const existing = await getConversation(conversationId)
    if (!existing) return errorResponse(404, 'CONVERSATION_NOT_FOUND', '会话不存在')
    try {
      selectedConversationMessages(existing.messages, props.historyMessageIds)
    } catch (error) {
      return errorResponse(
        409,
        'CHAT_HISTORY_INVALID',
        error instanceof Error ? error.message : '所选历史已失效',
      )
    }
    verifySources = verifySources || existing.retrievalScope !== undefined
    if (props.retrievalScope || existing.retrievalScope)
      await ensureConversationScope(conversationId, retrievalScope)
  }
  if (!conversationId) {
    if (props.historyMessageIds?.length)
      return errorResponse(409, 'CHAT_HISTORY_INVALID', '新会话不能引用其他会话的历史')
    conversationId = (
      await createConversation('', props.retrievalScope ? retrievalScope : undefined)
    ).id
    isNew = true
  }

  let attachments: Awaited<ReturnType<typeof prepareChatAttachmentContext>>
  try {
    attachments = await prepareChatAttachmentContext({
      conversationId,
      refs: props.attachments,
      includeHistory: true,
      historyMessageIds: props.historyMessageIds,
      signal,
    })
    await validateAttachmentModel(attachments, props.modelSelection, props.scope === 'search')
    question ||= attachmentQuestion(
      attachments.attachments.filter((item) =>
        props.attachments?.some((ref) => ref.id === item.id),
      ),
    )
  } catch (error) {
    if (attachments!) await attachments.release()
    return errorResponse(
      422,
      'ATTACHMENT_INVALID',
      error instanceof Error ? error.message : '附件不可用',
    )
  }
  let retrieval: Retrieval
  try {
    retrieval = await prepareRetrieval(question, retrievalScope, { verifySources })
  } catch (error) {
    await attachments.release()
    throw error
  }
  let userMessageId = ''
  // Capacity validation precedes message/attachment binding, so invalid drafts remain removable.
  try {
    const previous = await getConversation(conversationId)
    await validateAttachmentWindow(
      attachments,
      props.modelSelection,
      [
        ...selectedConversationMessages(previous?.messages ?? [], props.historyMessageIds)
          .slice(-6)
          .map((message) => ({ role: message.role, content: message.text.slice(0, 1500) })),
        {
          role: 'user',
          content: attachmentModelInput(
            { ...attachments, images: [] },
            `【资料】\n${retrieval.context}\n\n【问题】\n${question}`,
          ),
        },
      ],
      [SYSTEM_PROMPT],
    )
    await ensureTitle(conversationId, question)
    const userMessage = await appendMessage({
      conversationId,
      role: 'user',
      text: question,
      ...(props.modelSelection ? { modelSelection: props.modelSelection } : {}),
      retrievalScope,
    })
    userMessageId = userMessage.id
    if (props.attachments?.length)
      await bindChatAttachments(conversationId, userMessage.id, props.attachments)
  } catch (error) {
    await attachments.release()
    return errorResponse(
      422,
      'CHAT_INPUT_INVALID',
      error instanceof Error ? error.message : '发送内容无效',
    )
  }

  return toServerSentEventsResponse(
    leasedStream({
      conversationId,
      question,
      props,
      retrieval,
      isNew,
      requestBody,
      attachments,
      signal,
      userMessageId,
      clientUserMessageId: parsed.messages.findLast((message) => message.role === 'user')?.id ?? '',
    }),
  )
}

interface StreamParams {
  conversationId: string
  question: string
  props: MimirProps
  retrieval: Retrieval
  isNew: boolean
  requestBody: unknown
  signal?: AbortSignal
  userMessageId: string
  clientUserMessageId: string
  attachments: Awaited<ReturnType<typeof prepareChatAttachmentContext>>
}

async function* leasedStream(params: StreamParams): AsyncGenerator<StreamChunk> {
  try {
    yield* createStream(params)
  } finally {
    await params.attachments.release()
  }
}

async function* createStream(params: StreamParams): AsyncGenerator<StreamChunk> {
  const { conversationId, question, props, retrieval, isNew } = params

  /**
   * **这一轮问答的生命周期括号由服务端拥有**（见文件头的事件顺序一节）。
   *
   * runId 是服务端生成的：它标识的是「这一轮问答」，与模型那一趟调用不是
   * 同一个生命周期——只检索那条路径压根不调模型，却同样是一轮。
   * threadId 用会话 id（AG-UI 的 thread 就是我们的会话）。
   */
  const runId = `run_${nanoid(16)}`
  yield { type: 'RUN_STARTED', runId, threadId: conversationId } as StreamChunk

  if (params.clientUserMessageId)
    yield messageIdentity(params.userMessageId, params.clientUserMessageId, 'user')

  // 让前端拿到会话 id（新会话时它还不知道）
  if (isNew) {
    yield {
      type: 'CUSTOM',
      name: EVENT_CONVERSATION,
      value: { conversationId },
    } as StreamChunk
  }

  yield {
    type: 'CUSTOM',
    name: EVENT_CITATIONS,
    value: { citations: retrieval.citations },
  } as StreamChunk

  // 只检索：用户显式选了这条出路，或没配模型。两条走同一条分支——
  // 两种原因共用同一个结果状态，原文由引用卡展示。
  // 它同样要收一对生命周期括号：没有模型不等于「没有这一轮」。
  if (
    props.scope === 'search' ||
    (retrieval.citations.length === 0 && !params.attachments.attachments.length) ||
    (!props.modelSelection && !(await modelReady('chat')))
  ) {
    const text = searchOnlyAnswer(retrieval.citations)
    const clientMessageId = `msg-${nanoid(16)}`
    for await (const chunk of textOnlyStream(text, clientMessageId)) yield chunk
    const savedId = await persistAssistant(
      conversationId,
      text,
      retrieval,
      null,
      undefined,
      props.modelSelection,
      params.attachments.attachments,
    )
    yield messageIdentity(savedId, clientMessageId, 'assistant')
    yield runFinished(runId, conversationId, undefined)
    return
  }

  // 历史只取服务端已落库且引用仍可核对的消息。
  // 最后一条是本次提问，已经单独带上下文传了，所以去掉避免重复
  const history = await verifiedRetrievalHistory(
    conversationId,
    retrieval.scope,
    retrieval.verifySources,
    params.attachments.attachments.length > 0,
    props.historyMessageIds,
  )

  const protocolEvents: Record<string, unknown>[] = []
  let eventBytes = 0
  let clientAssistantMessageId = ''
  try {
    // 适配器由 provider 接缝提供——这里只说「要哪个角色」。
    // 记账在 model.ts 里完成（它包住了整条流），这里只声明这次是哪个功能的调用
    await validateAttachmentWindow(
      params.attachments,
      props.modelSelection,
      [
        ...history,
        {
          role: 'user',
          content: attachmentModelInput(
            { ...params.attachments, images: [] },
            `【资料】\n${retrieval.context}\n\n【问题】\n${question}`,
          ),
        },
      ],
      [SYSTEM_PROMPT],
    )
    const stream = await streamModelChat({
      role: props.modelSelection ? 'chat' : props.deepReasoning ? 'reasoning' : 'chat',
      ...(props.modelSelection ? { modelSelection: props.modelSelection } : {}),
      stream: true,
      ...(params.signal ? { abortSignal: params.signal } : {}),
      systemPrompts: [SYSTEM_PROMPT, ...attachmentSystemPrompts(params.attachments)],
      source: 'chat',
      refId: conversationId,
      messages: [
        ...history,
        {
          role: 'user',
          content: attachmentModelInput(
            params.attachments,
            `【资料】\n${retrieval.context}\n\n【问题】\n${question}`,
          ),
        },
      ],
    })

    let answer = ''
    let modelFinished = false
    let streamError: string | null = null
    /** 模型那一趟报的用量。原先它随 RUN_FINISHED 一起流出去，现在剥掉生命周期
        事件之后要单独接住，挂在我们自己那条 RUN_FINISHED 的 metadata 上继续往
        前传（AG-UI 的 schema 不认顶层 usage 之外的扩展，metadata 是它认的口子） */
    let modelUsage: unknown

    for await (const chunk of stream) {
      const type = (chunk as { type?: string }).type
      if (
        type === 'TEXT_MESSAGE_START' &&
        'messageId' in chunk &&
        typeof chunk.messageId === 'string'
      )
        clientAssistantMessageId ||= chunk.messageId
      if (type && /^(TEXT_MESSAGE_|REASONING_|THINKING_|TOOL_CALL_)/.test(type)) {
        const snapshot = JSON.parse(JSON.stringify(chunk)) as Record<string, unknown>
        eventBytes += Buffer.byteLength(JSON.stringify(snapshot), 'utf8')
        if (eventBytes > 2 * 1024 * 1024)
          throw new Error('本轮消息记录超过容量限制，请缩小问题后重试')
        protocolEvents.push(snapshot)
      }

      // 累积正文用于落库：模型的文本以 TEXT_MESSAGE_CONTENT 的 delta 到达，
      // 而落库要的是完整文本
      const delta = (chunk as { delta?: unknown }).delta
      if (type === 'TEXT_MESSAGE_CONTENT' && typeof delta === 'string') answer += delta

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

      const isModelLifecycle = type === 'RUN_STARTED' || type === 'RUN_FINISHED'

      // 模型那一趟的用量随它的 RUN_FINISHED 到，剥掉事件本身之前先接住
      if (type === 'RUN_FINISHED') {
        modelFinished = true
        modelUsage = (chunk as { usage?: unknown }).usage
      }

      // 失败时不把框架的 RUN_ERROR 直接透传，由下面统一发带分类的事件。
      // 否则前端会先收到一个无分类的错误、再收到一个带分类的，两套说法
      if (!isModelLifecycle && streamError === null) yield chunk
    }

    if (!modelFinished && streamError === null)
      throw new Error('模型输出中断（truncated），未收到完成事件')
    if (!answer.trim() && streamError === null) throw new Error('模型未返回回答正文')
    if (streamError !== null) {
      throw new Error(streamError)
    }

    const savedId = await persistAssistant(
      conversationId,
      answer,
      retrieval,
      null,
      protocolEvents,
      props.modelSelection,
      params.attachments.attachments,
    )

    if (clientAssistantMessageId)
      yield messageIdentity(savedId, clientAssistantMessageId, 'assistant')
    yield runFinished(runId, conversationId, modelUsage)
  } catch (error) {
    // 失败路径每类给不同出路（.trellis/spec/project/product.md §5.8）。分类是**服务端的知识**：
    // 它看得到 HTTP 状态码与原始错误，而前端只看到一句被规范化过的文本。
    const failure = classifyFailure(error)
    const text = error instanceof Error ? error.message : String(error)

    // 失败也留一条助手消息，而不是只在流里报错——刷新之后这条记录还在，
    // 用户能回头查「当时为什么失败」
    const savedId = await persistAssistant(
      conversationId,
      text,
      retrieval,
      failure,
      protocolEvents,
      props.modelSelection,
      params.attachments.attachments,
    )

    if (clientAssistantMessageId)
      yield messageIdentity(savedId, clientAssistantMessageId, 'assistant')
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

async function persistAssistant(
  conversationId: string,
  text: string,
  retrieval: Retrieval,
  failure: FailureKind | null,
  protocolEvents?: Record<string, unknown>[],
  modelSelection?: ChatModelSelection,
  usedAttachmentRefs?: readonly ChatAttachmentRef[],
): Promise<string> {
  const saved = await appendMessage({
    conversationId,
    role: 'assistant',
    usedAttachmentRefs,
    text,
    citations: retrieval.citations,
    failure,
    ...(protocolEvents?.length ? { protocolEvents } : {}),
    ...(modelSelection ? { modelSelection } : {}),
    retrievalScope: retrieval.scope,
  })
  return saved.id
}

function messageIdentity(
  messageId: string,
  clientMessageId: string,
  role: 'user' | 'assistant',
): StreamChunk {
  return {
    type: 'CUSTOM',
    name: EVENT_MESSAGE_IDENTITY,
    value: { messageId, clientMessageId, role },
  } as StreamChunk
}
