import type {
  PictureElement,
  EmuRect,
  GroupElement,
} from '../../vendor/packages/pptx-engine/src/types.js'
import {
  flatCameraMirror,
  inPlaneRotationDeg,
} from '../../vendor/packages/pptx-render/src/scene3d.js'

import { pptxPicturePlacement } from '../pptx-picture-placement.js'
import { applyPptxMatrix, pptxMatrixSvg, type PptxMatrix } from '../pptx-group-placement.js'

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
  matrix: PptxMatrix
  inverse: PptxMatrix
  nativeMatrix: PptxMatrix
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
  parent?: GroupElement,
): string | undefined {
  if (element.media && parent) return '组内音视频封面暂不支持画布裁切'
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
  parent?: GroupElement,
): PictureCropGeometry | null {
  if (pptxPictureCropUnavailableReason(element, viewport, parent)) return null
  const placed = pptxPicturePlacement(element, viewport, parent)
  if (!placed) return null
  const { w, h } = placed.box,
    crop = element.srcRect ?? zeroCrop
  const fullW = w / (1 - crop.l - crop.r),
    fullH = h / (1 - crop.t - crop.b)
  return {
    ...placed,
    full: { x: -crop.l * fullW, y: -crop.t * fullH, w: fullW, h: fullH },
    frame: { x: 0, y: 0, w, h },
  }
}
export function pictureCropToSlide(
  geometry: PictureCropGeometry,
  local: PictureCropPoint,
): PictureCropPoint {
  return applyPptxMatrix(geometry.matrix, local)
}
export function pictureCropToLocal(
  geometry: PictureCropGeometry,
  point: PictureCropPoint,
): PictureCropPoint {
  return applyPptxMatrix(geometry.inverse, point)
}
export function pictureCropTransform(geometry: PictureCropGeometry): string {
  return pptxMatrixSvg(geometry.matrix)
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
    center = applyPptxMatrix(geometry.nativeMatrix, {
      x: frame.x + frame.w / 2,
      y: frame.y + frame.h / 2,
    })
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
