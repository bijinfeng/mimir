import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readPptxImageInfo, validatePptxImageMime } from '@mimir/shared'
const source = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../tests/fixtures/pptx-images/${name}`, import.meta.url)))
export const formats = ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff'] as const
it.each(formats)(
  'reads real %s content, dimensions and MIME; rejects a truncated container and false MIME',
  (ext) => {
    const bytes = source(`picture.${ext}`)
    const info = readPptxImageInfo(bytes)
    expect(info).toMatchObject({
      ext,
      width: 12,
      height: 8,
      mime: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
    })
    expect(() => readPptxImageInfo(bytes.slice(0, ext === 'tiff' ? -16 : -1))).toThrow(
      /内容|格式|TIFF|尺寸|非空/,
    )
    expect(() => validatePptxImageMime(info, 'application/pdf')).toThrow('MIME')
    expect(() => validatePptxImageMime(info, '')).not.toThrow(/内容|格式|TIFF|尺寸|非空/)
    expect(() => validatePptxImageMime(info, 'application/octet-stream')).not.toThrow(
      /内容|格式|TIFF|尺寸|非空/,
    )
  },
)
it('detects animated GIF/WebP and selects the largest bounded TIFF page', () => {
  expect(readPptxImageInfo(source('picture.gif')).animated).toBe(true)
  expect(readPptxImageInfo(source('animated.webp')).animated).toBe(true)
  expect(readPptxImageInfo(source('picture.tiff'))).toMatchObject({
    tiffPage: 1,
    pages: 2,
    width: 12,
    height: 8,
  })
})
it.each(formats)('rejects unsafe %s dimensions before any raster allocation', (ext) => {
  const bytes = source(`picture.${ext}`),
    view = new DataView(bytes.buffer)
  if (ext === 'png') view.setUint32(16, 65535)
  else if (ext === 'jpg') {
    const marker = bytes.findIndex(
      (b, index) => b === 0xff && [0xc0, 0xc1, 0xc2].includes(bytes[index + 1]!),
    )
    view.setUint16(marker + 7, 65535)
  } else if (ext === 'gif') view.setUint16(6, 65535, true)
  else if (ext === 'bmp') view.setInt32(18, 65535, true)
  else if (ext === 'webp') {
    const vp8 = bytes.findIndex(
      (b, index) => b === 0x9d && bytes[index + 1] === 1 && bytes[index + 2] === 0x2a,
    )
    view.setUint16(vp8 + 3, 16383, true)
    view.setUint16(vp8 + 5, 16383, true)
  } else {
    let at = view.getUint32(4, true)
    while (at) {
      const count = view.getUint16(at, true)
      for (let i = 0; i < count; i++) {
        const tag = at + 2 + i * 12
        if (view.getUint16(tag, true) === 256) view.setUint32(tag + 8, 65535, true)
      }
      at = view.getUint32(at + 2 + count * 12, true)
    }
  }
  expect(() => readPptxImageInfo(bytes)).toThrow(/尺寸|像素/)
})
it('rejects cyclic TIFF IFDs, out-of-bounds strips, oversized files and empty images', () => {
  const original = source('picture.tiff')
  const cycle = original.slice(),
    view = new DataView(cycle.buffer),
    first = view.getUint32(4, true)
  const count = view.getUint16(first, true)
  view.setUint32(first + 2 + count * 12, first, true)
  expect(() => readPptxImageInfo(cycle)).toThrow(/内容|格式|TIFF|尺寸|非空/)
  const strip = original.slice(),
    stripView = new DataView(strip.buffer)
  for (let i = 0; i < count; i++) {
    const tag = first + 2 + i * 12
    if (stripView.getUint16(tag, true) === 273) stripView.setUint32(tag + 8, 0x7fffffff, true)
  }
  expect(() => readPptxImageInfo(strip)).toThrow(/内容|格式|TIFF|尺寸|非空/)
  expect(() => readPptxImageInfo(new Uint8Array(8 * 1024 * 1024 + 1))).toThrow('8 MiB')
  expect(() => readPptxImageInfo(new Uint8Array())).toThrow(/内容|格式|TIFF|尺寸|非空/)
})

it('rejects unknown TIFF compression instead of allowing UTIF to output a false black preview', () => {
  const bytes = source('picture.tiff'),
    view = new DataView(bytes.buffer)
  let at = view.getUint32(4, true)
  while (at) {
    const count = view.getUint16(at, true)
    for (let i = 0; i < count; i++) {
      const entry = at + 2 + i * 12
      if (view.getUint16(entry, true) === 259) view.setUint16(entry + 8, 65000, true)
    }
    at = view.getUint32(at + 2 + count * 12, true)
  }
  expect(() => readPptxImageInfo(bytes)).toThrow('使用支持编码')
})
