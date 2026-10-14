import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'

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

import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
import {
  openPptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'

const fixture = new URL(
  '../../../../packages/office/tests/fixtures/title-layout.pptx',
  import.meta.url,
)
const load = () => new Uint8Array(readFileSync(fixture))

describe('PPTX host executor', () => {
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
  })
})
