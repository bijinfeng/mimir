import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFHexString, PDFName, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfDrawingInput } from '@mimir/shared'
import { applyPdfLocalOperation as apply } from '../services/pdf-local.js'

async function render(bytes: Uint8Array, index = 1) {
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise,
      page = await pdf.getPage(index),
      viewport = page.getViewport({ scale: 1 })
    type Options = Parameters<typeof page.render>[0]
    const factory = pdf.canvasFactory as {
        create(
          width: number,
          height: number,
        ): {
          canvas: NonNullable<Options['canvas']>
          context: NonNullable<Options['canvasContext']>
        }
        destroy(surface: unknown): void
      },
      surface = factory.create(viewport.width, viewport.height)
    try {
      await page.render({ canvas: surface.canvas, canvasContext: surface.context, viewport })
        .promise
      return {
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height),
        data: surface.context
          .getImageData(0, 0, Math.floor(viewport.width), Math.floor(viewport.height))
          .data.slice(),
      }
    } finally {
      factory.destroy(surface)
    }
  } finally {
    await task.destroy()
  }
}
function mask(image: Awaited<ReturnType<typeof render>>, d?: PdfDrawingInput) {
  const pixels = new Set<number>()
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      if (
        d &&
        (x < d.x - d.thickness - 2 ||
          x > d.x + d.width + d.thickness + 2 ||
          y < d.y - d.thickness - 2 ||
          y > d.y + d.height + d.thickness + 2)
      )
        continue
      const at = (y * image.width + x) * 4
      if (image.data[at]! > 150 && image.data[at + 1]! < 90 && image.data[at + 2]! < 90)
        pixels.add(at)
    }
  return pixels
}
function expectSamePixels(
  before: Awaited<ReturnType<typeof render>>,
  after: Awaited<ReturnType<typeof render>>,
  drawings: PdfDrawingInput[],
) {
  expect([after.width, after.height]).toEqual([before.width, before.height])
  for (const d of drawings) {
    const a = mask(before, d),
      b = mask(after, d),
      union = new Set([...a, ...b]),
      intersection = [...a].filter((p) => b.has(p)).length
    expect({
      kind: d.kind,
      visible: a.size > 10,
      aligned: intersection / union.size > 0.97,
    }).toEqual({ kind: d.kind, visible: true, aligned: true })
  }
}
async function fixture(rotation = 0, drawingRotation: 0 | 90 | 180 | 270 = 0) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 600])
  page.setMediaBox(-30, 20, 400, 600)
  page.setCropBox(10, 60, 340, 500)
  page.setRotation(degrees(rotation))
  page.drawText('KEEP ORIGINAL', { x: 40, y: 500, size: 12 })
  pdf.addPage([400, 600])
  pdf.getForm().createTextField('name').addToPage(page, { x: 40, y: 400, width: 100, height: 25 })
  let result = await apply(await pdf.save(), {
    op: 'set_outline',
    entries: [{ title: 'Drawing page', page: 1 }],
  })
  result = await apply(result.bytes!, { op: 'set_watermark', text: '内部资料' })
  const kinds: PdfDrawingInput['kind'][] = [
    'rect',
    'ellipse',
    'line',
    'arrow',
    'check',
    'cross',
    'ink',
  ]
  for (const [i, kind] of kinds.entries()) {
    const x = 20 + (i % 2) * 140,
      y = 20 + Math.floor(i / 2) * 85
    result = await apply(result.bytes!, {
      op: 'add_drawing',
      drawing: {
        kind,
        page: 1,
        x,
        y,
        width: 80,
        height: 45,
        color: '#FF0000',
        thickness: 3,
        opacity: 1,
        rotation: drawingRotation,
        ...(kind === 'ink'
          ? {
              points: [
                [x, y],
                [x + 30, y + 45],
                [x + 50, y + 10],
                [x + 80, y + 30],
              ] as Array<[number, number]>,
            }
          : {}),
      },
    })
  }
  return result
}

describe('editable PDF drawing geometry', () => {
  it('enforces global cache identities and counts before copying pages', async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([400, 600]),
      other = pdf.addPage([400, 600]),
      drawings = Array.from({ length: 300 }, (_, i) => ({
        id: `cached-${i}`,
        kind: 'rect',
        page: 1,
        x: -20,
        y: 30,
        width: 80,
        height: 40,
        color: '#FF0000',
        thickness: 0.1,
        opacity: 1,
      }))
    const write = (target: typeof page, values: typeof drawings) =>
      target.node.set(PDFName.of('MimirDrawings'), PDFHexString.fromText(JSON.stringify(values)))
    write(page, drawings)
    const source = await pdf.save()
    await expect(
      apply(source, {
        op: 'apply_page_layout',
        pages: [
          { source_page: 1, rotation: 0 },
          { source_page: 1, rotation: 90 },
        ],
      }),
    ).rejects.toThrow('复制后绘图超过 500')
    write(other, drawings.slice(0, 1))
    await expect(apply(await pdf.save(), { op: 'read' })).rejects.toThrow('ID 重复')
    write(
      other,
      drawings.slice(0, 201).map((d) => Object.assign({}, d, { id: `other-${d.id}` })),
    )
    await expect(apply(await pdf.save(), { op: 'read' })).rejects.toThrow('超过 500')
  })

  it.each(['objects', 'points'] as const)(
    'rejects over-budget cached %s before reads or geometry changes',
    async (budget) => {
      const pdf = await PDFDocument.create(),
        page = pdf.addPage([400, 600]),
        drawing = {
          id: 'cached',
          kind: 'ink',
          page: 1,
          x: -20,
          y: 30,
          width: 80,
          height: 40,
          color: '#FF0000',
          thickness: 0.1,
          opacity: 1,
          points: Array.from({ length: budget === 'points' ? 2001 : 2 }, () => [0, 40]),
        }
      page.node.set(
        PDFName.of('MimirDrawings'),
        PDFHexString.fromText(
          JSON.stringify(
            budget === 'objects'
              ? Array.from({ length: 501 }, (_, i) => ({ ...drawing, id: `cached-${i}` }))
              : [drawing],
          ),
        ),
      )
      const bytes = await pdf.save()
      await expect(apply(bytes, { op: 'read' })).rejects.toThrow('超过')
      await expect(
        apply(bytes, { op: 'apply_ops', ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] }),
      ).rejects.toThrow('超过')
    },
  )

  it.each([0, 90, 180, 270] as const)(
    'redraws exact directional paths after native rotation, offset crop, A5 and target %i',
    async (rotation) => {
      const source = await fixture((rotation + 90) % 360),
        layout = {
          op: 'apply_page_layout' as const,
          pages: [
            {
              source_page: 1,
              rotation,
              crop: { left: 12, right: 18, top: 10, bottom: 15 },
              paper: { width: 419.53, height: 595.28 },
            },
            { source_page: 2, rotation: 0 as const },
          ],
        },
        transformed = await apply(source.bytes!, layout),
        before = await render(transformed.bytes!),
        { id, ...drawing } = transformed.info!.drawings[0]!,
        redrawn = await apply(transformed.bytes!, { op: 'update_drawing', id, drawing }),
        after = await render(redrawn.bytes!)
      expectSamePixels(before, after, transformed.info!.drawings)
      expect(redrawn.info!.drawings.map((d) => d.id)).toEqual(
        transformed
          .info!.drawings.map((d) => d.id)
          .filter((v) => v !== id)
          .concat(id),
      )
      expect(redrawn.info!.outline).toEqual([{ title: 'Drawing page', page: 1, level: 0 }])
      expect(redrawn.info!.watermark!.text).toBe('内部资料')
      expect((await PDFDocument.load(redrawn.bytes!)).getForm().getFields()).toHaveLength(1)
      const task = getDocument({ data: redrawn.bytes!.slice() })
      try {
        const text = (await (await (await task.promise).getPage(1)).getTextContent()).items
          .map((i) => ('str' in i ? i.str : ''))
          .join(' ')
        expect(text).toContain('KEEP ORIGINAL')
        expect(text).toContain('内部资料')
      } finally {
        await task.destroy()
      }
    },
  )

  it('keeps pre-rotated arrows and marks exact through successive positive and negative rotations', async () => {
    let current = await fixture(270, 90)
    for (const dir of [90, 180, -90] as const) {
      const changed = await apply(current.bytes!, {
          op: 'apply_ops',
          ops: [{ op: 'rotatePages', pages: [1], dir }],
        }),
        before = await render(changed.bytes!),
        { id, ...drawing } = changed.info!.drawings.find((d) => d.kind === 'arrow')!,
        redrawn = await apply(changed.bytes!, { op: 'update_drawing', id, drawing })
      expectSamePixels(before, await render(redrawn.bytes!), changed.info!.drawings)
      expect(redrawn.info!.drawings.find((d) => d.id === id)!.rotation).toBe(drawing.rotation)
      current = redrawn
    }
  })

  it('preserves clipped negative paths and tiny or enlarged derived geometry through repeated writes', async () => {
    const source = await fixture()
    const cropped = await apply(source.bytes!, {
      op: 'crop_pages',
      pages: '1',
      left: 0.1,
      top: 0.05,
      right: 0.9,
      bottom: 0.9,
    })
    expect(cropped.info!.drawings.some((d) => d.x < 0 || d.y < 0)).toBe(true)
    const before = await render(cropped.bytes!),
      { id, ...drawing } = cropped.info!.drawings[0]!,
      redrawn = await apply(cropped.bytes!, { op: 'update_drawing', id, drawing })
    expectSamePixels(before, await render(redrawn.bytes!), cropped.info!.drawings)
    const tiny = await apply(redrawn.bytes!, { op: 'set_page_size', width: 20, height: 20 })
    expect(tiny.info!.drawings[0]!.thickness).toBeLessThan(0.25)
    const { id: tinyId, ...tinyDrawing } = tiny.info!.drawings[0]!
    const tinyAgain = await apply(tiny.bytes!, {
      op: 'update_drawing',
      id: tinyId,
      drawing: tinyDrawing,
    })
    expect(tinyAgain.info!.drawings.find((d) => d.id === tinyId)!.thickness).toBe(
      tinyDrawing.thickness,
    )
    const enlarged = await apply(tinyAgain.bytes!, {
      op: 'crop_pages',
      pages: '1',
      left: 0.499,
      top: 0.499,
      right: 0.501,
      bottom: 0.501,
    })
    const big = await apply(enlarged.bytes!, { op: 'set_page_size', width: 14400, height: 14400 })
    expect(big.info!.drawings.some((d) => d.width > 14400)).toBe(true)
    const { id: bigId, ...bigDrawing } = big.info!.drawings[0]!
    const bigAgain = await apply(big.bytes!, {
      op: 'update_drawing',
      id: bigId,
      drawing: bigDrawing,
    })
    expect(bigAgain.info!.drawings.find((d) => d.id === bigId)!.width).toBe(bigDrawing.width)
  })

  it('keeps copy identities stable through different geometry, reorder, update and delete', async () => {
    const source = await fixture(),
      layout = {
        op: 'apply_page_layout' as const,
        pages: [
          { source_page: 1, rotation: 90 as const, paper: { width: 419.53, height: 595.28 } },
          {
            source_page: 1,
            rotation: 270 as const,
            crop: { left: 12, right: 18, top: 10, bottom: 15 },
          },
          { source_page: 2, rotation: 0 as const },
        ],
      },
      first = await apply(source.bytes!, layout),
      replay = await apply(source.bytes!, layout)
    expect(first.info!.drawings.map((d) => d.id)).toEqual(replay.info!.drawings.map((d) => d.id))
    expect(new Set(first.info!.drawings.map((d) => d.id)).size).toBe(14)
    const reversed = await apply(first.bytes!, {
      op: 'apply_ops',
      ops: [
        { op: 'setPageOrder', order: [3, 2, 1] },
        { op: 'rotatePages', pages: [2], dir: 90 },
      ],
    })
    const chosen = reversed.info!.drawings.find((d) => d.page === 2 && d.kind === 'check')!,
      { id, ...drawing } = chosen
    const updated = await apply(reversed.bytes!, { op: 'update_drawing', id, drawing })
    expectSamePixels(
      await render(reversed.bytes!, 2),
      await render(updated.bytes!, 2),
      reversed.info!.drawings.filter((d) => d.page === 2),
    )
    const removed = await apply(updated.bytes!, { op: 'delete_drawing', id })
    expect(removed.info!.drawings).toHaveLength(13)
    expect(removed.info!.drawings.some((d) => d.id === id)).toBe(false)
    const pdf = await PDFDocument.load(removed.bytes!)
    expect(pdf.getForm().getTextField('name').acroField.getWidgets()).toHaveLength(2)
    expect(
      pdf.context
        .enumerateIndirectObjects()
        .filter(
          ([, obj]) =>
            obj instanceof PDFDict && obj.lookup(PDFName.of('Type'))?.toString() === '/Page',
        ),
    ).toHaveLength(3)
  })
})
