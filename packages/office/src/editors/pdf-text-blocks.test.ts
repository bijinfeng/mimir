import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { expect, it } from 'vitest'
import { buildPdfTextIndex, type PdfTextIndex } from './pdf-text.js'
import { groupPdfTextBlocks, pickPdfTextBlock } from './pdf-text-blocks.js'

it('groups actual split runs and wrapped lines without bridging interleaved columns, then picks the full paragraph at every page rotation', async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    page = pdf.addPage([500, 600])
  for (const y of [500, 482, 464])
    for (const x of [40, 290]) {
      page.drawText('Column ', { x, y, font, size: 12 })
      page.drawText('paragraph line', {
        x: x + font.widthOfTextAtSize('Column ', 12),
        y,
        font,
        size: 12,
      })
    }
  const bytes = await pdf.save(),
    task = getDocument({ data: bytes.slice() })
  try {
    for (const rotation of [0, 90, 180, 270]) {
      const index = await buildPdfTextIndex(
        [{ bytes, index: 0, rotation }],
        async () => task.promise,
      )
      const blocks = groupPdfTextBlocks(index, 0)
      expect(blocks).toHaveLength(2)
      expect(blocks[0]!.text.split('\n')).toHaveLength(3)
      expect(blocks[0]!.items.length).toBeGreaterThanOrEqual(3)
      const rect = blocks[0]!.rect
      expect(pickPdfTextBlock(index, 0, rect.x + rect.width / 2, rect.y + rect.height / 2)).toEqual(
        blocks[0],
      )
      expect(pickPdfTextBlock(index, 0, 0.99, 0.99)).toBeNull()
    }
  } finally {
    await task.destroy()
  }
})

const chunk = (text: string, x: number, y: number, width: number) => ({
  text,
  sourceText: text,
  fontSizeHint: 10,
  pdfRect: [x, y, x + width, y + 10] as [number, number, number, number],
  rect: { x: x / 300, y: (300 - y - 10) / 300, width: width / 300, height: 10 / 300 },
})

it('splits at a short closing line and ignores invalid or outside pointer positions', () => {
  const chunks = [
    chunk('A long paragraph fills the line', 20, 250, 200),
    chunk('ends here', 20, 235, 55),
    chunk('Next paragraph begins with a word', 20, 220, 200),
    chunk('continues its line', 20, 205, 200),
  ]
  const index: PdfTextIndex = {
    pagesWithText: 1,
    pages: [{ page: 0, chunks, text: '', starts: [] }],
  }
  const blocks = groupPdfTextBlocks(index, 0)
  expect(blocks).toHaveLength(2)
  expect(blocks[0]!.text).toContain('ends here')
  expect(blocks[1]!.text).toContain('Next paragraph')
  expect(pickPdfTextBlock(index, 0, NaN, 0)).toBeNull()
  expect(pickPdfTextBlock(index, 0, 0.9, 0.9)).toBeNull()
})
