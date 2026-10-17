import { createHash, randomUUID } from 'node:crypto'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFObject,
  PDFPage,
  PDFPageLeaf,
  PDFRef,
  PDFStream,
  degrees,
} from 'pdf-lib'
import type { PdfLocalOperation } from '@mimir/shared'
import {
  pdfDrawingGeometry,
  readPdfDrawings,
  transformPdfDrawings,
} from './pdf-drawing-geometry.js'
import {
  preparePdfVisualSignatureScale,
  clonePdfVisualSignatureId,
} from './pdf-visual-signatures.js'
const key = PDFName.of
export type PdfPageLayout = Extract<PdfLocalOperation, { op: 'apply_page_layout' }>['pages']

/** Scale content and annotations together; frame them without translating either. */
export function resizePdfPage(page: PDFPage, width: number, height: number) {
  const before = pdfDrawingGeometry(page),
    b = page.getCropBox(),
    k = Math.min(width / b.width, height / b.height)
  const finishSignatures = preparePdfVisualSignatureScale(page, k)
  page.scaleContent(k, k)
  page.scaleAnnotations(k, k)
  finishSignatures()
  const x = b.x * k - (width - b.width * k) / 2,
    y = b.y * k - (height - b.height * k) / 2
  page.setMediaBox(x, y, width, height)
  page.setCropBox(x, y, width, height)
  transformPdfDrawings(page, before, k)
}

/** Clone annotations independently while retaining native page and field targets. */
function duplicate(
  pdf: PDFDocument,
  source: PDFPage,
  originals: PDFPage[],
  occurrence: number,
  drawingIds: Set<string>,
) {
  const node = source.node.clone()
  for (const name of PDFPageLeaf.InheritableEntries) {
    const value = source.node.getInheritableAttribute(key(name))
    if (value && !node.has(key(name))) node.set(key(name), value)
  }
  node.delete(key('Parent'))
  node.delete(key('Annots'))
  const contents = source.node.lookup(key('Contents'))
  if (contents instanceof PDFArray) node.set(key('Contents'), contents.clone())
  const ref = pdf.context.register(node),
    copy = PDFPage.of(node, ref, pdf)
  const mapped = new Map<PDFObject, PDFObject>([[source.ref, ref]])
  const fields = pdf.catalog.has(key('AcroForm')) ? pdf.getForm().getFields() : []
  for (const page of originals) if (page !== source) mapped.set(page.ref, page.ref)
  for (const field of fields) mapped.set(field.ref, field.ref)
  const widgets = new Map(
    fields.flatMap((field) =>
      field.acroField.getWidgets().map((widget) => [widget.dict, field] as const),
    ),
  )
  const clone = (obj: PDFObject): PDFObject => {
    const prior = mapped.get(obj)
    if (prior) return prior
    if (obj instanceof PDFRef) {
      const value = pdf.context.lookup(obj)
      if (!value) throw new Error('页面批注包含失效引用，无法复制')
      const next = pdf.context.nextRef()
      mapped.set(obj, next)
      pdf.context.assign(next, clone(value))
      return next
    }
    // Appearance streams are immutable here; clone the numeric annotation arrays.
    if (obj instanceof PDFStream) return obj
    if (obj instanceof PDFDict) {
      const next = obj.clone()
      mapped.set(obj, next)
      for (const [name, value] of obj.entries()) next.set(name, clone(value))
      return next
    }
    if (obj instanceof PDFArray) {
      const next = obj.clone()
      mapped.set(obj, next)
      obj.asArray().forEach((value, i) => next.set(i, clone(value)))
      return next
    }
    return obj.clone()
  }
  const annots = source.node.lookupMaybe(key('Annots'), PDFArray)
  for (const raw of annots?.asArray() ?? []) {
    const original = pdf.context.lookup(raw)
    if (!(original instanceof PDFDict)) throw new Error('页面批注结构无效，无法复制')
    const field = widgets.get(original)
    const cloned = clone(original) as PDFDict
    const annotationRef =
      raw instanceof PDFRef && !fields.some((f) => f.ref === raw)
        ? (clone(raw) as PDFRef)
        : pdf.context.register(cloned)
    cloned.set(key('P'), ref)
    cloned.set(key('NM'), PDFHexString.fromText(randomUUID()))
    clonePdfVisualSignatureId(
      source,
      original,
      cloned,
      `MVS-${createHash('sha256')
        .update(
          JSON.stringify([
            source.ref.toString(),
            original.lookup(key('NM'))?.toString(),
            occurrence,
          ]),
        )
        .digest('hex')}`,
    )
    if (field) {
      for (const name of ['T', 'FT', 'V', 'DV', 'Kids', 'Ff']) cloned.delete(key(name))
      cloned.set(key('Parent'), field.ref)
      field.acroField.addWidget(annotationRef)
    } else if (cloned.lookup(key('Subtype'))?.toString() === '/Widget')
      throw new Error('页面含未绑定的表单控件，无法安全复制')
    node.addAnnot(annotationRef)
  }
  const items = readPdfDrawings(source)
  if (items.length) {
    node.set(
      key('MimirDrawings'),
      PDFHexString.fromText(
        JSON.stringify(
          items.map((d) => {
            // Reads and writes materialize the same pending layout separately.
            // Keep IDs stable on replay and unique after another save/copy.
            let attempt = 0
            let id: string
            do {
              id = createHash('sha256')
                .update(JSON.stringify([source.ref.toString(), d.id, occurrence, attempt++]))
                .digest('hex')
            } while (drawingIds.has(id))
            drawingIds.add(id)
            return Object.assign({}, d, { id })
          }),
        ),
      ),
    )
  }
  return copy
}

export function applyPdfPageLayout(pdf: PDFDocument, layout: PdfPageLayout) {
  const originals = [...pdf.getPages()],
    used = new Map<number, number>(),
    originalDrawings = originals.map(readPdfDrawings),
    drawingIds = new Set(originalDrawings.flatMap((items) => items.map((d) => d.id)))
  for (const entry of layout) {
    if ((entry.source_page === undefined) === (entry.blank === undefined))
      throw new Error('页面须指定来源页或空白尺寸')
    if (entry.source_page && !originals[entry.source_page - 1]) throw new Error('来源页码越界')
  }
  if (
    layout.reduce(
      (count, entry) =>
        count + (entry.source_page ? originalDrawings[entry.source_page - 1]!.length : 0),
      0,
    ) > 500
  )
    throw new Error('页面复制后绘图超过 500 项')
  const retained = new Set(layout.flatMap((e) => (e.source_page ? [e.source_page - 1] : [])))
  if (pdf.catalog.has(key('AcroForm'))) {
    const form = pdf.getForm()
    for (const field of form.getFields()) {
      const widgets = field.acroField.getWidgets()
      const dropped = widgets.flatMap((widget, i) => {
        const owner = originals.findIndex((page) =>
          page.node
            .lookupMaybe(key('Annots'), PDFArray)
            ?.asArray()
            .some((r) => pdf.context.lookup(r) === widget.dict),
        )
        if (owner < 0) throw new Error('表单控件缺少有效页面，无法调整页序')
        return retained.has(owner) ? [] : [i]
      })
      if (dropped.length === widgets.length) form.acroForm.removeField(field.acroField)
      else for (const i of dropped.toReversed()) field.acroField.removeWidget(i)
    }
  }
  // Prepare all copies before mutating any original's geometry.
  const pages = layout.map((entry) => {
    if (entry.blank) return PDFPage.create(pdf)
    const index = entry.source_page! - 1,
      source = originals[index]!
    const occurrence = used.get(index) ?? 0
    used.set(index, occurrence + 1)
    if (occurrence) return duplicate(pdf, source, originals, occurrence, drawingIds)
    return source
  })
  pages.forEach((page, i) => {
    const entry = layout[i]!
    const before = pdfDrawingGeometry(page)
    if (entry.blank) page.setSize(entry.blank.width, entry.blank.height)
    page.setRotation(degrees(entry.rotation))
    if (entry.crop) {
      const b = page.getCropBox(),
        c = entry.crop,
        width = b.width - c.left - c.right,
        height = b.height - c.top - c.bottom
      if (width <= 0 || height <= 0) throw new Error('裁剪后的页面尺寸不是正数')
      page.setCropBox(b.x + c.left, b.y + c.bottom, width, height)
    }
    transformPdfDrawings(page, before)
    if (entry.paper) resizePdfPage(page, entry.paper.width, entry.paper.height)
  })
  while (pdf.getPageCount()) pdf.removePage(0)
  pages.forEach((page) => pdf.addPage(page))
  return {
    removed: new Set(originals.filter((_, i) => !retained.has(i)).map((p) => p.ref.toString())),
    remap: (page: number) => layout.findIndex((entry) => entry.source_page === page) + 1,
  }
}
