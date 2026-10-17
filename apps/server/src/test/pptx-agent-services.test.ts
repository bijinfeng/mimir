import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import type { callChat } from '../services/model.js'
import type { fetchDocxImage } from '../services/docx-image-fetch.js'
import type { generateDocxImage } from '../services/docx-image-generation.js'
import type { analyzeDocxMedia } from '../services/docx-media-analysis.js'
import {
  openPptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'

const state = vi.hoisted(() => ({
  model: vi.fn<typeof callChat>(),
  files: new Map<string, Uint8Array>(),
  fetch: vi.fn<typeof fetchDocxImage>(),
  generate: vi.fn<typeof generateDocxImage>(),
  analyze: vi.fn<typeof analyzeDocxMedia>(),
}))
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    fileExtension: 'pptx',
  }),
}))
vi.mock('../services/model.js', () => ({ modelReady: async () => true, callChat: state.model }))
vi.mock('../plugins/host.js', () => ({
  activeStorage: () => ({
    read: async (key: string) => {
      const v = state.files.get(key)
      if (!v) throw new Error('missing')
      return v
    },
    write: async (key: string, value: string) =>
      state.files.set(key, new TextEncoder().encode(value)),
    list: async (prefix: string) => [...state.files.keys()].filter((key) => key.startsWith(prefix)),
  }),
}))
vi.mock('../services/docx-brave-search.js', () => ({
  braveImageSearch: async () => ({ results: [] }),
}))
vi.mock('../services/docx-image-fetch.js', () => ({ fetchDocxImage: state.fetch }))
vi.mock('../services/docx-image-generation.js', () => ({ generateDocxImage: state.generate }))
vi.mock('../services/docx-media-analysis.js', () => ({ analyzeDocxMedia: state.analyze }))
import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'

const load = () =>
  new Uint8Array(
    readFileSync(
      new URL('../../../../packages/office/tests/fixtures/title-layout.pptx', import.meta.url),
    ),
  )
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII='
const page = (text: string) =>
  JSON.stringify({
    background: '#FFFFFF',
    elements: [
      { kind: 'textbox', x: 0.1, y: 0.1, w: 0.8, h: 0.2, text, fontSize: 30, color: '#202124' },
    ],
    notes: '中文讲稿',
    images: [],
  })
const request = (
  action:
    | 'generate_deck'
    | 'regenerate_slide'
    | 'plan_deck'
    | 'save_style_template'
    | 'list_style_templates'
    | 'insert_web_image'
    | 'replace_image'
    | 'generate_image',
  input: unknown,
  bytes: Uint8Array = load(),
  expectedVersion = 0,
) => applyPptxOpsOnHost({ documentId: 'pptx-1', bytes, expectedVersion, action, ops: [input] })

describe('PPTX generation and external image services', () => {
  it('plans without mutating bytes and persists reusable style templates', async () => {
    const bytes = load()
    const plan = {
      core_hook: '中文主题',
      style: '蓝色配色',
      pages: [{ title: '标题', brief: '真实正文', layout: 'two_column', image_queries: [] }],
    }
    const result = await request('plan_deck', plan, bytes)
    expect(result).toMatchObject({ changed: false, version: 0, data: plan })
    expect(result.bytes).toBe(bytes)
    await request('save_style_template', {
      name: '../科技蓝',
      topic: plan.core_hook,
      style: plan.style,
    })
    expect(
      [...state.files.keys()].every((key) => /^templates\/pptx\/[a-f0-9]{64}\.json$/.test(key)),
    ).toBe(true)
    const listed = await request('list_style_templates', {})
    expect(listed.data).toMatchObject({ templates: [{ name: '../科技蓝', topic: '中文主题' }] })
  })
  it('appends two native pages, redesigns one, and independently reads both saves without changing prior slides or theme', async () => {
    state.model
      .mockReset()
      .mockResolvedValueOnce(page('生成第一页'))
      .mockResolvedValueOnce(page('生成第二页'))
      .mockResolvedValueOnce(page('重新设计中文'))
    const original = load(),
      before = await openPptx(original),
      count = before.deck.slides.length
    const plan = ['第一页', '第二页'].map((title) => ({
      title,
      brief: '提供的真实中文内容',
      layout: 'two_column',
      image_queries: [],
    }))
    const first = await request(
      'generate_deck',
      { pages: plan, style: '蓝白简洁', insert_mode: 'append' },
      original,
    )
    expect(first).toMatchObject({ changed: true, version: 1, data: { pages: 2 } })
    const opened = await openPptx(first.bytes)
    expect(opened.deck.slides).toHaveLength(count + 2)
    expect(
      opened.deck.slides[count]!.elements.some((el) =>
        el.anchor.originalXml.includes('生成第一页'),
      ),
    ).toBe(true)
    const second = await request(
      'regenerate_slide',
      { slideIndex: count, title: '重设计', brief: '保留材料重新设计', image_urls: [] },
      first.bytes,
      1,
    )
    const reopened = await openPptx(second.bytes)
    expect(reopened.deck.slides).toHaveLength(count + 2)
    expect(
      reopened.deck.slides[count]!.elements.some((el) =>
        el.anchor.originalXml.includes('重新设计中文'),
      ),
    ).toBe(true)
    expect(
      reopened.deck.slides[count + 1]!.elements.some((el) =>
        el.anchor.originalXml.includes('生成第二页'),
      ),
    ).toBe(true)
    const oldZip = await JSZip.loadAsync(original),
      newZip = await JSZip.loadAsync(second.bytes)
    for (const path of ['ppt/slides/slide1.xml', 'ppt/theme/theme1.xml'])
      expect(await newZip.file(path)!.async('uint8array')).toEqual(
        await oldZip.file(path)!.async('uint8array'),
      )
    const xml = await newZip.file(reopened.deck.slides[count]!.path)!.async('string')
    expect(xml).toContain('sz="3000"')
    expect(xml).toContain('重新设计中文')
  })
  it('requires provenance and complete page count, rejects hallucinated image URLs, and honors cancellation', async () => {
    const base = { pages: [{ title: '数据', brief: '增长20%', layout: 'data', image_queries: [] }] }
    await expect(request('generate_deck', base)).rejects.toThrow('dataSource')
    state.model.mockReset().mockResolvedValue(
      JSON.stringify({
        core_hook: '主题',
        style: '风格',
        pages: [{ title: '只有一页', brief: '正文', layout: 'two_column', image_queries: [] }],
      }),
    )
    await expect(request('generate_deck', { topic: '两页主题', approx_pages: 2 })).rejects.toThrow(
      '页数不完整',
    )
    state.model.mockResolvedValue(
      JSON.stringify({
        background: '#FFFFFF',
        elements: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 }],
        images: [{ url: 'https://unprovided.example/image.png', x: 0, y: 0, w: 1, h: 1 }],
      }),
    )
    await expect(request('regenerate_slide', { slideIndex: 0, brief: '主题' })).rejects.toThrow(
      '未提供的图片',
    )
    const signal = AbortSignal.abort()
    await expect(
      applyPptxOpsOnHost({
        documentId: 'pptx-1',
        bytes: load(),
        expectedVersion: 0,
        action: 'generate_deck',
        ops: [base],
        signal,
      }),
    ).rejects.toThrow('取消')
  })
  it('uses bounded generated references and inserts and replaces images in place across two saves', async () => {
    state.generate.mockResolvedValue({ dataUrl: png, mimeType: 'image/png' })
    const image = await request('generate_image', { prompt: '蓝色图形' })
    const url = (image.data as { url: string }).url
    expect(url).toMatch(/^mimir-generated:\/\//)
    const first = await request('insert_web_image', {
      slideIndex: 0,
      url,
      x: 20,
      y: 40,
      w: 240,
      h: 120,
    })
    const reopened = await openPptx(first.bytes)
    const picture = reopened.deck.slides[0]!.elements.find((el) => el.type === 'picture')!
    const id = elementDurableId(picture)!
    expect(picture.transform.offset).toMatchObject({
      x: 20 * 9525,
      y: 40 * 9525,
      cx: 240 * 9525,
      cy: 120 * 9525,
    })
    expect(picture).toMatchObject({ type: 'picture', srcRect: { t: 0.25, b: 0.25 } })
    const second = await request(
      'replace_image',
      { slideIndex: 0, sourceId: id, url, keepCrop: true },
      first.bytes,
      1,
    )
    const after = (await openPptx(second.bytes)).deck.slides[0]!.elements.find(
      (el) => el.type === 'picture',
    )!
    expect(elementDurableId(after)).toBe(id)
    expect(after.transform).toEqual(picture.transform)
    expect((await JSZip.loadAsync(second.bytes)).file('ppt/media/image1.png')).not.toBeNull()
  })
})

it('resolves only original request attachments and preserves their exact PNG bytes in native insert/replace', async () => {
  const imageBytes = new Uint8Array(Buffer.from(png.split(',')[1]!, 'base64'))
  const original = load(),
    attachment = { name: '原图 中文.png', mimeType: 'image/png', bytes: imageBytes }
  const url = 'attachment://原图 中文.png'
  const apply = (
    action: 'insert_web_image' | 'replace_image',
    input: unknown,
    bytes: Uint8Array = original,
    attachments = [attachment],
    expectedVersion = 0,
  ) =>
    applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion,
      action,
      ops: [input],
      attachments,
    })
  const first = await apply('insert_web_image', {
    slideIndex: 0,
    url,
    x: 20,
    y: 40,
    w: 200,
    h: 100,
  })
  const deck = await openPptx(first.bytes),
    picture = deck.deck.slides[0]!.elements.find((el) => el.type === 'picture')!
  const target = elementDurableId(picture)!
  const second = await apply(
    'replace_image',
    { slideIndex: 0, sourceId: target, url, keepCrop: true },
    first.bytes,
    [attachment],
    1,
  )
  const reopened = await openPptx(second.bytes),
    after = reopened.deck.slides[0]!.elements.find((el) => el.type === 'picture')!
  expect(elementDurableId(after)).toBe(target)
  expect(after.transform).toEqual(picture.transform)
  const zip = await JSZip.loadAsync(second.bytes)
  const media = await Promise.all(
    Object.keys(zip.files)
      .filter((path) => path.startsWith('ppt/media/') && !zip.files[path]!.dir)
      .map((path) => zip.files[path]!.async('uint8array')),
  )
  expect(media).toContainEqual(imageBytes)
  await expect(
    apply('insert_web_image', { slideIndex: 0, url, x: 0, y: 0, w: 100, h: 100 }, original, []),
  ).rejects.toThrow('重新选择')
  await expect(
    apply('insert_web_image', { slideIndex: 0, url, x: 0, y: 0, w: 100, h: 100 }, original, [
      attachment,
      attachment,
    ]),
  ).rejects.toThrow('歧义')
  await expect(
    apply('insert_web_image', {
      slideIndex: 0,
      url: 'attachment://../secret.png',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    }),
  ).rejects.toThrow('不得包含路径')
})

it('passes PPTX reference originals, ratio, transparency and abort to the shared generator without remote fetch', async () => {
  const imageBytes = new Uint8Array(Buffer.from(png.split(',')[1]!, 'base64'))
  state.generate.mockReset().mockResolvedValue({ dataUrl: png, mimeType: 'image/png' })
  state.fetch.mockReset()
  const signal = new AbortController().signal
  const result = await applyPptxOpsOnHost({
    documentId: 'pptx-1',
    bytes: load(),
    expectedVersion: 0,
    action: 'generate_image',
    ops: [
      {
        prompt: '保留主体',
        aspectRatio: '16:9',
        referenceImageUrls: ['attachment://logo.png'],
        transparentBackground: true,
      },
    ],
    attachments: [{ name: 'logo.png', mimeType: 'image/png', bytes: imageBytes }],
    signal,
  })
  expect(result.changed).toBe(false)
  expect(state.fetch).not.toHaveBeenCalled()
  expect(state.generate).toHaveBeenCalledWith('保留主体', 'pptx-1', {
    signal,
    aspectRatio: '16:9',
    referenceImages: [{ dataUrl: png, mimeType: 'image/png' }],
    transparentBackground: true,
  })
})
