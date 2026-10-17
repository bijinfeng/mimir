import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import UTIF from 'utif2'
import { afterEach, expect, it, vi } from 'vitest'
import { readPptxImageInfo } from '@mimir/shared'
import { decodePptxTiffPixels } from './pptx-image-display.js'

afterEach(() => vi.restoreAllMocks())
const tagUnit = (tag: number) => ([256, 257, 273, 278, 279].includes(tag) ? 4 : 2)

/** Small real TIFF containers; payloads never exceed 288 bytes of raster data. */
function tiff(payload: Uint8Array, tags: Record<string, number[] | undefined> = {}) {
  const fields = Object.entries({
    t256: [12],
    t257: [8],
    t258: [8, 8, 8],
    t259: [1],
    t262: [2],
    t273: [0],
    t277: [3],
    t278: [8],
    t279: [payload.length],
    ...tags,
  })
    .filter((entry): entry is [string, number[]] => !!entry[1])
    .toSorted(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
  let cursor = 8 + 2 + fields.length * 12 + 4
  const headerLength =
    cursor +
    fields.reduce((sum, [key, values]) => {
      const size = values.length * tagUnit(Number(key.slice(1)))
      return sum + (size > 4 ? size : 0)
    }, 0)
  const bytes = new Uint8Array(headerLength + payload.length)
  bytes.set([77, 77, 0, 42, 0, 0, 0, 8])
  bytes.set(payload, headerLength)
  const view = new DataView(bytes.buffer)
  view.setUint16(8, fields.length)
  fields.forEach(([key, source], index) => {
    const tag = Number(key.slice(1)),
      width = tagUnit(tag),
      entry = 10 + index * 12
    const values = tag === 273 ? [headerLength] : source
    view.setUint16(entry, tag)
    view.setUint16(entry + 2, width === 4 ? 4 : 3)
    view.setUint32(entry + 4, values.length)
    const data = values.length * width <= 4 ? entry + 8 : cursor
    if (data === cursor) {
      view.setUint32(entry + 8, cursor)
      cursor += values.length * width
    }
    values.forEach((value, at) =>
      width === 4
        ? view.setUint32(data + at * width, value)
        : view.setUint16(data + at * width, value),
    )
  })
  return bytes
}

it('decodes real raw and PackBits RGB to the same pixels', () => {
  const pixels = new Uint8Array(288).fill(57)
  const packed = new Uint8Array([129, 57, 129, 57, 225, 57])
  const raw = tiff(pixels)
  const packBits = tiff(packed, { t259: [32773] })
  expect(readPptxImageInfo(packBits)).toMatchObject({ ext: 'tiff', width: 12, height: 8 })
  expect(decodePptxTiffPixels(packBits)).toEqual(decodePptxTiffPixels(raw))
  expect(Array.from(decodePptxTiffPixels(packBits).pixels.slice(0, 4))).toEqual([57, 57, 57, 255])
})

it.each([2, 3, 4, 5, 6, 7, 8, 32946, 65000])(
  'rejects TIFF codec %s before entering the decoder or allocating raster buffers',
  (compression) => {
    const payload =
      compression === 8 || compression === 32946
        ? new Uint8Array(deflateSync(new Uint8Array(4096)))
        : new Uint8Array(288)
    const bytes = tiff(payload, { t259: [compression] })
    const decode = vi.spyOn(UTIF, 'decode')
    expect(() => decodePptxTiffPixels(bytes)).toThrow(/未压缩或 PackBits/)
    expect(decode).not.toHaveBeenCalled()
  },
)

it.each([
  { t262: [0], t258: [2], t277: [1] },
  { t262: [1], t258: [4], t277: [1] },
  { t262: [2], t258: [2, 2, 2] },
  { t262: [2], t258: [8, 16, 8] },
  { t262: [3], t258: [8], t277: [1] },
  { t262: [6] },
  { t284: [2] },
  { t258: [32, 32, 32], t339: [1, 1, 1] },
])('rejects unsupported TIFF sample/color combination %j instead of a black preview', (tags) => {
  const decode = vi.spyOn(UTIF, 'decode')
  expect(() => decodePptxTiffPixels(tiff(new Uint8Array(288), tags))).toThrow(/支持编码/)
  expect(decode).not.toHaveBeenCalled()
})

it.each([
  new Uint8Array([129, 57, 129, 57, 224, 57]), // 289 decoded bytes, declared raster 288.
  new Uint8Array([129, 57]), // Complete command, incomplete raster.
  new Uint8Array([5, 1, 2]), // Literal run crosses encoded strip boundary.
  new Uint8Array([129]), // Repeat run is missing its byte.
])('rejects malformed or over-budget PackBits before decode', (payload) => {
  const decode = vi.spyOn(UTIF, 'decode')
  expect(() => decodePptxTiffPixels(tiff(payload, { t259: [32773] }))).toThrow(/内容/)
  expect(decode).not.toHaveBeenCalled()
})

it('rejects short raw raster and inconsistent strip count before decode', () => {
  const decode = vi.spyOn(UTIF, 'decode')
  expect(() => decodePptxTiffPixels(tiff(new Uint8Array(287)))).toThrow(/内容/)
  expect(() => decodePptxTiffPixels(tiff(new Uint8Array(288), { t278: [4] }))).toThrow(/内容/)
  expect(decode).not.toHaveBeenCalled()
})

it('keeps private metadata opaque to UTIF while leaving source bytes intact', () => {
  const bytes = new Uint8Array(
    readFileSync(new URL('../tests/fixtures/pptx-images/picture.tiff', import.meta.url)),
  )
  const before = bytes.slice()
  const decode = vi.spyOn(UTIF, 'decode')
  decodePptxTiffPixels(bytes)
  const selected = decode.mock.results[0]!.value[0]
  expect(selected).not.toHaveProperty('t282')
  expect(bytes).toEqual(before)
})
