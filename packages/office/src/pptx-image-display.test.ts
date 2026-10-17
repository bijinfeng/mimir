import { readFileSync } from 'node:fs'
import UTIF from 'utif2'
import { afterEach, expect, it, vi } from 'vitest'
import {
  decodePptxTiffPixels,
  neutralizePptxJpegOrientation,
  pptxTiffDisplayUrl,
  preparePptxDisplayMedia,
  preparePptxPictureFile,
} from './pptx-image-display.js'
import { readPptxImageInfo } from '@mimir/shared'
import { PptxArchive } from './pptx-archive.js'
import { openPptxForEdit } from './pptx.js'
import JSZip from 'jszip'
const source = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url)))
const tiff = () => source('pptx-images/picture.tiff')
const nativeEntries = async (bytes: Uint8Array) => {
  const archive = await PptxArchive.open(bytes)
  return Object.fromEntries([...archive.entries].filter(([name]) => !name.endsWith('/')))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function canvas() {
  const put = vi.fn<(image: unknown, x: number, y: number) => void>()
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  )
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ putImageData: put }),
      toDataURL: () => 'data:image/png;base64,cHJldmlldw==',
    }),
  })
  return put
}
it('decodes only the largest safe real TIFF page and its actual pixels', () => {
  const decode = vi.spyOn(UTIF, 'decodeImage')
  const pixels = decodePptxTiffPixels(tiff())
  expect(pixels).toMatchObject({ width: 12, height: 8 })
  expect(Array.from(pixels.pixels.slice(0, 4))).toEqual([188, 57, 57, 255])
  expect(Array.from(pixels.pixels.slice(6 * 4, 7 * 4))).toEqual([24, 133, 77, 255])
  expect(decode).toHaveBeenCalledTimes(1)
})
it('checks raw IFD budgets before calling UTIF and never allocates a rejected page', () => {
  const bytes = tiff(),
    view = new DataView(bytes.buffer)
  let offset = view.getUint32(4, true)
  while (offset) {
    const count = view.getUint16(offset, true)
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12
      if (view.getUint16(entry, true) === 256) view.setUint32(entry + 8, 65535, true)
    }
    offset = view.getUint32(offset + 2 + count * 12, true)
  }
  const decode = vi.spyOn(UTIF, 'decode')
  expect(() => decodePptxTiffPixels(bytes)).toThrow(/TIFF/)
  expect(decode).not.toHaveBeenCalled()
})
it('converts display only, retaining TIFF archive bytes and untouched other media', async () => {
  canvas()
  const archive = await PptxArchive.open(source('image-deck.pptx'))
  const originalPng = archive.readMediaDataUrls().get('ppt/media/image1.png')
  const original = tiff()
  archive.setEntry('ppt/media/original.tiff', original)
  const media = await preparePptxDisplayMedia(archive)
  expect(media.get('ppt/media/original.tiff')).toBe('data:image/png;base64,cHJldmlldw==')
  expect(media.get('ppt/media/image1.png')).toBe(originalPng)
  expect(archive.readBytes('ppt/media/original.tiff')).toEqual(original)
  expect(await pptxTiffDisplayUrl(original)).toMatch(/^data:image\/png/)
})
it('fails a local unsupported TIFF decode with a recoverable error and omits undecodable native display URLs', async () => {
  vi.stubGlobal('ImageData', undefined)
  await expect(
    preparePptxPictureFile(new File([tiff()], 'photo.tif', { type: 'image/tiff' })),
  ).rejects.toThrow('无法显示 TIFF')
  const archive = await PptxArchive.open(source('image-deck.pptx'))
  archive.setEntry('ppt/media/broken.tiff', new Uint8Array([73, 73, 42]))
  expect((await preparePptxDisplayMedia(archive)).has('ppt/media/broken.tiff')).toBe(false)
  expect(archive.readBytes('ppt/media/broken.tiff')).toEqual(new Uint8Array([73, 73, 42]))
})
it('ignores filename suffix, checks declared MIME and rejects a cancelled file preparation', async () => {
  const bytes = source('pptx-images/picture.gif')
  const prepared = await preparePptxPictureFile(
    new File([bytes], 'misleading.png', { type: 'image/gif' }),
  )
  expect(prepared.info).toMatchObject({ ext: 'gif', animated: true })
  expect(prepared.bytes).toEqual(bytes)
  await expect(
    preparePptxPictureFile(new File([bytes], 'false.png', { type: 'image/png' })),
  ).rejects.toThrow('MIME')
  const controller = new AbortController()
  const promise = preparePptxPictureFile(new File([bytes], 'photo.gif'), controller.signal)
  controller.abort()
  await expect(promise).rejects.toThrow('取消')
})
it('checks cancellation/revision after async display preparation and publishes nothing on a stale host result', async () => {
  const original = source('image-deck.pptx'),
    session = await openPptxForEdit(original)
  const zip = await JSZip.loadAsync(original)
  zip.file('ppt/media/extra.tiff', tiff())
  const hostBytes = await zip.generateAsync({ type: 'uint8array' })
  const controller = new AbortController()
  const pending = session.replaceFromHost(hostBytes, session.version(), controller.signal)
  controller.abort()
  await expect(pending).rejects.toThrow('取消')
  expect(session.version()).toBe(0)
  expect(await nativeEntries(await session.save())).toEqual(await nativeEntries(original))
  const stale = session.replaceFromHost(hostBytes, 0)
  session.restore(session.checkpoint())
  await expect(stale).rejects.toThrow('画布已变化')
  expect(await nativeEntries(await session.save())).toEqual(await nativeEntries(original))
  expect(readPptxImageInfo(tiff()).tiffPage).toBe(1)
})

it('neutralizes a real EXIF 6 JPEG display copy while preserving raw pixels and exact archive bytes', async () => {
  const jpeg = source('pptx-images/orientation-6.jpg'),
    original = jpeg.slice()
  const displayed = neutralizePptxJpegOrientation(jpeg)
  expect(displayed).not.toEqual(jpeg)
  expect(readPptxImageInfo(displayed)).toEqual(readPptxImageInfo(jpeg))
  const differences = [...jpeg.keys()].filter((index) => jpeg[index] !== displayed[index])
  expect(differences).toHaveLength(1)
  expect(jpeg[differences[0]!]).toBe(6)
  expect(displayed[differences[0]!]).toBe(1)
  const archive = await PptxArchive.open(source('image-deck.pptx'))
  archive.setEntry('ppt/media/oriented.jpg', jpeg)
  const media = await preparePptxDisplayMedia(archive)
  const encoded = media.get('ppt/media/oriented.jpg')!.split(',')[1]!
  expect(new Uint8Array(Buffer.from(encoded, 'base64'))).toEqual(displayed)
  expect(archive.readBytes('ppt/media/oriented.jpg')).toEqual(original)
  expect(neutralizePptxJpegOrientation(displayed)).toBe(displayed)
  expect(neutralizePptxJpegOrientation(source('pptx-images/picture.png'))).toEqual(
    source('pptx-images/picture.png'),
  )
})

it('neutralizes EXIF after valid JPEG marker fill bytes without changing the original', () => {
  const original = source('pptx-images/orientation-6.jpg')
  const filled = new Uint8Array(original.length + 1)
  filled.set(original.subarray(0, 2))
  filled[2] = 0xff
  filled.set(original.subarray(2), 3)
  const before = filled.slice()
  expect(readPptxImageInfo(filled)).toMatchObject({ ext: 'jpg', width: 12, height: 8 })
  const display = neutralizePptxJpegOrientation(filled)
  expect(display).not.toEqual(filled)
  expect(filled).toEqual(before)
  expect(readPptxImageInfo(display)).toEqual(readPptxImageInfo(filled))
})

it.each(['cancel', 'revision'])(
  'waits for TIFF display and rejects %s before publishing the host archive',
  async (reason) => {
    const original = source('image-deck.pptx'),
      session = await openPptxForEdit(original)
    const originalView = session.view()
    const zip = await JSZip.loadAsync(original)
    zip.file('ppt/media/selected.tiff', tiff())
    const hostBytes = await zip.generateAsync({ type: 'uint8array' })
    let release!: (blob: Blob) => void, entered!: () => void
    const ready = new Promise<void>((resolve) => {
      entered = resolve
    })
    vi.stubGlobal('document', undefined)
    vi.stubGlobal(
      'ImageData',
      class {
        width = 12
        height = 8
      },
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { putImageData: () => {} }
        }
        convertToBlob() {
          entered()
          return new Promise<Blob>((resolve) => {
            release = resolve
          })
        }
      },
    )
    const controller = new AbortController()
    const pending = session.replaceFromHost(hostBytes, 0, controller.signal)
    const outcome = pending.catch((error) => error as Error)
    await ready
    if (reason === 'cancel') controller.abort()
    else session.restore(session.checkpoint())
    const activeView = session.view()
    release(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    expect(await outcome).toBeInstanceOf(Error)
    expect(((await outcome) as Error).message).toMatch(/取消|画布已变化/)
    expect(session.view()).toBe(activeView)
    expect(session.view().media.has('ppt/media/selected.tiff')).toBe(false)
    expect(session.view()).toBe(reason === 'cancel' ? originalView : activeView)
  },
)
