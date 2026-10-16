import {
  pptxManualParagraphSchema,
  PPTX_PARAGRAPH_IMAGE_MAX_BYTES,
} from '../../../../packages/shared/src/pptx-paragraph.js'
import {
  openPptx,
  savePptx,
  setElementParagraphFormat,
  addImageMediaAndRel,
  type ParagraphFormatPatch,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { matchesElementRef } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import { patchElementPPr } from '../../../../packages/office/vendor/packages/pptx-engine/src/generate.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'
import { decodePdfImage } from './pdf-image-codec.js'

/** Manual-only paragraph scope. No client XML or relationship identities cross this boundary. */
export async function applyPptxManualParagraph(
  request: PptxHostRequest,
  imageInfo: (bytes: Uint8Array) => { ext: string; width: number; height: number },
): Promise<PptxHostResult> {
  const active = () => {
    if (request.signal?.aborted) throw new Error('段落修改已取消，画布未修改')
  }
  const input = pptxManualParagraphSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  active()
  await (await BoundedZip.open(request.bytes)).preflightAll()
  const opened = await openPptx(request.bytes)
  const slide = opened.deck.slides[input.slide]
  const element = slide?.elements.find((item) => matchesElementRef(item, input.el))
  if (!slide || !element || (element.type !== 'text' && element.type !== 'shape') || !element.text)
    throw new Error('文本框已失效，请重新选择')
  if (input.paraIndices.some((index) => index >= element.text!.paragraphs.length))
    throw new Error('段落范围已失效，请重新选择文字')
  const before = element.anchor.originalXml
  let addedMedia = false
  const { bulletImage, ...format } = input.format
  let patch: ParagraphFormatPatch = format
  if (bulletImage) {
    const image = new Uint8Array(Buffer.from(bulletImage.base64, 'base64'))
    if (image.length > PPTX_PARAGRAPH_IMAGE_MAX_BYTES) throw new Error('图片符号不能超过512 KiB')
    let info: ReturnType<typeof imageInfo>
    try {
      info = imageInfo(image)
    } catch {
      throw new Error('图片符号内容无效，请重新选择PNG或JPEG')
    }
    if (
      (info.ext !== 'png' && info.ext !== 'jpg') ||
      !Number.isInteger(info.width) ||
      !Number.isInteger(info.height) ||
      info.width < 1 ||
      info.height < 1 ||
      info.width * info.height > 4_000_000 ||
      info.ext !== (bulletImage.ext === 'jpeg' ? 'jpg' : bulletImage.ext)
    )
      throw new Error('图片符号须为不超过400万像素的PNG或JPEG，扩展名须与内容一致')
    // Reuse the bounded CRC/PNG-chunk and strict JPEG decoder already used by local image tools.
    let decoded: ReturnType<typeof decodePdfImage>
    try {
      decoded = decodePdfImage(image)
    } catch {
      throw new Error('图片符号无法解码，请重新选择PNG或JPEG')
    }
    if (
      decoded.width !== info.width ||
      decoded.height !== info.height ||
      decoded.width * decoded.height > 4_000_000
    )
      throw new Error('图片符号尺寸无效，请重新选择')
    active()
    const existing = input.paraIndices
      .map((index) => element.text!.paragraphs[index]!.bullet)
      .find((bullet) => {
        const bytes = bullet?.mediaRef ? opened.archive.readBytes(bullet.mediaRef) : null
        return (
          bullet?.type === 'blip' &&
          bullet.blipEmbedId &&
          bytes &&
          Buffer.from(bytes).equals(Buffer.from(image))
        )
      })
    const landed =
      existing?.mediaRef && existing.blipEmbedId
        ? { mediaPath: existing.mediaRef, rid: existing.blipEmbedId }
        : addImageMediaAndRel(opened, slide, image, info.ext)
    addedMedia = !existing
    if (!landed) throw new Error('图片符号落包失败')
    patch = { ...format, bulletBlip: { mediaRef: landed.mediaPath, blipEmbedId: landed.rid } }
  }
  active()
  if (patch.bulletFont !== undefined && !patch.bullet) {
    // The upstream whole-list command requires a bullet kind to set the font.
    // Preserve each selected paragraph's own glyph when only its font was edited.
    for (const index of input.paraIndices) {
      const bullet = element.text.paragraphs[index]!.bullet
      const effective =
        bullet?.type === 'char'
          ? { ...patch, bullet: 'char' as const, bulletChar: bullet.char ?? '•' }
          : { ...patch, bulletFont: undefined }
      setElementParagraphFormat(slide, element.id, effective, [index])
    }
  } else setElementParagraphFormat(slide, element.id, patch, input.paraIndices)
  const patched = element.dirtyPPr ? patchElementPPr(element, before, element.dirtyPPr) : before
  if (patched === null) throw new Error('原生段落结构无法安全定位，请重新打开文稿后重试')
  if (!addedMedia && before === patched)
    return {
      bytes: request.bytes,
      records: [],
      version: request.expectedVersion,
      sampleData: false,
      changed: false,
    }
  const bytes = await savePptx(opened)
  await (await BoundedZip.open(bytes)).preflightAll()
  active()
  return {
    bytes,
    records: [
      {
        op: { op: 'manual_paragraph', ...input },
        after: { paraIndices: input.paraIndices, format: input.format },
      },
    ],
    version: request.expectedVersion + 1,
    sampleData: false,
    changed: true,
  }
}
