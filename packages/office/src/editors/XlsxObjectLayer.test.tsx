/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { readXlsx } from '../xlsx.js'
import { xlsxShapePreviewFixture } from '../xlsx-shape-preview-fixture.test-helper.js'
import { XlsxObjectLayer } from './XlsxObjectLayer.js'
import { XLSX_SHAPES, xlsxShapePreview } from './xlsx-shape-gallery.js'
import type { XlsxSheet } from '../xlsx.js'
import type { XlsxVisual } from '../xlsx-visuals.js'

const dispose: (() => void)[] = []
afterEach(() => dispose.splice(0).forEach((run) => run()))
const visual = (kind: string, index = 0): XlsxVisual => ({
  id: String(index),
  name: kind,
  kind: 'shape',
  drawingPath: 'xl/drawings/drawing1.xml',
  drawingIndex: index,
  shapeType: kind,
  fillColor: '4472C4',
  text: '原生文字',
  anchor: {
    fromColumn: 0,
    toColumn: 4,
    fromRow: 0,
    toRow: 8,
    fromColumnOffset: 0,
    toColumnOffset: 0,
    fromRowOffset: 0,
    toRowOffset: 0,
  },
})
function mount(visuals: XlsxVisual[]) {
  const host = document.createElement('div'),
    root = createRoot(host),
    select = vi.fn<(id: string) => void>()
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const sheet = { columns: [], rows: [], visuals } as unknown as XlsxSheet
  act(() => root.render(<XlsxObjectLayer sheet={sheet} selectedId="" onSelect={select} />))
  dispose.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, select }
}
it('renders every addable preset with the same geometry as the gallery and keeps canvas selection available', () => {
  const { host, select } = mount(XLSX_SHAPES.map((shape, index) => visual(shape.kind, index)))
  const buttons = host.querySelectorAll<HTMLButtonElement>('button')
  expect(buttons).toHaveLength(XLSX_SHAPES.length)
  for (const [index, shape] of XLSX_SHAPES.entries()) {
    const paths = xlsxShapePreview(shape.kind, 256, 160)!
    expect(
      [...buttons[index]!.querySelectorAll('path')].map((path) => path.getAttribute('d')),
    ).toEqual([paths.path, paths.fillPath, paths.strokePath].filter(Boolean))
  }
  act(() => buttons[0]!.click())
  expect(select).toHaveBeenCalledWith('0')
})
it('shows an explicit preview limit for unknown native geometry instead of drawing a rectangle', () => {
  const { host } = mount([visual('unknown-native-preset')])
  expect(host.textContent).toContain('形状预览有限')
  expect(host.textContent).toContain('原生文字')
  expect(host.querySelector('svg')).toBeNull()
})

it('renders real imported native frame/rotation/flips, adjusted geometry, gradient/line and rich paragraphs without a rectangle fallback', async () => {
  const fixture = await xlsxShapePreviewFixture(),
    sheet = (await readXlsx(fixture.bytes)).sheets[0]!,
    { host, select } = mount(sheet.visuals!)
  const buttons = host.querySelectorAll('button'),
    first = buttons[0]!,
    native = first.querySelector<HTMLElement>('.mimir-xlsx-native-shape')!
  expect(native.style.width).toBe('200px')
  expect(native.style.height).toBe('100px')
  expect(native.style.transform).toBe('rotate(37deg) scale(-1, 1)')
  expect(native.style.left).toBe('28px')
  const gradient = first.querySelector('linearGradient')!
  expect(Number(gradient.getAttribute('x1'))).toBeCloseTo(0.1464466094)
  expect(first.querySelectorAll('stop')).toHaveLength(2)
  expect(first.querySelector('stop')!.getAttribute('stop-color')).toBe('#186A7A')
  expect(first.querySelector('path')!.getAttribute('stroke')).toBe('#186A7A')
  expect(first.querySelector('path')!.getAttribute('stroke-width')).toBe('3')
  expect(first.querySelector('path')!.getAttribute('stroke-dasharray')).toBe('4 3 1 3')
  expect(first.querySelector('path')!.getAttribute('d')).toContain('M 40 0')
  const paragraphs = first.querySelectorAll<HTMLElement>('.mimir-xlsx-native-shape__paragraph')
  expect(paragraphs).toHaveLength(2)
  expect(paragraphs[0]!.textContent).toBe('旋转渐变')
  expect(paragraphs[0]!.querySelector<HTMLElement>('span')!.style.fontWeight).toBe('700')
  expect(paragraphs[1]!.style.textAlign).toBe('right')
  expect(buttons[1]!.querySelector('g')!.getAttribute('transform')).toContain('scale(')
  expect(buttons[1]!.querySelectorAll('path')).toHaveLength(2)
  expect(buttons[2]!.querySelector('path')!.getAttribute('fill')).toBe('none')
  expect(buttons[3]!.querySelector('path')!.getAttribute('fill')).toBe('#E4A24A')
  expect(buttons[4]!.querySelector('svg')).toBeNull()
  expect(buttons[4]!.textContent).toContain('形状预览有限')
  expect(buttons[5]!.querySelector<HTMLElement>('.mimir-xlsx-native-shape')!.style.transform).toBe(
    'rotate(90deg) scale(-1, 1)',
  )
  act(() => first.click())
  expect(select).toHaveBeenCalledWith(sheet.visuals![0]!.id)
  expect(sheet.visuals![0]!.shapePreview!.element!.fill!.type).toBe('gradient')
})
it('uses new flat text after a native edit rather than reviving stale rich paragraphs', async () => {
  const fixture = await xlsxShapePreviewFixture(),
    sheet = (await readXlsx(fixture.bytes)).sheets[0]!,
    item = { ...sheet.visuals![0]!, text: '新的文字' },
    { host } = mount([item])
  expect(host.querySelector('.mimir-xlsx-native-shape__text')!.textContent).toBe('新的文字')
  expect(host.querySelectorAll('.mimir-xlsx-native-shape__paragraph')).toHaveLength(1)
})

it('uses quadrant-swapped anchor dimensions when native rotation lacks a usable native ext frame', async () => {
  const fixture = await xlsxShapePreviewFixture(),
    sheet = (await readXlsx(fixture.bytes)).sheets[0]!,
    item = structuredClone(sheet.visuals![5]!)
  item.shapePreview!.element!.transform.offset.cx = 0
  item.shapePreview!.element!.transform.offset.cy = 0
  const { host } = mount([item]),
    frame = host.querySelector<HTMLElement>('.mimir-xlsx-native-shape')!
  expect(frame.style.width).toBe('140px')
  expect(frame.style.height).toBe('256px')
  expect(frame.style.left).toBe('58px')
  expect(frame.style.top).toBe('-58px')
})
