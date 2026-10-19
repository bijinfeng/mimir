import { maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import {
  chatModelSelectionSchema,
  documentAgentCanvasSupported,
  documentAgentRoundSchema,
  EVENT_FAILURE,
  EVENT_MESSAGE_IDENTITY,
} from '@mimir/shared'
import type { DocxAgentHistory, FailureKind, RetrievalScope } from '@mimir/shared'
import { classifyFailure } from './chat-failure.js'
import { appendMessage, ensureTitle, getConversation } from './conversations.js'
import {
  consumeDocxInterrupt,
  releaseDocxInterrupt,
  rememberDocxInterrupt,
  settleDocxInterrupt,
} from './docx-agent-runs.js'
import { getDocument } from './documents.js'
import { documentAgentCatalog } from './document-agent-catalog.js'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import { documentAgentFormatOf } from './document-agent-format.js'
import { docxMediaReadiness } from './docx-media-analysis.js'
import { validatePptxSnapshots } from './pptx-snapshot-input.js'
import { modelReady, selectedModelCapabilities, streamChat as streamModelChat } from './model.js'

type ParsedRun = Awaited<ReturnType<typeof import('@tanstack/ai').chatParamsFromRequestBody>>

function fail(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function modelCapabilityError(message: string): string {
  if (/This account only allows Codex official clients/i.test(message))
    return '当前模型账号只允许 Codex 官方客户端，Mimir 无法调用。请在模型设置中改用允许第三方客户端的凭据'
  if (
    /(tool|function).*(not supported|unsupported|does not support|not available|不支持)|(?:not supported|unsupported|does not support).*(tool|function)/i.test(
      message,
    )
  ) {
    return '当前聊天模型不支持工具调用。请在模型设置中选择支持 function calling 的模型'
  }
  return message
}

function propsOf(parsed: ParsedRun): Record<string, unknown> {
  const top = parsed.forwardedProps
  const runConfig =
    typeof top.runConfig === 'object' && top.runConfig !== null
      ? (top.runConfig as Record<string, unknown>)
      : {}
  return { ...runConfig, ...top }
}

function questionOf(messages: ParsedRun['messages']): string {
  const last = messages.findLast((message) => message.role === 'user')
  if (!last) return ''
  const content = (last as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        part.type === 'text' &&
        typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('')
    .trim()
}

function clientInterrupts(chunk: StreamChunk): Array<{ id: string; name: string }> | null {
  if (chunk.type !== 'RUN_FINISHED') return null
  const outcome = (chunk as { outcome?: unknown }).outcome
  if (
    !outcome ||
    typeof outcome !== 'object' ||
    (outcome as { type?: unknown }).type !== 'interrupt'
  ) {
    return null
  }
  const entries = (outcome as { interrupts?: unknown }).interrupts
  if (!Array.isArray(entries)) return null
  const tools = entries.map((entry) => {
    if (!entry || typeof entry !== 'object') return null
    const value = entry as { id?: unknown; metadata?: { toolName?: unknown } }
    if (typeof value.id !== 'string' || typeof value.metadata?.toolName !== 'string') return null
    return { id: value.id, name: value.metadata.toolName }
  })
  return tools.every((tool): tool is { id: string; name: string } => tool !== null) ? tools : null
}

/** TanStack-owned AG-UI lifecycle shared by registered document editors. */
export async function streamDocxAgent(
  parsed: ParsedRun,
  catalogForFormat: (
    format: DocumentAgentCatalog['format'],
  ) => Promise<DocumentAgentCatalog | null> = documentAgentCatalog,
  signal?: AbortSignal,
): Promise<Response> {
  const props = propsOf(parsed)
  if (props.branchMode === 'edit' || props.branchMode === 'regenerate')
    return fail(
      422,
      'DOCUMENT_AGENT_BRANCH_UNAVAILABLE',
      '文档编辑对话不能本地分支或重新生成，请使用当前轮次的重试或继续操作',
    )
  if (Array.isArray(props.attachments) && props.attachments.length)
    return fail(422, 'ATTACHMENT_AGENT_CONFLICT', '普通聊天附件不能与文档编辑或专用截图同时发送')
  const conversationProp = props.conversationId
  const legacy = props.docxAgent === true && props.documentAgent !== true
  const parsedRound = documentAgentRoundSchema.safeParse({
    format: legacy ? 'docx' : props.agentFormat,
    documentId: props.documentId,
    roundId: legacy ? props.docxRoundId : props.agentRoundId,
    version: legacy ? props.docxVersion : props.agentVersion,
    context: legacy ? props.docxContext : props.agentContext,
  })
  const question = questionOf(parsed.messages)

  if (!parsedRound.success) return fail(400, 'DOCUMENT_AGENT_INVALID', '缺少当前文档画布上下文')
  const { documentId, format, roundId, version, context } = parsedRound.data
  const contextText = JSON.stringify(context)
  if (contextText.length > 100_000)
    return fail(413, 'DOCX_AGENT_CONTEXT_TOO_LARGE', '文档上下文超过本轮限制')
  if (parsed.messages.length > 100)
    return fail(413, 'DOCX_AGENT_HISTORY_TOO_LARGE', '对话历史超过本轮限制')

  const document = await getDocument(documentId)
  if (!document || documentAgentFormatOf(document) !== format)
    return fail(404, 'DOCUMENT_AGENT_NOT_FOUND', '当前文档格式与编辑会话不匹配')
  if (!documentAgentCanvasSupported(document))
    return fail(422, 'DOCUMENT_AGENT_UNAVAILABLE', '当前文件没有可执行编辑工具的画布')
  const catalog = await catalogForFormat(format)
  if (!catalog) return fail(422, 'DOCUMENT_AGENT_UNAVAILABLE', '当前格式尚未接入 Agent 编辑器')
  const activeCatalog = catalog
  const selected =
    props.modelSelection === undefined
      ? undefined
      : chatModelSelectionSchema.safeParse(props.modelSelection)
  if (selected && !selected.success) return fail(400, 'MODEL_SELECTION_INVALID', '模型选择不合法')
  const modelSelection = selected?.data
  let selectedCapabilities
  if (modelSelection) {
    try {
      selectedCapabilities = await selectedModelCapabilities(modelSelection)
    } catch (error) {
      return fail(
        422,
        'MODEL_SELECTION_INVALID',
        error instanceof Error ? error.message : '模型选择已失效',
      )
    }
    if (selectedCapabilities?.tools !== 'supported')
      return fail(422, 'TOOLS_NOT_READY', '所选模型尚未确认支持工具调用，请重新选择或配置模型能力')
  } else if (!(await modelReady('chat')))
    return fail(422, 'MODEL_NOT_READY', '请先配置可用的聊天模型')
  if (format === 'pptx') {
    let snapshots: number
    try {
      snapshots = validatePptxSnapshots(parsed.messages)
    } catch (error) {
      return fail(
        400,
        'PPTX_SNAPSHOT_INVALID',
        error instanceof Error ? error.message : '幻灯片截图无效',
      )
    }
    if (
      snapshots &&
      (modelSelection
        ? selectedCapabilities?.vision !== 'supported'
        : !(await docxMediaReadiness()).vision)
    )
      return fail(422, 'VISION_NOT_READY', '截图美化需要聊天模型并启用视觉输入，请前往模型设置')
  }

  const resume = parsed.resume
  const resuming = Array.isArray(resume) && resume.length > 0
  if (!resuming && !question) return fail(400, 'INVALID_INPUT', '没有找到用户消息')

  // Tool runs can resume in another HTTP request. Require the persisted
  // conversation up front so a provisional AG-UI thread cannot orphan one.
  if (typeof conversationProp !== 'string' || !(await getConversation(conversationProp))) {
    return fail(409, 'DOCX_AGENT_STALE', '文档编辑会话已不存在，请重新提问')
  }
  const conversationId = conversationProp
  if (parsed.threadId !== conversationId) {
    return fail(400, 'DOCX_AGENT_RESUME_INVALID', '对话线程与编辑会话不匹配')
  }
  // The Agent only operates on this authenticated document, regardless of a
  // stale library scope supplied by the composer.
  const retrievalScope: RetrievalScope = { type: 'document', documentId }
  function agentSource(
    status: DocxAgentHistory['status'],
    tools: DocxAgentHistory['tools'] = [],
  ): StreamChunk {
    return {
      type: 'CUSTOM',
      name: 'mimir.documentAgent',
      value: { agent: { runId: parsed.runId, documentId, format, status, tools } },
    } as StreamChunk
  }

  let parentRunId: string | undefined
  let userMessageId: string | undefined
  if (resuming) {
    if (parsed.parentRunId) return fail(400, 'DOCX_AGENT_RESUME_INVALID', '续轮关联由服务端管理')
    const ids = resume.map((entry) => entry.interruptId)
    try {
      parentRunId =
        (await consumeDocxInterrupt({
          conversationId,
          documentId,
          format,
          version,
          roundId,
          interruptIds: ids,
          responses: resume,
        })) ?? undefined
    } catch {
      return fail(400, 'DOCX_AGENT_RESUME_INVALID', '工具续轮参数无效')
    }
    if (!parentRunId) return fail(409, 'DOCX_AGENT_STALE', '工具续轮已过期或已处理')
  } else {
    await ensureTitle(conversationId, question)
    userMessageId = (
      await appendMessage({
        conversationId,
        role: 'user',
        text: question.slice(0, 8_000),
        modelSelection,
        retrievalScope,
        protocolEvents: [agentSource('completed') as unknown as Record<string, unknown>],
      })
    ).id
  }

  let stream: Awaited<ReturnType<typeof streamModelChat>>
  try {
    stream = await streamModelChat({
      role: 'chat',
      ...(modelSelection ? { modelSelection } : {}),
      source: 'chat',
      refId: conversationId,
      stream: true,
      ...(signal ? { abortSignal: signal } : {}),
      threadId: conversationId,
      runId: parsed.runId,
      ...(parentRunId ? { parentRunId } : {}),
      ...(resuming ? { resume } : {}),
      agentLoopStrategy: maxIterations(12),
      tools: activeCatalog.tools,
      messages: parsed.messages,
      systemPrompts: [
        activeCatalog.systemPrompt,
        `当前 ${format.toUpperCase()}：${document.title}（${document.id}）\n画布版本：${version}\n当前画布：${contextText}`,
      ],
    })
  } catch (error) {
    if (parentRunId) await releaseDocxInterrupt(parentRunId)
    const message = error instanceof Error ? error.message : String(error)
    return fail(502, 'DOCX_AGENT_MODEL_ERROR', modelCapabilityError(message))
  }
  if (parentRunId && resume) await settleDocxInterrupt(parentRunId, resume)

  async function* events(): AsyncGenerator<StreamChunk> {
    let answer = ''
    const assistantClientIds = new Set<string>()
    const protocolEvents: Record<string, unknown>[] = []
    let eventBytes = 0
    function rememberEvent(chunk: StreamChunk): boolean {
      if (!/^(TEXT_MESSAGE_|REASONING_|THINKING_|TOOL_CALL_)/.test(chunk.type)) return true
      const snapshot = JSON.parse(JSON.stringify(chunk)) as Record<string, unknown>
      const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8')
      if (eventBytes + bytes > 2 * 1024 * 1024 - 4096) return false
      eventBytes += bytes
      protocolEvents.push(snapshot)
      return true
    }
    function persist(text: string, failure?: FailureKind) {
      return appendMessage({
        conversationId,
        role: 'assistant',
        text,
        failure,
        modelSelection,
        retrievalScope,
        protocolEvents: [
          agentSource(failure ? 'failed' : 'completed') as unknown as Record<string, unknown>,
          ...protocolEvents,
        ],
      })
    }
    function* identities(messageId: string): Generator<StreamChunk> {
      for (const clientMessageId of assistantClientIds)
        yield messageIdentity(messageId, clientMessageId, 'assistant')
    }
    // A resumed TanStack tool turn may emit tool-result or middleware chunks
    // before its provider's RUN_STARTED. Own the AG-UI lifecycle at this HTTP
    // boundary so every response starts correctly, regardless of SDK order.
    yield { type: 'RUN_STARTED', runId: parsed.runId, threadId: conversationId } as StreamChunk
    const clientUserId = parsed.messages.findLast((message) => message.role === 'user')?.id
    if (userMessageId && clientUserId) yield messageIdentity(userMessageId, clientUserId, 'user')
    for await (const upstreamChunk of stream) {
      let chunk = rememberEvent(upstreamChunk)
        ? upstreamChunk
        : ({
            type: 'RUN_ERROR',
            message: '本轮消息记录超过容量限制，请缩小问题后重试',
          } as StreamChunk)
      const requestedTools = clientInterrupts(chunk)
      if (requestedTools?.some((tool) => !activeCatalog.clientToolNames.has(tool.name)))
        chunk = { type: 'RUN_ERROR', message: '模型请求了当前文档不允许的编辑工具' } as StreamChunk
      if (chunk.type === 'RUN_STARTED') continue
      if (chunk.type === 'TEXT_MESSAGE_START' || chunk.type === 'REASONING_MESSAGE_START')
        assistantClientIds.add(chunk.messageId)
      if (chunk.type === 'TOOL_CALL_START' && chunk.parentMessageId)
        assistantClientIds.add(chunk.parentMessageId)
      if (chunk.type === 'RUN_ERROR') {
        const message = modelCapabilityError(chunk.message)
        const failure: FailureKind = /只允许 Codex 官方客户端|不支持工具调用/.test(message)
          ? 'quota'
          : classifyFailure(new Error(message))
        if (!answer.trim()) {
          const messageId = `${parsed.runId}-model-error`
          assistantClientIds.add(messageId)
          for (const output of [
            { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: message },
            { type: 'TEXT_MESSAGE_END', messageId },
          ] as StreamChunk[]) {
            rememberEvent(output)
            yield output
          }
        }
        const saved = await persist(answer || message, failure)
        yield* identities(saved.id)
        yield agentSource('failed')
        yield { type: 'CUSTOM', name: EVENT_FAILURE, value: { failure, message } } as StreamChunk
        yield { ...chunk, message }
        return
      }
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') answer += chunk.delta
      const clientTools = clientInterrupts(chunk)
      if (clientTools !== null) {
        const message = await persist(answer || '正在执行文档工具')
        await rememberDocxInterrupt({
          runId: parsed.runId,
          conversationId,
          documentId,
          format,
          version,
          roundId,
          messageId: message.id,
          interruptIds: clientTools.map((tool) => tool.id),
          tools: clientTools.map((tool) => ({
            interruptId: tool.id,
            name: tool.name,
            status: 'pending',
          })),
        })
        yield* identities(message.id)
        yield agentSource(
          'pending',
          clientTools.map((tool) => ({
            interruptId: tool.id,
            name: tool.name,
            status: 'pending',
          })),
        )
      } else if (chunk.type === 'RUN_FINISHED' && (answer.trim() || protocolEvents.length)) {
        // A terminal enables client actions immediately: persist and publish the
        // canonical identity first, including resumed turns with a new SDK ID.
        const saved = await persist(answer)
        yield* identities(saved.id)
        yield agentSource('completed')
      }
      yield chunk
      if (chunk.type === 'RUN_FINISHED') return
    }
    // EOF is not a successful terminal. Keep partial work inspectable after
    // reload, but mark it failed so it cannot be saved as a completed answer.
    const message = '模型输出中断（truncated），未收到完成事件'
    if (!answer.trim()) {
      const messageId = `${parsed.runId}-model-error`
      assistantClientIds.add(messageId)
      for (const output of [
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: message },
        { type: 'TEXT_MESSAGE_END', messageId },
      ] as StreamChunk[]) {
        rememberEvent(output)
        yield output
      }
    }
    const saved = await persist(answer.trim() ? answer : message, 'truncated')
    yield* identities(saved.id)
    yield agentSource('failed')
    yield {
      type: 'CUSTOM',
      name: EVENT_FAILURE,
      value: { failure: 'truncated', message },
    } as StreamChunk
    yield { type: 'RUN_ERROR', message } as StreamChunk
  }

  return toServerSentEventsResponse(events())
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
