import { pptxManualUploadSchema } from '@mimir/shared'
import {
  addMedia,
  openPptx,
  savePptx,
  copySlide,
  pasteSlide,
  addModel3d,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  matchesElementRef,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { validatePptxGlb } from '../../../../packages/office/src/pptx-glb.js'
import type { PptxHostResult, PptxManualUploadRequest } from './pptx-agent-host.js'

const cancel = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('素材操作已取消，文档未修改')
}
function mediaExt(bytes: Uint8Array, name: string, mime: string, kind: 'audio' | 'video'): string {
  const ext = name.split('.').at(-1)?.toLowerCase()
  const ascii = (at: number, text: string) =>
    text.split('').every((char, i) => bytes[at + i] === char.charCodeAt(0))
  const formats: Record<string, { kind: 'audio' | 'video'; mime: string[]; valid: boolean }> = {
    mp4: { kind: 'video', mime: ['video/mp4'], valid: bytes.length >= 12 && ascii(4, 'ftyp') },
    webm: {
      kind: 'video',
      mime: ['video/webm'],
      valid: bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3,
    },
    mp3: {
      kind: 'audio',
      mime: ['audio/mpeg', 'audio/mp3'],
      valid: ascii(0, 'ID3') || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0),
    },
    wav: {
      kind: 'audio',
      mime: ['audio/wav', 'audio/x-wav', 'audio/wave'],
      valid: ascii(0, 'RIFF') && ascii(8, 'WAVE'),
    },
    ogg: { kind: 'audio', mime: ['audio/ogg', 'application/ogg'], valid: ascii(0, 'OggS') },
  }
  const format = ext ? formats[ext] : undefined
  if (
    !format ||
    !format.valid ||
    format.kind !== kind ||
    (mime && mime !== 'application/octet-stream' && !format.mime.includes(mime.toLowerCase()))
  )
    throw new Error(
      kind === 'video'
        ? '请选择格式、MIME和内容一致的MP4或WebM视频'
        : '请选择格式、MIME和内容一致的MP3、WAV或Ogg音频',
    )
  return ext!
}
type ImageInfo = (bytes: Uint8Array) => { ext: 'png' | 'jpg'; width: number; height: number }
export async function applyPptxUpload(
  request: PptxManualUploadRequest,
  imageInfo: ImageInfo,
): Promise<PptxHostResult> {
  const input = pptxManualUploadSchema.parse(request.input)
  cancel(request.signal)
  const opened = await openPptx(request.bytes)
  let data: Record<string, unknown> = {}
  if (input.kind === 'import_slides') {
    if (input.afterIndex >= opened.deck.slides.length) throw new Error('导入位置已失效')
    if (new Set(input.slideIndices).size !== input.slideIndices.length)
      throw new Error('导入页不能重复')
    await (await BoundedZip.open(request.assetBytes)).preflightAll()
    cancel(request.signal)
    const source = await openPptx(request.assetBytes)
    if (source.deck.size.cx !== opened.deck.size.cx || source.deck.size.cy !== opened.deck.size.cy)
      throw new Error('两份演示文稿页面尺寸不同，请先统一尺寸后再导入')
    const bundles = input.slideIndices.map((index) => {
      const bundle = copySlide(source, index)
      if (!bundle) throw new Error(`源文件没有第${index + 1}页`)
      return bundle
    })
    let after = input.afterIndex
    for (const bundle of bundles) {
      cancel(request.signal)
      const slide = pasteSlide(opened, after, bundle, {
        keepSourceFormatting: input.keepSourceFormatting,
      })
      if (!slide) throw new Error('源幻灯片资源不完整，导入未应用')
      after = opened.deck.slides.indexOf(slide)
    }
    data = { slideIndex: input.afterIndex + 1, count: bundles.length }
  } else {
    const slide = opened.deck.slides[input.slide]
    if (!slide) throw new Error('目标幻灯片已失效')
    if (input.kind === 'model3d') {
      if (
        !request.assetName.toLowerCase().endsWith('.glb') ||
        (request.assetMime &&
          !['model/gltf-binary', 'application/octet-stream'].includes(
            request.assetMime.toLowerCase(),
          ))
      )
        throw new Error('请选择自包含的 GLB 模型文件')
      validatePptxGlb(request.assetBytes)
      if (!request.posterBytes || imageInfo(request.posterBytes).ext !== 'png')
        throw new Error('3D 模型需要真实预览生成的 PNG 封面')
      const width = Math.round(opened.deck.size.cx * 0.5),
        height = Math.round(opened.deck.size.cy * 0.6)
      const added = addModel3d(opened, input.slide, {
        ext: 'glb',
        bytes: request.assetBytes,
        poster: { bytes: request.posterBytes, ext: 'png' },
        offset: {
          x: Math.round((opened.deck.size.cx - width) / 2),
          y: Math.round((opened.deck.size.cy - height) / 2),
          cx: width,
          cy: height,
        },
        name: '3D 模型',
      })
      if (!added) throw new Error('无法嵌入此 3D 模型')
      const element = added.slide.elements.find((item) => item.id === added.elementId)
      data = {
        slideIndex: input.slide,
        elementId: element ? elementDurableId(element) : added.elementId,
      }
    } else if (input.kind === 'media') {
      const ext = mediaExt(
        request.assetBytes,
        request.assetName,
        request.assetMime,
        input.mediaKind,
      )
      const poster = request.posterBytes
        ? { bytes: request.posterBytes, ext: imageInfo(request.posterBytes).ext }
        : undefined
      if (poster && poster.ext !== 'png') throw new Error('视频封面须为真实PNG图片')
      const audio = input.mediaKind === 'audio'
      const width = Math.round(opened.deck.size.cx * (audio ? 0.25 : 0.65)),
        height = Math.round(opened.deck.size.cy * (audio ? 0.2 : 0.6))
      const added = addMedia(opened, input.slide, {
        kind: input.mediaKind,
        ext,
        bytes: request.assetBytes,
        name: [...request.assetName]
          .filter((char) => char.codePointAt(0)! >= 32)
          .join('')
          .slice(0, 180),
        offset: {
          x: Math.round((opened.deck.size.cx - width) / 2),
          y: Math.round((opened.deck.size.cy - height) / 2),
          cx: width,
          cy: height,
        },
        ...(poster ? { poster } : {}),
      })
      if (!added) throw new Error('媒体无法嵌入，文档未修改')
      const element = added.slide.elements.find((item) => item.id === added.elementId)
      data = {
        elementId: element ? (elementDurableId(element) ?? element.id) : added.elementId,
        slideIndex: input.slide,
        mediaKind: input.mediaKind,
      }
    } else {
      const info = imageInfo(request.assetBytes)
      const expectedMime = info.ext === 'png' ? 'image/png' : 'image/jpeg'
      if (
        request.assetMime &&
        request.assetMime !== 'application/octet-stream' &&
        request.assetMime.toLowerCase() !== expectedMime
      )
        throw new Error('图片MIME与真实内容不一致，请重新选择PNG或JPEG图片')
      if (input.kind === 'picture') {
        if (input.elementId) {
          const element = slide.elements.find((item) => matchesElementRef(item, input.elementId!))
          if (!element || element.type !== 'picture' || element.media)
            throw new Error('请先选择普通图片')
          if (input.keepCrop) {
            const original = opened.archive.readBytes(element.mediaRef ?? '')
            const previous = original ? imageInfo(original) : null
            if (!previous || previous.width !== info.width || previous.height !== info.height)
              throw new Error('保留裁切需要与原图尺寸相同的图片')
          }
        }
        const width = Math.min(input.widthPt * 12700, opened.deck.size.cx * 0.8)
        const height = (width * info.height) / info.width
        const op: Op = input.elementId
          ? {
              op: 'replacePicture',
              target: { slide: input.slide, el: input.elementId },
              bytes: request.assetBytes,
              ext: info.ext,
              keepSrcRect: input.keepCrop,
            }
          : {
              op: 'addPicture',
              target: { slide: input.slide },
              bytes: request.assetBytes,
              ext: info.ext,
              offset: {
                x: Math.round((opened.deck.size.cx - width) / 2),
                y: Math.round((opened.deck.size.cy - height) / 2),
                cx: Math.round(width),
                cy: Math.round(height),
              },
            }
        const result = runTxn(opened, { ops: [op], isolation: 'atomic' })
        if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '图片操作失败')
        data = { slideIndex: input.slide }
      } else {
        if (input.kind === 'image_fill') {
          const element = slide.elements.find((item) => matchesElementRef(item, input.elementId))
          if (!element || (element.type !== 'shape' && element.type !== 'text'))
            throw new Error('请先选择可填充的形状或文本框')
        }
        const op: Op =
          input.kind === 'image_fill'
            ? {
                op: 'setImageFill',
                target: { slide: input.slide, el: input.elementId },
                source: { bytes: request.assetBytes, ext: info.ext },
                tile: input.tile,
              }
            : {
                op: 'setBackground',
                target: { slide: input.slide },
                kind: 'image',
                source: { bytes: request.assetBytes, ext: info.ext },
                tile: input.tile,
              }
        const result = runTxn(opened, { ops: [op], isolation: 'atomic' })
        if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '图片填充未应用')
        data = { slideIndex: input.slide }
      }
    }
  }
  cancel(request.signal)
  const bytes = await savePptx(opened)
  await (await BoundedZip.open(bytes)).preflightAll()
  cancel(request.signal)
  return {
    bytes,
    records: [],
    version: request.expectedVersion + 1,
    changed: true,
    sampleData: false,
    data,
  }
}
