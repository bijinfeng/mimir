import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { buildPdfBytes, readPdfPages, type PdfPageRef } from '../editors/pdf-pages.js'
import type { PdfTextIndex } from '../editors/pdf-text.js'
import { PdfAgentHandle, type PdfAgentSnapshot, type PdfPendingTextInsert } from './pdf-agent.js'

async function fixture() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of ['FIRST', 'SECOND', 'THIRD']) {
    const page = doc.addPage([300, 400])
    page.drawText(text, { x: 40, y: 300, font })
  }
  const bytes = await doc.save()
  const entries = await readPdfPages(bytes)
  const pages: PdfPageRef[] = entries.map((entry, index) => ({
    origin: { kind: 'original', index },
    rotation: entry.rotation,
    base: { width: entry.width, height: entry.height },
    crop: null,
    paper: null,
  }))
  return { bytes, pages }
}

function harness(bytes: Uint8Array, initial: PdfPageRef[]) {
  let pages = initial
  let at = 0
  let currentBytes = bytes
  let pendingBase = bytes
  let pending: PdfPendingTextInsert[] = []
  const writePending = async (next: readonly PdfPendingTextInsert[]) => {
    const doc = await PDFDocument.load(pendingBase)
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (const insert of next)
      doc.getPage(insert.pageIndex).drawText(insert.text, {
        x: insert.x,
        y: 400 - insert.y - insert.fontSize,
        size: insert.fontSize,
        font,
      })
    currentBytes = next.length === 0 ? pendingBase : await doc.save()
    pending = [...next]
  }
  const handle = new PdfAgentHandle('pdf-1', {
    snapshot: (): PdfAgentSnapshot => ({
      bytes: currentBytes,
      pages,
      activePage: at,
      dirty: pages !== initial || currentBytes !== bytes,
    }),
    applyPages: (next) => {
      pages = next
    },
    gotoPage: (index) => {
      at = index
    },
    textIndex: async (): Promise<PdfTextIndex> => ({
      pages: pages.map((_, page) => ({ page, text: `page ${page + 1}`, chunks: [], starts: [] })),
      pagesWithText: pages.length,
    }),
    insertText: async (input) => {
      if (pending.length === 0) pendingBase = currentBytes
      const insert = {
        id: `T${pending.length + 1}`,
        pageIndex: input.pageIndex,
        x: input.origin?.[0] ?? input.x ?? 0,
        y: input.origin ? 400 - input.origin[1] - input.fontSize : (input.y ?? 0),
        text: input.text,
        fontSize: input.fontSize,
        color: input.color,
      }
      await writePending([...pending, insert])
      return insert
    },
    pendingTextInserts: () => pending,
    replaceTextInserts: async (next) => writePending(next),
    captureState: () => ({ pages, currentBytes, pendingBase, pending }),
    restoreState: (state) => {
      const before = state as {
        pages: PdfPageRef[]
        currentBytes: Uint8Array
        pendingBase: Uint8Array
        pending: PdfPendingTextInsert[]
      }
      pages = before.pages
      currentBytes = before.currentBytes
      pendingBase = before.pendingBase
      pending = before.pending
    },
  })
  return { handle, pages: () => pages, bytes: () => currentBytes }
}

describe('PDF Agent page canvas', () => {
  it('applies a page batch atomically and saves bytes readable by pdf.js', async () => {
    const { bytes, pages } = await fixture()
    const { handle, pages: current } = harness(bytes, pages)
    const failed = await handle.execute('apply_ops', {
      ops: [{ op: 'rotatePages', pages: [1], dir: 90 }, { op: 'unknown' }],
    })
    expect(failed).toMatchObject({ ok: false, changed: false })
    expect(current()).toEqual(pages)

    const result = await handle.execute(
      'apply_ops',
      {
        ops: [
          { op: 'rotatePages', pages: [1], dir: 90 },
          { op: 'deletePage', page: 2 },
          { op: 'setPageOrder', order: [2, 1] },
        ],
      },
      { expectedVersion: 1 },
    )
    expect(result).toMatchObject({ ok: true, changed: true, version: 2 })
    const saved = await buildPdfBytes({ bytes, layout: current(), imports: new Map() })
    const task = getDocument({ data: saved.slice() })
    const reopened = await task.promise
    expect(reopened.numPages).toBe(2)
    const texts = []
    for (let n = 1; n <= reopened.numPages; n++) {
      const content = await (await reopened.getPage(n)).getTextContent()
      texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(''))
    }
    expect(texts).toEqual(['THIRD', 'FIRST'])
    await task.destroy()
    const pdfLibRead = await PDFDocument.load(saved)
    expect(pdfLibRead.getPages()[1]?.getRotation().angle).toBe(90)
  })

  it('rolls back all writes in one round and protects later manual edits', async () => {
    const { bytes, pages } = await fixture()
    const { handle, pages: current } = harness(bytes, pages)
    expect(
      (
        await handle.execute(
          'apply_ops',
          { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] },
          { roundId: 'a' },
        )
      ).ok,
    ).toBe(true)
    expect(
      (
        await handle.execute(
          'apply_ops',
          { ops: [{ op: 'deletePage', page: 2 }] },
          { roundId: 'a' },
        )
      ).ok,
    ).toBe(true)
    expect(handle.undoRound('a')).toBe(true)
    expect(current()).toEqual(pages)
    expect(
      (
        await handle.execute(
          'apply_ops',
          { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] },
          { roundId: 'b' },
        )
      ).ok,
    ).toBe(true)
    handle.markManualChange()
    expect(handle.undoRound('b')).toBe(false)
    expect(current()[0]?.rotation).toBe(90)
    const stale = await handle.execute(
      'apply_ops',
      { ops: [{ op: 'deletePage', page: 1 }] },
      { expectedVersion: 1 },
    )
    expect(stale.error).toContain('版本')
  })

  it('updates navigation context immediately and rejects invalid pages', async () => {
    const { bytes, pages } = await fixture()
    const { handle } = harness(bytes, pages)
    expect((await handle.execute('goto_page', { page: 3 })).ok).toBe(true)
    expect(handle.getContext().currentPage).toBe(3)
    expect((await handle.execute('goto_page', { page: 0 })).ok).toBe(false)
    handle.dispose()
    expect((await handle.execute('goto_page', { page: 1 })).ok).toBe(false)
  })

  it('inserts through the content hook, rejects a stale version and rolls back its round', async () => {
    const { bytes, pages } = await fixture()
    const current = harness(bytes, pages)
    const result = await current.handle.execute(
      'insert_text',
      { page: 1, text: 'AGENT', x: 45, y: 60 },
      { expectedVersion: 1, roundId: 'text-round' },
    )
    expect(result).toMatchObject({ ok: true, changed: true, version: 2 })
    expect(
      (
        await current.handle.execute('insert_text', {
          page: 1,
          text: 'PRIVATE',
          origin: [45, 300],
        })
      ).ok,
    ).toBe(false)
    const task = getDocument({ data: current.bytes().slice() })
    const doc = await task.promise
    const content = await (await doc.getPage(1)).getTextContent()
    expect(content.items.map((item) => ('str' in item ? item.str : '')).join('')).toContain('AGENT')
    await task.destroy()
    expect(
      (
        await current.handle.execute(
          'insert_text',
          { page: 1, text: 'STALE', x: 45, y: 60 },
          { expectedVersion: 1 },
        )
      ).ok,
    ).toBe(false)
    expect(current.handle.undoRound('text-round')).toBe(true)
    expect(current.bytes()).toEqual(bytes)
  })

  it('lists, edits, moves and deletes only pending inserted text, with independently readable bytes', async () => {
    const { bytes, pages } = await fixture()
    const current = harness(bytes, pages)
    const inserted = await current.handle.execute('insert_text', {
      page: 1,
      text: 'DRAFT',
      x: 45,
      y: 60,
    })
    expect(inserted).toMatchObject({ ok: true, changed: true, data: { id: 'T1' } })
    expect((await current.handle.execute('list_inserted_text', {})).data).toMatchObject({
      inserts: [{ id: 'T1', page: 1, text: 'DRAFT', x: 45, y: 60 }],
    })
    expect(
      (await current.handle.execute('move_inserted_text', { id: 'T1', dx: 30, dy: 20 })).ok,
    ).toBe(true)
    expect(
      (
        await current.handle.execute('edit_inserted_text', {
          id: 'T1',
          text: 'FINAL',
          font_size: 18,
        })
      ).ok,
    ).toBe(true)
    const task = getDocument({ data: current.bytes().slice() })
    const read = await task.promise
    const content = await (await read.getPage(1)).getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join('')
    expect(text).toContain('FINAL')
    expect(text).not.toContain('DRAFT')
    await task.destroy()
    expect((await current.handle.execute('delete_inserted_text', { id: 'T1' })).ok).toBe(true)
    expect(current.bytes()).toEqual(bytes)
    expect((await current.handle.execute('list_inserted_text', {})).data).toEqual({ inserts: [] })
    expect(
      (await current.handle.execute('edit_inserted_text', { id: 'T1', text: 'LATE' })).ok,
    ).toBe(false)
  })
})
