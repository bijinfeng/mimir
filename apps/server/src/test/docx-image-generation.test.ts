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
  it('maps PDF aspect requests to actual provider sizes and forwards cancellation without changing defaults', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')
    state.generate.mockResolvedValue({ images: [{ b64Json: png }] })
    const signal = new AbortController().signal
    await generateDocxImage('diagram', 'pdf-1', { aspectRatio: '16:9', signal })
    expect(state.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ size: '1536x1024', abortSignal: signal }),
    )
    state.model = 'dall-e-3'
    await generateDocxImage('diagram', 'pdf-1', { aspectRatio: '9:16' })
    expect(state.generate).toHaveBeenLastCalledWith(expect.objectContaining({ size: '1024x1792' }))
    state.model = 'dall-e-2'
    const count = state.generate.mock.calls.length
    await expect(generateDocxImage('diagram', 'pdf-1', { aspectRatio: '4:3' })).rejects.toThrow(
      '仅支持正方形',
    )
    expect(state.generate).toHaveBeenCalledTimes(count)
    await generateDocxImage('diagram', 'docx-1')
    expect(state.generate.mock.calls.at(-1)![0]).not.toHaveProperty('size')
    const canceled = new AbortController()
    canceled.abort()
    await expect(
      generateDocxImage('diagram', 'pdf-1', { signal: canceled.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('Agent image options', () => {
  it('edits original image parts and requires actual transparent pixels from GPT Image', async () => {
    const { PNG } = await import('pngjs')
    const pixel = new PNG({ width: 2, height: 1 })
    pixel.data.set([255, 0, 0, 255, 0, 0, 0, 0])
    const bytes = PNG.sync.write(pixel),
      b64 = bytes.toString('base64')
    state.model = 'gpt-image-1'
    state.generate.mockReset().mockResolvedValue({ images: [{ b64Json: b64 }] })
    const signal = new AbortController().signal
    const reference = { dataUrl: `data:image/png;base64,${b64}`, mimeType: 'image/png' }
    const output = await generateDocxImage('保留主体，去除背景', 'pptx-1', {
      referenceImages: [reference],
      transparentBackground: true,
      aspectRatio: '1:1',
      signal,
    })
    expect(state.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: [
          { type: 'text', content: '保留主体，去除背景' },
          { type: 'image', source: { type: 'data', value: b64, mimeType: 'image/png' } },
        ],
        modelOptions: { background: 'transparent', output_format: 'png' },
        size: '1024x1024',
        abortSignal: signal,
      }),
    )
    const decoded = PNG.sync.read(Buffer.from(output.dataUrl.split(',')[1]!, 'base64'))
    expect(decoded.width).toBe(2)
    expect(decoded.data[7]).toBe(0)
    pixel.data[7] = 255
    state.generate.mockResolvedValue({
      images: [{ b64Json: PNG.sync.write(pixel).toString('base64') }],
    })
    await expect(
      generateDocxImage('透明', 'pptx-1', { transparentBackground: true }),
    ).rejects.toThrow('不透明')
    state.model = 'dall-e-3'
    const calls = state.generate.mock.calls.length
    await expect(
      generateDocxImage('编辑', 'pptx-1', { referenceImages: [reference] }),
    ).rejects.toThrow('GPT Image')
    await expect(
      generateDocxImage('透明', 'pptx-1', { transparentBackground: true }),
    ).rejects.toThrow('GPT Image')
    expect(state.generate).toHaveBeenCalledTimes(calls)
  })
  it('rejects illegal ratios and late cancellation before publishing image output', async () => {
    state.model = 'gpt-image-1'
    state.generate.mockReset()
    await expect(
      generateDocxImage('image', 'doc', { aspectRatio: '5:7' as '1:1' }),
    ).rejects.toThrow(/Invalid option/)
    expect(state.generate).not.toHaveBeenCalled()
    const cancel = new AbortController()
    state.generate.mockImplementationOnce(async () => {
      cancel.abort()
      return {
        images: [{ b64Json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }],
      }
    })
    await expect(
      generateDocxImage('image', 'doc', { signal: cancel.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
