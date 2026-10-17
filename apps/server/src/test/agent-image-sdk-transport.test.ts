import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'

const config = vi.hoisted(() => ({ model: 'gpt-image-1' }))
vi.mock('../plugins/host.js', () => ({
  assemble: () => ({
    settings: {
      getSecret: async () => ({ ok: true, value: 'fake-local-transport-key' }),
      getString: async (key: string) =>
        key === 'model.image.model' ? config.model : 'https://image-transport.invalid/v1',
    },
  }),
}))
vi.mock('../services/ai-service-settings.js', () => ({ migrateAiServiceSettings: async () => [] }))
vi.mock('../services/usage.js', () => ({
  record: async () => {},
  tokenFields: () => ({ promptTokens: null, completionTokens: null, totalTokens: null }),
}))
import { generateDocxImage } from '../services/docx-image-generation.js'

beforeEach(() => {
  config.model = 'gpt-image-1'
})
afterEach(() => vi.unstubAllGlobals())

it('uses the real provider factory and TanStack SDK image-edit multipart with exact originals and transparent pixels', async () => {
  const pixel = new PNG({ width: 2, height: 1 })
  pixel.data.set([10, 20, 30, 255, 10, 20, 30, 0])
  const original = PNG.sync.write(pixel),
    requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init)
      // OpenAI SDK probes local multipart support using data:, before the API request.
      if (request.url === 'data:,') return new Response('')
      requests.push(request)
      return new Response(
        JSON.stringify({ created: 1, data: [{ b64_json: original.toString('base64') }] }),
        { headers: { 'content-type': 'application/json' } },
      )
    }),
  )
  const signal = new AbortController().signal
  const output = await generateDocxImage('保留原图主体', 'pptx-fixture', {
    referenceImages: [
      { dataUrl: `data:image/png;base64,${original.toString('base64')}`, mimeType: 'image/png' },
    ],
    aspectRatio: '9:16',
    transparentBackground: true,
    signal,
  })
  expect(requests.map((request) => request.url)).toEqual([
    'https://image-transport.invalid/v1/images/edits',
  ])
  expect(requests[0]!.url).toBe('https://image-transport.invalid/v1/images/edits')
  const form = await requests[0]!.formData()
  expect(form.get('model')).toBe('gpt-image-1')
  expect(form.get('size')).toBe('1024x1536')
  expect(form.get('background')).toBe('transparent')
  expect(form.get('output_format')).toBe('png')
  const files = [...form.values()].filter((value): value is File => typeof value !== 'string')
  expect(files).toHaveLength(1)
  expect(Buffer.from(await files[0]!.arrayBuffer())).toEqual(original)
  const decoded = PNG.sync.read(Buffer.from(output.dataUrl.split(',')[1]!, 'base64'))
  expect([decoded.width, decoded.height, decoded.data[7]]).toEqual([2, 1, 0])
})

it('sends defaults and discrete ratio sizes through the real factory, and rejects DALL-E 2 portrait before HTTP', async () => {
  const pixel = new PNG({ width: 1, height: 1 })
  pixel.data.set([30, 40, 50, 255])
  const original = PNG.sync.write(pixel)
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init)
      if (request.url === 'data:,') return new Response('')
      expect(request.url).toBe('https://image-transport.invalid/v1/images/generations')
      bodies.push((await request.json()) as Record<string, unknown>)
      return Response.json({ created: 1, data: [{ b64_json: original.toString('base64') }] })
    }),
  )
  for (const aspectRatio of [undefined, 'auto', '1:1', '4:3', '9:16'] as const) {
    const result = await generateDocxImage('provider size', 'doc', { aspectRatio })
    const decoded = PNG.sync.read(Buffer.from(result.dataUrl.split(',')[1]!, 'base64'))
    // Returned pixels are observed independently; size is a request, not a pixel guarantee.
    expect([decoded.width, decoded.height]).toEqual([1, 1])
  }
  expect(bodies.map((body) => body.size)).toEqual([
    undefined,
    undefined,
    '1024x1024',
    '1536x1024',
    '1024x1536',
  ])
  config.model = 'dall-e-3'
  await generateDocxImage('wide', 'doc', { aspectRatio: '16:9' })
  expect(bodies.at(-1)).toMatchObject({
    model: 'dall-e-3',
    size: '1792x1024',
    response_format: 'b64_json',
  })
  config.model = 'dall-e-2'
  await expect(generateDocxImage('portrait', 'doc', { aspectRatio: '3:4' })).rejects.toThrow(
    '仅支持正方形',
  )
  expect(bodies).toHaveLength(6)
})
