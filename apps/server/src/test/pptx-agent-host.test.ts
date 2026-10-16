import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { pptxManualPictureFieldsSchema, PPTX_IMAGE_MAX_BYTES } from '@mimir/shared'

vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'pptx-1'
      ? {
          id,
          kind: 'file',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          fileExtension: 'pptx',
        }
      : null,
}))

import { applyPptxManualPictureOnHost, applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
import { conversationsRoute } from '../routes/conversations.js'
import {
  openPptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'

const fixture = new URL(
  '../../../../packages/office/tests/fixtures/title-layout.pptx',
  import.meta.url,
)
const load = () => new Uint8Array(readFileSync(fixture))
const imageFixture = new URL(
  '../../../../packages/office/tests/fixtures/image-deck.pptx',
  import.meta.url,
)
async function pngBytes(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(readFileSync(imageFixture))
  return zip.file('ppt/media/image1.png')!.async('uint8array')
}
async function jpegBytes(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/tests/fixtures/upstream/01_standard_business.pptx',
        import.meta.url,
      ),
    ),
  )
  return zip.file('docProps/thumbnail.jpeg')!.async('uint8array')
}
const ONE_PIXEL_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII=',
    'base64',
  ),
)

describe('PPTX host executor', () => {
  it('inserts and replaces a local PNG through the separate manual media path', async () => {
    const imageBytes = await pngBytes()
    const inserted = await applyPptxManualPictureOnHost({
      documentId: 'pptx-1',
      bytes: load(),
      expectedVersion: 0,
      imageBytes,
      slide: 0,
      action: 'insert',
    })
    const first = await JSZip.loadAsync(inserted.bytes)
    const slideXml = await first.file('ppt/slides/slide1.xml')!.async('string')
    expect(slideXml).toContain('<p:pic>')
    expect(first.file('ppt/media/image1.png')).not.toBeNull()
    const opened = await openPptx(inserted.bytes)
    const picture = opened.deck.slides[0]!.elements.find((element) => element.type === 'picture')
    expect(picture?.type).toBe('picture')
    if (!picture) throw new Error('图片未保存')
    const imageView = new DataView(imageBytes.buffer, imageBytes.byteOffset, imageBytes.byteLength)
    const sourceRatio = imageView.getUint32(16) / imageView.getUint32(20)
    const offset = picture.transform.offset
    expect(offset.cx / offset.cy).toBeCloseTo(sourceRatio, 4)
    expect(offset.x).toBeGreaterThanOrEqual(0)
    expect(offset.y).toBeGreaterThanOrEqual(0)

    const replaced = await applyPptxManualPictureOnHost({
      documentId: 'pptx-1',
      bytes: inserted.bytes,
      expectedVersion: 1,
      imageBytes: ONE_PIXEL_PNG,
      slide: 0,
      action: 'replace',
      elementId: elementDurableId(picture)!,
    })
    expect(replaced.version).toBe(2)
    const second = await JSZip.loadAsync(replaced.bytes)
    expect(await second.file('ppt/slides/slide1.xml')!.async('string')).toContain('<p:pic>')
    const replacement = (await openPptx(replaced.bytes)).deck.slides[0]!.elements.find(
      (element) => element.type === 'picture',
    )
    expect(replacement?.type).toBe('picture')
    if (replacement?.type !== 'picture') throw new Error('替换后没有图片')
    expect(await second.file(replacement.mediaRef)?.async('uint8array')).toEqual(ONE_PIXEL_PNG)
  })

  it('rejects invalid local image bytes and stale picture targets without changing input', async () => {
    const bytes = load()
    await expect(
      applyPptxManualPictureOnHost({
        documentId: 'pptx-1',
        bytes,
        expectedVersion: 0,
        imageBytes: new Uint8Array(32),
        slide: 0,
        action: 'insert',
      }),
    ).rejects.toThrow('图片格式或尺寸无效')
    await expect(
      applyPptxManualPictureOnHost({
        documentId: 'pptx-1',
        bytes,
        expectedVersion: 0,
        imageBytes: await pngBytes(),
        slide: 0,
        action: 'replace',
        elementId: 'missing',
      }),
    ).rejects.toThrow('所选图片已失效')
    expect(bytes).toEqual(load())
  })

  it('accepts a real JPEG and stores it with its detected extension', async () => {
    const result = await applyPptxManualPictureOnHost({
      documentId: 'pptx-1',
      bytes: load(),
      expectedVersion: 0,
      imageBytes: await jpegBytes(),
      slide: 0,
      action: 'insert',
    })
    const zip = await JSZip.loadAsync(result.bytes)
    expect(zip.file('ppt/media/image1.jpg')).not.toBeNull()
    expect(
      (await openPptx(result.bytes)).deck.slides[0]!.elements.some(
        (element) => element.type === 'picture',
      ),
    ).toBe(true)
  })

  it('accepts a bounded multipart picture request at the manual route', async () => {
    const form = new FormData()
    form.set('file', new File([new Uint8Array(load())], 'current.pptx'))
    form.set('image', new File([new Uint8Array(await pngBytes())], 'picture.png'))
    form.set('documentId', 'pptx-1')
    form.set('expectedVersion', '0')
    form.set('slide', '0')
    form.set('action', 'insert')
    const response = await conversationsRoute.request('/pptx-agent/manual-picture', {
      method: 'POST',
      body: form,
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { bytesBase64: string; version: number }
    expect(result.version).toBe(1)
    const bytes = new Uint8Array(Buffer.from(result.bytesBase64, 'base64'))
    expect(
      (await openPptx(bytes)).deck.slides[0]!.elements.some(
        (element) => element.type === 'picture',
      ),
    ).toBe(true)
  })

  it('rejects invalid picture metadata and oversized image before a media operation', async () => {
    expect(
      pptxManualPictureFieldsSchema.safeParse({
        documentId: 'pptx-1',
        expectedVersion: 'invalid',
        slide: '0',
        action: 'insert',
      }).success,
    ).toBe(false)
    await expect(
      applyPptxManualPictureOnHost({
        documentId: 'pptx-1',
        bytes: load(),
        expectedVersion: 0,
        imageBytes: new Uint8Array(PPTX_IMAGE_MAX_BYTES + 1),
        slide: 0,
        action: 'insert',
      }),
    ).rejects.toThrow('图片必须是小于 8 MiB')
  })

  it('runs the pinned GenOffice op registry and returns patch-preserving bytes', async () => {
    const bytes = load()
    const opened = await openPptx(bytes)
    const element = opened.deck.slides[0]!.elements.find(
      (item) => item.type === 'shape' || item.type === 'text',
    )!
    const id = elementDurableId(element)!
    const result = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 3,
      ops: [{ op: 'setFill', target: { slide: 0, el: id }, fill: '#1A73E8' }],
    })
    expect(result.version).toBe(4)
    expect(result.records).toHaveLength(1)
    const saved = await JSZip.loadAsync(result.bytes)
    expect(await saved.file('ppt/slides/slide1.xml')?.async('string')).toContain('1A73E8')
    const source = await JSZip.loadAsync(bytes)
    expect(await saved.file('ppt/theme/theme1.xml')?.async('uint8array')).toEqual(
      await source.file('ppt/theme/theme1.xml')?.async('uint8array'),
    )
    expect((await openPptx(result.bytes)).deck.slides).toHaveLength(1)
  })

  it.each([
    {
      label: 'native table',
      op: {
        op: 'addTable',
        target: { slide: 0 },
        rows: 2,
        cols: 2,
        offset: { x: 914400, y: 1371600, cx: 5486400, cy: 1371600 },
      },
      path: 'ppt/slides/slide1.xml',
      marker: '<a:tbl>',
    },
    {
      label: 'native chart',
      op: {
        op: 'addChart',
        target: { slide: 0 },
        kind: 'bar',
        categories: ['A', 'B'],
        series: [{ name: 'S', values: [42, 73] }],
        dataSource: 'user',
        offset: { x: 914400, y: 1371600, cx: 5486400, cy: 2743200 },
      },
      path: 'ppt/slides/slide1.xml',
      marker: '<c:chart',
    },
    {
      label: 'slide background',
      op: { op: 'setBackground', target: { slide: 0 }, kind: 'solid', color: '#123456' },
      path: 'ppt/slides/slide1.xml',
      marker: '123456',
    },
    {
      label: 'speaker notes',
      op: { op: 'setNotes', target: { slide: 0 }, text: 'Presenter note 123' },
      path: 'ppt/notesSlides/notesSlide1.xml',
      marker: 'Presenter note 123',
    },
    {
      label: 'hidden slide',
      op: { op: 'setHidden', target: { slide: 0 }, hidden: true },
      path: 'ppt/slides/slide1.xml',
      marker: 'show="0"',
    },
  ])('writes $label and retains it across a second save', async ({ op, path, marker }) => {
    const first = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes: load(),
      expectedVersion: 0,
      ops: [op],
    })
    expect(first.records).toHaveLength(1)
    const firstZip = await JSZip.loadAsync(first.bytes)
    expect(await firstZip.file(path)?.async('string')).toContain(marker)
    const second = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes: first.bytes,
      expectedVersion: 1,
      ops: [{ op: 'setTransition', target: { slide: 0 }, kind: 'fade' }],
    })
    const secondZip = await JSZip.loadAsync(second.bytes)
    expect(await secondZip.file(path)?.async('string')).toContain(marker)
    expect((await openPptx(second.bytes)).deck.slides).toHaveLength(1)
  })

  it('writes a table cell through the host and preserves its other paragraph and run styles', async () => {
    const inserted = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes: load(),
      expectedVersion: 0,
      ops: [
        {
          op: 'addTable',
          target: { slide: 0 },
          rows: 2,
          cols: 2,
          offset: { x: 914400, y: 1371600, cx: 5486400, cy: 1371600 },
        },
      ],
    })
    const initial = (await openPptx(inserted.bytes)).deck.slides[0]?.elements.find(
      (element) => element.type === 'table',
    )
    if (initial?.type !== 'table') throw new Error('表格插入失败')
    const target = { slide: 0, el: elementDurableId(initial)! }
    const seeded = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes: inserted.bytes,
      expectedVersion: 1,
      ops: [
        {
          op: 'setTableCell',
          target,
          row: 0,
          col: 0,
          paragraphs: [
            {
              runs: [
                { text: 'Key ', bold: true },
                { text: 'Results', color: '#C0392B' },
              ],
            },
            { runs: [{ text: 'Keep ', italic: true }, { text: 'second' }] },
          ],
        },
      ],
    })
    const edited = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes: seeded.bytes,
      expectedVersion: 2,
      ops: [
        {
          op: 'setTableCell',
          target,
          row: 0,
          col: 0,
          paragraphs: [
            {
              srcPara: 0,
              runs: [
                { srcRun: 0, text: 'Key ' },
                { srcRun: 1, text: 'Results' },
              ],
            },
            {
              srcPara: 1,
              runs: [
                { srcRun: 0, text: 'Keep ' },
                { srcRun: 1, text: 'updated' },
              ],
            },
          ],
        },
      ],
    })
    const saved = await JSZip.loadAsync(edited.bytes)
    const source = await JSZip.loadAsync(load())
    expect(await saved.file('ppt/theme/theme1.xml')?.async('uint8array')).toEqual(
      await source.file('ppt/theme/theme1.xml')?.async('uint8array'),
    )
    expect(await saved.file('ppt/slides/slide1.xml')?.async('string')).toContain(
      '<a:t>updated</a:t>',
    )
    const reopened = (await openPptx(edited.bytes)).deck.slides[0]?.elements.find(
      (element) => element.type === 'table',
    )
    if (reopened?.type !== 'table') throw new Error('重开后表格丢失')
    const paragraphs = reopened.rows[0]?.[0]?.text?.paragraphs
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs?.[0]?.runs.map((run) => run.text)).toEqual(['Key ', 'Results'])
    expect(paragraphs?.[1]?.runs.map((run) => run.text)).toEqual(['Keep ', 'updated'])
    expect(paragraphs?.[0]?.runs[0]?.bold).toBe(true)
    expect(paragraphs?.[0]?.runs[1]?.color).toBe('#C0392B')
    expect(paragraphs?.[1]?.runs[0]?.italic).toBe(true)
  })

  it('persists an element animation without rewriting the theme', async () => {
    const bytes = load()
    const opened = await openPptx(bytes)
    const id = elementDurableId(opened.deck.slides[0]!.elements[0]!)!
    const result = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 0,
      ops: [{ op: 'addAnimation', target: { slide: 0, el: id }, effect: 'fade' }],
    })
    const source = await JSZip.loadAsync(bytes)
    const saved = await JSZip.loadAsync(result.bytes)
    expect(await saved.file('ppt/slides/slide1.xml')?.async('string')).toContain('<p:timing>')
    expect(await saved.file('ppt/theme/theme1.xml')?.async('uint8array')).toEqual(
      await source.file('ppt/theme/theme1.xml')?.async('uint8array'),
    )
  })

  it('rejects hidden model operations, wrong documents and corrupt ZIPs before writing', async () => {
    const bytes = load()
    await expect(
      applyPptxOpsOnHost({
        documentId: 'pptx-1',
        bytes,
        expectedVersion: 0,
        ops: [{ op: 'addPicture', target: { slide: 0 }, bytes: 'AAAA' }],
      }),
    ).rejects.toThrow('不对 Agent 开放')
    await expect(
      applyPptxOpsOnHost({
        documentId: 'pptx-1',
        bytes,
        expectedVersion: 0,
        ops: [
          {
            op: 'addChart',
            target: { slide: 0 },
            kind: 'bar',
            categories: ['A'],
            series: [{ name: 'S', values: [42] }],
            offset: { x: 0, y: 0, cx: 1000000, cy: 1000000 },
          },
        ],
      }),
    ).rejects.toThrow('dataSource')
    await expect(
      applyPptxOpsOnHost({
        documentId: 'missing',
        bytes,
        expectedVersion: 0,
        ops: [{ op: 'setFill', target: { slide: 0, el: 'e_1' }, fill: '#FFFFFF' }],
      }),
    ).rejects.toThrow('文档不存在')
    await expect(
      applyPptxOpsOnHost({
        documentId: 'pptx-1',
        bytes: new TextEncoder().encode('not zip'),
        expectedVersion: 0,
        ops: [{ op: 'setFill', target: { slide: 0, el: 'e_1' }, fill: '#FFFFFF' }],
      }),
    ).rejects.toThrow(/./)
    expect(bytes).toEqual(load())
  })
})
