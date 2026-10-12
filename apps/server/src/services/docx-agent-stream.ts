import { maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import {
  DOCX_BRAVE_TOOLS,
  DOCX_LOCAL_TOOLS,
  DOCX_IMAGE_TOOLS,
  DOCX_MEDIA_TOOLS,
  DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  EVENT_CONVERSATION,
} from '@mimir/shared'
import { appendMessage, createConversation, ensureTitle, getConversation } from './conversations.js'
import {
  consumeDocxInterrupt,
  releaseDocxInterrupt,
  rememberDocxInterrupt,
  settleDocxInterrupt,
} from './docx-agent-runs.js'
import { getDocument } from './documents.js'
import { braveImageSearch, braveSearchReady, braveWebSearch } from './docx-brave-search.js'
import { docxImageReady } from './docx-image-generation.js'
import { docxMediaReadiness } from './docx-media-analysis.js'
import { modelReady, streamChat as streamModelChat } from './model.js'
import type { ModelCallOptions } from './model.js'

type ParsedRun = Awaited<ReturnType<typeof import('@tanstack/ai').chatParamsFromRequestBody>>

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SYSTEM_PROMPT = `你是 Mimir 的 DOCX 文档编辑助手。只能用提供的工具读取和修改当前打开的文档。
开始编辑前读取当前画布；画布可能有尚未保存的改动。用户选区以本轮冻结的选区为准。
每次工具结果以真实成功或失败为准。工具失败、取消或未执行时，不得声称已经修改文档。
编辑只更新画布，用户需要手动保存。回答要简洁，并说明实际修改了什么。`

function fail(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function modelCapabilityError(message: string): string {
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

/** Dedicated TanStack-owned AG-UI lifecycle for the DOCX agent. */
export async function streamDocxAgent(parsed: ParsedRun): Promise<Response> {
  const props = propsOf(parsed)
  const documentId = props.documentId
  const conversationProp = props.conversationId
  const roundId = props.docxRoundId
  const version = props.docxVersion
  const context = props.docxContext
  const question = questionOf(parsed.messages)

  if (
    typeof documentId !== 'string' ||
    typeof roundId !== 'string' ||
    roundId.length < 1 ||
    roundId.length > 100 ||
    !Number.isSafeInteger(version) ||
    (version as number) < 0 ||
    typeof context !== 'object' ||
    context === null
  ) {
    return fail(400, 'DOCX_AGENT_INVALID', '缺少当前 DOCX 画布上下文')
  }
  const docxDocumentId = documentId as string
  const docxRoundId = roundId as string
  const contextText = JSON.stringify(context)
  if (contextText.length > 100_000)
    return fail(413, 'DOCX_AGENT_CONTEXT_TOO_LARGE', '文档上下文超过本轮限制')
  if (parsed.messages.length > 100)
    return fail(413, 'DOCX_AGENT_HISTORY_TOO_LARGE', '对话历史超过本轮限制')

  const document = await getDocument(docxDocumentId)
  if (!document || document.kind !== 'file' || document.mime !== DOCX_MIME) {
    return fail(404, 'DOCX_NOT_FOUND', '当前文档不是可编辑的 DOCX 文件')
  }
  if (!(await modelReady('chat'))) return fail(422, 'MODEL_NOT_READY', '请先配置可用的聊天模型')

  const resume = parsed.resume
  const resuming = Array.isArray(resume) && resume.length > 0
  if (!resuming && !question) return fail(400, 'INVALID_INPUT', '没有找到用户消息')

  let conversationId: string
  let isNew = false
  if (typeof conversationProp === 'string' && (await getConversation(conversationProp))) {
    conversationId = conversationProp
  } else if (resuming) {
    return fail(409, 'DOCX_AGENT_STALE', '续轮的对话已不存在')
  } else {
    conversationId = (await createConversation()).id
    isNew = true
  }

  let parentRunId: string | undefined
  if (resuming) {
    if (parsed.parentRunId) return fail(400, 'DOCX_AGENT_RESUME_INVALID', '续轮关联由服务端管理')
    const ids = resume.map((entry) => entry.interruptId)
    try {
      parentRunId =
        (await consumeDocxInterrupt({
          conversationId,
          documentId: docxDocumentId,
          roundId: docxRoundId,
          interruptIds: ids,
        })) ?? undefined
    } catch {
      return fail(400, 'DOCX_AGENT_RESUME_INVALID', '工具续轮参数无效')
    }
    if (!parentRunId) return fail(409, 'DOCX_AGENT_STALE', '工具续轮已过期或已处理')
  } else {
    await ensureTitle(conversationId, question)
    await appendMessage({ conversationId, role: 'user', text: question.slice(0, 8_000) })
  }

  const mediaReady = await docxMediaReadiness()
  const mediaKinds = [
    ...(mediaReady.vision ? ['image', 'video'] : []),
    ...(mediaReady.audio ? ['audio'] : []),
  ]
  const tools = [
    ...DOCX_LOCAL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
    })),
    ...((await docxImageReady())
      ? DOCX_IMAGE_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
        }))
      : []),
    ...(mediaKinds.length
      ? DOCX_MEDIA_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            ...tool.inputSchema,
            properties: {
              ...tool.inputSchema.properties,
              kind: { type: 'string', enum: mediaKinds },
            },
          },
          outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
        }))
      : []),
    ...((await braveSearchReady())
      ? DOCX_BRAVE_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          execute: tool.name === 'web_search' ? braveWebSearch : braveImageSearch,
        }))
      : []),
  ] as unknown as NonNullable<ModelCallOptions['tools']>

  let stream: Awaited<ReturnType<typeof streamModelChat>>
  try {
    stream = await streamModelChat({
      role: 'chat',
      source: 'chat',
      refId: conversationId,
      stream: true,
      threadId: conversationId,
      runId: parsed.runId,
      ...(parentRunId ? { parentRunId } : {}),
      ...(resuming ? { resume } : {}),
      agentLoopStrategy: maxIterations(12),
      tools,
      messages: parsed.messages,
      systemPrompts: [
        SYSTEM_PROMPT,
        `当前 DOCX：${document.title}（${document.id}）\n画布版本：${version}\n当前画布：${contextText}`,
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
    let started = false
    let interrupted = false
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_STARTED') {
        started = true
        yield chunk
        if (isNew) {
          yield {
            type: 'CUSTOM',
            name: EVENT_CONVERSATION,
            value: { conversationId },
          } as StreamChunk
        }
        continue
      }
      if (!started) throw new Error('DOCX agent 模型流缺少 RUN_STARTED')
      if (chunk.type === 'RUN_ERROR') {
        yield { ...chunk, message: modelCapabilityError(chunk.message) }
        continue
      }
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') answer += chunk.delta
      const clientTools = clientInterrupts(chunk)
      if (clientTools !== null) {
        const message = await appendMessage({
          conversationId,
          role: 'assistant',
          text: answer || '正在执行文档工具',
        })
        await rememberDocxInterrupt({
          runId: parsed.runId,
          conversationId,
          documentId: docxDocumentId,
          roundId: docxRoundId,
          messageId: message.id,
          interruptIds: clientTools.map((tool) => tool.id),
          tools: clientTools.map((tool) => ({
            interruptId: tool.id,
            name: tool.name,
            status: 'pending',
          })),
        })
        interrupted = true
      }
      yield chunk
    }
    if (!interrupted && answer.trim()) {
      await appendMessage({ conversationId, role: 'assistant', text: answer })
    }
  }

  return toServerSentEventsResponse(events())
}
