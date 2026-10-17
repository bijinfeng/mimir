import { PPTX_IMAGE_MAX_BYTES } from './document-agent.js'

/** Picture upload/display contract. Original bytes are never transcoded for storage. */
export type PptxImageExtension = 'png' | 'jpg' | 'gif' | 'bmp' | 'webp' | 'tiff'
export interface PptxImageInfo {
  ext: PptxImageExtension
  mime: string
  width: number
  height: number
  animated: boolean
  /** Largest safe TIFF page; ties keep the first page. */
  tiffPage?: number
  tiffIfdOffset?: number
  pages?: number
}
export const PPTX_PICTURE_ACCEPT = '.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff'
export const PPTX_PICTURE_FORMATS = 'PNG、JPEG、GIF、BMP、WebP、TIFF'
export const PPTX_PICTURE_MAX_BYTES = PPTX_IMAGE_MAX_BYTES
export const PPTX_PICTURE_MAX_DIM = 16384
export const PPTX_PICTURE_MAX_PIXELS = 64_000_000
function invalid(): never {
  throw new Error('图片内容不完整或格式无效，请重新选择图片')
}
const safeDimensions = (width: number, height: number) =>
  Number.isSafeInteger(width) &&
  Number.isSafeInteger(height) &&
  width > 0 &&
  height > 0 &&
  width <= PPTX_PICTURE_MAX_DIM &&
  height <= PPTX_PICTURE_MAX_DIM &&
  width * height <= PPTX_PICTURE_MAX_PIXELS

/** Bounded metadata/container validation, independent of browser or image decoders. */
export function readPptxImageInfo(bytes: Uint8Array): PptxImageInfo {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > PPTX_PICTURE_MAX_BYTES)
    throw new Error('图片须为非空文件，且不超过 8 MiB')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const has = (at: number, length: number) =>
    Number.isSafeInteger(at) && at >= 0 && length >= 0 && at + length <= bytes.length
  const need = (at: number, length: number) => {
    if (!has(at, length)) invalid()
  }
  const ascii = (at: number, text: string) =>
    has(at, text.length) && [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0))
  const u16 = (at: number, little = false) => {
    need(at, 2)
    return view.getUint16(at, little)
  }
  const u32 = (at: number, little = false) => {
    need(at, 4)
    return view.getUint32(at, little)
  }
  const result = (
    ext: PptxImageExtension,
    width: number,
    height: number,
    extra: Partial<PptxImageInfo> = {},
  ): PptxImageInfo => {
    if (!safeDimensions(width, height))
      throw new Error('图片尺寸须在 16384 像素以内，且不超过 6400 万像素')
    return {
      ext,
      mime: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
      width,
      height,
      animated: false,
      ...extra,
    }
  }
  if (ascii(0, '\x89PNG\r\n\x1a\n')) {
    let at = 8,
      width = 0,
      height = 0,
      data = false,
      end = false
    while (at < bytes.length) {
      need(at, 12)
      const length = u32(at)
      need(at, length + 12)
      if (at === 8) {
        if (!ascii(at + 4, 'IHDR') || length !== 13) invalid()
        width = u32(at + 8)
        height = u32(at + 12)
      } else if (ascii(at + 4, 'IHDR')) invalid()
      if (ascii(at + 4, 'IDAT') && length) data = true
      if (ascii(at + 4, 'IEND')) {
        if (length !== 0 || at + 12 !== bytes.length) invalid()
        end = true
      }
      at += length + 12
    }
    if (!data || !end) invalid()
    return result('png', width, height)
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2,
      width = 0,
      height = 0,
      scan = false,
      end = false
    while (at < bytes.length) {
      if (bytes[at++] !== 0xff) invalid()
      while (bytes[at] === 0xff) at++
      const marker = bytes[at++]
      if (marker === 0xd9) {
        end = true
        break
      }
      if (marker === undefined || marker === 0 || marker === 0xd8) invalid()
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      const length = u16(at)
      if (length < 2) invalid()
      need(at, length)
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
        if (length < 8) invalid()
        height = u16(at + 3)
        width = u16(at + 5)
      }
      at += length
      if (marker === 0xda) {
        scan = true
        // Skip entropy bytes, stuffed FF00 and restart markers, then parse the next segment.
        while (at < bytes.length) {
          if (bytes[at] !== 0xff) at++
          else if (bytes[at + 1] === 0 || (bytes[at + 1]! >= 0xd0 && bytes[at + 1]! <= 0xd7))
            at += 2
          else break
        }
      }
    }
    if (!scan || !end) invalid()
    return result('jpg', width, height)
  }
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) {
    need(0, 13)
    const width = u16(6, true),
      height = u16(8, true)
    let at = 13 + (bytes[10]! & 0x80 ? 3 * 2 ** ((bytes[10]! & 7) + 1) : 0),
      frames = 0,
      end = false
    const subBlocks = () => {
      for (;;) {
        need(at, 1)
        const size = bytes[at++]!
        if (!size) return
        need(at, size)
        at += size
      }
    }
    need(0, at)
    while (at < bytes.length) {
      const marker = bytes[at++]
      if (marker === 0x3b) {
        end = true
        break
      }
      if (marker === 0x21) {
        need(at, 1)
        at++
        subBlocks()
      } else if (marker === 0x2c) {
        need(at, 9)
        const left = u16(at, true),
          top = u16(at + 2, true),
          frameWidth = u16(at + 4, true),
          frameHeight = u16(at + 6, true)
        if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height)
          invalid()
        const packed = bytes[at + 8]!
        at += 9 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0)
        need(at, 1)
        if (bytes[at]! < 2 || bytes[at]! > 8) invalid()
        at++
        subBlocks()
        frames++
      } else invalid()
    }
    if (!end || !frames || at !== bytes.length) invalid()
    return result('gif', width, height, { animated: frames > 1 })
  }
  if (ascii(0, 'BM')) {
    need(0, 26)
    const declared = u32(2, true),
      pixelOffset = u32(10, true),
      dib = u32(14, true)
    if (declared !== bytes.length || pixelOffset >= declared || dib < 12) invalid()
    need(14, dib)
    if (pixelOffset < 14 + dib) invalid()
    const core = dib === 12
    if (!core && dib < 40) invalid()
    const width = core ? u16(18, true) : view.getInt32(18, true),
      height = core ? u16(20, true) : Math.abs(view.getInt32(22, true)),
      planes = u16(core ? 22 : 26, true),
      bits = u16(core ? 24 : 28, true),
      compression = core ? 0 : u32(30, true)
    if (planes !== 1 || ![1, 4, 8, 16, 24, 32].includes(bits) || ![0, 3].includes(compression))
      throw new Error('此 BMP 编码暂不支持，请使用未压缩或位域编码的 BMP')
    const stride = Math.ceil((width * bits) / 32) * 4
    if (!safeDimensions(width, height)) return result('bmp', width, height)
    need(pixelOffset, stride * height)
    return result('bmp', width, height)
  }
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (u32(4, true) + 8 !== bytes.length) invalid()
    let at = 12,
      width = 0,
      height = 0,
      animated = false,
      image = false
    const u24 = (offset: number) => {
      need(offset, 3)
      return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65536
    }
    while (at < bytes.length) {
      need(at, 8)
      const length = u32(at + 4, true),
        data = at + 8
      need(data, length + (length & 1))
      if (ascii(at, 'VP8X')) {
        if (length !== 10 || at !== 12) invalid()
        animated = !!(bytes[data]! & 2)
        width = u24(data + 4) + 1
        height = u24(data + 7) + 1
      } else if (ascii(at, 'VP8 ')) {
        if (length < 10 || !ascii(data + 3, '\x9d\x01\x2a')) invalid()
        width ||= u16(data + 6, true) & 0x3fff
        height ||= u16(data + 8, true) & 0x3fff
        image = true
      } else if (ascii(at, 'VP8L')) {
        if (length < 5 || bytes[data] !== 0x2f) invalid()
        const dimensions = u32(data + 1, true)
        width ||= (dimensions & 0x3fff) + 1
        height ||= ((dimensions >>> 14) & 0x3fff) + 1
        image = true
      } else if (ascii(at, 'ANMF')) {
        if (!animated || length < 24) invalid()
        const x = u24(data) * 2,
          y = u24(data + 3) * 2,
          w = u24(data + 6) + 1,
          h = u24(data + 9) + 1
        if (x + w > width || y + h > height) invalid()
        // Frame payload is a complete padded sub-chunk sequence.
        let frame = data + 16,
          payload = false
        while (frame < data + length) {
          need(frame, 8)
          const size = u32(frame + 4, true)
          if (frame + 8 + size + (size & 1) > data + length) invalid()
          if (ascii(frame, 'VP8 ') || ascii(frame, 'VP8L')) payload ||= size >= 5
          frame += 8 + size + (size & 1)
        }
        if (!payload || frame !== data + length) invalid()
        image = true
      }
      at = data + length + (length & 1)
    }
    if (!image) invalid()
    return result('webp', width, height, { animated })
  }
  const little = ascii(0, 'II')
  if (little || ascii(0, 'MM')) {
    if (u16(2, little) !== 42) throw new Error('仅支持标准 TIFF，暂不支持 BigTIFF')
    let offset = u32(4, little),
      page = 0,
      tagBytes = 0,
      selected: PptxImageInfo | undefined
    const seen = new Set<number>()
    while (offset) {
      if (seen.has(offset) || page >= 128) invalid()
      seen.add(offset)
      const count = u16(offset, little)
      if (!count || count > 4096) invalid()
      need(offset + 2, count * 12 + 4)
      const tags = new Map<number, number[]>()
      for (let i = 0; i < count; i++) {
        const entry = offset + 2 + i * 12,
          tag = u16(entry, little),
          type = u16(entry + 2, little),
          size = u32(entry + 4, little)
        const typeBytes: Record<number, number> = {
          1: 1,
          2: 1,
          3: 2,
          4: 4,
          5: 8,
          6: 1,
          7: 1,
          8: 2,
          9: 4,
          10: 8,
          11: 4,
          12: 8,
          13: 4,
        }
        const unit = typeBytes[type]
        if (!unit || !size || size > 65536 || size * unit > bytes.length) invalid()
        tagBytes += size * unit
        if (tagBytes > 32 * 1024 * 1024) invalid()
        const data = size * unit <= 4 ? entry + 8 : u32(entry + 8, little)
        need(data, size * unit)
        if (
          [
            256, 257, 258, 259, 262, 266, 277, 278, 273, 279, 284, 317, 320, 322, 323, 324, 325,
            339, 50885,
          ].includes(tag)
        ) {
          if (![3, 4].includes(type) || size > 65536 || tags.has(tag)) invalid()
          tags.set(
            tag,
            Array.from({ length: size }, (_, index) =>
              type === 3 ? u16(data + index * unit, little) : u32(data + index * unit, little),
            ),
          )
        }
      }
      const tiled = tags.has(322)
      const width = tags.get(256)?.[0] ?? 0,
        height = tags.get(257)?.[0] ?? 0,
        strips = tags.get(tiled ? 324 : 273),
        counts = tags.get(tiled ? 325 : 279)
      if (!strips?.length || !counts || strips.length !== counts.length) invalid()
      strips.forEach((at, index) => {
        if (!counts[index]) invalid()
        need(at, counts[index]!)
      })
      const bits = tags.get(258) ?? [1],
        channels = tags.get(277)?.[0] ?? 1
      const compression = tags.get(259)?.[0] ?? 1
      const photometric = tags.get(262)?.[0] ?? ((bits[0] ?? 1) === 1 ? 0 : 2)
      const depth = bits[0] ?? 1
      // Other UTIF codecs can allocate from the compressed stream or grow
      // malformed-input dictionaries/rows independently of the IFD budget.
      const supportedCodec = [1, 32773].includes(compression)
      const supportedColor =
        ((photometric === 0 && [1, 4, 8, 16].includes(depth) && channels === 1) ||
          (photometric === 1 && [1, 2, 8, 16, 32].includes(depth) && channels === 1) ||
          (photometric === 2 && [8, 16, 32].includes(depth) && [3, 4].includes(channels)) ||
          (photometric === 3 &&
            [1, 2, 4, 8].includes(depth) &&
            channels === 1 &&
            tags.get(320)?.length === 3 * 2 ** depth) ||
          (photometric === 5 && depth === 8 && channels === 4)) &&
        (depth !== 32 || tags.get(339)?.every((format) => format === 3)) &&
        (bits.length === 1 || bits.length === channels) &&
        bits.every((bit) => bit === depth) &&
        (tags.get(284)?.[0] ?? 1) === 1 &&
        (tags.get(266)?.[0] ?? 1) === 1 &&
        [1, 2].includes(tags.get(317)?.[0] ?? 1) &&
        !(depth === 32 && tags.get(317)?.[0] === 2)
      const pixelBits = (bits[0] ?? 0) * channels
      const tileWidth = tags.get(322)?.[0],
        tileHeight = tags.get(323)?.[0]
      const pixelSafe =
        supportedCodec &&
        supportedColor &&
        bits.every((bit) => [1, 2, 4, 8, 16, 32].includes(bit)) &&
        channels > 0 &&
        channels <= 4 &&
        Math.ceil((width * pixelBits) / 8) * height <= PPTX_PICTURE_MAX_PIXELS * 4 &&
        (!tileWidth ||
          (!!tileHeight &&
            safeDimensions(tileWidth, tileHeight) &&
            Math.ceil((tileWidth * tileHeight * pixelBits) / 8) <= PPTX_PICTURE_MAX_PIXELS * 4)) &&
        !tags.has(50885)
      if (safeDimensions(width, height) && pixelSafe) {
        const rows = tiled ? tileHeight! : Math.min(tags.get(278)?.[0] ?? height, height)
        const blockWidth = tiled ? tileWidth : width
        if (!rows || !blockWidth) invalid()
        const blocks = tiled
          ? Math.ceil(width / blockWidth) * Math.ceil(height / rows)
          : Math.ceil(height / rows)
        if (strips.length !== blocks) invalid()
        let totalEncoded = 0
        strips.forEach((start, index) => {
          const length = counts[index]!
          totalEncoded += length
          if (totalEncoded > bytes.length) invalid()
          const blockRows = tiled ? rows : Math.min(rows, height - index * rows)
          const expected = Math.ceil((blockWidth * pixelBits) / 8) * blockRows
          if (compression === 1) {
            if (length !== expected) invalid()
          } else {
            let cursor = start,
              decoded = 0
            const end = start + length
            while (cursor < end) {
              const control = bytes[cursor++]!
              const literal = control < 128
              const run = literal ? control + 1 : control === 128 ? 0 : 257 - control
              const encoded = literal ? run : run ? 1 : 0
              if (cursor + encoded > end || decoded + run > expected) invalid()
              cursor += encoded
              decoded += run
            }
            if (decoded !== expected) invalid()
          }
        })
        if (!selected || width * height > selected.width * selected.height)
          selected = result('tiff', width, height, { tiffPage: page, tiffIfdOffset: offset })
      }
      offset = u32(offset + 2 + count * 12, little)
      page++
    }
    if (!selected)
      throw new Error(
        'TIFF 没有尺寸在 16384 像素及 6400 万像素以内、且使用支持编码的页面；请导出为未压缩或 PackBits 编码的常规 TIFF',
      )
    return { ...selected, pages: page }
  }
  throw new Error(`请选择 ${PPTX_PICTURE_FORMATS} 图片`)
}

export function validatePptxImageMime(info: PptxImageInfo, mime = ''): void {
  const declared = mime.toLowerCase().trim()
  const aliases =
    info.ext === 'tiff'
      ? ['image/tif', 'image/x-tiff']
      : info.ext === 'bmp'
        ? ['image/x-ms-bmp']
        : []
  if (
    declared &&
    declared !== 'application/octet-stream' &&
    declared !== info.mime &&
    !aliases.includes(declared)
  )
    throw new Error('图片 MIME 与真实内容不一致，请重新选择图片')
}
