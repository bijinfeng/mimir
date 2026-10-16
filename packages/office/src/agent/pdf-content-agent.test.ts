import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { executePdfContentTool } from './pdf-content-agent.js'
import { buildPdfTextIndex } from '../editors/pdf-text.js'
import {
  applyPdfVerifiedMarkup,
  applyPdfVerifiedTextEdit,
  inspectPdfTextTarget,
} from '../../../../apps/server/src/services/pdf-agent-host.js'
import { applyPdfAnnotationOperation } from '../../../../apps/server/src/services/pdf-annotations.js'

vi.mock('../editors/pdf-render.js', () => ({
  loadPdfDocument: async (bytes: Uint8Array) => getDocument({ data: bytes.slice() }).promise,
}))

async function fixture() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
  return pdf.save()
}
async function run(bytes: Uint8Array, tool: string, args: Record<string, unknown>) {
  return executePdfContentTool({
    bytes,
    tool,
    args,
    version: 1,
    pageCount: 1,
    textIndex: () =>
      buildPdfTextIndex(
        [{ bytes, index: 0, rotation: 0 }],
        async (data) => getDocument({ data: data.slice() }).promise,
      ),
    inspect: ({ bytes: data, probe }) => inspectPdfTextTarget(data, probe),
    apply: async ({ bytes: data, items }) => {
      const edit = items[0] as Parameters<typeof applyPdfVerifiedTextEdit>[1] & {
        target: Parameters<typeof applyPdfVerifiedTextEdit>[2]
      }
      return { bytes: await applyPdfVerifiedTextEdit(data, edit, edit.target), version: 2 }
    },
    markup: async ({ bytes: data, markup }) => ({
      bytes: await applyPdfVerifiedMarkup(data, markup),
      version: 2,
    }),
    annotations: async ({ bytes: data, operation, sha256 }) => {
      const result = await applyPdfAnnotationOperation(data, operation, sha256)
      return {
        ...result,
        bytes: operation.op === 'read' ? undefined : result.bytes,
        version: operation.op === 'read' ? 1 : 2,
      }
    },
  })
}

describe('PDF Agent content contracts against real bytes', () => {
  it('replaces and deletes original text and creates all three markup types through Agent argument names', async () => {
    const base = await fixture()
    const replaced = await run(base, 'edit_text', {
      page: 1,
      old_text: 'ORIGINAL',
      new_text: 'REVISED',
      font_size: 14,
      color: '#224466',
      font: 'courier',
      bold: true,
      italic: false,
    })
    const task = getDocument({ data: replaced.bytes!.slice() })
    try {
      expect(
        (await (await (await task.promise).getPage(1)).getTextContent()).items
          .map((entry) => ('str' in entry ? entry.str : ''))
          .join(''),
      ).toContain('REVISED')
    } finally {
      await task.destroy()
    }
    const deleted = await run(replaced.bytes!, 'edit_text', {
      page: 1,
      old_text: 'REVISED',
      new_text: '',
    })
    const removed = getDocument({ data: deleted.bytes!.slice() })
    try {
      expect((await (await (await removed.promise).getPage(1)).getTextContent()).items).toEqual([])
    } finally {
      await removed.destroy()
    }
    for (const type of ['highlight', 'underline', 'strikeout']) {
      const marked = await run(base, 'markup_text', { page: 1, text: 'ORIGINAL', type })
      const listed = await run(marked.bytes!, 'read_annotations', {})
      const annotations = (listed.data as { annotations: Array<{ id: string; type: string }> })
        .annotations
      expect(annotations).toMatchObject([{ type }])
      const cleared = await run(marked.bytes!, 'delete_markup', {
        page: 1,
        markup_ids: [annotations[0]!.id],
      })
      expect((cleared.data as { annotations: unknown[] }).annotations).toEqual([])
    }
  })

  it('anchors a note to a complete text item, replies and edits using stable IDs', async () => {
    const base = await fixture()
    const added = await run(base, 'add_note', {
      page: 1,
      text: 'anchor note',
      anchor_text: 'ORIGINAL',
    })
    const root = (added.data as { annotations: Array<{ id: string }> }).annotations[0]!
    const reply = await run(added.bytes!, 'reply_note', {
      page: 1,
      note_id: root.id,
      text: 'reply',
    })
    const edited = await run(reply.bytes!, 'edit_note', {
      page: 1,
      note_id: root.id,
      text: 'changed',
    })
    expect((edited.data as { annotations: unknown[] }).annotations).toMatchObject([
      { id: root.id, text: 'changed' },
      { parentId: root.id, text: 'reply' },
    ])
    const deleted = await run(edited.bytes!, 'delete_note', { page: 1, note_id: root.id })
    expect((deleted.data as { annotations: unknown[] }).annotations).toEqual([])
  })

  it('rejects partial or duplicate targets and invalid upstream parameters without modifying bytes', async () => {
    const base = await fixture()
    const before = base.slice()
    await expect(
      run(base, 'edit_text', { page: 1, old_text: 'ORIG', new_text: 'no' }),
    ).rejects.toThrow('唯一完整')
    await expect(
      run(base, 'edit_text', { page: 1, old_text: 'ORIGINAL', new_text: 'no', font_size: NaN }),
    ).rejects.toThrow('字号')
    await expect(
      run(base, 'markup_text', { page: 1, text: 'ORIGINAL', type: 'highlight', all: true }),
    ).rejects.toThrow('批量')
    await expect(
      run(base, 'markup_text', { page: 1, text: 'ORIGINAL', type: 'highlight', color: '#000000' }),
    ).rejects.toThrow('自定义')
    await expect(
      run(base, 'add_note', { page: 1, text: 'no', anchor_text: 'ORIGINAL', x: 20, y: 20 }),
    ).rejects.toThrow('混用')
    expect(base).toEqual(before)
  })
})
