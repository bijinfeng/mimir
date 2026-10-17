import { createHash } from 'node:crypto'
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
  StandardFonts,
  decodePDFRawStream,
  degrees,
} from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { pdfLocalOperationSchema } from '@mimir/shared'
import { applyPdfLocalOperation } from '../services/pdf-local.js'
import { createPdfRedactedCopy } from '../services/pdf-redaction-copy.js'

const region = { pageIndex: 0, rect: [78, 84, 145, 112] as [number, number, number, number] }
const redact = (bytes: Uint8Array, regions = [region], signal?: AbortSignal) =>
  createPdfRedactedCopy(bytes, { op: 'redact_copy', regions }, signal)

async function text(bytes: Uint8Array) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise
    return await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1)
        return (await page.getTextContent()).items
          .flatMap((item) => ('str' in item ? [item.str] : []))
          .join('')
      }),
    )
  } finally {
    await task.destroy()
  }
}
async function allObjects(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes)
  const parts = pdf.context
    .enumerateIndirectObjects()
    .flatMap(([, obj]) =>
      obj instanceof PDFRawStream
        ? [obj.dict.toString(), Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1')]
        : [obj.toString()],
    )
  return Buffer.from(bytes).toString('latin1') + '\n' + parts.join('\n')
}
async function fixture() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([300, 200])
  page.drawText('PUBLIC SECRET PUBLIC', { x: 20, y: 90, size: 18, font })
  page.node.addContentStream(
    pdf.context.register(
      PDFRawStream.of(PDFDict.withContext(pdf.context), Buffer.from('% SECRET-STREAM-SENTINEL\n')),
    ),
  )
  // Unreferenced objects must not survive in the downloaded full copy either.
  pdf.context.register(
    PDFRawStream.of(PDFDict.withContext(pdf.context), Buffer.from('SECRET-ORPHAN')),
  )
  pdf.addPage([300, 200]).drawText('SECOND PAGE PRESERVED', { x: 20, y: 90, size: 18, font })
  return pdf.save({ useObjectStreams: false })
}

it('uses strict private schema with bounded ordered user-space rectangles', () => {
  const valid = { op: 'redact_copy', regions: [region] }
  expect(pdfLocalOperationSchema.safeParse(valid).success).toBe(true)
  for (const invalid of [
    { ...valid, unknown: true },
    { ...valid, regions: [] },
    { ...valid, regions: Array.from({ length: 101 }, () => region) },
    { ...valid, regions: [{ ...region, extra: true }] },
    { ...valid, regions: [{ ...region, pageIndex: 0.5 }] },
    { ...valid, regions: [{ ...region, rect: [1, 2, 1, 3] }] },
    { ...valid, regions: [{ ...region, rect: [3, 2, 1, 3] }] },
    { ...valid, regions: [{ ...region, rect: [1, 2, Infinity, 3] }] },
  ])
    expect(pdfLocalOperationSchema.safeParse(invalid).success).toBe(false)
})

it('removes actual characters and all obsolete encoded streams without publishing working bytes', async () => {
  const before = await fixture(),
    checksum = createHash('sha256').update(before).digest('hex')
  expect(await allObjects(before)).toContain('SECRET-STREAM-SENTINEL')
  expect(await allObjects(before)).toContain('534543524554') // original font-encoded SECRET
  const result = await applyPdfLocalOperation(before, { op: 'redact_copy', regions: [region] })
  expect(Object.keys(result)).toEqual(['outputs'])
  expect(result.outputs).toHaveLength(1)
  expect(result.outputs![0]!.name).toBe('document-redacted.pdf')
  const out = result.outputs![0]!.bytes
  const content = await text(out)
  expect(content[0]).toContain('PUBLI')
  expect(content[0]).toMatch(/PUBLIC$/)
  expect(content[0]).not.toContain('SECRET')
  expect(content[1]).toBe('SECOND PAGE PRESERVED')
  const everyObject = await allObjects(out)
  for (const marker of ['SECRET', '534543524554', '005300450043005200450054'])
    expect(everyObject.toUpperCase()).not.toContain(marker.toUpperCase())
  expect(createHash('sha256').update(before).digest('hex')).toBe(checksum)
})

it('removes ActualText and hit annotation payloads from all objects', async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([300, 200]),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('PUBLIC', { x: 20, y: 30, size: 18, font })
  page.node.addContentStream(
    pdf.context.register(
      PDFRawStream.of(
        PDFDict.withContext(pdf.context),
        Buffer.from(
          `/Span << /ActualText (SECRET-ACTUAL) >> BDC\nBT /${font.name} 18 Tf 1 0 0 1 20 100 Tm (SECRET-ACTUAL) Tj ET\nEMC\n`,
        ),
      ),
    ),
  )
  const annotation = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [20, 80, 180, 125],
      Contents: PDFString.of('SECRET-ANNOT'),
    }),
  )
  page.node.set(PDFName.of('Annots'), pdf.context.obj([annotation]))
  const before = await pdf.save({ useObjectStreams: false })
  expect(await allObjects(before)).toContain('SECRET-ACTUAL')
  expect(await allObjects(before)).toContain('SECRET-ANNOT')
  const out = await redact(before, [{ pageIndex: 0, rect: [18, 80, 180, 125] }])
  expect(await text(out)).toEqual(['PUBLIC'])
  expect(await allObjects(out)).not.toContain('SECRET')
})

async function imageFixture(shared = false, form = false) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([100, 100])
  const pixels = new Uint8Array(8 * 8 * 3)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) pixels.set(x < 4 ? [255, 0, 0] : [0, 0, 255], (y * 8 + x) * 3)
  const ref = pdf.context.register(
    PDFRawStream.of(
      pdf.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: 8,
        Height: 8,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
      }),
      pixels,
    ),
  )
  const name = page.node.newXObject('Image', ref)
  const stream = Buffer.from(`q\n80 0 0 80 10 10 cm\n${name.toString()} Do\nQ\n`)
  if (form) {
    const imageForm = pdf.context.register(
      PDFRawStream.of(
        pdf.context.obj({
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, 100, 100],
          Resources: { XObject: { [name.decodeText()]: ref } },
        }),
        stream,
      ),
    )
    const formName = page.node.newXObject('Form', imageForm)
    page.node.addContentStream(
      pdf.context.register(
        PDFRawStream.of(PDFDict.withContext(pdf.context), Buffer.from(`${formName.toString()} Do`)),
      ),
    )
  } else
    page.node.addContentStream(
      pdf.context.register(PDFRawStream.of(PDFDict.withContext(pdf.context), stream)),
    )
  if (shared) {
    const second = pdf.addPage([100, 100]),
      other = second.node.newXObject('Shared', ref)
    second.node.addContentStream(
      pdf.context.register(
        PDFRawStream.of(
          PDFDict.withContext(pdf.context),
          Buffer.from(`q 80 0 0 80 10 10 cm ${other.toString()} Do Q`),
        ),
      ),
    )
  }
  return pdf.save({ useObjectStreams: false })
}

it('rewrites selected image pixels, preserving blue pixels and omitting the original image stream', async () => {
  const out = await redact(await imageFixture(), [{ pageIndex: 0, rect: [10, 10, 50, 90] }])
  const pdf = await PDFDocument.load(out)
  const images = pdf.context
    .enumerateIndirectObjects()
    .flatMap(([, obj]) =>
      obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image'
        ? [decodePDFRawStream(obj).decode()]
        : [],
    )
  expect(images).toHaveLength(1)
  expect(images[0]).toHaveLength(192)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      expect(Array.from(images[0]!.slice((y * 8 + x) * 3, (y * 8 + x + 1) * 3))).toEqual(
        x < 4 ? [255, 255, 255] : [0, 0, 255],
      )
})

it('atomically rejects a trailing shared image or image-bearing Form', async () => {
  await expect(
    redact(await imageFixture(true), [
      { pageIndex: 0, rect: [1, 1, 2, 2] },
      { pageIndex: 1, rect: [10, 10, 50, 90] },
    ]),
  ).rejects.toThrow('shared image')
  await expect(
    redact(await imageFixture(false, true), [{ pageIndex: 0, rect: [10, 10, 50, 90] }]),
  ).rejects.toThrow('Form XObject')
})

describe('geometry, unsupported structures and cancellation', () => {
  it('preflights all page indices and exact CropBox bounds for all four rotations', async () => {
    const original = await fixture()
    await expect(redact(original, [region, { pageIndex: 99, rect: [1, 1, 2, 2] }])).rejects.toThrow(
      '页码',
    )
    for (const angle of [0, 90, 180, 270]) {
      const pdf = await PDFDocument.load(original),
        page = pdf.getPage(0)
      page.setCropBox(40, 30, 200, 140)
      page.setRotation(degrees(angle))
      const bytes = await pdf.save()
      await expect(redact(bytes, [{ pageIndex: 0, rect: [39, 40, 50, 50] }])).rejects.toThrow(
        '裁剪框',
      )
      expect((await text(await redact(bytes, [region])))[0]).not.toContain('SECRET')
    }
  })
  it('keeps the strict Catalog guard and refuses authoring side channels on target pages', async () => {
    for (const name of ['AcroForm', 'Outlines', 'Names', 'Unknown']) {
      const pdf = await PDFDocument.load(await fixture())
      pdf.catalog.set(PDFName.of(name), pdf.context.obj({ Fields: [] }))
      await expect(redact(await pdf.save())).rejects.toThrow('文档结构')
    }
    for (const name of ['MimirDrawings', 'MimirWatermark', 'MimirHeaderFooter']) {
      const pdf = await PDFDocument.load(await fixture())
      pdf.getPage(0).node.set(PDFName.of(name), PDFString.of('SECRET-CACHE'))
      await expect(redact(await pdf.save())).rejects.toThrow('图层缓存')
    }
    const pdf = await PDFDocument.load(await fixture())
    const widget = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        Rect: [78, 84, 145, 112],
        V: PDFString.of('SECRET-FORM'),
      }),
    )
    pdf.getPage(0).node.set(PDFName.of('Annots'), pdf.context.obj([widget]))
    await expect(redact(await pdf.save())).rejects.toThrow('form field')
  })
  it('returns no output on already aborted or preparation cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(redact(await fixture(), [region], controller.signal)).rejects.toThrow(/aborted/i)
    const second = new AbortController(),
      bytes = await fixture()
    const pending = redact(bytes, [region], second.signal)
    queueMicrotask(() => second.abort())
    await expect(pending).rejects.toThrow(/aborted/i)
  })
})

it('rejects off-region replies and popups that retain removed annotation contents', async () => {
  const pdf = await PDFDocument.load(await fixture()),
    page = pdf.getPage(0)
  const note = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [78, 84, 145, 112],
      Contents: PDFString.of('SECRET-ROOT'),
    }),
  )
  const reply = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [200, 120, 220, 140],
      IRT: note,
      Contents: PDFString.of('REPLY'),
    }),
  )
  const popup = pdf.context.register(
    pdf.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [200, 140, 220, 160], Parent: note }),
  )
  page.node.set(PDFName.of('Annots'), pdf.context.obj([note, reply, popup]))
  const before = await pdf.save()
  // Related annotation graphs cannot be treated as unrelated off-region notes.
  await expect(redact(before)).rejects.toThrow('批注回复或弹窗')
})

it('refuses marked-content property side channels in Resources', async () => {
  const pdf = await PDFDocument.load(await fixture()),
    page = pdf.getPage(0)
  const resources = page.node.Resources()!
  resources.set(
    PDFName.of('Properties'),
    pdf.context.obj({ Sensitive: { ActualText: PDFString.of('SECRET-PROPERTY') } }),
  )
  await expect(redact(await pdf.save())).rejects.toThrow('标记内容属性或资源缓存')
})

it('removes selected text inside ordinary Form XObjects from all streams', async () => {
  const source = await PDFDocument.create(),
    font = await source.embedFont(StandardFonts.Helvetica)
  source.addPage([300, 200]).drawText('PUBLIC SECRET PUBLIC', { x: 20, y: 90, size: 18, font })
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([300, 200])
  const embedded = await pdf.embedPdf(await source.save())
  page.drawPage(embedded[0]!)
  const before = await pdf.save()
  expect((await text(before))[0]).toContain('SECRET')
  const output = await redact(before)
  expect((await text(output))[0]).not.toContain('SECRET')
  const objects = await allObjects(output)
  expect(objects).not.toContain('534543524554')
  expect(objects).not.toContain('SECRET')
})

it('rejects signatures outside AcroForm and unverified private page geometry', async () => {
  for (const values of [{ Type: 'Sig' }, { FT: 'Sig' }, { ByteRange: [0, 2, 4, 8] }]) {
    const pdf = await PDFDocument.load(await fixture())
    pdf.context.register(pdf.context.obj(values))
    await expect(redact(await pdf.save())).rejects.toThrow('签名')
  }
  const pdf = await PDFDocument.load(await fixture())
  pdf
    .getPage(0)
    .node.set(PDFName.of('Metadata'), pdf.context.obj({ PrivateText: PDFString.of('SECRET') }))
  await expect(redact(await pdf.save())).rejects.toThrow('页面属性')
  pdf.getPage(0).node.delete(PDFName.of('Metadata'))
  pdf.getPage(0).node.set(PDFName.of('UserUnit'), pdf.context.obj(2))
  await expect(redact(await pdf.save())).rejects.toThrow('自定义页面单位')
})

it('checks all regions before modifying either page and enforces native work budgets', async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([300, 200])
  page.drawText('SECRET-ONE', { x: 20, y: 130, size: 18, font })
  page.drawText('SECRET-TWO', { x: 20, y: 60, size: 18, font })
  page.drawText('PUBLIC', { x: 20, y: 20, size: 18, font })
  const bytes = await pdf.save()
  const regions = [
    { pageIndex: 0, rect: [18, 125, 150, 155] as [number, number, number, number] },
    { pageIndex: 0, rect: [18, 55, 150, 85] as [number, number, number, number] },
  ]
  const out = await redact(bytes, regions)
  expect(await text(out)).toEqual(['PUBLIC'])
  expect(await allObjects(out)).not.toContain('SECRET')
  for (let i = 1; i < 101; i++) pdf.addPage([300, 200])
  await expect(
    redact(
      await pdf.save(),
      Array.from({ length: 100 }, () => regions[0]!),
    ),
  ).rejects.toThrow('处理预算')
})

it('refuses unverified mask and patterned side resources before native mutation', async () => {
  for (const name of ['SMask', 'Mask', 'Pattern', 'Shading']) {
    const pdf = await PDFDocument.load(await imageFixture()),
      page = pdf.getPage(0)
    page.node
      .Resources()!
      .set(PDFName.of(name), pdf.context.obj({ Private: PDFString.of('SECRET-MASK') }))
    await expect(
      redact(await pdf.save(), [{ pageIndex: 0, rect: [10, 10, 50, 90] }]),
    ).rejects.toThrow('遮罩或图案资源')
  }
})
