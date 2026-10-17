import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { pdfBatchArgsSchema, pdfLocalOperationSchema } from '@mimir/shared'
import { applyPdfLocalOperation as apply } from '../services/pdf-local.js'
import { applyPdfAnnotationOperation, readPdfAnnotations } from '../services/pdf-annotations.js'
import { applyPdfTextInserts } from '../services/pdf-agent-host.js'
import { pdfAtomicBatchFixture, pdfNativeContentStreams } from './pdf-atomic-batch-fixture.js'

describe('PDF sequential native atomic batch', () => {
  it('preserves the native outline graph when page ownership does not change', async () => {
    const { bytes } = await pdfAtomicBatchFixture({ form: true })
    const pdf = await PDFDocument.load(bytes)
    const root = pdf.context.obj({ Type: 'Outlines' })
    const rootRef = pdf.context.register(root)
    const item = pdf.context.obj({
      Title: PDFString.of('Keep exact destination and appearance'),
      Parent: rootRef,
      A: { S: 'GoTo', D: [pdf.getPage(0).ref, 'XYZ', 40, 300, 1.5] },
      C: [0.1, 0.4, 0.7],
      F: 3,
    })
    const itemRef = pdf.context.register(item)
    root.set(PDFName.of('First'), itemRef)
    root.set(PDFName.of('Last'), itemRef)
    root.set(PDFName.of('Count'), pdf.context.obj(1))
    pdf.catalog.set(PDFName.of('Outlines'), rootRef)
    pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
    const input = await pdf.save({ updateFieldAppearances: false })
    const result = await apply(input, {
      op: 'apply_ops',
      ops: [
        { op: 'setNoteContents', id: 'Nroot', contents: 'only the note changes' },
        { op: 'removeMarkup', id: 'Mhighlight' },
        { op: 'setMetadata', metadata: { title: 'new title' } },
        { op: 'setFormValue', value: { name: 'agree', checked: true } },
        { op: 'rotatePages', pages: [1], dir: 90 },
      ],
    })
    const after = await PDFDocument.load(result.bytes!)
    expect(after.catalog.get(PDFName.of('Outlines'))?.toString()).toBe(rootRef.toString())
    expect(after.context.lookup(rootRef)?.toString()).toBe(root.toString())
    expect(after.context.lookup(itemRef)?.toString()).toBe(item.toString())
    expect(after.catalog.get(PDFName.of('PageMode'))?.toString()).toBe('/UseOutlines')
  })

  it('mutates forms, annotations, metadata and pages in one graph, preserving native content', async () => {
    const { bytes } = await pdfAtomicBatchFixture({ form: true })
    const original = bytes.slice()
    const streams = await pdfNativeContentStreams(bytes)
    const result = await apply(bytes, {
      op: 'apply_ops',
      ops: [
        { op: 'setNoteContents', id: 'Nreply', contents: '已核对回复' },
        { op: 'removeMarkup', id: 'Mhighlight' },
        { op: 'setFormValue', value: { name: 'agree', checked: true } },
        { op: 'setMetadata', metadata: { title: 'atomic title' } },
        { op: 'setPageOrder', order: [2, 1, 3] },
        { op: 'rotatePages', pages: [2], dir: 90 },
        { op: 'deletePage', page: 3 },
      ],
    })
    expect(bytes).toEqual(original)
    const pdf = await PDFDocument.load(result.bytes!)
    expect(pdf.getPageCount()).toBe(2)
    expect(pdf.getPage(1).getRotation().angle).toBe(90)
    expect(pdf.getForm().getCheckBox('agree').isChecked()).toBe(true)
    expect(pdf.getTitle()).toBe('atomic title')
    expect((await readPdfAnnotations(result.bytes!)).annotations).toEqual([
      { id: 'Nroot', page: 2, type: 'note', text: 'old note', author: 'admin' },
      { id: 'Nreply', page: 2, type: 'note', text: '已核对回复', author: '', parentId: 'Nroot' },
    ])
    expect(await pdfNativeContentStreams(result.bytes!)).toEqual([streams[1], streams[0]])
    const links = pdf
      .getPage(1)
      .node.lookup(PDFName.of('Annots'), PDFArray)
      .asArray()
      .map((ref) => pdf.context.lookup(ref))
      .filter(
        (value): value is PDFDict =>
          value instanceof PDFDict && value.lookup(PDFName.of('Subtype'))?.toString() === '/Link',
      )
    expect(links).toHaveLength(1)
    expect(links[0]!.lookup(PDFName.of('Rect'), PDFArray).toString()).toBe('[ 80 200 110 230 ]')
    expect(links[0]!.lookup(PDFName.of('Dest'), PDFArray).get(0).toString()).toBe(
      pdf.getPage(0).ref.toString(),
    )
    await expect(
      applyPdfAnnotationOperation(
        bytes,
        { op: 'edit_note', pageIndex: 0, note_id: 'Nroot', text: 'unsafe default' },
        (await readPdfAnnotations(bytes)).sha256,
      ),
    ).rejects.toThrow('文档结构')
    await expect(
      applyPdfTextInserts(bytes, [
        { pageIndex: 0, origin: [30, 100], text: 'unsafe', fontSize: 12, color: [0, 0, 0] },
      ]),
    ).rejects.toThrow('文档结构')
  })

  it('uses current page ownership and final note value, including legacy IDs', async () => {
    const { bytes, rootId } = await pdfAtomicBatchFixture({ legacy: true })
    const result = await apply(bytes, {
      op: 'apply_ops',
      ops: [
        { op: 'setPageOrder', order: [2, 3, 1] },
        { op: 'setNoteContents', id: rootId, contents: 'first' },
        { op: 'setNoteContents', id: rootId, contents: 'last' },
      ],
    })
    expect(
      (await readPdfAnnotations(result.bytes!)).annotations.find((a) => a.id === rootId),
    ).toMatchObject({ page: 3, text: 'last' })
    const removedPage = await apply(bytes, {
      op: 'apply_ops',
      ops: [
        { op: 'setNoteContents', id: rootId, contents: 'then delete' },
        { op: 'deletePage', page: 1 },
      ],
    })
    expect((await readPdfAnnotations(removedPage.bytes!)).annotations).toEqual([])
    await expect(
      apply(bytes, {
        op: 'apply_ops',
        ops: [
          { op: 'deletePage', page: 1 },
          { op: 'setNoteContents', id: rootId, contents: 'too late' },
        ],
      }),
    ).rejects.toThrow('第 2 项')
  })

  it('discards every earlier change on bad targets, duplicate consumption or a late invalid page', async () => {
    const { bytes } = await pdfAtomicBatchFixture()
    const before = bytes.slice()
    for (const ops of [
      [
        { op: 'setNoteContents', id: 'Nroot', contents: 'candidate' },
        { op: 'removeMarkup', id: 'missing' },
      ],
      [
        { op: 'removeMarkup', id: 'Mhighlight' },
        { op: 'removeMarkup', id: 'Mhighlight' },
      ],
      [{ op: 'removeMarkup', id: 'Nroot' }],
      [{ op: 'setNoteContents', id: 'Mhighlight', contents: 'wrong type' }],
      [
        { op: 'setMetadata', metadata: { title: 'candidate' } },
        { op: 'deletePage', page: 99 },
      ],
      [{ op: 'rotatePages', pages: [1, 1], dir: 90 }],
    ]) {
      await expect(apply(bytes, { op: 'apply_ops', ops } as never)).rejects.toThrow('PDF 批次')
      expect(bytes).toEqual(before)
    }
    const dry = await apply(bytes, {
      op: 'apply_ops',
      dry_run: true,
      ops: [
        { op: 'removeMarkup', id: 'Mhighlight' },
        { op: 'setMetadata', metadata: { title: 'only candidate' } },
      ],
    })
    expect(dry.bytes).toBeUndefined()
    expect(dry.info?.metadata.title).toBe('only candidate')
    expect(bytes).toEqual(before)
  })

  it('keeps preserving guards and strict schemas, including cancellation', async () => {
    const { bytes } = await pdfAtomicBatchFixture()
    for (const name of ['UnknownRoot', 'OpenAction']) {
      const pdf = await PDFDocument.load(bytes)
      pdf.catalog.set(PDFName.of(name), PDFString.of('unsafe'))
      await expect(
        apply(await pdf.save(), {
          op: 'apply_ops',
          ops: [{ op: 'removeMarkup', id: 'Mhighlight' }],
        }),
      ).rejects.toThrow('文档结构')
    }
    const pdf = await PDFDocument.load(bytes)
    pdf.context.register(pdf.context.obj({ Type: 'Sig', ByteRange: [0, 1, 2, 3] }))
    await expect(
      apply(await pdf.save(), {
        op: 'apply_ops',
        ops: [{ op: 'setNoteContents', id: 'Nroot', contents: 'no' }],
      }),
    ).rejects.toThrow('签名')
    const controller = new AbortController()
    controller.abort()
    await expect(
      apply(
        bytes,
        { op: 'apply_ops', ops: [{ op: 'setMetadata', metadata: { title: 'cancel' } }] },
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow(/abort/i)
    for (const op of [
      { op: 'setNoteContents', id: 'Nroot', contents: ' ' },
      { op: 'removeMarkup', id: 'Mhighlight', extra: true },
      { op: 'removeTextInsert', id: 'T1' },
    ])
      expect(pdfLocalOperationSchema.safeParse({ op: 'apply_ops', ops: [op] }).success).toBe(false)
    expect(
      pdfBatchArgsSchema.safeParse({ ops: [{ op: 'removeTextInsert', id: 'T1' }] }).success,
    ).toBe(true)
    expect(
      pdfBatchArgsSchema.safeParse({ ops: [{ op: 'removeTextInsert', id: 'T1' }], extra: true })
        .success,
    ).toBe(false)
  })
})
