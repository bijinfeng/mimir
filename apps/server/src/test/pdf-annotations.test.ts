import { createHash } from 'node:crypto'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { applyPdfAnnotationOperation, readPdfAnnotations } from '../services/pdf-annotations.js'
import {
  applyPdfVerifiedMarkup,
  applyPdfVerifiedTextEdit,
  inspectPdfTextTarget,
} from '../services/pdf-agent-host.js'
import type { PdfAnnotationOperation } from '@mimir/shared'

async function fixture() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
  return pdf.save()
}
async function annotations(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice() })
  try {
    return await (await (await task.promise).getPage(1)).getAnnotations()
  } finally {
    await task.destroy()
  }
}
async function apply(bytes: Uint8Array, op: PdfAnnotationOperation) {
  return applyPdfAnnotationOperation(bytes, op, (await readPdfAnnotations(bytes)).sha256)
}

describe('PDF annotation byte executor', () => {
  it('persists Unicode notes and reply identities across two saves and edits, with independent readers', async () => {
    const base = await fixture()
    const added = await apply(base, {
      op: 'add_note',
      pageIndex: 0,
      text: '审查原文',
      x: 40,
      y: 60,
    })
    const root = added.annotations.annotations[0]!
    expect(root).toMatchObject({ type: 'note', text: '审查原文', page: 1 })
    const replied = await apply(added.bytes, {
      op: 'reply_note',
      pageIndex: 0,
      note_id: root.id,
      text: '需要修改',
    })
    const reply = replied.annotations.annotations.find((entry) => entry.parentId === root.id)!
    expect(reply.text).toBe('需要修改')
    const edited = await apply(replied.bytes, {
      op: 'edit_note',
      pageIndex: 0,
      note_id: reply.id,
      text: '已核对',
    })
    const savedOnce = await (await PDFDocument.load(edited.bytes)).save()
    const savedTwice = await (await PDFDocument.load(savedOnce)).save()
    const read = await readPdfAnnotations(savedTwice)
    expect(read.annotations).toEqual([{ ...root }, { ...reply, text: '已核对' }])
    expect((await annotations(savedTwice)).map((entry) => entry.contentsObj.str)).toEqual([
      '审查原文',
      '已核对',
    ])
    const pdf = await PDFDocument.load(savedTwice)
    const array = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
    const rootDict = pdf.context.lookup(array.get(0), PDFDict)
    const replyDict = pdf.context.lookup(array.get(1), PDFDict)
    expect(rootDict.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('审查原文')
    expect(replyDict.get(PDFName.of('IRT'))?.toString()).toBe(array.get(0).toString())
    const deleted = await apply(savedTwice, { op: 'delete_note', pageIndex: 0, note_id: root.id })
    expect(deleted.annotations.annotations).toEqual([])
    expect(await annotations(deleted.bytes)).toEqual([])
    expect(await readPdfAnnotations(base)).toMatchObject({ annotations: [] })
  })

  it('removes only identified markups and preserves notes and unrelated annotations', async () => {
    const base = await fixture()
    const target = await inspectPdfTextTarget(base, {
      pageIndex: 0,
      oldText: 'ORIGINAL',
      rect: [35, 295, 125, 316],
    })
    const marked = await applyPdfVerifiedMarkup(base, { target, type: 'highlight' })
    const added = await apply(marked, { op: 'add_note', pageIndex: 0, text: 'keep', x: 20, y: 20 })
    const markup = added.annotations.annotations.find((entry) => entry.type === 'highlight')!
    const result = await apply(added.bytes, {
      op: 'delete_markup',
      pageIndex: 0,
      markup_ids: [markup.id],
    })
    expect(result.annotations.annotations.map((entry) => entry.text)).toEqual(['keep'])
    expect((await annotations(result.bytes)).map((entry) => entry.subtype)).toEqual(['Text'])
    const before = added.bytes.slice()
    await expect(
      apply(added.bytes, { op: 'delete_markup', pageIndex: 0, markup_ids: ['missing'] }),
    ).rejects.toThrow('找不到')
    expect(added.bytes).toEqual(before)
  })

  it('rejects stale hashes, invalid roots, positions and unsafe Catalog without changing input', async () => {
    const base = await fixture()
    const added = await apply(base, { op: 'add_note', pageIndex: 0, text: 'root', x: 20, y: 20 })
    await expect(
      applyPdfAnnotationOperation(
        added.bytes,
        {
          op: 'edit_note',
          pageIndex: 0,
          note_id: added.annotations.annotations[0]!.id,
          text: 'stale',
        },
        (await readPdfAnnotations(base)).sha256,
      ),
    ).rejects.toThrow('原件已变化')
    await expect(
      apply(base, { op: 'add_note', pageIndex: 0, text: 'outside', x: 299, y: 399 }),
    ).rejects.toThrow('范围')
    await expect(
      apply(base, { op: 'reply_note', pageIndex: 0, note_id: 'missing', text: 'no' }),
    ).rejects.toThrow('根批注')
    const pdf = await PDFDocument.load(base)
    pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [] }))
    const unsafe = await pdf.save()
    await expect(
      apply(unsafe, { op: 'add_note', pageIndex: 0, text: 'unsafe', x: 20, y: 20 }),
    ).rejects.toThrow('文档结构')
    expect(createHash('sha256').update(base).digest('hex')).toBe(
      (await readPdfAnnotations(base)).sha256,
    )
  })

  it('deletes a complete text run and keeps previously saved note IDs through PDFium rewriting', async () => {
    const base = await fixture()
    const added = await apply(base, {
      op: 'add_note',
      pageIndex: 0,
      text: 'keep comment',
      x: 20,
      y: 20,
    })
    const probe = {
      pageIndex: 0,
      oldText: 'ORIGINAL',
      rect: [35, 295, 125, 316] as [number, number, number, number],
    }
    const target = await inspectPdfTextTarget(added.bytes, probe)
    const deleted = await applyPdfVerifiedTextEdit(
      added.bytes,
      { ...probe, newText: '', fontSize: 12 },
      target,
    )
    expect((await readPdfAnnotations(deleted)).annotations).toEqual(added.annotations.annotations)
    const task = getDocument({ data: deleted.slice() })
    try {
      expect((await (await (await task.promise).getPage(1)).getTextContent()).items).toEqual([])
    } finally {
      await task.destroy()
    }
  })
})
