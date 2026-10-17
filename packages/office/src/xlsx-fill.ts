/** Fill reader/preview adapted to GenOffice 480548fd55f1be3593ee0d8e316a734751d58309.
 * Native theme references remain data; CSS is derived only at the display edge. */
import {
  DEFAULT_THEME_PALETTE,
  PATTERN_TYPES,
  THEME_SLOT_NAMES,
  resolveStyleColor,
  type FillSpec,
  type StyleColor,
} from '../vendor/packages/xlsx-gateway/src/domain/style-color.js'
export { DEFAULT_THEME_PALETTE, PATTERN_TYPES, THEME_SLOT_NAMES, resolveStyleColor }
export type { FillSpec, StyleColor }
export interface XlsxFillView {
  spec: FillSpec | null
  source: 'direct' | 'inherited'
  unsupported?: string
}
export const XLSX_PATTERN_NAMES = [
  '纯色',
  '中灰网点',
  '深灰网点',
  '浅灰网点',
  '12.5% 灰点',
  '6.25% 灰点',
  '深色横线',
  '深色竖线',
  '深色下斜线',
  '深色上斜线',
  '深色网格',
  '深色斜网格',
  '浅色横线',
  '浅色竖线',
  '浅色下斜线',
  '浅色上斜线',
  '浅色网格',
  '浅色斜网格',
]
const attr = (xml: string, key: string) => new RegExp(`\\b${key}=["']([^"']*)["']`).exec(xml)?.[1]
const section = (xml: string, name: string) =>
  new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? ''
const tags = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}\\b[^>]*?(?:/>|>[\\s\\S]*?</${name}>)`, 'g'))].map(
    ([tag]) => tag,
  )
export function readXlsxThemePalette(xml: string | null): string[] {
  return THEME_SLOT_NAMES.map((name, index) => {
    const part =
      new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(
        xml ?? '',
      )?.[1] ?? ''
    const value = attr(part, 'lastClr') ?? attr(part, 'val')
    return value && /^[a-f\d]{6}$/i.test(value)
      ? `#${value.toUpperCase()}`
      : DEFAULT_THEME_PALETTE[index]!
  })
}
function readColor(xml: string): StyleColor | undefined {
  const rgb = attr(xml, 'rgb'),
    theme = attr(xml, 'theme'),
    tint = Number(attr(xml, 'tint') ?? 0)
  if (!Number.isFinite(tint) || tint < -1 || tint > 1) return undefined
  // The native DSL can retain tint only on theme references. Treat an RGB tint
  // as unsupported instead of presenting its untinted value as the original.
  if (rgb && /^(?:[a-f\d]{2})?[a-f\d]{6}$/i.test(rgb))
    return tint === 0 ? `#${rgb.slice(-6).toUpperCase()}` : undefined
  if (theme !== undefined && /^\d+$/.test(theme) && Number(theme) <= 11)
    return { theme: Number(theme), ...(tint ? { tint } : {}) }
  return undefined
}
function readFill(xml: string): Pick<XlsxFillView, 'spec' | 'unsupported'> {
  const gradient = tags(xml, 'gradientFill')[0]
  if (gradient) {
    const type = attr(gradient, 'type') ?? 'linear'
    const stops = tags(gradient, 'stop').map((stop) => ({
      position: Number(attr(stop, 'position')),
      color: readColor(tags(stop, 'color')[0] ?? ''),
    }))
    if (
      !['linear', 'path'].includes(type) ||
      stops.length < 2 ||
      stops.length > 10 ||
      stops.some(
        (s) => !s.color || !Number.isFinite(s.position) || s.position < 0 || s.position > 1,
      )
    )
      return { spec: null, unsupported: '原件渐变包含暂不可编辑的色型或参数' }
    const params: Record<string, number> = {}
    for (const key of type === 'path' ? ['left', 'right', 'top', 'bottom'] : ['degree']) {
      const value = attr(gradient, key)
      if (value === undefined) continue
      const number = Number(value)
      if (!Number.isFinite(number) || number < 0 || number > (key === 'degree' ? 360 : 1))
        return { spec: null, unsupported: '原件渐变参数超出可编辑范围' }
      params[key === 'degree' ? 'angle' : key] = number
    }
    return {
      spec: {
        gradient: {
          type: type as 'linear' | 'path',
          ...params,
          stops: stops.map((s) => ({ position: s.position, color: s.color! })),
        },
      },
    }
  }
  const pattern = tags(xml, 'patternFill')[0] ?? '',
    kind = attr(pattern, 'patternType') ?? 'none'
  if (kind === 'none') return { spec: null }
  const foreground = tags(pattern, 'fgColor')[0],
    background = tags(pattern, 'bgColor')[0]
  const fg = foreground ? readColor(foreground) : '#000000',
    bg = background ? readColor(background) : undefined
  // Indexed 64 is the standard automatic pattern background (transparent/white).
  const autoBackground = background && ['64', '65'].includes(attr(background, 'indexed') ?? '')
  if (
    !PATTERN_TYPES.includes(kind as (typeof PATTERN_TYPES)[number]) ||
    !fg ||
    (background && !bg && !autoBackground)
  )
    return { spec: null, unsupported: '原件使用索引色、自动色或未知图案；应用新填充会替换它' }
  return { spec: { pattern: kind as (typeof PATTERN_TYPES)[number], fg, ...(bg ? { bg } : {}) } }
}
export function readXlsxFillViews(xml: string): XlsxFillView[] {
  const fills = tags(section(xml, 'fills'), 'fill'),
    parents = tags(section(xml, 'cellStyleXfs'), 'xf')
  return tags(section(xml, 'cellXfs'), 'xf').map((xf) => {
    const inherited =
      ['0', 'false'].includes(attr(xf, 'applyFill') ?? '') || attr(xf, 'fillId') === undefined
    const base = inherited ? (parents[Number(attr(xf, 'xfId') ?? 0)] ?? '') : xf
    const fillId = Number(attr(base, 'fillId') ?? 0)
    return Object.assign(readFill(fills[fillId] ?? ''), {
      source: inherited ? ('inherited' as const) : ('direct' as const),
    })
  })
}
export function xlsxFillLabel(fill: XlsxFillView | undefined): string {
  if (fill?.unsupported) return fill.unsupported
  const spec = fill?.spec
  const label = !spec
    ? '无填充'
    : 'gradient' in spec
      ? spec.gradient.type === 'path'
        ? '路径渐变'
        : '线性渐变'
      : XLSX_PATTERN_NAMES[PATTERN_TYPES.indexOf(spec.pattern)]!
  return `${label}${fill?.source === 'inherited' ? ' · 继承样式' : ''}`
}
const cache = new Map<string, string>()
const svgBackground = (body: string, viewBox = '0 0 8 8') =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none">${body}</svg>`)}")`
function stopColor(stops: { position: number; color: string }[], position: number): string {
  const right = stops.find((stop) => stop.position >= position) ?? stops.at(-1)!,
    left = stops.toReversed().find((stop) => stop.position <= position) ?? stops[0]!
  const ratio =
    right.position === left.position
      ? 0
      : (position - left.position) / (right.position - left.position)
  return (
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(left.color.slice(offset, offset + 2), 16) * (1 - ratio) +
            parseInt(right.color.slice(offset, offset + 2), 16) * ratio,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
export function xlsxFillBackground(
  spec: FillSpec | null | undefined,
  palette: readonly string[] = DEFAULT_THEME_PALETTE,
): string | undefined {
  if (!spec) return undefined
  const key = JSON.stringify([spec, palette]),
    prior = cache.get(key)
  if (prior) return prior
  let result: string
  if ('gradient' in spec) {
    const g = spec.gradient,
      stops = g.stops
        .map((s) => ({ position: s.position, color: resolveStyleColor(s.color, palette) }))
        .toSorted((a, b) => a.position - b.position)
    if (g.type !== 'path')
      result = `linear-gradient(${(g.angle ?? 0) + 90}deg, ${stops.map((s) => `${s.color} ${s.position * 100}%`).join(', ')})`
    else {
      let body = `<rect width="100" height="100" fill="${stopColor(stops, 1)}"/>`
      // Rectangular distance from the inner rectangle to the four cell edges.
      for (let i = 1; i <= 96; i++) {
        const t = i / 96,
          x = (g.left ?? 0) * t * 100,
          y = (g.top ?? 0) * t * 100,
          w = 100 - x - (g.right ?? 0) * t * 100,
          h = 100 - y - (g.bottom ?? 0) * t * 100
        if (w > 0 && h > 0)
          body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${stopColor(stops, 1 - t)}"/>`
      }
      result = `${svgBackground(body, '0 0 100 100')} center / 100% 100% no-repeat`
    }
  } else {
    const fg = resolveStyleColor(spec.fg, palette),
      bg = spec.bg ? resolveStyleColor(spec.bg, palette) : '#FFFFFF',
      p = spec.pattern
    if (p === 'solid') result = fg
    else {
      const dark = p.startsWith('dark'),
        width = dark ? 2 : 1
      let body = `<rect width="8" height="8" fill="${bg}"/>`
      const path = (d: string) =>
        `<path d="${d}" fill="none" stroke="${fg}" stroke-width="${width}"/>`
      if (/Gray|gray/.test(p)) {
        const count =
          p === 'darkGray'
            ? 48
            : p === 'mediumGray'
              ? 32
              : p === 'lightGray'
                ? 16
                : p === 'gray125'
                  ? 8
                  : 4
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            let rank = 0
            for (let bit = 0; bit < 3; bit++) {
              const a = (x >> bit) & 1,
                b = (y >> bit) & 1
              rank = rank * 4 + ((a ^ b) * 2 + b)
            }
            if (rank < count) body += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fg}"/>`
          }
      } else {
        if (/Horizontal|Grid/.test(p)) body += path('M0 2H8M0 6H8')
        if (/Vertical|Grid/.test(p)) body += path('M2 0V8M6 0V8')
        if (/Down|Trellis/.test(p)) body += path('M-4 0L8 12M0-4L12 8')
        if (/Up|Trellis/.test(p)) body += path('M-4 8L8-4M0 12L12 0')
      }
      result = `${svgBackground(body)} 0 0 / 8px 8px repeat`
    }
  }
  if (cache.size > 200) cache.clear()
  cache.set(key, result)
  return result
}
