import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib'
import type { PdfMarkupInput, PdfTextProbe, PdfTextTarget } from '@mimir/shared'
import type {
  TextEditInput,
  TextInsertInput,
} from '../../../../packages/office/vendor/apps/pdf/src/shared/ipc.js'
import { configurePdfWasmPaths } from '../../../../packages/office/src/shims/pdf-wasm-path.js'

const require = createRequire(import.meta.url)

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

const roundPdf = (value: number): number => Math.round(value * 100) / 100

function boundsNear(a: readonly number[], b: readonly number[]): boolean {
  return (
    a.length === 4 && b.length === 4 && a.every((value, index) => Math.abs(value - b[index]!) < 0.5)
  )
}

async function countMatchingMarkup(
  bytes: Uint8Array,
  pageIndex: number,
  subtype: string,
  rect: readonly number[],
): Promise<number> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice() })
  try {
    const page = await (await task.promise).getPage(pageIndex + 1)
    const annotations = await page.getAnnotations()
    return annotations.filter(
      (annotation) => annotation.subtype === subtype && boundsNear(annotation.rect, rect),
    ).length
  } finally {
    await task.destroy()
  }
}

function overlapsMostOfObject(
  object: readonly [number, number, number, number],
  rect: readonly [number, number, number, number],
): boolean {
  const width = Math.max(0, Math.min(object[2], rect[2]) - Math.max(object[0], rect[0]))
  const height = Math.max(0, Math.min(object[3], rect[3]) - Math.max(object[1], rect[1]))
  const area = Math.max((object[2] - object[0]) * (object[3] - object[1]), 1e-6)
  return (width * height) / area >= 0.5
}

/** Identify one whole PDFium text object on an exact byte version. */
export async function inspectPdfTextTarget(
  bytes: Uint8Array,
  probe: PdfTextProbe,
): Promise<PdfTextTarget> {
  if (!probe.oldText.trim() || probe.oldText.length > 10_000) throw new Error('请选择一段完整原文')
  if (
    !probe.rect.every(Number.isFinite) ||
    probe.rect[0] >= probe.rect[2] ||
    probe.rect[1] >= probe.rect[3]
  )
    throw new Error('原文位置无效')
  await assertSafeToRewrite(bytes)
  // PDFium may coalesce coincident drawing commands into one page object. The
  // renderer must independently see one complete run before we trust that object.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise
    const content = await (await pdf.getPage(probe.pageIndex + 1)).getTextContent()
    const exact = content.items.filter((item) => 'str' in item && item.str === probe.oldText)
    if (exact.length !== 1) throw new Error('原文在画布中不是唯一完整文字项，不能安全替换')
  } finally {
    await task.destroy()
  }
  initializePdfAgentHost()
  const { chainPdfium, loadPdfium, withDocument, FPDF_PAGEOBJ_TEXT } =
    await import('../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js')
  return chainPdfium(async () => {
    const m = await loadPdfium()
    return withDocument(m, bytes, async (doc) => {
      const {
        _FPDF_GetPageCount: getPageCount,
        _FPDF_LoadPage: loadPage,
        _FPDFText_LoadPage: loadTextPage,
        _FPDFPage_CountObjects: countObjects,
        _FPDFPage_GetObject: getObject,
        _FPDFPageObj_GetType: getObjectType,
        _FPDFPageObj_GetBounds: getObjectBounds,
        _FPDFTextObj_GetText: getObjectText,
        _FPDFText_ClosePage: closeTextPage,
        _FPDF_ClosePage: closePage,
        _malloc: allocate,
        _free: free,
      } = m
      if (probe.pageIndex < 0 || probe.pageIndex >= getPageCount(doc))
        throw new Error('原文页号已失效')
      const page = loadPage(doc, probe.pageIndex)
      if (!page) throw new Error('无法读取原文所在页')
      const textPage = loadTextPage(page)
      const left = allocate(4)
      const bottom = allocate(4)
      const right = allocate(4)
      const top = allocate(4)
      try {
        const candidates: Omit<PdfTextTarget, 'sha256' | 'pageIndex'>[] = []
        const count = countObjects(page)
        for (let objectIndex = 0; objectIndex < count; objectIndex++) {
          const object = getObject(page, objectIndex)
          if (getObjectType(object) !== FPDF_PAGEOBJ_TEXT) continue
          if (!getObjectBounds(object, left, bottom, right, top)) continue
          const bounds: [number, number, number, number] = [
            m.HEAPF32[left >> 2]!,
            m.HEAPF32[bottom >> 2]!,
            m.HEAPF32[right >> 2]!,
            m.HEAPF32[top >> 2]!,
          ]
          if (!overlapsMostOfObject(bounds, probe.rect)) continue
          const length = getObjectText(object, textPage, 0, 0)
          if (length <= 2) continue
          const buffer = allocate(length)
          try {
            getObjectText(object, textPage, buffer, length)
            candidates.push({
              objectIndex,
              text: Buffer.from(m.HEAPU8.buffer, buffer, length - 2).toString('utf16le'),
              bounds,
            })
          } finally {
            free(buffer)
          }
        }
        if (candidates.length !== 1 || candidates[0]!.text !== probe.oldText)
          throw new Error('原文对应多个或部分 PDF 文字对象，不能安全替换')
        return { ...candidates[0]!, pageIndex: probe.pageIndex, sha256: digest(bytes) }
      } finally {
        for (const pointer of [left, bottom, right, top]) free(pointer)
        closeTextPage(textPage)
        closePage(page)
      }
    })
  })
}

/** Reconfirm the exact object before asking the vendor writer to modify it. */
export async function applyPdfVerifiedTextEdit(
  bytes: Uint8Array,
  edit: TextEditInput,
  target: PdfTextTarget,
): Promise<Uint8Array> {
  if (digest(bytes) !== target.sha256) throw new Error('PDF 原件已变化，请重新定位原文')
  if (edit.pageIndex !== target.pageIndex || edit.oldText !== target.text)
    throw new Error('PDF 原文标识与编辑内容不一致')
  if (edit.newText.includes(edit.oldText))
    throw new Error('替换结果包含原文，暂不能确认旧对象已被移除')
  if (!edit.newText.trim()) throw new Error('替换文字不能为空')
  const current = await inspectPdfTextTarget(bytes, {
    pageIndex: edit.pageIndex,
    rect: edit.rect,
    oldText: edit.oldText,
  })
  if (current.objectIndex !== target.objectIndex || !boundsNear(current.bounds, target.bounds))
    throw new Error('PDF 原文对象已变化，请重新定位')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const beforeTask = getDocument({ data: bytes.slice() })
  try {
    const before = await beforeTask.promise
    const content = await (await before.getPage(edit.pageIndex + 1)).getTextContent()
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join('')
    if (pageText.includes(edit.newText))
      throw new Error('页面已有相同替换文字，暂不能独立确认本次写入')
  } finally {
    await beforeTask.destroy()
  }
  const result = await applyPdfTextEdits(bytes, [edit])
  const task = getDocument({ data: result.slice() })
  try {
    const pdf = await task.promise
    const content = await (await pdf.getPage(edit.pageIndex + 1)).getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join('')
    if (text.includes(edit.oldText) || !text.includes(edit.newText))
      throw new Error('PDF 替换读回与目标原文不一致，结果未写入')
  } finally {
    await task.destroy()
  }
  return result
}

/** Add one GenOffice text-markup annotation only after the selected object is rechecked. */
export async function applyPdfVerifiedMarkup(
  bytes: Uint8Array,
  input: PdfMarkupInput,
): Promise<Uint8Array> {
  const { target, type } = input
  if (digest(bytes) !== target.sha256) throw new Error('PDF 原件已变化，请重新定位原文')
  const current = await inspectPdfTextTarget(bytes, {
    pageIndex: target.pageIndex,
    rect: target.bounds,
    oldText: target.text,
  })
  if (current.objectIndex !== target.objectIndex || !boundsNear(current.bounds, target.bounds))
    throw new Error('PDF 原文对象已变化，请重新定位')
  const [left, bottom, right, top] = target.bounds
  const expectedSubtype =
    type === 'strikeout' ? 'StrikeOut' : type[0]!.toUpperCase() + type.slice(1)
  const beforeCount = await countMatchingMarkup(
    bytes,
    target.pageIndex,
    expectedSubtype,
    target.bounds,
  )
  const pdfDoc = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  const page = pdfDoc.getPage(target.pageIndex)
  if (!page) throw new Error('原文页号已失效')
  const color = type === 'highlight' ? [1, 0.88, 0.3] : [0.9, 0.32, 0.24]
  const rect = [left, bottom, right, top]
  const rotation = ((page.getRotation().angle % 360) + 360) % 360
  const ops: string[] = []
  if (type === 'highlight') {
    ops.push(
      '/GsM gs',
      `${color.join(' ')} rg`,
      `${roundPdf(left)} ${roundPdf(bottom)} ${roundPdf(right - left)} ${roundPdf(top - bottom)} re f`,
    )
  } else {
    const height = rotation % 180 === 0 ? top - bottom : right - left
    const thickness = Math.max(0.8, roundPdf(height * 0.06))
    const fraction = type === 'underline' ? 0.08 : 0.46
    ops.push(`${color.join(' ')} RG`, `${thickness} w`)
    if (rotation === 90 || rotation === 270) {
      const x = rotation === 90 ? right - height * fraction : left + height * fraction
      ops.push(`${roundPdf(x)} ${roundPdf(bottom)} m ${roundPdf(x)} ${roundPdf(top)} l S`)
    } else {
      const y = rotation === 180 ? top - height * fraction : bottom + height * fraction
      ops.push(`${roundPdf(left)} ${roundPdf(y)} m ${roundPdf(right)} ${roundPdf(y)} l S`)
    }
  }
  // This is the fixed GenOffice save-pdf.ts markup appearance and annotation shape.
  // Its aggregate writer imports Electron-only image modules, so the host ports this
  // one operation without loading that unavailable dependency graph.
  const apRef = pdfDoc.context.register(
    pdfDoc.context.stream(ops.join('\n'), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: rect,
      Resources:
        type === 'highlight'
          ? { ExtGState: { GsM: { Type: 'ExtGState', BM: 'Multiply', ca: 1 } } }
          : {},
    }),
  )
  const annotation = pdfDoc.context.register(
    pdfDoc.context.obj({
      Type: 'Annot',
      Subtype:
        type === 'strikeout' ? 'StrikeOut' : type === 'highlight' ? 'Highlight' : 'Underline',
      Rect: rect,
      QuadPoints: [left, top, right, top, left, bottom, right, bottom],
      C: color,
      F: 4,
      T: 'Mimir',
      P: page.ref,
      AP: { N: apRef },
    }),
  )
  const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (annots) annots.push(annotation)
  else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annotation]))
  const result = await pdfDoc.save()
  const afterCount = await countMatchingMarkup(
    result,
    target.pageIndex,
    expectedSubtype,
    target.bounds,
  )
  if (afterCount <= beforeCount) throw new Error('PDF 批注未通过独立读回，结果未写入')
  return result
}

/** Resolve from server production dependencies, including a pnpm deploy checkout. */
export function pdfAgentAssetPaths(): { pdfium: string; harfbuzz: string } {
  const pdfium = require.resolve('@embedpdf/pdfium/pdfium.wasm')
  const harfbuzz = join(dirname(require.resolve('harfbuzzjs')), 'hb-subset.wasm')
  if (!existsSync(pdfium) || !existsSync(harfbuzz))
    throw new Error('PDF 编辑资源缺失：PDFium 或 HarfBuzz WASM 未打包')
  return { pdfium, harfbuzz }
}

export function initializePdfAgentHost(): void {
  configurePdfWasmPaths(pdfAgentAssetPaths())
}

/** A content-stream rewrite can invalidate signatures or structures we cannot verify. */
async function assertSafeToRewrite(bytes: Uint8Array): Promise<void> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  if (pdf.isEncrypted) throw new Error('这份 PDF 已加密，未写回原件')
  const unknown = pdf.catalog
    .entries()
    .map(([key]) => key.toString())
    .filter((key) => key !== '/Type' && key !== '/Pages')
  if (unknown.length > 0)
    throw new Error(`这份 PDF 含有暂不能安全保留的文档结构（${unknown.join('、')}），未写回原件`)
}

function assertNoSkips(skipped: readonly { reason: string }[]): void {
  if (skipped.length > 0) throw new Error(`PDF 编辑未写入：${skipped[0]!.reason}`)
}

/** Return verified bytes only; the caller writes them through the shared file save path. */
export async function applyPdfTextEdits(
  bytes: Uint8Array,
  edits: readonly TextEditInput[],
): Promise<Uint8Array> {
  if (edits.length < 1 || edits.length > 30) throw new Error('文字编辑数量必须在 1–30 项之间')
  await assertSafeToRewrite(bytes)
  initializePdfAgentHost()
  const { applyTextEdits, verifyTextEdits } =
    await import('../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js')
  const result = await applyTextEdits(bytes.slice(), [...edits])
  assertNoSkips(result.skipped)
  const failures = await verifyTextEdits(
    result.bytes,
    edits.map((edit) => ({
      pageIndex: edit.pageIndex,
      newText: edit.newText,
    })),
  )
  if (failures.length > 0) throw new Error(`PDF 编辑读回失败：${failures[0]!.reason}`)
  return result.bytes
}

/** Add searchable text with the same PDFium writer and independent read-back gate. */
export async function applyPdfTextInserts(
  bytes: Uint8Array,
  inserts: readonly TextInsertInput[],
): Promise<Uint8Array> {
  if (inserts.length < 1 || inserts.length > 30) throw new Error('文字插入数量必须在 1–30 项之间')
  await assertSafeToRewrite(bytes)
  initializePdfAgentHost()
  const { applyTextInserts, verifyTextEdits } =
    await import('../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js')
  const result = await applyTextInserts(bytes.slice(), [...inserts])
  assertNoSkips(result.skipped)
  const failures = await verifyTextEdits(
    result.bytes,
    inserts.map((insert) => ({
      pageIndex: insert.pageIndex,
      newText: insert.text,
    })),
  )
  if (failures.length > 0) throw new Error(`PDF 插入文字读回失败：${failures[0]!.reason}`)
  return result.bytes
}
