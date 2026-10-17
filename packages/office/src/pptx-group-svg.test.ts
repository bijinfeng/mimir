import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { XMLValidator } from 'fast-xml-parser'
import { buildRenderSlide } from '../vendor/packages/pptx-render/src/build-slide.js'
import type {
  GroupRenderNode,
  RenderSlide,
  ShapeRenderNode,
} from '../vendor/packages/pptx-render/src/render-tree.js'
import { openPptx } from './pptx.js'
import { renderSlideToSvg } from './pptx-svg.js'
import { applyPptxMatrix, pptxGroupMatrix, type PptxMatrix } from './pptx-group-placement.js'
import {
  pptxGroupRenderFixture,
  type GroupRenderFixture,
} from './pptx-group-render-fixture.test-helper.js'

const box = {
  x: 100,
  y: 60,
  w: 200,
  h: 120,
  rotationDeg: 45,
  flipH: true,
  flipV: false,
  centerX: 200,
  centerY: 120,
}
const shape: ShapeRenderNode = {
  id: 'r_child',
  sourceId: 'child<&"',
  type: 'shape',
  box: { ...box, x: 20, y: 10, w: 40, h: 20, rotationDeg: 0, flipH: false },
  fill: { kind: 'solid', color: '#ff0000' },
}
function render(groupBox = box) {
  const group: GroupRenderNode = {
    id: 'r_parent',
    sourceId: 'parent<&"',
    type: 'group',
    box: groupBox,
    childScaleX: 1.5,
    childScaleY: 2,
    children: [shape],
  }
  const slide: RenderSlide = {
    widthPx: 400,
    heightPx: 300,
    scale: 1,
    background: { kind: 'none' },
    nodes: [group],
  }
  return renderSlideToSvg(slide)
}
function matrixFromSvg(svg: string, id: string): PptxMatrix {
  const transform = svg.match(
    new RegExp(`data-element-id="${id}"[^>]*transform="matrix\\(([^)]+)\\)"`),
  )?.[1]
  expect(transform).toBeDefined()
  return transform!.split(' ').map(Number) as unknown as PptxMatrix
}

describe('PPTX parent group SVG transforms', () => {
  it('actually applies centered rotation and flip, without a second ext/chExt scale', () => {
    const svg = render()
    expect(XMLValidator.validate(svg)).toBe(true)
    const matrix = matrixFromSvg(svg, 'parent&lt;&amp;&quot;')
    const expected = [
      { x: 313.1370849898476, y: 148.2842712474619 },
      { x: 171.7157287525381, y: 6.862915010152392 },
      { x: 86.86291501015239, y: 91.7157287525381 },
      { x: 228.2842712474619, y: 233.1370849898476 },
    ]
    for (const [index, point] of [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 120 },
      { x: 0, y: 120 },
    ].entries()) {
      const actual = applyPptxMatrix(matrix, point)
      expect(actual.x).toBeCloseTo(expected[index]!.x, 9)
      expect(actual.y).toBeCloseTo(expected[index]!.y, 9)
    }
    expect(svg).toContain('data-element-id="child&lt;&amp;&quot;"')
    expect(svg).toContain('transform="translate(20 10)"')
    expect(svg).toContain('width="40" height="20"')
    expect(svg).not.toContain('scale(1.5')
  })

  it('leaves ordinary untransformed group markup unchanged', () => {
    const svg = render({ ...box, rotationDeg: 0, flipH: false })
    expect(svg).toContain('data-element-kind="group" transform="translate(100 60)"')
    expect(svg).not.toContain('matrix(')
  })

  it('keeps grouped text selectable and escaped as ordinary SVG text', () => {
    const text: ShapeRenderNode = {
      ...shape,
      type: 'text',
      text: {
        lines: [
          {
            top: 0,
            height: 16,
            runs: [
              {
                text: '中文 <b>& "plain"',
                x: 0,
                baselineY: 13,
                fontFamily: 'Arial',
                fontSizePx: 12,
                color: '#000000',
                bold: false,
                italic: false,
                underline: false,
                widthPx: 80,
              },
            ],
          },
        ],
        insets: { l: 0, t: 0, r: 0, b: 0 },
        anchor: 'top',
        fontScale: 1,
        contentHeight: 16,
        wrap: true,
      },
    }
    const group: GroupRenderNode = {
      id: 'group',
      sourceId: 'group',
      type: 'group',
      box,
      children: [text],
    }
    const slide: RenderSlide = {
      widthPx: 400,
      heightPx: 300,
      scale: 1,
      background: { kind: 'none' },
      nodes: [group],
    }
    const grouped = renderSlideToSvg(slide)
    const ordinary = renderSlideToSvg({ ...slide, nodes: [text] })
    expect(grouped.match(/<text\b[^>]*>[\s\S]*?<\/text>/g)).toEqual(
      ordinary.match(/<text\b[^>]*>[\s\S]*?<\/text>/g),
    )
    expect(grouped).toContain('中文 &lt;b&gt;&amp; "plain"')
    expect(grouped).not.toContain('<b>')
    expect(XMLValidator.validate(grouped)).toBe(true)
  })

  it.each(['identity', 'parent45-flip', 'nested', 'child37-flip', 'shear37'] as const)(
    'renders actual native %s fixture with once-baked child geometry',
    async (kind: GroupRenderFixture) => {
      const bytes = await pptxGroupRenderFixture(kind)
      const opened = await openPptx(bytes)
      const originalModel = JSON.stringify(opened.slides())
      const tree = buildRenderSlide(opened.slides()[0]!, opened.size, { fitWidthPx: 960 })
      const parent = tree.nodes.find((node) => node.type === 'group') as GroupRenderNode
      expect(parent).toBeDefined()
      // Native ext/chExt is 1.5 x 2: render tree has ALREADY baked that into boxes.
      expect(parent.childScaleX).toBeCloseTo(1.5, 10)
      expect(parent.childScaleY).toBeCloseTo(2, 10)
      const child = parent.children[0]!
      const nativePixelScale = (tree.scale * 96) / 914400
      const expectedChildWidth = kind === 'nested' ? 900000 * 2 : 400000 * 1.5
      const expectedChildHeight = kind === 'nested' ? 500000 * 1.5 : 200000 * 2
      expect(child.box.w).toBeCloseTo(expectedChildWidth * nativePixelScale, 8)
      expect(child.box.h).toBeCloseTo(expectedChildHeight * nativePixelScale, 8)
      const svg = renderSlideToSvg(tree)
      expect(XMLValidator.validate(svg)).toBe(true)
      expect(JSON.stringify(opened.slides())).toBe(originalModel)
      expect(child.type).toBe(kind === 'nested' ? 'group' : 'shape')
      const transformed = kind === 'parent45-flip' || kind === 'nested'
      const expectedTransform = transformed
        ? `matrix(${pptxGroupMatrix(parent.box)!
            .map((value) => Number(value.toPrecision(15)))
            .join(' ')})`
        : `translate(${Math.round(parent.box.x * 100) / 100} ${Math.round(parent.box.y * 100) / 100})`
      expect(svg).toContain(
        `data-element-id="${parent.sourceId}" data-element-kind="group" transform="${expectedTransform}"`,
      )
      expect(svg.match(/data-element-kind="group" transform="matrix/g) ?? []).toHaveLength(
        kind === 'nested' ? 2 : transformed ? 1 : 0,
      )
      // Keep a reproducible real native fixture and rendered SVG for root raster/browser gates.
      const directory = process.env.MIMIR_PPTX_GROUP_FIXTURE_DIR
      if (directory) {
        mkdirSync(directory, { recursive: true })
        writeFileSync(`${directory}/${kind}.pptx`, bytes)
        writeFileSync(`${directory}/${kind}.svg`, svg)
        writeFileSync(`${directory}/${kind}.json`, JSON.stringify(tree, null, 2))
      }
    },
  )
})

it('keeps ancestor scaling when rendering a native picture inside a nested group', async () => {
  const { pptxGroupCropFixture } = await import('./editors/pptx-group-crop-fixture.test-helper.js')
  const { resolvePptxGroupPicture } = await import('./pptx-picture-edit.js')
  const { composePptxMatrices } = await import('./pptx-group-placement.js')
  const { pptxPicturePlacement } = await import('./pptx-picture-placement.js')
  const fixture = await pptxGroupCropFixture()
  const deck = await openPptx(fixture.bytes)
  const slide = deck.slides()[0]!
  const { parent, picture } = resolvePptxGroupPicture(slide, fixture.target)
  const outer = {
    ...parent,
    id: 'outer-native-picture',
    transform: {
      offset: { x: 0, y: 0, cx: deck.size.cx, cy: deck.size.cy },
      rot: 0,
      flipH: false,
      flipV: false,
    },
    childOffset: { x: 0, y: 0, cx: deck.size.cx / 2, cy: deck.size.cy / 2 },
    children: [parent],
  }
  slide.elements = [outer]
  const tree = buildRenderSlide(slide, deck.size, { fitWidthPx: 960 })
  const svg = renderSlideToSvg(tree, '', slide)
  const inner = (tree.nodes[0] as GroupRenderNode).children[0] as GroupRenderNode
  const actual = composePptxMatrices(
    pptxGroupMatrix(tree.nodes[0]!.box)!,
    composePptxMatrices(pptxGroupMatrix(inner.box)!, matrixFromSvg(svg, picture.id)),
  )
  const native = pptxPicturePlacement(
    picture,
    {
      width: tree.widthPx,
      height: tree.heightPx,
      slideWidth: deck.size.cx,
      slideHeight: deck.size.cy,
    },
    parent,
  )!
  const renderedChild = inner.children.find((node) => node.sourceId === picture.id)!
  for (const point of [
    { x: 0, y: 0 },
    { x: renderedChild.box.w, y: renderedChild.box.h },
  ]) {
    const found = applyPptxMatrix(actual, point)
    const expected = applyPptxMatrix(native.matrix, {
      x: (point.x * native.box.w) / renderedChild.box.w,
      y: (point.y * native.box.h) / renderedChild.box.h,
    })
    expect(found.x).toBeCloseTo(expected.x * 2, 7)
    expect(found.y).toBeCloseTo(expected.y * 2, 7)
  }
})
