import {
  pptxParagraphFormatSchema,
  PPTX_PARAGRAPH_IMAGE_MAX_BYTES,
  readPptxImageInfo,
} from '@mimir/shared'
import type { OpenedPptx } from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  matchesElementRef,
  groupChildDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import type { Op } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { decodePdfImage } from './pdf-image-codec.js'

/** Validate the entire picture-bullet batch before native code adds any media or relationships. */
export function preflightPptxPictureBullets(opened: OpenedPptx, ops: readonly Op[]): void {
  const checked = new Set<string>()
  for (const op of ops) {
    if (op.op !== 'setParagraphFormat' || !op.format || typeof op.format !== 'object') continue
    const format = op.format as Record<string, unknown>
    if (format.bullet !== 'blip' && format.bulletImage === undefined) continue
    const parsed = pptxParagraphFormatSchema.safeParse(format)
    if (!parsed.success || !parsed.data.bulletImage)
      throw new Error('图片符号参数无效，请重新选择PNG或JPEG')
    const image = parsed.data.bulletImage
    const key = `${image.ext}|${image.base64}`
    if (!checked.has(key)) {
      const bytes = new Uint8Array(Buffer.from(image.base64, 'base64'))
      if (!bytes.length || bytes.length > PPTX_PARAGRAPH_IMAGE_MAX_BYTES)
        throw new Error('图片符号不能超过512 KiB')
      const info = readPptxImageInfo(bytes)
      if (
        info.ext !== (image.ext === 'jpeg' ? 'jpg' : image.ext) ||
        info.width * info.height > 4_000_000
      )
        throw new Error('图片符号须为不超过400万像素的PNG或JPEG，扩展名须与内容一致')
      const decoded = decodePdfImage(bytes)
      if (decoded.width !== info.width || decoded.height !== info.height)
        throw new Error('图片符号尺寸无效')
      checked.add(key)
    }
    const slide = opened.deck.slides[Number(op.target?.slide)]
    const ref = String(op.target?.el ?? '')
    let element = slide?.elements.find((item) => matchesElementRef(item, ref))
    if (op.group !== undefined) {
      const group = slide?.elements.find(
        (item) => item.type === 'group' && matchesElementRef(item, String(op.group)),
      )
      element =
        group?.type === 'group'
          ? group.children.find(
              (item) => matchesElementRef(item, ref) || groupChildDurableId(group, item) === ref,
            )
          : undefined
    }
    if (
      !element ||
      (element.type !== 'text' && element.type !== 'shape') ||
      !element.text?.paragraphs.length
    )
      throw new Error('图片符号目标已失效或不含可编辑文字；整批未应用')
  }
}
