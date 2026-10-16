import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { applyPptxManualShape } from '../services/pptx-manual-shape.js'
import {
  pptxManualShapeSchema,
  PPTX_INSERT_SHAPE_KINDS,
  type PptxManualShape,
} from '../../../../packages/shared/src/pptx-shape.js'
import { PPTX_SHAPES } from '../../../../packages/office/src/editors/pptx-shape-presets.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'

const original = new Uint8Array(
  readFileSync(
    new URL('../../../../packages/office/tests/fixtures/title-layout.pptx', import.meta.url),
  ),
)
const offset = { x: 914400, y: 457200, cx: 1828800, cy: 914400 }
const apply = (input: PptxManualShape, signal?: AbortSignal) =>
  applyPptxManualShape({
    documentId: 'shape',
    bytes: original,
    expectedVersion: 6,
    ops: [input],
    signal,
  })
it('inserts native geometry with one version, preserves unrelated entries and survives two saves', async () => {
  const result = await apply({ kind: 'hexagon', slide: 0, offset })
  expect(result.version).toBe(7)
  expect(result.changed).toBe(true)
  expect(result.records).toHaveLength(1)
  const session = await openPptxForEdit(result.bytes)
  const element = session.slides()[0]!.elements.at(-1)!
  expect(element.transform.offset).toEqual(offset)
  expect(element.type === 'text' || element.type === 'shape').toBe(true)
  if (element.type !== 'text' && element.type !== 'shape') throw new Error('Expected shape')
  expect(element.presetGeometry).toBe('hexagon')
  await session.save()
  session.commit()
  const second = await session.save()
  const before = await JSZip.loadAsync(original),
    after = await JSZip.loadAsync(second)
  for (const entryName of Object.keys(before.files).filter(
    (candidate) => !before.files[candidate]!.dir && candidate !== 'ppt/slides/slide1.xml',
  ))
    expect(await after.file(entryName)!.async('uint8array')).toEqual(
      await before.file(entryName)!.async('uint8array'),
    )
})
it.each(['line', 'lineArrow', 'lineArrowDouble', 'lineBent', 'lineCurved'] as const)(
  'retains left/up endpoint direction and native arrow ends for %s',
  async (kind) => {
    const result = await apply({ kind, slide: 0, offset, flipH: true, flipV: true })
    const session = await openPptxForEdit(result.bytes),
      element = session.slides()[0]!.elements.at(-1)!
    expect(result.version).toBe(7)
    expect(element.transform).toMatchObject({ offset, flipH: true, flipV: true })
    const xml = await (
      await JSZip.loadAsync(await session.save())
    )
      .file('ppt/slides/slide1.xml')!
      .async('string')
    expect(xml).toContain('flipH="1"')
    expect(xml).toContain('flipV="1"')
    expect(xml.includes('<a:tailEnd type="triangle"')).toBe(
      kind === 'lineArrow' || kind === 'lineArrowDouble',
    )
    expect(xml.includes('<a:headEnd type="triangle"')).toBe(kind === 'lineArrowDouble')
  },
)
it('accepts exact horizontal and vertical connectors without inventing a diagonal', async () => {
  for (const geometry of [
    { ...offset, cx: 0 },
    { ...offset, cy: 0 },
  ]) {
    const result = await apply({ kind: 'lineArrow', slide: 0, offset: geometry })
    expect(
      (await openPptxForEdit(result.bytes)).slides()[0]!.elements.at(-1)!.transform.offset,
    ).toEqual(geometry)
  }
})
it('restricts the manual surface to the fixed gallery and rejects XML/IDs, degenerate sizes, missing slide and cancellation', async () => {
  expect(PPTX_INSERT_SHAPE_KINDS).toEqual(PPTX_SHAPES.map((item) => item.kind))
  const input = { kind: 'rect', slide: 0, offset }
  for (const bad of [
    { ...input, xml: '<p:sp/>' },
    { ...input, elementId: 'x' },
    { ...input, kind: 'textbox' },
    { ...input, flipH: true },
    { ...input, offset: { ...offset, cy: 0 } },
    { ...input, offset: { ...offset, x: Infinity } },
    { ...input, kind: 'line', offset: { ...offset, cx: 0, cy: 0 } },
  ])
    expect(pptxManualShapeSchema.safeParse(bad).success).toBe(false)
  await expect(apply({ kind: 'rect', slide: 99, offset })).rejects.toThrow('页面已失效')
  const controller = new AbortController()
  controller.abort()
  await expect(apply({ kind: 'rect', slide: 0, offset }, controller.signal)).rejects.toThrow('取消')
  const before = original.slice()
  expect(original).toEqual(before)
})
