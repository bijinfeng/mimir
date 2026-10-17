import { createHash, randomUUID } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFString,
} from 'pdf-lib'
import { z } from 'zod'
import {
  pdfSignatureSourceSchema,
  PDF_SIGNATURE_LIMITS,
  type PdfSignatureSource,
  type PdfVisualSignature,
  type PdfVisualSignatureOperation,
} from '@mimir/shared'
import { decodePdfImage, encodePdfPng } from './pdf-image-codec.js'
const key = PDFName.of
const MARK = 'MimirVisualSignature',
  HASH = 'MimirVisualSignatureHash'
type Matrix = [number, number, number, number, number, number]
type Point = [number, number]
const matrixSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])
const recordSchema = z
  .object({ version: z.literal(1), source: pdfSignatureSourceSchema, matrix: matrixSchema })
  .strict()
type RecordData = z.infer<typeof recordSchema>
function text(obj: PDFObject | undefined) {
  return obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : ''
}
const apply = (m: Matrix, [x, y]: Point): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
]
function native(page: PDFPage, [x, y]: Point): Point {
  const b = page.getCropBox(),
    r = ((page.getRotation().angle % 360) + 360) % 360
  if (r === 90) return [b.x + y, b.y + x]
  if (r === 180) return [b.x + b.width - x, b.y + y]
  if (r === 270) return [b.x + b.width - y, b.y + b.height - x]
  return [b.x + x, b.y + b.height - y]
}
function display(page: PDFPage, [x, y]: Point): Point {
  const b = page.getCropBox(),
    r = ((page.getRotation().angle % 360) + 360) % 360
  if (r === 90) return [y - b.y, x - b.x]
  if (r === 180) return [b.x + b.width - x, y - b.y]
  if (r === 270) return [b.y + b.height - y, b.x + b.width - x]
  return [x - b.x, b.y + b.height - y]
}
function bounds(points: Point[]) {
  const x = Math.min(...points.map((p) => p[0])),
    y = Math.min(...points.map((p) => p[1]))
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p[0])) - x,
    height: Math.max(...points.map((p) => p[1])) - y,
  }
}
function corners(record: RecordData): Point[] {
  const { source: s, matrix: m } = record
  return [
    [0, 0],
    [s.width, 0],
    [0, s.height],
    [s.width, s.height],
  ].map((p) => apply(m, p as Point))
}
function array(dict: PDFDict, name: string): number[] {
  const a = dict.lookup(key(name))
  if (!(a instanceof PDFArray)) throw new Error('签名几何无效')
  return a.asArray().map((x) => {
    const n = dict.context.lookup(x)
    if (!(n instanceof PDFNumber) || !Number.isFinite(n.asNumber())) throw new Error('签名几何无效')
    return n.asNumber()
  })
}
/** Hash the complete bounded native appearance graph, not just an untrusted own-marker. */
function digest(dict: PDFDict): string {
  const hash = createHash('sha256'),
    seen = new Set<PDFObject>()
  let count = 0,
    bytes = 0
  const walk = (raw: PDFObject) => {
    const obj = raw instanceof PDFRef ? dict.context.lookup(raw) : raw
    if (!obj) throw new Error('签名引用失效')
    if (++count > 1000) throw new Error('签名资源图超限')
    if (obj instanceof PDFDict || obj instanceof PDFArray || obj instanceof PDFRawStream) {
      if (seen.has(obj)) {
        hash.update('shared')
        return
      }
      seen.add(obj)
    }
    if (obj instanceof PDFRawStream) {
      bytes += obj.contents.length
      if (bytes > 12 * 1024 * 1024) throw new Error('签名资源超限')
      walk(obj.dict)
      hash.update(obj.contents)
    } else if (obj instanceof PDFDict) {
      for (const [k, v] of obj
        .entries()
        .toSorted(([a], [b]) => a.toString().localeCompare(b.toString()))) {
        if (k.toString() === '/Length') continue
        hash.update(k.toString())
        walk(v)
      }
    } else if (obj instanceof PDFArray) {
      hash.update('[')
      obj.asArray().forEach(walk)
      hash.update(']')
    } else hash.update(obj.toString())
  }
  for (const name of ['Subtype', 'Rect', 'InkList', 'BS', 'C', 'F', 'AP', MARK]) {
    const value = dict.get(key(name))
    hash.update(name)
    if (value) walk(value)
  }
  return hash.digest('hex')
}
function validateSource(source: PdfSignatureSource) {
  if (source.kind === 'ink') {
    if (
      !source.strokes.some((path) =>
        path.some(
          (p, i) => i > 0 && Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1]) > 0.01,
        ),
      )
    )
      throw new Error('手写签名没有可见线段')
    const pad = source.thickness / 2
    if (
      source.strokes
        .flat()
        .some(([x, y]) => x < pad || y < pad || x > source.width - pad || y > source.height - pad)
    )
      throw new Error('签名笔画必须完整位于素材边界内')
  } else {
    const bytes = Buffer.from(source.png, 'base64')
    if (bytes.toString('base64') !== source.png) throw new Error('签名 PNG 编码无效')
    if (
      bytes.length > PDF_SIGNATURE_LIMITS.pngBytes ||
      bytes.length < 24 ||
      bytes.readUInt32BE(16) !== source.width ||
      bytes.readUInt32BE(20) !== source.height
    )
      throw new Error('签名 PNG 尺寸或大小无效')
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error('签名素材必须为 PNG')
    const pixels = decodePdfImage(bytes)
    if (!pixels.data.some((v, i) => i % 4 === 3 && v > 0)) throw new Error('签名图片完全透明')
  }
}
const ALLOWED = new Set(
  [
    'Type',
    'Subtype',
    'Rect',
    'InkList',
    'BS',
    'C',
    'F',
    'AP',
    'P',
    'NM',
    'Contents',
    MARK,
    HASH,
  ].map((n) => '/' + n),
)
interface Own {
  page: PDFPage
  dict: PDFDict
  ref: PDFObject
  record: RecordData
  id: string
}
function validAppearance(page: PDFPage, dict: PDFDict, record: RecordData): boolean {
  const root = dict.lookup(key('AP'))
  if (!(root instanceof PDFDict) || root.keys().some((k) => k.toString() !== '/N')) return false
  const check = (raw: PDFObject | undefined, current: RecordData, depth: number): boolean => {
    const stream = raw ? page.doc.context.lookup(raw) : undefined
    if (
      !(stream instanceof PDFRawStream) ||
      stream.dict.has(key('Filter')) ||
      depth > 100 ||
      stream.contents.length > 200000
    )
      return false
    if (
      stream.dict
        .keys()
        .some(
          (k) =>
            !['/Type', '/Subtype', '/FormType', '/BBox', '/Resources', '/Length'].includes(
              k.toString(),
            ),
        ) ||
      stream.dict.lookup(key('Type'))?.toString() !== '/XObject' ||
      stream.dict.lookup(key('Subtype'))?.toString() !== '/Form'
    )
      return false
    const rect = bounds(corners(current)),
      box = array(stream.dict, 'BBox')
    if (
      box.length !== 4 ||
      box.some(
        (n, i) =>
          Math.abs(n - [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height][i]!) > 0.0001,
      )
    )
      return false
    const resources = stream.dict.lookup(key('Resources'), PDFDict),
      commands = Buffer.from(stream.contents).toString('ascii'),
      s = current.source,
      m = current.matrix
    if (resources.keys().some((k) => k.toString() !== '/XObject')) return false
    const xobjects = resources.lookup(key('XObject'))
    if (xobjects instanceof PDFDict && xobjects.has(key('Original'))) {
      if (xobjects.keys().length !== 1) return false
      const original = xobjects.lookup(key('Original'))
      if (!(original instanceof PDFRawStream)) return false
      const originalBox = array(original.dict, 'BBox'),
        scale = rect.width / (originalBox[2]! - originalBox[0]!)
      return (
        Number.isFinite(scale) &&
        scale > 0 &&
        commands === `q ${format(scale)} 0 0 ${format(scale)} 0 0 cm /Original Do Q` &&
        check(original, { ...current, matrix: m.map((n) => n / scale) as Matrix }, depth + 1)
      )
    }
    if (s.kind === 'ink') {
      if (resources.keys().length) return false
      const color = [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16) / 255),
        width = s.thickness * Math.hypot(m[0], m[1])
      let expected = `q\n${color.map(format).join(' ')} RG ${format(width)} w 1 J 1 j\n`
      for (const path of s.strokes)
        expected +=
          path
            .map((p, i) => {
              const [x, y] = apply(m, p)
              return `${format(x)} ${format(y)} ${i ? 'l' : 'm'}`
            })
            .join('\n') + '\nS\n'
      return commands === expected + 'Q\n'
    }
    const expected = `q\n${[m[0] * s.width, m[1] * s.width, -m[2] * s.height, -m[3] * s.height, m[2] * s.height + m[4], m[3] * s.height + m[5]].map(format).join(' ')} cm /Im0 Do\nQ\n`
    if (
      commands !== expected ||
      !(xobjects instanceof PDFDict) ||
      xobjects.keys().length !== 1 ||
      !xobjects.has(key('Im0'))
    )
      return false
    const image = xobjects.lookup(key('Im0'))
    if (!(image instanceof PDFRawStream)) return false
    const pixels = decodePdfImage(Buffer.from(s.png, 'base64'))
    const plane = (imageStream: PDFRawStream, channels: number) => {
      const d = imageStream.dict
      if (
        d
          .keys()
          .some(
            (k) =>
              ![
                '/Type',
                '/Subtype',
                '/Width',
                '/Height',
                '/BitsPerComponent',
                '/ColorSpace',
                '/SMask',
                '/Decode',
                '/Filter',
                '/Length',
              ].includes(k.toString()),
          ) ||
        d.lookup(key('Type'))?.toString() !== '/XObject' ||
        d.lookup(key('Subtype'))?.toString() !== '/Image' ||
        d.lookup(key('Width'))?.toString() !== String(s.width) ||
        d.lookup(key('Height'))?.toString() !== String(s.height) ||
        d.lookup(key('BitsPerComponent'))?.toString() !== '8' ||
        d.lookup(key('ColorSpace'))?.toString() !==
          (channels === 3 ? '/DeviceRGB' : '/DeviceGray') ||
        d.lookup(key('Filter'))?.toString() !== '/FlateDecode'
      )
        return null
      if (
        d.has(key('Decode')) &&
        (channels !== 1 || d.lookup(key('Decode'))?.toString() !== '[ 0 1 ]')
      )
        return null
      const data = inflateSync(imageStream.contents, {
        maxOutputLength: s.width * s.height * channels,
      })
      return data.length === s.width * s.height * channels ? data : null
    }
    const rgb = plane(image, 3),
      mask = image.dict.lookup(key('SMask')),
      alpha = mask instanceof PDFRawStream ? plane(mask, 1) : null
    if (!rgb || (mask && !alpha)) return false
    for (let i = 0; i < s.width * s.height; i++)
      if (
        ((pixels.data[i * 4 + 3] ?? 0) > 0 &&
          (rgb[i * 3] !== pixels.data[i * 4] ||
            rgb[i * 3 + 1] !== pixels.data[i * 4 + 1] ||
            rgb[i * 3 + 2] !== pixels.data[i * 4 + 2])) ||
        (alpha?.[i] ?? 255) !== pixels.data[i * 4 + 3]
      )
        return false
    return true
  }
  return check(root.get(key('N')), record, 0)
}
function own(page: PDFPage, raw: PDFObject): Own | null {
  const dict = page.doc.context.lookup(raw)
  if (!(dict instanceof PDFDict) || !dict.has(key(MARK))) return null
  try {
    if (dict.keys().some((k) => !ALLOWED.has(k.toString()))) return null
    const source = dict.lookup(key(MARK))
    if (
      !(source instanceof PDFRawStream) ||
      source.dict.keys().some((k) => k.toString() !== '/Length') ||
      source.contents.length > 6 * 1024 * 1024
    )
      return null
    if (
      dict.lookup(key('Type'))?.toString() !== '/Annot' ||
      dict.get(key('P'))?.toString() !== page.ref.toString() ||
      dict.lookup(key('F'))?.toString() !== '4'
    )
      return null
    const input: unknown = JSON.parse(Buffer.from(source.contents).toString('utf8')),
      record = recordSchema.parse(input)
    const id = text(dict.lookup(key('NM')))
    if (!/^MVS-[a-zA-Z0-9-]{1,160}$/.test(id)) return null
    if (
      dict.lookup(key('Subtype'))?.toString() !==
        (record.source.kind === 'ink' ? '/Ink' : '/Stamp') ||
      text(dict.lookup(key(HASH))) !== digest(dict)
    )
      return null
    const actual = array(dict, 'Rect'),
      r = bounds(corners(record)),
      expected = [r.x, r.y, r.x + r.width, r.y + r.height]
    if (
      actual.length !== 4 ||
      actual.some((n, i) => Math.abs(n - expected[i]!) > 0.0001) ||
      r.width <= 0 ||
      r.height <= 0
    )
      return null
    const m = record.matrix,
      sx = Math.hypot(m[0], m[1]),
      sy = Math.hypot(m[2], m[3])
    if (
      sx < 0.00001 ||
      Math.abs(sx - sy) > sx * 0.00001 ||
      Math.abs(m[0] * m[2] + m[1] * m[3]) > sx * sy * 0.00001
    )
      return null
    if (record.source.kind === 'ink') {
      const inkSource = record.source,
        paths = dict.lookup(key('InkList'))
      if (!(paths instanceof PDFArray) || paths.size() !== record.source.strokes.length) return null
      for (const [index, path] of record.source.strokes.entries()) {
        const points = paths
          .lookup(index, PDFArray)
          .asArray()
          .map((n) => dict.context.lookup(n))
        const expectedPoints = path.flatMap((p) => apply(record.matrix, p))
        if (
          points.length !== expectedPoints.length ||
          points.some(
            (n, i) =>
              !(n instanceof PDFNumber) || Math.abs(n.asNumber() - expectedPoints[i]!) > 0.0001,
          )
        )
          return null
      }
      const border = dict.lookup(key('BS'), PDFDict),
        width = border.lookup(key('W'), PDFNumber).asNumber(),
        color = array(dict, 'C'),
        expectedColor = [1, 3, 5].map((i) => parseInt(inkSource.color.slice(i, i + 2), 16) / 255)
      if (
        border.keys().some((k) => !['/W', '/S'].includes(k.toString())) ||
        border.lookup(key('S'))?.toString() !== '/S' ||
        color.length !== 3 ||
        color.some((n, i) => Math.abs(n - expectedColor[i]!) > 0.0000001)
      )
        return null
      if (Math.abs(width - record.source.thickness * sx) > 0.0001) return null
    }
    validateSource(record.source)
    if (!validAppearance(page, dict, record)) return null
    return { page, dict, ref: raw, record, id }
  } catch {
    return null
  }
}
function allOwn(pdf: PDFDocument): Own[] {
  const all: Own[] = [],
    ids = new Set<string>()
  let retained = 0,
    candidates = 0
  for (const page of pdf.getPages())
    for (const raw of page.node.lookupMaybe(key('Annots'), PDFArray)?.asArray() ?? []) {
      const d = pdf.context.lookup(raw)
      if (d instanceof PDFDict && d.has(key(MARK))) {
        if (++candidates > 100) throw new Error('PDF 签名超过 100 项')
      }
      const item = own(page, raw)
      if (!item) continue
      if (ids.has(item.id)) throw new Error('PDF 签名 ID 重复，无法安全编辑')
      ids.add(item.id)
      retained += JSON.stringify(item.record.source).length
      if (retained > PDF_SIGNATURE_LIMITS.sourceBytes)
        throw new Error('PDF 签名素材合计超过 16 MiB')
      all.push(item)
    }
  return all
}
function preview(
  item: Own,
): Pick<PdfVisualSignature, 'preview' | 'strokes' | 'color' | 'thickness'> {
  const { source: s, matrix: m } = item.record,
    points = corners(item.record).map((p) => display(item.page, p)),
    r = bounds(points)
  if (s.kind === 'ink')
    return {
      strokes: s.strokes.map((path) =>
        path.map((p) => {
          const [x, y] = display(item.page, apply(m, p))
          return [x - r.x, y - r.y]
        }),
      ),
      color: s.color,
      thickness: s.thickness * Math.hypot(m[0], m[1]),
    }
  const pixels = decodePdfImage(Buffer.from(s.png, 'base64')),
    scale = Math.min(1, 240 / r.width, 240 / r.height),
    width = Math.max(1, Math.ceil(r.width * scale)),
    height = Math.max(1, Math.ceil(r.height * scale)),
    data = new Uint8ClampedArray(width * height * 4),
    det = m[0] * m[3] - m[1] * m[2]
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = native(item.page, [
          r.x + ((x + 0.5) / width) * r.width,
          r.y + ((y + 0.5) / height) * r.height,
        ]),
        dx = p[0] - m[4],
        dy = p[1] - m[5],
        sx = Math.floor((m[3] * dx - m[2] * dy) / det),
        sy = Math.floor((-m[1] * dx + m[0] * dy) / det)
      if (sx >= 0 && sy >= 0 && sx < pixels.width && sy < pixels.height)
        data.set(
          pixels.data.subarray((sy * pixels.width + sx) * 4, (sy * pixels.width + sx) * 4 + 4),
          (y * width + x) * 4,
        )
    }
  return { preview: encodePdfPng({ width, height, data }).toString('base64') }
}
export function readPdfVisualSignatures(pdf: PDFDocument): PdfVisualSignature[] {
  return allOwn(pdf).map((item) =>
    Object.assign(
      {
        id: item.id,
        page: pdf.getPages().indexOf(item.page) + 1,
        kind: item.record.source.kind,
        rect: bounds(corners(item.record).map((p) => display(item.page, p))),
      },
      preview(item),
    ),
  )
}
function format(n: number) {
  return Number(n.toFixed(7)).toString()
}
async function write(
  pdf: PDFDocument,
  page: PDFPage,
  record: RecordData,
  id: string,
  dict?: PDFDict,
) {
  const s = record.source,
    m = record.matrix,
    r = bounds(corners(record)),
    rect = [r.x, r.y, r.x + r.width, r.y + r.height]
  let commands = 'q\n',
    resources = pdf.context.obj({})
  const annot =
    dict ??
    pdf.context.obj({
      Type: 'Annot',
      Subtype: s.kind === 'ink' ? 'Ink' : 'Stamp',
      F: 4,
      P: page.ref,
      NM: PDFHexString.fromText(id),
      Contents: PDFHexString.fromText('Mimir 视觉签名'),
    })
  annot.set(key('Rect'), pdf.context.obj(rect))
  if (s.kind === 'ink') {
    const color = [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16) / 255),
      thickness = s.thickness * Math.hypot(m[0], m[1]),
      paths = s.strokes.map((path) => path.map((p) => apply(m, p)))
    annot.set(key('InkList'), pdf.context.obj(paths.map((path) => path.flat())))
    annot.set(key('BS'), pdf.context.obj({ W: thickness, S: 'S' }))
    annot.set(key('C'), pdf.context.obj(color))
    commands += `${color.map(format).join(' ')} RG ${format(thickness)} w 1 J 1 j\n`
    for (const path of paths) {
      commands +=
        path.map(([x, y], i) => `${format(x)} ${format(y)} ${i ? 'l' : 'm'}`).join('\n') + '\nS\n'
    }
  } else {
    const image = await pdf.embedPng(Buffer.from(s.png, 'base64'))
    await image.embed()
    resources = pdf.context.obj({ XObject: { Im0: image.ref } })
    commands += `${[m[0] * s.width, m[1] * s.width, -m[2] * s.height, -m[3] * s.height, m[2] * s.height + m[4], m[3] * s.height + m[5]].map(format).join(' ')} cm /Im0 Do\n`
  }
  commands += 'Q\n'
  const appearance = pdf.context.register(
    pdf.context.stream(commands, {
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: rect,
      Resources: resources,
    }),
  )
  annot.set(key('AP'), pdf.context.obj({ N: appearance }))
  annot.set(key(MARK), pdf.context.register(pdf.context.stream(JSON.stringify(record))))
  annot.set(key(HASH), PDFHexString.fromText(digest(annot)))
  if (!dict) page.node.addAnnot(pdf.context.register(annot))
}
function checkRect(page: PDFPage, rect: PdfVisualSignature['rect']) {
  const b = page.getCropBox(),
    r = ((page.getRotation().angle % 360) + 360) % 360,
    w = r === 90 || r === 270 ? b.height : b.width,
    h = r === 90 || r === 270 ? b.width : b.height
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > w + 0.0001 ||
    rect.y + rect.height > h + 0.0001
  )
    throw new Error('新签名必须完整位于可见页面内')
}
/** The current editor page model uses unscaled CropBox units. */
export function pdfVisualSignatureIssue(page: PDFPage): string | null {
  const unit = page.node.getInheritableAttribute(key('UserUnit')),
    value = unit ? page.doc.context.lookup(unit) : undefined
  if (value && (!(value instanceof PDFNumber) || value.asNumber() !== 1))
    return '本页使用非标准 UserUnit，暂不支持签名定位；已有签名仍可删除。'
  const crop = page.getCropBox(),
    media = page.getMediaBox()
  if (
    crop.x < media.x ||
    crop.y < media.y ||
    crop.x + crop.width > media.x + media.width ||
    crop.y + crop.height > media.y + media.height
  )
    return '本页裁剪框超出纸张边界，暂不支持签名定位；已有签名仍可删除。'
  return null
}
export async function applyPdfVisualSignature(pdf: PDFDocument, op: PdfVisualSignatureOperation) {
  const seen = new Set<PDFObject>()
  const inspect = (raw: PDFObject) => {
    const object = pdf.context.lookup(raw)
    if (!object || seen.has(object)) return
    seen.add(object)
    const dict = object instanceof PDFRawStream ? object.dict : object
    if (dict instanceof PDFDict) {
      if (['ByteRange', 'Perms', 'DocMDP', 'FieldMDP'].some((name) => dict.has(key(name))))
        throw new Error('PDF 含数字签名或认证权限，不能安全改写')
      dict.entries().forEach(([, value]) => inspect(value))
    } else if (dict instanceof PDFArray) dict.asArray().forEach(inspect)
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object)
  if (pdf.catalog.has(key('StructTreeRoot')))
    throw new Error('带标签 PDF 暂不支持添加或调整视觉签名')
  const all = allOwn(pdf),
    page = pdf.getPages()[op.page - 1]
  if (!page) throw new Error('签名页码越界')
  const geometryIssue = pdfVisualSignatureIssue(page)
  if (op.op !== 'delete_visual_signature' && geometryIssue) throw new Error(geometryIssue)
  if (op.op === 'add_visual_signature') {
    if (all.length >= 100) throw new Error('PDF 签名最多 100 项')
    const source = pdfSignatureSourceSchema.parse(op.source)
    validateSource(source)
    checkRect(page, op.rect)
    if (
      all.reduce((n, item) => n + JSON.stringify(item.record.source).length, 0) +
        JSON.stringify(source).length >
      PDF_SIGNATURE_LIMITS.sourceBytes
    )
      throw new Error('PDF 签名素材合计超过 16 MiB')
    if (
      Math.abs(op.rect.width / source.width - op.rect.height / source.height) >
      (op.rect.width / source.width) * 0.0001
    )
      throw new Error('签名必须等比缩放')
    const p = native(page, [op.rect.x, op.rect.y]),
      px = native(page, [op.rect.x + op.rect.width, op.rect.y]),
      py = native(page, [op.rect.x, op.rect.y + op.rect.height])
    await write(
      pdf,
      page,
      {
        version: 1,
        source,
        matrix: [
          (px[0] - p[0]) / source.width,
          (px[1] - p[1]) / source.width,
          (py[0] - p[0]) / source.height,
          (py[1] - p[1]) / source.height,
          ...p,
        ],
      },
      `MVS-${randomUUID()}`,
    )
  } else {
    const item = all.find((s) => s.id === op.id && s.page === page)
    if (!item) throw new Error('找不到可验证的本编辑器签名；外来批注保持只读')
    if (op.op === 'delete_visual_signature') {
      const annots = page.node.lookup(key('Annots'), PDFArray),
        index = annots
          .asArray()
          .findIndex((ref) => ref === item.ref || ref.toString() === item.ref.toString())
      if (index < 0) throw new Error('签名目标已变化')
      annots.remove(index)
    } else {
      checkRect(page, op.rect)
      const old = bounds(corners(item.record).map((p) => display(page, p))),
        scale = op.rect.width / old.width
      if (Math.abs(op.rect.height / old.height - scale) > scale * 0.0001)
        throw new Error('签名必须等比缩放')
      const transform = (p: Point) => {
          const [x, y] = display(page, p)
          return native(page, [op.rect.x + (x - old.x) * scale, op.rect.y + (y - old.y) * scale])
        },
        m = item.record.matrix,
        p = transform([m[4], m[5]]),
        px = transform([m[0] + m[4], m[1] + m[5]]),
        py = transform([m[2] + m[4], m[3] + m[5]])
      await write(
        pdf,
        page,
        { ...item.record, matrix: [px[0] - p[0], px[1] - p[1], py[0] - p[0], py[1] - p[1], ...p] },
        item.id,
        item.dict,
      )
    }
  }
}
/** Capture before pdf-lib scales Rect/InkList, then publish matching appearance/width afterward. */
export function preparePdfVisualSignatureScale(page: PDFPage, scale: number) {
  const items = (page.node.lookupMaybe(key('Annots'), PDFArray)?.asArray() ?? []).flatMap((raw) => {
    const item = own(page, raw)
    return item ? [item] : []
  })
  return () => {
    for (const item of items) {
      const record = { ...item.record, matrix: item.record.matrix.map((n) => n * scale) as Matrix },
        r = bounds(corners(record)),
        ap = item.dict.lookup(key('AP'), PDFDict).get(key('N'))!
      const stream = page.doc.context.register(
        page.doc.context.stream(`q ${format(scale)} 0 0 ${format(scale)} 0 0 cm /Original Do Q`, {
          Type: 'XObject',
          Subtype: 'Form',
          FormType: 1,
          BBox: [r.x, r.y, r.x + r.width, r.y + r.height],
          Resources: { XObject: { Original: ap } },
        }),
      )
      item.dict.set(key('AP'), page.doc.context.obj({ N: stream }))
      if (record.source.kind === 'ink')
        item.dict.set(
          key('BS'),
          page.doc.context.obj({
            W: record.source.thickness * Math.hypot(record.matrix[0], record.matrix[1]),
            S: 'S',
          }),
        )
      item.dict.set(
        key(MARK),
        page.doc.context.register(page.doc.context.stream(JSON.stringify(record))),
      )
      item.dict.set(key(HASH), PDFHexString.fromText(digest(item.dict)))
    }
  }
}
export function clonePdfVisualSignatureId(
  page: PDFPage,
  source: PDFDict,
  clone: PDFDict,
  id: string,
) {
  if (own(page, source)) {
    clone.set(key('NM'), PDFHexString.fromText(id))
  }
}
