import fontkit from '@pdf-lib/fontkit'
import { fallbackFontFor } from '../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js'
import { describe, expect, it } from 'vitest'
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFRawStream,
  StandardFonts,
  degrees,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { applyPdfMarkupWithCount, applyPdfTextInserts } from '../services/pdf-agent-host.js'
import { layoutPdfTextInsert } from '../services/pdf-insert-layout.js'
import { matchPdfTextGlyphs } from '../services/pdf-text-glyphs.js'

const contents = (doc: PDFDocument) => doc.getPage(0).node.get(PDFName.of('Contents'))!.toString()

async function fixture(rotation = 0) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 500]),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  page.setCropBox(20, 30, 360, 440)
  page.setRotation(degrees(rotation))
  page.drawText('alpha repeat omega repeat', { x: 50, y: 400, size: 16, font })
  page.drawText('next line', { x: 50, y: 370, size: 16, font })
  return pdf.save()
}

describe('PDF native text parameters', () => {
  it('rejects source glyphs whose visible area is limited by a native clip', async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([400, 500]),
      font = await pdf.embedFont(StandardFonts.Helvetica)
    page.drawText('clipped word', { x: 50, y: 440, size: 16, font })
    page.pushOperators(pushGraphicsState(), rectangle(50, 390, 12, 30), clip(), endPath())
    page.drawText('clipped word', { x: 50, y: 400, size: 16, font })
    page.pushOperators(popGraphicsState())
    const bytes = await pdf.save()
    await expect(
      applyPdfMarkupWithCount(bytes, {
        pageIndex: 0,
        text: 'clipped',
        type: 'highlight',
        all: true,
      }),
    ).rejects.toThrow(/裁切|可靠/)
    expect(
      (
        await applyPdfMarkupWithCount(bytes, {
          pageIndex: 0,
          text: 'clipped',
          type: 'highlight',
        })
      ).count,
    ).toBe(1)
  })
  it.each([0, 90, 180, 270])(
    'marks partial/all matches in original glyph coordinates, rotation %s',
    async (rotation) => {
      const bytes = await fixture(rotation),
        before = await PDFDocument.load(bytes)
      const hits = await matchPdfTextGlyphs(bytes, 0, 'repeat', true)
      expect(hits).toHaveLength(2)
      expect(hits[0]!.glyphCount).toBe(6)
      expect(hits[0]!.boxes).toHaveLength(1)
      expect(hits[0]!.bounds[0]).toBeGreaterThan(70)
      for (const type of ['highlight', 'underline', 'strikeout'] as const) {
        const result = await applyPdfMarkupWithCount(bytes, {
          pageIndex: 0,
          text: 'repeat',
          type,
          all: true,
          color: '#123456',
        })
        expect(result.count).toBe(2)
        const task = getDocument({ data: result.bytes.slice() })
        try {
          const annotations = await (await (await task.promise).getPage(1)).getAnnotations()
          expect(annotations).toHaveLength(2)
          expect(annotations[0]!.color).toEqual(new Uint8ClampedArray([18, 52, 86]))
          expect(annotations[0]!.quadPoints.length).toBe(8)
        } finally {
          await task.destroy()
        }
        const after = await PDFDocument.load(result.bytes)
        expect(contents(after)).toBe(contents(before))
        const streams = before.context
          .enumerateIndirectObjects()
          .filter(([, object]) => object instanceof PDFRawStream)
        for (const [ref, object] of streams) {
          const saved = after.context.lookup(ref)
          if (!(object instanceof PDFRawStream) || !(saved instanceof PDFRawStream))
            throw new Error('Original PDF stream is missing')
          expect(saved.getContents()).toEqual(object.getContents())
        }
      }
      expect(
        (await applyPdfMarkupWithCount(bytes, { pageIndex: 0, text: 'repeat', type: 'highlight' }))
          .count,
      ).toBe(1)
      expect(await matchPdfTextGlyphs(bytes, 0, 'omega repeat next line')).toHaveLength(1)
      await expect(matchPdfTextGlyphs(bytes, 0, 'absent')).rejects.toThrow('没有匹配')
    },
  )
  it.each([0, 90, 180, 270])(
    'measures and places actual wrapped font in displayed direction, rotation %s',
    async (rotation) => {
      const bytes = await fixture(rotation)
      const layout = await layoutPdfTextInsert(bytes, {
        pageIndex: 0,
        text: 'A short line and a longer line of inserted text',
        fontSize: 14,
        color: [0, 0, 0],
        maxWidth: 100,
        align: 'center',
        font: 'times',
        bold: true,
        italic: true,
        x: 40,
        y: 120,
      })
      expect(layout.wrappedText).toContain('\n')
      expect(layout.lineXOffsets.some((value) => value > 0)).toBe(true)
      const task = getDocument({ data: bytes.slice() })
      const viewport = (await (await task.promise).getPage(1)).getViewport({ scale: 1 })
      await task.destroy()
      const result = await applyPdfTextInserts(bytes, [
        {
          pageIndex: 0,
          origin: viewport.convertToPdfPoint(layout.x, layout.y + layout.fontSize) as [
            number,
            number,
          ],
          text: layout.wrappedText,
          fontSize: layout.fontSize,
          color: layout.color,
          font: layout.font,
          bold: layout.bold,
          italic: layout.italic,
          align: layout.align,
          lineLeading: layout.lineLeading,
          lineXOffsets: layout.lineXOffsets,
          rotate: viewport.rotation,
        },
      ])
      expect(result.length).toBeGreaterThan(bytes.length)
      const read = getDocument({ data: result.slice() })
      try {
        const items = (await (await (await read.promise).getPage(1)).getTextContent()).items
        const first = items.find(
          (item) => 'str' in item && item.str === layout.wrappedText.split('\n')[0],
        )
        expect(first).toBeDefined()
        if (!first || !('str' in first)) throw new Error('Inserted first line missing')
        const [x, y] = viewport.convertToViewportPoint(first.transform[4], first.transform[5])
        expect(x).toBeCloseTo(layout.x + layout.lineXOffsets[0]!, 2)
        expect(y).toBeCloseTo(layout.y + layout.fontSize, 2)
        const [right, level] = viewport.convertToViewportPoint(
          first.transform[4] + first.transform[0],
          first.transform[5] + first.transform[1],
        )
        expect(right).toBeGreaterThan(x!)
        expect(level).toBeCloseTo(y!, 2)
        expect(
          items
            .map((item) => ('str' in item ? item.str : ''))
            .join('')
            .replace(/\s/g, ''),
        ).toContain(layout.text.replace(/\s/g, ''))
      } finally {
        await read.destroy()
      }
    },
  )
  it('resolves default/unique anchors and rejects ambiguous or overflowing layouts', async () => {
    const bytes = await fixture()
    const input = {
      pageIndex: 0,
      text: 'NEW',
      fontSize: 12,
      color: [0, 0, 0] as [number, number, number],
    }
    const normal = await layoutPdfTextInsert(bytes, input)
    expect(normal.x).toBeGreaterThan(100)
    expect(normal.y).toBe(36)
    const below = await layoutPdfTextInsert(bytes, {
      ...input,
      anchorText: 'next line',
      placement: 'below',
    })
    expect(below.x).toBeGreaterThan(20)
    expect(below.y).toBeGreaterThan(100)
    await expect(layoutPdfTextInsert(bytes, { ...input, anchorText: 'repeat' })).rejects.toThrow(
      '不能唯一定位',
    )
    await expect(layoutPdfTextInsert(bytes, { ...input, x: 355, y: 5 })).rejects.toThrow('超出页面')
  })
})

it('matches NFKC expanded glyphs without splitting their native source and retains exact insert color', async () => {
  const bytes = await fixture()
  expect(await matchPdfTextGlyphs(bytes, 0, 'ｒｅｐｅａｔ', true)).toHaveLength(2)
  const inserted = await applyPdfTextInserts(bytes, [
    {
      pageIndex: 0,
      origin: [50, 250],
      text: '中文',
      fontSize: 14,
      color: [18 / 255, 52 / 255, 86 / 255],
    },
  ])
  const compatDoc = await PDFDocument.create()
  compatDoc.registerFontkit(fontkit)
  const compatFont = await compatDoc.embedFont(fallbackFontFor('㍿')!)
  compatDoc.addPage([300, 400]).drawText('㍿', { x: 40, y: 300, font: compatFont, size: 14 })
  const compatBytes = await compatDoc.save()
  expect(await matchPdfTextGlyphs(compatBytes, 0, '株式会社')).toHaveLength(1)
  await expect(matchPdfTextGlyphs(compatBytes, 0, '株')).rejects.toThrow('没有匹配')
  expect(await matchPdfTextGlyphs(inserted, 0, '中文')).toHaveLength(1)
  const { readPdfNativeBlockObjects } = await import('../services/pdf-block-writer.js')
  const objects = await readPdfNativeBlockObjects(inserted, 0)
  const added = objects.find((object) => object.text.includes('中文'))!
  expect(JSON.parse(added.style)[0]).toEqual([18, 52, 86, 255])
})

it('keeps PDFium-expanded ligatures bound to one physical source glyph', async () => {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fallbackFontFor('ﬁance')!)
  doc.addPage([300, 400]).drawText('ﬁance', { x: 40, y: 300, font, size: 14 })
  const bytes = await doc.save()
  expect((await matchPdfTextGlyphs(bytes, 0, 'fi'))[0]!.glyphCount).toBe(1)
  await expect(matchPdfTextGlyphs(bytes, 0, 'f')).rejects.toThrow('没有匹配')
  await expect(matchPdfTextGlyphs(bytes, 0, 'i')).rejects.toThrow('没有匹配')
})

it('keeps a legacy verified whole-run target bound to its selected object', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 500]),
    font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('prefix target suffix', { x: 40, y: 400, font, size: 14 })
  page.drawText('target', { x: 40, y: 300, font, size: 14 })
  const bytes = await doc.save()
  const { readPdfNativeBlockObjects } = await import('../services/pdf-block-writer.js')
  const { inspectPdfTextTarget } = await import('../services/pdf-agent-host.js')
  const object = (await readPdfNativeBlockObjects(bytes, 0)).find((o) => o.text === 'target')!
  const target = await inspectPdfTextTarget(bytes, {
    pageIndex: 0,
    oldText: 'target',
    rect: object.bounds,
  })
  const result = await applyPdfMarkupWithCount(bytes, { target, type: 'highlight' })
  const task = getDocument({ data: result.bytes.slice() })
  try {
    const annotations = await (await (await task.promise).getPage(1)).getAnnotations()
    expect(annotations).toHaveLength(1)
    expect(annotations[0]!.rect[1]).toBeCloseTo(object.bounds[1], 1)
  } finally {
    await task.destroy()
  }
})

it('maps a non-BMP ToUnicode source to its complete physical glyph', async () => {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([300, 400]).drawText('A', { x: 40, y: 300, font, size: 14 })
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /MimirNonBmp def /CMapType 2 def
1 begincodespacerange <00> <FF> endcodespacerange
1 beginbfchar <41> <D83DDE00> endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`
  await doc.flush()
  doc.context
    .lookup(font.ref, PDFDict)
    .set(PDFName.of('ToUnicode'), doc.context.register(doc.context.flateStream(cmap)))
  const bytes = await doc.save()
  const hits = await matchPdfTextGlyphs(bytes, 0, '😀')
  expect(hits).toHaveLength(1)
  expect(hits[0]!.glyphCount).toBe(1)
  expect(hits[0]!.bounds[0]).toBeGreaterThan(39)
  await expect(matchPdfTextGlyphs(bytes, 0, '\ud83d')).rejects.toThrow('没有匹配')
})
