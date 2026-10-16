import { createHash, randomUUID } from 'node:crypto'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib'
import {
  pdfAnnotationOperationSchema,
  type PdfAnnotation,
  type PdfAnnotationOperation,
  type PdfAnnotationSnapshot,
} from '@mimir/shared'
import { assertSafeToRewrite } from './pdf-agent-host.js'

const key = PDFName.of
function text(dict: PDFDict, name: string): string {
  const value = dict.lookup(key(name))
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : ''
}
interface Entry {
  annotation: PdfAnnotation
  dict: PDFDict
  ref: PDFRef
  array: PDFArray
}
function entries(pdf: PDFDocument): Entry[] {
  const result: Entry[] = []
  const ids = new Set<string>()
  for (const [index, page] of pdf.getPages().entries()) {
    const array = page.node.lookupMaybe(key('Annots'), PDFArray)
    if (!array) continue
    const pageEntries: Entry[] = []
    for (let at = 0; at < array.size(); at++) {
      const ref = array.get(at)
      const dict = pdf.context.lookup(ref)
      if (!(ref instanceof PDFRef) || !(dict instanceof PDFDict)) continue
      const subtype = dict.lookup(key('Subtype'))?.toString()
      const type =
        subtype === '/Text'
          ? 'note'
          : subtype === '/Highlight'
            ? 'highlight'
            : subtype === '/Underline'
              ? 'underline'
              : subtype === '/StrikeOut'
                ? 'strikeout'
                : null
      if (!type) continue
      const id = text(dict, 'NM') || `R${ref.objectNumber}-${ref.generationNumber}`
      if (ids.has(id)) throw new Error('PDF 批注标识重复，不能安全定位')
      ids.add(id)
      pageEntries.push({
        annotation: {
          id,
          page: index + 1,
          type,
          text: text(dict, 'Contents'),
          author: text(dict, 'T'),
        },
        dict,
        ref,
        array,
      })
    }
    for (const entry of pageEntries) {
      const parent = entry.dict.get(key('IRT'))
      if (parent instanceof PDFRef) {
        const root = pageEntries.find((candidate) => candidate.ref.toString() === parent.toString())
        if (root) entry.annotation.parentId = root.annotation.id
        else entry.annotation.parentId = `R${parent.objectNumber}-${parent.generationNumber}`
      }
    }
    result.push(...pageEntries)
  }
  return result
}
function snapshot(bytes: Uint8Array, all: Entry[]): PdfAnnotationSnapshot {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    annotations: all.map((entry) => entry.annotation),
  }
}

/** Saved and unsaved bytes have the same annotation identity and thread representation. */
export async function readPdfAnnotations(bytes: Uint8Array): Promise<PdfAnnotationSnapshot> {
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  return snapshot(bytes, entries(pdf))
}

export async function applyPdfAnnotationOperation(
  bytes: Uint8Array,
  raw: PdfAnnotationOperation,
  expectedSha256?: string,
  author = 'AI Assistant',
): Promise<{ bytes: Uint8Array; annotations: PdfAnnotationSnapshot }> {
  const op = pdfAnnotationOperationSchema.parse(raw)
  if (op.op === 'read') return { bytes, annotations: await readPdfAnnotations(bytes) }
  const sha = createHash('sha256').update(bytes).digest('hex')
  if (!expectedSha256 || sha !== expectedSha256) throw new Error('PDF 原件已变化，请重新读取批注')
  await assertSafeToRewrite(bytes)
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  const all = entries(pdf)
  const page = pdf.getPage(op.pageIndex)
  if (!page) throw new Error('批注页号已失效')
  const onPage = all.filter((entry) => entry.annotation.page === op.pageIndex + 1)
  const removed = new Set<Entry>()
  let expectedText: { id: string; text: string } | undefined
  if (op.op === 'add_note' || op.op === 'reply_note') {
    let rect: number[]
    let parent: Entry | undefined
    if (op.op === 'reply_note') {
      parent = onPage.find(
        (entry) =>
          entry.annotation.id === op.note_id &&
          entry.annotation.type === 'note' &&
          !entry.annotation.parentId,
      )
      if (!parent) throw new Error('找不到便笺根批注，请重新读取')
      rect = parent.dict
        .lookup(key('Rect'), PDFArray)
        .asArray()
        .map((value) => Number(value.toString()))
    } else {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const task = getDocument({ data: bytes.slice() })
      try {
        const viewport = (await (await task.promise).getPage(op.pageIndex + 1)).getViewport({
          scale: 1,
        })
        if (op.x > viewport.width - 20 || op.y > viewport.height - 20)
          throw new Error('便笺位置超出页面范围')
        const a = viewport.convertToPdfPoint(op.x, op.y)
        const b = viewport.convertToPdfPoint(op.x + 20, op.y + 20)
        rect = [
          Math.min(a[0]!, b[0]!),
          Math.min(a[1]!, b[1]!),
          Math.max(a[0]!, b[0]!),
          Math.max(a[1]!, b[1]!),
        ]
      } finally {
        await task.destroy()
      }
    }
    const id = `N${randomUUID()}`
    const color =
      op.op === 'add_note' && op.color
        ? [1, 3, 5].map((at) => parseInt(op.color!.slice(at, at + 2), 16) / 255)
        : [1, 0.82, 0]
    const dict = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: rect,
      Contents: PDFHexString.fromText(op.text),
      T: PDFHexString.fromText(author),
      NM: PDFString.of(id),
      Name: 'Comment',
      C: color,
      F: 4,
      P: page.ref,
      ...(parent ? { IRT: parent.ref, RT: 'R' } : {}),
    })
    const ref = pdf.context.register(dict)
    const annots = page.node.lookupMaybe(key('Annots'), PDFArray)
    if (annots) annots.push(ref)
    else page.node.set(key('Annots'), pdf.context.obj([ref]))
    expectedText = { id, text: op.text }
  } else if (op.op === 'edit_note') {
    const target = onPage.find(
      (entry) => entry.annotation.id === op.note_id && entry.annotation.type === 'note',
    )
    if (!target) throw new Error('找不到便笺或回复，请重新读取')
    target.dict.set(key('Contents'), PDFHexString.fromText(op.text))
    // Pin legacy object-reference IDs before any later serializer renumbers objects.
    target.dict.set(key('NM'), PDFString.of(target.annotation.id))
    expectedText = { id: target.annotation.id, text: op.text }
  } else if (op.op === 'delete_note') {
    const root = onPage.find(
      (entry) =>
        entry.annotation.id === op.note_id &&
        entry.annotation.type === 'note' &&
        !entry.annotation.parentId,
    )
    if (!root) throw new Error('找不到便笺根批注，请重新读取')
    removed.add(root)
    let changed = true
    while (changed) {
      changed = false
      for (const entry of onPage)
        if (
          entry.annotation.parentId &&
          [...removed].some((parent) => parent.annotation.id === entry.annotation.parentId) &&
          !removed.has(entry)
        ) {
          removed.add(entry)
          changed = true
        }
    }
  } else {
    const matching = onPage.filter(
      (entry) =>
        entry.annotation.type !== 'note' &&
        (!op.type || entry.annotation.type === op.type) &&
        (!op.markup_ids || op.markup_ids.includes(entry.annotation.id)),
    )
    if (
      !matching.length ||
      op.markup_ids?.some((id) => !matching.some((entry) => entry.annotation.id === id))
    )
      throw new Error('找不到指定文字标注，请重新读取')
    for (const entry of matching) removed.add(entry)
  }
  // Do not orphan an annotation subtype whose reply semantics are not modeled here.
  for (const candidate of page.node.lookupMaybe(key('Annots'), PDFArray)?.asArray() ?? []) {
    const dict = pdf.context.lookup(candidate)
    if (!(dict instanceof PDFDict)) continue
    const parent = dict.get(key('IRT'))
    if (
      parent &&
      [...removed].some((entry) => entry.ref.toString() === parent.toString()) &&
      ![...removed].some((entry) => entry.ref.toString() === candidate.toString())
    )
      throw new Error('便笺包含暂不支持的回复类型，未删除线程')
  }
  for (const entry of removed) {
    // Popups belong to deleted annotations; preserve unrelated annotation objects.
    const popup = entry.dict.get(key('Popup'))
    for (let at = entry.array.size() - 1; at >= 0; at--) {
      const ref = entry.array.get(at).toString()
      if (ref === entry.ref.toString() || (popup && ref === popup.toString()))
        entry.array.remove(at)
    }
  }
  const result = await pdf.save()
  const after = await readPdfAnnotations(result)
  if (
    expectedText &&
    !after.annotations.some(
      (entry) => entry.id === expectedText.id && entry.text === expectedText.text,
    )
  )
    throw new Error('PDF 批注读回失败，未写入')
  if (
    [...removed].some((entry) => after.annotations.some((next) => next.id === entry.annotation.id))
  )
    throw new Error('PDF 批注删除读回失败，未写入')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: result.slice() })
  try {
    const annotations = await (
      await (await task.promise).getPage(op.pageIndex + 1)
    ).getAnnotations()
    if (expectedText && !annotations.some((item) => item.contentsObj?.str === expectedText.text))
      throw new Error('PDF 批注未通过独立读回，未写入')
  } finally {
    await task.destroy()
  }
  return { bytes: result, annotations: after }
}
