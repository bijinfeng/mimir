import { pptxManualAssetSchema, type PptxManualAsset } from '@mimir/shared'

const MARKER = 'mimir:pptx-clipboard:v1:'
export const PPTX_CLIPBOARD_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export function pptxClipboardPasteInput(value: unknown, slide: number): PptxManualAsset | null {
  if (!value || typeof value !== 'object') return null
  const clip = value as Record<string, unknown>
  try {
    if (clip.kind === 'elements')
      return pptxManualAssetSchema.parse({ kind: 'paste_elements', slide, ref: clip.ref })
    if (clip.kind === 'slide' || clip.kind === 'slides')
      return pptxManualAssetSchema.parse({
        kind: clip.kind === 'slides' ? 'paste_slides' : 'paste_slide',
        afterIndex: slide,
        ref: clip.ref,
      })
  } catch {
    /* Untrusted clipboard markers never enter the host. */
  }
  return null
}
/** Actual OS text payload. Window-local storage is only the explicit internal paste fallback. */
export async function writePptxClipboardMarker(data: Record<string, unknown>) {
  if (!pptxClipboardPasteInput(data, 0)) return false
  if (!navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(MARKER + JSON.stringify({ kind: data.kind, ref: data.ref }))
    return true
  } catch {
    return false
  }
}
export function parsePptxClipboardMarker(text: string, slide: number): PptxManualAsset | null {
  if (!text.startsWith(MARKER) || text.length > 2048) return null
  try {
    return pptxClipboardPasteInput(JSON.parse(text.slice(MARKER.length)), slide)
  } catch {
    return null
  }
}
export function pptxClipboardTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]',
    )
  )
}
export function pptxClipboardImageFile(files: readonly File[]): File | null {
  if (!files.length) return null
  if (files.length !== 1) throw new Error('请一次粘贴或拖入一张 PNG 或 JPEG 图片')
  const file = files[0]!
  if (!['image/png', 'image/jpeg'].includes(file.type.toLowerCase()))
    throw new Error('仅支持 PNG 或 JPEG 图片')
  if (file.size < 1 || file.size > PPTX_CLIPBOARD_IMAGE_MAX_BYTES)
    throw new Error('图片须大于 0 且不超过 8 MiB')
  return file
}
export async function validatePptxClipboardImage(file: File, signal: AbortSignal) {
  pptxClipboardImageFile([file])
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (signal.aborted) throw new Error('图片粘贴已取消')
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if ((file.type === 'image/png' && !png) || (file.type === 'image/jpeg' && !jpeg))
    throw new Error('图片类型与真实内容不一致，请使用 PNG 或 JPEG')
}
/** Called only from the explicit user paste command. */
export async function readPptxSystemClipboardImage(signal: AbortSignal): Promise<File> {
  if (!navigator.clipboard?.read)
    throw new Error('浏览器不支持读取系统图片，请在画布按粘贴快捷键或拖入图片')
  let items: ClipboardItems
  try {
    items = await navigator.clipboard.read()
  } catch {
    throw new Error('未获准读取系统剪贴板，请允许访问后重试，或拖入图片')
  }
  if (signal.aborted) throw new Error('图片粘贴已取消')
  const imageItems = items.filter((item) =>
    item.types.some((type) => type === 'image/png' || type === 'image/jpeg'),
  )
  if (imageItems.length !== 1) throw new Error('系统剪贴板中须有一张 PNG 或 JPEG 图片')
  const item = imageItems[0]!,
    type = item.types.includes('image/png') ? 'image/png' : 'image/jpeg'
  const blob = await item.getType(type)
  if (signal.aborted) throw new Error('图片粘贴已取消')
  const file = new File([blob], type === 'image/png' ? 'clipboard.png' : 'clipboard.jpg', { type })
  await validatePptxClipboardImage(file, signal)
  return file
}
