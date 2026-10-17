import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfFormOperation } from '@mimir/shared'
import { applyPdfFormOperation, readPdfFormFields } from '../services/pdf-forms.js'
import { applyPreservingPdfFormOperation as apply } from '../services/pdf-preserving-forms.js'
import { applyPdfLocalOperation } from '../services/pdf-local.js'

const key = PDFName.of
async function fixture() {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 500]),
    second = pdf.addPage([400, 500]),
    form = pdf.getForm()
  page.drawText('KEEP ORIGINAL', { x: 30, y: 450, size: 12 })
  second.drawText('SECOND ORIGINAL', { x: 30, y: 450, size: 12 })
  form.createTextField('name').addToPage(page, { x: 30, y: 350, width: 220, height: 40 })
  form.createCheckBox('agree').addToPage(page, { x: 30, y: 300, width: 20, height: 20 })
  const radio = form.createRadioGroup('color')
  radio.addOptionToPage('red', page, { x: 30, y: 250, width: 20, height: 20 })
  radio.addOptionToPage('blue', page, { x: 80, y: 250, width: 20, height: 20 })
  const choice = form.createDropdown('country')
  choice.addOptions(['China', 'Japan'])
  choice.addToPage(page, { x: 30, y: 200, width: 180, height: 30 })
  // Native bookmark actions exercise the preserving guard independently of the
  // editor's own set_outline writer; no external or active actions are allowed.
  const root = pdf.context.obj({ Type: 'Outlines' }),
    rootRef = pdf.context.register(root),
    first = pdf.context.obj({
      Title: PDFHexString.fromText('表单页'),
      Parent: rootRef,
      A: { S: 'GoTo', D: [page.ref, 'Fit'] },
    }),
    firstRef = pdf.context.register(first),
    last = pdf.context.obj({
      Title: PDFHexString.fromText('第二页'),
      Parent: rootRef,
      Prev: firstRef,
      Dest: [second.ref, 'Fit'],
    }),
    lastRef = pdf.context.register(last)
  first.set(key('Next'), lastRef)
  root.set(key('First'), firstRef)
  root.set(key('Last'), lastRef)
  root.set(key('Count'), pdf.context.obj(2))
  pdf.catalog.set(key('Outlines'), rootRef)
  pdf.catalog.set(key('PageMode'), key('UseOutlines'))
  pdf.catalog.set(key('Lang'), PDFHexString.fromText('zh-CN'))
  return pdf.save()
}
async function write(
  bytes: Uint8Array,
  ops: Extract<PdfFormOperation, { op: 'apply' }>['ops'],
  dryRun = false,
) {
  const { sha256 } = await readPdfFormFields(bytes)
  return apply(bytes, { op: 'apply', ops, dryRun }, sha256)
}
async function outline(bytes: Uint8Array) {
  return (await applyPdfLocalOperation(bytes, { op: 'read' })).info!.outline
}

describe('preserving PDF form adapter', () => {
  // Eight native form rewrites, page operations and independent PDF.js reads need
  // a bounded integration budget under concurrent workspace test load.
  it('preserves native PDF through form and page edits', { timeout: 20_000 }, async () => {
    let bytes = await fixture()
    const original = bytes.slice()
    expect((await apply(bytes, { op: 'read' })).forms.fields).toHaveLength(4)
    await expect(
      applyPdfFormOperation(
        bytes,
        { op: 'apply', ops: [{ op: 'setFormValue', value: { name: 'agree', checked: true } }] },
        (await readPdfFormFields(bytes)).sha256,
      ),
    ).rejects.toThrow('Outlines')
    for (const value of [
      { name: 'name', value: '中文姓名' },
      { name: 'country', value: 'China' },
      { name: 'color', value: 'blue' },
      { name: 'agree', checked: true },
      { name: 'name', value: '' },
      { name: 'country', value: '' },
      { name: 'name', value: '第二次保存' },
      { name: 'country', value: 'Japan' },
    ]) {
      const input = bytes,
        previous = bytes.slice()
      bytes = (await write(bytes, [{ op: 'setFormValue', value }])).bytes!
      expect(input).toEqual(previous)
      expect(await outline(bytes)).toEqual([
        { title: '表单页', page: 1, level: 0 },
        { title: '第二页', page: 2, level: 0 },
      ])
    }
    bytes = (await applyPdfLocalOperation(bytes, { op: 'set_watermark', text: '内部资料' })).bytes!
    bytes = (
      await applyPdfLocalOperation(bytes, {
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
    ).bytes!
    const changed = await write(bytes, [
      { op: 'setFormValue', value: { name: 'name', value: '页面后继续填' } },
      { op: 'setPageOrder', order: [3, 2, 1] },
      { op: 'rotatePages', pages: [3], dir: 90 },
      { op: 'deletePage', page: 1 },
    ])
    expect(changed.forms.fields.map((field) => field.value)).toEqual([
      '页面后继续填',
      true,
      'blue',
      ['Japan'],
    ])
    expect(await outline(changed.bytes!)).toEqual([{ title: '表单页', page: 2, level: 0 }])
    const final = await write(changed.bytes!, [
      { op: 'setFormValue', value: { name: 'name', value: '再次填写' } },
      { op: 'setFormValue', value: { name: 'country', value: 'China' } },
    ])
    const reopened = await PDFDocument.load(final.bytes!),
      field = reopened.getForm().getTextField('name'),
      widgets = field.acroField.getWidgets()
    expect(reopened.getPageCount()).toBe(2)
    expect(field.isReadOnly()).toBe(false)
    expect(widgets).toHaveLength(2)
    expect(new Set(widgets.map((widget) => widget.P()?.toString()))).toEqual(
      new Set(reopened.getPages().map((page) => page.ref.toString())),
    )
    for (const widget of widgets) {
      expect(reopened.context.lookup(widget.dict.get(key('Parent')))).toBe(field.acroField.dict)
      expect(widget.getRectangle().width).toBeGreaterThan(0)
    }
    expect(
      reopened.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFDict && object.lookup(key('Type'))?.toString() === '/Page',
        ),
    ).toHaveLength(2)
    expect(reopened.catalog.lookup(key('Lang'))?.toString()).toBe(
      PDFHexString.fromText('zh-CN').toString(),
    )
    const task = getDocument({ data: final.bytes!.slice() })
    try {
      const pdf = await task.promise
      const bookmarks = await pdf.getOutline()
      expect(bookmarks).toHaveLength(1)
      const target = bookmarks![0]!.dest as Array<{ num: number; gen: number }>
      expect(await pdf.getPageIndex(target[0]!)).toBe(1)
      for (let at = 1; at <= 2; at++) {
        const page = await pdf.getPage(at),
          annotations = await page.getAnnotations(),
          text = (await page.getTextContent()).items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
        expect(text).toContain('KEEP ORIGINAL')
        expect(text).toContain('内部资料')
        expect(text).not.toContain('SECOND ORIGINAL')
        expect(annotations.find((item) => item.fieldName === 'name')).toMatchObject({
          fieldValue: '再次填写',
          hasAppearance: true,
        })
        expect(annotations.find((item) => item.fieldName === 'country')).toMatchObject({
          fieldValue: ['China'],
          hasAppearance: true,
        })
      }
    } finally {
      await task.destroy()
    }
    expect((await readPdfFormFields(original)).fields[0]!.value).toBe('')
  })

  it('validates dry runs and rejects stale or late-invalid mixed batches without publishing bytes', async () => {
    const bytes = await fixture(),
      copy = bytes.slice(),
      before = await readPdfFormFields(bytes),
      ops: Extract<PdfFormOperation, { op: 'apply' }>['ops'] = [
        { op: 'setFormValue', value: { name: 'name', value: '预检' } },
        { op: 'setPageOrder', order: [2, 1] },
        { op: 'deletePage', page: 1 },
      ]
    expect(await write(bytes, ops, true)).toEqual({ forms: before })
    expect(await write(bytes, [ops[0]!], true)).toEqual({ forms: before })
    await expect(
      write(bytes, [...ops, { op: 'rotatePages', pages: [9], dir: 90 }]),
    ).rejects.toThrow('越界')
    await expect(
      write(bytes, [...ops, { op: 'setFormValue', value: { name: 'country', value: 'missing' } }]),
    ).rejects.toThrow('选项')
    await expect(write(bytes, [{ op: 'deletePage', page: 1 }])).rejects.toThrow('控件')
    await expect(apply(bytes, { op: 'apply', ops }, '0'.repeat(64))).rejects.toThrow('变化')
    expect(bytes).toEqual(copy)
    expect(await readPdfFormFields(bytes)).toEqual(before)
    expect(await outline(bytes)).toHaveLength(2)
  })

  it('keeps unknown Catalog, signature, XFA and active-action rejection in both preserving paths', async () => {
    for (const change of [
      (pdf: PDFDocument) =>
        pdf.catalog.set(key('UnknownCatalog'), pdf.context.obj({ Hidden: true })),
      (pdf: PDFDocument) => pdf.getForm().acroForm.dict.set(key('SigFlags'), pdf.context.obj(1)),
      (pdf: PDFDocument) => pdf.getForm().acroForm.dict.set(key('XFA'), pdf.context.obj([])),
      (pdf: PDFDocument) =>
        pdf.getForm().getTextField('name').acroField.dict.set(key('FT'), key('Sig')),
      (pdf: PDFDocument) =>
        pdf
          .getForm()
          .getTextField('name')
          .acroField.dict.set(key('AA'), pdf.context.obj({ K: { S: 'JavaScript', JS: 'bad' } })),
      (pdf: PDFDocument) => {
        const root = pdf.catalog.lookup(key('Outlines'), PDFDict),
          first = root.lookup(key('First'), PDFDict)
        first.set(
          key('A'),
          pdf.context.obj({ S: 'URI', URI: PDFHexString.fromText('https://example.com') }),
        )
      },
    ]) {
      const pdf = await PDFDocument.load(await fixture())
      change(pdf)
      const bytes = await pdf.save({ updateFieldAppearances: false }),
        copy = bytes.slice(),
        sha = (await apply(bytes, { op: 'read' })).forms.sha256
      const fieldOp = { op: 'setFormValue' as const, value: { name: 'agree', checked: true } }
      for (const ops of [
        [fieldOp],
        [fieldOp, { op: 'rotatePages' as const, pages: [1], dir: 90 as const }],
      ])
        await expect(apply(bytes, { op: 'apply', ops }, sha)).rejects.toThrow(/结构|动作|签名|XFA/)
      expect(bytes).toEqual(copy)
      expect(
        (await PDFDocument.load(bytes)).catalog
          .lookupMaybe(key('Outlines'), PDFDict)
          ?.lookupMaybe(key('First'), PDFDict),
      ).toBeDefined()
    }
  })
})
