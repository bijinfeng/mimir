import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  degrees,
  pushGraphicsState,
  rectangle,
  clip,
  endPath,
  popGraphicsState,
} from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { applyPdfTextBlockOperation } from '../services/pdf-agent-host.js'
import { readPdfNativeBlockObjects } from '../services/pdf-block-writer.js'
import { encodePdfPng } from '../services/pdf-image-codec.js'
import { buildPdfTextIndex } from '../../../../packages/office/src/editors/pdf-text.js'
import { groupPdfTextBlocks } from '../../../../packages/office/src/editors/pdf-text-blocks.js'

export async function pdfBlockFixture(rotation = 0) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([500, 700])
  for (const top of [580, 360])
    for (let line = 0; line < 3; line++) {
      const text = [
        'Original paragraph alpha ',
        'Original paragraph bravo ',
        'Original paragraph charlie ',
      ][line]!
      page.drawText(text, { x: 60, y: top - line * 18, size: 12, font })
      page.drawText('bold ending', {
        x: 60 + font.widthOfTextAtSize(text, 12),
        y: top - line * 18,
        size: 12,
        font: bold,
      })
    }
  const image = await pdf.embedPng(
    encodePdfPng({
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 240, 80, 60, 255,
      ]),
    }),
  )
  page.drawImage(image, { x: 350, y: 80, width: 50, height: 50 })
  page.drawRectangle({ x: 30, y: 30, width: 25, height: 20 })
  page.setCropBox(20, 40, 450, 620)
  page.setRotation(degrees(rotation))
  pdf.addPage([500, 700]).drawText('UNTOUCHED SECOND PAGE', { x: 50, y: 500, font, size: 18 })
  return pdf.save()
}
async function rawItems(bytes: Uint8Array, pageIndex = 0) {
  const task = getDocument({ data: bytes.slice() })
  try {
    const page = await (await task.promise).getPage(pageIndex + 1)
    return {
      items: (await page.getTextContent()).items
        .filter((item) => 'str' in item && item.str.trim())
        .map((item) => {
          if (!('str' in item)) throw new Error('invalid item')
          return {
            text: item.str,
            transform: item.transform,
            font: item.fontName.replace(/^g_d\d+_/, ''),
            width: item.width,
            height: item.height,
          }
        }),
      viewport: page.getViewport({ scale: 1 }),
    }
  } finally {
    await task.destroy()
  }
}
describe('native original paragraph matrix move', () => {
  it('retains actual embedded glyph programs and refuses explicitly clipped original text', async () => {
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const font = await pdf.embedFont(
      readFileSync(
        fileURLToPath(
          new URL(
            '../../../../packages/office/vendor/apps/docs/src/renderer/fonts/LiberationSans-Regular.ttf',
            import.meta.url,
          ),
        ),
      ),
      { subset: true },
    )
    const page = pdf.addPage([400, 600])
    page.drawText('Embedded glyphs cafe café', { x: 40, y: 500, size: 12, font })
    page.drawText('Embedded original second line', { x: 40, y: 482, size: 12, font })
    const bytes = await pdf.save(),
      before = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 })
    expect(before.blocks.blocks[0]!.editable).toBe(true)
    const originalObjects = await readPdfNativeBlockObjects(bytes, 0)
    expect(originalObjects[0]!.resource).toHaveLength(64)
    const moved = await applyPdfTextBlockOperation(bytes, {
      op: 'move',
      target: before.blocks.blocks[0]!.target!,
      dx: 19,
      dy: 11,
    })
    const after = await readPdfNativeBlockObjects(moved.bytes!, 0)
    expect(
      after.map((object) => ({
        resource: object.resource,
        text: object.text,
        style: object.style,
      })),
    ).toEqual(
      originalObjects.map((object) => ({
        resource: object.resource,
        text: object.text,
        style: object.style,
      })),
    )
    const clipped = await PDFDocument.create(),
      standard = await clipped.embedFont(StandardFonts.Helvetica),
      clippedPage = clipped.addPage()
    clippedPage.pushOperators(pushGraphicsState(), rectangle(40, 480, 45, 40), clip(), endPath())
    clippedPage.drawText('Clipped original paragraph', { x: 40, y: 500, size: 12, font: standard })
    clippedPage.pushOperators(popGraphicsState())
    const rejected = await applyPdfTextBlockOperation(await clipped.save(), {
      op: 'read',
      pageIndex: 0,
    })
    expect(rejected.blocks.blocks).toMatchObject([
      { editable: false, reason: '页面含有裁切内容流，无法证明原文可完整移动' },
    ])
  })
  it.each([0, 90, 180, 270])(
    'moves all native members with display dx/dy at Rotate %i and offset CropBox, preserving font/media/non-targets',
    async (rotation) => {
      const bytes = await pdfBlockFixture(rotation),
        original = bytes.slice()
      const before = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 })
      expect(before.bytes).toBeUndefined()
      expect(before.blocks.blocks).toHaveLength(2)
      expect(
        before.blocks.blocks.map((block) => ({ editable: block.editable, reason: block.reason })),
      ).toEqual([
        { editable: true, reason: undefined },
        { editable: true, reason: undefined },
      ])
      const target = before.blocks.blocks[0]!.target!
      expect(target.members.length).toBeGreaterThanOrEqual(6)
      const nativeBefore = await readPdfNativeBlockObjects(bytes, 0),
        secondBefore = await rawItems(bytes, 1),
        jsBefore = await rawItems(bytes)
      const p0 = jsBefore.viewport.convertToPdfPoint(0, 0),
        p1 = jsBefore.viewport.convertToPdfPoint(17, 23),
        delta = [p1[0]! - p0[0]!, p1[1]! - p0[1]!]
      const moved = await applyPdfTextBlockOperation(bytes, { op: 'move', target, dx: 17, dy: 23 })
      const nativeAfter = await readPdfNativeBlockObjects(moved.bytes!, 0),
        jsAfter = await rawItems(moved.bytes!)
      expect(nativeAfter).toHaveLength(nativeBefore.length)
      for (const [index, previous] of nativeBefore.entries()) {
        const current = nativeAfter[index]!,
          isTarget = target.members.some((member) => member.objectIndex === index)
        expect(current.text).toBe(previous.text)
        expect(current.style).toBe(previous.style)
        expect(current.resource).toBe(previous.resource)
        const expectedMatrix = [...previous.matrix],
          expectedBounds = [...previous.bounds]
        if (isTarget) {
          expectedMatrix[4]! += delta[0]!
          expectedMatrix[5]! += delta[1]!
          expectedBounds[0]! += delta[0]!
          expectedBounds[2]! += delta[0]!
          expectedBounds[1]! += delta[1]!
          expectedBounds[3]! += delta[1]!
        }
        for (const [at, value] of current.matrix.entries())
          expect(value).toBeCloseTo(expectedMatrix[at]!, 3)
        for (const [at, value] of current.bounds.entries())
          expect(value).toBeCloseTo(expectedBounds[at]!, 2)
        expect({ ...current, matrix: previous.matrix, bounds: previous.bounds }).toEqual(previous)
      }
      for (const [index, item] of jsBefore.items.entries()) {
        const after = jsAfter.items[index]!
        expect(after.text).toBe(item.text)
        expect(after.font).toBe(item.font)
        const old = jsBefore.viewport.convertToViewportPoint(
            item.transform[4]!,
            item.transform[5]!,
          ),
          current = jsAfter.viewport.convertToViewportPoint(
            after.transform[4]!,
            after.transform[5]!,
          )
        expect(current[0]! - old[0]!).toBeCloseTo(index < 6 ? 17 : 0, 2)
        expect(current[1]! - old[1]!).toBeCloseTo(index < 6 ? 23 : 0, 2)
      }
      expect((await rawItems(moved.bytes!, 1)).items).toEqual(secondBefore.items)
      expect(bytes).toEqual(original)
      const fresh = await applyPdfTextBlockOperation(moved.bytes!, { op: 'read', pageIndex: 0 })
      const again = await applyPdfTextBlockOperation(moved.bytes!, {
        op: 'move',
        target: fresh.blocks.blocks[0]!.target!,
        dx: -5,
        dy: 7,
      })
      expect((await rawItems(again.bytes!)).items.map((item) => item.text)).toEqual(
        jsBefore.items.map((item) => item.text),
      )
    },
  )
  it('inspects complete client clustering; rejects partial/mutated/stale/duplicate membership, zero delta and cancellation atomically', async () => {
    const bytes = await pdfBlockFixture()
    const task = getDocument({ data: bytes.slice() })
    let block
    try {
      block = groupPdfTextBlocks(
        await buildPdfTextIndex([{ bytes, index: 0, rotation: 0 }], async () => task.promise),
        0,
      )[0]!
    } finally {
      await task.destroy()
    }
    const inspected = await applyPdfTextBlockOperation(bytes, {
      op: 'inspect',
      probe: { pageIndex: 0, items: block.items },
    })
    expect(inspected.target!.members.length).toBeGreaterThan(1)
    await expect(
      applyPdfTextBlockOperation(bytes, {
        op: 'inspect',
        probe: { pageIndex: 0, items: block.items.slice(1) },
      }),
    ).rejects.toThrow('完整段落')
    const target = inspected.target!
    const badTargets = [
      { ...target, sha256: '0'.repeat(64) },
      { ...target, members: target.members.slice(1) },
      { ...target, members: [...target.members, target.members[0]!] },
      {
        ...target,
        members: target.members.map((item, index) => (index ? item : { ...item, text: 'FORGED' })),
      },
      {
        ...target,
        members: target.members.map((item, index) =>
          index
            ? item
            : {
                ...item,
                matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
              },
        ),
      },
    ]
    for (const invalid of badTargets)
      await expect(
        applyPdfTextBlockOperation(bytes, { op: 'move', target: invalid, dx: 10, dy: 10 }),
      ).rejects.toThrow(/原件已变化|成员不完整|对象已变化/)
    await expect(
      applyPdfTextBlockOperation(bytes, { op: 'move', target, dx: 0, dy: 0 }),
    ).rejects.toThrow('非零')
    const controller = new AbortController()
    controller.abort()
    await expect(
      applyPdfTextBlockOperation(bytes, { op: 'move', target, dx: 10, dy: 10 }, controller.signal),
    ).rejects.toThrow('取消')
    const moved = await applyPdfTextBlockOperation(bytes, { op: 'move', target, dx: 1, dy: 1 })
    await expect(
      applyPdfTextBlockOperation(moved.bytes!, { op: 'move', target, dx: 10, dy: 10 }),
    ).rejects.toThrow('原件已变化')
  })
  it('retains AcroForm and unknown Catalog refusal; overlapping originals fail complete mapping', async () => {
    const bytes = await pdfBlockFixture()
    for (const key of ['AcroForm', 'UnknownPrivateStructure']) {
      const pdf = await PDFDocument.load(bytes)
      pdf.catalog.set(PDFName.of(key), pdf.context.obj({ Fields: [] }))
      await expect(
        applyPdfTextBlockOperation(await pdf.save(), { op: 'read', pageIndex: 0 }),
      ).rejects.toThrow('文档结构')
    }
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica),
      page = pdf.addPage()
    page.drawText('DUPLICATE', { x: 40, y: 500, font, size: 12 })
    page.drawText('DUPLICATE', { x: 40, y: 500, font, size: 12 })
    const read = await applyPdfTextBlockOperation(await pdf.save(), { op: 'read', pageIndex: 0 })
    expect(read.blocks.blocks.every((block) => !block.editable)).toBe(true)
  })
})
