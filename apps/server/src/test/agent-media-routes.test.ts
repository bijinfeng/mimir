import { beforeEach, expect, it, vi } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
const state = vi.hoisted(() => ({
  generate: vi.fn<(prompt: string, documentId: string, options?: unknown) => Promise<unknown>>(),
  analyze: vi.fn<(input: unknown) => Promise<unknown>>(),
  apply:
    vi.fn<
      (input: {
        bytes: Uint8Array
        expectedVersion: number
        attachments?: unknown
      }) => Promise<unknown>
    >(),
}))
vi.mock('../services/documents.js', async (original) => ({
  ...(await original<object>()),
  getDocument: async (id: string) => ({
    id,
    kind: id === 'note' ? 'note' : 'file',
    mime:
      id === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
}))
vi.mock('../services/docx-agent-capabilities.js', () => ({
  docxAgentCapabilities: async () => ({ availableTools: ['generate_image', 'analyze_media'] }),
}))
vi.mock('../services/document-agent-capabilities.js', () => ({
  documentAgentCapabilities: async (id: string) => ({
    format: id === 'note' ? 'markdown' : id === 'pptx' ? 'pptx' : 'docx',
    availableTools: ['generate_image', 'analyze_media'],
  }),
}))
vi.mock('../services/docx-image-generation.js', () => ({
  generateDocxImage: state.generate,
  docxImageReady: async () => true,
}))
vi.mock('../services/docx-media-analysis.js', () => ({
  analyzeDocxMedia: state.analyze,
  DocxMediaInputError: class extends Error {},
  docxMediaReadiness: async () => ({ vision: true, audio: true }),
}))
vi.mock('../services/pptx-agent-host.js', () => ({
  applyPptxOpsOnHost: state.apply,
  applyPptxManualPictureOnHost: vi.fn<() => void>(),
  applyPptxManualUploadOnHost: vi.fn<() => void>(),
}))

beforeEach(() => {
  state.generate
    .mockReset()
    .mockResolvedValue({ dataUrl: 'data:image/png;base64,eA==', mimeType: 'image/png' })
  state.analyze.mockReset().mockResolvedValue({ text: '真实服务接缝结果' })
  state.apply.mockReset().mockImplementation(async (input) => ({
    bytes: input.bytes,
    records: [],
    version: input.expectedVersion,
    changed: false,
  }))
})

it('authenticates and validates DOCX/Markdown image ratios before calling the existing image service', async () => {
  const cookie = await getAuthCookie()
  for (const [format, documentId, ratio] of [
    ['docx', 'doc', '16:9'],
    ['markdown', 'note', '9:16'],
  ]) {
    const body = JSON.stringify({ documentId, prompt: '原图主体', aspectRatio: ratio })
    const path = `/api/conversations/${format}-agent/generate-image`
    expect(
      (
        await app.request(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      ).status,
    ).toBe(401)
    const response = await app.request(path, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body,
    })
    expect(response.status).toBe(200)
    expect(state.generate).toHaveBeenLastCalledWith('原图主体', documentId, {
      aspectRatio: ratio,
      signal: expect.any(AbortSignal),
    })
    const invalid = await app.request(path, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, prompt: '图', aspectRatio: 'bogus' }),
    })
    expect(invalid.status).toBe(400)
  }
  expect(state.generate).toHaveBeenCalledTimes(2)
})

it('keeps original attachments inside their authenticated document/version request and rejects duplicate names', async () => {
  const cookie = await getAuthCookie(),
    original = new Uint8Array([8, 7, 6])
  const form = () => {
    const data = new FormData()
    data.set('file', new File(['pptx'], 'current.pptx'))
    data.set('documentId', 'pptx')
    data.set('expectedVersion', '7')
    data.set('action', 'insert_web_image')
    data.set('ops', '[{"slideIndex":0,"url":"attachment://logo.png","x":0,"y":0,"w":100,"h":100}]')
    data.append('attachment', new File([original], 'logo.png', { type: 'image/png' }))
    return data
  }
  const path = '/api/conversations/pptx-agent/apply-ops'
  expect((await app.request(path, { method: 'POST', body: form() })).status).toBe(401)
  expect(
    (await app.request(path, { method: 'POST', headers: { Cookie: cookie }, body: form() })).status,
  ).toBe(200)
  expect(state.apply).toHaveBeenCalledWith(
    expect.objectContaining({
      documentId: 'pptx',
      expectedVersion: 7,
      attachments: [{ name: 'logo.png', mimeType: 'image/png', bytes: original }],
    }),
  )
  const duplicate = form()
  duplicate.append('attachment', new File(['different'], 'logo.png', { type: 'image/png' }))
  const response = await app.request(path, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: duplicate,
  })
  expect(response.status).toBe(400)
  expect(state.apply).toHaveBeenCalledTimes(1)
})

const send = (input: unknown, headers: Record<string, string>) =>
  app.request('/api/conversations/document-agent/analyze-media', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

it('accepts PPTX original-audio analysis through the common authenticated route and rejects unrelated document formats', async () => {
  const cookie = await getAuthCookie()
  const body = {
    documentId: 'pptx',
    instruction: '总结音轨',
    kind: 'audio',
    media: [{ mimeType: 'audio/wav', data: 'UklGRg==' }],
  }
  expect((await send(body, {})).status).toBe(401)
  expect((await send(body, { Cookie: cookie })).status).toBe(200)
  expect(state.analyze).toHaveBeenCalledWith(
    expect.objectContaining({ ...body, signal: expect.any(AbortSignal) }),
  )
  expect((await send({ ...body, documentId: 'note' }, { Cookie: cookie })).status).toBe(404)
})
