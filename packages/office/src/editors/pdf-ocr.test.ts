import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { mapPdfOcrData, projectPdfOcrPage, recognizePdfOcrPage, searchPdfOcr } from './pdf-ocr.js'
import type { OcrPageData } from './pdf-ocr-worker.js'
const box = (text: string, x: number) => ({
  text,
  confidence: 95,
  bbox: { x0: x, y0: 30, x1: x + 20, y1: 60 },
})
const data: OcrPageData = {
  text: '中文 Office\n第二行',
  confidence: 95,
  blocks: [
    {
      paragraphs: [
        {
          lines: [
            {
              words: [
                { ...box('中', 20), symbols: [box('中', 20)] },
                { ...box('文', 40), symbols: [box('文', 40)] },
                { ...box('Office', 70), symbols: [box('Office', 70)] },
              ],
            },
            { words: [{ ...box('第二行', 20), symbols: [box('第二行', 20)] }] },
          ],
        },
      ],
    },
  ],
}
describe('OCR provenance and actual boxes', () => {
  it('skips an actually blank recognition instead of publishing an empty successful page', async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({}),
      toBlob: (done: BlobCallback) => done(new Blob([new Uint8Array([1])])),
    }
    const terminate = vi.fn<() => void>()
    vi.stubGlobal('document', { createElement: () => canvas })
    try {
      const documentFor = (async () => ({
        getPage: async () => ({
          getTextContent: async () => ({ items: [] }),
          getViewport: () => ({
            width: 100,
            height: 100,
            convertToPdfPoint: (x: number, y: number) => [x, y],
          }),
          render: () => ({ promise: Promise.resolve(), cancel() {} }),
        }),
      })) as unknown as Parameters<typeof recognizePdfOcrPage>[1]
      const result = await recognizePdfOcrPage(
        { bytes: new Uint8Array([1]), index: 0, rotation: 0 },
        documentFor,
        {
          signal: new AbortController().signal,
          baseUrl: '/',
          workerFor: async () => ({
            recognize: async () => ({ text: '', confidence: 0, blocks: [] }),
            terminate,
          }),
        },
      )
      expect(result).toBe(null)
      expect(terminate).toHaveBeenCalledOnce()
      expect(canvas.width).toBe(0)
      expect(canvas.height).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it.each([0, 90, 180, 270])(
    'reprojects canonical OCR through a different Rotate %s viewport without changing source geometry',
    async (rotation) => {
      const pdf = await PDFDocument.create()
      const page = pdf.addPage([500, 700])
      page.setCropBox(40, 80, 400, 600)
      const bytes = await pdf.save()
      const task = getDocument({ data: bytes.slice() })
      try {
        const proxy = await (await task.promise).getPage(1)
        const result = mapPdfOcrData(
          data,
          { bytes, index: 0, rotation: 0 },
          proxy.getViewport({ scale: 2, rotation: 0 }),
        )
        expect(result.tokens[0]?.corners).toEqual([
          [50, 665],
          [60, 665],
          [60, 650],
          [50, 650],
        ])
        const target = proxy.getViewport({ scale: 1.5, rotation })
        const projected = projectPdfOcrPage(result, target, 2)
        expect(projected.boxes[0]?.points).toEqual(
          [
            [50, 665],
            [60, 665],
            [60, 650],
            [50, 650],
          ].map(([x, y]) => target.convertToViewportPoint(x!, y!)),
        )
        expect(projected.bytes).toBe(bytes)
        expect(projected.sourceIndex).toBe(0)
        expect(projected.page).toBe(2)
      } finally {
        await task.destroy()
      }
    },
  )
  it.each([0, 90, 180, 270])(
    'round trips actual corners through Rotate %s and nonzero CropBox',
    async (rotation) => {
      const pdf = await PDFDocument.create(),
        page = pdf.addPage([500, 700])
      page.setCropBox(40, 80, 400, 600)
      page.setRotation(degrees(rotation))
      const bytes = await pdf.save()
      const task = getDocument({ data: bytes.slice() })
      try {
        const proxy = await (await task.promise).getPage(1)
        const viewport = proxy.getViewport({ scale: 2, rotation })
        const result = mapPdfOcrData(data, { bytes, index: 0, rotation }, viewport)
        expect(result.provenance).toBe('local-ocr')
        expect(result.text).toBe('中文 Office\n第二行\n')
        const projected = projectPdfOcrPage(result, viewport, 3)
        expect(projected.boxes[0]!.rect.x * viewport.width).toBeCloseTo(20)
        expect(projected.boxes[0]!.rect.y * viewport.height).toBeCloseTo(30)
        const hit = searchPdfOcr([projected], '中文', { matchCase: false, wholeWord: false })
        expect(hit).toHaveLength(1)
        expect(hit[0]!.page).toBe(3)
        expect(hit[0]!.rects).toHaveLength(2)
        // A substring of a word without symbol boxes retains its full genuine word box.
        const partial = searchPdfOcr([projected], 'ffic', { matchCase: false, wholeWord: false })
        expect(partial[0]?.rects[0]).not.toHaveProperty('insetLeft')
        const zoomed = projectPdfOcrPage(result, proxy.getViewport({ scale: 3, rotation }), 0)
        expect(zoomed.boxes[0]!.rect).toEqual(projected.boxes[0]!.rect)
        expect(
          searchPdfOcr([projected], 'Office\n第二', { matchCase: true, wholeWord: false }),
        ).toHaveLength(1)
      } finally {
        await task.destroy()
      }
    },
  )
  it('does not manufacture character boxes from text-only output', () => {
    expect(() =>
      mapPdfOcrData(
        { ...data, blocks: null },
        { bytes: new Uint8Array([1]), index: 0, rotation: 0 },
        {
          width: 100,
          height: 100,
          convertToPdfPoint: (x, y) => [x, y],
          convertToViewportPoint: (x, y) => [x, y],
        },
      ),
    ).toThrow('可定位字框')
  })
})
