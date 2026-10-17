import type { ChartModel } from '../../vendor/packages/pptx-engine/src/chart.js'

/** GenOffice slides-main.ts chartColorSchemes/mixHex, Apache-2.0,
 * commit 480548fd55f1be3593ee0d8e316a734751d58309. Use this chart's theme chain. */
export const PPTX_CHART_FALLBACK_ACCENTS = [
  '#4472C4',
  '#ED7D31',
  '#A5A5A5',
  '#FFC000',
  '#5B9BD5',
  '#70AD47',
]
export interface PptxChartColorScheme {
  key: string
  name: string
  colors: string[]
}
const LEGACY: PptxChartColorScheme[] = [
  { key: 'blue', name: '蓝色', colors: ['#2E75B6', '#4472C4', '#5B9BD5', '#70AD47', '#ED7D31'] },
  { key: 'warm', name: '暖色', colors: ['#ED7D31', '#FFC000', '#FF0000', '#C55A11', '#833C00'] },
  { key: 'cool', name: '冷色', colors: ['#0070C0', '#00B0F0', '#00B0A0', '#7030A0', '#2E75B6'] },
  { key: 'mono', name: '灰度', colors: ['#404040', '#666666', '#888888', '#AAAAAA', '#CCCCCC'] },
]
function mix(hex: string, target: number, ratio: number): string {
  const channels = hex.slice(1).match(/../g)!
  return (
    '#' +
    channels
      .map((channel) => {
        const value = parseInt(channel, 16)
        return Math.round(value + (target - value) * ratio)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
      .toUpperCase()
  )
}
export function pptxChartAccents(chart: ChartModel): string[] {
  return chart.themePalette?.length === 6 &&
    chart.themePalette.every((color) => /^#[\da-f]{6}$/i.test(color))
    ? chart.themePalette.map((color) => color.toUpperCase())
    : [...PPTX_CHART_FALLBACK_ACCENTS]
}
export function pptxChartColorSchemes(chart: ChartModel): PptxChartColorScheme[] {
  const accents = pptxChartAccents(chart)
  return [
    { key: 'theme', name: '当前文档主题', colors: accents },
    {
      key: 'colorful2',
      name: '主题多彩 · 变体',
      colors: [...accents.slice(3), ...accents.slice(0, 3)],
    },
    ...accents.map((color, index) => ({
      key: `mono-accent${index + 1}`,
      name: `主题单色 · 强调色 ${index + 1}`,
      colors: [
        mix(color, 0, 0.25),
        color,
        mix(color, 255, 0.25),
        mix(color, 255, 0.45),
        mix(color, 255, 0.65),
      ],
    })),
    ...LEGACY,
  ]
}
export function pptxChartSeriesColors(chart: ChartModel, scheme?: readonly string[]): string[] {
  const accents = pptxChartAccents(chart)
  return chart.series.map((series, index) =>
    scheme?.length
      ? scheme[index % scheme.length]!
      : (series.color ?? accents[(series.paletteIdx ?? index) % accents.length]!),
  )
}
/** Null clears only this explicit point override, then displays its native fallback. */
export function pptxChartPointColor(
  chart: ChartModel,
  series: number,
  point: number,
  scheme?: readonly string[],
  override?: string | null,
  pointScheme?: readonly string[],
  kind = chart.kind as string,
): string {
  const explicit = override === undefined ? chart.series[series]?.pointColors?.[point] : override
  if (explicit) return explicit
  return ['pie', 'pie3D', 'doughnut'].includes(kind) &&
    (pointScheme?.length || chart.varyColors !== false)
    ? (pointScheme?.[point % pointScheme.length] ?? pptxChartAccents(chart)[point % 6]!)
    : (pptxChartSeriesColors(chart, scheme)[series] ?? pptxChartAccents(chart)[0]!)
}

/** Scheme-derived points are computed from intent, never mistaken for manual overrides.
 * Native overrides and explicit local colors win. A local null requests inheritance. */
export function pptxChartPalettePoints(
  chart: ChartModel,
  kind: string,
  scheme?: readonly string[],
  overrides?: Record<string, Record<string, string | null>>,
  valueCounts?: readonly number[],
): Record<string, Record<string, string | null>> | undefined {
  if (!scheme?.length || !['pie', 'pie3D', 'doughnut'].includes(kind)) return overrides
  const points = Object.fromEntries(
    Object.entries(overrides ?? {}).map(([series, colors]) => [series, { ...colors }]),
  )
  ;(valueCounts ?? chart.series.map((series) => series.values.length)).forEach((count, si) => {
    for (let pi = 0; pi < count; pi++) {
      const override = overrides?.[si]?.[pi]
      if (
        override != null ||
        (override === undefined && chart.series[si]?.pointColors?.[pi] != null)
      )
        continue
      ;(points[si] ??= {})[pi] = scheme[pi % scheme.length]!
    }
  })
  return points
}
