import { formatAddress } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { xlsxAttribute as attr } from '../../../../packages/office/src/xlsx-sheet-features.js'

/** Resolve base cellXfs references without flattening themes, rich runs or table/CF layers. */
export function xlsxRangeStyles(xml: string, cells: ReadonlyMap<string, string>) {
  const rows = new Map<number, string>()
  let previous = 0
  for (const [tag] of xml.matchAll(/<row\b[^>]*>/g)) {
    const declared = Number(attr(tag, 'r') ?? NaN)
    const row = Number.isInteger(declared) && declared > 0 ? declared : previous + 1
    previous = row
    const style = attr(tag, 's')
    if (style !== undefined && ['1', 'true'].includes(attr(tag, 'customFormat') ?? ''))
      rows.set(row - 1, style)
  }
  // GenOffice applies spans in file order: last styled span wins, while
  // width-only spans leave the previous default style intact.
  const columns = [...xml.matchAll(/<col\b[^>]*>/g)]
    .map(([tag]) => ({
      start: Number(attr(tag, 'min')) - 1,
      end: Number(attr(tag, 'max')) - 1,
      style: attr(tag, 'style'),
    }))
    .filter((column) => column.style !== undefined)
    .toReversed()
  return (row: number, column: number): string => {
    const cell = cells.get(formatAddress(row, column))?.match(/^<c\b[^>]*>/)?.[0] ?? ''
    return (
      attr(cell, 's') ??
      rows.get(row) ??
      columns.find((col) => column >= col.start && column <= col.end)?.style ??
      '0'
    )
  }
}

/** Explicit zero is required too: an absent s would inherit the destination row/column. */
export function materializeXlsxCellStyle(cell: string, style: string): string {
  if (!/^\d+$/.test(style)) throw new Error('源单元格样式索引无效')
  return cell.replace(/^<c\b[^>]*>/, (tag) =>
    attr(tag, 's') !== undefined
      ? tag
      : tag.replace(/\/?>(?![\s\S])/, (end) => ` s="${style}"${end}`),
  )
}
