import { createHash } from 'node:crypto'
import { currentPdfPages, pruneExtractedObjects } from './pdf-page-prune.js'
import { readFile } from 'node:fs/promises'
import fontkit from '@pdf-lib/fontkit'
import { fixCffSubsetFontDict } from './pdf-cff-font.js'
import {
  degrees,
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFStream,
  PDFTextField,
  type PDFField,
  type PDFObject,
} from 'pdf-lib'
import {
  pdfFormOperationSchema,
  type PdfFormOperation,
  type PdfFormSnapshot,
  type PdfFormField,
} from '@mimir/shared'

const key = PDFName.of
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function fieldsOf(pdf: PDFDocument): Array<{ field: PDFField; model: PdfFormField }> {
  // getForm creates AcroForm on ordinary files; reads must not create a form.
  if (!pdf.catalog.has(key('AcroForm'))) return []
  const form = pdf.getForm()
  if (form.hasXFA()) throw new Error('暂不支持 XFA 表单')
  const names = new Set<string>()
  return form.getFields().map((field) => {
    const name = field.getName()
    if (names.has(name)) throw new Error('PDF 表单字段名重复，不能安全定位')
    names.add(name)
    const type =
      field instanceof PDFTextField
        ? 'text'
        : field instanceof PDFCheckBox
          ? 'checkbox'
          : field instanceof PDFRadioGroup
            ? 'radio'
            : field instanceof PDFDropdown || field instanceof PDFOptionList
              ? 'choice'
              : 'unsupported'
    const value =
      field instanceof PDFTextField
        ? (field.getText() ?? '')
        : field instanceof PDFCheckBox
          ? field.isChecked()
          : field instanceof PDFRadioGroup
            ? (field.getSelected() ?? '')
            : field instanceof PDFDropdown || field instanceof PDFOptionList
              ? field.getSelected()
              : ''
    const options =
      field instanceof PDFRadioGroup ||
      field instanceof PDFDropdown ||
      field instanceof PDFOptionList
        ? field.getOptions()
        : []
    const widgets = field.acroField.getWidgets().map((widget) => {
      const matches = pdf
        .getPages()
        .map((page, index) => ({ page, index }))
        .filter(({ page }) =>
          page.node
            .lookupMaybe(key('Annots'), PDFArray)
            ?.asArray()
            .some((ref) => pdf.context.lookup(ref) === widget.dict),
        )
      if (matches.length !== 1) throw new Error('表单控件未关联唯一页面')
      const rect = widget.getRectangle()
      return {
        page: matches[0]!.index + 1,
        rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height] as [
          number,
          number,
          number,
          number,
        ],
      }
    })
    return {
      field,
      model: {
        name,
        type,
        value,
        options,
        readOnly: field.isReadOnly(),
        required: field.isRequired(),
        widgets,
      },
    }
  })
}
export async function readPdfFormFields(bytes: Uint8Array): Promise<PdfFormSnapshot> {
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  return { sha256: digest(bytes), fields: fieldsOf(pdf).map(({ model }) => model) }
}
export function assertPdfFormSafe(
  pdf: PDFDocument,
  catalogGuard?: (pdf: PDFDocument) => void,
): void {
  if (pdf.isEncrypted) throw new Error('加密 PDF 不能编辑表单')
  if (catalogGuard) catalogGuard(pdf)
  else {
    const unknown = pdf.catalog
      .entries()
      .map(([name]) => name.toString())
      .filter((name) => !['/Type', '/Pages', '/AcroForm'].includes(name))
    if (unknown.length) throw new Error(`表单含未支持的文档结构：${unknown.join('、')}`)
  }
  const acro = pdf.catalog.lookupMaybe(key('AcroForm'), PDFDict)
  if (acro?.has(key('XFA')) || acro?.has(key('SigFlags'))) throw new Error('XFA 或签名表单不能改写')
  if (
    acro
      ?.keys()
      .some(
        (name) => !['/Fields', '/DR', '/DA', '/NeedAppearances', '/Q'].includes(name.toString()),
      )
  )
    throw new Error('PDF 含暂未支持的表单结构')
  const seen = new Set<PDFObject>()
  const inspect = (raw: PDFObject): void => {
    const object = pdf.context.lookup(raw)
    if (!object || seen.has(object)) return
    seen.add(object)
    if (object instanceof PDFStream) inspect(object.dict)
    else if (object instanceof PDFArray) object.asArray().forEach(inspect)
    else if (object instanceof PDFDict) {
      for (const action of [...(catalogGuard ? [] : ['A']), 'AA', 'JS', 'JavaScript', 'XFA'])
        if (object.has(key(action))) throw new Error('PDF 含动作或 XFA，未编辑表单')
      if (
        object.lookup(key('FT'))?.toString() === '/Sig' ||
        object.lookup(key('Type'))?.toString() === '/Sig'
      )
        throw new Error('PDF 含签名，未编辑表单')
      object.entries().forEach(([, value]) => inspect(value))
    }
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object)
}
export async function appearanceFont(pdf: PDFDocument, values: string[]) {
  let bytes: Uint8Array | undefined
  for (const path of [
    '../fonts/NotoSansCJKsc-Regular-subset.woff2',
    '../../public/fonts/NotoSansCJKsc-Regular-subset.woff2',
  ]) {
    try {
      bytes = await readFile(new URL(path, import.meta.url))
      break
    } catch {
      /* source or production asset */
    }
  }
  if (!bytes) throw new Error('PDF 表单字体资源缺失')
  const face = fontkit.create(bytes)
  for (const value of values)
    for (const char of value.replace(/[\n\r\t]/g, ''))
      if (!face.glyphForCodePoint(char.codePointAt(0)!).id)
        throw new Error(`PDF 表单字体不支持字符：${char}`)
  // @pdf-lib/fontkit@1.1.1 CFFSubset writes cff.length into the one-byte
  // offSize header (27 for this bundled font). ISO 32000 requires 1..4.
  // Adapt only generated subset bytes; never modify font assets or dependencies.
  pdf.registerFontkit({
    create(data) {
      const font = fontkit.create(data)
      const createSubset = font.createSubset.bind(font)
      font.createSubset = () => {
        const subset = createSubset()
        fixCffSubsetFontDict(subset)
        // fontkit schedules encode on nextTick without catching errors. Forward
        // encoder failures to pdf-lib's promise instead of terminating the host.
        const encoder = subset as typeof subset & {
          encode(stream: { emit(event: 'error', error: unknown): void }): void
        }
        const encodeSubset = encoder.encode.bind(encoder)
        encoder.encode = (stream) => {
          try {
            encodeSubset(stream)
          } catch (error) {
            stream.emit('error', error)
          }
        }
        const encode = subset.encodeStream.bind(subset)
        subset.encodeStream = () => {
          const stream = encode()
          let offset = 0
          const bridge: { on: typeof stream.on } = {
            on(event, listener) {
              stream.on(
                event,
                event === 'data'
                  ? (chunk) => {
                      const copy = chunk.slice()
                      if (offset <= 3 && offset + copy.length > 3 && copy[3 - offset]! > 4)
                        copy[3 - offset] = 4
                      offset += copy.length
                      listener(copy)
                    }
                  : listener,
              )
              return bridge
            },
          }
          return bridge
        }
        return subset
      }
      return font
    },
  })
  const font = await pdf.embedFont(bytes, { subset: true })
  // CFFSubset cannot encode a charset containing only .notdef (nLeft=-1).
  // Empty/cleared fields still need a valid reusable appearance font.
  font.encodeText(' ')
  return font
}
/** Atomic working-copy writer; never persists files or weakens content rewrite guards. */
export async function applyPdfFormOperation(
  bytes: Uint8Array,
  raw: PdfFormOperation,
  expectedSha256?: string,
  catalogGuard?: (pdf: PDFDocument) => void,
): Promise<{ bytes?: Uint8Array; forms: PdfFormSnapshot }> {
  const operation = pdfFormOperationSchema.parse(raw)
  if (operation.op === 'read') return { forms: await readPdfFormFields(bytes) }
  if (expectedSha256 !== digest(bytes)) throw new Error('PDF 表单字节已变化，请重新读取')
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  const originalPages = [...pdf.getPages()]
  assertPdfFormSafe(pdf, catalogGuard)
  const fields = fieldsOf(pdf)
  const applyValue = await preparePdfFormValues(
    pdf,
    operation.ops.filter((op) => op.op === 'setFormValue'),
  )
  for (const op of operation.ops) {
    if (op.op === 'setFormValue') {
      applyValue(op)
    } else if (op.op === 'rotatePages') {
      if (new Set(op.pages).size !== op.pages.length) throw new Error('旋转页号重复')
      for (const page of op.pages) {
        if (page > pdf.getPageCount()) throw new Error('旋转页号无效')
        const target = currentPdfPages(pdf)[page - 1]!
        target.setRotation(degrees((((target.getRotation().angle + op.dir) % 360) + 360) % 360))
      }
    } else if (op.op === 'deletePage') {
      if (op.page > pdf.getPageCount() || pdf.getPageCount() <= 1)
        throw new Error('删除页号无效或只剩一页')
      const page = currentPdfPages(pdf)[op.page - 1]!
      if (
        fields.some(({ field }) =>
          field.acroField.getWidgets().some((widget) =>
            page.node
              .lookupMaybe(key('Annots'), PDFArray)
              ?.asArray()
              .some((ref) => pdf.context.lookup(ref) === widget.dict),
          ),
        )
      )
        throw new Error('不能删除含表单控件的页面')
      pdf.removePage(op.page - 1)
    } else {
      if (
        op.order.length !== pdf.getPageCount() ||
        new Set(op.order).size !== op.order.length ||
        op.order.some((page) => page > pdf.getPageCount())
      )
        throw new Error('页面顺序必须包含所有页面且不重复')
      const pages = currentPdfPages(pdf)
      for (let at = pages.length - 1; at >= 0; at--) pdf.removePage(at)
      for (const at of op.order) pdf.addPage(pages[at - 1]!)
    }
  }
  const currentRefs = new Set(currentPdfPages(pdf).map((page) => page.ref.toString()))
  const removedRefs = new Set(
    originalPages
      .filter((page) => !currentRefs.has(page.ref.toString()))
      .map((page) => page.ref.toString()),
  )
  if (removedRefs.size) pruneExtractedObjects(pdf, removedRefs)
  const result = await pdf.save({ updateFieldAppearances: false })
  const after = await readPdfFormFields(result)
  const finalValues = new Map(
    operation.ops.filter((op) => op.op === 'setFormValue').map((op) => [op.value.name, op.value]),
  )
  await verifyPdfFormValues(result, finalValues)
  return operation.dryRun
    ? { forms: await readPdfFormFields(bytes) }
    : { bytes: result, forms: after }
}

type PdfFormValueOperation = Extract<
  Extract<PdfFormOperation, { op: 'apply' }>['ops'][number],
  { op: 'setFormValue' }
>

/** Prepare once on a detached graph; every value is checked before the first mutation. */
export async function preparePdfFormValues(
  pdf: PDFDocument,
  operations: readonly PdfFormValueOperation[],
) {
  const fields = fieldsOf(pdf)
  if (fields.some(({ model }) => model.type === 'unsupported'))
    throw new Error('PDF 含不支持的表单字段类型')
  const values: string[] = []
  for (const [opIndex, op] of operations.entries()) {
    try {
      const entry = fields.find(({ model }) => model.name === op.value.name)
      if (!entry) throw new Error(`表单字段不存在：${op.value.name}`)
      const { field, model } = entry
      if (model.readOnly) throw new Error(`表单字段只读：${model.name}`)
      if (field instanceof PDFCheckBox) {
        if (typeof op.value.checked !== 'boolean' || op.value.value !== undefined)
          throw new Error('勾选字段须使用 checked')
      } else {
        if (op.value.checked !== undefined) throw new Error('非勾选字段不能使用 checked')
        const value = op.value.value ?? ''
        if (field instanceof PDFTextField) {
          if (field.isRichFormatted() || field.isFileSelector())
            throw new Error('暂不支持富文本或文件字段')
          if (field.getMaxLength() !== undefined && value.length > field.getMaxLength()!)
            throw new Error('表单文字超过字段长度限制')
          if (!field.isMultiline() && /[\r\n]/.test(value))
            throw new Error('单行字段不能写入多行文字')
        } else if (value && !model.options.includes(value)) throw new Error('表单选项无效')
        if (
          field instanceof PDFTextField ||
          field instanceof PDFDropdown ||
          field instanceof PDFOptionList
        )
          values.push(value, ...model.options)
      }
    } catch (error) {
      throw new Error(
        `PDF 表单第 ${opIndex + 1} 项：${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
  const font = values.length ? await appearanceFont(pdf, values) : undefined
  return (op: PdfFormValueOperation) => {
    const field = fields.find(({ model }) => model.name === op.value.name)!.field
    const value = op.value.value ?? ''
    if (field instanceof PDFTextField) {
      field.setText(value)
      field.updateAppearances(font!)
    } else if (field instanceof PDFCheckBox) {
      if (op.value.checked) field.check()
      else field.uncheck()
      field.updateAppearances()
    } else if (field instanceof PDFRadioGroup) {
      if (value) field.select(value)
      else field.clear()
      field.updateAppearances()
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (value) field.select(value)
      else field.clear()
      field.updateAppearances(font!)
    }
  }
}

export async function verifyPdfFormValues(
  result: Uint8Array,
  finalValues: ReadonlyMap<string, PdfFormValueOperation['value']>,
): Promise<void> {
  const after = await readPdfFormFields(result)
  for (const [name, value] of finalValues) {
    const model = after.fields.find((field) => field.name === name)
    const expected = model?.type === 'checkbox' ? value.checked : (value.value ?? '')
    const actual = Array.isArray(model?.value) ? model.value.join('') : model?.value
    if (!model || actual !== expected) throw new Error('PDF 表单字段读回不一致')
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: result.slice(), useSystemFonts: false })
  try {
    const parsed = await task.promise
    const all = (
      await Promise.all(
        Array.from({ length: parsed.numPages }, async (_, at) =>
          (await parsed.getPage(at + 1)).getAnnotations(),
        ),
      )
    ).flat()
    for (const [name, value] of finalValues) {
      const widgets = all.filter((item) => item.fieldName === name)
      if (!widgets.length || widgets.some((widget) => !widget.hasAppearance))
        throw new Error('PDF 表单缺少可见外观')
      if (
        value.value !== undefined &&
        widgets.some((widget) => {
          const actual = Array.isArray(widget.fieldValue)
            ? widget.fieldValue.join('')
            : (widget.fieldValue ?? '')
          return (
            actual !== value.value &&
            !(
              value.value === '' &&
              actual === 'Off' &&
              after.fields.find((field) => field.name === name)?.type === 'radio'
            )
          )
        })
      )
        throw new Error(
          `PDF 表单未通过独立字段读回：${name} ${JSON.stringify(widgets.map((item) => item.fieldValue))}`,
        )
    }
  } finally {
    await task.destroy()
  }
}
