import { chatParamsFromRequestBody } from '@tanstack/ai'
import { documentAgentCanvasSupported, documentAgentFormatOf } from '@mimir/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentAgentCatalog } from '../services/document-agent-catalog.js'
import { createConversation, getConversation } from '../services/conversations.js'
import { streamDocxAgent } from '../services/docx-agent-stream.js'
import { app, getAuthCookie } from './helpers.js'

const model = vi.hoisted(() => ({
  stream: vi.fn<(...args: unknown[]) => Promise<AsyncIterable<unknown>>>(),
}))

vi.mock('../services/model.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  modelReady: async () => true,
  streamChat: model.stream,
}))
vi.mock('../services/documents.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDocument: async (id: string) => ({
    id,
    title: '测试工作簿',
    kind: 'file',
    mime:
      id === 'xlsx-a'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : id === 'octet-docx'
          ? 'application/octet-stream'
          : id === 'x-markdown'
            ? 'text/x-markdown'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileExtension: id === 'octet-docx' ? 'docx' : id === 'x-markdown' ? 'md' : null,
  }),
}))

const fakeCatalog: DocumentAgentCatalog = {
  format: 'xlsx',
  systemPrompt: '测试格式编辑器',
  tools: [
    {
      name: 'fake_write',
      description: 'Edit a fake workbook',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    },
  ] as unknown as DocumentAgentCatalog['tools'],
  clientToolNames: new Set(['fake_write']),
}

function request(conversationId: string, runId: string, version = 1, resume?: unknown) {
  return {
    threadId: conversationId,
    runId,
    messages: [{ id: 'u1', role: 'user', content: '改写工作簿' }],
    tools: [{ name: 'forged_write', description: 'untrusted', parameters: { type: 'object' } }],
    context: [],
    forwardedProps: {
      runConfig: {
        documentAgent: true,
        agentFormat: 'xlsx',
        documentId: 'xlsx-a',
        conversationId,
        agentRoundId: 'round-1',
        agentVersion: version,
        agentContext: { sheet: 'Sheet1', unsaved: true },
      },
    },
    ...(resume ? { resume } : {}),
  }
}

function events(runId: string, conversationId: string, interrupt: boolean) {
  return (async function* () {
    yield { type: 'RUN_STARTED', runId, threadId: conversationId }
    yield { type: 'TEXT_MESSAGE_START', messageId: `${runId}-message`, role: 'assistant' }
    yield { type: 'TEXT_MESSAGE_CONTENT', messageId: `${runId}-message`, delta: '完成' }
    yield { type: 'TEXT_MESSAGE_END', messageId: `${runId}-message` }
    yield {
      type: 'RUN_FINISHED',
      runId,
      threadId: conversationId,
      ...(interrupt
        ? {
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client_tool_fake-1',
                  reason: 'tanstack:client_tool_execution',
                  metadata: { kind: 'client_tool', toolName: 'fake_write', input: {} },
                },
              ],
            },
          }
        : {}),
    }
  })()
}

describe('shared document agent lifecycle', () => {
  beforeEach(() => model.stream.mockReset())

  it('checks the persisted format before streaming', async () => {
    const conversation = await createConversation()
    const mismatched = request(conversation.id, crypto.randomUUID())
    mismatched.forwardedProps.runConfig.documentId = 'docx-a'
    expect((await streamDocxAgent(await chatParamsFromRequestBody(mismatched))).status).toBe(404)
    expect(
      (await streamDocxAgent(await chatParamsFromRequestBody(request(conversation.id, 'r2'))))
        .status,
    ).toBe(200)
    expect(model.stream).toHaveBeenCalledOnce()
    const options = model.stream.mock.calls[0]?.[0] as { tools: { name: string }[] }
    expect(options.tools.map((tool) => tool.name)).toEqual([
      'create_document',
      'get_workbook_context',
      'read_range',
      'read_cells',
      'find_cells',
      'aggregate_range',
      'load_guide',
      'read_formats',
      'read_sheet_features',
      'select_range',
      'trace_precedents',
      'trace_dependents',
      'propose_operations',
    ])
  })

  it('requires authentication and reports the registered XLSX tools', async () => {
    const url = '/api/conversations/document-agent/capabilities?documentId=xlsx-a'
    expect((await app.request(url)).status).toBe(401)
    const response = await app.request(url, { headers: { Cookie: await getAuthCookie() } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      format: 'xlsx',
      documentId: 'xlsx-a',
      executorReady: true,
      availableTools: [
        'create_document',
        'get_workbook_context',
        'read_range',
        'read_cells',
        'find_cells',
        'aggregate_range',
        'load_guide',
        'read_formats',
        'read_sheet_features',
        'select_range',
        'trace_precedents',
        'trace_dependents',
        'propose_operations',
      ],
    })
  })

  it('uses one format rule for generic MIME and Markdown aliases without claiming a canvas', async () => {
    expect(
      documentAgentFormatOf({
        kind: 'file',
        mime: 'application/octet-stream',
        fileExtension: 'docx',
      }),
    ).toBe('docx')
    expect(
      documentAgentFormatOf({ kind: 'file', mime: 'text/x-markdown', fileExtension: 'md' }),
    ).toBe('markdown')
    expect(
      documentAgentCanvasSupported({
        kind: 'file',
        mime: 'application/octet-stream',
        fileExtension: 'docx',
      }),
    ).toBe(false)
    expect(
      documentAgentCanvasSupported({ kind: 'file', mime: 'text/x-markdown', fileExtension: 'md' }),
    ).toBe(false)
    const cookie = await getAuthCookie()
    const response = await app.request(
      '/api/conversations/document-agent/capabilities?documentId=octet-docx',
      { headers: { Cookie: cookie } },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      format: 'docx',
      executorReady: false,
      availableTools: [],
    })
  })

  it('isolates a fake format, binds its interrupt once and sends failure back to the model', async () => {
    const conversation = await createConversation()
    const firstRunId = `run-${crypto.randomUUID()}`
    const secondRunId = `run-${crypto.randomUUID()}`
    model.stream
      .mockResolvedValueOnce(events(firstRunId, conversation.id, true))
      .mockResolvedValueOnce(events(secondRunId, conversation.id, false))
    const resolveCatalog = async () => fakeCatalog

    const first = await streamDocxAgent(
      await chatParamsFromRequestBody(request(conversation.id, firstRunId)),
      resolveCatalog,
    )
    expect(first.status).toBe(200)
    expect(await first.text()).toContain('client_tool_fake-1')
    const firstCall = model.stream.mock.calls[0]?.[0] as { tools: { name: string }[] } | undefined
    if (!firstCall) throw new Error('缺少第一次模型调用')
    expect(firstCall.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'fake_write' })]),
    )
    expect(firstCall.tools.some((tool) => tool.name === 'forged_write')).toBe(false)
    const failure = [
      {
        interruptId: 'client_tool_fake-1',
        status: 'resolved',
        payload: { ok: false, changed: false, error: '画布版本已变化' },
      },
    ]
    const wrongVersion = await streamDocxAgent(
      await chatParamsFromRequestBody(request(conversation.id, secondRunId, 2, failure)),
      resolveCatalog,
    )
    expect(wrongVersion.status).toBe(409)
    const second = await streamDocxAgent(
      await chatParamsFromRequestBody(request(conversation.id, secondRunId, 1, failure)),
      resolveCatalog,
    )
    expect(second.status).toBe(200)
    await second.text()
    const secondOptions = model.stream.mock.calls[1]?.[0] as {
      parentRunId: string
      resume: unknown
    }
    expect(secondOptions.parentRunId).toBe(firstRunId)
    expect(secondOptions.resume).toEqual(failure)
    const persisted = await getConversation(conversation.id)
    expect(
      persisted?.messages.find(
        (message) => message.role === 'assistant' && message.agent?.runId === firstRunId,
      )?.agent,
    ).toMatchObject({
      format: 'xlsx',
      status: 'failed',
      tools: [{ name: 'fake_write', status: 'failed' }],
    })
    expect(
      (
        await streamDocxAgent(
          await chatParamsFromRequestBody(
            request(conversation.id, crypto.randomUUID(), 1, failure),
          ),
          resolveCatalog,
        )
      ).status,
    ).toBe(409)
  })
})
