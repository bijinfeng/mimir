import { createHash } from 'node:crypto'
import {
  pdfImageOperationSchema,
  type PdfImageOperation,
  type PdfImageSnapshot,
  type PdfImageTarget,
  type PdfPageImage,
} from '@mimir/shared'
import { configurePdfImageCodec } from '../../../../packages/office/src/shims/pdf-native-image.js'
import {
  chainPdfium,
  loadPdfium,
  withDocument,
  type Pdfium,
} from '../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js'
import { applyImageEdits } from '../../../../packages/office/vendor/apps/pdf/src/main/image-edit.js'
import type { ImageEditInput } from '../../../../packages/office/vendor/apps/pdf/src/shared/ipc.js'
import { flipPixels } from '../../../../packages/office/vendor/apps/pdf/src/renderer/image-bake.js'
import { removeBackground } from '../../../../packages/office/vendor/apps/pdf/src/renderer/cutout.js'
import {
  decodePdfImage,
  encodePdfPng,
  pdfNativeImageCodec,
  type PdfPixels,
} from './pdf-image-codec.js'
import { assertSafeToRewrite, initializePdfAgentHost } from './pdf-agent-host.js'
import { applyPdfImageOpacity, readPdfImageOpacity } from './pdf-image-opacity.js'
import { fetchDocxImage } from './docx-image-fetch.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const near = (a: readonly number[], b: readonly number[]) =>
  a.every((n, at) => Math.abs(n - b[at]!) < 0.5)
function initialize() {
  initializePdfAgentHost()
  configurePdfImageCodec(pdfNativeImageCodec)
}
interface ImageObject {
  pageIndex: number
  objectIndex: number
  bounds: [number, number, number, number]
  resourceSha256: string
  matrix: number[]
  aboveText: boolean
  nested: boolean
}
function matrix(m: Pdfium, object: number): number[] {
  const { _FPDFPageObj_GetMatrix: FPDFPageObj_GetMatrix, _free: release, _malloc: allocate } = m
  const pointer = allocate(24)
  try {
    if (!FPDFPageObj_GetMatrix(object, pointer)) throw new Error('无法读取图片矩阵')
    return Array.from(m.HEAPF32.subarray(pointer >> 2, (pointer >> 2) + 6))
  } finally {
    release(pointer)
  }
}
async function objects(
  bytes: Uint8Array,
): Promise<{ images: ImageObject[]; nestedPages: number[] }> {
  initialize()
  return chainPdfium(async () => {
    const m = await loadPdfium()
    const {
      _FPDFImageObj_GetImageDataRaw: FPDFImageObj_GetImageDataRaw,
      _FPDFPageObj_GetBounds: FPDFPageObj_GetBounds,
      _FPDFPageObj_GetType: FPDFPageObj_GetType,
      _FPDFPage_CountObjects: FPDFPage_CountObjects,
      _FPDFPage_GetObject: FPDFPage_GetObject,
      _FPDF_ClosePage: FPDF_ClosePage,
      _FPDF_GetPageCount: FPDF_GetPageCount,
      _FPDF_LoadPage: FPDF_LoadPage,
      _free: release,
      _malloc: allocate,
    } = m
    return withDocument(m, bytes, async (doc) => {
      const result: ImageObject[] = []
      const nestedPages: number[] = []
      const pageCount = FPDF_GetPageCount(doc)
      if (pageCount > 1000) throw new Error('图片操作最多支持1000页PDF')
      const pointers = Array.from({ length: 4 }, () => allocate(4))
      try {
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
          const page = FPDF_LoadPage(doc, pageIndex)
          if (!page) throw new Error('无法读取图片所在页')
          try {
            const count = FPDFPage_CountObjects(page)
            let textIndex = -1,
              nested = false
            for (let at = 0; at < count; at++) {
              const type = FPDFPageObj_GetType(FPDFPage_GetObject(page, at))
              if (type === 1 && textIndex < 0) textIndex = at
              if (type === 5) nested = true
            }
            if (nested) nestedPages.push(pageIndex + 1)
            for (let objectIndex = 0; objectIndex < count; objectIndex++) {
              const object = FPDFPage_GetObject(page, objectIndex)
              if (FPDFPageObj_GetType(object) !== 3) continue
              if (result.length >= 100) throw new Error('图片操作最多支持100个图片对象')
              if (
                !FPDFPageObj_GetBounds(
                  object,
                  pointers[0]!,
                  pointers[1]!,
                  pointers[2]!,
                  pointers[3]!,
                )
              )
                throw new Error('图片边界不可读取')
              const bounds = pointers.map((p) => m.HEAPF32[p >> 2]!) as [
                number,
                number,
                number,
                number,
              ]
              const length = FPDFImageObj_GetImageDataRaw(object, 0, 0)
              if (!length || length > 50 * 1024 * 1024) throw new Error('图片资源数据无效或过大')
              const buffer = allocate(length)
              try {
                if (FPDFImageObj_GetImageDataRaw(object, buffer, length) !== length)
                  throw new Error('图片资源数据无法读取')
                result.push({
                  pageIndex,
                  objectIndex,
                  bounds,
                  matrix: matrix(m, object),
                  resourceSha256: digest(m.HEAPU8.subarray(buffer, buffer + length)),
                  aboveText: textIndex >= 0 && objectIndex > textIndex,
                  nested,
                })
              } finally {
                release(buffer)
              }
            }
          } finally {
            FPDF_ClosePage(page)
          }
        }
      } finally {
        pointers.forEach((p) => release(p))
      }
      return { images: result, nestedPages }
    })
  })
}
async function geometry(bytes: Uint8Array, pageIndex: number) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise
    if (pageIndex < 0 || pageIndex >= pdf.numPages) throw new Error('图片页号无效')
    return (await pdf.getPage(pageIndex + 1)).getViewport({ scale: 1 })
  } finally {
    await task.destroy()
  }
}
export async function readPdfImages(bytes: Uint8Array): Promise<PdfImageSnapshot> {
  const enumerated = await objects(bytes)
  const all = enumerated.images,
    sha256 = digest(bytes)
  const images: PdfPageImage[] = []
  const unsupportedPages = enumerated.nestedPages
  for (const pageIndex of new Set(all.map((o) => o.pageIndex))) {
    const viewport = await geometry(bytes, pageIndex)
    const pageImages = all.filter((o) => o.pageIndex === pageIndex)
    for (const [at, item] of pageImages.entries()) {
      const [a, b] = viewport.convertToViewportPoint(item.bounds[0], item.bounds[1])
      const [c, d] = viewport.convertToViewportPoint(item.bounds[2], item.bounds[3])
      const duplicate =
        all.filter((candidate) => candidate.resourceSha256 === item.resourceSha256).length > 1
      const ambiguous =
        pageImages.filter((candidate) =>
          candidate.bounds.every((v, i) => Math.abs(v - item.bounds[i]!) <= 2),
        ).length > 1
      const reason = item.nested
        ? '页面含嵌套Form XObject，暂不能安全编辑图片'
        : duplicate
          ? '图片资源重复或复用，暂不能安全区分'
          : ambiguous
            ? '图片对象边界重叠，暂不能安全定位'
            : undefined
      images.push({
        target: {
          sha256,
          pageIndex,
          objectIndex: item.objectIndex,
          bounds: item.bounds,
          resourceSha256: item.resourceSha256,
        },
        page: pageIndex + 1,
        image_number: at + 1,
        x: Math.min(a!, c!),
        y: Math.min(b!, d!),
        width: Math.abs(c! - a!),
        height: Math.abs(d! - b!),
        layer: item.aboveText ? 'above_text' : 'below_text',
        editable: !reason,
        reason,
      })
    }
  }
  const opacity = await readPdfImageOpacity(
    bytes,
    images.map((image) => image.target),
  )
  for (const image of images)
    image.opacity = opacity.get(`${image.target.pageIndex}:${image.target.objectIndex}`)
  return { sha256, images, unsupportedPages }
}
async function confirm(bytes: Uint8Array, target: PdfImageTarget) {
  if (digest(bytes) !== target.sha256) throw new Error('PDF 图片目标已过期，请重新读取')
  const all = await readPdfImages(bytes)
  const item = all.images.find(
    (entry) =>
      entry.target.pageIndex === target.pageIndex &&
      entry.target.objectIndex === target.objectIndex,
  )
  if (
    !item ||
    item.target.resourceSha256 !== target.resourceSha256 ||
    !near(item.target.bounds, target.bounds)
  )
    throw new Error('PDF 图片对象已变化')
  if (!item.editable) throw new Error(item.reason)
  return item
}
function rectOf(
  viewport: Awaited<ReturnType<typeof geometry>>,
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number, number, number] {
  if (
    width <= 0 ||
    height <= 0 ||
    x < 0 ||
    y < 0 ||
    x + width > viewport.width + 0.5 ||
    y + height > viewport.height + 0.5
  )
    throw new Error('图片位置或尺寸超出页面')
  const a = viewport.convertToPdfPoint(x, y),
    b = viewport.convertToPdfPoint(x + width, y + height)
  return [
    Math.min(a[0]!, b[0]!),
    Math.min(a[1]!, b[1]!),
    Math.max(a[0]!, b[0]!),
    Math.max(a[1]!, b[1]!),
  ]
}
async function sourceOf(op: { image?: string; url?: string }): Promise<string> {
  if (!!op.image === !!op.url) throw new Error('须且只能提供一份图片或URL')
  const base64 = op.image ?? (await fetchDocxImage(op.url!)).dataUrl.split(',')[1]!
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('图片Base64无效')
  // Decode and normalize before entering PDFium; this enforces size/pixel/MIME budgets.
  return encodePdfPng(decodePdfImage(Buffer.from(base64, 'base64'))).toString('base64')
}
interface ExtraPdfium extends Pdfium {
  _FPDFImageObj_GetImageMetadata(object: number, page: number, metadata: number): number
}
/** Extract intrinsic pixels, including SMask, independently of page/object rotation and /ca. */
async function pixelsOf(
  bytes: Uint8Array,
  target: PdfImageTarget,
): Promise<{ pixels: PdfPixels; matrix: number[] }> {
  return chainPdfium(async () => {
    const m = (await loadPdfium()) as ExtraPdfium
    const {
      _FPDFBitmap_Destroy: FPDFBitmap_Destroy,
      _FPDFBitmap_GetBuffer: FPDFBitmap_GetBuffer,
      _FPDFBitmap_GetHeight: FPDFBitmap_GetHeight,
      _FPDFBitmap_GetStride: FPDFBitmap_GetStride,
      _FPDFBitmap_GetWidth: FPDFBitmap_GetWidth,
      _FPDFImageObj_GetImageMetadata: FPDFImageObj_GetImageMetadata,
      _FPDFImageObj_GetRenderedBitmap: FPDFImageObj_GetRenderedBitmap,
      _FPDFPageObj_SetFillColor: FPDFPageObj_SetFillColor,
      _FPDFPageObj_SetMatrix: FPDFPageObj_SetMatrix,
      _FPDFPage_GetObject: FPDFPage_GetObject,
      _FPDF_ClosePage: FPDF_ClosePage,
      _FPDF_LoadPage: FPDF_LoadPage,
      _free: release,
      _malloc: allocate,
    } = m
    return withDocument(m, bytes, async (doc) => {
      const page = FPDF_LoadPage(doc, target.pageIndex)
      if (!page) throw new Error('无法读取图片页')
      try {
        const object = FPDFPage_GetObject(page, target.objectIndex)
        const originalMatrix = matrix(m, object)
        const metadata = allocate(32)
        let width: number, height: number
        try {
          if (!FPDFImageObj_GetImageMetadata(object, page, metadata))
            throw new Error('无法读取图片像素尺寸')
          width = m.HEAP32[metadata >> 2]!
          height = m.HEAP32[(metadata >> 2) + 1]!
          if (
            width < 1 ||
            height < 1 ||
            width > 8192 ||
            height > 8192 ||
            width * height > 16_000_000
          )
            throw new Error('原图超过像素处理限制')
        } finally {
          release(metadata)
        }
        const scale = Math.min(1, 2400 / Math.max(width, height))
        width = Math.max(1, Math.round(width * scale))
        height = Math.max(1, Math.round(height * scale))
        const pointer = allocate(24)
        try {
          m.HEAPF32.set([width, 0, 0, height, 0, 0], pointer >> 2)
          if (!FPDFPageObj_SetMatrix(object, pointer)) throw new Error('图片像素矩阵不可读取')
        } finally {
          release(pointer)
        }
        if (!FPDFPageObj_SetFillColor(object, 255, 255, 255, 255))
          throw new Error('无法分离图片透明度')
        const rendered = FPDFImageObj_GetRenderedBitmap(doc, page, object)
        if (!rendered) throw new Error('图片像素渲染失败')
        try {
          width = FPDFBitmap_GetWidth(rendered)
          height = FPDFBitmap_GetHeight(rendered)
          if (!width || !height || width * height > 16_000_000) throw new Error('图片像素尺寸无效')
          const stride = FPDFBitmap_GetStride(rendered),
            buffer = FPDFBitmap_GetBuffer(rendered)
          const tight = Buffer.alloc(width * height * 4)
          for (let row = 0; row < height; row++)
            tight.set(
              m.HEAPU8.subarray(buffer + row * stride, buffer + row * stride + width * 4),
              row * width * 4,
            )
          return {
            pixels: decodePdfImage(
              pdfNativeImageCodec.createFromBitmap(tight, { width, height }).toPNG(),
            ),
            matrix: originalMatrix,
          }
        } finally {
          FPDFBitmap_Destroy(rendered)
        }
      } finally {
        FPDF_ClosePage(page)
      }
    })
  })
}
function sourceCrop(rotation: number, l: number, t: number, r: number, b: number) {
  if (rotation === 90) return { l: t, t: r, r: 1 - b, b: 1 - l }
  if (rotation === 180) return { l: r, t: b, r: 1 - l, b: 1 - t }
  if (rotation === 270) return { l: b, t: l, r: 1 - t, b: 1 - r }
  return { l, t, r: 1 - r, b: 1 - b }
}
const layer = (value?: 'above_text' | 'below_text') =>
  value === 'above_text' ? ('aboveText' as const) : ('belowText' as const)
export async function applyPdfImageOperation(
  bytes: Uint8Array,
  raw: PdfImageOperation,
): Promise<{ bytes?: Uint8Array; images: PdfImageSnapshot }> {
  const op = pdfImageOperationSchema.parse(raw)
  if (op.op === 'read') {
    const snapshot = await readPdfImages(bytes)
    if (op.pageIndex !== undefined) {
      await geometry(bytes, op.pageIndex)
      snapshot.images = snapshot.images.filter((item) => item.page === op.pageIndex! + 1)
    }
    return { images: snapshot }
  }
  await assertSafeToRewrite(bytes)
  initialize()
  const before = await readPdfImages(bytes)
  let edit: ImageEditInput | undefined, result: Uint8Array | undefined
  let expectedRect: [number, number, number, number] | undefined
  const item = 'target' in op ? await confirm(bytes, op.target) : undefined
  const pageIndex = item?.target.pageIndex ?? ('pageIndex' in op ? op.pageIndex : 0)
  const viewport = await geometry(bytes, pageIndex)
  if (op.op === 'insert_image') {
    if (before.unsupportedPages.includes(pageIndex + 1)) throw new Error('嵌套图片页面暂不能插图')
    const image = await sourceOf(op),
      decoded = decodePdfImage(Buffer.from(image, 'base64'))
    const width =
      op.width ??
      (op.height
        ? (op.height * decoded.width) / decoded.height
        : Math.min(decoded.width, viewport.width * 0.5))
    const height = op.height ?? (width * decoded.height) / decoded.width
    if (op.anchor && (op.x !== undefined || op.y !== undefined))
      throw new Error('图片锚点和坐标不能混用')
    let x = op.x ?? (viewport.width - width) / 2,
      y = op.y ?? (viewport.height - height) / 2
    if (op.anchor) {
      const a = op.anchor
      x = a.x
      y = a.y + a.height + 8
      if (a.placement === 'above') y = a.y - height - 8
      else if (a.placement === 'right') {
        x = a.x + a.width + 8
        y = a.y
      } else if (a.placement === 'left') {
        x = a.x - width - 8
        y = a.y
      }
    }
    expectedRect = rectOf(viewport, x, y, width, height)
    edit = {
      kind: 'insertImage',
      pageIndex,
      image,
      rect: expectedRect,
      layer: layer(op.layer),
      rotate: viewport.rotation,
    }
  } else if (op.op === 'delete_image')
    edit = { kind: 'deleteImage', pageIndex, oldRect: [...op.target.bounds] }
  else if (op.op === 'set_image_opacity') {
    expectedRect = [...op.target.bounds]
    result = await applyPdfImageOpacity(bytes, op.target, op.alpha)
  } else if (op.op === 'replace_image') {
    expectedRect = [...op.target.bounds]
    edit = {
      kind: 'replaceImage',
      pageIndex,
      oldRect: [...op.target.bounds],
      rect: expectedRect,
      image: await sourceOf(op),
    }
  } else if (op.op === 'transform_image' || op.op === 'rotate_image') {
    let x = item!.x,
      y = item!.y,
      width = item!.width,
      height = item!.height,
      quarterTurns = 0
    if (op.op === 'transform_image') {
      if (
        op.x === undefined &&
        op.y === undefined &&
        op.width === undefined &&
        op.height === undefined &&
        op.layer === undefined
      )
        throw new Error('图片变换缺少参数')
      width = op.width ?? (op.height ? (op.height * width) / height : width)
      height = op.height ?? (op.width ? (op.width * height) / item!.width : height)
      x = op.x ?? x
      y = op.y ?? y
    } else {
      quarterTurns = op.direction === 'cw' ? 1 : op.direction === 'ccw' ? 3 : 2
      if (quarterTurns % 2) {
        x += (width - height) / 2
        y += (height - width) / 2
        ;[width, height] = [height, width]
      }
    }
    expectedRect = rectOf(viewport, x, y, width, height)
    edit = {
      kind: 'transformImage',
      pageIndex,
      oldRect: [...op.target.bounds],
      rect: expectedRect,
      quarterTurns,
      layer: op.op === 'transform_image' && op.layer ? layer(op.layer) : undefined,
    }
  } else {
    const extracted = await pixelsOf(bytes, op.target),
      image = extracted.pixels
    const angle = (Math.atan2(extracted.matrix[1]!, extracted.matrix[0]!) * 180) / Math.PI
    const rotation = (((viewport.rotation - Math.round(angle / 90) * 90) % 360) + 360) % 360
    if (
      extracted.matrix[0]! * extracted.matrix[3]! - extracted.matrix[1]! * extracted.matrix[2]! <=
        0 ||
      Math.abs(angle / 90 - Math.round(angle / 90)) > 0.001 ||
      Math.abs(
        extracted.matrix[0]! * extracted.matrix[2]! + extracted.matrix[1]! * extracted.matrix[3]!,
      ) > 0.1
    )
      throw new Error('暂不支持倾斜图片的像素编辑')
    expectedRect = [...op.target.bounds]
    let pixels: PdfPixels = image
    if (op.op === 'flip_image') {
      const horizontal = op.axis === 'horizontal'
      const axis = (rotation % 180 === 0 ? horizontal : !horizontal) ? 'h' : 'v'
      pixels = { ...image, data: flipPixels(image, axis) }
    } else if (op.op === 'remove_image_background')
      pixels = { ...image, data: removeBackground(image, op.tolerance ?? 30).data }
    else {
      if (op.left + op.right >= 1 || op.top + op.bottom >= 1)
        throw new Error('图片裁切后必须保留正面积')
      const crop = sourceCrop(rotation, op.left, op.top, op.right, op.bottom)
      const left = Math.round(crop.l * image.width),
        top = Math.round(crop.t * image.height),
        right = Math.round(crop.r * image.width),
        bottom = Math.round(crop.b * image.height)
      const width = right - left,
        height = bottom - top
      if (width < 1 || height < 1) throw new Error('裁切后没有剩余像素')
      const data = new Uint8ClampedArray(width * height * 4)
      for (let row = 0; row < height; row++)
        data.set(
          image.data.subarray(
            ((top + row) * image.width + left) * 4,
            ((top + row) * image.width + right) * 4,
          ),
          row * width * 4,
        )
      pixels = { width, height, data }
      expectedRect = rectOf(
        viewport,
        item!.x + op.left * item!.width,
        item!.y + op.top * item!.height,
        item!.width * (1 - op.left - op.right),
        item!.height * (1 - op.top - op.bottom),
      )
    }
    edit = {
      kind: 'replaceImage',
      pageIndex,
      oldRect: [...op.target.bounds],
      rect: expectedRect,
      image: encodePdfPng(pixels).toString('base64'),
    }
  }
  if (edit) {
    const applied = await applyImageEdits(bytes.slice(), [edit])
    if (applied.skipped.length) throw new Error(`PDF图片未写入：${applied.skipped[0]!.reason}`)
    result = applied.bytes
  }
  if (!result) throw new Error('PDF图片操作没有产生字节')
  let after = await readPdfImages(result)
  if (item?.opacity !== undefined && op.op !== 'set_image_opacity' && op.op !== 'delete_image') {
    const replaced = after.images.filter(
      (next) =>
        next.target.pageIndex === pageIndex &&
        expectedRect &&
        near(next.target.bounds, expectedRect),
    )
    if (replaced.length !== 1) throw new Error('图片变更后无法唯一恢复透明度')
    result = await applyPdfImageOpacity(result, replaced[0]!.target, item.opacity)
    after = await readPdfImages(result)
  }
  if (op.op === 'delete_image') {
    if (after.images.length !== before.images.length - 1) throw new Error('PDF图片删除读回失败')
  } else if (
    !after.images.some(
      (next) =>
        next.target.pageIndex === pageIndex &&
        expectedRect &&
        near(next.target.bounds, expectedRect),
    )
  )
    throw new Error('PDF图片位置读回失败')
  if (
    op.op === 'set_image_opacity' &&
    !after.images.some(
      (next) =>
        next.target.pageIndex === pageIndex &&
        expectedRect &&
        near(next.target.bounds, expectedRect) &&
        Math.abs((next.opacity ?? NaN) - op.alpha) < 1 / 255 + 1e-6,
    )
  )
    throw new Error('PDF图片透明度读回失败')
  if (op.op === 'insert_image' && after.images.length !== before.images.length + 1)
    throw new Error('PDF图片插入读回失败')
  // Independent PDF.js parser must still find images, text and page structure.
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: result.slice() })
  try {
    const page = await (await task.promise).getPage(pageIndex + 1)
    const operators = await page.getOperatorList()
    if (
      op.op !== 'delete_image' &&
      !operators.fnArray.some((fn) =>
        [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(
          fn,
        ),
      )
    )
      throw new Error('PDF图片未通过独立读回')
  } finally {
    await task.destroy()
  }
  return { bytes: result, images: after }
}
