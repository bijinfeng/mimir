import * as numfmt from 'numfmt'
import {
  readXlsxFillViews,
  readXlsxThemePalette,
  resolveStyleColor,
  type XlsxFillView,
} from './xlsx-fill.js'

export interface XlsxCellFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  fontFamily?: string
  fontSize?: number
  fontColor?: string
  fillColor?: string
  fill?: XlsxFillView
  horizontalAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  wrapText?: boolean
  numberFormat?: string
  indent?: number
  textRotation?: number | 'vertical'
  borders?: Partial<Record<'top' | 'bottom' | 'left' | 'right', string>>
}

export function decodeXlsxXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
function attr(xml: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(xml)?.[1]
}
function elements(xml: string, tag: string): string[] {
  return [
    ...xml.matchAll(new RegExp(`<${tag}\\b[^>]*?\\/>|<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g')),
  ].map(([value]) => value)
}
function section(xml: string, tag: string): string {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(xml)?.[1] ?? ''
}
const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'm/d/yy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'm/d/yy h:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mmss.0',
  48: '##0.0E+0',
  49: '@',
}

/** Resolve style IDs through cellXfs, including theme colors and numeric formats. */
export function readXlsxFormats(xml: string | null, themeXml: string | null): XlsxCellFormat[] {
  if (!xml) return []
  const colors = [
    'lt1',
    'dk1',
    'lt2',
    'dk2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hlink',
    'folHlink',
  ].map((name) => {
    const part = new RegExp(`<a:${name}>([\\s\\S]*?)<\\/a:${name}>`).exec(themeXml ?? '')?.[1] ?? ''
    return attr(part, 'val')?.match(/^[0-9a-f]{6}$/i)?.[0] ?? attr(part, 'lastClr')
  })
  const color = (part: string): string | undefined => {
    let rgb = attr(part, 'rgb')?.slice(-6)
    const theme = attr(part, 'theme')
    if (!rgb && theme !== undefined) rgb = colors[Number(theme)]
    if (!rgb || !/^[0-9a-f]{6}$/i.test(rgb)) return undefined
    const tint = Number(attr(part, 'tint') ?? 0)
    return (
      '#' +
      rgb
        .match(/../g)!
        .map((value) => {
          const n = parseInt(value, 16)
          return Math.round(tint < 0 ? n * (1 + tint) : n * (1 - tint) + 255 * tint)
            .toString(16)
            .padStart(2, '0')
        })
        .join('')
        .toUpperCase()
    )
  }
  const enabled = (font: string, tag: string) => {
    const mark = elements(font, tag)[0]
    return mark !== undefined && !['0', 'false', 'off', 'none'].includes(attr(mark, 'val') ?? '')
  }
  const fonts = elements(section(xml, 'fonts'), 'font')
  const fills = readXlsxFillViews(xml)
  const palette = readXlsxThemePalette(themeXml)
  const borders = elements(section(xml, 'borders'), 'border')
  const formats = { ...BUILTIN_FORMATS }
  for (const part of elements(section(xml, 'numFmts'), 'numFmt')) {
    const code = attr(part, 'formatCode')
    if (code !== undefined) formats[Number(attr(part, 'numFmtId'))] = decodeXlsxXml(code)
  }
  return elements(section(xml, 'cellXfs'), 'xf').map((xf, index) => {
    const font = fonts[Number(attr(xf, 'fontId') ?? 0)] ?? ''
    const fill = fills[index]
    const border = borders[Number(attr(xf, 'borderId') ?? 0)] ?? ''
    const alignment = elements(xf, 'alignment')[0] ?? ''
    const horizontal = attr(alignment, 'horizontal')
    const vertical = attr(alignment, 'vertical')
    const fontSize = Number(attr(elements(font, 'sz')[0] ?? '', 'val'))
    const rotation = Number(attr(alignment, 'textRotation') ?? 0)
    const edges: XlsxCellFormat['borders'] = {}
    for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
      const part = elements(border, edge)[0] ?? ''
      const style = attr(part, 'style')
      if (style && style !== 'none')
        edges[edge] =
          `${style === 'double' ? '3px double' : style === 'thick' ? '3px solid' : style === 'medium' ? '2px solid' : /dash/i.test(style) ? '1px dashed' : style === 'dotted' ? '1px dotted' : '1px solid'} ${color(elements(part, 'color')[0] ?? '') ?? '#000000'}`
    }
    return {
      bold: enabled(font, 'b'),
      italic: enabled(font, 'i'),
      underline: enabled(font, 'u'),
      strikethrough: enabled(font, 'strike'),
      fontFamily: decodeXlsxXml(attr(elements(font, 'name')[0] ?? '', 'val') ?? '') || undefined,
      fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : undefined,
      fontColor: color(elements(font, 'color')[0] ?? ''),
      fill,
      fillColor:
        fill?.spec && 'pattern' in fill.spec && fill.spec.pattern === 'solid'
          ? resolveStyleColor(fill.spec.fg, palette)
          : undefined,
      horizontalAlign: ['left', 'center', 'right'].includes(horizontal ?? '')
        ? (horizontal as XlsxCellFormat['horizontalAlign'])
        : undefined,
      verticalAlign: ['top', 'center', 'bottom'].includes(vertical ?? '')
        ? (vertical as XlsxCellFormat['verticalAlign'])
        : undefined,
      wrapText: ['1', 'true'].includes(attr(alignment, 'wrapText') ?? ''),
      indent: Number(attr(alignment, 'indent') ?? 0),
      textRotation: rotation === 255 ? 'vertical' : rotation > 90 ? 90 - rotation : rotation,
      numberFormat: formats[Number(attr(xf, 'numFmtId') ?? 0)],
      borders: edges,
    }
  })
}
/** Pick a numeric section before epoch conversion, so conditions keep their original meaning. */
function numericFormatSection(format: string, value: number): string | undefined {
  const sections: ReturnType<typeof numfmt.tokenize>[] = [[]]
  for (const token of numfmt.tokenize(format)) {
    if (token.type === 'break') sections.push([])
    else sections.at(-1)!.push(token)
  }
  const numeric = sections.slice(0, 3)
  if (!numeric.some((part) => part.some((token) => token.type === 'condition'))) {
    return (numeric[value < 0 ? 1 : value === 0 ? 2 : 0] ?? numeric[0])
      ?.map((token) => token.raw)
      .join('')
  }
  const selected = numeric.find((part, index) => {
    const condition = part.find((token) => token.type === 'condition')
    if (!condition) return index !== 0 || value > 0
    const match = /^\[(<[=>]?|>=?|=)\s*(-?[.\d]+)\]$/.exec(condition.raw)
    if (!match) return false
    const operand = Number(match[2])
    switch (match[1]) {
      case '>':
        return value > operand
      case '>=':
        return value >= operand
      case '<':
        return value < operand
      case '<=':
        return value <= operand
      case '=':
        return value === operand
      case '<>':
        return value !== operand
      default:
        return false
    }
  })
  return selected
    ?.filter((token) => token.type !== 'condition')
    .map((token) => token.raw)
    .join('')
}

export function formatXlsxNumber(value: string, format?: string, date1904 = false): string {
  if (!format || format === 'General' || !value || !Number.isFinite(Number(value))) return value
  if (date1904) {
    const pattern = numericFormatSection(format, Number(value))
    if (pattern) {
      const date = numfmt.getFormatDateInfo(pattern)
      // numfmt 3.2 has no public epoch option. Only calendar dates need the
      // documented 1462-day offset; time-of-day and elapsed durations do not.
      if (date.year || date.month || date.day)
        return numfmt.format(pattern, Number(value) + 1462, { throws: false })
    }
  }
  return numfmt.format(format, Number(value), { throws: false })
}
