import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { beforeAll, expect, it, vi } from 'vitest'
import { readPptxImageInfo, type PptxManualUpload } from '@mimir/shared'
import {
  openPptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { resolvePptxGroupPicture } from '../../../../packages/office/src/pptx-picture-edit.js'
import { pptxGroupPictureFixture } from '../../../../packages/office/src/editors/pptx-group-picture-test-fixture.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import { PptxHistory } from '../../../../packages/office/src/pptx-history.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'pptx-1'
      ? {
          id,
          kind: 'file',
          fileExtension: 'pptx',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
      : null,
}))
import {
  applyPptxManualPictureOnHost,
  applyPptxManualUploadOnHost,
} from '../services/pptx-agent-host.js'
const source = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../../../../packages/office/tests/fixtures/${name}`, import.meta.url)),
  )
const formats = ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff'] as const
let native: Awaited<ReturnType<typeof pptxGroupPictureFixture>>
beforeAll(async () => {
  native = await pptxGroupPictureFixture()
})
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('uint8array')] as const),
    ),
  )
}
function upload(
  input: PptxManualUpload,
  image: Uint8Array,
  mime: string,
  bytes = native.bytes,
  signal?: AbortSignal,
) {
  return applyPptxManualUploadOnHost({
    documentId: 'pptx-1',
    bytes,
    expectedVersion: 0,
    input,
    assetBytes: image,
    assetName: 'misleading.png',
    assetMime: mime,
    signal,
  })
}
it.each(formats)(
  'inserts and replaces real %s through the original manual picture host without transcoding bytes',
  async (ext) => {
    const image = source(`pptx-images/picture.${ext}`),
      original = source('title-layout.pptx')
    const added = await applyPptxManualPictureOnHost({
      documentId: 'pptx-1',
      bytes: original,
      expectedVersion: 0,
      imageBytes: image,
      action: 'insert',
      slide: 0,
    })
    const opened = await openPptx(added.bytes),
      picture = opened.deck.slides[0]!.elements.find((e) => e.type === 'picture')!
    expect(picture.type).toBe('picture')
    if (picture.type !== 'picture') throw new Error('Missing native picture')
    expect(picture.mediaRef).toMatch(new RegExp(`\\.${ext}$`))
    expect(opened.archive.readBytes(picture.mediaRef!)).toEqual(image)
    expect(picture.transform.offset.cx / picture.transform.offset.cy).toBeCloseTo(1.5, 4)
    const replacement = await applyPptxManualPictureOnHost({
      documentId: 'pptx-1',
      bytes: added.bytes,
      expectedVersion: 1,
      imageBytes: image,
      action: 'replace',
      slide: 0,
      elementId: elementDurableId(picture)!,
    })
    const next = await openPptx(replacement.bytes)
    const current = next.deck.slides[0]!.elements.find((e) => e.type === 'picture')!
    expect(current.transform).toEqual(picture.transform)
    if (current.type !== 'picture') throw new Error('Missing native picture')
    expect(next.archive.readBytes(current.mediaRef!)).toEqual(image)
    const before = await entries(original),
      after = await entries(replacement.bytes)
    for (const [path, data] of Object.entries(before)) {
      if (
        path === 'ppt/slides/slide1.xml' ||
        path === 'ppt/slides/_rels/slide1.xml.rels' ||
        path === '[Content_Types].xml'
      )
        continue
      expect({ path, data: after[path] }).toEqual({ path, data })
    }
  },
)
it.each(formats)(
  'writes original %s bytes for image fill, slide background and direct group picture replacement',
  async (ext) => {
    const image = source(`pptx-images/picture.${ext}`),
      info = readPptxImageInfo(image)
    const opened = await openPptx(native.bytes),
      slide = opened.deck.slides[0]!
    const shape = slide.elements.find((e) => e.type === 'text' || e.type === 'shape')!
    const inputs: PptxManualUpload[] = [
      { kind: 'image_fill', slide: 0, elementId: elementDurableId(shape)!, tile: false },
      { kind: 'image_background', slide: 0, tile: true },
      { kind: 'picture', ...native.target, widthPt: 72, keepCrop: false },
      { kind: 'picture', slide: 0, widthPt: 72, naturalSize: true, keepCrop: false },
    ]
    const before = await entries(native.bytes)
    const groupResults: unknown[] = []
    for (const input of inputs) {
      const result = await upload(input, image, info.mime)
      expect(result.version).toBe(1)
      const after = await entries(result.bytes)
      const media = Object.entries(after).filter(
        ([path]) => path.startsWith('ppt/media/') && path.endsWith(`.${ext}`),
      )
      expect(media.some(([, bytes]) => Buffer.from(bytes).equals(Buffer.from(image)))).toBe(true)
      for (const [path, bytes] of Object.entries(before)) {
        if (
          path === 'ppt/slides/slide1.xml' ||
          path === 'ppt/slides/_rels/slide1.xml.rels' ||
          path === '[Content_Types].xml'
        )
          continue
        expect({ path, data: after[path] }).toEqual({ path, data: bytes })
      }
      if (input.kind === 'picture' && input.group) {
        const current = resolvePptxGroupPicture(
          (await openPptx(result.bytes)).deck.slides[0]!,
          native.target,
        ).picture
        const previous = resolvePptxGroupPicture(slide, native.target).picture
        groupResults.push({
          transform: current.transform,
          opacity: current.opacity,
          crop: current.srcRect,
          previousTransform: previous.transform,
          previousOpacity: previous.opacity,
        })
      }
    }
    const groupResult = groupResults[0] as {
      transform: unknown
      opacity: unknown
      crop: unknown
      previousTransform: unknown
      previousOpacity: unknown
    }
    expect(groupResults).toHaveLength(1)
    expect(groupResult.transform).toEqual(groupResult.previousTransform)
    expect(groupResult.opacity).toBe(groupResult.previousOpacity)
    expect(groupResult.crop).toBeUndefined()
  },
)
it.each(formats)(
  'atomically rejects truncated or false-MIME %s and cancellation without changing original native bytes',
  async (ext) => {
    const image = source(`pptx-images/picture.${ext}`),
      original = native.bytes.slice()
    const input: PptxManualUpload = {
      kind: 'picture',
      ...native.target,
      widthPt: 72,
      keepCrop: false,
    }
    await expect(upload(input, image.slice(0, ext === 'tiff' ? -16 : -1), '')).rejects.toThrow(
      /内容|格式|TIFF|尺寸/,
    )
    await expect(upload(input, image, 'application/pdf')).rejects.toThrow('MIME')
    const controller = new AbortController()
    controller.abort()
    await expect(
      upload(input, image, readPptxImageInfo(image).mime, native.bytes, controller.signal),
    ).rejects.toThrow('取消')
    expect(native.bytes).toEqual(original)
  },
)
it('keeps a same-size TIFF crop during static PNG cutout and records one exact native history step', async () => {
  const image = source('pptx-images/picture.tiff')
  const inserted = await upload(
    { kind: 'picture', ...native.target, widthPt: 72, keepCrop: false },
    image,
    'image/tiff',
  )
  // First assign native crop to ensure the keepCrop branch really checks TIFF dimensions.
  const zip = await JSZip.loadAsync(inserted.bytes)
  const path = 'ppt/slides/slide1.xml'
  const xml = await zip.file(path)!.async('string')
  const loaded = await openPptx(inserted.bytes),
    current = resolvePptxGroupPicture(loaded.deck.slides[0]!, native.target)
  const changed = current.xml.replace(
    '</p:blipFill>',
    '<a:srcRect l="10000" t="5000" r="15000" b="20000"/></p:blipFill>',
  )
  zip.file(path, xml.replace(current.xml, changed))
  const before = await zip.generateAsync({ type: 'uint8array' })
  const result = await upload(
    { kind: 'picture', ...native.target, widthPt: 72, keepCrop: true },
    source('pptx-images/picture.png'),
    'image/png',
    before,
  )
  const nativeAfter = await openPptx(result.bytes)
  expect(
    resolvePptxGroupPicture(nativeAfter.deck.slides[0]!, native.target).picture.srcRect,
  ).toEqual({ l: 0.1, r: 0.15, t: 0.05, b: 0.2 })
  const session = await openPptxForEdit(before),
    history = new PptxHistory(session)
  await session.replaceFromHost(result.bytes, 0)
  history.record()
  const after = await session.save()
  expect(history.undo()).toBe(true)
  expect(await entries(await session.save())).toEqual(await entries(before))
  expect(history.undo()).toBe(false)
  expect(history.redo()).toBe(true)
  expect(await entries(await session.save())).toEqual(await entries(after))
})
