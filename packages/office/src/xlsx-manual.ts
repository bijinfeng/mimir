import type { XlsxSheet, XlsxCell } from './xlsx.js'
import {
  parseRange,
  formatAddress,
  rangeCellCount,
} from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  inferFlashFillTemplate,
  applyFlashFillTemplate,
} from '../vendor/packages/xlsx-gateway/src/domain/flash-fill.js'
const cellAt = (sheet: XlsxSheet, row: number, column: number) =>
  sheet.rows.find((r) => r.number === row + 1)?.cells[column]
// Inference uses values, never number/date display formatting.
const flashValue = (cell?: XlsxCell): string | number | boolean =>
  cell?.boolean !== undefined
    ? cell.boolean
    : cell?.numeric
      ? Number(cell.rawText ?? cell.text)
      : (cell?.text ?? '')

export function xlsxFlashFillRange(sheet: XlsxSheet, ref: string): string {
  const area = { ...parseRange(ref) }
  if (area.endRow >= 1048576 || area.endColumn >= 16384) throw new Error('填充范围超出工作表边界')
  if (area.startColumn !== area.endColumn || area.startColumn === 0)
    throw new Error('选择目标列的连续范围，左侧须有来源数据')
  if (area.startRow === area.endRow) {
    const limit = Math.min(1048576, area.startRow + 1000)
    for (let row = area.startRow; row < limit; row++) {
      if (String(flashValue(cellAt(sheet, row, area.startColumn - 1))) === '') break
      area.endRow = row
    }
  }
  if (area.startRow === area.endRow)
    throw new Error('需要至少两行连续来源数据，并包含一个已填示例和待填空格')
  if (rangeCellCount(area) > 2000) throw new Error('填充最多2000格')
  return `${formatAddress(area.startRow, area.startColumn)}:${formatAddress(area.endRow, area.endColumn)}`
}

export function xlsxFormatPaintRange(sourceRef: string, targetRef: string): string {
  const source = parseRange(sourceRef),
    target = { ...parseRange(targetRef) }
  if (target.startRow === target.endRow && target.startColumn === target.endColumn) {
    target.endRow += source.endRow - source.startRow
    target.endColumn += source.endColumn - source.startColumn
  }
  if (
    source.endRow >= 1048576 ||
    source.endColumn >= 16384 ||
    target.endRow >= 1048576 ||
    target.endColumn >= 16384
  )
    throw new Error('格式刷目标超出工作表边界')
  if (rangeCellCount(source) > 2000 || rangeCellCount(target) > 2000)
    throw new Error('格式刷最多2000格')
  return `${formatAddress(target.startRow, target.startColumn)}:${formatAddress(target.endRow, target.endColumn)}`
}

export function xlsxFillOperation(
  sheet: XlsxSheet,
  ref: string,
  mode: string,
): Record<string, unknown> {
  const area = parseRange(mode === 'flash' ? xlsxFlashFillRange(sheet, ref) : ref),
    { startRow: r1, endRow: r2, startColumn: c1, endColumn: c2 } = area
  if (rangeCellCount(area) > 2000) throw new Error('填充最多2000格')
  if (mode === 'flash') {
    const start = Math.max(0, c1 - 6),
      rows = Array.from({ length: r2 - r1 + 1 }, (_, n) => r1 + n)
    const source = (row: number) =>
      Array.from({ length: c1 - start }, (_, n) =>
        String(flashValue(cellAt(sheet, row, start + n))),
      )
    const examples = rows
      .filter((r) => String(flashValue(cellAt(sheet, r, c1))) !== '')
      .slice(0, 3)
      .map((r) => ({ source: source(r), output: String(flashValue(cellAt(sheet, r, c1))) }))
    const template = inferFlashFillTemplate(examples)
    if (!template) throw new Error('无法从示例推断拼接规则；请填写一个包含左侧列内容的示例')
    const values = rows.map((r) => {
      const current = cellAt(sheet, r, c1)
      if (current?.formulaText) return [current.formulaText]
      if (String(flashValue(current)) !== '') return [flashValue(current)]
      const fields = source(r)
      return [
        fields.every((value) => value.trim() === '')
          ? ''
          : applyFlashFillTemplate(template, fields),
      ]
    })
    if (
      !rows.some(
        (r) =>
          source(r).some((v) => v.trim() !== '') &&
          String(flashValue(cellAt(sheet, r, c1))) === '' &&
          !cellAt(sheet, r, c1)?.formula,
      )
    )
      throw new Error('所选范围没有待填空格')
    return { op: 'set_range', start: formatAddress(r1, c1), values }
  }
  if (mode === 'series') {
    if (r1 !== r2 && c1 !== c2) throw new Error('等差序列需选择单行或单列')
    const vertical = c1 === c2,
      count = vertical ? r2 - r1 + 1 : c2 - c1 + 1
    const first = cellAt(sheet, r1, c1),
      second = cellAt(sheet, r1 + (vertical ? 1 : 0), c1 + (vertical ? 0 : 1))
    if (count < 3 || !first?.numeric || !second?.numeric || first.formula || second.formula)
      throw new Error('前两格须为数字，后面至少选择一个待填格')
    const a = Number(first.rawText ?? first.text),
      step = Number(second.rawText ?? second.text) - a
    if (!Number.isFinite(a) || !Number.isFinite(step)) throw new Error('序列起点或步长无效')
    const values = Array.from({ length: count }, (_, n) => a + step * n)
    return {
      op: 'set_range',
      start: formatAddress(r1, c1),
      values: vertical ? values.map((n) => [n]) : [values],
    }
  }
  const vertical = mode === 'down' || mode === 'up'
  if (vertical ? r1 === r2 : c1 === c2) throw new Error('选择包含源格和目标格的完整范围')
  const sr = mode === 'up' ? r2 : r1,
    sc = mode === 'left' ? c2 : c1
  const source = vertical
    ? `${formatAddress(sr, c1)}:${formatAddress(sr, c2)}`
    : `${formatAddress(r1, sc)}:${formatAddress(r2, sc)}`
  const target =
    mode === 'down'
      ? `${formatAddress(r1 + 1, c1)}:${formatAddress(r2, c2)}`
      : mode === 'up'
        ? `${formatAddress(r1, c1)}:${formatAddress(r2 - 1, c2)}`
        : mode === 'right'
          ? `${formatAddress(r1, c1 + 1)}:${formatAddress(r2, c2)}`
          : `${formatAddress(r1, c1)}:${formatAddress(r2, c2 - 1)}`
  return { op: 'fill_range', source, target }
}

export function xlsxAutoSizes(
  sheet: XlsxSheet,
  ref: string,
  axis: 'rows' | 'columns',
  measure: (text: string, cell?: XlsxCell) => number,
) {
  const a = parseRange(ref),
    start = axis === 'rows' ? a.startRow : a.startColumn,
    end = axis === 'rows' ? a.endRow : a.endColumn
  if (end - start >= 500) throw new Error('自动适应每次最多500行或列')
  return Array.from({ length: end - start + 1 }, (_, n) => {
    const index = start + n
    let pixels = axis === 'rows' ? 24 : 48
    for (const row of sheet.rows) {
      if (axis === 'rows' && row.number !== index + 1) continue
      for (const cell of row.cells) {
        if (
          (axis === 'columns' && cell.col !== index) ||
          cell.covered ||
          cell.mergeRef ||
          !cell.text
        )
          continue
        const lineHeight = (((cell.format?.fontSize ?? 11) * 4) / 3) * 1.25
        if (axis === 'columns')
          pixels = Math.max(
            pixels,
            ...cell.text.split('\n').map((line) => measure(line, cell) + 12),
          )
        else {
          const width = sheet.columns.find((c) => c.col === cell.col)?.width ?? 80
          const lines = cell.text
            .split('\n')
            .reduce(
              (sum, line) =>
                sum +
                (cell.format?.wrapText
                  ? Math.max(1, Math.ceil(measure(line, cell) / Math.max(1, width - 12)))
                  : 1),
              0,
            )
          pixels = Math.max(pixels, lines * lineHeight + 8)
        }
      }
    }
    return { index, pixels: Math.min(axis === 'rows' ? 546 : 1790, Math.ceil(pixels)) }
  })
}
