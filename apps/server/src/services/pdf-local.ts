import { createHash, randomUUID } from 'node:crypto'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFObjectCopier,
  PDFPage,
  PDFRef,
  PDFString,
  degrees,
  rgb,
} from 'pdf-lib'
import {
  pdfLocalOperationSchema,
  type PdfLocalOperation,
  type PdfLocalInfo,
  type PdfDrawingInput,
  type PdfOutlineEntry,
} from '@mimir/shared'
import { applyPdfFormOperation, appearanceFont } from './pdf-forms.js'
import { assertPdfPreservingSafe as assertSafe } from './pdf-preserving-guard.js'
import {
  currentPdfPages,
  discardUnreachablePdfObjects,
  pruneExtractedObjects,
} from './pdf-page-prune.js'
import { applyPdfPageLayout, resizePdfPage } from './pdf-page-layout.js'
import {
  pdfDrawingGeometry,
  readPdfDrawings,
  transformPdfDrawings,
} from './pdf-drawing-geometry.js'

const key = PDFName.of
const MAX_PAGES = 1000
const MAX_BYTES = 50 * 1024 * 1024
const textOf = (obj: PDFObject | undefined) =>
  obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : ''
function dictJSON<T>(dict: PDFDict, name: string): T | null {
  const value = textOf(dict.lookup(key(name)))
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    throw new Error('PDF 编辑图层数据损坏')
  }
}
function color(hex: string) {
  return rgb(
    ...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]),
  )
}
export function pdfPageRange(range: string, total: number): number[] {
  if (range === 'all') return Array.from({ length: total }, (_, i) => i)
  const result: number[] = []
  for (const raw of range.split(',')) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(raw)
    if (!match) throw new Error('页码格式为 1-3,5 或 all')
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1])
    if (start < 1 || end < start || end > total) throw new Error(`页码必须在 1–${total} 之间`)
    for (let page = start; page <= end; page++)
      if (!result.includes(page - 1)) result.push(page - 1)
  }
  if (!result.length) throw new Error('请选择至少一页')
  return result
}
async function load(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new Error('PDF 文件大小须在 1 字节至 50 MiB 之间')
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  if (pdf.isEncrypted) throw new Error('加密 PDF 不能编辑')
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > MAX_PAGES)
    throw new Error('PDF 须包含 1–1000 页')
  return pdf
}
function outlineOf(pdf: PDFDocument): PdfOutlineEntry[] {
  const root = pdf.catalog.lookupMaybe(key('Outlines'), PDFDict)
  const entries: PdfOutlineEntry[] = []
  const seen = new Set<PDFDict>()
  const walk = (raw: PDFObject | undefined, level: number) => {
    let obj = raw ? pdf.context.lookup(raw) : undefined
    while (obj instanceof PDFDict) {
      if (seen.has(obj) || level > 8 || entries.length >= 500)
        throw new Error('PDF 书签层级过深或循环')
      seen.add(obj)
      const action = obj.lookupMaybe(key('A'), PDFDict)
      let dest = obj.lookup(key('Dest')) ?? action?.lookup(key('D'))
      if (dest instanceof PDFString || dest instanceof PDFHexString || dest instanceof PDFName) {
        const name = dest instanceof PDFName ? dest.decodeText() : dest.decodeText()
        let found: PDFObject | undefined = pdf.catalog
          .lookupMaybe(key('Dests'), PDFDict)
          ?.lookup(key(name))
        const names = pdf.catalog
          .lookupMaybe(key('Names'), PDFDict)
          ?.lookupMaybe(key('Dests'), PDFDict)
        const visited = new Set<PDFDict>()
        const find = (dict: PDFDict | undefined): void => {
          if (!dict || found) return
          if (visited.has(dict) || visited.size > 1000) throw new Error('PDF 命名目标树无效')
          visited.add(dict)
          const array = dict.lookupMaybe(key('Names'), PDFArray)
          if (array)
            for (let i = 0; i + 1 < array.size(); i += 2)
              if (textOf(pdf.context.lookup(array.get(i))) === name)
                found = pdf.context.lookup(array.get(i + 1))
          const kids = dict.lookupMaybe(key('Kids'), PDFArray)
          kids?.asArray().forEach((k) => {
            const d = pdf.context.lookup(k)
            if (d instanceof PDFDict) find(d)
          })
        }
        find(names)
        dest = found instanceof PDFDict ? found.lookup(key('D')) : found
      }
      if (!(dest instanceof PDFArray)) throw new Error('该 PDF 书签使用未支持的命名目标')
      const target = dest.get(0)
      const index =
        target instanceof PDFNumber
          ? target.asNumber()
          : pdf.getPages().findIndex((p) => p.ref.toString() === target.toString())
      if (index < 0) throw new Error('PDF 书签目标不存在')
      entries.push({ title: textOf(obj.lookup(key('Title'))), page: index + 1, level })
      walk(obj.get(key('First')), level + 1)
      obj = obj.get(key('Next')) ? pdf.context.lookup(obj.get(key('Next'))!) : undefined
    }
  }
  walk(root?.get(key('First')), 0)
  return entries
}
function infoOf(pdf: PDFDocument): PdfLocalInfo {
  const pages = pdf.getPages()
  const drawings: PdfLocalInfo['drawings'] = []
  const ids = new Set<string>()
  for (const [i, page] of pages.entries()) {
    const current = readPdfDrawings(page)
    if (drawings.length + current.length > 500) throw new Error('PDF 编辑绘图超过 500 项')
    for (const item of current) {
      if (ids.has(item.id)) throw new Error('PDF 编辑绘图 ID 重复')
      ids.add(item.id)
      drawings.push({ ...item, page: i + 1 })
    }
  }
  return {
    metadata: {
      title: pdf.getTitle() ?? '',
      author: pdf.getAuthor() ?? '',
      subject: pdf.getSubject() ?? '',
      keywords: pdf.getKeywords() ?? '',
    },
    watermark: dictJSON(pages[0]!.node, 'MimirWatermark'),
    headerFooter: dictJSON(pages[0]!.node, 'MimirHeaderFooter'),
    outline: outlineOf(pdf),
    drawings,
  }
}
function setOutline(pdf: PDFDocument, entries: PdfOutlineEntry[]) {
  const currentPages = currentPdfPages(pdf)
  pdf.catalog.delete(key('Outlines'))
  if (!entries.length) return
  const root = pdf.context.obj({ Type: 'Outlines' }),
    rootRef = pdf.context.register(root)
  const nodes = entries.map((entry) => {
    const page = currentPages[entry.page - 1]
    if (!page) throw new Error('书签页码已失效')
    return {
      entry,
      dict: pdf.context.obj({ Title: PDFHexString.fromText(entry.title), Dest: [page.ref, 'Fit'] }),
      ref: undefined as PDFRef | undefined,
      children: [] as number[],
    }
  })
  nodes.forEach((node) => (node.ref = pdf.context.register(node.dict)))
  const stack: number[] = []
  const top: number[] = []
  nodes.forEach((node, i) => {
    if (node.entry.level > stack.length) throw new Error('书签层级不能跳级')
    stack.length = node.entry.level
    const parent = stack.length ? nodes[stack[stack.length - 1]!]! : null
    ;(parent ? parent.children : top).push(i)
    node.dict.set(key('Parent'), parent?.ref ?? rootRef)
    stack.push(i)
  })
  const link = (parent: PDFDict, children: number[]) => {
    if (!children.length) return
    parent.set(key('First'), nodes[children[0]!]!.ref!)
    parent.set(key('Last'), nodes[children[children.length - 1]!]!.ref!)
    parent.set(key('Count'), PDFNumber.of(children.length))
    children.forEach((id, at) => {
      const d = nodes[id]!.dict
      if (at) d.set(key('Prev'), nodes[children[at - 1]!]!.ref!)
      if (at < children.length - 1) d.set(key('Next'), nodes[children[at + 1]!]!.ref!)
    })
  }
  link(root, top)
  nodes.forEach((node) => link(node.dict, node.children))
  pdf.catalog.set(key('Outlines'), rootRef)
}
function shown(page: PDFPage) {
  const b = page.getCropBox(),
    r = ((page.getRotation().angle % 360) + 360) % 360
  return {
    width: r === 90 || r === 270 ? b.height : b.width,
    height: r === 90 || r === 270 ? b.width : b.height,
  }
}
function layerMatrix(page: PDFPage) {
  const b = page.getCropBox(),
    r = ((page.getRotation().angle % 360) + 360) % 360
  if (r === 90) return [0, 1, -1, 0, b.x + b.width, b.y]
  if (r === 180) return [-1, 0, 0, -1, b.x + b.width, b.y + b.height]
  if (r === 270) return [0, -1, 1, 0, b.x, b.y + b.height]
  return [1, 0, 0, 1, b.x, b.y]
}
function removeLayer(page: PDFPage, name: string) {
  const refs = page.node.lookupMaybe(key(name), PDFArray)
  if (!refs) return
  const ids = new Set(refs.asArray().map((r) => r.toString()))
  const contents = page.node.lookup(key('Contents'))
  if (contents instanceof PDFArray) {
    const kept = contents.asArray().filter((r) => !ids.has(r.toString()))
    page.node.set(key('Contents'), page.doc.context.obj(kept))
  } else if (contents && ids.has(page.node.get(key('Contents'))!.toString()))
    page.node.delete(key('Contents'))
  page.node.delete(key(name))
}
async function addLayer(
  pdf: PDFDocument,
  page: PDFPage,
  name: string,
  paint: (layer: PDFPage) => void | Promise<void>,
) {
  removeLayer(page, name)
  const size = shown(page),
    layer = pdf.addPage([size.width, size.height])
  await paint(layer)
  const embedded = await pdf.embedPage(layer)
  await embedded.embed()
  pdf.removePage(pdf.getPageCount() - 1)
  const resource = page.node.newXObject('MimirLayer', embedded.ref)
  const stream = pdf.context.flateStream(
    `q\n${layerMatrix(page).join(' ')} cm\n${resource.asString()} Do\nQ\n`,
  )
  const ref = pdf.context.register(stream)
  page.node.addContentStream(ref)
  page.node.set(key(name), pdf.context.obj([ref]))
}
function paintDrawing(page: PDFPage, d: PdfDrawingInput) {
  const size = shown(page)
  const c = color(d.color),
    x = d.x,
    top = size.height - d.y,
    y = top - d.height
  const common = {
    borderColor: c,
    borderWidth: d.thickness,
    opacity: d.opacity,
    borderOpacity: d.opacity,
    color: d.fill ? color(d.fill) : undefined,
  }
  const line = (a: [number, number], b: [number, number]) =>
    page.drawLine({
      start: { x: a[0], y: a[1] },
      end: { x: b[0], y: b[1] },
      color: c,
      thickness: d.thickness,
      opacity: d.opacity,
    })
  const rotation = d.rotation ?? 0,
    w = rotation === 90 || rotation === 270 ? d.height : d.width,
    h = rotation === 90 || rotation === 270 ? d.width : d.height
  const point = (u: number, v: number): [number, number] => {
    if (rotation === 90) return [x + h - v, top - u]
    if (rotation === 180) return [x + w - u, top - h + v]
    if (rotation === 270) return [x + v, top - w + u]
    return [x + u, top - v]
  }
  const segment = (a: [number, number], b: [number, number]) => line(point(...a), point(...b))
  if (d.kind === 'rect') page.drawRectangle({ x, y, width: d.width, height: d.height, ...common })
  else if (d.kind === 'ellipse')
    page.drawEllipse({
      x: x + d.width / 2,
      y: y + d.height / 2,
      xScale: d.width / 2,
      yScale: d.height / 2,
      ...common,
    })
  else if (d.kind === 'check') {
    segment([0, h * 0.5], [w * 0.35, h])
    segment([w * 0.35, h], [w, 0])
  } else if (d.kind === 'cross') {
    segment([0, h], [w, 0])
    segment([0, 0], [w, h])
  } else if (d.kind === 'ink') {
    if (!d.points) throw new Error('自由绘图需要 points')
    d.points.forEach(([px, py], i) => {
      if (px < x - 1e-6 || px > x + d.width + 1e-6 || py < d.y - 1e-6 || py > d.y + d.height + 1e-6)
        throw new Error('自由绘图点超出范围')
      if (i)
        line([d.points![i - 1]![0], size.height - d.points![i - 1]![1]], [px, size.height - py])
    })
  } else {
    segment([0, 0], [w, h])
    if (d.kind === 'arrow') {
      const len = d.arrowHeadLength ?? Math.min(12, w / 3, h / 3),
        a = Math.atan2(h, w)
      for (const delta of [-0.5, 0.5])
        segment([w, h], [w - len * Math.cos(a + delta), h - len * Math.sin(a + delta)])
    }
  }
}
async function drawAll(pdf: PDFDocument, all: PdfLocalInfo['drawings']) {
  for (const [i, page] of pdf.getPages().entries()) {
    const current = all.filter((d) => d.page === i + 1)
    removeLayer(page, 'MimirDrawingLayer')
    page.node.set(key('MimirDrawings'), PDFHexString.fromText(JSON.stringify(current)))
    if (current.length)
      await addLayer(pdf, page, 'MimirDrawingLayer', (layer) =>
        current.forEach((d) => paintDrawing(layer, d)),
      )
  }
}
async function stamp(pdf: PDFDocument, info: PdfLocalInfo) {
  const wm = info.watermark,
    hf = info.headerFooter
  const values = [
    wm?.text ?? '',
    ...(Object.values(hf ?? {}).filter((v) => typeof v === 'string') as string[]),
  ]
  const font = values.some((v) => v.length) ? await appearanceFont(pdf, values) : undefined
  const pages = [...pdf.getPages()]
  for (const [i, page] of pages.entries()) {
    removeLayer(page, 'MimirStampLayer')
    page.node.set(key('MimirWatermark'), PDFHexString.fromText(JSON.stringify(wm)))
    page.node.set(key('MimirHeaderFooter'), PDFHexString.fromText(JSON.stringify(hf)))
    if (!font || (!wm?.text && !hf)) continue
    await addLayer(pdf, page, 'MimirStampLayer', (layer) => {
      const { width, height } = shown(layer)
      if (wm?.text) {
        const size = Math.min(
          width * wm.size_ratio,
          (width * 0.8) / Math.max(font.widthOfTextAtSize(wm.text, 1), 1),
        )
        const tw = font.widthOfTextAtSize(wm.text, size),
          a = (wm.angle * Math.PI) / 180
        layer.drawText(wm.text, {
          x: width / 2 - (tw * Math.cos(a)) / 2,
          y: height / 2 - (tw * Math.sin(a)) / 2,
          size,
          font,
          color: color(wm.color),
          opacity: wm.opacity,
          rotate: degrees(wm.angle),
        })
      }
      if (hf)
        for (const section of ['header', 'footer'] as const)
          for (const align of ['left', 'center', 'right'] as const) {
            const raw =
              section === 'footer' && align === 'center' && hf.page_number
                ? String(i + hf.start_at)
                : hf[`${section}_${align}`]
            const text = raw
              .replaceAll('{page}', String(i + hf.start_at))
              .replaceAll('{total}', String(pages.length))
            if (!text) continue
            const tw = font.widthOfTextAtSize(text, hf.font_size)
            if (tw > width - 40) throw new Error('页眉页脚过长，请缩短文字或减小字号')
            layer.drawText(text, {
              x: align === 'left' ? 20 : align === 'right' ? width - 20 - tw : (width - tw) / 2,
              y: section === 'header' ? height - 20 - hf.font_size : 20,
              size: hf.font_size,
              font,
              color: color(hf.color),
            })
          }
    })
  }
}
async function save(pdf: PDFDocument) {
  await pdf.flush()
  discardUnreachablePdfObjects(pdf)
  const bytes = await pdf.save({ useObjectStreams: false, updateFieldAppearances: false })
  if (bytes.length > MAX_BYTES) throw new Error('输出 PDF 超过 50 MiB')
  await load(bytes)
  return bytes
}
async function extract(pdf: PDFDocument, indices: number[]) {
  // copyPages drops AcroForm.Fields while copying Widgets. Preserve the original
  // object graph so retained fields remain editable, including shared Widgets.
  const out = await load(await save(pdf))
  const pages = [...out.getPages()]
  const retained = new Set(indices.map((i) => pages[i]!.ref))
  if (out.catalog.has(key('AcroForm'))) {
    const form = out.getForm()
    for (const field of form.getFields()) {
      const widgets = field.acroField.getWidgets()
      const dropped = widgets.flatMap((widget, i) => {
        const owner = pages.find((page) => {
          if (widget.P()?.toString() === page.ref.toString()) return true
          return page.node
            .lookupMaybe(key('Annots'), PDFArray)
            ?.asArray()
            .some((ref) => out.context.lookup(ref) === widget.dict)
        })
        if (!owner) throw new Error('表单控件缺少有效页面，无法抽取')
        return retained.has(owner.ref) ? [] : [i]
      })
      if (dropped.length === widgets.length) form.acroForm.removeField(field.acroField)
      else for (const i of dropped.toReversed()) field.acroField.removeWidget(i)
    }
  }
  const outline = outlineOf(out)
  while (out.getPageCount()) out.removePage(0)
  for (const i of indices) out.addPage(pages[i]!)
  let lastLevel = -1
  setOutline(
    out,
    outline.flatMap((entry) => {
      const page = indices.indexOf(entry.page - 1)
      if (page < 0) return []
      const level = Math.min(entry.level, lastLevel + 1)
      lastLevel = level
      return [{ ...entry, page: page + 1, level }]
    }),
  )
  pruneExtractedObjects(
    out,
    new Set(pages.filter((_, i) => !indices.includes(i)).map((p) => p.ref.toString())),
  )
  return save(out)
}
export interface PdfLocalResult {
  bytes?: Uint8Array
  outputs?: Array<{ name: string; bytes: Uint8Array }>
  info?: PdfLocalInfo
}
/** Bounded working-copy operations. File persistence remains the editor's explicit save. */
export async function applyPdfLocalOperation(
  bytes: Uint8Array,
  raw: PdfLocalOperation,
  assetBytes?: Uint8Array,
): Promise<PdfLocalResult> {
  const op = pdfLocalOperationSchema.parse(raw),
    pdf = await load(bytes)
  const info = infoOf(pdf)
  if (op.op === 'read') return { info }
  if (op.op === 'export_pdf') return { outputs: [{ name: 'document.pdf', bytes: bytes.slice() }] }
  assertSafe(pdf)
  const changesPageTree =
    [
      'extract_pages',
      'split_pdf',
      'split_pages',
      'merge_pages',
      'import_pages',
      'replace_pages',
      'apply_page_layout',
    ].includes(op.op) ||
    (op.op === 'apply_ops' && op.ops.some((o) => o.op === 'deletePage' || o.op === 'setPageOrder'))
  if (changesPageTree && pdf.catalog.has(key('StructTreeRoot')))
    throw new Error('带标签 PDF 的页面结构尚不能安全迁移，请保留原文件')
  if (op.op === 'extract_pages')
    return {
      outputs: [
        {
          name: 'extracted-pages.pdf',
          bytes: await extract(pdf, pdfPageRange(op.pages, pdf.getPageCount())),
        },
      ],
    }
  if (op.op === 'split_pdf') {
    if (op.pages_per_file >= pdf.getPageCount()) throw new Error('每份页数须小于总页数')
    const outputs = []
    let outputBytes = 0
    if (Math.ceil(pdf.getPageCount() / op.pages_per_file) > 100)
      throw new Error('一次最多拆为 100 份')
    for (let i = 0; i < pdf.getPageCount(); i += op.pages_per_file) {
      outputs.push({
        name: `part-${outputs.length + 1}.pdf`,
        bytes: await extract(
          pdf,
          Array.from(
            { length: Math.min(op.pages_per_file, pdf.getPageCount() - i) },
            (_, j) => i + j,
          ),
        ),
      })
      outputBytes += outputs[outputs.length - 1]!.bytes.length
      if (outputBytes > MAX_BYTES) throw new Error('拆分结果合计超过 50 MiB，请减少输出数量')
    }
    return { outputs }
  }
  if (op.op === 'split_pages' || op.op === 'merge_pages') {
    if (
      pdf
        .getPages()
        .some((page) => (page.node.lookupMaybe(key('Annots'), PDFArray)?.size() ?? 0) > 0)
    )
      throw new Error('拆页和拼版尚不能迁移表单或批注，请使用抽页或按份拆分以保留交互')
    const out = await PDFDocument.create()
    for (const page of pdf.getPages())
      if (!page.node.has(key('Contents')))
        page.node.addContentStream(pdf.context.register(pdf.context.flateStream('')))
    const embedded = await out.embedPages(pdf.getPages())
    if (op.op === 'split_pages') {
      const columns = op.per_page === 2 ? 2 : Math.sqrt(op.per_page),
        rows = op.per_page / columns
      if (pdf.getPageCount() * op.per_page > MAX_PAGES) throw new Error('拆页后超过 1000 页')
      for (const [i, source] of embedded.entries())
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < columns; c++) {
            const b = pdf.getPage(i).getCropBox(),
              w = b.width / columns,
              h = b.height / rows
            const page = out.addPage([w, h])
            page.drawPage(source, { x: -c * w, y: -(rows - r - 1) * h })
            page.setRotation(pdf.getPage(i).getRotation())
          }
    } else {
      const columns = Math.ceil(Math.sqrt(op.per_sheet)),
        rows = Math.ceil(op.per_sheet / columns)
      for (let start = 0; start < embedded.length; start += op.per_sheet) {
        const page = out.addPage([842, 595]),
          cw = 842 / columns,
          ch = 595 / rows
        for (let slot = 0; slot < op.per_sheet && start + slot < embedded.length; slot++) {
          const source = embedded[start + slot]!,
            orig = pdf.getPage(start + slot),
            r = ((orig.getRotation().angle % 360) + 360) % 360
          const dim = shown(orig),
            k = Math.min((cw - 12) / dim.width, (ch - 12) / dim.height)
          const col = op.direction === 'horizontal' ? slot % columns : Math.floor(slot / rows),
            row = op.direction === 'horizontal' ? Math.floor(slot / columns) : slot % rows
          const x = col * cw + (cw - dim.width * k) / 2,
            y = 595 - (row + 1) * ch + (ch - dim.height * k) / 2
          page.drawPage(source, {
            x: x + (r === 90 || r === 180 ? dim.width * k : 0),
            y: y + (r === 180 || r === 270 ? dim.height * k : 0),
            width: source.width * k,
            height: source.height * k,
            rotate: degrees(-r),
          })
        }
        if (op.separator) {
          for (let c = 1; c < columns; c++)
            page.drawLine({
              start: { x: c * cw, y: 0 },
              end: { x: c * cw, y: 595 },
              thickness: 0.5,
              color: rgb(0.7, 0.7, 0.7),
            })
          for (let r = 1; r < rows; r++)
            page.drawLine({
              start: { x: 0, y: r * ch },
              end: { x: 842, y: r * ch },
              thickness: 0.5,
              color: rgb(0.7, 0.7, 0.7),
            })
        }
      }
    }
    return {
      outputs: [
        {
          name: op.op === 'split_pages' ? 'split-pages.pdf' : 'merged-pages.pdf',
          bytes: await save(out),
        },
      ],
    }
  }
  if (op.op === 'apply_ops') {
    if (op.ops.some((o) => o.op === 'setFormValue')) {
      const formOps = op.ops.filter((o) => o.op === 'setFormValue')
      const remainingOps = op.ops.filter((o) => o.op !== 'setFormValue')
      const formed = await applyPdfFormOperation(
        bytes,
        { op: 'apply', ops: formOps },
        createHash('sha256').update(bytes).digest('hex'),
        assertSafe,
      )
      const result = remainingOps.length
        ? await applyPdfLocalOperation(formed.bytes!, { op: 'apply_ops', ops: remainingOps })
        : { bytes: formed.bytes!, info: infoOf(await load(formed.bytes!)) }
      return op.dry_run ? { info: result.info } : result
    }
    const originalPages = [...pdf.getPages()]
    for (const operation of op.ops) {
      const pages = currentPdfPages(pdf)
      if (operation.op === 'setMetadata') {
        const m = operation.metadata
        if (m.title !== undefined) pdf.setTitle(m.title)
        if (m.author !== undefined) pdf.setAuthor(m.author)
        if (m.subject !== undefined) pdf.setSubject(m.subject)
        if (m.keywords !== undefined)
          pdf.setKeywords(
            m.keywords
              .split(/[,，]/)
              .map((s) => s.trim())
              .filter(Boolean),
          )
        pdf.catalog.delete(key('Metadata'))
      } else if (operation.op === 'rotatePages') {
        const targets = new Set(operation.pages)
        for (const page of targets) {
          if (page > pages.length) throw new Error('旋转页码越界')
          const current = pages[page - 1]!
          const before = pdfDrawingGeometry(current)
          current.setRotation(
            degrees((((current.getRotation().angle + operation.dir) % 360) + 360) % 360),
          )
          transformPdfDrawings(current, before)
        }
      } else if (operation.op === 'deletePage') {
        const page = pages[operation.page - 1]
        if (!page || pages.length < 2) throw new Error('删除页码无效或没有剩余页')
        const annots = page.node.lookupMaybe(key('Annots'), PDFArray)
        if (
          annots?.asArray().some((r) => {
            const a = pdf.context.lookup(r)
            return a instanceof PDFDict && a.lookup(key('Subtype'))?.toString() === '/Widget'
          })
        )
          throw new Error('不能删除含交互表单控件的页面')
        pdf.removePage(operation.page - 1)
      } else if (operation.op === 'setPageOrder') {
        if (
          operation.order.length !== pages.length ||
          new Set(operation.order).size !== pages.length ||
          operation.order.some((i) => i > pages.length)
        )
          throw new Error('页序必须包含当前全部页码')
        while (pdf.getPageCount()) pdf.removePage(0)
        operation.order.forEach((i) => pdf.addPage(pages[i - 1]!))
      }
    }
    let lastLevel = -1
    const outline = info.outline.flatMap((e) => {
      const page = currentPdfPages(pdf).findIndex((p) => p.ref === originalPages[e.page - 1]!.ref)
      if (page < 0) return []
      const level = Math.min(e.level, lastLevel + 1)
      lastLevel = level
      return [{ title: e.title, level, page: page + 1 }]
    })
    setOutline(pdf, outline)
    const retainedRefs = new Set(currentPdfPages(pdf).map((p) => p.ref.toString()))
    const removedRefs = new Set(
      originalPages.filter((p) => !retainedRefs.has(p.ref.toString())).map((p) => p.ref.toString()),
    )
    if (removedRefs.size) pruneExtractedObjects(pdf, removedRefs)
    const result = await save(pdf)
    return op.dry_run
      ? { info: infoOf(await load(result)) }
      : { bytes: result, info: infoOf(await load(result)) }
  }
  if (op.op === 'apply_page_layout') {
    const { removed, remap } = applyPdfPageLayout(pdf, op.pages)
    let lastLevel = -1
    setOutline(
      pdf,
      info.outline.flatMap((entry) => {
        const page = remap(entry.page)
        if (!page) return []
        const level = Math.min(entry.level, lastLevel + 1)
        lastLevel = level
        return [{ ...entry, page, level }]
      }),
    )
    if (removed.size) pruneExtractedObjects(pdf, removed)
    // Reload to invalidate pdf-lib's stale getPages cache before repainting
    // page-numbered layers against the actual final page tree.
    const next = await load(await save(pdf))
    await stamp(next, info)
    const result = await save(next)
    return { bytes: result, info: infoOf(await load(result)) }
  } else if (op.op === 'insert_blank_page') {
    if (op.after_page > pdf.getPageCount() || pdf.getPageCount() >= MAX_PAGES)
      throw new Error('插页位置无效或超过页数上限')
    const neighbor = pdf.getPage(Math.max(0, op.after_page - 1)),
      b = neighbor.getCropBox()
    const page = pdf.insertPage(op.after_page, [b.width, b.height])
    page.setRotation(neighbor.getRotation())
  } else if (op.op === 'set_page_size') {
    const presets: Record<string, [number, number]> = {
      A3: [841.89, 1190.55],
      A4: [595.28, 841.89],
      A5: [419.53, 595.28],
      Letter: [612, 792],
      Legal: [612, 1008],
    }
    const size = op.preset
      ? presets[op.preset]
      : op.width && op.height
        ? [op.width, op.height]
        : undefined
    if (!size) throw new Error('请选择纸型或同时提供宽高')
    for (const page of pdf.getPages()) {
      const r = ((page.getRotation().angle % 360) + 360) % 360
      const width = r === 90 || r === 270 ? size[1]! : size[0]!,
        height = r === 90 || r === 270 ? size[0]! : size[1]!
      resizePdfPage(page, width, height)
    }
  } else if (op.op === 'crop_pages') {
    if (
      op.left >= op.right ||
      op.top >= op.bottom ||
      (op.left === 0 && op.top === 0 && op.right === 1 && op.bottom === 1)
    )
      throw new Error('请指定保留的非空裁剪区域')
    for (const i of pdfPageRange(op.pages, pdf.getPageCount())) {
      const page = pdf.getPage(i),
        b = page.getCropBox(),
        r = ((page.getRotation().angle % 360) + 360) % 360
      const before = pdfDrawingGeometry(page)
      let l = op.left,
        t = op.top,
        rr = op.right,
        bb = op.bottom
      if (r === 90) [l, t, rr, bb] = [op.top, 1 - op.right, op.bottom, 1 - op.left]
      if (r === 180) [l, t, rr, bb] = [1 - op.right, 1 - op.bottom, 1 - op.left, 1 - op.top]
      if (r === 270) [l, t, rr, bb] = [1 - op.bottom, op.left, 1 - op.top, op.right]
      page.setCropBox(
        b.x + l * b.width,
        b.y + (1 - bb) * b.height,
        (rr - l) * b.width,
        (bb - t) * b.height,
      )
      transformPdfDrawings(page, before)
    }
  } else if (op.op === 'import_pages' || op.op === 'replace_pages') {
    if (!assetBytes) throw new Error('请先选择来源 PDF 文件')
    const src = await load(assetBytes)
    assertSafe(src)
    if (src.catalog.has(key('AcroForm'))) throw new Error('导入文件含交互表单，请先导出普通页面')
    if (src.catalog.has(key('StructTreeRoot')))
      throw new Error('来源 PDF 含标签结构，尚不能安全导入')
    const selected = pdfPageRange(op.source_pages, src.getPageCount())
    const removed = op.op === 'replace_pages' ? pdfPageRange(op.pages, pdf.getPageCount()) : []
    if (
      removed.some((i) =>
        pdf
          .getPage(i)
          .node.lookupMaybe(key('Annots'), PDFArray)
          ?.asArray()
          .some((annot) => {
            const d = pdf.context.lookup(annot)
            return d instanceof PDFDict && d.lookup(key('Subtype'))?.toString() === '/Widget'
          }),
      )
    )
      throw new Error('替换范围含交互表单控件')
    const at = op.op === 'import_pages' ? op.after_page : Math.min(...removed)
    if (
      at > pdf.getPageCount() ||
      pdf.getPageCount() - removed.length + selected.length > MAX_PAGES
    )
      throw new Error('导入位置无效或超过页数上限')
    // Drop only bookmarks targeting removed pages; retain surviving reference targets.
    const removedSet = new Set(removed)
    const oldPages = [...pdf.getPages()]
    for (const i of removed.toSorted((a, b) => b - a)) pdf.removePage(i)
    // Prune unselected source pages before copying. Copy refs with one copier so
    // Widget/P and internal destinations bind the actual inserted page objects.
    const selectedSource = await load(await extract(src, selected))
    const copier = PDFObjectCopier.for(selectedSource.context, pdf.context)
    for (const [i, sourcePage] of selectedSource.getPages().entries()) {
      const ref = copier.copy(sourcePage.ref)
      const page = PDFPage.of(pdf.context.lookup(ref) as typeof sourcePage.node, ref, pdf)
      const drawings = dictJSON<PdfLocalInfo['drawings']>(page.node, 'MimirDrawings')
      if (drawings)
        page.node.set(
          key('MimirDrawings'),
          PDFHexString.fromText(
            JSON.stringify(drawings.map((d) => Object.assign({}, d, { id: randomUUID() }))),
          ),
        )
      pdf.insertPage(at + i, page)
    }
    let lastLevel = -1
    const remapped = info.outline
      .filter((e) => !removedSet.has(e.page - 1))
      .map((e) => {
        const level = Math.min(e.level, lastLevel + 1)
        lastLevel = level
        return {
          title: e.title,
          level,
          page: pdf.getPages().findIndex((p) => p.ref === oldPages[e.page - 1]!.ref) + 1,
        }
      })
    setOutline(pdf, remapped)
    if (removed.length)
      pruneExtractedObjects(pdf, new Set(removed.map((i) => oldPages[i]!.ref.toString())))
  } else if (
    op.op === 'add_drawing' ||
    op.op === 'update_drawing' ||
    op.op === 'delete_drawing' ||
    op.op === 'add_form_mark'
  ) {
    if (op.op === 'add_drawing' || op.op === 'add_form_mark') {
      const d =
          op.op === 'add_drawing'
            ? op.drawing
            : { ...op, width: op.size, height: op.size, thickness: 2 },
        page = pdf.getPages()[d.page - 1]
      if (!page) throw new Error('绘图页码失效')
      const size = shown(page)
      if (
        d.x < 0 ||
        d.y < 0 ||
        d.x + d.width > size.width + 0.01 ||
        d.y + d.height > size.height + 0.01
      )
        throw new Error('新绘图范围超出页面')
      if (d.width > 14400 || d.height > 14400 || d.thickness < 0.25 || d.thickness > 50)
        throw new Error('新绘图尺寸或线宽超出范围')
    }
    let all = [...info.drawings]
    if (op.op === 'update_drawing' || op.op === 'delete_drawing') {
      if (!all.some((d) => d.id === op.id)) throw new Error('绘图已失效，请刷新')
      all = all.filter((d) => d.id !== op.id)
    }
    if (op.op === 'add_drawing' || op.op === 'update_drawing')
      all.push({ ...op.drawing, id: op.op === 'update_drawing' ? op.id : randomUUID() })
    if (op.op === 'add_form_mark')
      all.push({
        kind: op.kind,
        page: op.page,
        x: op.x,
        y: op.y,
        width: op.size,
        height: op.size,
        color: op.color,
        thickness: 2,
        opacity: 1,
        id: randomUUID(),
      })
    if (all.some((d) => d.page > pdf.getPageCount()) || all.length > 500)
      throw new Error('绘图页码失效或超过 500 项')
    await drawAll(pdf, all)
  } else if (op.op === 'set_watermark' || op.op === 'set_header_footer') {
    if (op.op === 'set_watermark') {
      const { op: _, ...wm } = op
      info.watermark = wm.text ? wm : null
    } else {
      const { op: _, ...hf } = op
      info.headerFooter =
        hf.page_number ||
        [
          hf.header_left,
          hf.header_center,
          hf.header_right,
          hf.footer_left,
          hf.footer_center,
          hf.footer_right,
        ].some(Boolean)
          ? hf
          : null
    }
    await stamp(pdf, info)
  } else if (op.op === 'set_metadata') {
    const m = op.metadata
    if (m.title !== undefined) pdf.setTitle(m.title)
    if (m.author !== undefined) pdf.setAuthor(m.author)
    if (m.subject !== undefined) pdf.setSubject(m.subject)
    if (m.keywords !== undefined)
      pdf.setKeywords(
        m.keywords
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      )
    // Keep XMP from contradicting the explicitly edited Info dictionary.
    pdf.catalog.delete(key('Metadata'))
  } else if (op.op === 'set_outline') setOutline(pdf, op.entries)
  if (pdf.getPageCount() > MAX_PAGES) throw new Error('超过 1000 页')
  const result = await save(pdf)
  return { bytes: result, info: infoOf(await load(result)) }
}
