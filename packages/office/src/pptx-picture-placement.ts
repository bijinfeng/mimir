import type { GroupElement, PictureElement } from '../vendor/packages/pptx-engine/src/types.js'
import { flatCameraMirror } from '../vendor/packages/pptx-render/src/scene3d.js'
import {
  composePptxMatrices,
  invertPptxMatrix,
  pptxGroupMatrix,
  type PptxMatrix,
} from './pptx-group-placement.js'

export type PptxPictureViewport = {
  width: number
  height: number
  slideWidth: number
  slideHeight: number
}
/** Native source geometry, never inferred from a placed (possibly quarter-swapped) child box. */
export function pptxPicturePlacement(
  picture: PictureElement,
  viewport: PptxPictureViewport,
  parent?: GroupElement,
) {
  if (
    ![viewport.width, viewport.height, viewport.slideWidth, viewport.slideHeight].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    return null
  const scaleX = viewport.width / viewport.slideWidth,
    scaleY = viewport.height / viewport.slideHeight
  const offset = picture.transform.offset
  const mirror = picture.scene3d && flatCameraMirror(picture.scene3d)
  const box = {
    x: offset.x * scaleX,
    y: offset.y * scaleY,
    w: offset.cx * scaleX,
    h: offset.cy * scaleY,
    rotationDeg: picture.transform.rot / 60000 + (mirror?.rotationDeg ?? 0),
    flipH: picture.transform.flipH !== !!mirror?.flipH,
    flipV: picture.transform.flipV !== !!mirror?.flipV,
  }
  const nativeMatrix = pptxGroupMatrix(box)
  if (!nativeMatrix) return null
  let parentMatrix: PptxMatrix = [1, 0, 0, 1, 0, 0]
  let localMatrix = nativeMatrix
  if (parent) {
    const outer = parent.transform.offset,
      child = parent.childOffset
    const cx = child?.cx ?? outer.cx,
      cy = child?.cy ?? outer.cy
    const x = child?.x ?? outer.x,
      y = child?.y ?? outer.y
    if (
      ![outer.cx, outer.cy, cx, cy].every((v) => Number.isFinite(v) && v > 0) ||
      ![x, y].every(Number.isFinite)
    )
      return null
    const placement = pptxGroupMatrix({
      x: outer.x * scaleX,
      y: outer.y * scaleY,
      w: outer.cx * scaleX,
      h: outer.cy * scaleY,
      rotationDeg: parent.transform.rot / 60000,
      flipH: parent.transform.flipH,
      flipV: parent.transform.flipV,
    })
    if (!placement) return null
    const sx = outer.cx / cx,
      sy = outer.cy / cy
    const mapping: PptxMatrix = [sx, 0, 0, sy, -x * scaleX * sx, -y * scaleY * sy]
    localMatrix = composePptxMatrices(mapping, nativeMatrix)
    parentMatrix = composePptxMatrices(placement, mapping)
  }
  const matrix = composePptxMatrices(parentMatrix, nativeMatrix),
    inverse = invertPptxMatrix(matrix)
  if (!inverse) return null
  return { box, matrix, inverse, nativeMatrix, localMatrix, scaleX, scaleY }
}
