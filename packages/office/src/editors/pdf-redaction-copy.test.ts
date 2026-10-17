import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { expect, it } from 'vitest'
import { pdfRedactionRect, redactionPoint, redactionScreenRect } from './pdf-redaction-copy.js'

it.each([0, 90, 180, 270])(
  'uses the actual PDF.js inverse viewport for Rotate %s with an offset CropBox',
  async (rotation) => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([400, 600])
    page.setCropBox(15, 25, 350, 550)
    page.setRotation(degrees(rotation))
    const task = getDocument({ data: await pdf.save(), useSystemFonts: true })
    const doc = await task.promise
    try {
      const actual = await doc.getPage(1),
        viewport = actual.getViewport({ scale: 1, rotation })
      const boxes: Record<number, number[]> = {
        0: [30, 395, 130, 495],
        90: [55, 30, 155, 130],
        180: [220, 55, 320, 155],
        270: [395, 220, 495, 320],
      }
      const expected = boxes[rotation]!
      const from = { x: expected[0]! / viewport.width, y: expected[1]! / viewport.height },
        to = { x: expected[2]! / viewport.width, y: expected[3]! / viewport.height }
      expect(pdfRedactionRect(viewport, from, to)).toEqual([45, 80, 145, 180])
      expect(pdfRedactionRect(viewport, to, from)).toEqual([45, 80, 145, 180])
      expect(redactionScreenRect(viewport, [45, 80, 145, 180])).toEqual({
        left: `${from.x * 100}%`,
        top: `${from.y * 100}%`,
        width: `${((expected[2]! - expected[0]!) / viewport.width) * 100}%`,
        height: `${((expected[3]! - expected[1]!) / viewport.height) * 100}%`,
      })
    } finally {
      await task.destroy()
    }
  },
)
it('normalizes only the actual overlay bounds and clips pointer capture outside the page', () => {
  const box = { left: 80, top: 120, width: 900, height: 1200 } as DOMRect
  expect(redactionPoint({ x: 530, y: 720 }, box)).toEqual({ x: 0.5, y: 0.5 })
  expect(redactionPoint({ x: 20, y: 1500 }, box)).toEqual({ x: 0, y: 1 })
})
