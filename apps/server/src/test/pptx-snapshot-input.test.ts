import { chatParamsFromRequestBody } from '@tanstack/ai'
import { beforeEach, expect, it, vi } from 'vitest'
import { createConversation, getConversation } from '../services/conversations.js'
import { streamDocxAgent } from '../services/docx-agent-stream.js'
import { streamChat } from '../services/assistant-stream.js'
import { documentAgentCapabilities } from '../services/document-agent-capabilities.js'
import { validatePptxSnapshots } from '../services/pptx-snapshot-input.js'

const state = vi.hoisted(() => ({
  vision: true,
  stream: vi.fn<(...args: unknown[]) => Promise<AsyncIterable<unknown>>>(),
}))
vi.mock('../services/model.js', async (original) => ({
  ...(await original<object>()),
  modelReady: async () => true,
  streamChat: state.stream,
}))
vi.mock('../services/docx-media-analysis.js', async (original) => ({
  ...(await original<object>()),
  docxMediaReadiness: async () => ({ vision: state.vision, audio: false }),
}))
vi.mock('../services/documents.js', async (original) => ({
  ...(await original<object>()),
  getDocument: async (id: string) => ({
    id,
    title: '截图测试',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }),
}))
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b9sAAAAASUVORK5CYII='
const image = (value = PNG) => ({
  type: 'image',
  source: { type: 'data', mimeType: 'image/png', value },
})
const content = (value = PNG) => [{ type: 'text', text: '美化本页' }, image(value)]
function request(conversationId: string) {
  return {
    threadId: conversationId,
    runId: crypto.randomUUID(),
    tools: [],
    context: [],
    messages: [{ id: 'u1', role: 'user', content: content() }],
    forwardedProps: {
      runConfig: {
        documentAgent: true,
        agentFormat: 'pptx',
        documentId: 'pptx-1',
        conversationId,
        agentRoundId: 'round-1',
        agentVersion: 7,
        agentContext: { slides: [{ id: 's_4' }], selection: { slideIndex: 0 } },
      },
    },
  }
}
beforeEach(() => {
  state.vision = true
  state.stream.mockReset().mockImplementation(async () => (async function* () {})())
})
it('validates actual PNG containers and limits each turn/history before decoding oversized strings', () => {
  expect(validatePptxSnapshots([{ role: 'user', content: content() }])).toBe(1)
  expect(validatePptxSnapshots([{ role: 'user', content: '普通文字' }])).toBe(0)
  expect(() => validatePptxSnapshots([{ role: 'user', content: content('aGVsbG8=') }])).toThrow(
    '图片内容',
  )
  expect(() => validatePptxSnapshots([{ role: 'user', content: [image(), image()] }])).toThrow(
    '每轮只能',
  )
  expect(() =>
    validatePptxSnapshots(Array.from({ length: 5 }, () => ({ role: 'user', content: content() }))),
  ).toThrow('4 页')
  expect(() =>
    validatePptxSnapshots([{ role: 'user', content: content('A'.repeat(6_990_512)) }]),
  ).toThrow('5 MiB')
  expect(() =>
    validatePptxSnapshots([
      {
        role: 'user',
        content: [{ type: 'image', source: { type: 'url', value: 'https://example.com/x.png' } }],
      },
    ]),
  ).toThrow('内嵌 PNG')
})
it('passes the PNG bytes through to the configured vision model and reports the same capability', async () => {
  const conversation = await createConversation()
  const input = request(conversation.id)
  const response = await streamDocxAgent(await chatParamsFromRequestBody(input))
  expect(response.status).toBe(200)
  const modelInput = state.stream.mock.calls[0]![0] as { messages: unknown }
  expect(modelInput.messages).toEqual(input.messages)
  // Video uses extracted visual frames; audio still requires the separate transcription service.
  expect((await documentAgentCapabilities('pptx-1'))?.mediaKinds).toEqual(['image', 'video'])
  await response.text()
})
it('rejects disabled vision before persisting the question or calling the model; ordinary text is unchanged', async () => {
  state.vision = false
  const conversation = await createConversation()
  const input = request(conversation.id)
  const response = await streamDocxAgent(await chatParamsFromRequestBody(input))
  expect(response.status).toBe(422)
  expect(await response.text()).toContain('VISION_NOT_READY')
  expect(state.stream).not.toHaveBeenCalled()
  expect((await getConversation(conversation.id))?.messages).toHaveLength(0)
  expect(await documentAgentCapabilities('pptx-1')).toMatchObject({ mediaKinds: [] })
  const plain = { ...input, messages: [{ id: 'u1', role: 'user', content: '美化本页' }] }
  const textResponse = await streamDocxAgent(await chatParamsFromRequestBody(plain))
  expect(textResponse.status).toBe(200)
  await textResponse.text()
})
it('rejects malformed PNG input and refuses an image-containing retrieval fallback without persistence', async () => {
  const conversation = await createConversation()
  const input = request(conversation.id)
  input.messages[0]!.content = content('aGVsbG8=')
  const bad = await streamDocxAgent(await chatParamsFromRequestBody(input))
  expect(bad.status).toBe(400)
  expect(await bad.text()).toContain('PPTX_SNAPSHOT_INVALID')
  const rag = await streamChat({
    ...request(conversation.id),
    forwardedProps: { conversationId: conversation.id },
  })
  expect(rag.status).toBe(422)
  expect(await rag.text()).toContain('IMAGE_AGENT_REQUIRED')
  expect(state.stream).not.toHaveBeenCalled()
  expect((await getConversation(conversation.id))?.messages).toHaveLength(0)
})
