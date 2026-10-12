import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateDocxImage } from '../services/docx-image-generation.js'

const state = vi.hoisted(() => ({
  model: 'gpt-image-1',
  generate:
    vi.fn<
      (
        options: unknown,
      ) => Promise<{ images: Array<{ b64Json?: string; url?: string }>; usage?: unknown }>
    >(),
  record: vi.fn<(entry: unknown) => Promise<void>>(),
}))

vi.mock('@tanstack/ai', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateImage: state.generate,
}))
vi.mock('@mimir/plugin-provider', () => ({
  docxImageAdapter: async () => ({
    model: state.model,
    baseUrl: 'https://api.openai.com/v1',
    adapter: { model: state.model },
  }),
  docxImageConfiguration: async () => ({ model: state.model }),
}))
vi.mock('../services/ai-service-settings.js', () => ({ migrateAiServiceSettings: async () => [] }))
vi.mock('../plugins/host.js', () => ({ assemble: () => ({ settings: {} }) }))
vi.mock('../services/usage.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  record: state.record,
}))

describe('DOCX image generation', () => {
  beforeEach(() => {
    state.model = 'gpt-image-1'
    state.generate.mockReset()
    state.record.mockReset()
  })

  it('asks DALL-E for base64 rather than a temporary provider URL', async () => {
    state.model = 'dall-e-3'
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')
    state.generate.mockResolvedValue({ images: [{ b64Json: png }] })
    await generateDocxImage('diagram', 'doc-1')
    expect(state.generate).toHaveBeenCalledWith(
      expect.objectContaining({ modelOptions: { response_format: 'b64_json' } }),
    )
  })

  it('uses TanStack image activity, validates bytes, and records usage', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString('base64')
    state.generate.mockResolvedValue({
      images: [{ b64Json: png }],
      usage: { inputTokens: 5, outputTokens: 8, totalTokens: 13 },
    })
    const result = await generateDocxImage('diagram', 'doc-1')
    expect(result).toEqual({ dataUrl: `data:image/png;base64,${png}`, mimeType: 'image/png' })
    expect(state.generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'diagram', numberOfImages: 1 }),
    )
    expect(state.record).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'image', model: 'gpt-image-1', refId: 'doc-1', ok: true }),
    )
  })

  it('rejects missing or unsafe provider image output', async () => {
    state.generate.mockResolvedValueOnce({ images: [{ url: 'https://localhost/private.png' }] })
    await expect(generateDocxImage('diagram', 'doc-1')).rejects.toThrow('未返回可安全插入')
    state.generate.mockResolvedValueOnce({
      images: [{ b64Json: Buffer.from('not-image').toString('base64') }],
    })
    await expect(generateDocxImage('diagram', 'doc-1')).rejects.toThrow('不支持的图片格式')
    expect(state.record).toHaveBeenCalledTimes(2)
    expect(state.record).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }))
  })
})
