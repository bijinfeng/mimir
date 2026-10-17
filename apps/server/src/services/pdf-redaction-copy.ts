import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFObject, PDFStream } from 'pdf-lib'
import { pdfLocalOperationSchema, type PdfLocalOperation } from '@mimir/shared'
import { assertSafeToRewrite, initializePdfAgentHost } from './pdf-agent-host.js'
import { discardUnreachablePdfObjects } from './pdf-page-prune.js'

const MAX_BYTES = 50 * 1024 * 1024
const MAX_PAGE_SCANS = 10_000

type RedactCopy = Extract<PdfLocalOperation, { op: 'redact_copy' }>

const PAGE_KEYS = new Set([
  'Type',
  'Parent',
  'Resources',
  'Contents',
  'MediaBox',
  'CropBox',
  'BleedBox',
  'TrimBox',
  'ArtBox',
  'Rotate',
  'UserUnit',
  'Annots',
])
const PAGE_TREE_KEYS = new Set([
  'Type',
  'Parent',
  'Kids',
  'Count',
  'Resources',
  'MediaBox',
  'CropBox',
  'Rotate',
])
function assertPageSideChannelsSafe(pdf: PDFDocument, pageIndex: number) {
  const page = pdf.getPage(pageIndex)
  const seen = new Set<PDFObject>()
  let node: PDFDict | undefined = page.node
  while (node) {
    if (seen.has(node)) throw new Error('页面继承结构循环，无法生成涂黑副本')
    seen.add(node)
    const allowed = node === page.node ? PAGE_KEYS : PAGE_TREE_KEYS
    if (node.keys().some((name) => !allowed.has(name.decodeText())))
      throw new Error('目标页含可编辑图层缓存或未支持的页面属性，暂不能安全生成涂黑副本')
    node = node.lookupMaybe(PDFName.of('Parent'), PDFDict)
  }
  // Named marked-content properties and metadata caches survive native GenerateContent.
  // Inspect inherited resources too, including nested Form/image dictionaries.
  const resourcesSeen = new Set<PDFObject>()
  const visit = (raw: PDFObject | undefined, depth = 0) => {
    if (!raw) return
    const object = pdf.context.lookup(raw)
    if (!object || resourcesSeen.has(object)) return
    if (depth > 128 || resourcesSeen.size >= 100_000) throw new Error('页面资源超过涂黑检查预算')
    resourcesSeen.add(object)
    if (object instanceof PDFStream) visit(object.dict, depth + 1)
    else if (object instanceof PDFDict) {
      for (const [name, value] of object.entries()) {
        const field = name.decodeText()
        if (
          ['Properties', 'ActualText', 'Alt', 'Metadata', 'PieceInfo', 'OPI', 'AF'].includes(
            field,
          ) ||
          field.startsWith('Mimir')
        )
          throw new Error('目标页含标记内容属性或资源缓存，暂不能安全生成涂黑副本')
        if (
          (['SMask', 'Mask'].includes(field) &&
            pdf.context.lookup(value)?.toString() !== '/None') ||
          (field === 'ImageMask' && pdf.context.lookup(value)?.toString() !== 'false') ||
          ['Pattern', 'Shading'].includes(field)
        )
          throw new Error('目标页含尚未验证的遮罩或图案资源，暂不能安全生成涂黑副本')
        visit(value, depth + 1)
      }
    } else if (object instanceof PDFArray)
      object.asArray().forEach((value) => visit(value, depth + 1))
  }
  visit(page.node.Resources())
}

/** Native removal only detaches the hit annotation; replies/popups can retain it. */
function assertAnnotationGraphsSafe(pdf: PDFDocument, operation: RedactCopy) {
  const hits = new Set<PDFDict>()
  for (const [pageIndex, page] of pdf.getPages().entries()) {
    const regions = operation.regions.filter((region) => region.pageIndex === pageIndex)
    for (const ref of page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.asArray() ?? []) {
      const annotation = pdf.context.lookup(ref)
      if (!(annotation instanceof PDFDict)) throw new Error('批注结构无效，无法安全生成涂黑副本')
      if (!regions.length) continue
      const rect = annotation.lookupMaybe(PDFName.of('Rect'), PDFArray)
      const bounds = rect?.asArray().map((value) => pdf.context.lookup(value))
      if (!bounds || bounds.length !== 4 || bounds.some((value) => !(value instanceof PDFNumber)))
        throw new Error('批注位置无效，无法安全生成涂黑副本')
      const [a, b, c, d] = bounds.map((value) => (value as PDFNumber).asNumber()) as [
        number,
        number,
        number,
        number,
      ]
      if (![a, b, c, d].every(Number.isFinite)) throw new Error('批注位置无效')
      if (
        regions.some(
          ({ rect: [l, bottom, r, top] }) =>
            Math.min(a, c) < r &&
            Math.max(a, c) > l &&
            Math.min(b, d) < top &&
            Math.max(b, d) > bottom,
        )
      )
        hits.add(annotation)
    }
  }
  // Related nodes need not themselves appear in a page's Annots array.
  const seen = new Set<PDFObject>()
  const visit = (raw: PDFObject | undefined, depth = 0) => {
    if (!raw) return
    const object = pdf.context.lookup(raw)
    if (!object || seen.has(object)) return
    if (depth > 128 || seen.size >= 100_000) throw new Error('批注关联结构超过检查预算')
    seen.add(object)
    if (object instanceof PDFStream) visit(object.dict, depth + 1)
    else if (object instanceof PDFDict) {
      for (const name of ['IRT', 'Parent', 'Popup']) {
        const related = object.lookup(PDFName.of(name))
        if (related && (hits.has(object) || (related instanceof PDFDict && hits.has(related))))
          throw new Error('涂黑区域涉及批注回复或弹窗，暂不能安全清除关联原文')
      }
      for (const [, value] of object.entries()) visit(value, depth + 1)
    } else if (object instanceof PDFArray)
      object.asArray().forEach((value) => visit(value, depth + 1))
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects()) visit(object)
}

/** Generate only a download. Neither the source nor the editor's working version is published. */
export async function createPdfRedactedCopy(
  bytes: Uint8Array,
  raw: RedactCopy,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  signal?.throwIfAborted()
  const operation = pdfLocalOperationSchema.parse(raw)
  if (operation.op !== 'redact_copy') throw new Error('涂黑副本操作无效')
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new Error('PDF 文件大小须在 1 字节至 50 MiB 之间')
  await assertSafeToRewrite(bytes)
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  // Detached signatures may live outside Catalog.AcroForm too.
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFStream ? object.dict : object
    if (
      dict instanceof PDFDict &&
      (dict.lookup(PDFName.of('Type'))?.toString() === '/Sig' ||
        dict.lookup(PDFName.of('FT'))?.toString() === '/Sig' ||
        dict.has(PDFName.of('ByteRange')))
    )
      throw new Error('这份 PDF 含有签名，暂不能安全生成涂黑副本')
  }
  const pages = pdf.getPages()
  if (!pages.length || pages.length > 1000) throw new Error('PDF 须包含 1–1000 页')
  // Native preflight scans all pages for shared images for every region.
  if (pages.length * operation.regions.length > MAX_PAGE_SCANS)
    throw new Error('涂黑区域与页数超出本次处理预算，请减少区域后重试')
  for (const [index, region] of operation.regions.entries()) {
    const page = pages[region.pageIndex]
    if (!page) throw new Error(`第 ${index + 1} 个涂黑区域页码已失效`)
    const userUnit = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber() ?? 1
    if (userUnit !== 1) throw new Error('暂不支持自定义页面单位的涂黑副本')
    const rotation = page.getRotation().angle
    if (![0, 90, 180, 270].includes(rotation)) throw new Error('暂不支持此页面旋转角度')
    const media = page.getMediaBox(),
      crop = page.getCropBox()
    const visible = [
      Math.max(media.x, crop.x),
      Math.max(media.y, crop.y),
      Math.min(media.x + media.width, crop.x + crop.width),
      Math.min(media.y + media.height, crop.y + crop.height),
    ]
    const [left, bottom, right, top] = region.rect
    if (
      !visible.every(Number.isFinite) ||
      visible.some((v) => Math.abs(v) > 1e7) ||
      visible[0]! >= visible[2]! ||
      visible[1]! >= visible[3]! ||
      Math.fround(left) >= Math.fround(right) ||
      Math.fround(bottom) >= Math.fround(top) ||
      left < visible[0]! ||
      bottom < visible[1]! ||
      right > visible[2]! ||
      top > visible[3]!
    )
      throw new Error(`第 ${index + 1} 个涂黑区域必须完整位于当前页面裁剪框内`)
  }
  for (const pageIndex of new Set(operation.regions.map((region) => region.pageIndex)))
    assertPageSideChannelsSafe(pdf, pageIndex)
  assertAnnotationGraphsSafe(pdf, operation)
  signal?.throwIfAborted()
  initializePdfAgentHost()
  const { redactPdf } =
    await import('../../../../packages/office/vendor/apps/pdf/src/main/redaction.js')
  const native = await redactPdf(bytes.slice(), operation.regions)
  signal?.throwIfAborted()
  if (!native.length || native.length > MAX_BYTES) throw new Error('输出 PDF 超过 50 MiB')
  // Full serialization plus graph pruning excludes obsolete/unreferenced source streams.
  // The vendored native operation already removes content before painting black fill.
  const output = await PDFDocument.load(native, { updateMetadata: false })
  discardUnreachablePdfObjects(output)
  const result = await output.save({ useObjectStreams: false, updateFieldAppearances: false })
  if (result.length > MAX_BYTES) throw new Error('输出 PDF 超过 50 MiB')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: result.slice() })
  try {
    const verified = await task.promise
    if (verified.numPages !== pages.length) throw new Error('涂黑副本页数校验失败')
    for (const pageIndex of new Set(operation.regions.map((region) => region.pageIndex))) {
      const page = await verified.getPage(pageIndex + 1)
      await page.getOperatorList()
      await page.getTextContent()
      signal?.throwIfAborted()
    }
  } finally {
    await task.destroy()
  }
  signal?.throwIfAborted()
  return result
}
