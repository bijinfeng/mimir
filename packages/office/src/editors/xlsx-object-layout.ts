import type { XlsxSheet } from '../xlsx.js'
import type { XlsxVisual } from '../xlsx-visuals.js'

export interface XlsxGridTrack {
  /** Native zero-based row/column index, independent of hidden or omitted tracks. */
  index: number
  start: number
  size: number
}
export interface XlsxGridMetrics {
  columns: XlsxGridTrack[]
  rows: XlsxGridTrack[]
}
/** Read normal-flow tracks, never sticky headers or merged cell rectangles. */
export function measureXlsxGrid(
  stage: HTMLElement,
  table: HTMLTableElement,
  sheet: XlsxSheet,
): XlsxGridMetrics | null {
  if (table.getBoundingClientRect().width <= 0) return null
  const origin = stage.getBoundingClientRect(),
    zoom = getComputedStyle(stage).zoom || stage.style.zoom || '1',
    scale = zoom.endsWith('%') ? parseFloat(zoom) / 100 : Number(zoom),
    unit = Number.isFinite(scale) && scale > 0 ? scale : 1,
    columns = sheet.columns.filter((column) => !column.hidden),
    rows = sheet.rows.filter((row) => !row.hidden),
    renderedColumns = table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'),
    renderedRows = table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr')
  if (renderedColumns.length !== columns.length + 1 || renderedRows.length !== rows.length)
    return null
  return {
    columns: columns.map((column, index) => {
      const box = renderedColumns[index + 1]!.getBoundingClientRect()
      return { index: column.col, start: (box.left - origin.left) / unit, size: box.width / unit }
    }),
    rows: rows.map((row, index) => {
      const box = renderedRows[index]!.getBoundingClientRect()
      return {
        index: row.number - 1,
        start: (box.top - origin.top) / unit,
        size: box.height / unit,
      }
    }),
  }
}
export function sameXlsxGridMetrics(before: XlsxGridMetrics | null, after: XlsxGridMetrics | null) {
  if (!before || !after) return before === after
  return (['columns', 'rows'] as const).every(
    (axis) =>
      before[axis].length === after[axis].length &&
      before[axis].every((track, index) => {
        const next = after[axis][index]!
        return (
          track.index === next.index &&
          Math.abs(track.start - next.start) < 0.0001 &&
          Math.abs(track.size - next.size) < 0.0001
        )
      }),
  )
}
function trackPosition(tracks: XlsxGridTrack[], index: number, offset: number) {
  const next = tracks.find((track) => track.index >= index),
    last = tracks.at(-1)
  // A hidden or unmaterialized native track has no visible extent in this grid.
  return (next?.start ?? (last ? last.start + last.size : 0)) + offset / 9525
}
export function xlsxVisualBox(
  sheet: XlsxSheet,
  visual: XlsxVisual,
  measured?: XlsxGridMetrics | null,
) {
  const anchor = visual.anchor
  const x = measured
    ? (column: number, offset: number) => trackPosition(measured.columns, column, offset)
    : (column: number, offset: number) =>
        34 +
        Array.from({ length: Math.min(column, 200) }, (_, c) =>
          sheet.columns.find((item) => item.col === c),
        ).reduce((sum, item) => sum + (item?.hidden ? 0 : (item?.width ?? 64)), 0) +
        offset / 9525
  const y = measured
    ? (row: number, offset: number) => trackPosition(measured.rows, row, offset)
    : (row: number, offset: number) =>
        24 +
        Array.from({ length: Math.min(row, 1000) }, (_, r) =>
          sheet.rows.find((item) => item.number === r + 1),
        ).reduce((sum, item) => sum + (item?.hidden ? 0 : (item?.height ?? 20)), 0) +
        offset / 9525
  const left = x(anchor.fromColumn, anchor.fromColumnOffset),
    top = y(anchor.fromRow, anchor.fromRowOffset)
  return {
    left,
    top,
    width: Math.max(measured ? 0 : 24, x(anchor.toColumn, anchor.toColumnOffset) - left),
    height: Math.max(measured ? 0 : 24, y(anchor.toRow, anchor.toRowOffset) - top),
  }
}
