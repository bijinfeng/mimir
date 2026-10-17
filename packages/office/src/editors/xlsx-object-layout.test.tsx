/** @vitest-environment happy-dom */
import { act } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { XlsxObjectLayer } from './XlsxObjectLayer.js'
import { measureXlsxGrid, sameXlsxGridMetrics, xlsxVisualBox } from './xlsx-object-layout.js'
import type { XlsxSheet } from '../xlsx.js'
import type { XlsxVisual } from '../xlsx-visuals.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((run) => run())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const shape: XlsxVisual = {
  id: 'heart',
  name: 'Heart',
  kind: 'shape',
  shapeType: 'heart',
  drawingIndex: 0,
  drawingPath: 'xl/drawings/drawing1.xml',
  anchor: {
    fromColumn: 3,
    fromRow: 9,
    toColumn: 7,
    toRow: 17,
    fromColumnOffset: 0,
    fromRowOffset: 0,
    toColumnOffset: 0,
    toRowOffset: 0,
  },
}
function workbookSheet(): XlsxSheet {
  return {
    id: 'sheet-1',
    name: 'Sheet1',
    entry: 'xl/worksheets/sheet1.xml',
    columns: Array.from({ length: 8 }, (_, col) => ({ col, width: 64 })),
    rows: Array.from({ length: 18 }, (_, index) => ({ number: index + 1, height: 20, cells: [] })),
    visuals: [structuredClone(shape)],
  }
}
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }
}
function grid(sheet: XlsxSheet, zoom = 1) {
  const stage = document.createElement('div'),
    table = document.createElement('table')
  stage.style.zoom = String(zoom)
  table.className = 'mimir-xlsx'
  table.innerHTML = `<colgroup><col>${sheet.columns
    .filter((c) => !c.hidden)
    .map(() => '<col>')
    .join('')}</colgroup><tbody>${sheet.rows
    .filter((r) => !r.hidden)
    .map(() => '<tr><td rowspan="2" colspan="2">Merged content</td></tr>')
    .join('')}</tbody>`
  stage.append(table)
  document.body.append(stage)
  cleanup.push(() => stage.remove())
  const columns = sheet.columns
      .filter((c) => !c.hidden)
      .map((c) => ({ index: c.col, size: c.width })),
    rows = sheet.rows
      .filter((r) => !r.hidden)
      .map((r, index) => ({ index: r.number - 1, size: index === 0 ? 32 : 28.046875 }))
  let originLeft = 153,
    originTop = 161.40625
  const measureRect = (node: Element): DOMRect => {
    const scale = Number(stage.style.zoom),
      origin = rect(originLeft, originTop, 546 * scale, 600 * scale)
    if (node === stage || node === table) return origin
    const columnIndex = [...table.querySelectorAll('col')].indexOf(node as HTMLTableColElement) - 1
    if (columnIndex >= 0)
      return rect(
        originLeft +
          (34 + columns.slice(0, columnIndex).reduce((sum, c) => sum + c.size, 0)) * scale,
        originTop,
        columns[columnIndex]!.size * scale,
        600 * scale,
      )
    const rowIndex = [...table.querySelectorAll('tbody > tr')].indexOf(node as HTMLTableRowElement)
    if (rowIndex >= 0)
      return rect(
        originLeft,
        originTop + (27 + rows.slice(0, rowIndex).reduce((sum, r) => sum + r.size, 0)) * scale,
        546 * scale,
        rows[rowIndex]!.size * scale,
      )
    return rect(9999, 9999, 9999, 9999)
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return measureRect(this)
  })
  return {
    stage,
    table,
    columns,
    rows,
    scroll: () => {
      originLeft -= 40
      originTop -= 80
    },
  }
}

it('places D10 on the rendered row boundary, including the taller first row and cell line height', () => {
  const sheet = workbookSheet(),
    { stage, table } = grid(sheet),
    before = structuredClone(sheet)
  const measured = measureXlsxGrid(stage, table, sheet)
  expect(measured).not.toBeNull()
  const box = xlsxVisualBox(sheet, shape, measured)
  expect(box).toEqual({ left: 226, top: 283.375, width: 256, height: 224.375 })
  expect(sheet).toEqual(before)
})

it.each([0.75, 1, 1.5])(
  'keeps native EMU offsets and track positions stable at zoom %s and after scrolling',
  (zoom) => {
    const sheet = workbookSheet(),
      { stage, table, scroll } = grid(sheet, zoom),
      visual = structuredClone(shape)
    visual.anchor = { ...visual.anchor, fromColumnOffset: 9525 * 2.5, fromRowOffset: 9525 * 1.25 }
    const before = xlsxVisualBox(sheet, visual, measureXlsxGrid(stage, table, sheet))
    expect(before.left).toBeCloseTo(228.5)
    expect(before.top).toBeCloseTo(284.625)
    scroll()
    expect(xlsxVisualBox(sheet, visual, measureXlsxGrid(stage, table, sheet))).toEqual(before)
  },
)

it('uses native indices across hidden/sparse tracks and real custom sizes without measuring merged cells', () => {
  const sheet = workbookSheet()
  sheet.columns = [
    { col: 0, width: 90 },
    { col: 1, width: 64, hidden: true },
    { col: 2, width: 123 },
    { col: 3, width: 57 },
  ]
  sheet.rows = [
    { number: 1, height: 32, cells: [] },
    { number: 2, height: 20, hidden: true, cells: [] },
    { number: 3, height: 48, cells: [] },
    { number: 5, height: 50, cells: [] },
  ]
  const { stage, table, rows } = grid(sheet)
  rows[1]!.size = 48
  rows[2]!.size = 50
  const measured = measureXlsxGrid(stage, table, sheet),
    visual = structuredClone(shape)
  visual.anchor = { ...visual.anchor, fromColumn: 1, toColumn: 3, fromRow: 1, toRow: 4 }
  expect(xlsxVisualBox(sheet, visual, measured)).toEqual({
    left: 124,
    top: 59,
    width: 123,
    height: 48,
  })
  expect(measured?.rows.map((row) => row.index)).toEqual([0, 2, 4])
  visual.anchor = { ...visual.anchor, fromColumn: 1, toColumn: 2, fromRow: 1, toRow: 2 }
  expect(xlsxVisualBox(sheet, visual, measured)).toEqual({
    left: 124,
    top: 59,
    width: 0,
    height: 0,
  })
})

it('falls back only when DOM layout is unavailable and ignores subpixel observer noise', () => {
  const sheet = workbookSheet(),
    { stage, table } = grid(sheet)
  const metrics = measureXlsxGrid(stage, table, sheet)!
  expect(sameXlsxGridMetrics(metrics, structuredClone(metrics))).toBe(true)
  const noisy = structuredClone(metrics)
  noisy.rows[0]!.start += 0.00001
  expect(sameXlsxGridMetrics(metrics, noisy)).toBe(true)
  noisy.rows[0]!.size += 1
  expect(sameXlsxGridMetrics(metrics, noisy)).toBe(false)
  vi.spyOn(table, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 0, 0))
  expect(measureXlsxGrid(stage, table, sheet)).toBeNull()
  expect(xlsxVisualBox(sheet, shape).top).toBe(204)
})

it('remeasures the mounted object when a track changes, zoom changes, and releases observers', async () => {
  const sheet = workbookSheet(),
    { stage, table, rows, columns } = grid(sheet),
    root = createRoot(document.createElement('div')),
    callbacks: ResizeObserverCallback[] = [],
    disconnect = vi.fn<() => void>(),
    observe = vi.fn<(element: Element) => void>()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }
      observe = observe
      disconnect = disconnect
    },
  )
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() =>
    root.render(
      createPortal(<XlsxObjectLayer sheet={sheet} selectedId="" onSelect={() => {}} />, stage),
    ),
  )
  const button = stage.querySelector<HTMLButtonElement>('button')!
  expect(button.style.top).toBe('283.375px')
  expect(observe).toHaveBeenCalledWith(table.querySelector('tbody > tr'))
  rows[0]!.size = 60
  columns[0]!.size = 100
  act(() => callbacks[0]!([], {} as ResizeObserver))
  expect(button.style.top).toBe('311.375px')
  expect(button.style.left).toBe('262px')
  await act(async () => {
    rows[1]!.size += 10
    stage.style.zoom = '1.5'
    await Promise.resolve()
  })
  expect(button.style.top).toBe('321.375px')
  expect(button.style.left).toBe('262px')
  act(() => root.unmount())
  expect(disconnect).toHaveBeenCalledOnce()
})
