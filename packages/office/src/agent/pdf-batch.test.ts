import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pdfAtomicBatchFixture } from '../../../../apps/server/src/test/pdf-atomic-batch-fixture.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
import { applyPdfTextInserts } from '../../../../apps/server/src/services/pdf-agent-host.js'
import { readPdfAnnotations } from '../../../../apps/server/src/services/pdf-annotations.js'
import type { PdfHostApply } from '../editors/PdfEditor.js'
import type { PdfHostLocal } from './pdf-local-agent.js'
import type { PdfHostAnnotations } from './pdf-content-agent.js'
const state = vi.hoisted(() => ({ tasks: [] as PDFDocumentLoadingTask[] }))
vi.mock('../editors/pdf-render.js', () => ({
  loadPdfDocument: async (bytes: Uint8Array) => {
    const task = (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({
      data: bytes.slice(),
    })
    state.tasks.push(task)
    return task.promise
  },
}))
import {
  buildPdfBatchCandidate as build,
  replayPdfPendingText,
  type PdfPendingTextState,
} from './pdf-batch.js'
afterEach(async () => {
  await Promise.all(state.tasks.splice(0).map((task) => task.destroy()))
})
const apply: PdfHostApply = async ({ bytes, items, expectedVersion }) => ({
  bytes: await applyPdfTextInserts(bytes, items as Parameters<typeof applyPdfTextInserts>[1]),
  version: expectedVersion + 1,
})
const local: PdfHostLocal = async ({ bytes, operation, expectedVersion, signal }) => {
  const result = await applyPdfLocalOperation(bytes, operation, undefined, signal)
  return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
}
const annotations: PdfHostAnnotations = async ({ bytes, expectedVersion }) => ({
  annotations: await readPdfAnnotations(bytes),
  version: expectedVersion,
})
const drift: PdfHostLocal = (input) =>
  local({
    ...input,
    operation: { op: 'apply_ops', ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] },
  })
const callbacks = { apply, local, annotations, version: 5, assertCurrent() {} }
async function fixture(rotation = 0, legacy = false) {
  const { bytes: base, rootId } = await pdfAtomicBatchFixture({ rotation, crop: true, legacy })
  const pending: PdfPendingTextState = {
    documentId: 'pdf-batch',
    source: base,
    base,
    inserts: [
      {
        id: 'Tfirst',
        pageIndex: 0,
        x: 30,
        y: 40,
        text: 'REMOVE DRAFT',
        fontSize: 12,
        color: [0, 0, 0],
      },
      {
        id: 'Tsecond',
        pageIndex: 0,
        x: 150,
        y: 150,
        text: 'SURVIVE DRAFT',
        fontSize: 14,
        color: [0, 0, 0],
      },
    ],
  }
  return {
    ...callbacks,
    rootId,
    pending,
    bytes: await replayPdfPendingText({ ...callbacks, base, inserts: pending.inserts }),
  }
}
async function text(bytes: Uint8Array, index = 0) {
  const task = (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({
    data: bytes.slice(),
  })
  state.tasks.push(task)
  return (await (await (await task.promise).getPage(index + 1)).getTextContent()).items.filter(
    (item) => 'str' in item,
  )
}
describe('detached PDF batch candidate', () => {
  it.each([0, 90, 180, 270])(
    'preserves surviving T and viewport origin at Rotate%s/offset CropBox',
    async (rotation) => {
      const frozen = await fixture(rotation)
      const candidate = await build({
        ...frozen,
        args: {
          ops: [
            { op: 'removeTextInsert', id: 'Tfirst' },
            { op: 'setNoteContents', id: 'Nreply', contents: 'new reply' },
            { op: 'removeMarkup', id: 'Mhighlight' },
            { op: 'setMetadata', metadata: { title: 'pending metadata' } },
          ],
        },
      })
      expect(candidate.nextPending?.inserts).toEqual([frozen.pending.inserts[1]])
      const after = await text(candidate.bytes)
      expect(after.map((i) => i.str).join('')).not.toContain('REMOVE DRAFT')
      expect(after.find((i) => i.str === 'SURVIVE DRAFT')!.transform).toEqual(
        (await text(frozen.bytes)).find((i) => i.str === 'SURVIVE DRAFT')!.transform,
      )
      expect((await text(candidate.nextPending!.base)).map((i) => i.str).join('')).not.toContain(
        'DRAFT',
      )
      expect((await PDFDocument.load(candidate.nextPending!.base)).getTitle()).toBe(
        'pending metadata',
      )
      const cleared = await build({
        ...callbacks,
        bytes: candidate.bytes,
        pending: candidate.nextPending,
        args: { ops: [{ op: 'removeTextInsert', id: 'Tsecond' }] },
      })
      expect(cleared.bytes).toBe(candidate.nextPending!.base)
      expect(cleared.nextPending).toBeNull()
      expect(
        (await readPdfAnnotations(cleared.bytes)).annotations.find((a) => a.id === 'Nreply')?.text,
      ).toBe('new reply')
    },
  )
  it('materializes on original geometry before sequential reorder, rotation and deletion', async () => {
    const frozen = await fixture(90)
    const result = await build({
      ...frozen,
      args: {
        ops: [
          { op: 'setPageOrder', order: [2, 1, 3] },
          { op: 'rotatePages', pages: [2], dir: 90 },
          { op: 'removeTextInsert', id: 'Tfirst' },
          { op: 'setNoteContents', id: 'Nroot', contents: 'after reorder' },
          { op: 'deletePage', page: 3 },
        ],
      },
    })
    expect(result.nextPending).toBeNull()
    expect(result.data.materializedTextIds).toEqual(['Tsecond'])
    expect(result.data.message).toContain('物化')
    expect((await text(result.bytes, 0)).map((i) => i.str).join('')).not.toContain('DRAFT')
    expect((await text(result.bytes, 1)).map((i) => i.str).join('')).toContain('SURVIVE DRAFT')
    expect((await PDFDocument.load(result.bytes)).getPage(1).getRotation().angle).toBe(180)
    expect(
      (await readPdfAnnotations(result.bytes)).annotations.find((a) => a.id === 'Nroot'),
    ).toMatchObject({ page: 2, text: 'after reorder' })
    const deleted = await build({ ...frozen, args: { ops: [{ op: 'deletePage', page: 1 }] } })
    expect((await text(deleted.bytes)).map((i) => i.str).join('')).not.toContain('DRAFT')
  })
  it('rejects legacy R+pending, duplicate T, bad tail, geometry drift and late results atomically', async () => {
    const frozen = await fixture(0, true),
      before = frozen.bytes.slice()
    for (const args of [
      {
        ops: [
          { op: 'removeTextInsert', id: 'Tfirst' },
          { op: 'removeTextInsert', id: 'Tfirst' },
        ],
      },
      { ops: [{ op: 'removeTextInsert', id: 'Tmissing' }] },
      { ops: [{ op: 'setNoteContents', id: frozen.rootId, contents: 'unsafe' }] },
      {
        ops: [
          { op: 'removeTextInsert', id: 'Tfirst' },
          { op: 'removeMarkup', id: 'missing' },
        ],
      },
    ])
      await expect(build({ ...frozen, args })).rejects.toThrow(/批注|待保存文字/)
    await expect(
      build({
        ...frozen,
        args: {
          ops: [
            { op: 'removeTextInsert', id: 'Tfirst' },
            { op: 'setMetadata', metadata: { title: 'discarded' } },
            { op: 'deletePage', page: 99 },
          ],
        },
      }),
    ).rejects.toThrow('第 3 项')
    await expect(
      build({
        ...frozen,
        local: drift,
        args: { ops: [{ op: 'setMetadata', metadata: { title: 'drift' } }] },
      }),
    ).rejects.toThrow('几何')
    let current = true
    const late: PdfHostLocal = async (input) => {
      const result = await local(input)
      current = false
      return result
    }
    await expect(
      build({
        ...frozen,
        local: late,
        assertCurrent() {
          if (!current) throw new Error('stale')
        },
        args: { ops: [{ op: 'setMetadata', metadata: { title: 'late' } }] },
      }),
    ).rejects.toThrow('stale')
    expect(frozen.bytes).toEqual(before)
    expect(frozen.pending.inserts.map((i) => i.id)).toEqual(['Tfirst', 'Tsecond'])
  })
  it('computes a complete dry candidate and returns the exact raw base when all T are removed', async () => {
    const frozen = await fixture()
    const dry = await build({
      ...frozen,
      args: {
        dry_run: true,
        ops: [
          { op: 'removeTextInsert', id: 'Tfirst' },
          { op: 'setNoteContents', id: 'Nroot', contents: 'candidate only' },
        ],
      },
    })
    expect(dry.dryRun).toBe(true)
    expect(
      (await readPdfAnnotations(frozen.bytes)).annotations.find((a) => a.id === 'Nroot')?.text,
    ).toBe('old note')
    const cleared = await build({
      ...frozen,
      args: {
        ops: [
          { op: 'removeTextInsert', id: 'Tfirst' },
          { op: 'removeTextInsert', id: 'Tsecond' },
        ],
      },
    })
    expect(cleared.bytes).toBe(frozen.pending.base)
    expect(cleared.nextPending).toBeNull()
  })
})
