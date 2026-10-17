import { describe, expect, it } from 'vitest'
import {
  applyPptxMatrix,
  composePptxMatrices,
  invertPptxMatrix,
  pptxGroupMatrix,
  pptxMatrixSvg,
  type PptxGroupBox,
  type PptxPoint,
} from './pptx-group-placement.js'

const box: PptxGroupBox = { x: 91, y: -32, w: 301, h: 187, rotationDeg: 0 }
const corners = [
  { x: 0, y: 0 },
  { x: 301, y: 0 },
  { x: 301, y: 187 },
  { x: 0, y: 187 },
]
function expectPoint(actual: PptxPoint, expected: PptxPoint) {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}
/** Independent fixed-upstream Konva pivot: scale local displacement, then rotate. */
function upstreamPivot(b: PptxGroupBox, p: PptxPoint): PptxPoint {
  const x = (p.x - b.w / 2) * (b.flipH ? -1 : 1)
  const y = (p.y - b.h / 2) * (b.flipV ? -1 : 1)
  const angle = (b.rotationDeg * Math.PI) / 180
  return {
    x: b.x + b.w / 2 + x * Math.cos(angle) - y * Math.sin(angle),
    y: b.y + b.h / 2 + x * Math.sin(angle) + y * Math.cos(angle),
  }
}

describe('PPTX rendered group placement', () => {
  it.each([0, 30, 45, 90, 270, -37, 397])(
    'matches upstream corners at %s degrees for every flip',
    (rotationDeg) => {
      for (const flipH of [false, true])
        for (const flipV of [false, true]) {
          const b = { ...box, rotationDeg, flipH, flipV }
          const matrix = pptxGroupMatrix(b)!
          const inverse = invertPptxMatrix(matrix)!
          const [a, c, d, e] = matrix
          expect(Math.abs(a * e - c * d)).toBeCloseTo(1, 12)
          for (const p of corners) {
            const result = applyPptxMatrix(matrix, p)
            expectPoint(result, upstreamPivot(b, p))
            expectPoint(applyPptxMatrix(inverse, result), p)
          }
        }
    },
  )

  it('composes nested off-origin groups and viewport without double scaling children', () => {
    const parent = { ...box, rotationDeg: 45, flipH: true }
    const child = { ...box, x: 34, y: 27, w: 120, h: 76, rotationDeg: 90, flipV: true }
    const viewport = [1.5, 0, 0, 1.5, 17, 29] as const
    const matrix = composePptxMatrices(
      viewport,
      composePptxMatrices(pptxGroupMatrix(parent)!, pptxGroupMatrix(child)!),
    )
    const inverse = invertPptxMatrix(matrix)!
    expect(inverse).not.toBeNull()
    for (const p of [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 76 },
      { x: 0, y: 76 },
    ]) {
      const parentPoint = upstreamPivot(parent, upstreamPivot(child, p))
      const expected = { x: parentPoint.x * 1.5 + 17, y: parentPoint.y * 1.5 + 29 }
      expectPoint(applyPptxMatrix(matrix, p), expected)
      expectPoint(applyPptxMatrix(inverse, expected), p)
    }
  })

  it('keeps identity translation and serializes sufficient rotation precision', () => {
    expect(pptxGroupMatrix(box)).toEqual([1, 0, -0, 1, 91, -32])
    const matrix = pptxGroupMatrix({ ...box, rotationDeg: 37 })!
    const serialized = pptxMatrixSvg(matrix).slice(7, -1).split(' ').map(Number)
    for (let i = 0; i < 6; i++) expect(serialized[i]).toBeCloseTo(matrix[i]!, 11)
  })

  it('rejects invalid extents and nonfinite/singular matrices before inverse gestures', () => {
    for (const field of ['x', 'y', 'w', 'h', 'rotationDeg']) {
      expect(pptxGroupMatrix({ ...box, [field]: Infinity })).toBeNull()
      expect(pptxGroupMatrix({ ...box, [field]: NaN })).toBeNull()
    }
    for (const extent of [0, -1]) {
      expect(pptxGroupMatrix({ ...box, w: extent })).toBeNull()
      expect(pptxGroupMatrix({ ...box, h: extent })).toBeNull()
    }
    expect(invertPptxMatrix([0, 0, 0, 1, 2, 3])).toBeNull()
    expect(invertPptxMatrix([1, 2, 2, 4, 0, 0])).toBeNull()
    expect(invertPptxMatrix([Infinity, 0, 0, 1, 0, 0])).toBeNull()
    expect(invertPptxMatrix([1e-320, 0, 0, 1, 0, 0])).toBeNull()
  })
})
