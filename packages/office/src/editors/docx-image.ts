import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection } from '@tiptap/pm/state'
import { docxCropPixels } from './docx-image-crop.js'
import { removeBackground } from '../../vendor/packages/ui/src/cutout.js'

export const DOCX_IMAGE_PX_PER_CM = 96 / 2.54
export interface DocxImageTarget {
  doc: PmNode
  pos: number
  node: PmNode
}
export interface DocxImageDraft {
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
  align: string
  wrap: string
  replacement?: string
}
export interface DocxImageInsets {
  left: number
  top: number
  right: number
  bottom: number
}

/** Never infer an image target from nearby text. */
export function selectedDocxImage(editor: Editor): DocxImageTarget | null {
  const { selection, doc } = editor.state
  if (!(selection instanceof NodeSelection)) return null
  const node = selection.node
  if (node.type.name !== 'docProtected' || node.attrs.blockType !== 'image') return null
  return { doc, pos: selection.from, node }
}
export function docxImageDraft(target: DocxImageTarget): DocxImageDraft {
  const attrs = target.node.attrs
  return {
    width: Number(attrs.imageWidthPx) || 0,
    height: Number(attrs.imageHeightPx) || 0,
    rotation: Number(attrs.imageRotDeg) || 0,
    flipH: !!attrs.imageFlipH,
    flipV: !!attrs.imageFlipV,
    align: String(attrs.imageAlign ?? 'left'),
    wrap: String(attrs.imageWrap ?? ''),
  }
}
export function resizeDocxImage(
  draft: DocxImageDraft,
  side: 'width' | 'height',
  value: number,
  keepRatio: boolean,
): DocxImageDraft {
  if (!Number.isFinite(value) || value <= 0) throw new Error('图片尺寸必须大于零')
  const next = { ...draft, [side]: value }
  if (keepRatio && draft.width > 0 && draft.height > 0) {
    if (side === 'width') next.height = (value * draft.height) / draft.width
    else next.width = (value * draft.width) / draft.height
  }
  return next
}
function pictureData(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|gif));base64,([A-Za-z0-9+/]+={0,2})$/s.exec(dataUrl)
  if (!match) throw new Error('只支持 PNG、JPEG 或 GIF 图片')
  return { mime: match[1]!, base64: match[2]! }
}
export function assertDocxImageTarget(editor: Editor, target: DocxImageTarget): void {
  if (editor.isDestroyed) throw new Error('文档已关闭，请重新打开图片面板')
  if (!editor.isEditable) throw new Error('文档当前不允许修改图片，请检查保护状态')
  if (editor.state.doc !== target.doc || editor.state.doc.nodeAt(target.pos) !== target.node)
    throw new Error('文档已变化，请重新选择图片并打开面板')
}
/** Native attrs feed imagePatchOf/replaceImage. One transaction = one ordinary history entry. */
export function applyDocxImageDraft(
  editor: Editor,
  target: DocxImageTarget,
  draft: DocxImageDraft,
): DocxImageTarget {
  assertDocxImageTarget(editor, target)
  if (
    ![draft.width, draft.height].every(
      (value) => Number.isFinite(value) && value >= 1 && value <= 4096,
    ) ||
    !Number.isFinite(draft.rotation)
  )
    throw new Error('图片宽高须为 1–4096 像素，旋转角度须为有效数字')
  if (!['left', 'center', 'right'].includes(draft.align)) throw new Error('图片对齐方式无效')
  if (
    ![
      '',
      'square-left',
      'square-right',
      'tight-left',
      'tight-right',
      'through-left',
      'through-right',
      'topBottom',
      'behind',
      'front',
    ].includes(draft.wrap)
  )
    throw new Error('图片文字环绕方式无效')
  const width =
    draft.width === Number(target.node.attrs.imageWidthPx) ? draft.width : Math.round(draft.width)
  const height =
    draft.height === Number(target.node.attrs.imageHeightPx)
      ? draft.height
      : Math.round(draft.height)
  const rotation = ((Math.round(draft.rotation) % 360) + 360) % 360
  const attrs = {
    ...target.node.attrs,
    imageWidthPx: width,
    imageHeightPx: height,
    imageRotDeg: rotation || null,
    imageFlipH: draft.flipH,
    imageFlipV: draft.flipV,
    imageAlign:
      draft.align === String(target.node.attrs.imageAlign ?? 'left')
        ? target.node.attrs.imageAlign
        : draft.align === 'left'
          ? null
          : draft.align,
    imageWrap:
      draft.wrap === String(target.node.attrs.imageWrap ?? '')
        ? target.node.attrs.imageWrap
        : draft.wrap || null,
  }
  if (draft.replacement !== undefined) {
    const payload = pictureData(draft.replacement)
    Object.assign(attrs, {
      imageDataUrl: draft.replacement,
      imageCrop: null,
      imageFillRect: null,
      ...(target.node.attrs.docxIndex !== null && target.node.attrs.docxIndex !== undefined
        ? { imageReplace: payload }
        : { genImage: { ...payload, widthPx: width, heightPx: height } }),
    })
  }
  const next = target.node.type.create(attrs, target.node.content, target.node.marks)
  if (next.eq(target.node)) return target
  editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(target.pos, undefined, attrs))
  if (editor.state.doc === target.doc || !editor.state.doc.nodeAt(target.pos)?.eq(next))
    throw new Error('图片修改未被编辑器接受，请重新检查文档保护状态')
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  return { doc: editor.state.doc, pos: target.pos, node: editor.state.doc.nodeAt(target.pos)! }
}
export function readDocxImageFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => {
      reader.abort()
      cleanup()
      reject(new Error('已取消读取图片'))
    }
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    reader.addEventListener(
      'load',
      () => {
        cleanup()
        resolve(String(reader.result))
      },
      { once: true },
    )
    reader.addEventListener(
      'error',
      () => {
        cleanup()
        reject(new Error('读取图片失败，请重新选择'))
      },
      { once: true },
    )
    reader.readAsDataURL(file)
  })
}
export function decodeDocxImage(dataUrl: string, signal: AbortSignal): Promise<HTMLImageElement> {
  pictureData(dataUrl)
  return new Promise((resolve, reject) => {
    const image = new Image()
    const cleanup = () => {
      signal.removeEventListener('abort', abort)
      image.removeEventListener('load', loaded)
      image.removeEventListener('error', failed)
    }
    const abort = () => {
      cleanup()
      image.src = ''
      reject(new Error('已取消处理图片'))
    }
    const loaded = () => {
      cleanup()
      if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) reject(new Error('图片尺寸无效'))
      else resolve(image)
    }
    const failed = () => {
      cleanup()
      reject(new Error('图片无法解码，请选择有效图片'))
    }
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    image.addEventListener('load', loaded, { once: true })
    image.addEventListener('error', failed, { once: true })
    image.src = dataUrl
  })
}
/** Fixed upstream edge flood-fill; output is a real full-resolution PNG. */
export async function processDocxImage(
  dataUrl: string,
  operation: { kind: 'crop'; insets: DocxImageInsets } | { kind: 'cutout'; tolerance: number },
  signal: AbortSignal,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await decodeDocxImage(dataUrl, signal)
  if (signal.aborted) throw new Error('已取消处理图片')
  const w = image.naturalWidth
  const h = image.naturalHeight
  if (w * h > 20_000_000) throw new Error('图片超过 2000 万像素，请先缩小图片后重试')
  const canvas = document.createElement('canvas')
  let x = 0
  let y = 0
  let width = w
  let height = h
  if (operation.kind === 'crop') {
    ;({ x, y, width, height } = docxCropPixels(operation.insets, w, h))
  } else if (
    !Number.isFinite(operation.tolerance) ||
    operation.tolerance < 0 ||
    operation.tolerance > 100
  ) {
    throw new Error('去背景容差须为 0–100')
  }
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器无法处理图片，请稍后重试')
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height)
  if (operation.kind === 'cutout') {
    const result = removeBackground(ctx.getImageData(0, 0, width, height), operation.tolerance)
    const pixels = ctx.createImageData(width, height)
    pixels.data.set(result.data)
    ctx.putImageData(pixels, 0, 0)
  }
  if (signal.aborted) throw new Error('已取消处理图片')
  const output = canvas.toDataURL('image/png')
  pictureData(output)
  return { dataUrl: output, width, height }
}
