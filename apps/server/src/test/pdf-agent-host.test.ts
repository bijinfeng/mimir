import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import {
  buildPdfBytes,
  readPdfPages,
  type PdfPageRef,
} from '../../../../packages/office/src/editors/pdf-pages.js'
import {
  applyPdfTextEdits,
  applyPdfTextInserts,
  applyPdfVerifiedTextEdit,
  applyPdfVerifiedMarkup,
  inspectPdfTextTarget,
  pdfAgentAssetPaths,
} from '../services/pdf-agent-host.js'

async function fixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
  return pdf.save()
}

async function readText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: bytes.slice() })
  const document = await task.promise
  try {
    const content = await (await document.getPage(1)).getTextContent()
    return content.items.map((item) => ('str' in item ? item.str : '')).join('')
  } finally {
    await task.destroy()
  }
}

describe('PDF content writer host', () => {
  it('writes a real highlight annotation, reads it back, and preserves bytes on failure', async () => {
    const bytes = await fixture()
    const target = await inspectPdfTextTarget(bytes, {
      pageIndex: 0,
      rect: [35, 295, 125, 316],
      oldText: 'ORIGINAL',
    })
    let marked: Uint8Array | null = null
    for (const [type, subtype] of [
      ['highlight', 'Highlight'],
      ['underline', 'Underline'],
      ['strikeout', 'StrikeOut'],
    ] as const) {
      const result = await applyPdfVerifiedMarkup(bytes, { target, type })
      const task = getDocument({ data: result.slice() })
      try {
        const page = await (await task.promise).getPage(1)
        expect((await page.getAnnotations()).some((item) => item.subtype === subtype)).toBe(true)
      } finally {
        await task.destroy()
      }
      expect(await readText(result)).toContain('ORIGINAL')
      marked = result
    }
    expect(await readText(bytes)).toContain('ORIGINAL')
    await expect(applyPdfVerifiedMarkup(marked!, { target, type: 'underline' })).rejects.toThrow(
      '原件已变化',
    )
    const complex = await PDFDocument.load(bytes)
    complex.catalog.set(PDFName.of('AcroForm'), complex.context.obj({ Fields: [] }))
    const complexBytes = await complex.save()
    await expect(
      applyPdfVerifiedMarkup(complexBytes, {
        target: { ...target, sha256: createHash('sha256').update(complexBytes).digest('hex') },
        type: 'highlight',
      }),
    ).rejects.toThrow('文档结构')
  })

  it('pins one PDFium text object to exact bytes and rejects stale or ambiguous targets', async () => {
    const bytes = await fixture()
    const probe = {
      pageIndex: 0,
      rect: [35, 295, 125, 316] as [number, number, number, number],
      oldText: 'ORIGINAL',
    }
    const target = await inspectPdfTextTarget(bytes, probe)
    expect(target).toMatchObject({ pageIndex: 0, text: 'ORIGINAL' })
    expect(target.sha256).toMatch(/^[a-f0-9]{64}$/)
    const edit = { ...probe, newText: 'REVISED', fontSize: 12 }
    const result = await applyPdfVerifiedTextEdit(bytes, edit, target)
    expect(await readText(result)).toContain('REVISED')
    expect(await readText(bytes)).toContain('ORIGINAL')
    await expect(applyPdfVerifiedTextEdit(result, edit, target)).rejects.toThrow('原件已变化')
    await expect(inspectPdfTextTarget(bytes, { ...probe, oldText: 'ORIG' })).rejects.toThrow(
      '不是唯一完整文字项',
    )

    const doubled = await PDFDocument.create()
    const font = await doubled.embedFont(StandardFonts.Helvetica)
    const page = doubled.addPage([300, 400])
    page.drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
    page.drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
    await expect(inspectPdfTextTarget(await doubled.save(), probe)).rejects.toThrow(
      '不是唯一完整文字项',
    )
  })

  it('resolves production WASM resources', () => {
    const assets = pdfAgentAssetPaths()
    expect(existsSync(assets.pdfium)).toBe(true)
    expect(existsSync(assets.harfbuzz)).toBe(true)
  })

  it('writes text through GenOffice PDFium and independent pdf.js reads it back', async () => {
    const bytes = await fixture()
    const result = await applyPdfTextEdits(bytes, [
      {
        pageIndex: 0,
        rect: [35, 295, 125, 316],
        oldText: 'ORIGINAL',
        newText: 'REVISED',
        fontSize: 12,
      },
    ])
    expect(await readText(result)).toContain('REVISED')
    expect(await readText(bytes)).toContain('ORIGINAL')
    expect((await PDFDocument.load(result)).getPageCount()).toBe(1)
  })

  it('rejects skipped text edits and signed or unknown Catalog structures without returning bytes', async () => {
    const bytes = await fixture()
    await expect(
      applyPdfTextEdits(bytes, [
        {
          pageIndex: 0,
          rect: [35, 295, 125, 316],
          oldText: 'WRONG',
          newText: 'SHOULD NOT LAND',
          fontSize: 12,
        },
      ]),
    ).rejects.toThrow('未写入')
    const document = await PDFDocument.load(bytes)
    document.catalog.set(PDFName.of('AcroForm'), document.context.obj({ Fields: [] }))
    const complex = await document.save()
    await expect(
      applyPdfTextEdits(complex, [
        {
          pageIndex: 0,
          rect: [35, 295, 125, 316],
          oldText: 'ORIGINAL',
          newText: 'REVISED',
          fontSize: 12,
        },
      ]),
    ).rejects.toThrow('文档结构')
    expect(await readText(complex)).toContain('ORIGINAL')
  })

  it('inserts searchable text and rejects an out of range page', async () => {
    const bytes = await fixture()
    const inserted = await applyPdfTextInserts(bytes, [
      {
        pageIndex: 0,
        origin: [40, 250],
        text: 'NEW LINE',
        fontSize: 12,
        color: [0, 0, 0],
      },
    ])
    expect(await readText(inserted)).toContain('NEW LINE')
    const page = (await readPdfPages(inserted))[0]!
    const layout: PdfPageRef[] = [
      {
        origin: { kind: 'original', index: 0 },
        rotation: 90,
        base: { width: page.width, height: page.height },
        crop: null,
        paper: null,
      },
    ]
    const secondSave = await buildPdfBytes({ bytes: inserted, layout, imports: new Map() })
    expect(await readText(secondSave)).toContain('NEW LINE')
    expect((await PDFDocument.load(secondSave)).getPage(0).getRotation().angle).toBe(90)
    await expect(
      applyPdfTextInserts(bytes, [
        {
          pageIndex: 5,
          origin: [40, 250],
          text: 'MISSING PAGE',
          fontSize: 12,
          color: [0, 0, 0],
        },
      ]),
    ).rejects.toThrow('未写入')
  })

  it('replays pending inserts from the base so edits and deletion leave no stale text', async () => {
    const base = await fixture()
    const first = await applyPdfTextInserts(base, [
      { pageIndex: 0, origin: [40, 250], text: 'OLD DRAFT', fontSize: 12, color: [0, 0, 0] },
      { pageIndex: 0, origin: [40, 220], text: 'KEEP', fontSize: 12, color: [0, 0, 0] },
    ])
    expect(await readText(first)).toContain('OLD DRAFT')
    const edited = await applyPdfTextInserts(base, [
      { pageIndex: 0, origin: [80, 200], text: 'FINAL', fontSize: 16, color: [0, 0, 0] },
      { pageIndex: 0, origin: [40, 220], text: 'KEEP', fontSize: 12, color: [0, 0, 0] },
    ])
    const text = await readText(edited)
    expect(text).toContain('FINAL')
    expect(text).toContain('KEEP')
    expect(text).not.toContain('OLD DRAFT')
    const deleted = await applyPdfTextInserts(base, [
      { pageIndex: 0, origin: [40, 220], text: 'KEEP', fontSize: 12, color: [0, 0, 0] },
    ])
    expect(await readText(deleted)).not.toContain('FINAL')
    const page = (await readPdfPages(edited))[0]!
    const secondSave = await buildPdfBytes({
      bytes: edited,
      layout: [
        {
          origin: { kind: 'original', index: 0 },
          rotation: 90,
          base: { width: page.width, height: page.height },
          crop: null,
          paper: null,
        },
      ],
      imports: new Map(),
    })
    expect(await readText(secondSave)).toContain('FINAL')
    expect((await PDFDocument.load(secondSave)).getPage(0).getRotation().angle).toBe(90)
  })
})
