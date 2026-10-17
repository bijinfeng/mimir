import UTIF from 'utif2'
import { readPptxImageInfo, validatePptxImageMime } from '@mimir/shared'
import type { PptxArchive } from './pptx-archive.js'

type DisplayCanvas = {
  width: number
  height: number
  getContext: (
    type: '2d',
  ) => { putImageData: (image: unknown, x: number, y: number) => void } | null
  toDataURL: (type: string) => string
  convertToBlob: (options: { type: string }) => Promise<Blob>
}
type DisplayImage = {
  src: string
  naturalWidth: number
  naturalHeight: number
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void
  removeEventListener: (type: string, listener: () => void) => void
}
type DisplayGlobals = {
  document?: { createElement: (tag: 'canvas') => DisplayCanvas }
  ImageData?: new (pixels: Uint8ClampedArray, width: number, height: number) => unknown
  OffscreenCanvas?: new (width: number, height: number) => DisplayCanvas
  Image?: new () => DisplayImage
}

/** PowerPoint uses JPEG's raw pixel grid; neutralize EXIF only in the display copy.
 * Adapted from fixed GenOffice slides/main/jpeg-orientation.ts (Apache-2.0).
 */
export function neutralizePptxJpegOrientation(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return bytes
    while (bytes[at + 1] === 0xff) at++
    if (at + 4 > bytes.length) return bytes
    const marker = bytes[at + 1]!
    if (marker === 0xda || marker === 0xd9) return bytes
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    const size = view.getUint16(at + 2),
      end = at + 2 + size
    if (size < 2 || end > bytes.length) return bytes
    if (
      marker === 0xe1 &&
      size >= 16 &&
      [69, 120, 105, 102, 0, 0].every((value, index) => bytes[at + 4 + index] === value)
    ) {
      const tiff = at + 10,
        little = bytes[tiff] === 73 && bytes[tiff + 1] === 73
      if (!little && !(bytes[tiff] === 77 && bytes[tiff + 1] === 77)) return bytes
      if (view.getUint16(tiff + 2, little) !== 42) return bytes
      const offset = tiff + view.getUint32(tiff + 4, little)
      if (offset < tiff + 8 || offset + 2 > end) return bytes
      const count = view.getUint16(offset, little)
      if (offset + 2 + count * 12 > end) return bytes
      for (let index = 0; index < count; index++) {
        const entry = offset + 2 + index * 12
        if (view.getUint16(entry, little) !== 274) continue
        if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1)
          return bytes
        const current = view.getUint16(entry + 8, little)
        if (current < 2 || current > 8) return bytes
        const copy = bytes.slice()
        new DataView(copy.buffer).setUint16(entry + 8, 1, little)
        return copy
      }
    }
    at = end
  }
  return bytes
}

/** TIFF page selection matches upload dimensions. No archive bytes are changed. */
export function decodePptxTiffPixels(bytes: Uint8Array) {
  const info = readPptxImageInfo(bytes)
  if (info.ext !== 'tiff' || info.tiffIfdOffset === undefined) throw new Error('图片不是标准 TIFF')
  const buffer = new Uint8Array(bytes).buffer
  // Give UTIF only the chosen IFD and leave ancillary private metadata opaque.
  // This also prevents recursive Exif/SubIFD/MakerNote parsing of unselected data.
  const view = new DataView(buffer),
    little = bytes[0] === 73,
    offset = info.tiffIfdOffset
  view.setUint32(4, offset, little)
  const count = view.getUint16(offset, little)
  view.setUint32(offset + 2 + count * 12, 0, little)
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12,
      tag = view.getUint16(entry, little)
    // Private camera tags can redirect UTIF despite a normal Compression tag.
    if (
      ![
        256, 257, 258, 259, 262, 266, 273, 277, 278, 279, 284, 317, 320, 322, 323, 324, 325, 338,
        339,
      ].includes(tag)
    )
      view.setUint16(entry, 65000, little)
  }
  const pages = UTIF.decode(buffer)
  const selected = pages[0]
  if (!selected) throw new Error('TIFF 页面已失效')
  // The bounded raw IFD parser runs before UTIF allocates image pixels.
  const width = Array.isArray(selected.t256) ? selected.t256[0] : undefined,
    height = Array.isArray(selected.t257) ? selected.t257[0] : undefined
  if (width !== info.width || height !== info.height) throw new Error('TIFF 页面尺寸不一致')
  UTIF.decodeImage(buffer, selected)
  if (selected.width !== width || selected.height !== height) throw new Error('TIFF 解码尺寸无效')
  const rgba = UTIF.toRGBA8(selected)
  if (rgba.byteLength !== width * height * 4) throw new Error('TIFF 像素数据不完整')
  return { width, height, pixels: new Uint8ClampedArray(rgba) }
}

export function pptxImageDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(binary)}`
}

export async function pptxTiffDisplayUrl(bytes: Uint8Array): Promise<string> {
  const { width, height, pixels } = decodePptxTiffPixels(bytes)
  const dom = globalThis as unknown as DisplayGlobals
  if (!dom.ImageData) throw new Error('当前环境无法显示 TIFF，请使用浏览器打开')
  const image = new dom.ImageData(pixels, width, height)
  if (dom.document) {
    const canvas = dom.document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法准备 TIFF 图片预览，请重新打开面板')
    context.putImageData(image, 0, 0)
    const url = canvas.toDataURL('image/png')
    canvas.width = canvas.height = 0
    if (!url.startsWith('data:image/png;base64,')) throw new Error('无法生成 TIFF 图片预览')
    return url
  }
  if (dom.OffscreenCanvas) {
    const canvas = new dom.OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法准备 TIFF 图片预览')
    context.putImageData(image, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return pptxImageDataUrl(new Uint8Array(await blob.arrayBuffer()), 'image/png')
  }
  throw new Error('当前环境无法显示 TIFF，请使用浏览器打开')
}

/** Keep the archive's synchronous resolver contract; prepare TIFF before publication. */
export async function preparePptxDisplayMedia(
  archive: PptxArchive,
): Promise<ReadonlyMap<string, string>> {
  const media = archive.readMediaDataUrls()
  for (const [path, url] of media) {
    const bytes = archive.readBytes(path)
    if (bytes && /^data:image\/jpeg[;,]/.test(url)) {
      media.set(path, pptxImageDataUrl(neutralizePptxJpegOrientation(bytes), 'image/jpeg'))
      continue
    }
    if (!/^data:image\/tiff[;,]/.test(url)) continue
    try {
      if (!bytes) throw new Error('图片源未找到')
      media.set(path, await pptxTiffDisplayUrl(bytes))
    } catch {
      // Preserve malformed/unsupported native bytes; do not publish an undecodable TIFF URL.
      media.delete(path)
    }
  }
  return media
}

/** Validate the original file, prepare only its display URL, and retain the file for upload. */
export async function preparePptxPictureFile(file: File, signal?: AbortSignal) {
  const check = () => {
    if (signal?.aborted) throw new Error('图片预览已取消')
  }
  check()
  const bytes = new Uint8Array(await file.arrayBuffer())
  check()
  const info = readPptxImageInfo(bytes)
  validatePptxImageMime(info, file.type)
  const url =
    info.ext === 'tiff'
      ? await pptxTiffDisplayUrl(bytes)
      : pptxImageDataUrl(
          info.ext === 'jpg' ? neutralizePptxJpegOrientation(bytes) : bytes,
          info.mime,
        )
  check()
  const ImageConstructor = (globalThis as unknown as DisplayGlobals).Image
  if (ImageConstructor) {
    await new Promise<void>((resolve, reject) => {
      const image = new ImageConstructor()
      const cleanup = () => {
        image.removeEventListener('load', loaded)
        image.removeEventListener('error', failed)
        signal?.removeEventListener('abort', aborted)
      }
      const aborted = () => {
        cleanup()
        image.src = ''
        reject(new Error('图片预览已取消'))
      }
      const loaded = () => {
        cleanup()
        if (image.naturalWidth !== info.width || image.naturalHeight !== info.height)
          reject(new Error('图片解码尺寸与原件不一致，请重新导出图片'))
        else resolve()
      }
      const failed = () => {
        cleanup()
        reject(new Error('图片无法解码，请换用其它图片或重新导出'))
      }
      image.addEventListener('load', loaded, { once: true })
      image.addEventListener('error', failed, { once: true })
      signal?.addEventListener('abort', aborted, { once: true })
      image.src = url
    })
  }
  check()
  return { file, url, info, bytes }
}
