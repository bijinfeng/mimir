/**
 * Browser adaptation of GenOffice native/xlsx-engine/src/table_styles.rs at
 * 480548fd55f1be3593ee0d8e316a734751d58309. Resolves real theme accents,
 * built-in families and custom dxf bands without modifying the source xfs.
 */
import { readXlsxFormats, type XlsxCellFormat } from './xlsx-format.js'
import { xlsxAttribute as attr } from './xlsx-sheet-features.js'
import { parseRange } from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type { XlsxCell, XlsxSheet } from './xlsx.js'
import type { XlsxTable } from './xlsx-visuals.js'

export type XlsxTableBands = Record<string, { format: XlsxCellFormat; size?: number }>
const ACCENTS = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47']
function themeColor(xml: string, key: string, fallback: string): string {
  const body =
    new RegExp(`<(?:\\w+:)?${key}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${key}>`).exec(xml)?.[1] ?? ''
  const color = attr(body, 'lastClr') ?? attr(body, 'val')
  return '#' + (color?.match(/^[0-9a-f]{6}$/i)?.[0] ?? fallback)
}
/** OOXML tint changes HSL luminance, matching the upstream native resolver. */
function tint(color: string, amount: number): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const high = Math.max(r, g, b),
    low = Math.min(r, g, b),
    difference = high - low
  let light = (high + low) / 2
  const saturation = difference === 0 ? 0 : difference / (1 - Math.abs(2 * light - 1))
  const hue =
    difference === 0
      ? 0
      : high === r
        ? ((g - b) / difference + (g < b ? 6 : 0)) / 6
        : high === g
          ? ((b - r) / difference + 2) / 6
          : ((r - g) / difference + 4) / 6
  light = amount < 0 ? light * (1 + amount) : light * (1 - amount) + amount
  const channel = (offset: number) => {
    const k = (offset + hue * 12) % 12
    return Math.round(
      255 *
        (light - saturation * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
    )
      .toString(16)
      .padStart(2, '0')
  }
  return ('#' + channel(0) + channel(8) + channel(4)).toUpperCase()
}
export function readXlsxTableBands(name: string, styles: string, theme: string): XlsxTableBands {
  if (!name) return {}
  const custom = [...styles.matchAll(/<tableStyle\b([^>]*)>([\s\S]*?)<\/tableStyle>/g)].find(
    (m) => attr(m[1]!, 'name') === name,
  )
  if (custom) {
    const dxfs = [
      ...(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/.exec(styles)?.[1] ?? '').matchAll(
        /<dxf\b[^>]*>([\s\S]*?)<\/dxf>/g,
      ),
    ]
    const bands: XlsxTableBands = {}
    for (const [tag] of custom[2]!.matchAll(/<tableStyleElement\b[^>]*>/g)) {
      const kind = attr(tag, 'type'),
        body = dxfs[Number(attr(tag, 'dxfId'))]?.[1]
      if (!kind || body === undefined) continue
      const part = (key: string) =>
        new RegExp(`<${key}\\b[^>]*>[\\s\\S]*?<\\/${key}>`).exec(body)?.[0] ?? `<${key}/>`
      const format =
        readXlsxFormats(
          `<styleSheet><fonts>${part('font')}</fonts><fills>${part('fill')}</fills><borders>${part('border')}</borders><cellXfs><xf fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`,
          theme,
        )[0] ?? {}
      bands[kind] = {
        format: {
          fillColor: format.fillColor,
          fontColor: format.fontColor,
          bold: /<b\b/.test(body) ? format.bold : undefined,
          italic: /<i\b/.test(body) ? format.italic : undefined,
          borders: format.borders,
        },
        size: Number(attr(tag, 'size') ?? 1),
      }
    }
    return bands
  }
  const match = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(name)
  if (!match) return {}
  const family = match[1]!,
    number = Number(match[2]),
    variant = Math.floor((number - 1) / 7),
    accentIndex = (number - 1) % 7
  if (number < 1 || number > ({ Light: 21, Medium: 28, Dark: 11 }[family] ?? 0)) return {}
  const dark = themeColor(theme, 'dk1', '000000'),
    accent = (index: number) => themeColor(theme, `accent${index}`, ACCENTS[index - 1]!)
  const base = accentIndex === 0 ? dark : accent(accentIndex),
    band = (color: string, amount: number) => tint(color, amount + (accentIndex === 0 ? 0.05 : 0))
  const bands: XlsxTableBands = {
    headerRow: { format: { bold: true } },
    totalRow: { format: { bold: true } },
  }
  const set = (key: string, format: XlsxCellFormat) => {
    bands[key] = { format: { ...bands[key]?.format, ...format } }
  }
  const rule = (color: string, style = '3px double') =>
    set('totalRow', { borders: { top: `${style} ${color}` } })
  if (family === 'Light' && variant !== 1) {
    set('headerRow', { fontColor: variant === 0 ? tint(base, -0.25) : dark })
    set('firstRowStripe', { fillColor: band(base, 0.8) })
    rule(base, variant === 0 ? '1px solid' : '3px double')
    if (variant === 0)
      set('wholeTable', { borders: { top: `1px solid ${base}`, bottom: `1px solid ${base}` } })
    else
      set('wholeTable', {
        borders: {
          top: `1px solid ${base}`,
          bottom: `1px solid ${base}`,
          left: `1px solid ${base}`,
          right: `1px solid ${base}`,
        },
      })
  } else if (family === 'Dark') {
    if (variant === 1) {
      const body = accentIndex === 0 ? dark : accent(2 * (number - 8) - 1),
        header = accentIndex === 0 ? dark : accent(2 * (number - 8))
      set('headerRow', { fillColor: header, fontColor: '#FFFFFF' })
      set('wholeTable', { fillColor: band(body, 0.8) })
      set('firstRowStripe', { fillColor: band(body, 0.6) })
      set('secondRowStripe', { fillColor: band(body, 0.8) })
      set('totalRow', { fillColor: band(body, 0.8) })
      rule(dark)
    } else {
      set('headerRow', { fillColor: dark, fontColor: '#FFFFFF' })
      set('wholeTable', {
        fillColor: accentIndex === 0 ? tint(dark, 0.45) : base,
        fontColor: '#FFFFFF',
      })
      set('firstRowStripe', { fillColor: tint(base, accentIndex === 0 ? 0.25 : -0.25) })
      set('totalRow', {
        fillColor: tint(base, accentIndex === 0 ? 0.15 : -0.5),
        fontColor: '#FFFFFF',
      })
    }
  } else {
    set('headerRow', {
      fillColor: family === 'Medium' && variant === 3 ? band(base, 0.8) : base,
      fontColor: family === 'Medium' && variant === 3 ? dark : '#FFFFFF',
    })
    if (family === 'Medium') {
      set('firstRowStripe', {
        fillColor:
          variant === 2 ? tint(dark, 0.85) : band(base, variant === 1 || variant === 3 ? 0.6 : 0.8),
      })
      if (variant === 1 || variant === 3) set('wholeTable', { fillColor: band(base, 0.8) })
      if (variant === 1) {
        set('secondRowStripe', { fillColor: band(base, 0.8) })
        set('totalRow', { fillColor: base, fontColor: '#FFFFFF' })
      } else {
        if (variant === 3) set('totalRow', { fillColor: band(base, 0.8) })
        rule(variant === 2 ? dark : base, variant === 3 ? '2px solid' : '3px double')
      }
    } else rule(base)
  }
  return bands
}

/** Style-only overlay. Direct cell fills and nonautomatic text colors win. */
export function xlsxTableCellFormat(
  table: XlsxTable,
  sheet: XlsxSheet,
  row: number,
  cell: XlsxCell,
): XlsxCellFormat | undefined {
  const b = parseRange(table.range),
    r = row - 1,
    c = cell.col
  if (r < b.startRow || r > b.endRow || c < b.startColumn || c > b.endColumn) return
  const bands = table.bands ?? {},
    headerRows = table.headerRows ?? 1,
    totals = table.totalRows ?? 0
  const output: XlsxCellFormat = {}
  const apply = (kind: string) => {
    const format = bands[kind]?.format
    if (!format) return
    for (const [key, value] of Object.entries(format))
      if (value !== undefined) Object.assign(output, { [key]: value })
  }
  apply('wholeTable')
  const stripe = (index: number, first: string, second: string) => {
    const a = bands[first]?.size ?? 1,
      z = bands[second]?.size ?? 1
    apply(index % (a + z) < a ? first : second)
  }
  if (table.bandedColumns) stripe(c - b.startColumn, 'firstColumnStripe', 'secondColumnStripe')
  if (table.bandedRows && r >= b.startRow + headerRows) {
    const index = table.filterActive
      ? sheet.rows.filter(
          (v) => !v.hidden && v.number - 1 >= b.startRow + headerRows && v.number < row,
        ).length
      : r - b.startRow - headerRows
    stripe(index, 'firstRowStripe', 'secondRowStripe')
  }
  if (table.firstColumn && c === b.startColumn) {
    apply('firstColumn')
    output.bold = true
  }
  if (table.lastColumn && c === b.endColumn) {
    apply('lastColumn')
    output.bold = true
  }
  if (r < b.startRow + headerRows) {
    apply('headerRow')
    if (table.firstColumn && c === b.startColumn) apply('firstHeaderCell')
    if (table.lastColumn && c === b.endColumn) apply('lastHeaderCell')
  } else if (r > b.endRow - totals) apply('totalRow')
  if (cell.format?.fillColor || cell.format?.fill?.spec) delete output.fillColor
  if (cell.format?.fontColor && cell.format.fontColor.toUpperCase() !== '#000000')
    delete output.fontColor
  if (output.borders) output.borders = { ...output.borders, ...cell.format?.borders }
  return output
}
