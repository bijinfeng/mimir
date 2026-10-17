import { serve } from '@hono/node-server'
import { randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { encodePdfPng } from '../services/pdf-image-codec.js'
import { generateDocxImage } from '../services/docx-image-generation.js'
import { braveImageSearch } from '../services/docx-brave-search.js'
import type { PdfImageSnapshot, PdfPreparedImage } from '@mimir/shared'
vi.mock('../services/docx-image-generation.js', () => ({
  docxImageReady: async () => true,
  generateDocxImage: vi.fn<typeof generateDocxImage>(),
}))
vi.mock('../services/docx-brave-search.js', () => ({
  braveSearchReady: async () => true,
  braveImageSearch: vi.fn<typeof braveImageSearch>(),
  braveWebSearch: vi.fn<() => Promise<unknown>>(),
}))
let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})
async function fixture() {
  const pdf = await PDFDocument.create()
  pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 30, y: 350 })
  const bytes = await pdf.save(),
    form = new FormData()
  form.set('file', new File([bytes.slice()], 'pdf-assets.doc.pdf', { type: 'application/pdf' }))
  const response = await app.request('/api/documents/files', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })
  expect(response.status).toBe(201)
  const documentId = ((await response.json()) as { document: { id: string } }).document.id
  return { bytes, documentId }
}
const path = '/api/conversations/pdf-agent/assets'
const request = (body: unknown, withCookie = true, suffix = '') =>
  app.request(`${path}${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })
describe('PDF asset authenticated host', () => {
  it('enforces authentication/strict bounded JSON/PDF identity and returns unchanged version without storing', async () => {
    const { documentId, bytes } = await fixture()
    const body = {
      documentId,
      assetSessionId: randomUUID(),
      expectedVersion: 7,
      operation: { op: 'image_search', query: 'sky', max_results: 2 },
    }
    vi.mocked(braveImageSearch).mockResolvedValue({
      results: [
        {
          title: 'Sky',
          url: 'https://example.com',
          imageUrl: 'https://example.com/sky.png',
          description: '',
        },
      ],
    })
    expect((await request(body, false)).status).toBe(401)
    for (const invalid of [
      { ...body, extra: true },
      { ...body, expectedVersion: Number.MAX_SAFE_INTEGER },
      { ...body, assetSessionId: 'bad' },
      { ...body, operation: { op: 'image_search', query: 'sky', maxResults: 2 } },
    ])
      expect((await request(invalid)).status).toBe(400)
    expect((await request({ ...body, documentId: 'missing' })).status).toBe(404)
    expect((await request({ ...body, extra: 'x'.repeat(17000) })).status).toBe(413)
    const response = await request(body)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      version: 7,
      data: { results: [{ title: 'Sky' }] },
    })
    expect(braveImageSearch).toHaveBeenCalledWith(
      { query: 'sky', maxResults: 2 },
      expect.any(AbortSignal),
    )
    expect(
      (await app.request(`${path}?documentId=${documentId}`, { headers: { Cookie: cookie } }))
        .status,
    ).toBe(200)
    const note = await app.request('/api/documents/notes', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'PDF asset format guard', content: '' }),
    })
    expect(note.status).toBe(201)
    expect(
      (await request({ ...body, documentId: ((await note.json()) as { id: string }).id })).status,
    ).toBe(404)
    const stored = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(bytes)
  })
  it('previews privately and resolves generated refs only inside the actual native insert/replace route', async () => {
    const { bytes, documentId } = await fixture(),
      assetSessionId = randomUUID()
    const png = encodePdfPng({
      width: 4,
      height: 2,
      data: new Uint8ClampedArray(Array.from({ length: 8 }, () => [210, 40, 30, 255]).flat()),
    })
    vi.mocked(generateDocxImage).mockResolvedValue({
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      mimeType: 'image/png',
    })
    const response = await request({
      documentId,
      assetSessionId,
      expectedVersion: 4,
      operation: { op: 'generate_image', prompt: 'test fixture', aspect_ratio: '16:9' },
    })
    expect(response.status).toBe(200)
    const prepared = (await response.json()) as { version: number; data: PdfPreparedImage }
    expect(prepared).toMatchObject({
      version: 4,
      data: { width: 4, height: 2, requestedRatio: '16:9' },
    })
    expect(prepared).not.toHaveProperty('bytesBase64')
    const preview = await request(
      { documentId, assetSessionId, url: prepared.data.url },
      true,
      '/preview',
    )
    expect(preview.status).toBe(200)
    expect(preview.headers.get('Cache-Control')).toBe('no-store')
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(new Uint8Array(png))
    expect(
      (
        await request(
          { documentId, assetSessionId: randomUUID(), url: prepared.data.url },
          true,
          '/preview',
        )
      ).status,
    ).toBe(400)
    expect((await app.request(`${path}/preview`, { headers: { Cookie: cookie } })).status).toBe(404)
    const native = async (working: Uint8Array, operation: unknown, session = assetSessionId) => {
      const form = new FormData()
      form.set('file', new File([working.slice()], 'current.pdf', { type: 'application/pdf' }))
      form.set('documentId', documentId)
      form.set('assetSessionId', session)
      form.set('expectedVersion', '4')
      form.set('operation', JSON.stringify(operation))
      return app.request('/api/conversations/pdf-agent/images', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
      })
    }
    const operation = {
      op: 'insert_image',
      pageIndex: 0,
      x: 40,
      y: 60,
      width: 100,
      url: prepared.data.url,
    }
    expect((await native(bytes, operation, randomUUID())).status).toBe(400)
    const inserted = await native(bytes, operation)
    expect(inserted.status).toBe(200)
    const first = (await inserted.json()) as {
      bytesBase64: string
      images: PdfImageSnapshot
      version: number
    }
    expect(first).toMatchObject({
      version: 5,
      images: { images: [{ x: 40, y: 60, width: 100, height: 50 }] },
    })
    const replaced = await native(new Uint8Array(Buffer.from(first.bytesBase64, 'base64')), {
      op: 'replace_image',
      target: first.images.images[0]!.target,
      url: prepared.data.url,
    })
    expect(replaced.status).toBe(200)
    expect((await replaced.json()) as unknown).toMatchObject({
      version: 5,
      images: { images: [{ x: 40, y: 60, width: 100, height: 50 }] },
    })
    const stored = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(bytes)
  })
  it('propagates a real Node HTTP client disconnect to the provider request signal', async () => {
    const { documentId } = await fixture()
    let started!: () => void, observed!: () => void
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const providerAborted = new Promise<void>((resolve) => {
      observed = resolve
    })
    vi.mocked(generateDocxImage).mockImplementationOnce(async (_prompt, _id, options) => {
      const signal = options!.signal!
      started()
      return new Promise((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            observed()
            reject(new Error('provider canceled'))
          },
          { once: true },
        ),
      )
    })
    let ready!: () => void
    const listening = new Promise<void>((resolve) => {
      ready = resolve
    })
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, () => ready())
    await listening
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing local HTTP address')
    const controller = new AbortController()
    try {
      const pending = fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          assetSessionId: randomUUID(),
          expectedVersion: 1,
          operation: { op: 'generate_image', prompt: 'local mock only' },
        }),
        signal: controller.signal,
      })
      const abortedFetch = pending.catch((error: unknown) => error)
      await providerStarted
      controller.abort()
      await providerAborted
      expect(await abortedFetch).toMatchObject({ name: 'AbortError' })
    } finally {
      if ('closeAllConnections' in server) server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
