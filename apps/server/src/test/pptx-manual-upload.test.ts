import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { type PptxManualUpload } from '@mimir/shared'
import {
  openPptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import { renderSlide } from '../../../../packages/office/src/pptx-render.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'pptx-1'
      ? {
          id,
          kind: 'file',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          fileExtension: 'pptx',
        }
      : null,
}))
import { applyPptxManualUploadOnHost, applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
const load = (name = 'title-layout.pptx') =>
  new Uint8Array(
    readFileSync(new URL(`../../../../packages/office/tests/fixtures/${name}`, import.meta.url)),
  )
function wave() {
  const bytes = Buffer.alloc(44 + 16000)
  bytes.write('RIFF')
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24)
  bytes.writeUInt32LE(16000, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(16000, 40)
  return new Uint8Array(bytes)
}
const upload = (
  bytes: Uint8Array,
  version: number,
  input: PptxManualUpload,
  assetBytes: Uint8Array,
  assetName: string,
  assetMime: string,
) =>
  applyPptxManualUploadOnHost({
    documentId: 'pptx-1',
    bytes,
    expectedVersion: version,
    input,
    assetBytes,
    assetName,
    assetMime,
  })
async function png() {
  return (await JSZip.loadAsync(load('image-deck.pptx')))
    .file('ppt/media/image1.png')!
    .async('uint8array')
}
describe('PPTX local asset upload', () => {
  it('embeds a real WebM recording as a native video and preserves the exact playable bytes across two saves', async () => {
    const original = load(),
      asset = load('screen-recording-flower.webm')
    const inserted = await upload(
      original,
      0,
      { kind: 'media', slide: 0, mediaKind: 'video' },
      asset,
      'screen-recording.webm',
      'video/webm',
    )
    const opened = await openPptxForEdit(inserted.bytes)
    const video = opened
      .slides()[0]!
      .elements.find((item) => item.type === 'picture' && item.media?.kind === 'video')!
    expect(video.type).toBe('picture')
    const target = video.type === 'picture' ? video.media!.target! : ''
    expect(opened.mediaPart(target)).toEqual(asset)
    expect(renderSlide(opened.view(), 0, { fitWidthPx: 640 })?.svg).toContain('aria-label="视频"')
    const first = await opened.save()
    opened.commit()
    const reopened = await openPptxForEdit(first)
    const second = await reopened.save()
    const zip = await JSZip.loadAsync(second),
      before = await JSZip.loadAsync(original)
    expect(await zip.file(target)!.async('uint8array')).toEqual(asset)
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('<a:videoFile')
    expect(xml).toContain('p14:media')
    const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string')
    expect(rels).toContain('/video"')
    expect(rels).toContain('/media"')
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('video/webm')
    expect(await zip.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
      await before.file('ppt/theme/theme1.xml')!.async('uint8array'),
    )
  })
  it('stores real self-contained GLB bytes with a PNG poster, preserving both across another save', async () => {
    const asset = load('local-tetrahedron.glb'),
      poster = await png()
    const inserted = await applyPptxManualUploadOnHost({
      documentId: 'pptx-1',
      bytes: load(),
      expectedVersion: 0,
      input: { kind: 'model3d', slide: 0 },
      assetBytes: asset,
      assetName: '模型.glb',
      assetMime: 'model/gltf-binary',
      posterBytes: poster,
    })
    const opened = await openPptxForEdit(inserted.bytes)
    const model = opened.slides()[0]!.elements.find((el) => el.descr?.startsWith('aislides-3d:'))!
    const target = model.descr!.slice('aislides-3d:'.length)
    expect(opened.mediaPart(target)).toEqual(asset)
    const twice = await openPptxForEdit(await opened.save())
    expect(twice.mediaPart(target)).toEqual(asset)
    expect(model.type).toBe('picture')
    expect(renderSlide(twice.view(), 0, { fitWidthPx: 640 })?.svg).toContain(
      'data:image/png;base64,',
    )
    await expect(
      upload(load(), 0, { kind: 'model3d', slide: 0 }, asset, 'missing.glb', 'model/gltf-binary'),
    ).rejects.toThrow('封面')
  })
  it('inserts an icon-sized native picture and replaces same-size PNG while preserving crop', async () => {
    const asset = await png()
    const inserted = await upload(
      load(),
      0,
      { kind: 'picture', slide: 0, widthPt: 72, keepCrop: false },
      asset,
      'icon.png',
      'image/png',
    )
    const opened = await openPptx(inserted.bytes)
    const picture = opened.deck.slides[0]!.elements.find((el) => el.type === 'picture')!
    expect(picture.transform.offset.cx).toBe(914400)
    const cropped = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes: inserted.bytes,
      expectedVersion: 1,
      ops: [
        {
          op: 'setPictureSrcRect',
          target: { slide: 0, el: elementDurableId(picture) },
          srcRect: { l: 0.1, t: 0, r: 0, b: 0 },
        },
      ],
    })
    const replacement = await upload(
      cropped.bytes,
      2,
      {
        kind: 'picture',
        slide: 0,
        elementId: elementDurableId(picture)!,
        widthPt: 72,
        keepCrop: true,
      },
      asset,
      'cutout.png',
      'image/png',
    )
    const saved = await openPptx(replacement.bytes)
    const after = saved.deck.slides[0]!.elements.find((el) => el.type === 'picture')!
    expect(after).toMatchObject({ srcRect: { l: 0.1 }, transform: picture.transform })
    expect(elementDurableId(after)).toBe(elementDurableId(picture))
  })
  it('embeds decodable WAV with native Office relations, visible canvas and actual playable bytes after two saves', async () => {
    const bytes = load(),
      asset = wave()
    const first = await upload(
      bytes,
      0,
      { kind: 'media', slide: 0, mediaKind: 'audio' },
      asset,
      '会议讲解.wav',
      'audio/wav',
    )
    const session = await openPptxForEdit(first.bytes)
    const audio = session
      .slides()[0]!
      .elements.find((item) => item.type === 'picture' && item.media?.kind === 'audio')!
    expect(audio.type).toBe('picture')
    const target = audio.type === 'picture' ? audio.media?.target : ''
    expect(session.mediaPart(target!)).toEqual(asset)
    expect(renderSlide(session.view(), 0, { fitWidthPx: 640 })?.svg).toContain('aria-label="音频"')
    const second = await upload(
      first.bytes,
      1,
      { kind: 'image_background', slide: 0, tile: false },
      await png(),
      '背景.png',
      'image/png',
    )
    const zip = await JSZip.loadAsync(second.bytes),
      original = await JSZip.loadAsync(bytes)
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('<a:audioFile')
    expect(xml).toContain('p14:media')
    expect(xml).toContain('<p:bg>')
    expect(await zip.file(target!)!.async('uint8array')).toEqual(asset)
    expect(await zip.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
      await original.file('ppt/theme/theme1.xml')!.async('uint8array'),
    )
  })
  it('fills an editable native shape and imports complete slides with an independent saved readback', async () => {
    const bytes = load()
    const shape = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 0,
      ops: [
        {
          op: 'addElement',
          target: { slide: 0 },
          kind: 'rect',
          offset: { x: 100000, y: 100000, cx: 1000000, cy: 1000000 },
        },
      ],
    })
    const opened = await openPptx(shape.bytes),
      elementId = elementDurableId(opened.deck.slides[0]!.elements.at(-1)!)!
    const filled = await upload(
      shape.bytes,
      1,
      { kind: 'image_fill', slide: 0, elementId, tile: true },
      await png(),
      '填充.png',
      'image/png',
    )
    expect(
      renderSlide((await openPptxForEdit(filled.bytes)).view(), 0, { fitWidthPx: 640 })?.svg,
    ).toContain('<pattern')
    const imported = await upload(
      filled.bytes,
      2,
      { kind: 'import_slides', afterIndex: 0, slideIndices: [0], keepSourceFormatting: true },
      bytes,
      '源.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    )
    const saved = await openPptxForEdit(imported.bytes)
    expect(saved.slides()).toHaveLength(opened.deck.slides.length + 1)
    expect(saved.slides()[0]!.elements).toHaveLength(opened.deck.slides[0]!.elements.length)
    expect(saved.slides()[1]!.elements.length).toBeGreaterThan(0)
    expect(imported.data).toMatchObject({ slideIndex: 1, count: 1 })
  })
  it('rejects mismatched image/media MIME, spoofed signatures, missing targets and repeated source pages', async () => {
    const bytes = load(),
      image = await png()
    await expect(
      upload(
        bytes,
        0,
        { kind: 'image_background', slide: 0, tile: false },
        image,
        'image.png',
        'image/jpeg',
      ),
    ).rejects.toThrow('MIME')
    await expect(
      upload(
        bytes,
        0,
        { kind: 'media', slide: 0, mediaKind: 'video' },
        wave(),
        'video.mp4',
        'video/mp4',
      ),
    ).rejects.toThrow('媒体文件无效')
    await expect(
      upload(
        bytes,
        0,
        { kind: 'media', slide: 0, mediaKind: 'audio' },
        wave(),
        'audio.wav',
        'video/mp4',
      ),
    ).rejects.toThrow('一致')
    await expect(
      upload(
        bytes,
        0,
        { kind: 'image_fill', slide: 0, elementId: 'missing', tile: false },
        image,
        'image.png',
        'image/png',
      ),
    ).rejects.toThrow('选择')
    await expect(
      upload(
        bytes,
        0,
        { kind: 'import_slides', afterIndex: 0, slideIndices: [0, 0], keepSourceFormatting: false },
        bytes,
        'source.pptx',
        '',
      ),
    ).rejects.toThrow('重复')
    expect(
      await JSZip.loadAsync(bytes).then((zip) =>
        zip.file('ppt/slides/slide1.xml')!.async('string'),
      ),
    ).not.toContain('<a:audioFile')
  })
})
