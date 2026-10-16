import { describe, expect, it } from 'vitest'
import {
  decodeInkPayload,
  encodeInkPayload,
  inkNodeHitTest,
  readInkPresets,
  relativeInkStroke,
  strokeBounds,
  strokePathD,
} from './pptx-ink.js'
import type { PictureRenderNode } from '../vendor/packages/pptx-render/src/render-tree.js'
const stroke = {
  tool: 'pen' as const,
  color: '0070C0',
  width: 2,
  points: [
    { x: 10, y: 20 },
    { x: 50, y: 30 },
  ],
}
describe('PPTX vector ink format', () => {
  it('preserves upstream version1 payload, bounding margins, single dots and malformed file safety', () => {
    expect(strokeBounds(stroke)).toEqual({ x: 8, y: 18, w: 44, h: 14 })
    expect(decodeInkPayload(encodeInkPayload(relativeInkStroke(stroke)))).toEqual({
      ...stroke,
      points: [
        { x: 2, y: 2 },
        { x: 42, y: 12 },
      ],
    })
    expect(strokePathD([{ x: 2, y: 3 }])).toContain('0.01')
    for (const value of [
      'null',
      '{}',
      '{"v":2}',
      JSON.stringify({ v: 1, ...stroke }),
      JSON.stringify({ v: 1, ...stroke, points: [[null, 3]] }),
      JSON.stringify({ v: 1, ...stroke, points: [[1, 2, 3]] }),
      JSON.stringify({ v: 1, ...stroke, points: Array(20001).fill([1, 2]) }),
    ])
      expect(decodeInkPayload(value)).toBeNull()
  })
  it('hit tests scaled/moved/rotated/flipped strokes without using their rectangular bounding area as the stroke', () => {
    const rel = {
      ...stroke,
      points: [
        { x: 2, y: 2 },
        { x: 42, y: 12 },
      ],
    }
    const node = { box: { x: 100, y: 200, w: 88, h: 28 } } as PictureRenderNode
    expect(inkNodeHitTest({ node, stroke: rel }, { x: 144, y: 214 }, 1)).toBe(true)
    expect(inkNodeHitTest({ node, stroke: rel }, { x: 104, y: 226 }, 1)).toBe(false)
    node.box.rotationDeg = 90
    expect(inkNodeHitTest({ node, stroke: rel }, { x: 154, y: 174 }, 1)).toBe(true)
    node.box.flipH = true
    expect(inkNodeHitTest({ node, stroke: rel }, { x: 134, y: 174 }, 1)).toBe(true)
  })
  it('persists all five customized presets independently, rejects corrupt local storage and retains fixed palette/width limits', () => {
    const defaults = readInkPresets(null)
    expect(defaults).toHaveLength(5)
    defaults[0] = { tool: 'pen', color: '7030A0', width: 3.5 }
    defaults[3] = { tool: 'highlighter', color: '92D050', width: 16 }
    expect(readInkPresets(JSON.stringify(defaults))).toEqual(defaults)
    expect(
      readInkPresets(JSON.stringify([{ tool: 'pen', color: '#000000', width: 99 }]))[0],
    ).toEqual({ tool: 'pen', color: '000000', width: 2 })
    expect(readInkPresets('not json')[3]).toEqual({
      tool: 'highlighter',
      color: 'FFFF00',
      width: 10,
    })
  })
})
