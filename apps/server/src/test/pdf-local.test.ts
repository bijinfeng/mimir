import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees, PDFName, PDFDict, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { initializePdfAgentHost } from '../services/pdf-agent-host.js'
import { configurePdfImageCodec } from '../../../../packages/office/src/shims/pdf-native-image.js'
import { pdfNativeImageCodec, decodePdfImage } from '../services/pdf-image-codec.js'
import { renderPagePreviewPng } from '../../../../packages/office/vendor/apps/pdf/src/main/image-edit.js'
import { applyPdfLocalOperation as apply } from '../services/pdf-local.js'
async function fixture(count = 3) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < count; i++)
    pdf.addPage([400, 600]).drawText(`Page ${i + 1}`, { x: 40, y: 520, size: 16 })
  pdf.setTitle('Original')
  return pdf.save()
}
async function texts(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise
    const out = []
    for (let i = 1; i <= pdf.numPages; i++)
      out.push(
        (await (await pdf.getPage(i)).getTextContent()).items
          .map((x) => ('str' in x ? x.str : ''))
          .join(' '),
      )
    return out
  } finally {
    await task.destroy()
  }
}
describe('PDF local working-copy operations', () => {
  it('duplicates editable widgets independently and frames cropped/resized pages with forms and stamps preserved', async () => {
    const pdf = await PDFDocument.load(await fixture(2))
    const field = pdf.getForm().createTextField('person.name')
    field.setText('Original name')
    field.addToPage(pdf.getPage(0), { x: 40, y: 400, width: 180, height: 24 })
    let bytes = (await apply(await pdf.save(), { op: 'set_watermark', text: '内部资料' })).bytes!
    bytes = (
      await apply(bytes, { op: 'set_outline', entries: [{ title: 'Native target', page: 1 }] })
    ).bytes!
    const before = await PDFDocument.load(bytes),
      beforeRect = before
        .getForm()
        .getTextField('person.name')
        .acroField.getWidgets()[0]!
        .getRectangle()
    const result = await apply(bytes, {
      op: 'apply_page_layout',
      pages: [
        { source_page: 1, rotation: 0 },
        {
          source_page: 1,
          rotation: 90,
          crop: { left: 10, right: 10, top: 10, bottom: 10 },
          paper: { width: 200, height: 300 },
        },
        { source_page: 2, rotation: 0 },
      ],
    })
    const read = await PDFDocument.load(result.bytes!),
      widgets = read.getForm().getTextField('person.name').acroField.getWidgets()
    expect(read.getPageCount()).toBe(3)
    expect(
      read.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFDict && object.lookup(PDFName.of('Type'))?.toString() === '/Page',
        ),
    ).toHaveLength(3)
    expect(widgets).toHaveLength(2)
    expect(widgets[0]!.getRectangle()).toEqual(beforeRect)
    const k = Math.min(200 / 380, 300 / 580)
    expect(widgets[1]!.getRectangle().x).toBeCloseTo(beforeRect.x * k)
    expect(widgets[1]!.getRectangle().y).toBeCloseTo(beforeRect.y * k)
    expect(widgets[1]!.P()?.toString()).toBe(read.getPage(1).ref.toString())
    expect(read.getPage(0).getCropBox()).toEqual(before.getPage(0).getCropBox())
    expect(read.getPage(1).getRotation().angle).toBe(90)
    expect(read.getPage(1).getCropBox().width).toBe(200)
    expect(read.getPage(1).getCropBox().height).toBe(300)
    expect(result.info!.outline).toEqual([{ title: 'Native target', page: 1, level: 0 }])
    expect(result.info!.watermark!.text).toBe('内部资料')
    const text = await texts(result.bytes!)
    expect(text[0]).toContain('Page 1')
    expect(text[1]).toContain('Page 1')
    expect(text[1]).toContain('内部资料')
    // Refill through the shared host and independently enumerate both widgets.
    const filled = await apply(result.bytes!, {
      op: 'apply_ops',
      ops: [{ op: 'setFormValue', value: { name: 'person.name', value: '中文姓名' } }],
    })
    const task = getDocument({ data: filled.bytes!.slice() })
    try {
      const doc = await task.promise
      for (const index of [1, 2]) {
        const annotations = await (await doc.getPage(index)).getAnnotations()
        expect(annotations.find((a) => a.fieldName === 'person.name')?.fieldValue).toBe('中文姓名')
      }
      expect((await doc.getPage(2)).getViewport({ scale: 1 }).width).toBe(300)
    } finally {
      await task.destroy()
    }
    const unchanged = await PDFDocument.load(bytes)
    expect(unchanged.getPageCount()).toBe(2)
    expect(unchanged.getForm().getTextField('person.name').acroField.getWidgets()).toHaveLength(1)
  })
  it('resizes native widgets with whole-document paper changes and rejects invalid layouts atomically', async () => {
    const pdf = await PDFDocument.load(await fixture(2))
    const box = pdf.getForm().createCheckBox('agree')
    box.addToPage(pdf.getPage(0), { x: 50, y: 100, width: 20, height: 20 })
    box.check()
    const bytes = await pdf.save(),
      original = bytes.slice(),
      rect = box.acroField.getWidgets()[0]!.getRectangle()
    const result = await apply(bytes, { op: 'set_page_size', width: 200, height: 300 })
    const read = await PDFDocument.load(result.bytes!)
    expect(
      read.getForm().getCheckBox('agree').acroField.getWidgets()[0]!.getRectangle().x,
    ).toBeCloseTo(rect.x / 2)
    expect(read.getForm().getCheckBox('agree').isChecked()).toBe(true)
    await expect(
      apply(bytes, {
        op: 'apply_page_layout',
        pages: [
          { source_page: 1, rotation: 0, crop: { left: 300, right: 300, top: 0, bottom: 0 } },
        ],
      }),
    ).rejects.toThrow('不是正数')
    await expect(
      apply(bytes, {
        op: 'apply_page_layout',
        pages: [{ source_page: 1, blank: { width: 200, height: 300 }, rotation: 0 }],
      }),
    ).rejects.toThrow('来源页或空白')
    expect(bytes).toEqual(original)
  })

  it('keeps extracted and split fields editable, pruning only dropped widgets and fields', async () => {
    const pdf = await PDFDocument.load(await fixture())
    const form = pdf.getForm()
    const shared = form.createTextField('person.name')
    shared.setText('Original name')
    shared.addToPage(pdf.getPage(0), { x: 40, y: 400, width: 180, height: 24 })
    shared.addToPage(pdf.getPage(2), { x: 40, y: 400, width: 180, height: 24 })
    const dropped = form.createCheckBox('dropped')
    dropped.addToPage(pdf.getPage(1), { x: 40, y: 400 })
    dropped.check()
    pdf.catalog.set(
      PDFName.of('Dests'),
      pdf.context.obj({ discarded: [pdf.getPage(1).ref, PDFName.of('Fit')] }),
    )
    pdf.getPage(0).node.addAnnot(
      pdf.context.register(
        pdf.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [10, 10, 20, 20],
          Dest: [pdf.getPage(1).ref, PDFName.of('Fit')],
        }),
      ),
    )
    const bytes = await pdf.save()
    const extracted = (await apply(bytes, { op: 'extract_pages', pages: '3,1' })).outputs![0]!.bytes
    const read = await PDFDocument.load(extracted)
    expect(
      read.context
        .enumerateIndirectObjects()
        .filter(
          ([, o]) => o instanceof PDFDict && o.lookup(PDFName.of('Type'))?.toString() === '/Page',
        ),
    ).toHaveLength(2)
    expect(read.catalog.lookup(PDFName.of('Dests'), PDFDict).has(PDFName.of('discarded'))).toBe(
      false,
    )
    const streams = read.context
      .enumerateIndirectObjects()
      .flatMap(([, o]) =>
        o instanceof PDFRawStream
          ? [Buffer.from(decodePDFRawStream(o).decode()).toString('latin1')]
          : [],
      )
    expect(
      streams.some((s) => s.includes(Buffer.from('Page 2').toString('hex').toUpperCase())),
    ).toBe(false)
    expect(
      read
        .getForm()
        .getFields()
        .map((f) => f.getName()),
    ).toEqual(['person.name'])
    expect(read.getForm().getTextField('person.name').acroField.getWidgets()).toHaveLength(2)
    const task = getDocument({ data: extracted.slice() })
    try {
      const fields = await (await task.promise).getFieldObjects()
      expect(
        fields!
          .get('person.name')!
          .flatMap((f) =>
            'page' in f && typeof f.page === 'number' && f.page >= 0 ? [f.page] : [],
          ),
      ).toEqual([1, 0])
    } finally {
      await task.destroy()
    }
    const split = (await apply(bytes, { op: 'split_pdf', pages_per_file: 1 })).outputs!
    expect(split).toHaveLength(3)
    for (const index of [0, 2]) {
      const part = await PDFDocument.load(split[index]!.bytes)
      const field = part.getForm().getTextField('person.name')
      expect(field.acroField.getWidgets()).toHaveLength(1)
      field.setText('Still editable')
      expect(
        (await PDFDocument.load(await part.save())).getForm().getTextField('person.name').getText(),
      ).toBe('Still editable')
    }
    expect(
      (await PDFDocument.load(split[1]!.bytes)).getForm().getCheckBox('dropped').isChecked(),
    ).toBe(true)
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(2)
    await expect(apply(bytes, { op: 'merge_pages', per_sheet: 2 })).rejects.toThrow('表单或批注')
  })
  it('applies metadata, form and page edits atomically and validates dry runs without writable bytes', async () => {
    const pdf = await PDFDocument.load(await fixture())
    const field = pdf.getForm().createTextField('name')
    field.addToPage(pdf.getPage(0), { x: 40, y: 400, width: 180, height: 24 })
    const outlined = await apply(await pdf.save(), {
      op: 'set_outline',
      entries: [{ title: 'Name', page: 1 }],
    })
    const bytes = outlined.bytes!,
      before = bytes.slice()
    const ops = [
      { op: 'setMetadata' as const, metadata: { title: 'Changed' } },
      { op: 'setFormValue' as const, value: { name: 'name', value: '中文姓名' } },
      { op: 'rotatePages' as const, pages: [2], dir: 90 as const },
    ]
    const dry = await apply(bytes, { op: 'apply_ops', ops, dry_run: true })
    expect(dry.bytes).toBeUndefined()
    expect(dry.info!.metadata.title).toBe('Changed')
    expect(bytes).toEqual(before)
    const result = await apply(bytes, { op: 'apply_ops', ops })
    const saved = await PDFDocument.load(result.bytes!)
    expect(saved.getTitle()).toBe('Changed')
    expect(saved.getForm().getTextField('name').getText()).toBe('中文姓名')
    expect(saved.getPage(1).getRotation().angle).toBe(90)
    expect((await apply(result.bytes!, { op: 'read' })).info!.outline).toEqual([
      { title: 'Name', page: 1, level: 0 },
    ])
    await expect(
      apply(bytes, { op: 'apply_ops', ops: [...ops, { op: 'deletePage', page: 1 }] }),
    ).rejects.toThrow('表单')
    expect(bytes).toEqual(before)
    expect((await PDFDocument.load(bytes)).getTitle()).toBe('Original')
  })
  it('extracts chosen working pages and splits files without changing source', async () => {
    const src = await fixture(),
      before = src.slice()
    const out = await apply(src, { op: 'extract_pages', pages: '3,1,1' })
    expect(await texts(out.outputs![0]!.bytes)).toEqual(['Page 3', 'Page 1'])
    const split = await apply(src, { op: 'split_pdf', pages_per_file: 2 })
    expect(
      await Promise.all(
        split.outputs!.map(async (o) => (await PDFDocument.load(o.bytes)).getPageCount()),
      ),
    ).toEqual([2, 1])
    expect(src).toEqual(before)
    await expect(apply(src, { op: 'extract_pages', pages: '0,5' })).rejects.toThrow('页码')
  })
  it('removes unselected object graphs for page deletion and replacement as well as extraction', async () => {
    const source = await fixture()
    const deleted = await apply(source, { op: 'apply_ops', ops: [{ op: 'deletePage', page: 3 }] })
    const replaced = await apply(
      source,
      { op: 'replace_pages', pages: '3', source_pages: '1' },
      await fixture(1),
    )
    for (const [result, count] of [
      [deleted, 2],
      [replaced, 3],
    ] as const) {
      const pdf = await PDFDocument.load(result.bytes!)
      expect(
        pdf.context
          .enumerateIndirectObjects()
          .filter(
            ([, o]) => o instanceof PDFDict && o.lookup(PDFName.of('Type'))?.toString() === '/Page',
          ),
      ).toHaveLength(count)
      const streams = pdf.context
        .enumerateIndirectObjects()
        .flatMap(([, o]) =>
          o instanceof PDFRawStream
            ? [Buffer.from(decodePDFRawStream(o).decode()).toString('latin1')]
            : [],
        )
      expect(
        streams.some((s) => s.includes(Buffer.from('Page 3').toString('hex').toUpperCase())),
      ).toBe(false)
    }
    const interleaved = await apply(source, {
      op: 'apply_ops',
      ops: [
        { op: 'deletePage', page: 1 },
        { op: 'rotatePages', pages: [1], dir: 90 },
        { op: 'setPageOrder', order: [2, 1] },
      ],
    })
    expect(await texts(interleaved.bytes!)).toEqual(['Page 3', 'Page 2'])
    expect(
      (await PDFDocument.load(interleaved.bytes!))
        .getPages()
        .map((page) => page.getRotation().angle),
    ).toEqual([0, 90])
  })
  it('replaces disjoint pages, imports chosen pages and preserves metadata on second save', async () => {
    const source = await fixture(),
      asset = await fixture(2)
    const replaced = await apply(
      source,
      { op: 'replace_pages', pages: '1,3', source_pages: '2' },
      asset,
    )
    expect(await texts(replaced.bytes!)).toEqual(['Page 2', 'Page 2'])
    expect((await PDFDocument.load(replaced.bytes!)).getTitle()).toBe('Original')
    const imported = await apply(
      replaced.bytes!,
      { op: 'import_pages', after_page: 1, source_pages: '1' },
      asset,
    )
    expect(await texts(imported.bytes!)).toEqual(['Page 2', 'Page 1', 'Page 2'])
    const blank = await apply(imported.bytes!, { op: 'insert_blank_page', after_page: 0 })
    expect((await PDFDocument.load(blank.bytes!)).getPageCount()).toBe(4)
  })
  it('writes real nested bookmarks and remaps survivors after page replacement', async () => {
    const outlined = await apply(await fixture(), {
      op: 'set_outline',
      entries: [
        { title: '章节一', page: 1, level: 0 },
        { title: '子节', page: 2, level: 1 },
        { title: '章节三', page: 3, level: 0 },
      ],
    })
    const task = getDocument({ data: outlined.bytes!.slice() })
    try {
      const tree = await (await task.promise).getOutline()
      expect(tree!.map((e) => e.title)).toEqual(['章节一', '章节三'])
      expect(tree![0]!.items[0]!.title).toBe('子节')
    } finally {
      await task.destroy()
    }
    const changed = await apply(outlined.bytes!, {
      op: 'set_metadata',
      metadata: { title: '修订标题', author: 'admin' },
    })
    expect(changed.info!.metadata.title).toBe('修订标题')
    const replaced = await apply(
      changed.bytes!,
      { op: 'replace_pages', pages: '2', source_pages: 'all' },
      await fixture(2),
    )
    expect(replaced.info!.outline).toEqual([
      { title: '章节一', page: 1, level: 0 },
      { title: '章节三', page: 4, level: 0 },
    ])
  })
  it('stamps Chinese and replaces own layers without leaving old text', async () => {
    const wm = await apply(await fixture(2), { op: 'set_watermark', text: '内部资料' })
    expect((await texts(wm.bytes!))[0]).toContain('内部资料')
    const hf = await apply(wm.bytes!, {
      op: 'set_header_footer',
      header_left: '项目文档',
      footer_right: '第 {page} / {total} 页',
      page_number: true,
    })
    const changed = await apply(hf.bytes!, { op: 'set_watermark', text: '保密' })
    const content = await texts(changed.bytes!)
    expect(content[0]).toContain('保密')
    expect(content[0]).not.toContain('内部资料')
    expect(content[1]).toContain('第 2 / 2 页')
    const removed = await apply(changed.bytes!, { op: 'set_watermark', text: '' })
    expect((await texts(removed.bytes!))[0]).not.toContain('保密')
    expect((await texts(removed.bytes!))[0]).toContain('项目文档')
  })
  it('adds, moves and deletes native vector drawings and static marks', async () => {
    const src = await fixture(1)
    const d = {
      kind: 'rect' as const,
      page: 1,
      x: 30,
      y: 50,
      width: 80,
      height: 40,
      color: '#FF0000',
      thickness: 2,
      opacity: 1,
    }
    const added = await apply(src, { op: 'add_drawing', drawing: d })
    expect(added.info!.drawings).toHaveLength(1)
    const id = added.info!.drawings[0]!.id
    const moved = await apply(added.bytes!, { op: 'update_drawing', id, drawing: { ...d, x: 140 } })
    expect(moved.info!.drawings[0]!.x).toBe(140)
    const mark = await apply(moved.bytes!, {
      op: 'add_form_mark',
      page: 1,
      kind: 'check',
      x: 20,
      y: 20,
      size: 20,
    })
    const removed = await apply(mark.bytes!, { op: 'delete_drawing', id })
    expect(removed.info!.drawings).toHaveLength(1)
    expect(await texts(removed.bytes!)).toEqual(['Page 1'])
    await expect(apply(src, { op: 'add_drawing', drawing: { ...d, x: 390 } })).rejects.toThrow(
      '超出页面',
    )
  })
  it('splits pages into grids and imposes source pages keeping text', async () => {
    const src = await fixture()
    const split = await apply(src, { op: 'split_pages', per_page: 4 })
    const pdf = await PDFDocument.load(split.outputs![0]!.bytes)
    expect(pdf.getPageCount()).toBe(12)
    expect(pdf.getPage(0).getSize()).toEqual({ width: 200, height: 300 })
    const merged = await apply(src, {
      op: 'merge_pages',
      per_sheet: 2,
      direction: 'horizontal',
      separator: true,
    })
    const content = await texts(merged.outputs![0]!.bytes)
    expect(content).toHaveLength(2)
    expect(content[0]).toContain('Page 1')
    expect(content[0]).toContain('Page 2')
    expect(content[1]).toContain('Page 3')
  })
  it('crops displayed coordinates of rotated pages and resizes paper', async () => {
    const src = await PDFDocument.load(await fixture(1))
    src.getPage(0).setRotation(degrees(90))
    const cropped = await apply(await src.save(), {
      op: 'crop_pages',
      pages: 'all',
      left: 0.1,
      top: 0.2,
      right: 0.9,
      bottom: 0.8,
    })
    const p = (await PDFDocument.load(cropped.bytes!)).getPage(0)
    expect(p.getCropBox().x).toBe(80)
    expect(p.getCropBox().width).toBe(240)
    const resized = await apply(cropped.bytes!, { op: 'set_page_size', preset: 'A4' })
    expect((await PDFDocument.load(resized.bytes!)).getPage(0).getCropBox().width).toBe(841.89)
    expect((await texts(resized.bytes!))[0]).toContain('Page 1')
  })
  it('rejects active Catalog actions keeping caller bytes', async () => {
    const pdf = await PDFDocument.load(await fixture(1))
    pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.obj({ S: 'JavaScript', JS: 'alert(1)' }))
    const bytes = await pdf.save(),
      before = bytes.slice()
    await expect(apply(bytes, { op: 'set_metadata', metadata: { title: 'x' } })).rejects.toThrow(
      '文档结构',
    )
    expect(bytes).toEqual(before)
  })
  it('renders actual drawing pixels at the displayed position on 0/90/180/270 degree pages', async () => {
    initializePdfAgentHost()
    configurePdfImageCodec(pdfNativeImageCodec)
    for (const rotation of [0, 90, 180, 270]) {
      const doc = await PDFDocument.create()
      doc.addPage([400, 600]).setRotation(degrees(rotation))
      const drawn = await apply(await doc.save(), {
        op: 'add_drawing',
        drawing: {
          kind: 'rect',
          page: 1,
          x: 40,
          y: 50,
          width: 80,
          height: 40,
          color: '#FF0000',
          fill: '#FF0000',
        },
      })
      const preview = await renderPagePreviewPng(drawn.bytes!, {
        pageIndex: 0,
        excludeRects: [],
        clip: { x: 40, y: 50, width: 80, height: 40 },
        pxWidth: 80,
        rotate: 0,
      })
      expect(preview).toBeTruthy()
      const pixels = decodePdfImage(Buffer.from(preview!.png, 'base64'))
      const at = (Math.floor(pixels.height / 2) * pixels.width + Math.floor(pixels.width / 2)) * 4
      expect(Array.from(pixels.data.slice(at, at + 3))).toEqual([255, 0, 0])
    }
  })
  it('supports empty-page outputs and clearing all stamp slots', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([400, 600])
    const source = await doc.save()
    const split = await apply(source, { op: 'split_pages', per_page: 2 })
    expect((await PDFDocument.load(split.outputs![0]!.bytes)).getPageCount()).toBe(2)
    const cleared = await apply(source, { op: 'set_header_footer' })
    expect(cleared.info!.headerFooter).toBeNull()
  })
})
