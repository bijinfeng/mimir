/** SVG affine coefficients: x' = a*x + c*y + e; y' = b*x + d*y + f. */
export type PptxMatrix = readonly [number, number, number, number, number, number]
export type PptxPoint = { x: number; y: number }
export type PptxGroupBox = PptxPoint & {
  w: number
  h: number
  rotationDeg: number
  flipH?: boolean
  flipV?: boolean
}

/** Compose parent * child. Coordinates enter child first, then parent. */
export function composePptxMatrices(parent: PptxMatrix, child: PptxMatrix): PptxMatrix {
  const [a, b, c, d, e, f] = parent
  const [g, h, i, j, k, l] = child
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ]
}

export function applyPptxMatrix(matrix: PptxMatrix, point: PptxPoint): PptxPoint {
  const [a, b, c, d, e, f] = matrix
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f }
}

/** Invalid/singular geometry has no usable inverse; callers must disable its gestures. */
export function invertPptxMatrix(matrix: PptxMatrix): PptxMatrix | null {
  if (!matrix.every(Number.isFinite)) return null
  const [a, b, c, d, e, f] = matrix
  const determinant = a * d - b * c
  if (!Number.isFinite(determinant) || determinant === 0) return null
  const inverse: PptxMatrix = [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ]
  return inverse.every(Number.isFinite) ? inverse : null
}

/**
 * Group-local rendered pixels → parent-local pixels. Fixed GenOffice's center pivot
 * is T(center) R(rotation) F(flip) T(-halfExtent), matching Konva boxPivotProps.
 * ext/chExt and chOff have ALREADY been baked into child boxes by buildGroup.
 * Do not include childScaleX/Y here: doing so scales the children twice.
 */
export function pptxGroupMatrix(box: PptxGroupBox): PptxMatrix | null {
  if (
    ![box.x, box.y, box.w, box.h, box.rotationDeg].every(Number.isFinite) ||
    box.w <= 0 ||
    box.h <= 0
  )
    return null
  const angle = ((box.rotationDeg % 360) * Math.PI) / 180
  const cos = Math.cos(angle),
    sin = Math.sin(angle)
  const sx = box.flipH ? -1 : 1,
    sy = box.flipV ? -1 : 1
  const a = cos * sx,
    b = sin * sx,
    c = -sin * sy,
    d = cos * sy
  const e = box.x + box.w / 2 - (a * box.w) / 2 - (c * box.h) / 2
  const f = box.y + box.h / 2 - (b * box.w) / 2 - (d * box.h) / 2
  const matrix: PptxMatrix = [a, b, c, d, e, f]
  return matrix.every(Number.isFinite) ? matrix : null
}

/** Keep subpixel precision shared with overlays, rather than rounding rotation to .01. */
export function pptxMatrixSvg(matrix: PptxMatrix): string {
  return `matrix(${matrix.map((value) => Number(value.toPrecision(15))).join(' ')})`
}
