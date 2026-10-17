import type { PictureElement, EmuRect } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  flatCameraMirror,
  inPlaneRotationDeg,
} from '../../vendor/packages/pptx-render/src/scene3d.js'

export type PictureCropRect = { l: number; t: number; r: number; b: number }
export type PictureCropPoint = { x: number; y: number }
export type PictureCropFrame = PictureCropPoint & { w: number; h: number }
export type PictureCropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type PictureCropViewport = {
  width: number
  height: number
  slideWidth: number
  slideHeight: number
}
export type PictureCropGeometry = {
  box: PictureCropFrame & { rotationDeg: number; flipH: boolean; flipV: boolean }
  /** Original source extent in the current picture's unrotated local coordinates. */
  full: PictureCropFrame
  frame: PictureCropFrame
  scaleX: number
  scaleY: number
}
export const PICTURE_CROP_HANDLES: readonly PictureCropHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]
const clampCropCoordinate = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const roundCropFraction = (v: number) => Math.max(0, Math.round(v * 100000) / 100000)
const zeroCrop = { l: 0, t: 0, r: 0, b: 0 }

export function pptxPictureCropUnavailableReason(
  element: PictureElement,
  viewport: PictureCropViewport,
): string | undefined {
  if (element.media) return '音频和视频封面不支持图片裁切'
  const { offset, rot } = element.transform
  if (
    ![
      viewport.width,
      viewport.height,
      viewport.slideWidth,
      viewport.slideHeight,
      offset.cx,
      offset.cy,
    ].every((n) => Number.isFinite(n) && n > 0) ||
    ![offset.x, offset.y, rot].every(Number.isFinite)
  )
    return '图片尺寸无效，请先检查图片位置与大小'
  const crop = element.srcRect ?? zeroCrop
  if (
    !Object.values(crop).every((n) => Number.isFinite(n) && n >= 0 && n < 1) ||
    crop.l + crop.r >= 1 ||
    crop.t + crop.b >= 1
  )
    return '此图片的原始裁切范围无法拖动，请使用数值裁切'
  const scene = element.scene3d
  // flatCameraMirror returns null for identity too. A one-degree probe distinguishes
  // a genuinely flat parallel camera from a perspective/skew/extruded scene.
  if (
    scene &&
    !flatCameraMirror(scene) &&
    !(
      inPlaneRotationDeg(scene) === 0 &&
      flatCameraMirror({ ...scene, cameraRot: { lat: 0, lon: 0, rev: 60000 } })
    )
  )
    return '此图片带有三维投影，请使用数值裁切'
  return undefined
}

export function pptxPictureCropGeometry(
  element: PictureElement,
  viewport: PictureCropViewport,
): PictureCropGeometry | null {
  if (pptxPictureCropUnavailableReason(element, viewport)) return null
  const scaleX = viewport.width / viewport.slideWidth,
    scaleY = viewport.height / viewport.slideHeight,
    transform = element.transform,
    offset = transform.offset,
    mirror = element.scene3d && flatCameraMirror(element.scene3d),
    w = offset.cx * scaleX,
    h = offset.cy * scaleY,
    crop = element.srcRect ?? zeroCrop,
    fullW = w / (1 - crop.l - crop.r),
    fullH = h / (1 - crop.t - crop.b)
  return {
    box: {
      x: offset.x * scaleX,
      y: offset.y * scaleY,
      w,
      h,
      rotationDeg: transform.rot / 60000 + (mirror?.rotationDeg ?? 0),
      flipH: transform.flipH !== !!mirror?.flipH,
      flipV: transform.flipV !== !!mirror?.flipV,
    },
    full: { x: -crop.l * fullW, y: -crop.t * fullH, w: fullW, h: fullH },
    frame: { x: 0, y: 0, w, h },
    scaleX,
    scaleY,
  }
}
/** Centered flip AFTER rotation, matching pptx-svg transformAttr (including flat cameras). */
export function pictureCropToSlide(
  geometry: PictureCropGeometry,
  local: PictureCropPoint,
): PictureCropPoint {
  const b = geometry.box,
    angle = (b.rotationDeg * Math.PI) / 180,
    dx = local.x - b.w / 2,
    dy = local.y - b.h / 2,
    x = Math.cos(angle) * dx - Math.sin(angle) * dy,
    y = Math.sin(angle) * dx + Math.cos(angle) * dy
  return { x: b.x + b.w / 2 + (b.flipH ? -x : x), y: b.y + b.h / 2 + (b.flipV ? -y : y) }
}
export function pictureCropToLocal(
  geometry: PictureCropGeometry,
  point: PictureCropPoint,
): PictureCropPoint {
  const b = geometry.box,
    angle = (-b.rotationDeg * Math.PI) / 180,
    dx = (point.x - b.x - b.w / 2) * (b.flipH ? -1 : 1),
    dy = (point.y - b.y - b.h / 2) * (b.flipV ? -1 : 1)
  return {
    x: Math.cos(angle) * dx - Math.sin(angle) * dy + b.w / 2,
    y: Math.sin(angle) * dx + Math.cos(angle) * dy + b.h / 2,
  }
}
export function pictureCropTransform({ box: b }: PictureCropGeometry): string {
  return `translate(${b.x + b.w / 2} ${b.y + b.h / 2}) scale(${b.flipH ? -1 : 1} ${b.flipV ? -1 : 1}) rotate(${b.rotationDeg}) translate(${-b.w / 2} ${-b.h / 2})`
}
export function pictureCropHandlePoint(
  frame: PictureCropFrame,
  handle: PictureCropHandle,
): PictureCropPoint {
  return {
    x: frame.x + (handle.includes('w') ? 0 : handle.includes('e') ? frame.w : frame.w / 2),
    y: frame.y + (handle.includes('n') ? 0 : handle.includes('s') ? frame.h : frame.h / 2),
  }
}
export function movePictureCropHandle(
  frame: PictureCropFrame,
  full: PictureCropFrame,
  handle: PictureCropHandle,
  delta: PictureCropPoint,
): PictureCropFrame {
  // Keep a useful 12px target, while allowing very small original pictures too.
  const minW = Math.min(Math.max(12, full.w / 50000), full.w),
    minH = Math.min(Math.max(12, full.h / 50000), full.h)
  let left = frame.x,
    top = frame.y,
    right = frame.x + frame.w,
    bottom = frame.y + frame.h
  if (handle.includes('w')) left = clampCropCoordinate(left + delta.x, full.x, right - minW)
  if (handle.includes('e'))
    right = clampCropCoordinate(right + delta.x, left + minW, full.x + full.w)
  if (handle.includes('n')) top = clampCropCoordinate(top + delta.y, full.y, bottom - minH)
  if (handle.includes('s'))
    bottom = clampCropCoordinate(bottom + delta.y, top + minH, full.y + full.h)
  return { x: left, y: top, w: right - left, h: bottom - top }
}
export function pictureCropCommit(
  geometry: PictureCropGeometry,
  frame: PictureCropFrame,
): { srcRect: PictureCropRect | null; box: EmuRect } {
  const full = geometry.full,
    srcRect = {
      l: roundCropFraction((frame.x - full.x) / full.w),
      t: roundCropFraction((frame.y - full.y) / full.h),
      r: roundCropFraction((full.x + full.w - frame.x - frame.w) / full.w),
      b: roundCropFraction((full.y + full.h - frame.y - frame.h) / full.h),
    },
    center = pictureCropToSlide(geometry, { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 })
  return {
    srcRect: Object.values(srcRect).every((v) => v === 0) ? null : srcRect,
    box: {
      x: Math.round((center.x - frame.w / 2) / geometry.scaleX),
      y: Math.round((center.y - frame.h / 2) / geometry.scaleY),
      cx: Math.max(1, Math.round(frame.w / geometry.scaleX)),
      cy: Math.max(1, Math.round(frame.h / geometry.scaleY)),
    },
  }
}
