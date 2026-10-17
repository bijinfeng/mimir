import { randomUUID } from 'node:crypto'
import { PDFDocument, PDFName } from 'pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pdfAssetOperationSchema } from '@mimir/shared'
import {
  PdfAssetRegistry,
  pdfAssetReadiness,
  preparePdfAsset,
  pdfAssetRegistry,
} from '../services/pdf-external-assets.js'
import { encodePdfPng } from '../services/pdf-image-codec.js'
import { applyPdfImageOperation } from '../services/pdf-images.js'
import { braveImageSearch, braveSearchReady } from '../services/docx-brave-search.js'
import { docxImageReady, generateDocxImage } from '../services/docx-image-generation.js'
vi.mock('../services/docx-brave-search.js', () => ({
  braveImageSearch: vi.fn<typeof braveImageSearch>(),
  braveSearchReady: vi.fn<typeof braveSearchReady>(),
}))
vi.mock('../services/docx-image-generation.js', () => ({
  docxImageReady: vi.fn<typeof docxImageReady>(),
  generateDocxImage: vi.fn<typeof generateDocxImage>(),
}))
const scope = () => ({ principal: 'user-a', documentId: 'pdf-a', assetSessionId: randomUUID() })
const png = () =>
  encodePdfPng({
    width: 4,
    height: 2,
    data: new Uint8ClampedArray(Array.from({ length: 8 }, () => [20, 70, 220, 255]).flat()),
  })
beforeEach(() => {
  vi.resetAllMocks()
})
describe('PDF external preparation', () => {
  it('validates upstream snake-case arguments without coercion or extras', () => {
    expect(pdfAssetOperationSchema.parse({ op: 'image_search', query: ' flowers ' })).toEqual({
      op: 'image_search',
      query: 'flowers',
      max_results: 8,
    })
    for (const value of [
      { op: 'image_search', query: 'x', maxResults: 2 },
      { op: 'image_search', query: 'x', max_results: 1.5 },
      { op: 'image_search', query: 'x', max_results: 11 },
      { op: 'generate_image', prompt: 'x', aspect_ratio: '5:2' },
    ])
      expect(pdfAssetOperationSchema.safeParse(value).success).toBe(false)
  })
  it('reports independent real readiness and maps the bounded Brave count and signal', async () => {
    vi.mocked(braveSearchReady).mockResolvedValue(true)
    vi.mocked(docxImageReady).mockResolvedValue(false)
    expect(await pdfAssetReadiness()).toMatchObject({
      image_search: { available: true },
      generate_image: { available: false, reason: expect.stringContaining('设置') },
    })
    vi.mocked(braveImageSearch).mockResolvedValue({
      results: Array.from({ length: 5 }, (_, index) => ({
        title: String(index),
        url: 'https://example.com',
        description: '',
        imageUrl: 'https://example.com/a.png',
      })),
    })
    const signal = new AbortController().signal
    const result = await preparePdfAsset(
      scope(),
      { op: 'image_search', query: 'flowers', max_results: 2 },
      signal,
    )
    expect(braveImageSearch).toHaveBeenCalledWith({ query: 'flowers', maxResults: 2 }, signal)
    expect(result).toHaveProperty('results.length', 2)
  })
  it('returns only scoped metadata, real dimensions and requested ratio, validates before registering', async () => {
    const owner = scope()
    vi.mocked(generateDocxImage).mockResolvedValue({
      dataUrl: `data:image/png;base64,${png().toString('base64')}`,
      mimeType: 'image/png',
    })
    const image = await preparePdfAsset(owner, {
      op: 'generate_image',
      prompt: 'sky',
      aspect_ratio: '16:9',
    })
    expect(image).toMatchObject({
      width: 4,
      height: 2,
      requestedRatio: '16:9',
      actualRatio: 2,
      mimeType: 'image/png',
    })
    expect(JSON.stringify(image)).not.toContain('base64')
    expect(generateDocxImage).toHaveBeenCalledWith('sky', owner.documentId, {
      signal: undefined,
      aspectRatio: '16:9',
    })
    expect(pdfAssetRegistry.resolve(owner, (image as { url: string }).url).bytes).toEqual(
      new Uint8Array(png()),
    )
    vi.mocked(generateDocxImage).mockResolvedValue({
      dataUrl: `data:image/png;base64,${Buffer.from('broken').toString('base64')}`,
      mimeType: 'image/png',
    })
    await expect(
      preparePdfAsset(owner, { op: 'generate_image', prompt: 'sky', aspect_ratio: 'auto' }),
    ).rejects.toThrow('PNG 或 JPEG')
  })
  it('rejects canceled results even when the provider ignores abort', async () => {
    const controller = new AbortController()
    vi.mocked(generateDocxImage).mockImplementation(async (_prompt, _id, options) => {
      expect(options?.signal).toBe(controller.signal)
      controller.abort()
      return { dataUrl: `data:image/png;base64,${png().toString('base64')}`, mimeType: 'image/png' }
    })
    await expect(
      preparePdfAsset(
        scope(),
        { op: 'generate_image', prompt: 'sky', aspect_ratio: 'auto' },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
describe('PDF generated references', () => {
  it('refuses native image read results canceled after inspection has started', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400])
    const bytes = await pdf.save()
    const controller = new AbortController()
    const pending = applyPdfImageOperation(bytes, { op: 'read' }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('binds principal/document/source-session, clones, expires and never resolves arbitrary URLs', () => {
    let now = 1000
    const registry = new PdfAssetRegistry(() => now),
      owner = scope(),
      original = png()
    const image = registry.register(owner, original, '1:1')
    original[0] = 0
    const first = registry.resolve(owner, image.url)
    expect(first.bytes[0]).toBe(137)
    first.bytes[0] = 0
    expect(registry.resolve(owner, image.url).bytes[0]).toBe(137)
    for (const wrong of [
      { ...owner, principal: 'other' },
      { ...owner, documentId: 'other' },
      { ...owner, assetSessionId: randomUUID() },
    ])
      expect(() => registry.resolve(wrong, image.url)).toThrow('当前文档会话')
    for (const bad of [
      'file:///tmp/image.png',
      'http://127.0.0.1/a.png',
      `${image.url}/extra`,
      `mimir-generated://${randomUUID()}`,
    ])
      expect(() => registry.resolve(owner, bad)).toThrow('当前文档会话')
    now = image.expiresAt
    expect(() => registry.resolve(owner, image.url)).toThrow('过期')
  })
  it('enforces per-source and global FIFO limits and rejects unsupported bytes before eviction', () => {
    const registry = new PdfAssetRegistry(),
      owner = scope()
    const first = registry.register(owner, png(), 'auto')
    expect(() => registry.register(owner, new Uint8Array(8 * 1024 * 1024 + 1), 'auto')).toThrow(
      '8MiB',
    )
    expect(registry.resolve(owner, first.url)).toBeDefined()
    for (let i = 0; i < 4; i++) registry.register(owner, png(), 'auto')
    expect(() => registry.resolve(owner, first.url)).toThrow('过期')
    const oldOwner = scope(),
      old = registry.register(oldOwner, png(), 'auto')
    for (let i = 0; i < 8; i++) registry.register(scope(), png(), 'auto')
    expect(() => registry.resolve(oldOwner, old.url)).toThrow('过期')
  })
  it('inserts and replaces real native images while preserving footprint, original text and byte history', async () => {
    const owner = scope(),
      registry = new PdfAssetRegistry(),
      image = registry.register(owner, png(), 'auto')
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 20, y: 350 })
    const original = await pdf.save(),
      before = original.slice()
    const prepared = registry.resolve(owner, image.url)
    // A failed native write does not consume a reusable private ref.
    await expect(
      applyPdfImageOperation(original, {
        op: 'insert_image',
        pageIndex: 99,
        image: Buffer.from(prepared.bytes).toString('base64'),
      }),
    ).rejects.toThrow(/页|范围/)
    const inserted = await applyPdfImageOperation(original, {
      op: 'insert_image',
      pageIndex: 0,
      x: 30,
      y: 80,
      width: 100,
      image: Buffer.from(registry.resolve(owner, image.url).bytes).toString('base64'),
    })
    const target = inserted.images.images[0]!
    expect(target).toMatchObject({ x: 30, y: 80, width: 100, height: 50 })
    const replaced = await applyPdfImageOperation(inserted.bytes!, {
      op: 'replace_image',
      target: target.target,
      image: Buffer.from(prepared.bytes).toString('base64'),
    })
    expect(replaced.images.images[0]).toMatchObject({
      x: 30,
      y: 80,
      width: 100,
      height: 50,
      layer: target.layer,
    })
    const task = getDocument({ data: replaced.bytes!.slice() })
    try {
      const page = await (await task.promise).getPage(1)
      expect(
        (await page.getTextContent()).items.some(
          (item) => 'str' in item && item.str === 'ORIGINAL',
        ),
      ).toBe(true)
      expect((await page.getOperatorList()).fnArray).toContain(OPS.paintImageXObject)
    } finally {
      await task.destroy()
    }
    expect(original).toEqual(before)
    const unsafe = await PDFDocument.load(original)
    unsafe.catalog.set(PDFName.of('Unexpected'), unsafe.context.obj({ Secret: true }))
    await expect(
      applyPdfImageOperation(await unsafe.save(), {
        op: 'insert_image',
        pageIndex: 0,
        image: Buffer.from(prepared.bytes).toString('base64'),
      }),
    ).rejects.toThrow(/结构|Catalog|安全/)
    const canceled = new AbortController()
    canceled.abort()
    await expect(
      applyPdfImageOperation(
        original,
        { op: 'insert_image', pageIndex: 0, image: Buffer.from(prepared.bytes).toString('base64') },
        canceled.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
