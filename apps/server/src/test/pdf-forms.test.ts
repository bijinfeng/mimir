import fontkit from '@pdf-lib/fontkit'
import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFDict, PDFName, decodePDFRawStream, StandardFonts } from 'pdf-lib'
import { applyPdfFormOperation, readPdfFormFields } from '../services/pdf-forms.js'
import { assertSafeToRewrite } from '../services/pdf-agent-host.js'

async function fixture() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([400, 500])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('KEEP ORIGINAL', { x: 30, y: 450, font, size: 12 })
  pdf.addPage([400, 500])
  const form = pdf.getForm()
  form.createTextField('name').addToPage(page, { x: 30, y: 350, width: 220, height: 40 })
  form.createCheckBox('agree').addToPage(page, { x: 30, y: 300, width: 20, height: 20 })
  const radio = form.createRadioGroup('color')
  radio.addOptionToPage('red', page, { x: 30, y: 250, width: 20, height: 20 })
  radio.addOptionToPage('blue', page, { x: 80, y: 250, width: 20, height: 20 })
  const choice = form.createDropdown('country')
  choice.addOptions(['China', 'Japan'])
  choice.addToPage(page, { x: 30, y: 200, width: 180, height: 30 })
  return pdf.save()
}
async function write(bytes: Uint8Array, ops: unknown[], dryRun = false) {
  const snapshot = await readPdfFormFields(bytes)
  return applyPdfFormOperation(
    bytes,
    { op: 'apply', ops, dryRun } as Parameters<typeof applyPdfFormOperation>[1],
    snapshot.sha256,
  )
}

describe('PDF form working-copy writer', () => {
  it('renders interleaved CFF font-dictionary glyphs in an editable form appearance', async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([300, 100]),
      field = pdf.getForm().createTextField('name')
    field.addToPage(page, { x: 20, y: 30, width: 250, height: 40, borderWidth: 0 })
    field.setFontSize(20)
    const text = '收入稳定增长本期工作',
      result = await write(await pdf.save(), [
        { op: 'setFormValue', value: { name: 'name', value: text } },
      ])
    expect(result.forms.fields[0]).toMatchObject({ value: text, readOnly: false })
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: result.bytes!.slice(), useSystemFonts: false }),
      opened = await task.promise,
      renderedPage = await opened.getPage(1),
      viewport = renderedPage.getViewport({ scale: 2 })
    type RenderOptions = Parameters<typeof renderedPage.render>[0]
    const factory = opened.canvasFactory as {
      create(
        width: number,
        height: number,
      ): {
        canvas: NonNullable<RenderOptions['canvas']>
        context: NonNullable<RenderOptions['canvasContext']>
      }
      destroy(surface: unknown): void
    }
    const surface = factory.create(viewport.width, viewport.height)
    try {
      await renderedPage.render({
        canvasContext: surface.context,
        viewport,
        canvas: surface.canvas,
      }).promise
      const counts = Array.from(text, (_, i) => {
        const pixels = surface.context.getImageData(44 + i * 40, 60, 36, 80).data
        let dark = 0
        for (let p = 0; p < pixels.length; p += 4)
          if (pixels[p]! < 150 && pixels[p + 1]! < 150 && pixels[p + 2]! < 150) dark++
        return dark
      })
      expect(Math.min(...counts)).toBeGreaterThan(20)
    } finally {
      factory.destroy(surface)
      await task.destroy()
    }
  })
  it('reads real widgets without creating AcroForm on ordinary files', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    expect((await readPdfFormFields(bytes)).fields).toEqual([])
    expect((await PDFDocument.load(bytes)).catalog.has(PDFName.of('AcroForm'))).toBe(false)
    const forms = await readPdfFormFields(await fixture())
    expect(forms.fields).toMatchObject([
      { name: 'name', type: 'text', value: '', widgets: [{ page: 1, rect: expect.any(Array) }] },
      { name: 'agree', type: 'checkbox', value: false },
      { name: 'color', type: 'radio', options: ['red', 'blue'] },
      { name: 'country', type: 'choice', options: ['China', 'Japan'] },
    ])
  })
  it('saves Chinese appearance, checkbox/radio/choice, then clears and saves again without flattening', async () => {
    const original = await fixture()
    const first = await write(original, [
      { op: 'setFormValue', value: { name: 'name', value: '中文姓名' } },
      { op: 'setFormValue', value: { name: 'agree', checked: true } },
      { op: 'setFormValue', value: { name: 'color', value: 'blue' } },
      { op: 'setFormValue', value: { name: 'country', value: 'China' } },
    ])
    expect(first.forms.fields.map((field) => field.value)).toEqual([
      '中文姓名',
      true,
      'blue',
      ['China'],
    ])
    const second = await write(first.bytes!, [
      { op: 'setFormValue', value: { name: 'name', value: '第二次保存' } },
      { op: 'setFormValue', value: { name: 'agree', checked: false } },
      { op: 'setFormValue', value: { name: 'color', value: '' } },
      { op: 'setFormValue', value: { name: 'country', value: '' } },
    ])
    expect(second.forms.fields.map((field) => field.value)).toEqual(['第二次保存', false, '', []])
    const reopened = await PDFDocument.load(second.bytes!)
    let cffFonts = 0
    for (const [, object] of reopened.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict) || !object.has(PDFName.of('FontFile3'))) continue
      const stream = reopened.context.lookup(object.get(PDFName.of('FontFile3')))!
      const data = decodePDFRawStream(stream as Parameters<typeof decodePDFRawStream>[0]).decode()
      expect(Array.from(data.slice(0, 4))).toEqual([1, 0, 4, 4])
      cffFonts++
    }
    expect(cffFonts).toBeGreaterThan(0)
    expect(reopened.getForm().getTextField('name').isReadOnly()).toBe(false)
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: second.bytes!.slice() })
    try {
      const page = await (await task.promise).getPage(1)
      expect((await page.getTextContent()).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ str: 'KEEP ORIGINAL' })]),
      )
      expect((await page.getAnnotations()).find((item) => item.fieldName === 'name')).toMatchObject(
        { fieldValue: '第二次保存', hasAppearance: true },
      )
    } finally {
      await task.destroy()
    }
    await expect(assertSafeToRewrite(second.bytes!)).rejects.toThrow('AcroForm')
  })
  it('atomically mixes form/page changes, verifies dry-run, and refuses invalid batches', async () => {
    const bytes = await fixture()
    const copy = bytes.slice()
    const ops = [
      { op: 'setFormValue', value: { name: 'name', value: '预检' } },
      { op: 'rotatePages', pages: [1], dir: 90 },
      { op: 'setPageOrder', order: [2, 1] },
    ]
    expect((await write(bytes, ops, true)).bytes).toBeUndefined()
    expect(bytes).toEqual(copy)
    expect((await readPdfFormFields(bytes)).fields[0]!.value).toBe('')
    const changed = await write(bytes, ops)
    expect(changed.forms.fields[0]!.widgets[0]!.page).toBe(2)
    expect((await PDFDocument.load(changed.bytes!)).getPage(1).getRotation().angle).toBe(90)
    await expect(
      write(bytes, [...ops, { op: 'setFormValue', value: { name: 'country', value: 'missing' } }]),
    ).rejects.toThrow('选项')
    await expect(write(bytes, [{ op: 'deletePage', page: 1 }])).rejects.toThrow('控件')
    await expect(
      write(bytes, [{ op: 'setFormValue', value: { name: 'agree', value: 'yes' } }]),
    ).rejects.toThrow('checked')
    await expect(applyPdfFormOperation(bytes, { op: 'apply', ops: [] }, 'bad')).rejects.toThrow(
      /.+/,
    )
    expect(bytes).toEqual(copy)
  })
  it('applies separate toolbar writes and clears without an unused or empty CFF subset', async () => {
    let bytes = await fixture()
    const edits = [
      { name: 'name', value: '中文表单验收' },
      { name: 'agree', checked: true },
      { name: 'color', value: 'blue' },
      { name: 'country', value: 'Japan' },
      { name: 'name', value: '' },
      { name: 'country', value: '' },
      { name: 'color', value: '' },
      { name: 'agree', checked: false },
    ]
    for (const value of edits) {
      const previous = bytes.slice()
      const result = await write(bytes, [{ op: 'setFormValue', value }])
      expect(bytes).toEqual(previous)
      bytes = result.bytes!
      const reopened = await readPdfFormFields(bytes)
      const field = reopened.fields.find((item) => item.name === value.name)!
      expect(field.value).toEqual(
        'checked' in value
          ? value.checked
          : field.type === 'choice'
            ? value.value
              ? [value.value]
              : []
            : value.value,
      )
    }
    expect((await readPdfFormFields(bytes)).fields.map((field) => field.value)).toEqual([
      '',
      false,
      '',
      [],
    ])
  })
  it('returns asynchronous font encoder failures to the caller and keeps later edits usable', async () => {
    const createFont = fontkit.create
    const create = vi.spyOn(fontkit, 'create').mockImplementation((...args) => {
      const font = createFont(...args),
        subset = font.createSubset.bind(font)
      font.createSubset = () => {
        const result = subset() as ReturnType<typeof subset> & { encode(): void }
        result.encode = () => {
          throw new Error('font subset encoder failed')
        }
        return result
      }
      return font
    })
    const bytes = await fixture()
    try {
      await expect(
        write(bytes, [{ op: 'setFormValue', value: { name: 'name', value: '失败' } }]),
      ).rejects.toThrow('font subset encoder failed')
    } finally {
      create.mockRestore()
    }
    expect(
      (await write(bytes, [{ op: 'setFormValue', value: { name: 'name', value: '恢复' } }])).forms
        .fields[0]!.value,
    ).toBe('恢复')
  })
  it('refuses readonly, unsupported glyphs, XFA, signatures and actions without touching bytes', async () => {
    const base = await fixture()
    const readonly = await PDFDocument.load(base)
    readonly.getForm().getTextField('name').enableReadOnly()
    await expect(
      write(await readonly.save(), [{ op: 'setFormValue', value: { name: 'name', value: 'x' } }]),
    ).rejects.toThrow('只读')
    await expect(
      write(base, [{ op: 'setFormValue', value: { name: 'name', value: '😀' } }]),
    ).rejects.toThrow('字符')
    for (const name of ['XFA', 'SigFlags']) {
      const pdf = await PDFDocument.load(base)
      pdf
        .getForm()
        .acroForm.dict.set(
          PDFName.of(name),
          name === 'XFA' ? pdf.context.obj([]) : pdf.context.obj(1),
        )
      await expect(
        write(await pdf.save({ updateFieldAppearances: false }), [
          { op: 'setFormValue', value: { name: 'agree', checked: true } },
        ]),
      ).rejects.toThrow(/.+/)
    }
    const pdf = await PDFDocument.load(base)
    pdf
      .getForm()
      .getTextField('name')
      .acroField.dict.set(PDFName.of('AA'), pdf.context.obj({ K: { S: 'JavaScript', JS: 'bad' } }))
    await expect(
      write(await pdf.save(), [{ op: 'setFormValue', value: { name: 'name', value: 'x' } }]),
    ).rejects.toThrow('动作')
  })
})
