import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
import { readPdfPages, type PdfPageRef } from '../editors/pdf-pages.js'
import { buildPdfWorkingCopy } from './pdf-working-copy.js'
import type { PdfHostLocal } from './pdf-local-agent.js'
const host: PdfHostLocal = async ({ bytes, operation, assetFile, expectedVersion }) => {
  const result = await applyPdfLocalOperation(
    bytes,
    operation,
    assetFile ? new Uint8Array(await assetFile.arrayBuffer()) : undefined,
  )
  return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
}
async function fixture() {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('Target first')
  pdf.addPage([500, 700]).drawText('Target second')
  const field = pdf.getForm().createTextField('targetField')
  field.setText('Kept value')
  field.addToPage(pdf.getPage(0), { x: 40, y: 400, width: 100, height: 24 })
  const bytes = await pdf.save()
  const refs: PdfPageRef[] = (await readPdfPages(bytes)).map((p, index) => ({
    origin: { kind: 'original', index },
    rotation: p.rotation,
    base: { width: p.width, height: p.height },
    crop: null,
    paper: null,
  }))
  return { bytes, refs }
}
describe('preserving PDF working-copy materialization', () => {
  it('maps selected imported pages, repeated references, blank size and original fields without writing the input', async () => {
    const { bytes, refs } = await fixture(),
      original = bytes.slice()
    const source = await PDFDocument.create()
    source.addPage([100, 200])
    source.addPage([200, 300])
    source.addPage([300, 400])
    const imported = {
      origin: { kind: 'imported', source: 'selected', index: 2 },
      rotation: 0,
      base: { width: 300, height: 400 },
      crop: { top: 10, right: 10, bottom: 10, left: 10 },
      paper: null,
    } satisfies PdfPageRef
    const layout: PdfPageRef[] = [
      refs[0]!,
      imported,
      { ...imported, crop: null },
      {
        origin: { kind: 'blank' },
        rotation: 90,
        base: { width: 200, height: 400 },
        crop: null,
        paper: null,
      },
      refs[1]!,
    ]
    const result = await buildPdfWorkingCopy({
      bytes,
      layout,
      imports: new Map([['selected', await source.save()]]),
      host,
      version: 4,
      assertCurrent() {},
    })
    const read = await PDFDocument.load(result)
    expect(read.getPageCount()).toBe(5)
    expect(read.getPages().map((p) => p.getCropBox().width)).toEqual([400, 280, 300, 200, 500])
    expect(read.getPage(3).getRotation().angle).toBe(90)
    expect(read.getForm().getTextField('targetField').getText()).toBe('Kept value')
    expect(read.getForm().getTextField('targetField').acroField.getWidgets()).toHaveLength(1)
    expect(bytes).toEqual(original)
  })

  it('imports internal links onto actual inserted page refs and omits destinations outside the selected source', async () => {
    const { bytes } = await fixture()
    const source = await PDFDocument.create()
    for (let i = 0; i < 3; i++) source.addPage([200, 300])
    for (const index of [1, 2])
      source.getPage(0).node.addAnnot(
        source.context.register(
          source.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [10 + index * 10, 10, 20 + index * 10, 20],
            P: source.getPage(0).ref,
            Dest: [source.getPage(index).ref, PDFName.of('Fit')],
          }),
        ),
      )
    const imported = await applyPdfLocalOperation(
      bytes,
      { op: 'import_pages', after_page: 1, source_pages: '1-2' },
      await source.save(),
    )
    const read = await PDFDocument.load(imported.bytes!)
    expect(read.getPageCount()).toBe(4)
    const annots = read.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray)
    expect(annots.size()).toBe(1)
    const link = annots.lookup(0, PDFDict)
    expect(link.get(PDFName.of('P'))?.toString()).toBe(read.getPage(1).ref.toString())
    expect(link.lookup(PDFName.of('Dest'), PDFArray).get(0).toString()).toBe(
      read.getPage(2).ref.toString(),
    )
    expect(
      read.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFDict && object.lookup(PDFName.of('Type'))?.toString() === '/Page',
        ),
    ).toHaveLength(4)
  })
  it('rejects a late host result before returning bytes for publication', async () => {
    const { bytes, refs } = await fixture()
    let stale = false
    await expect(
      buildPdfWorkingCopy({
        bytes,
        layout: [refs[0]!, { ...refs[0]!, paper: { width: 200, height: 300 } }, refs[1]!],
        imports: new Map(),
        version: 1,
        host: async (request) => {
          const result = await host(request)
          stale = true
          return result
        },
        assertCurrent() {
          if (stale) throw new Error('Current canvas changed')
        },
      }),
    ).rejects.toThrow('Current canvas changed')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })
})
