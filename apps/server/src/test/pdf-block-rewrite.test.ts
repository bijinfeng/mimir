import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { expect, it } from 'vitest'
import { applyPdfTextBlockOperation } from '../services/pdf-text-blocks.js'
import { readPdfNativeBlockObjects } from '../services/pdf-block-writer.js'

async function fixture(rotation = 0) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    page = pdf.addPage([500, 700])
  for (const top of [580, 360]) {
    page.drawText('Alpha repeated repeated ', { x: 60, y: top, size: 12, font })
    page.drawText('bold ending', {
      x: 60 + font.widthOfTextAtSize('Alpha repeated repeated ', 12),
      y: top,
      size: 12,
      font: bold,
    })
    page.drawText('The second original paragraph line.', { x: 60, y: top - 18, size: 12, font })
  }
  page.drawRectangle({ x: 30, y: 30, width: 20, height: 20 })
  page.setCropBox(20, 40, 450, 620)
  page.setRotation(degrees(rotation))
  pdf.addPage().drawText('SECOND PAGE KEPT', { x: 50, y: 500, size: 12, font })
  return pdf.save()
}
async function readText(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice() })
  try {
    return (await (await (await task.promise).getPage(1)).getTextContent()).items
      .filter((item) => 'str' in item)
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
  } finally {
    await task.destroy()
  }
}
it.each([0, 90, 180, 270])(
  'rewrites real original objects with width-based native reflow at Rotate %i, preserving repeated non-targets',
  async (rotation) => {
    const bytes = await fixture(rotation),
      original = bytes.slice(),
      before = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 }),
      target = before.blocks.blocks[0]!.target!,
      objects = await readPdfNativeBlockObjects(bytes, 0)
    expect(before.blocks.blocks[0]!.canRewrite).toBe(true)
    const result = await applyPdfTextBlockOperation(bytes, {
      op: 'rewrite',
      target,
      newText:
        'A new original paragraph has substantially different wording and enough words to wrap within the original paragraph width.',
    })
    expect(await readText(result.bytes!)).toContain('A new original paragraph')
    expect(await readText(result.bytes!)).toContain('Alpha repeated repeated')
    expect((await readPdfNativeBlockObjects(result.bytes!, 0)).filter((o) => o.type !== 1)).toEqual(
      objects
        .filter((o) => o.type !== 1)
        .map((o) => expect.objectContaining({ ...o, objectIndex: expect.any(Number) })),
    )
    expect(await readPdfNativeBlockObjects(result.bytes!, 1)).toEqual(
      await readPdfNativeBlockObjects(bytes, 1),
    )
    expect(bytes).toEqual(original)
  },
)
it('replaces the second substring in a frozen repeated paragraph, preserves native bold runs, then really removes the paragraph', async () => {
  const bytes = await fixture(),
    before = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 }),
    target = before.blocks.blocks[0]!.target!,
    objects = await readPdfNativeBlockObjects(bytes, 0)
  const result = await applyPdfTextBlockOperation(bytes, {
    op: 'rewrite',
    target,
    replace: { oldText: 'repeated', occurrence: 2 },
    newText: 'changed',
  })
  expect(await readText(result.bytes!)).toContain('Alpha repeated changed')
  const native = await readPdfNativeBlockObjects(result.bytes!, 0),
    bold = objects.find((o) => o.text.includes('bold ending'))!
  expect(
    native
      .filter((o) => o.text.includes('bold ending'))
      .map((o) => ({ style: o.style, resource: o.resource })),
  ).toEqual([
    { style: bold.style, resource: bold.resource },
    { style: bold.style, resource: bold.resource },
  ])
  const fresh = result.blocks.blocks.find((block) => block.text.includes('changed'))!
  const deleted = await applyPdfTextBlockOperation(result.bytes!, {
    op: 'rewrite',
    target: fresh.target!,
    newText: '',
  })
  expect(await readText(deleted.bytes!)).not.toContain('changed')
  expect(await readText(deleted.bytes!)).toContain('Alpha repeated repeated')
  expect(
    (await readPdfNativeBlockObjects(deleted.bytes!, 0)).filter((o) => o.type !== 1),
  ).toHaveLength(1)
})
it.each(['left', 'center', 'right'] as const)(
  'uses the actual embedded replacement font for %s reflow and retains page geometry',
  async (align) => {
    const bytes = await fixture(90),
      before = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 }),
      block = before.blocks.blocks[0]!,
      original = await PDFDocument.load(bytes)
    const result = await applyPdfTextBlockOperation(bytes, {
      op: 'rewrite',
      target: block.target!,
      newText:
        'Native font width determines the line breaks and aligned line positions. This paragraph wraps across several lines.',
      font: 'courier',
      fontSize: 14,
      color: '#2468AC',
      align,
      italic: true,
    })
    const after = await readPdfNativeBlockObjects(result.bytes!, 0),
      selected = after.filter((object) => object.type === 1 && object.matrix[5] > 400)
    expect(selected.length).toBeGreaterThan(1)
    expect(selected.map((object) => JSON.parse(object.style) as unknown[])).toEqual(
      selected.map(() => [[36, 104, 172, 255], [0, 0, 0, 255], 14, 0]),
    )
    for (const row of selected) {
      expect(row.matrix[4]).toBeGreaterThanOrEqual(59.99)
      expect(row.bounds[2]).toBeLessThanOrEqual(
        60 + (block.target!.members.reduce((right, m) => Math.max(right, m.bounds[2]), 0) - 60) + 2,
      )
    }
    const saved = await PDFDocument.load(result.bytes!)
    expect(saved.getPage(0).getCropBox()).toEqual(original.getPage(0).getCropBox())
    expect(saved.getPage(0).getRotation()).toEqual(original.getPage(0).getRotation())
  },
)
it('rejects stale hashes, incomplete membership, invalid occurrences, unavailable glyphs and cancellation without changing input', async () => {
  const bytes = await fixture(),
    original = bytes.slice(),
    before = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 }),
    target = before.blocks.blocks[0]!.target!
  for (const invalid of [
    { ...target, sha256: '0'.repeat(64) },
    { ...target, members: target.members.slice(1) },
  ])
    await expect(
      applyPdfTextBlockOperation(bytes, {
        op: 'rewrite',
        target: invalid,
        newText: 'Must not publish',
      }),
    ).rejects.toThrow(/已变化|成员不完整/)
  await expect(
    applyPdfTextBlockOperation(bytes, {
      op: 'rewrite',
      target,
      newText: 'x',
      replace: { oldText: 'repeated', occurrence: 99 },
    }),
  ).rejects.toThrow('指定次序')
  await expect(
    applyPdfTextBlockOperation(bytes, {
      op: 'rewrite',
      target,
      newText: 'Unsupported glyph \u{10ffff}',
    }),
  ).rejects.toThrow(/font|字体|字形|characters/)
  const controller = new AbortController()
  controller.abort()
  await expect(
    applyPdfTextBlockOperation(
      bytes,
      { op: 'rewrite', target, newText: 'Cancelled' },
      controller.signal,
    ),
  ).rejects.toThrow('取消')
  expect(bytes).toEqual(original)
})

it('renders every rewritten CJK glyph using its actual embedded font in an independent reader', async () => {
  const bytes = await fixture(),
    before = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 }),
    text = '收入稳定增长本期工作',
    result = await applyPdfTextBlockOperation(bytes, {
      op: 'rewrite',
      target: before.blocks.blocks[0]!.target!,
      newText: text,
      fontSize: 18,
    })
  expect(await readText(result.bytes!)).toContain(text)
  const task = getDocument({ data: result.bytes!.slice(), useSystemFonts: false }),
    opened = await task.promise,
    page = await opened.getPage(1),
    viewport = page.getViewport({ scale: 2 })
  type RenderOptions = Parameters<typeof page.render>[0]
  const factory = opened.canvasFactory as {
    create(
      width: number,
      height: number,
    ): {
      canvas: NonNullable<RenderOptions['canvas']>
      context: NonNullable<RenderOptions['canvasContext']>
    }
    destroy(surface: unknown): void
  }
  const surface = factory.create(viewport.width, viewport.height)
  try {
    await page.render({ canvasContext: surface.context, canvas: surface.canvas, viewport }).promise
    const [left, baseline] = viewport.convertToViewportPoint(60, 580)
    const counts = Array.from(text, (_, i) => {
      const pixels = surface.context.getImageData(
        Math.round(left + i * 36 + 2),
        Math.round(baseline - 36),
        32,
        36,
      ).data
      let dark = 0
      for (let p = 0; p < pixels.length; p += 4)
        if (pixels[p]! < 150 && pixels[p + 1]! < 150 && pixels[p + 2]! < 150) dark++
      return dark
    })
    expect(Math.min(...counts)).toBeGreaterThan(20)
  } finally {
    factory.destroy(surface)
    await task.destroy()
  }
})

it('really clears inherited bold and italic faces, preserves the other style, and clears synthetic bold strokes', async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([500, 700]),
    font = await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    normal = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('Styled original words', { x: 60, y: 580, size: 14, font })
  page.drawText('NON TARGET KEEP', { x: 60, y: 360, size: 12, font: normal })
  const bytes = await pdf.save(),
    source = await applyPdfTextBlockOperation(bytes, { op: 'read', pageIndex: 0 }),
    original = await readPdfNativeBlockObjects(bytes, 0)
  expect(original[0]!.font!.name).toMatch(/BoldOblique/)
  const unbold = await applyPdfTextBlockOperation(bytes, {
    op: 'rewrite',
    target: source.blocks.blocks[0]!.target!,
    newText: source.blocks.blocks[0]!.text,
    bold: false,
  })
  const afterUnbold = await readPdfNativeBlockObjects(unbold.bytes!, 0),
    styled = afterUnbold.filter((object) => object.matrix[5] > 500)
  expect(styled.length).toBeGreaterThan(0)
  for (const object of styled) {
    expect(object.font!.name).not.toMatch(/bold/i)
    expect(object.font!.weight).toBeLessThan(600)
    expect(object.font!.italicAngle).not.toBe(0)
    expect((JSON.parse(object.style) as unknown[])[3]).toBe(0)
  }
  const plain = await applyPdfTextBlockOperation(unbold.bytes!, {
    op: 'rewrite',
    target: unbold.blocks.blocks[0]!.target!,
    newText: 'changed',
    replace: { oldText: 'original', occurrence: 1 },
    italic: false,
  })
  const afterPlain = await readPdfNativeBlockObjects(plain.bytes!, 0)
  expect(await readText(plain.bytes!)).toContain('Styled changed words')
  for (const object of afterPlain.filter((o) => o.matrix[5] > 500)) {
    expect(object.font!.name).not.toMatch(/bold|italic|oblique/i)
    expect(object.font!.italicAngle).toBe(0)
  }
  expect(afterPlain.find((object) => object.text.includes('NON TARGET'))).toMatchObject(
    original[1]!,
  )
  const synth = await applyPdfTextBlockOperation(plain.bytes!, {
    op: 'rewrite',
    target: plain.blocks.blocks[0]!.target!,
    newText: plain.blocks.blocks[0]!.text,
    bold: true,
  })
  expect(
    (await readPdfNativeBlockObjects(synth.bytes!, 0))
      .filter((object) => object.matrix[5] > 500)
      .some((object) => (JSON.parse(object.style) as unknown[])[3] === 2),
  ).toBe(true)
  const cleared = await applyPdfTextBlockOperation(synth.bytes!, {
    op: 'rewrite',
    target: synth.blocks.blocks[0]!.target!,
    newText: synth.blocks.blocks[0]!.text,
    bold: false,
    italic: false,
  })
  for (const object of (await readPdfNativeBlockObjects(cleared.bytes!, 0)).filter(
    (o) => o.matrix[5] > 500,
  )) {
    expect((JSON.parse(object.style) as unknown[])[3]).toBe(0)
    expect(object.font!.name).not.toMatch(/bold|italic|oblique/i)
  }
})
