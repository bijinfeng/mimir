import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openPptx, savePptx, elementDurableId } from '../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from './pptx.js'
import { renderSlide } from './pptx-render.js'
import { capturePptxBrush, pptxBrushOps } from './pptx-format-brush.js'
import { removeBackground } from '../vendor/apps/slides/src/renderer/cutout.js'
const load = () =>
  new Uint8Array(readFileSync(new URL('../tests/fixtures/title-layout.pptx', import.meta.url)))
describe('PPTX local picture and format tools', () => {
  it('transfers solid fill, stroke and fonts while preserving target text across two saves', async () => {
    const opened = await openPptx(load())
    const a = opened.deck.slides[0]!.elements[0]!,
      b = opened.deck.slides[0]!.elements[1]!
    const init = runTxn(opened, {
      isolation: 'atomic',
      ops: [
        { op: 'setFill', target: { slide: 0, el: elementDurableId(a)! }, fill: '#DC2626' },
        {
          op: 'setStroke',
          target: { slide: 0, el: elementDurableId(a)! },
          stroke: { color: '#16A34A', widthEmu: 25400 },
        },
      ],
    })
    expect(init.applied).toBe(true)
    const session = await openPptxForEdit(await savePptx(opened))
    const node = renderSlide(session.view(), 0, { fitWidthPx: 960 })!.tree.nodes[0]!
    const brush = capturePptxBrush(node)!
    expect(brush.fill).toBe('#DC2626')
    const before =
      b.type === 'text' || b.type === 'shape'
        ? b.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
        : ''
    expect(
      runTxn(opened, { isolation: 'atomic', ops: pptxBrushOps(brush, b, 0) as Op[] }).applied,
    ).toBe(true)
    const second = await openPptx(await savePptx(opened))
    const target = second.deck.slides[0]!.elements[1]!
    expect(target).toMatchObject({
      fill: { type: 'solid', color: '#DC2626' },
      stroke: { fill: { type: 'solid', color: '#16A34A' }, width: 25400 },
    })
    expect(
      target.type === 'text' || target.type === 'shape'
        ? target.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
        : '',
    ).toBe(before)
  })
  it('removes only edge-connected background, leaving enclosed matching foreground pixels intact', () => {
    const data = new Uint8ClampedArray(5 * 5 * 4)
    for (let i = 0; i < 25; i++) {
      data.set([255, 255, 255, 255], i * 4)
    }
    for (const i of [6, 7, 8, 11, 13, 16, 17, 18]) data.set([0, 0, 0, 255], i * 4)
    const result = removeBackground({ data, width: 5, height: 5 }, 10)
    expect(result.data[3]).toBe(0)
    expect(result.data[12 * 4 + 3]).toBe(255)
    expect(result.data[6 * 4 + 3]).toBe(255)
    expect(data[3]).toBe(255)
  })
  it('restores source font points at different slide widths and render resolutions', async () => {
    const session = await openPptxForEdit(load())
    const deck = session.view()
    for (const widthInches of [10, 13.333333]) {
      const size = { ...deck.size, cx: Math.round(widthInches * 914400) }
      for (const widthPx of [480, 960, 1920]) {
        const rendered = renderSlide({ ...deck, size }, 0, { fitWidthPx: widthPx })!
        const brush = capturePptxBrush(rendered.tree.nodes[0]!, size.cx / 12700 / rendered.widthPx)!
        const original = deck.slides()[0]!.elements[0]!
        const fontSize =
          original.type === 'text' || original.type === 'shape'
            ? original.text?.paragraphs[0]?.runs[0]?.fontSize
            : undefined
        expect(fontSize).toBeGreaterThan(0)
        expect(brush.font?.fontSize).toBeCloseTo(fontSize!, 1)
      }
    }
  })
})
