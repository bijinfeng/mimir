import { describe, expect, it } from 'vitest'
import {
  createDrawing,
  drawingPath,
  drawingPoint,
  moveDrawing,
  resizeDrawing,
} from './pdf-drawing-canvas.js'

describe('PDF display-point drawing geometry', () => {
  it('maps the actual rendered cropped/rotated paper, independently of zoom and DOM offset', () => {
    expect(
      drawingPoint(
        [330, 220],
        { left: 30, top: 20, width: 600, height: 400 },
        { width: 900, height: 600 },
      ),
    ).toEqual([450, 300])
    expect(
      drawingPoint([0, 0], { left: 0, top: 0, width: 0, height: 1 }, { width: 1, height: 1 }),
    ).toBeNull()
  })
  it.each([
    [[10, 20], [110, 70], 0, 'M10,20 L110,70'],
    [[110, 20], [10, 70], 90, 'M110,20 L10,70'],
    [[110, 70], [10, 20], 180, 'M110,70 L10,20'],
    [[10, 70], [110, 20], 270, 'M10,70 L110,20'],
  ] as const)(
    'keeps a reverse-direction line or arrow native endpoints',
    (start, end, rotation, path) => {
      const d = createDrawing('line', 1, [[...start], [...end]])!
      expect(d.rotation).toBe(rotation)
      expect(drawingPath(d)).toBe(path)
    },
  )
  it('keeps horizontal/vertical endpoints and a visible arrow head without minimum-height skew', () => {
    expect(
      drawingPath(
        createDrawing('line', 1, [
          [20, 40],
          [120, 40],
        ])!,
      ),
    ).toBe('M20,40 L120,40')
    expect(
      drawingPath(
        createDrawing('line', 1, [
          [20, 40],
          [20, 140],
        ])!,
      ),
    ).toBe('M20,40 L20,140')
    expect(
      createDrawing('arrow', 1, [
        [20, 40],
        [120, 40],
      ])!.arrowHeadLength,
    ).toBe(12)
  })
  it('preserves ink point geometry through move and asymmetric resize', () => {
    const d = createDrawing('ink', 2, [
      [10, 20],
      [40, 70],
      [110, 40],
    ])!
    const moved = moveDrawing(d, -30, 15)
    expect(moved.points).toEqual([
      [-20, 35],
      [10, 85],
      [80, 55],
    ])
    expect(resizeDrawing(moved, 'se', [180, 135]).points).toEqual([
      [-20, 35],
      [40, 135],
      [180, 75],
    ])
    const nw = resizeDrawing(d, 'nw', [0, 0])
    expect(nw.x).toBe(0)
    expect(nw.y).toBe(0)
    expect(nw.points?.at(-1)).toEqual([110, 28])
  })
  it('rejects click jitter and keeps horizontal ink as a positive native bounding box', () => {
    expect(
      createDrawing('rect', 1, [
        [0, 0],
        [0.5, 0.5],
      ]),
    ).toBeNull()
    const d = createDrawing('ink', 1, [
      [0, 10],
      [100, 10],
    ])!
    expect(d.height).toBe(0.25)
    expect(d.points).toEqual([
      [0, 10],
      [100, 10],
    ])
  })
})
