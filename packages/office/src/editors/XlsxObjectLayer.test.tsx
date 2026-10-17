/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
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
