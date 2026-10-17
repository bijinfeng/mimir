import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  degrees,
} from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PNG } from 'pngjs'
import {
  applyPdfVisualSignature,
  readPdfVisualSignatures,
  preparePdfVisualSignatureScale,
} from '../services/pdf-visual-signatures.js'
import type { PdfSignatureSource } from '@mimir/shared'
const key = PDFName.of
function stream(dict: PDFDict, name: string): PDFRawStream {
  const value = dict.lookup(key(name))
  if (!(value instanceof PDFRawStream)) throw new Error(`Missing ${name} stream`)
  return value
}
// A forged upload can recompute public integrity metadata. Native validation
// must still refuse the object; this hash is not authentication.
function rehash(dict: PDFDict) {
  const hash = createHash('sha256'),
    seen = new Set<PDFObject>()
  const walk = (raw: PDFObject) => {
    const obj = raw instanceof PDFRef ? dict.context.lookup(raw)! : raw
    if (obj instanceof PDFDict || obj instanceof PDFArray || obj instanceof PDFRawStream) {
      if (seen.has(obj)) {
        hash.update('shared')
        return
      }
      seen.add(obj)
    }
    if (obj instanceof PDFRawStream) {
      walk(obj.dict)
      hash.update(obj.contents)
    } else if (obj instanceof PDFDict) {
      for (const [k, v] of obj
        .entries()
        .toSorted(([a], [b]) => a.toString().localeCompare(b.toString()))) {
        if (k.toString() === '/Length') continue
        hash.update(k.toString())
        walk(v)
      }
    } else if (obj instanceof PDFArray) {
      hash.update('[')
      obj.asArray().forEach(walk)
      hash.update(']')
    } else hash.update(obj.toString())
  }
  for (const name of ['Subtype', 'Rect', 'InkList', 'BS', 'C', 'F', 'AP', 'MimirVisualSignature']) {
    hash.update(name)
    const value = dict.get(key(name))
    if (value) walk(value)
  }
  dict.set(key('MimirVisualSignatureHash'), PDFHexString.fromText(hash.digest('hex')))
}
const ink: PdfSignatureSource = {
  kind: 'ink',
  width: 100,
  height: 50,
  color: '#C00000',
  thickness: 3,
  strokes: [
    [
      [5, 5],
      [35, 35],
      [65, 8],
    ],
    [
      [10, 40],
      [85, 40],
    ],
  ],
}
function png(): PdfSignatureSource {
  const image = new PNG({ width: 100, height: 50 })
  for (let y = 5; y < 45; y++)
    for (let x = 10; x < 90; x++) {
      const i = (y * 100 + x) * 4
      image.data[i] = 192
      image.data[i + 3] = x < 50 ? 128 : 255
    }
  return { kind: 'stamp', width: 100, height: 50, png: PNG.sync.write(image).toString('base64') }
}
async function fixture(rotation = 0) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 600])
  page.setMediaBox(-30, 20, 400, 600)
  page.setCropBox(10, 60, 340, 500)
  page.setRotation(degrees(rotation))
  return pdf
}
async function render(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise,
      page = await pdf.getPage(1),
      viewport = page.getViewport({ scale: 1 })
    type O = Parameters<typeof page.render>[0]
    const factory = pdf.canvasFactory as {
      create(
        w: number,
        h: number,
      ): { canvas: NonNullable<O['canvas']>; context: NonNullable<O['canvasContext']> }
      destroy(s: unknown): void
    }
    const surface = factory.create(viewport.width, viewport.height)
    try {
      await page.render({ canvas: surface.canvas, canvasContext: surface.context, viewport })
        .promise
      const width = Math.floor(viewport.width),
        height = Math.floor(viewport.height),
        pixels = surface.context.getImageData(0, 0, width, height).data
      const red: Array<[number, number]> = []
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          if (
            pixels[i]! > 120 &&
            pixels[i + 1]! < 220 &&
            pixels[i + 2]! < 220 &&
            pixels[i]! > pixels[i + 1]! + 15
          )
            red.push([x, y])
        }
      return { red, annotations: await page.getAnnotations() }
    } finally {
      factory.destroy(surface)
    }
  } finally {
    await task.destroy()
  }
}
describe('native visual signatures', () => {
  it.each(['native-color', 'border-style', 'source-dictionary', 'image-rgb', 'image-alpha'])(
    'does not claim a forged %s object even when its public hash is recomputed',
    async (part) => {
      const pdf = await fixture()
      await applyPdfVisualSignature(pdf, {
        op: 'add_visual_signature',
        page: 1,
        source: part.startsWith('image') ? png() : ink,
        rect: { x: 20, y: 30, width: 100, height: 50 },
      })
      const annot = pdf.getPage(0).node.lookup(key('Annots'), PDFArray).lookup(0, PDFDict),
        id = readPdfVisualSignatures(pdf)[0]!.id
      if (part === 'native-color') annot.set(key('C'), pdf.context.obj([0, 0, 1]))
      else if (part === 'border-style') annot.lookup(key('BS'), PDFDict).set(key('S'), key('D'))
      else if (part === 'source-dictionary')
        stream(annot, 'MimirVisualSignature').dict.set(key('Unexpected'), PDFNumber.of(1))
      else {
        const appearance = stream(annot.lookup(key('AP'), PDFDict), 'N'),
          resources = appearance.dict.lookup(key('Resources'), PDFDict),
          image = stream(resources.lookup(key('XObject'), PDFDict), 'Im0'),
          target = part === 'image-alpha' ? stream(image.dict, 'SMask') : image
        const replacement = pdf.context.flateStream(
          new Uint8Array(100 * 50 * (part === 'image-alpha' ? 1 : 3)).fill(255),
          Object.fromEntries(
            target.dict
              .entries()
              .filter(([k]) => !['/Length', '/Filter'].includes(k.toString()))
              .map(([k, v]) => [k.decodeText(), v]),
          ),
        )
        if (part === 'image-alpha') image.dict.set(key('SMask'), pdf.context.register(replacement))
        else
          resources
            .lookup(key('XObject'), PDFDict)
            .set(key('Im0'), pdf.context.register(replacement))
      }
      rehash(annot)
      expect(readPdfVisualSignatures(pdf)).toEqual([])
      await expect(
        applyPdfVisualSignature(pdf, { op: 'delete_visual_signature', page: 1, id }),
      ).rejects.toThrow('可验证')
      expect(pdf.getPage(0).node.lookup(key('Annots'), PDFArray).size()).toBe(1)
    },
  )
  it.each([0, 90, 180, 270])(
    'writes independent Ink paths and transparent Stamp upright at Rotate %i with offset CropBox',
    async (rotation) => {
      for (const source of [ink, png()]) {
        const pdf = await fixture(rotation)
        await applyPdfVisualSignature(pdf, {
          op: 'add_visual_signature',
          page: 1,
          source,
          rect: { x: 40, y: 70, width: 150, height: 75 },
        })
        const bytes = await pdf.save(),
          reopen = await PDFDocument.load(bytes),
          items = readPdfVisualSignatures(reopen)
        expect(items).toHaveLength(1)
        expect(items[0]!.rect).toEqual({ x: 40, y: 70, width: 150, height: 75 })
        const output = await render(bytes)
        expect(output.red.length).toBeGreaterThan(100)
        expect(output.red.every(([x, y]) => x >= 39 && x <= 191 && y >= 69 && y <= 146)).toBe(true)
        expect(output.annotations[0]!.subtype).toBe(source.kind === 'ink' ? 'Ink' : 'Stamp')
        const ann = reopen.getPage(0).node.lookup(key('Annots'), PDFArray).lookup(0, PDFDict)
        const details =
          source.kind === 'ink'
            ? ann.lookup(key('InkList'), PDFArray).size() === 2
            : items[0]!.preview!.length < source.png.length * 3
        expect(details).toBe(true)
      }
    },
  )
  it('moves and aspect-resizes after reopen; rejects external/tampered objects and deletes only own target', async () => {
    const pdf = await fixture()
    await applyPdfVisualSignature(pdf, {
      op: 'add_visual_signature',
      page: 1,
      source: ink,
      rect: { x: 20, y: 30, width: 100, height: 50 },
    })
    const copy = await PDFDocument.load(await pdf.save()),
      id = readPdfVisualSignatures(copy)[0]!.id
    await applyPdfVisualSignature(copy, {
      op: 'transform_visual_signature',
      page: 1,
      id,
      rect: { x: 80, y: 90, width: 150, height: 75 },
    })
    const again = await PDFDocument.load(await copy.save())
    expect(readPdfVisualSignatures(again)[0]!.rect).toEqual({
      x: 80,
      y: 90,
      width: 150,
      height: 75,
    })
    const output = await render(await again.save())
    expect(output.red.length).toBeGreaterThan(100)
    expect(output.red.every(([x, y]) => x >= 79 && x <= 231 && y >= 89 && y <= 166)).toBe(true)
    const ann = again.getPage(0).node.lookup(key('Annots'), PDFArray).lookup(0, PDFDict)
    ann.set(key('Contents'), PDFHexString.fromText('external'))
    ann.set(key('Rect'), again.context.obj([0, 0, 30, 30]))
    expect(readPdfVisualSignatures(again)).toEqual([])
    await expect(
      applyPdfVisualSignature(again, { op: 'delete_visual_signature', page: 1, id }),
    ).rejects.toThrow('可验证')
    await applyPdfVisualSignature(copy, { op: 'delete_visual_signature', page: 1, id })
    expect(readPdfVisualSignatures(await PDFDocument.load(await copy.save()))).toEqual([])
  })
  it('scales native InkList, BS.W and appearance together and remains editable', async () => {
    const pdf = await fixture()
    await applyPdfVisualSignature(pdf, {
      op: 'add_visual_signature',
      page: 1,
      source: ink,
      rect: { x: 20, y: 30, width: 100, height: 50 },
    })
    const page = pdf.getPage(0),
      finish = preparePdfVisualSignatureScale(page, 2)
    page.scaleContent(2, 2)
    page.scaleAnnotations(2, 2)
    page.setMediaBox(-60, 40, 800, 1200)
    page.setCropBox(20, 120, 680, 1000)
    finish()
    const reopened = await PDFDocument.load(await pdf.save()),
      items = readPdfVisualSignatures(reopened)
    expect(items).toHaveLength(1)
    expect(items[0]!.rect).toEqual({ x: 40, y: 60, width: 200, height: 100 })
    const annot = reopened.getPage(0).node.lookup(key('Annots'), PDFArray).lookup(0, PDFDict)
    expect(annot.lookup(key('BS'), PDFDict).lookup(key('W'), PDFNumber).asNumber()).toBe(6)
    const output = await render(await reopened.save())
    expect(output.red.length).toBeGreaterThan(500)
    expect(output.red.every(([x, y]) => x >= 39 && x <= 241 && y >= 59 && y <= 161)).toBe(true)
    await applyPdfVisualSignature(reopened, {
      op: 'transform_visual_signature',
      page: 1,
      id: items[0]!.id,
      rect: { x: 50, y: 80, width: 100, height: 50 },
    })
    expect(
      readPdfVisualSignatures(await PDFDocument.load(await reopened.save()))[0]!.rect.width,
    ).toBeCloseTo(100)
  })
  it('rejects empty content, over-budget or malformed PNG, non-aspect resize and off-page placement without mutating', async () => {
    const pdf = await fixture(),
      before = await pdf.save()
    for (const source of [
      {
        ...ink,
        strokes: [
          [
            [5, 5],
            [5, 5],
          ],
        ],
      },
      { ...png(), png: 'aGVsbG8=' },
    ] as PdfSignatureSource[]) {
      await expect(
        applyPdfVisualSignature(pdf, {
          op: 'add_visual_signature',
          page: 1,
          source,
          rect: { x: 20, y: 20, width: 100, height: 50 },
        }),
      ).rejects.toThrow(/签名/)
    }
    expect(await pdf.save()).toEqual(before)
    await expect(
      applyPdfVisualSignature(pdf, {
        op: 'add_visual_signature',
        page: 1,
        source: ink,
        rect: { x: 20, y: 20, width: 100, height: 60 },
      }),
    ).rejects.toThrow('等比')
    await expect(
      applyPdfVisualSignature(pdf, {
        op: 'add_visual_signature',
        page: 1,
        source: ink,
        rect: { x: 300, y: 20, width: 100, height: 50 },
      }),
    ).rejects.toThrow('完整')
    const blank = new PNG({ width: 100, height: 50 })
    await expect(
      applyPdfVisualSignature(pdf, {
        op: 'add_visual_signature',
        page: 1,
        source: {
          kind: 'stamp',
          width: 100,
          height: 50,
          png: PNG.sync.write(blank).toString('base64'),
        },
        rect: { x: 20, y: 20, width: 100, height: 50 },
      }),
    ).rejects.toThrow('透明')
  })
})

describe('visual signatures through the preserving local host', () => {
  it.each(['crop', 'unit'] as const)(
    'discloses unsupported %s geometry and rejects positioning while allowing verified deletion',
    async (kind) => {
      const { applyPdfLocalOperation: local } = await import('../services/pdf-local.js'),
        pdf = await fixture()
      await applyPdfVisualSignature(pdf, {
        op: 'add_visual_signature',
        page: 1,
        source: ink,
        rect: { x: 20, y: 30, width: 100, height: 50 },
      })
      const id = readPdfVisualSignatures(pdf)[0]!.id,
        page = pdf.getPage(0)
      if (kind === 'crop') page.setCropBox(-50, -20, 500, 700)
      else page.node.set(key('UserUnit'), PDFNumber.of(2))
      const bytes = await pdf.save(),
        info = (await local(bytes, { op: 'read' })).info!
      expect(info.signatureIssues).toHaveLength(1)
      expect(info.signatureIssues![0]!.reason).toContain(kind === 'crop' ? '裁剪框' : 'UserUnit')
      expect(info.signatures).toHaveLength(1)
      for (const op of [
        {
          op: 'add_visual_signature' as const,
          page: 1,
          source: ink,
          rect: { x: 20, y: 30, width: 100, height: 50 },
        },
        {
          op: 'transform_visual_signature' as const,
          page: 1,
          id,
          rect: { x: 20, y: 30, width: 100, height: 50 },
        },
      ])
        await expect(local(bytes, op)).rejects.toThrow(kind === 'crop' ? '裁剪框' : 'UserUnit')
      const removed = await local(bytes, { op: 'delete_visual_signature', page: 1, id })
      expect(removed.info!.signatures).toEqual([])
      expect(
        (await PDFDocument.load(bytes)).getPage(0).node.lookup(key('Annots'), PDFArray).size(),
      ).toBe(1)
    },
  )
  it('replays pending duplicate identities stably, transforms only the copy, preserves native fields/outlines, and prunes deleted resources', async () => {
    const { applyPdfLocalOperation: local } = await import('../services/pdf-local.js')
    const original = await fixture(),
      page = original.getPage(0)
    original.addPage([400, 600])
    const field = original.getForm().createTextField('name')
    field.setText('Keep')
    field.addToPage(page, { x: 20, y: 250, width: 100, height: 20 })
    let result = await local(await original.save(), {
      op: 'set_outline',
      entries: [{ title: 'Keep target', page: 1 }],
    })
    const native = await PDFDocument.load(result.bytes!),
      outline = native.catalog.lookup(key('Outlines'), PDFDict).lookup(key('First'), PDFDict)
    outline.set(key('C'), native.context.obj([0.1, 0.5, 0.2]))
    outline.set(key('F'), PDFNumber.of(2))
    outline.set(key('Dest'), native.context.obj([native.getPage(0).ref, 'XYZ', 45, 300, 1.25]))
    const exactOutline = outline.toString(),
      noOpLayout = await local(await native.save(), {
        op: 'apply_page_layout',
        pages: [
          { source_page: 1, rotation: 0 },
          { source_page: 2, rotation: 0 },
        ],
      }),
      noOpPdf = await PDFDocument.load(noOpLayout.bytes!)
    expect(
      noOpPdf.catalog.lookup(key('Outlines'), PDFDict).lookup(key('First'), PDFDict).toString(),
    ).toBe(exactOutline)
    result = await local(await native.save(), {
      op: 'add_visual_signature',
      page: 1,
      source: ink,
      rect: { x: 20, y: 30, width: 100, height: 50 },
    })
    const base = result.bytes!,
      pages = [
        { source_page: 1, rotation: 0 as const },
        { source_page: 1, rotation: 90 as const },
        { source_page: 2, rotation: 0 as const },
      ]
    const a = await local(base, { op: 'apply_page_layout', pages }),
      b = await local(base, { op: 'apply_page_layout', pages })
    expect(a.info!.signatures!.map((s) => s.id)).toEqual(b.info!.signatures!.map((s) => s.id))
    expect(new Set(a.info!.signatures!.map((s) => s.id)).size).toBe(2)
    const copy = a.info!.signatures!.find((s) => s.page === 2)!,
      moved = await local(b.bytes!, {
        op: 'transform_visual_signature',
        page: 2,
        id: copy.id,
        rect: { x: 80, y: 90, width: 100, height: 200 },
      })
    expect(moved.info!.signatures!.find((s) => s.page === 1)!.rect).toEqual({
      x: 20,
      y: 30,
      width: 100,
      height: 50,
    })
    expect(moved.info!.signatures!.find((s) => s.page === 2)!.rect.x).toBeCloseTo(80)
    const saved = await PDFDocument.load(moved.bytes!)
    expect(saved.getPageCount()).toBe(3)
    expect(saved.getForm().getTextField('name').getText()).toBe('Keep')
    expect(saved.getForm().getTextField('name').acroField.getWidgets()).toHaveLength(2)
    const next = await local(moved.bytes!, {
      op: 'apply_page_layout',
      pages: [
        { source_page: 1, rotation: 0 },
        { source_page: 2, rotation: 90 },
        { source_page: 2, rotation: 90 },
        { source_page: 3, rotation: 0 },
      ],
    })
    expect(new Set(next.info!.signatures!.map((s) => s.id)).size).toBe(3)
    const removed = await local(moved.bytes!, {
      op: 'delete_visual_signature',
      page: 2,
      id: copy.id,
    })
    expect(removed.info!.signatures).toHaveLength(1)
    const output = await PDFDocument.load(removed.bytes!),
      first = output.catalog.lookup(key('Outlines'), PDFDict).lookup(key('First'), PDFDict)
    expect(first.lookup(key('C'))!.toString()).toBe('[ 0.1 0.5 0.2 ]')
    expect(first.lookup(key('F'))!.toString()).toBe('2')
    expect(first.lookup(key('Dest'))!.toString()).toBe(outline.lookup(key('Dest'))!.toString())
    const nativePageObjects = output.context
      .enumerateIndirectObjects()
      .filter(
        ([, obj]) => obj instanceof PDFDict && obj.lookup(key('Type'))?.toString() === '/Page',
      )
    expect(nativePageObjects).toHaveLength(3)
  })
  it.each(['Sig', 'ByteRange', 'Tagged', 'Action', 'Unknown'] as const)(
    'retains refusal for %s structures without output',
    async (kind) => {
      const { applyPdfLocalOperation: local } = await import('../services/pdf-local.js'),
        pdf = await fixture()
      if (kind === 'Sig')
        pdf.catalog.set(
          key('AcroForm'),
          pdf.context.obj({ Fields: [{ FT: 'Sig', T: PDFHexString.fromText('unsigned') }] }),
        )
      if (kind === 'ByteRange')
        pdf.context.register(pdf.context.obj({ ByteRange: [0, 10, 20, 30] }))
      if (kind === 'Tagged')
        pdf.catalog.set(key('StructTreeRoot'), pdf.context.obj({ Type: 'StructTreeRoot' }))
      if (kind === 'Action') pdf.getPage(0).node.set(key('AA'), pdf.context.obj({}))
      if (kind === 'Unknown') pdf.catalog.set(key('UnsupportedStuff'), pdf.context.obj({}))
      const source = await pdf.save()
      await expect(
        local(source, {
          op: 'add_visual_signature',
          page: 1,
          source: ink,
          rect: { x: 20, y: 30, width: 100, height: 50 },
        }),
      ).rejects.toThrow(/签名|结构|动作|标签|权限/)
    },
  )
})

it('retains native ownership and matching real pixels after non-integer paper scaling and another rotation', async () => {
  const { applyPdfLocalOperation: local } = await import('../services/pdf-local.js')
  for (const source of [ink, png()]) {
    const pdf = await fixture(90),
      created = await local(await pdf.save(), {
        op: 'add_visual_signature',
        page: 1,
        source,
        rect: { x: 40, y: 70, width: 150, height: 75 },
      }),
      scaled = await local(created.bytes!, { op: 'set_page_size', preset: 'A5' })
    expect(scaled.info!.signatures).toHaveLength(1)
    const bytes = scaled.bytes!,
      snapshot = await PDFDocument.load(bytes),
      page = snapshot.getPage(0)
    page.setRotation(degrees(180))
    const rotated = await snapshot.save(),
      items = readPdfVisualSignatures(await PDFDocument.load(rotated))
    expect(items).toHaveLength(1)
    const output = await render(rotated)
    expect(output.red.length).toBeGreaterThan(100)
    const rect = items[0]!.rect
    expect(
      output.red.every(
        ([x, y]) =>
          x >= rect.x - 2 &&
          x <= rect.x + rect.width + 2 &&
          y >= rect.y - 2 &&
          y <= rect.y + rect.height + 2,
      ),
    ).toBe(true)
    const moved = await local(rotated, {
      op: 'transform_visual_signature',
      page: 1,
      id: items[0]!.id,
      rect: { ...rect, x: 20, y: 30 },
    })
    expect(moved.info!.signatures).toHaveLength(1)
  }
})
