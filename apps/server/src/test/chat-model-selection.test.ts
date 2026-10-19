import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ChatAttachment, ChatModelCatalog } from '@mimir/shared'
import { app, getAuthCookie, makeClient } from './helpers.js'
import { assemble } from '../plugins/host.js'
import { saveMessageAsNote } from '../services/conversations.js'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const upstreamRequests: Record<string, unknown>[] = []
const upstream = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  upstreamRequests.push(JSON.parse(body))
  const common = {
    id: 'local-chat-result',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'chat-model',
  }
  const chunks = [
    {
      ...common,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', reasoning_content: '实际供应商思考' },
          finish_reason: null,
        },
      ],
    },
    { ...common, choices: [{ index: 0, delta: { content: '本地模型回答' }, finish_reason: null }] },
    {
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
  ]
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  res.end('data: [DONE]\n\n')
})
let client: ReturnType<typeof makeClient>,
  cookie = '',
  documentId = '',
  originalConfig: unknown
beforeAll(async () => {
  cookie = await getAuthCookie()
  client = makeClient(cookie)
  originalConfig = await assemble().settings.getJson('model.config')
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/v1`
  const configured = await client.patch('/api/config/settings', {
    values: {
      'model.config': {
        providers: [
          {
            id: 'run-selected',
            name: '本地验证',
            preset: 'custom',
            family: 'openai-compatible',
            baseUrl,
            models: [
              {
                id: 'chat-model',
                source: 'manual',
                purposes: ['chat'],
                capabilities: {
                  reasoning: { status: 'supported', levels: ['low', 'high'] },
                  reasoningParameter: 'reasoning_effort',
                  contextWindowTokens: 32768,
                },
              },
              { id: 'reasoner', source: 'manual', purposes: ['chat'] },
            ],
            modelsFetchedAt: null,
          },
        ],
        roles: {
          chat: { providerId: 'run-selected', model: 'reasoner' },
          reasoning: { providerId: 'run-selected', model: 'reasoner' },
        },
        keyDrafts: { 'run-selected': 'local-fixture' },
      },
    },
  })
  if (configured.status !== 200)
    throw new Error(`无法准备模型配置：${JSON.stringify(configured.body)}`)
  const note = await client.post<{ id: string }>('/api/documents/notes', {
    title: '模型路由验证',
    body: '模型路由验证唯一检索资料，显式模型选择不由推理角色决定。',
    tags: [],
  })
  documentId = note.body.id
})
afterAll(async () => {
  await assemble().settings.setJson('model.config', originalConfig ?? { providers: [], roles: {} })
  await new Promise<void>((resolve) => upstream.close(() => resolve()))
})
async function frames(props: Record<string, unknown>) {
  const conversation = await client.post<{ id: string }>('/api/conversations', {})
  const res = await app.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      threadId: conversation.body.id,
      runId: 'chosen-run',
      messages: [{ id: 'user-selected', role: 'user', content: '模型路由验证' }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: { conversationId: conversation.body.id, documentId, ...props },
    }),
  })
  return { res, conversationId: conversation.body.id }
}

describe('model selection through real application and provider HTTP boundaries', () => {
  it('catalogue is protected and carries no secret material', async () => {
    expect((await app.request('/api/config/chat-models')).status).toBe(401)
    const result = await client.get<ChatModelCatalog>('/api/config/chat-models')
    expect(result.body.providers[0]?.models.map((m) => m.modelId)).toEqual([
      'chat-model',
      'reasoner',
    ])
    expect(JSON.stringify(result.body)).not.toContain('local-fixture')
  })
  it('explicit selection beats legacy deepReasoning, persists real reasoning metadata but no trace', async () => {
    const { res, conversationId } = await frames({
      deepReasoning: true,
      modelSelection: {
        providerId: 'run-selected',
        modelId: 'chat-model',
        reasoningEffort: 'high',
      },
    })
    expect(res.status).toBe(200)
    const events = await res.text()
    expect(events).not.toContain('mimir.trace')
    expect(events).toContain('本地模型回答')
    expect(events).toContain('实际供应商思考')
    expect(upstreamRequests.at(-1)).toMatchObject({ model: 'chat-model', reasoning_effort: 'high' })
    const saved = await client.get<{
      messages: { text: string; trace: unknown; protocolEvents?: Record<string, unknown>[] }[]
    }>(`/api/conversations/${conversationId}`)
    const answer = saved.body.messages.at(-1)!
    expect(answer.text).toBe('本地模型回答')
    expect(answer.trace).toBeNull()
    expect(
      answer.protocolEvents?.some((event) => String(event.type).startsWith('REASONING_')),
    ).toBe(true)
    expect(answer.protocolEvents?.some((event) => String(event.type).startsWith('RUN_'))).toBe(
      false,
    )
  })
  it('invalid model/effort is rejected before upstream I/O and user message insertion', async () => {
    const count = upstreamRequests.length
    const { res, conversationId } = await frames({
      modelSelection: {
        providerId: 'run-selected',
        modelId: 'chat-model',
        reasoningEffort: 'xhigh',
      },
    })
    expect(res.status).toBe(422)
    expect(upstreamRequests).toHaveLength(count)
    const saved = await client.get<{ messages: unknown[] }>(`/api/conversations/${conversationId}`)
    expect(saved.body.messages).toHaveLength(0)
  })
  it('nonstreaming ChatResult remains a plain stored answer and legacy routing is unchanged', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    const result = await client.post<{ messages: { text: string }[] }>(
      `/api/conversations/${created.body.id}/ask`,
      {
        question: '模型路由验证',
        scope: 'document',
        documentId,
        deepReasoning: true,
        modelSelection: { providerId: 'run-selected', modelId: 'chat-model' },
      },
    )
    expect(result.status).toBe(200)
    expect(result.body.messages.at(-1)?.text).toBe('本地模型回答')
    expect(upstreamRequests.at(-1)).not.toHaveProperty('reasoning_effort')
    const legacy = await frames({ deepReasoning: true })
    await legacy.res.text()
    expect(upstreamRequests.at(-1)?.model).toBe('reasoner')
  })
  it('real uploaded attachment reaches model even with no KB hit and no permanent import', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    const form = new FormData()
    form.append(
      'file',
      new File(['仅本轮临时附件正文：成本降低三成。'], 'local-report.txt', { type: 'text/plain' }),
    )
    form.append('uploadOperationId', 'model-pipeline-upload')
    const upload = await app.request(`/api/conversations/${created.body.id}/attachments`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    expect(upload.status).toBe(200)
    const attachment = (await upload.json()) as ChatAttachment
    expect(attachment.status).toBe('ready')
    const send = await app.request('/api/chat', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId: created.body.id,
        runId: 'attachment-run',
        messages: [
          { id: 'attachment-user', role: 'user', content: 'zqxv-no-kb-attachment-935617' },
        ],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {
          conversationId: created.body.id,
          modelSelection: { providerId: 'run-selected', modelId: 'chat-model' },
          attachments: [{ id: attachment.id, sha256: attachment.sha256 }],
        },
      }),
    })
    expect(send.status).toBe(200)
    expect(await send.text()).toContain('本地模型回答')
    expect(JSON.stringify(upstreamRequests.at(-1))).toContain('仅本轮临时附件正文')
    const reloaded = await client.get<{
      messages: { id: string; attachments?: ChatAttachment[]; modelSelection?: unknown }[]
    }>(`/api/conversations/${created.body.id}`)
    expect(reloaded.body.messages[0]?.attachments?.[0]?.id).toBe(attachment.id)
    expect(reloaded.body.messages[0]?.modelSelection).toEqual({
      providerId: 'run-selected',
      modelId: 'chat-model',
    })
    const originalSaved = await saveMessageAsNote(reloaded.body.messages.at(-1)!.id)
    const [originalNote] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, originalSaved!.noteId))
    expect(originalNote?.body).toContain('local-report.txt')
    expect(reloaded.body.messages.at(-1)?.attachments).toBeUndefined()
    const branch = await app.request('/api/chat', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId: created.body.id,
        runId: 'attachment-free-branch',
        messages: [{ id: 'new-branch-user', role: 'user', content: '模型路由验证' }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {
          conversationId: created.body.id,
          documentId,
          historyMessageIds: [],
          modelSelection: { providerId: 'run-selected', modelId: 'chat-model' },
        },
      }),
    })
    expect(branch.status).toBe(200)
    expect(await branch.text()).toContain('本地模型回答')
    expect(JSON.stringify(upstreamRequests.at(-1))).not.toContain('仅本轮临时附件正文')
    const branched = await client.get<{ messages: { id: string }[] }>(
      `/api/conversations/${created.body.id}`,
    )
    const branchSaved = await saveMessageAsNote(branched.body.messages.at(-1)!.id)
    const [branchNote] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, branchSaved!.noteId))
    expect(branchNote?.body).not.toContain('local-report.txt')
    expect(branchNote?.body).not.toContain('会话附件')
  })
  it('unknown context capacity rejects attachment before message/attachment binding', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    const form = new FormData()
    form.append('file', new File(['草稿仍须可移除'], 'unbound.txt', { type: 'text/plain' }))
    form.append('uploadOperationId', 'unknown-window-upload')
    const upload = await app.request(`/api/conversations/${created.body.id}/attachments`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    const attachment = (await upload.json()) as ChatAttachment
    const send = await app.request('/api/chat', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId: created.body.id,
        runId: 'window-run',
        messages: [{ id: 'window-user', role: 'user', content: '附件容量验证' }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {
          conversationId: created.body.id,
          modelSelection: { providerId: 'run-selected', modelId: 'reasoner' },
          attachments: [{ id: attachment.id, sha256: attachment.sha256 }],
        },
      }),
    })
    expect(send.status).toBe(422)
    expect(await send.text()).toContain('上下文容量')
    const reloaded = await client.get<{ messages: unknown[] }>(
      `/api/conversations/${created.body.id}`,
    )
    expect(reloaded.body.messages).toHaveLength(0)
    const state = await client.get<ChatAttachment>(
      `/api/conversations/${created.body.id}/attachments/${attachment.id}`,
    )
    expect(state.body.bound).toBe(false)
  })
  it('selected branch prefix excludes abandoned tails and maps live IDs to canonical messages', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    const send = async (id: string, question: string, historyMessageIds: string[]) =>
      app.request('/api/chat', {
        method: 'POST',
        headers: { Cookie: cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: created.body.id,
          runId: `branch-${id}`,
          messages: [{ id, role: 'user', content: question }],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {
            conversationId: created.body.id,
            documentId,
            historyMessageIds,
            modelSelection: { providerId: 'run-selected', modelId: 'chat-model' },
          },
        }),
      })
    const first = await send('branch-u1', '模型路由验证 前缀保留', [])
    expect(first.status).toBe(200)
    const firstFrames = await first.text()
    let stored = await client.get<{ messages: { id: string; role: string }[] }>(
      `/api/conversations/${created.body.id}`,
    )
    const prefix = stored.body.messages.map((message) => message.id)
    const mappings = firstFrames
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.replace(/^data:\s*/, '')))
      .filter((event) => event.name === 'mimir.message')
      .map((event) => event.value)
    expect(mappings).toContainEqual({
      messageId: prefix[0],
      clientMessageId: 'branch-u1',
      role: 'user',
    })
    expect(mappings.some((item) => item.messageId === prefix[1] && item.role === 'assistant')).toBe(
      true,
    )
    const abandoned = await send('branch-u2', '模型路由验证 不应泄漏的旧尾', prefix)
    await abandoned.text()
    const edited = await send('branch-u3', '模型路由验证 编辑后的问题', prefix)
    expect(edited.status).toBe(200)
    await edited.text()
    expect(JSON.stringify(upstreamRequests.at(-1))).toContain('前缀保留')
    expect(JSON.stringify(upstreamRequests.at(-1))).not.toContain('不应泄漏的旧尾')
    stored = await client.get<{ messages: { id: string; role: string }[] }>(
      `/api/conversations/${created.body.id}`,
    )
    const editedIds = stored.body.messages.slice(-2).map((message) => message.id)
    const continuation = await send('branch-u4', '模型路由验证 分支继续', [...prefix, ...editedIds])
    expect(continuation.status).toBe(200)
    await continuation.text()
    expect(JSON.stringify(upstreamRequests.at(-1))).toContain('编辑后的问题')
    expect(JSON.stringify(upstreamRequests.at(-1))).not.toContain('不应泄漏的旧尾')
    const count = upstreamRequests.length
    const reversed = await send('branch-invalid', '模型路由验证', prefix.toReversed())
    expect(reversed.status).toBe(409)
    const forged = await send('branch-forged', '模型路由验证', ['foreign-message-id'])
    expect(forged.status).toBe(409)
    expect(upstreamRequests).toHaveLength(count)
  })
})
