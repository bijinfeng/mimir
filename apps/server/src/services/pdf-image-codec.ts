import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import type {
  PdfNativeImage,
  PdfNativeImageCodec,
} from '../../../../packages/office/src/shims/pdf-native-image.js'
export const PDF_IMAGE_MAX_BYTES = 8 * 1024 * 1024
const MAX_PIXELS = 16_000_000
export interface PdfPixels {
  width: number
  height: number
  data: Uint8ClampedArray
}
function dimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > MAX_PIXELS
  )
    throw new Error('图片尺寸超过限制（最长边8192、1600万像素）')
}
function validatePng(source: Buffer): void {
  let at = 8,
    headers = 0,
    ended = false
  while (at + 12 <= source.length) {
    const length = source.readUInt32BE(at)
    if (at + length + 12 > source.length) throw new Error('PNG 数据块长度无效')
    const type = source.toString('ascii', at + 4, at + 8)
    if (type === 'IHDR') {
      if (at !== 8 || headers++ || length !== 13) throw new Error('PNG 图片头重复或不合法')
      dimensions(source.readUInt32BE(at + 8), source.readUInt32BE(at + 12))
    } else if (!headers) throw new Error('PNG 图片头缺失')
    at += length + 12
    if (type === 'IEND') {
      ended = true
      break
    }
  }
  if (!ended || at !== source.length) throw new Error('PNG 数据块不完整')
}
export function decodePdfImage(bytes: Uint8Array): PdfPixels {
  if (!bytes.length || bytes.length > PDF_IMAGE_MAX_BYTES) throw new Error('图片超过8MiB或为空')
  const source = Buffer.from(bytes)
  let image: { width: number; height: number; data: Uint8Array }
  if (
    source.length >= 24 &&
    source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    // pngjs accepts repeated IHDR chunks; validate every header before inflate
    // so a later header cannot bypass the initial dimension budget.
    validatePng(source)
    image = PNG.sync.read(source, { checkCRC: true })
  } else if (source[0] === 255 && source[1] === 216) {
    image = jpeg.decode(source, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 16,
      maxMemoryUsageInMB: 128,
      tolerantDecoding: false,
    })
  } else throw new Error('PDF 图片仅支持 PNG 或 JPEG')
  dimensions(image.width, image.height)
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
}
export function encodePdfPng(image: PdfPixels): Buffer {
  dimensions(image.width, image.height)
  if (image.data.length !== image.width * image.height * 4) throw new Error('图片像素数据长度无效')
  return PNG.sync.write({
    width: image.width,
    height: image.height,
    data: Buffer.from(image.data),
  } as PNG)
}
function native(image: PdfPixels): PdfNativeImage {
  return {
    isEmpty: () => false,
    getSize: () => ({ width: image.width, height: image.height }),
    toPNG: () => encodePdfPng(image),
    toBitmap() {
      const result = Buffer.alloc(image.data.length)
      for (let at = 0; at < result.length; at += 4) {
        const alpha = image.data[at + 3]!
        result[at] = Math.round((image.data[at + 2]! * alpha) / 255)
        result[at + 1] = Math.round((image.data[at + 1]! * alpha) / 255)
        result[at + 2] = Math.round((image.data[at]! * alpha) / 255)
        result[at + 3] = alpha
      }
      return result
    },
  }
}
export const pdfNativeImageCodec: PdfNativeImageCodec = {
  createFromBuffer(bytes) {
    return native(decodePdfImage(bytes))
  },
  createFromBitmap(bytes, { width, height }) {
    dimensions(width, height)
    if (bytes.length !== width * height * 4) throw new Error('PDF 位图长度无效')
    const data = new Uint8ClampedArray(bytes.length)
    for (let at = 0; at < data.length; at += 4) {
      // These bitmaps come from PDFium, whose BGRA colors are straight alpha.
      // Only toBitmap() mimics Electron's premultiplication for decodeImage.
      data[at] = bytes[at + 2]!
      data[at + 1] = bytes[at + 1]!
      data[at + 2] = bytes[at]!
      data[at + 3] = bytes[at + 3]!
    }
    return native({ width, height, data })
  },
}
