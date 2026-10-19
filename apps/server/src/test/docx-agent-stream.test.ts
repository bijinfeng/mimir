import { createServer } from 'node:http'
import { HttpAgent } from '@ag-ui/client'
import { chatParamsFromRequestBody, convertSchemaToJsonSchema, StreamProcessor } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { DOCX_ALL_TOOLS, DOCX_OFFICE_TOOLS, EVENT_MESSAGE_IDENTITY } from '@mimir/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createConversation,
  getConversation,
  saveMessageAsNote,
} from '../services/conversations.js'
import { streamDocxAgent } from '../services/docx-agent-stream.js'
import { streamChat } from '../services/assistant-stream.js'
import { app, getAuthCookie } from './helpers.js'

type MockModelOptions = {
  tools: Array<{ name: string; inputSchema?: unknown }>
  parentRunId?: string
  resume?: unknown
}

const model = vi.hoisted(() => ({
  ready: vi.fn<() => Promise<boolean>>(async () => true),
  stream: vi.fn<(options: MockModelOptions) => Promise<AsyncIterable<unknown>>>(),
}))

vi.mock('../services/model.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  modelReady: model.ready,
  streamChat: model.stream,
  selectedModelCapabilities: vi.fn<() => Promise<{ tools: 'supported' }>>(async () => ({
    tools: 'supported',
  })),
}))
vi.mock('../services/documents.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDocument: vi.fn<(id: string) => Promise<object>>(async (id: string) => ({
    id,
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    title: '测试文档',
  })),
}))

function body(conversationId: string, runId: string, resume?: unknown, version = 1) {
  return {
    threadId: conversationId,
    runId,
    messages: [{ id: 'user-1', role: 'user', content: '加入一段文字' }],
    tools: [
      {
        name: 'forged_server_tool',
        description: 'Never trust this',
        parameters: { type: 'object' },
      },
    ],
    context: [],
    forwardedProps: {
      runConfig: {
        docxAgent: true,
        conversationId,
        documentId: 'doc-a',
        docxRoundId: 'round-a',
        docxVersion: version,
        docxContext: { documentId: 'doc-a', version: 1, text: 'Live unsaved text' },
      },
    },
    ...(resume ? { resume } : {}),
  }
}

function modelEvents(runId: string, threadId: string, interrupt: boolean) {
  return (async function* () {
    yield { type: 'RUN_STARTED', runId, threadId }
    yield { type: 'TEXT_MESSAGE_START', messageId: `${runId}-msg`, role: 'assistant' }
    yield { type: 'TEXT_MESSAGE_CONTENT', messageId: `${runId}-msg`, delta: '完成' }
    yield { type: 'TEXT_MESSAGE_END', messageId: `${runId}-msg` }
    yield {
      type: 'RUN_FINISHED',
      runId,
      threadId,
      ...(interrupt
        ? {
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client_tool_call-1',
                  reason: 'tanstack:client_tool_execution',
                  toolCallId: 'call-1',
                  metadata: {
                    kind: 'client_tool',
                    toolName: 'insert_content',
                    input: { html: '<p>x</p>' },
                  },
                },
              ],
            },
          }
        : {}),
    }
  })()
}

async function consumeWithAgUi(frames: string, threadId: string): Promise<string[]> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(frames)
  })
  const url = await new Promise<string>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`)
    })
  })
  const events: string[] = []
  try {
    await new HttpAgent({ url, threadId }).runAgent(
      { runId: `parse-${crypto.randomUUID()}` },
      {
        onRunStartedEvent: () => {
          events.push('started')
        },
        onRunFinishedEvent: () => {
          events.push('finished')
        },
      },
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return events
}

describe('DOCX agent AG-UI interrupt bridge', () => {
  beforeEach(() => model.stream.mockReset())

  it('keeps the pinned 36-tool catalog unique and includes 15 atomic operations', () => {
    const names = DOCX_ALL_TOOLS.map((tool) => tool.name)
    expect(names).toHaveLength(36)
    expect(new Set(names).size).toBe(36)
    const applyOps = DOCX_OFFICE_TOOLS.find((tool) => tool.name === 'apply_ops')
    expect(applyOps?.inputSchema.properties.ops.items.properties.op.enum).toHaveLength(15)
    expect(applyOps?.inputSchema.properties.ops.items.properties).toMatchObject({
      target: { type: 'object' },
      color: { type: ['string', 'null'] },
      find: { type: 'string' },
      replace: { type: 'string' },
      delta: { type: 'integer' },
    })
    const attrs = applyOps?.inputSchema.properties.ops.items.properties.attrs
    expect(attrs).toMatchObject({
      minProperties: 1,
      additionalProperties: false,
      properties: {
        align: { type: ['string', 'null'] },
        lineRule: { type: ['string', 'null'] },
        snapToGrid: { type: ['boolean', 'null'] },
      },
    })
    expect(Object.keys(attrs?.properties ?? {})).not.toContain('genXml')
    // TanStack passes plain JSON Schema through to the provider unchanged.
    expect(
      convertSchemaToJsonSchema(
        applyOps?.inputSchema as unknown as Parameters<typeof convertSchemaToJsonSchema>[0],
      ),
    ).toBe(applyOps?.inputSchema)
  })

  it('reports a model tool-calling capability failure explicitly', async () => {
    const conversation = await createConversation()
    model.stream.mockResolvedValue(
      (async function* () {
        yield { type: 'RUN_STARTED', runId: 'capability-run', threadId: conversation.id }
        yield { type: 'RUN_ERROR', message: 'function calling is not supported by this model' }
      })(),
    )
    const response = await streamDocxAgent(
      await chatParamsFromRequestBody(body(conversation.id, 'capability-run')),
    )
    const frames = await response.text()
    expect(frames).toContain('当前聊天模型不支持工具调用')
    expect(frames).toContain('mimir.failure')
    expect(frames).toContain('TEXT_MESSAGE_CONTENT')
    expect((await getConversation(conversation.id))?.messages.at(-1)).toMatchObject({
      role: 'assistant',
      failure: 'quota',
    })
    const failedId = (await getConversation(conversation.id))?.messages.at(-1)?.id
    expect(frames).toContain(
      JSON.stringify({
        messageId: failedId,
        clientMessageId: 'capability-run-model-error',
        role: 'assistant',
      }),
    )
    expect(frames.lastIndexOf(EVENT_MESSAGE_IDENTITY)).toBeLessThan(frames.indexOf('RUN_ERROR'))
  })

  it('publishes canonical IDs and makes the answer saveable before the live completion event', async () => {
    const conversation = await createConversation()
    const runId = `save-${crypto.randomUUID()}`
    let releaseTail!: () => void
    const tail = new Promise<void>((resolve) => {
      releaseTail = resolve
    })
    model.stream.mockResolvedValue(
      (async function* () {
        yield* modelEvents(runId, conversation.id, false)
        // Persistence cannot depend on asking the provider for another chunk after
        // its terminal: clients already expose save at RUN_FINISHED.
        await tail
      })(),
    )
    const response = await streamChat(body(conversation.id, runId))
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    const identities = new Map<string, { messageId: string; role: string }>()
    let finished = false
    try {
      while (!finished) {
        const next = await reader.read()
        if (next.done) break
        buffered += decoder.decode(next.value, { stream: true })
        let newline: number
        while ((newline = buffered.indexOf('\n')) >= 0) {
          const line = buffered.slice(0, newline)
          buffered = buffered.slice(newline + 1)
          if (!line.startsWith('data: ')) continue
          const chunk = JSON.parse(line.slice(6))
          if (chunk.type === 'CUSTOM' && chunk.name === EVENT_MESSAGE_IDENTITY)
            identities.set(chunk.value.clientMessageId, chunk.value)
          if (chunk.type === 'RUN_FINISHED') finished = true
        }
      }
      expect(finished).toBe(true)
      const messages = (await getConversation(conversation.id))!.messages
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
      expect(identities.get('user-1')).toEqual({
        messageId: messages[0]!.id,
        clientMessageId: 'user-1',
        role: 'user',
      })
      expect(identities.get(`${runId}-msg`)).toMatchObject({
        messageId: messages[1]!.id,
        role: 'assistant',
      })
      expect(await saveMessageAsNote(identities.get(`${runId}-msg`)!.messageId)).toMatchObject({
        conversationId: conversation.id,
        noteId: expect.any(String),
      })
    } finally {
      releaseTail()
      await reader.cancel()
    }
  })

  it('keeps the selected model and authenticated Agent source on text-only history', async () => {
    const conversation = await createConversation()
    const runId = `history-${crypto.randomUUID()}`
    const request = body(conversation.id, runId)
    const selection = {
      providerId: 'chosen-provider',
      modelId: 'chosen-model',
      reasoningEffort: 'high',
    }
    model.stream.mockResolvedValue(modelEvents(runId, conversation.id, false))
    const response = await streamChat({
      ...request,
      forwardedProps: {
        ...request.forwardedProps,
        modelSelection: selection,
        retrievalScope: { type: 'all' },
      },
    })
    const frames = await response.text()
    const reloaded = (await getConversation(conversation.id))!.messages
    expect(reloaded).toHaveLength(2)
    expect(reloaded.map((message) => message.modelSelection)).toEqual([selection, selection])
    expect(reloaded.map((message) => message.retrievalScope)).toEqual([
      { type: 'document', documentId: 'doc-a' },
      { type: 'document', documentId: 'doc-a' },
    ])
    expect(reloaded.map((message) => message.agent)).toEqual([
      { runId, documentId: 'doc-a', format: 'docx', status: 'completed', tools: [] },
      { runId, documentId: 'doc-a', format: 'docx', status: 'completed', tools: [] },
    ])
    expect(frames).toContain('mimir.documentAgent')
    expect(JSON.stringify(reloaded)).not.toContain('Live unsaved text')
    expect(model.stream.mock.calls[0]?.[0]).toMatchObject({ modelSelection: selection })
  })

  it('restores real reasoning and tool parts through the SDK without storing run terminals or canvas context', async () => {
    const conversation = await createConversation()
    const runId = `parts-${crypto.randomUUID()}`
    const actual = [
      { type: 'REASONING_START', messageId: 'agent-parts' },
      { type: 'REASONING_MESSAGE_START', messageId: 'agent-parts', role: 'assistant' },
      { type: 'REASONING_MESSAGE_CONTENT', messageId: 'agent-parts', delta: '实际思考' },
      { type: 'REASONING_MESSAGE_END', messageId: 'agent-parts' },
      { type: 'REASONING_END', messageId: 'agent-parts' },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'read-1',
        toolCallName: 'read_document',
        parentMessageId: 'agent-parts',
      },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'read-1', delta: '{"section":"introduction"}' },
      { type: 'TOOL_CALL_END', toolCallId: 'read-1' },
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'read-1',
        messageId: 'read-result',
        role: 'tool',
        content: '{"ok":true}',
      },
      { type: 'TEXT_MESSAGE_START', messageId: 'agent-parts', role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'agent-parts', delta: '读取完成' },
      { type: 'TEXT_MESSAGE_END', messageId: 'agent-parts' },
    ] as StreamChunk[]
    model.stream.mockResolvedValue(
      (async function* () {
        for (const chunk of actual) yield chunk
        yield { type: 'RUN_FINISHED', runId, threadId: conversation.id }
      })(),
    )
    await (await streamChat(body(conversation.id, runId))).text()
    const answer = (await getConversation(conversation.id))!.messages.at(-1)!
    expect(answer.text).toBe('读取完成')
    expect(answer.protocolEvents?.slice(1)).toEqual(actual)
    expect(answer.protocolEvents?.some((event) => String(event.type).startsWith('RUN_'))).toBe(
      false,
    )
    const processor = new StreamProcessor()
    for (const event of answer.protocolEvents!)
      processor.processChunk(event as unknown as StreamChunk)
    const parts = processor.getMessages().flatMap((message) => message.parts)
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'thinking', content: '实际思考' }),
        expect.objectContaining({
          type: 'tool-call',
          name: 'read_document',
          arguments: '{"section":"introduction"}',
          output: { ok: true },
        }),
        expect.objectContaining({ type: 'text', content: '读取完成' }),
      ]),
    )
    expect(answer.agent).toMatchObject({ format: 'docx', status: 'completed', tools: [] })
  })

  it('bounds retained Agent events and persists the failed source on an oversized event', async () => {
    const conversation = await createConversation()
    model.stream.mockResolvedValue(
      (async function* () {
        yield { type: 'REASONING_MESSAGE_START', messageId: 'oversized', role: 'assistant' }
        yield {
          type: 'REASONING_MESSAGE_CONTENT',
          messageId: 'oversized',
          delta: 'x'.repeat(2 * 1024 * 1024),
        }
      })(),
    )
    const frames = await (
      await streamChat(body(conversation.id, `limit-${crypto.randomUUID()}`))
    ).text()
    const answer = (await getConversation(conversation.id))!.messages.at(-1)!
    expect(frames).toContain('本轮消息记录超过容量限制')
    expect(frames).toContain('RUN_ERROR')
    expect(answer.agent).toMatchObject({ documentId: 'doc-a', status: 'failed' })
    expect(Buffer.byteLength(JSON.stringify(answer.protocolEvents))).toBeLessThan(2 * 1024 * 1024)
  })

  it('retains user-only Agent provenance when model creation fails before a response starts', async () => {
    const conversation = await createConversation()
    model.stream.mockRejectedValueOnce(new Error('provider unavailable'))
    const response = await streamChat(body(conversation.id, `startup-${crypto.randomUUID()}`))
    expect(response.status).toBe(502)
    const history = (await getConversation(conversation.id))!.messages
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      role: 'user',
      retrievalScope: { type: 'document', documentId: 'doc-a' },
      agent: { documentId: 'doc-a', format: 'docx', tools: [] },
    })
  })

  it('keeps partial EOF as a failed Agent answer that cannot become a saved success after reload', async () => {
    const conversation = await createConversation()
    const runId = `eof-${crypto.randomUUID()}`
    model.stream.mockResolvedValue(
      (async function* () {
        yield { type: 'TEXT_MESSAGE_START', messageId: 'partial-agent', role: 'assistant' }
        yield { type: 'TEXT_MESSAGE_CONTENT', messageId: 'partial-agent', delta: '部分回答' }
      })(),
    )
    const frames = await (await streamChat(body(conversation.id, runId))).text()
    const answer = (await getConversation(conversation.id))!.messages.at(-1)!
    expect(answer).toMatchObject({
      text: '部分回答',
      failure: 'truncated',
      agent: { status: 'failed' },
    })
    expect(frames).not.toContain('"type":"RUN_FINISHED"')
    expect(frames).toContain('"type":"RUN_ERROR"')
    expect(frames.indexOf('mimir.failure')).toBeLessThan(frames.indexOf('"type":"RUN_ERROR"'))
    await expect(saveMessageAsNote(answer.id)).rejects.toMatchObject({
      code: 'MESSAGE_NOT_SAVEABLE',
    })
  })

  it('keeps explicitly completed tool-only events without inventing saveable answer text', async () => {
    const conversation = await createConversation()
    const runId = `tool-final-${crypto.randomUUID()}`
    model.stream.mockResolvedValue(
      (async function* () {
        yield {
          type: 'TOOL_CALL_START',
          toolCallId: 'read-1',
          toolCallName: 'read_document',
          parentMessageId: 'only-tools',
        }
        yield { type: 'TOOL_CALL_ARGS', toolCallId: 'read-1', delta: '{}' }
        yield { type: 'TOOL_CALL_END', toolCallId: 'read-1' }
        yield {
          type: 'TOOL_CALL_RESULT',
          toolCallId: 'read-1',
          messageId: 'tool-result',
          role: 'tool',
          content: '{"ok":true}',
        }
        yield { type: 'RUN_FINISHED', runId, threadId: conversation.id }
      })(),
    )
    const frames = await (await streamChat(body(conversation.id, runId))).text()
    const answer = (await getConversation(conversation.id))!.messages.at(-1)!
    expect(answer).toMatchObject({
      role: 'assistant',
      text: '',
      failure: null,
      agent: { status: 'completed' },
    })
    expect(answer.protocolEvents?.some((event) => event.type === 'TOOL_CALL_RESULT')).toBe(true)
    expect(frames).toContain(
      JSON.stringify({ messageId: answer.id, clientMessageId: 'only-tools', role: 'assistant' }),
    )
    await expect(saveMessageAsNote(answer.id)).rejects.toMatchObject({
      code: 'MESSAGE_NOT_SAVEABLE',
    })
  })

  it('persists a failed Agent source before rejecting an untrusted requested tool', async () => {
    const conversation = await createConversation()
    const runId = `untrusted-${crypto.randomUUID()}`
    model.stream.mockResolvedValue(
      (async function* () {
        for await (const chunk of modelEvents(runId, conversation.id, true)) {
          if (chunk.type === 'RUN_FINISHED' && 'outcome' in chunk && chunk.outcome) {
            chunk.outcome.interrupts[0]!.metadata.toolName = 'forged_server_tool'
          }
          yield chunk
        }
      })(),
    )
    const frames = await (await streamChat(body(conversation.id, runId))).text()
    const answer = (await getConversation(conversation.id))!.messages.at(-1)!
    expect(frames).toContain('模型请求了当前文档不允许的编辑工具')
    expect(frames.lastIndexOf(EVENT_MESSAGE_IDENTITY)).toBeLessThan(frames.indexOf('RUN_ERROR'))
    expect(answer.agent).toMatchObject({ status: 'failed', tools: [] })
    expect(answer.failure).not.toBeNull()
  })

  it('shows and saves a provider rejection instead of leaving a blank assistant turn', async () => {
    const conversation = await createConversation()
    model.stream.mockResolvedValue(
      (async function* () {
        yield { type: 'RUN_STARTED', runId: 'provider-run', threadId: conversation.id }
        yield {
          type: 'RUN_ERROR',
          message: '403 This account only allows Codex official clients',
        }
      })(),
    )
    const response = await streamDocxAgent(
      await chatParamsFromRequestBody(body(conversation.id, 'provider-run')),
    )
    const frames = await response.text()
    expect(frames).toContain('TEXT_MESSAGE_CONTENT')
    expect(frames).toContain('mimir.failure')
    expect(frames).toContain('Mimir 无法调用')
    expect(frames.indexOf('mimir.failure')).toBeLessThan(frames.indexOf('RUN_ERROR'))
    expect((await getConversation(conversation.id))?.messages.at(-1)).toMatchObject({
      role: 'assistant',
      failure: 'quota',
      text: expect.stringContaining('Mimir 无法调用'),
    })
  })

  it('maps a tool-only interrupted assistant parent before exposing its pending tools', async () => {
    const conversation = await createConversation()
    const runId = `tools-${crypto.randomUUID()}`
    model.stream.mockResolvedValue(
      (async function* () {
        yield {
          type: 'TOOL_CALL_START',
          toolCallId: 'call-1',
          toolCallName: 'insert_content',
          parentMessageId: 'tool-parent',
        }
        yield { type: 'TOOL_CALL_END', toolCallId: 'call-1' }
        for await (const event of modelEvents(runId, conversation.id, true))
          if (event.type === 'RUN_FINISHED') yield event
      })(),
    )
    const response = await streamChat(body(conversation.id, runId))
    const frames = await response.text()
    const pending = (await getConversation(conversation.id))?.messages.at(-1)
    expect(pending).toMatchObject({
      role: 'assistant',
      text: '正在执行文档工具',
      agent: { status: 'pending' },
    })
    expect(frames).toContain(
      JSON.stringify({
        messageId: pending!.id,
        clientMessageId: 'tool-parent',
        role: 'assistant',
      }),
    )
    expect(frames.lastIndexOf(EVENT_MESSAGE_IDENTITY)).toBeLessThan(frames.indexOf('RUN_FINISHED'))
  })

  it('rejects a provisional thread before starting a document tool run', async () => {
    const provisional = `thread-${crypto.randomUUID()}`
    const request = body(provisional, `run-${crypto.randomUUID()}`)
    const missing = await streamChat({
      ...request,
      forwardedProps: {
        runConfig: { ...request.forwardedProps.runConfig, conversationId: undefined },
      },
    })
    expect(missing.status).toBe(409)
    expect(await missing.text()).toContain('文档编辑会话已不存在')

    const conversation = await createConversation()
    const mismatched = await streamChat({
      ...request,
      forwardedProps: {
        runConfig: { ...request.forwardedProps.runConfig, conversationId: conversation.id },
      },
    })
    expect(mismatched.status).toBe(400)
    expect(await mismatched.text()).toContain('对话线程与编辑会话不匹配')
    expect(model.stream).not.toHaveBeenCalled()
  })

  it('advertises only trusted tools and resumes with the persisted parent run', async () => {
    const conversation = await createConversation()
    const firstRunId = `run-${crypto.randomUUID()}`
    const secondRunId = `run-${crypto.randomUUID()}`
    model.stream
      .mockResolvedValueOnce(modelEvents(firstRunId, conversation.id, true))
      .mockResolvedValueOnce(modelEvents(secondRunId, conversation.id, false))

    const first = await streamChat(body(conversation.id, firstRunId))
    expect(first.status).toBe(200)
    const firstFrames = await first.text()
    expect(firstFrames).toContain('RUN_STARTED')
    expect(firstFrames).toContain('client_tool_call-1')
    expect(await consumeWithAgUi(firstFrames, conversation.id)).toEqual(['started', 'finished'])
    const pending = await getConversation(conversation.id)
    expect(firstFrames).toContain(
      JSON.stringify({
        messageId: pending?.messages.at(-1)?.id,
        clientMessageId: `${firstRunId}-msg`,
        role: 'assistant',
      }),
    )
    expect(firstFrames.lastIndexOf(EVENT_MESSAGE_IDENTITY)).toBeLessThan(
      firstFrames.indexOf('RUN_FINISHED'),
    )
    expect(
      pending?.messages.find(
        (message) => message.role === 'assistant' && message.agent?.runId === firstRunId,
      )?.agent,
    ).toMatchObject({
      status: 'pending',
      tools: [{ name: 'insert_content', status: 'pending' }],
    })
    expect(
      model.stream.mock.calls[0]?.[0].tools.map((tool: { name: string }) => tool.name),
    ).toContain('insert_content')
    expect(
      model.stream.mock.calls[0]?.[0].tools.map((tool: { name: string }) => tool.name),
    ).not.toContain('forged_server_tool')
    expect(
      model.stream.mock.calls[0]?.[0].tools.find((tool) => tool.name === 'apply_ops')?.inputSchema,
    ).toBe(DOCX_OFFICE_TOOLS.find((tool) => tool.name === 'apply_ops')?.inputSchema)

    const resume = [
      {
        interruptId: 'client_tool_call-1',
        status: 'resolved',
        payload: { ok: true, summary: '已插入', changed: true, version: 2 },
      },
    ]
    const second = await streamDocxAgent(
      await chatParamsFromRequestBody(body(conversation.id, secondRunId, resume, 2)),
    )
    expect(second.status).toBe(200)
    const secondFrames = await second.text()
    expect(secondFrames).toContain('RUN_FINISHED')
    expect(model.stream.mock.calls[1]?.[0].parentRunId).toBe(firstRunId)
    expect(model.stream.mock.calls[1]?.[0].resume).toEqual(resume)
    const settled = await getConversation(conversation.id)
    expect(settled?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'assistant',
    ])
    expect(secondFrames).toContain(
      JSON.stringify({
        messageId: settled?.messages.at(-1)?.id,
        clientMessageId: `${secondRunId}-msg`,
        role: 'assistant',
      }),
    )
    expect(secondFrames.lastIndexOf(EVENT_MESSAGE_IDENTITY)).toBeLessThan(
      secondFrames.indexOf('RUN_FINISHED'),
    )
    expect(
      settled?.messages.find(
        (message) => message.role === 'assistant' && message.agent?.runId === firstRunId,
      )?.agent,
    ).toMatchObject({
      status: 'completed',
      tools: [{ name: 'insert_content', status: 'completed', changed: true }],
    })

    const replay = await streamChat(body(conversation.id, `run-${crypto.randomUUID()}`, resume, 2))
    expect(replay.status).toBe(409)
    expect(model.stream).toHaveBeenCalledTimes(2)
  })

  it('allows retry when model creation fails before the resumed stream starts', async () => {
    const conversation = await createConversation()
    const firstRunId = `run-${crypto.randomUUID()}`
    const resume = [
      {
        interruptId: 'client_tool_call-1',
        status: 'resolved',
        payload: { ok: false, error: '画布已变化' },
      },
    ]
    model.stream
      .mockResolvedValueOnce(modelEvents(firstRunId, conversation.id, true))
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce(modelEvents(`run-${crypto.randomUUID()}`, conversation.id, false))

    const first = await streamChat(body(conversation.id, firstRunId))
    await first.text()
    const failed = await streamChat(body(conversation.id, `run-${crypto.randomUUID()}`, resume))
    expect(failed.status).toBe(502)
    const retry = await streamChat(body(conversation.id, `run-${crypto.randomUUID()}`, resume))
    expect(retry.status).toBe(200)
    await retry.text()
    expect(model.stream.mock.calls[2]?.[0].parentRunId).toBe(firstRunId)
  })

  it('preserves an SDK resume error emitted before RUN_STARTED', async () => {
    const conversation = await createConversation()
    const firstRunId = `run-${crypto.randomUUID()}`
    model.stream
      .mockResolvedValueOnce(modelEvents(firstRunId, conversation.id, true))
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            type: 'RUN_ERROR',
            code: 'unknown-interrupt',
            message: 'Resume entry references unknown interrupt client_tool_call-1.',
          }
        })(),
      )
    const first = await streamChat(body(conversation.id, firstRunId))
    await first.text()

    const second = await streamChat(
      body(conversation.id, `run-${crypto.randomUUID()}`, [
        {
          interruptId: 'client_tool_call-1',
          status: 'resolved',
          payload: { ok: true, changed: false, version: 1 },
        },
      ]),
    )
    expect(second.status).toBe(200)
    const frames = await second.text()
    const chunks = frames
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; message?: string })
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'CUSTOM',
      'CUSTOM',
      'CUSTOM',
      'RUN_ERROR',
    ])
    expect(chunks.at(-1)?.message).toContain('unknown interrupt client_tool_call-1')
    expect(await consumeWithAgUi(frames, conversation.id)).toEqual(['started'])
  })

  it('starts AG-UI before a resumed tool result that precedes the provider start', async () => {
    const conversation = await createConversation()
    const firstRunId = `run-${crypto.randomUUID()}`
    const secondRunId = `run-${crypto.randomUUID()}`
    model.stream
      .mockResolvedValueOnce(modelEvents(firstRunId, conversation.id, true))
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            type: 'TOOL_CALL_RESULT',
            messageId: 'tool-result-1',
            toolCallId: 'call-1',
            content: '{"ok":true,"changed":false,"version":1}',
            role: 'tool',
          }
          yield { type: 'RUN_STARTED', runId: secondRunId, threadId: conversation.id }
          yield { type: 'TEXT_MESSAGE_START', messageId: 'answer-1', role: 'assistant' }
          yield { type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer-1', delta: '已读取工作簿' }
          yield { type: 'TEXT_MESSAGE_END', messageId: 'answer-1' }
          yield { type: 'RUN_FINISHED', runId: secondRunId, threadId: conversation.id }
        })(),
      )
    const first = await streamChat(body(conversation.id, firstRunId))
    await first.text()

    const second = await streamChat(
      body(conversation.id, secondRunId, [
        {
          interruptId: 'client_tool_call-1',
          status: 'resolved',
          payload: { ok: true, changed: false, version: 1 },
        },
      ]),
    )
    expect(second.status).toBe(200)
    const frames = await second.text()
    const chunks = frames
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; delta?: string })
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TOOL_CALL_RESULT',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'CUSTOM',
      'CUSTOM',
      'RUN_FINISHED',
    ])
    expect(chunks.find((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')?.delta).toBe(
      '已读取工作簿',
    )
  })

  it('rejects malformed or misbound tool results before model continuation without consuming the run', async () => {
    const conversation = await createConversation()
    const firstRunId = `run-${crypto.randomUUID()}`
    model.stream
      .mockResolvedValueOnce(modelEvents(firstRunId, conversation.id, true))
      .mockResolvedValueOnce(modelEvents(`run-${crypto.randomUUID()}`, conversation.id, false))
    const first = await streamChat(body(conversation.id, firstRunId))
    await first.text()

    for (const payload of [
      { changed: true, version: 2 },
      { ok: 'true' },
      { ok: true, changed: true },
    ]) {
      const invalid = await streamChat(
        body(
          conversation.id,
          `run-${crypto.randomUUID()}`,
          [{ interruptId: 'client_tool_call-1', status: 'resolved', payload }],
          2,
        ),
      )
      expect(invalid.status).toBe(400)
    }
    const wrongInterrupt = await streamChat(
      body(
        conversation.id,
        `run-${crypto.randomUUID()}`,
        [
          {
            interruptId: 'client_tool_other',
            status: 'resolved',
            payload: { ok: true, changed: true, version: 2 },
          },
        ],
        2,
      ),
    )
    expect(wrongInterrupt.status).toBe(409)
    const staleVersion = await streamChat(
      body(
        conversation.id,
        `run-${crypto.randomUUID()}`,
        [
          {
            interruptId: 'client_tool_call-1',
            status: 'resolved',
            payload: { ok: true, changed: true, version: 2 },
          },
        ],
        1,
      ),
    )
    expect(staleVersion.status).toBe(409)
    expect(model.stream).toHaveBeenCalledTimes(1)

    const validResume = [
      {
        interruptId: 'client_tool_call-1',
        status: 'resolved',
        payload: { ok: true, changed: true, version: 2 },
      },
    ]
    const valid = await streamChat(
      body(conversation.id, `run-${crypto.randomUUID()}`, validResume, 2),
    )
    expect(valid.status).toBe(200)
    await valid.text()
    expect(model.stream).toHaveBeenCalledTimes(2)
    expect(model.stream.mock.calls[1]?.[0].parentRunId).toBe(firstRunId)
  })
})

describe('DOCX agent capability routes', () => {
  it('requires authentication and validates the current document for generation', async () => {
    const anonymous = await app.request('/api/conversations/docx-agent/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'doc-a', prompt: 'A chart' }),
    })
    expect(anonymous.status).toBe(401)

    const cookie = await getAuthCookie()
    const capabilities = await app.request(
      '/api/conversations/docx-agent/capabilities?documentId=doc-a',
      { headers: { Cookie: cookie } },
    )
    expect(capabilities.status).toBe(200)
    const capabilitiesBody = (await capabilities.json()) as {
      availableTools: string[]
      unavailableTools: Array<{ name: string }>
    }
    expect(capabilitiesBody.availableTools).toContain('insert_content')
    expect(capabilitiesBody.availableTools).toContain('write_document')
    expect(capabilitiesBody.unavailableTools.map((tool) => tool.name)).toContain('generate_image')

    const generation = await app.request('/api/conversations/docx-agent/generate-image', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'doc-a', prompt: 'A chart' }),
    })
    expect(generation.status).toBe(409)

    const unsafeImage = await app.request('/api/conversations/docx-agent/fetch-image', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'doc-a', url: 'http://127.0.0.1/private.png' }),
    })
    expect(unsafeImage.status).toBe(400)

    const media = await app.request('/api/conversations/docx-agent/analyze-media', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: 'doc-a',
        instruction: '描述',
        kind: 'image',
        media: [{ mimeType: 'image/png', data: 'AA==' }],
      }),
    })
    expect(media.status).toBe(409)
  })
})
