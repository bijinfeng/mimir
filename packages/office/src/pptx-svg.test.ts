import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { XMLValidator } from 'fast-xml-parser'
import type {
  ArrowEndRender,
  RenderSlide,
  ShapeRenderNode,
} from '../vendor/packages/pptx-render/src/render-tree.js'
import type { TextElement } from '../vendor/packages/pptx-engine/src/types.js'
import { buildRenderSlide } from '../vendor/packages/pptx-render/src/build-slide.js'
import { openPptx } from './pptx.js'
import { renderSlideToSvg } from './pptx-svg.js'

const endpoint = (type: ArrowEndRender['type']): ArrowEndRender => ({
  type,
  widthPx: 12,
  lengthPx: 20,
})
const connector = (): ShapeRenderNode => ({
  id: 'line',
  sourceId: 'line',
  type: 'shape',
  box: {
    x: 20,
    y: 30,
    w: 100,
    h: 60,
    rotationDeg: 0,
    flipH: false,
    flipV: false,
    centerX: 70,
    centerY: 60,
  },
  fill: { kind: 'none' },
  stroke: { color: '#7030A080', widthPx: 2, widthPt: 1.5, dash: [8, 4] },
  line: { points: [0, 0, 100, 60] },
})
function render(node: ShapeRenderNode, prefix = ''): string {
  const slide: RenderSlide = {
    widthPx: 200,
    heightPx: 150,
    scale: 1,
    background: { kind: 'none' },
    nodes: [node],
  }
  return renderSlideToSvg(slide, prefix)
}

describe('PPTX SVG connector endpoints', () => {
  it.each([
    ['triangle', '<path d="M 0 0 L -20 -6 L -20 6 Z"'],
    ['stealth', '<path d="M 0 0 L -20 -6 L -13 0 L -20 6 Z"'],
    ['diamond', '<path d="M 0 0 L -10 -6 L -20 0 L -10 6 Z"'],
    ['oval', '<ellipse cx="0" cy="0" rx="10" ry="6"'],
    ['arrow', '<path d="M -20 -6 L 0 0 L -20 6"'],
  ] as const)('renders %s with resolved pixel sizes and native stroke paint', (type, geometry) => {
    const node = connector()
    node.line!.tailEnd = endpoint(type)
    const svg = render(node)
    expect(XMLValidator.validate(svg)).toBe(true)
    const marker = svg.match(/<marker\b[^>]*>[\s\S]*?<\/marker>/)?.[0]
    expect(marker).toContain(geometry)
    expect(marker).toContain('markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="12"')
    expect(marker).toContain('refX="0" refY="0" orient="auto-start-reverse" overflow="visible"')
    expect(marker).not.toContain('stroke-dasharray')
    const expectedPaint =
      type === 'arrow'
        ? 'fill="none" stroke="#7030A0" stroke-width="2" stroke-opacity="0.5"'
        : 'fill="#7030A0" fill-opacity="0.5"'
    expect(marker).toContain(expectedPaint)
    expect(marker?.includes(' Z')).toBe(type !== 'arrow' && type !== 'oval')
    // The shaft stays dashed while both filled and open heads remain solid.
    expect(svg).toMatch(
      /<path d="M 0 0 L 100 60"[^>]*stroke-dasharray="8 4"[^>]*marker-end="url\(#arrow1\)"/,
    )
    expect(svg).not.toContain('marker-start=')
  })

  it('references distinct head/tail markers, follows curve tangents and rotates with the shape', () => {
    const node = connector()
    node.box.rotationDeg = 90
    node.line = {
      points: [100, 60, 0, 0],
      bezier: [100, 20, 10, 0, 0, 0],
      headEnd: endpoint('triangle'),
      tailEnd: { type: 'oval', widthPx: 8, lengthPx: 10 },
    }
    const svg = render(node, 'canvas')
    const ids = [...svg.matchAll(/<marker id="([^"]+)"/g)].map((match) => match[1]!)
    expect(new Set(ids).size).toBe(2)
    expect(svg).toContain(`marker-start="url(#${ids[0]})" marker-end="url(#${ids[1]})"`)
    // Control points are already absolute local coordinates, even when flipped start is nonzero.
    expect(svg).toContain('d="M 100 60 C 100 20 10 0 0 0"')
    expect(svg).toContain('transform="translate(50 30) rotate(90) translate(-50 -30)"')
    expect(svg).toContain('transform="translate(20 30)"')
    const otherIds = [...render(node, 'thumbnail').matchAll(/<marker id="([^"]+)"/g)].map(
      (match) => match[1]!,
    )
    expect(otherIds.every((id) => !ids.includes(id))).toBe(true)
  })

  it('uses resolved gradient paint for filled endpoints without losing its definition', () => {
    const node = connector()
    node.stroke!.gradient = {
      angleDeg: 0,
      stops: [
        { pos: 0, color: '#7030A0' },
        { pos: 1, color: '#2E75B6' },
      ],
    }
    node.line!.tailEnd = endpoint('triangle')
    const svg = render(node)
    const gradientId = svg.match(/<linearGradient id="([^"]+)"/)?.[1]
    expect(gradientId).toBeDefined()
    expect(svg).toContain(`fill="url(#${gradientId})"`)
    expect(svg).toContain(`stroke="url(#${gradientId})"`)
    expect(XMLValidator.validate(svg)).toBe(true)
  })

  it('does not invent endpoints for plain, invisible, or incomplete lines', () => {
    const node = connector()
    expect(render(node)).not.toContain('<marker')
    node.line!.tailEnd = endpoint('triangle')
    node.stroke!.widthPx = 0
    expect(render(node)).not.toContain('<marker')
    node.stroke = undefined
    expect(render(node)).not.toContain('<marker')
    node.stroke = connector().stroke
    node.line!.points = [0, 0]
    expect(render(node)).not.toContain('<marker')
  })

  it('preserves per-stop gradient alpha without applying fallback opacity twice', () => {
    for (const type of ['triangle', 'arrow'] as const) {
      const node = connector()
      // Native resolveStroke uses the first stop as its fallback color.
      node.stroke!.color = '#7030A080'
      node.stroke!.gradient = {
        angleDeg: 0,
        stops: [
          { pos: 0, color: '#7030A080' },
          { pos: 0.25, color: '#2E75B600' },
          { pos: 0.5, color: '#2E75B6FF' },
          { pos: 1, color: '#2E75B6' },
        ],
      }
      node.line!.headEnd = endpoint(type)
      node.line!.tailEnd = endpoint(type)
      const svg = render(node)
      expect(svg).toContain('<stop offset="0" stop-color="#7030A0" stop-opacity="0.5"/>')
      expect(svg).toContain('<stop offset="0.25" stop-color="#2E75B6" stop-opacity="0"/>')
      expect(svg).toContain('<stop offset="0.5" stop-color="#2E75B6"/>')
      expect(svg).toContain('<stop offset="1" stop-color="#2E75B6"/>')
      expect(svg.match(/stop-opacity=/g)).toHaveLength(2)
      expect(svg).not.toContain('stroke-opacity=')
      expect(svg).not.toContain('fill-opacity=')
      expect(XMLValidator.validate(svg)).toBe(true)
    }
  })

  it('renders native straight/bent/curved connectors with flips, rotation and viewport-sized ends', async () => {
    const deck = await openPptx(
      new Uint8Array(readFileSync(new URL('../tests/fixtures/title-layout.pptx', import.meta.url))),
    )
    for (const presetGeometry of ['straightConnector1', 'bentConnector3', 'curvedConnector3']) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const element: TextElement = {
            id: 'native-connector',
            type: 'shape',
            anchor: { spIndex: -1, originalXml: '', range: [0, 0] },
            transform: {
              offset: { x: 914400, y: 914400, cx: 1828800, cy: 914400 },
              rot: 30 * 60000,
              flipH,
              flipV,
            },
            presetGeometry,
            fill: { type: 'none' },
            stroke: {
              fill: { type: 'solid', color: '#2E75B6' },
              width: 38100,
              headEnd: { type: 'triangle', w: 'sm', len: 'lg' },
              tailEnd: { type: 'stealth', w: 'lg', len: 'sm' },
            },
          }
          for (const fitWidthPx of [480, 960]) {
            const tree = buildRenderSlide(
              { ...deck.slides()[0]!, elements: [element], decorations: [] },
              deck.size,
              { fitWidthPx },
            )
            const native = tree.nodes[0] as ShapeRenderNode
            expect(native.box.flipH).toBe(false)
            expect(native.box.flipV).toBe(false)
            const svg = renderSlideToSvg(tree)
            expect(svg).toContain('marker-start=')
            expect(svg).toContain('marker-end=')
            expect(svg).toContain('rotate(30)')
            expect(svg).not.toContain('scale(-1')
            expect(svg).toContain(`markerWidth="${native.line!.headEnd!.lengthPx}"`)
            expect(svg).toContain(`markerHeight="${native.line!.tailEnd!.widthPx}"`)
            const finalCommand = native.line!.bezier
              ? `C ${native.line!.bezier.slice(-6).join(' ')}`
              : `L ${native.line!.points.slice(-2).join(' ')}`
            expect(svg).toContain(finalCommand)
            expect(XMLValidator.validate(svg)).toBe(true)
          }
        }
      }
    }
  })
})
