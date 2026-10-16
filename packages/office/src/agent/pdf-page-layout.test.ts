import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { applyPdfLocalOperation as apply } from '../../../../apps/server/src/services/pdf-local.js'
import type { PdfLocalOperation } from '@mimir/shared'

async function fixture() {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600])
  return apply(await pdf.save(), {
    op: 'add_drawing',
    drawing: {
      kind: 'rect',
      page: 1,
      x: 30,
      y: 50,
      width: 80,
      height: 40,
      color: '#FF0000',
      thickness: 2,
      opacity: 1,
    },
  })
}

describe('PDF layout editable drawing identities', () => {
  it('keeps copied identities stable across materializations and unique after saving and copying again', async () => {
    const source = await fixture()
    const operation = {
      op: 'apply_page_layout',
      pages: [
        { source_page: 1, rotation: 0 },
        { source_page: 1, rotation: 0 },
      ],
    } satisfies PdfLocalOperation
    const first = await apply(source.bytes!, operation)
    const second = await apply(source.bytes!, operation)
    const id = first.info!.drawings.find((d) => d.page === 2)!.id
    expect(second.info!.drawings.find((d) => d.page === 2)!.id).toBe(id)
    expect(first.info!.drawings.find((d) => d.page === 1)!.id).toBe(source.info!.drawings[0]!.id)
    const edited = await apply(second.bytes!, { op: 'delete_drawing', id })
    expect(edited.info!.drawings.map((d) => d.page)).toEqual([1])
    const third = await apply(first.bytes!, {
      op: 'apply_page_layout',
      pages: [
        { source_page: 1, rotation: 0 },
        { source_page: 1, rotation: 0 },
        { source_page: 2, rotation: 0 },
        { source_page: 2, rotation: 0 },
      ],
    })
    expect(new Set(third.info!.drawings.map((d) => d.id)).size).toBe(4)
    expect(third.info!.drawings.find((d) => d.page === 3)!.id).toBe(id)
  })

  it('accepts equivalent native rotation and transforms the cache for actual quarter turns', async () => {
    const source = await fixture()
    const pdf = await PDFDocument.load(source.bytes!)
    pdf.getPage(0).setRotation(degrees(-90))
    const bytes = await pdf.save()
    const result = await apply(bytes, {
      op: 'apply_page_layout',
      pages: [
        { source_page: 1, rotation: 270 },
        { source_page: 1, rotation: 270 },
      ],
    })
    expect(result.info!.drawings).toHaveLength(2)
    expect((await PDFDocument.load(result.bytes!)).getPage(1).getRotation().angle).toBe(270)
    const rotated = await apply(bytes, {
      op: 'apply_page_layout',
      pages: [{ source_page: 1, rotation: 0 }],
    })
    expect(rotated.info!.drawings[0]!.rotation).toBe(90)
  })

  it('transforms editable drawings consistently in the other local operation paths', async () => {
    const source = await fixture(),
      original = source.bytes!.slice()
    const operations: PdfLocalOperation[] = [
      { op: 'set_page_size', preset: 'A5' },
      { op: 'crop_pages', pages: 'all', left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 },
      {
        op: 'apply_ops',
        ops: [
          { op: 'setMetadata', metadata: { title: 'Must not publish' } },
          { op: 'rotatePages', pages: [1], dir: 90 },
        ],
      },
    ]
    for (const operation of operations) {
      const result = await apply(source.bytes!, operation)
      expect(result.info!.drawings[0]!.id).toBe(source.info!.drawings[0]!.id)
      const { id, ...drawing } = result.info!.drawings[0]!
      const updated = await apply(result.bytes!, { op: 'update_drawing', id, drawing })
      expect(updated.info!.drawings[0]!.id).toBe(id)
      expect(source.bytes).toEqual(original)
    }
    expect((await PDFDocument.load(source.bytes!)).getPage(0).getRotation().angle).toBe(0)
  })
})
