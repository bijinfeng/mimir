import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import type { PluginSettings, SecretCodec, ChatModelCatalog } from '@mimir/shared'
import { createOpenAiCompatibleProvider } from './provider.js'
import { describeChatModel } from './chat-models.js'
import type { InternalModelConfig, InternalProvider } from './instances.js'

const secret: SecretCodec = {
  encrypt: (value) => `enc:${value}`,
  decrypt: (value) => ({ ok: true, value: value.slice(4) }),
}
const config: InternalModelConfig = { providers: [], roles: {} }
const settings: PluginSettings = {
  getJson: async <T>() => config as T,
  getNumber: async () => 0,
  getString: async () => '',
  getBoolean: async () => false,
  setJson: async () => undefined,
  getSecret: async () => ({ ok: true, value: '' }),
}
function provider(id: string, baseUrl: string): InternalProvider {
  return {
    id,
    name: `供应商${id}`,
    preset: 'custom',
    family: 'openai-compatible',
    baseUrl,
    apiKey: 'enc:test-only',
    modelsFetchedAt: null,
    models: [
      {
        id: 'same-model',
        source: 'manual',
        purposes: ['chat'],
        capabilities: {
          reasoning: { status: 'supported', levels: ['low', 'high'], default: 'low' },
          reasoningParameter: 'reasoning_effort',
          vision: 'unsupported',
          tools: 'supported',
          contextWindowTokens: 32768,
        },
      },
    ],
  }
}
let url = ''
const requests: Record<string, unknown>[] = []
const server = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  requests.push(JSON.parse(body))
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const common = { id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'same-model' }
  for (const chunk of [
    {
      ...common,
      choices: [
        { index: 0, delta: { role: 'assistant', content: 'local response' }, finish_reason: null },
      ],
    },
    {
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  ])
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  res.end('data: [DONE]\n\n')
})
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/v1`
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('explicit provider/model identity and actual effort capabilities', () => {
  it('groups duplicate names by provider, omits credentials and excludes non-chat models', async () => {
    config.providers = [provider('a', url), provider('b', url)]
    config.providers[0]!.models.push({ id: 'embed', source: 'manual', purposes: ['embed'] })
    config.roles = { chat: { providerId: 'b', model: 'same-model' } }
    const catalog = (await createOpenAiCompatibleProvider(settings, secret)
      .chatCatalog!()) as ChatModelCatalog
    expect(catalog.providers.map((p) => p.providerId)).toEqual(['a', 'b'])
    expect(catalog.providers.map((p) => p.models.map((m) => m.modelId))).toEqual([
      ['same-model'],
      ['same-model'],
    ])
    expect(catalog.defaultSelection).toEqual({
      providerId: 'b',
      modelId: 'same-model',
      reasoningEffort: 'low',
    })
    expect(JSON.stringify(catalog)).not.toMatch(/enc:|test-only|apiKey/)
  })
  it('sends selected compatible model and validated effort to a real local HTTP endpoint', async () => {
    config.providers = [provider('a', url)]
    config.roles = { reasoning: { providerId: 'a', model: 'wrong-role-model' } }
    const selected = await createOpenAiCompatibleProvider(settings, secret).selectedAdapter!({
      providerId: 'a',
      modelId: 'same-model',
      reasoningEffort: 'high',
    })
    const text = await chat({
      adapter: selected.instance,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      modelOptions: selected.modelOptions,
    } as Parameters<typeof chat>[0])
    expect(text).toMatchObject({ text: 'local response' })
    expect(requests.at(-1)).toMatchObject({ model: 'same-model', reasoning_effort: 'high' })
    expect(selected.role).toBe('chat')
  })
  it('omits effort for provider-default and unknown rather than manufacturing an off level', async () => {
    const instance = provider('a', url)
    delete instance.models[0]!.capabilities
    config.providers = [instance]
    const impl = createOpenAiCompatibleProvider(settings, secret)
    expect((await impl.chatCatalog!()).providers[0]?.models[0]?.reasoning).toEqual({
      status: 'unknown',
    })
    const selected = await impl.selectedAdapter!({ providerId: 'a', modelId: 'same-model' })
    expect(selected.modelOptions).toBeUndefined()
    expect(selected.reasoning).toBeUndefined()
    await expect(
      impl.selectedAdapter!({ providerId: 'a', modelId: 'same-model', reasoningEffort: 'off' }),
    ).rejects.toThrow('推理等级已失效')
  })
  it('rejects missing/deleted/non-chat models and invalid effort without sending requests', async () => {
    config.providers = [provider('a', url)]
    const impl = createOpenAiCompatibleProvider(settings, secret)
    const count = requests.length
    await expect(impl.selectedAdapter!({ providerId: 'b', modelId: 'same-model' })).rejects.toThrow(
      '供应商不存在',
    )
    await expect(impl.selectedAdapter!({ providerId: 'a', modelId: 'gone' })).rejects.toThrow(
      '已被删除',
    )
    await expect(
      impl.selectedAdapter!({ providerId: 'a', modelId: 'same-model', reasoningEffort: 'medium' }),
    ).rejects.toThrow('推理等级已失效')
    expect(requests).toHaveLength(count)
  })
  it('native OpenAI reasoning uses official mapping through actual SDK request construction', async () => {
    const nativeRequests: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', async (_input: unknown, init: RequestInit | undefined) => {
      nativeRequests.push(JSON.parse(String(init?.body)))
      const common = {
        id: 'native-local',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-5.2',
      }
      const chunks = [
        {
          ...common,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'native result' },
              finish_reason: null,
            },
          ],
        },
        { ...common, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]
      return new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    try {
      const instance = provider('native', 'https://api.openai.com/v1')
      instance.models = [{ id: 'gpt-5.2', source: 'manual', purposes: ['chat'] }]
      config.providers = [instance]
      const selected = await createOpenAiCompatibleProvider(settings, secret).selectedAdapter!({
        providerId: 'native',
        modelId: 'gpt-5.2',
        reasoningEffort: 'off',
      })
      const result = await chat({
        adapter: selected.instance,
        messages: [{ role: 'user', content: 'ping' }],
        reasoning: selected.reasoning,
        stream: false,
      } as Parameters<typeof chat>[0])
      expect(result).toMatchObject({ text: 'native result' })
      expect(nativeRequests).toHaveLength(1)
      expect(nativeRequests[0]).toMatchObject({ model: 'gpt-5.2', reasoning_effort: 'none' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('native OpenAI metadata does not leak to same-named gateway models', () => {
    const native = provider('native', 'https://api.openai.com/v1')
    const model = { id: 'gpt-5.2', source: 'manual' as const, purposes: ['chat' as const] }
    const metadata = describeChatModel(native, model)
    expect(metadata.reasoning).toEqual({
      status: 'supported',
      levels: ['off', 'low', 'medium', 'high', 'xhigh'],
    })
    expect(metadata.vision).toBe('supported')
    expect(metadata.tools).toBe('supported')
    expect(describeChatModel({ ...native, baseUrl: url }, model)).toMatchObject({
      reasoning: { status: 'unknown' },
      vision: 'unknown',
      tools: 'unknown',
    })
  })
})
