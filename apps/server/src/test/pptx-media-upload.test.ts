import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { pptxManualUploadSchema } from '@mimir/shared'
import {
  openPptx,
  savePptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import type { PictureElement } from '../../../../packages/office/vendor/packages/pptx-engine/src/types.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import { PptxHistory } from '../../../../packages/office/src/pptx-history.js'
import {
  pictureCropCommit,
  pptxPictureCropGeometry,
} from '../../../../packages/office/src/editors/pptx-picture-crop.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'pptx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    fileExtension: 'pptx',
  }),
}))
import { applyPptxManualUploadOnHost, applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
const load = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../../../../packages/office/tests/fixtures/${name}`, import.meta.url)),
  )
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('uint8array')]),
    ),
  )
}
const mediaCases = [
  ['landscape.mp4', 'video/mp4', 'video', 320, 180, 'video/mp4'],
  ['fragmented.mp4', 'video/mp4', 'video', 320, 180, 'video/mp4'],
  ['landscape.mov', 'video/quicktime', 'video', 320, 180, 'video/quicktime'],
  ['portrait.m4v', 'video/x-m4v', 'video', 180, 320, 'video/mp4'],
  ['landscape.avi', 'video/x-msvideo', 'video', 320, 180, 'video/x-msvideo'],
  ['landscape.webm', 'video/webm', 'video', 320, 180, 'video/webm'],
  ['tone.m4a', 'audio/x-m4a', 'audio', 64, 64, 'audio/mp4'],
  ['tone.aac', 'audio/aac', 'audio', 64, 64, 'audio/aac'],
  ['tone.mp3', 'audio/mpeg', 'audio', 64, 64, 'audio/mpeg'],
  ['tone.wav', 'audio/wav', 'audio', 64, 64, 'audio/wav'],
  ['tone.ogg', 'audio/ogg', 'audio', 64, 64, 'audio/ogg'],
  ['alac.mov', 'video/quicktime', 'video', 320, 180, 'video/quicktime'],
] as const
it.each(mediaCases)(
  'embeds real %s with original MIME/dual relationships, true dimensions and media hash across two saves',
  async (name, mime, kind, width, height, contentType) => {
    const bytes = load('title-layout.pptx'),
      assetBytes = load(`pptx-media/${name}`)
    const response = await applyPptxManualUploadOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 7,
      input: { kind: 'media', mediaKind: kind, slide: 0 },
      assetBytes,
      assetName: name,
      assetMime: mime,
    })
    expect(response.version).toBe(8)
    const session = await openPptxForEdit(response.bytes),
      picture = session
        .slides()[0]!
        .elements.find((e): e is PictureElement => e.type === 'picture' && e.media?.kind === kind)!
    const frame = picture.transform.offset,
      target = picture.media!.target!
    expect(frame.cx).toBe(width * 12700)
    expect(frame.cy).toBe(height * 12700)
    expect(frame.x).toBe(Math.round((session.size.cx - frame.cx) / 2))
    expect(frame.y).toBe(Math.round((session.size.cy - frame.cy) / 2))
    expect(target.endsWith(`.${name.split('.').at(-1)}`)).toBe(true)
    expect(hash(session.mediaPart(target)!)).toBe(hash(assetBytes))
    expect(response.data).toMatchObject({
      fallback: false,
      naturalSize: kind === 'video' ? { width, height } : null,
    })
    const warningMatcher = expect.stringContaining('仍')
    expect((response.data as { previewWarning?: string }).previewWarning).toEqual(
      name === 'landscape.avi' || name === 'alac.mov' ? warningMatcher : undefined,
    )
    const second = await (await openPptxForEdit(await session.save())).save(),
      saved = await entries(second),
      original = await entries(bytes)
    expect(hash(saved[target]!)).toBe(hash(assetBytes))
    const xml = new TextDecoder().decode(saved['ppt/slides/slide1.xml']),
      rels = new TextDecoder().decode(saved['ppt/slides/_rels/slide1.xml.rels'])
    expect(xml).toContain(kind === 'video' ? '<a:videoFile' : '<a:audioFile')
    expect(xml).toContain('p14:media')
    expect(rels).toContain(`/${kind}"`)
    expect(rels).toContain('/media"')
    expect(new TextDecoder().decode(saved['[Content_Types].xml'])).toContain(contentType)
    for (const [path, value] of Object.entries(original)) {
      if (
        [
          'ppt/slides/slide1.xml',
          'ppt/slides/_rels/slide1.xml.rels',
          '[Content_Types].xml',
        ].includes(path)
      )
        continue
      expect(saved[path]).toEqual(value)
    }
  },
)
it('validates private placement and refuses invalid/aborted files without changing input', async () => {
  const bytes = load('title-layout.pptx'),
    before = hash(bytes),
    assetBytes = load('pptx-media/portrait.m4v')
  for (const center of [
    { x: NaN, y: 0 },
    { x: 1.01, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 0, z: 1 },
  ])
    expect(
      pptxManualUploadSchema.safeParse({ kind: 'media', slide: 0, mediaKind: 'video', center })
        .success,
    ).toBe(false)
  const request = {
    documentId: 'pptx-1',
    bytes,
    expectedVersion: 0,
    input: { kind: 'media', slide: 0, mediaKind: 'video', center: { x: 0.2, y: 0.3 } },
    assetBytes,
    assetName: 'portrait.m4v',
    assetMime: 'video/mp4',
  } as const
  const inserted = await applyPptxManualUploadOnHost(request),
    opened = await openPptxForEdit(inserted.bytes),
    p = opened.slides()[0]!.elements.find((e) => e.type === 'picture')!
  expect(p.transform.offset.x).toBe(Math.round(opened.size.cx * 0.2 - p.transform.offset.cx / 2))
  expect(p.transform.offset.y).toBe(Math.round(opened.size.cy * 0.3 - p.transform.offset.cy / 2))
  const controller = new AbortController()
  controller.abort()
  await expect(
    applyPptxManualUploadOnHost({ ...request, signal: controller.signal }),
  ).rejects.toThrow('取消')
  await expect(
    applyPptxManualUploadOnHost({ ...request, assetBytes: load('pptx-media/tone.m4a') }),
  ).rejects.toThrow('轨道')
  expect(hash(bytes)).toBe(before)
})
it.each(['video', 'audio'] as const)(
  'crops native %s poster atomically, preserving AV, timing, relationships, rotation, siblings and all ZIP entries through history',
  async (kind) => {
    const source = load('title-layout.pptx'),
      images = await JSZip.loadAsync(load('image-deck.pptx')),
      posterBytes = await images.file('ppt/media/image1.png')!.async('uint8array'),
      inserted = await applyPptxManualUploadOnHost({
        documentId: 'pptx-1',
        bytes: source,
        expectedVersion: 0,
        input: { kind: 'media', slide: 0, mediaKind: kind },
        assetBytes: load(`pptx-media/${kind === 'video' ? 'landscape.mov' : 'tone.m4a'}`),
        assetName: kind === 'video' ? 'landscape.mov' : 'tone.m4a',
        assetMime: kind === 'video' ? 'video/quicktime' : 'audio/mp4',
        posterBytes,
      }),
      native = await openPptx(inserted.bytes),
      element = native.deck.slides[0]!.elements.find(
        (e): e is PictureElement => e.type === 'picture' && !!e.media,
      )!
    element.transform.rot = 37 * 60000
    element.transform.flipH = true
    element.dirtyTransform = true
    const zip = await JSZip.loadAsync(await savePptx(native)),
      slidePath = 'ppt/slides/slide1.xml',
      timing =
        '<p:timing><p:tnLst><p:par><p:cTn id="900" dur="indefinite"/></p:par></p:tnLst></p:timing>'
    zip.file(
      slidePath,
      (await zip.file(slidePath)!.async('string')).replace('</p:sld>', `${timing}</p:sld>`),
    )
    zip.file('customXml/media-sentinel.xml', '<sentinel unchanged="true"/>')
    const baseline = await zip.generateAsync({ type: 'uint8array' }),
      session = await openPptxForEdit(baseline),
      history = new PptxHistory(session),
      pic = session
        .slides()[0]!
        .elements.find((e): e is PictureElement => e.type === 'picture' && !!e.media)!,
      viewport = {
        width: 960,
        height: 540,
        slideWidth: session.size.cx,
        slideHeight: session.size.cy,
      },
      geometry = pptxPictureCropGeometry(pic, viewport)!,
      value = pictureCropCommit(geometry, {
        x: geometry.frame.w * 0.1,
        y: geometry.frame.h * 0.2,
        w: geometry.frame.w * 0.6,
        h: geometry.frame.h * 0.5,
      }),
      result = await applyPptxOpsOnHost({
        documentId: 'pptx-1',
        bytes: baseline,
        expectedVersion: 0,
        ops: [
          { op: 'setPictureSrcRect', target: { slide: 0, el: elementDurableId(pic)! }, ...value },
        ],
      })
    expect(result.version).toBe(1)
    expect(result.records).toHaveLength(1)
    await session.replaceFromHost(result.bytes, 0)
    history.record()
    const first = await session.save()
    session.commit()
    history.synchronize()
    const saved = await entries(first),
      original = await entries(baseline)
    expect(Object.keys(saved).toSorted()).toEqual(Object.keys(original).toSorted())
    for (const [path, entry] of Object.entries(original).filter(([name]) => name !== slidePath))
      expect(saved[path]).toEqual(entry)
    expect(new TextDecoder().decode(saved[slidePath])).toContain(timing)
    const reopened = await openPptxForEdit(first),
      cropped = reopened
        .slides()[0]!
        .elements.find((e): e is PictureElement => e.type === 'picture' && !!e.media)!
    expect(cropped.media).toEqual(pic.media)
    expect(cropped.transform).toEqual({ ...pic.transform, offset: value.box })
    expect(cropped.srcRect).toEqual(value.srcRect)
    expect(await entries(await reopened.save())).toEqual(saved)
    expect(history.undo()).toBe(true)
    expect(await entries(await session.save())).toEqual(original)
    expect(history.canUndo).toBe(false)
    session.commit()
    history.synchronize()
    expect(history.redo()).toBe(true)
    expect(await entries(await session.save())).toEqual(saved)
    const croppedGeometry = pptxPictureCropGeometry(cropped, viewport)!
    expect(pictureCropCommit(croppedGeometry, croppedGeometry.full).srcRect).toBeNull()
    await expect(
      applyPptxManualUploadOnHost({
        documentId: 'pptx-1',
        bytes: first,
        expectedVersion: 1,
        input: {
          kind: 'picture',
          slide: 0,
          elementId: elementDurableId(cropped)!,
          widthPt: 72,
          keepCrop: false,
        },
        assetBytes: posterBytes,
        assetName: 'replacement.png',
        assetMime: 'image/png',
      }),
    ).rejects.toThrow('普通图片')
  },
)
