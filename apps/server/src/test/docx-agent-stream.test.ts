import { createServer } from 'node:http'
import { HttpAgent } from '@ag-ui/client'
import { chatParamsFromRequestBody, convertSchemaToJsonSchema } from '@tanstack/ai'
import { DOCX_ALL_TOOLS, DOCX_OFFICE_TOOLS } from '@mimir/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConversation, getConversation } from '../services/conversations.js'
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
    expect(
      pending?.messages.find((message) => message.agent?.runId === firstRunId)?.agent,
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
    expect(await second.text()).toContain('RUN_FINISHED')
    expect(model.stream.mock.calls[1]?.[0].parentRunId).toBe(firstRunId)
    expect(model.stream.mock.calls[1]?.[0].resume).toEqual(resume)
    const settled = await getConversation(conversation.id)
    expect(
      settled?.messages.find((message) => message.agent?.runId === firstRunId)?.agent,
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
