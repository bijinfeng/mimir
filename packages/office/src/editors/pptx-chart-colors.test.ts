import { expect, it } from 'vitest'
import type { ChartModel } from '../../vendor/packages/pptx-engine/src/chart.js'
import {
  pptxChartColorSchemes,
  pptxChartPointColor,
  pptxChartPalettePoints,
  pptxChartSeriesColors,
} from './pptx-chart-colors.js'

const chart: ChartModel = {
  kind: 'bar',
  categories: ['甲', '乙'],
  series: [
    { values: [1, 2], paletteIdx: 3 },
    { values: [3, 4], color: '#AABBCC', pointColors: ['#123456'] },
  ],
  themePalette: ['#102030', '#204060', '#306090', '#4080C0', '#50A0F0', '#60C020'],
}
it('derives both colorful sets and all six mono gradients from the actual theme, retaining complete legacy sets', () => {
  const before = structuredClone(chart),
    schemes = pptxChartColorSchemes(chart)
  expect(schemes).toHaveLength(12)
  expect(schemes[0]!.colors).toEqual(chart.themePalette)
  expect(schemes[1]!.colors).toEqual([
    '#4080C0',
    '#50A0F0',
    '#60C020',
    '#102030',
    '#204060',
    '#306090',
  ])
  expect(schemes[2]!.colors).toEqual(['#0C1824', '#102030', '#4C5864', '#7C848D', '#ABB1B7'])
  expect(
    schemes
      .filter((scheme) => scheme.key.startsWith('mono-accent'))
      .map((scheme) => scheme.colors[1]),
  ).toEqual(chart.themePalette)
  expect(schemes.find((scheme) => scheme.key === 'warm')!.colors.at(-1)).toBe('#833C00')
  expect(chart).toEqual(before)
})
it('displays native series indices and point overrides, including pie automatic category colors and a pending reset', () => {
  expect(pptxChartSeriesColors(chart)).toEqual(['#4080C0', '#AABBCC'])
  expect(pptxChartSeriesColors(chart, ['#998877'])).toEqual(['#998877', '#998877'])
  expect(pptxChartPointColor(chart, 1, 0, ['#998877'])).toBe('#123456')
  expect(pptxChartPointColor(chart, 1, 0, ['#998877'], null)).toBe('#998877')
  const pie = { ...chart, kind: 'pie' as const }
  expect(pptxChartPointColor(pie, 0, 1)).toBe('#204060')
  expect(pptxChartPointColor({ ...pie, varyColors: false }, 1, 1)).toBe('#AABBCC')
})
it('uses the Office six-accent fallback when the parser has no complete valid theme', () => {
  expect(pptxChartColorSchemes({ ...chart, themePalette: undefined })[0]!.colors).toEqual([
    '#4472C4',
    '#ED7D31',
    '#A5A5A5',
    '#FFC000',
    '#5B9BD5',
    '#70AD47',
  ])
})

it('recomputes pie defaults from the latest scheme intent, preserves explicit points, and lets reset inherit the scheme', () => {
  const before = structuredClone(chart),
    overrides = { 0: { 0: '#ABCDEF', 1: null }, 1: { 0: null } }
  const warm = ['#112233', '#445566'],
    cool = ['#778899', '#AABBCC']
  expect(pptxChartPalettePoints(chart, 'pie', warm, overrides)).toEqual({
    0: { 0: '#ABCDEF', 1: '#445566' },
    1: { 0: '#112233', 1: '#445566' },
  })
  expect(pptxChartPalettePoints(chart, 'pie', cool, overrides)).toEqual({
    0: { 0: '#ABCDEF', 1: '#AABBCC' },
    1: { 0: '#778899', 1: '#AABBCC' },
  })
  expect(pptxChartPalettePoints(chart, 'pie', warm)?.[1]?.[0]).toBeUndefined()
  expect(pptxChartPointColor({ ...chart, kind: 'pie' }, 0, 1, undefined, null, cool)).toBe(
    '#AABBCC',
  )
  expect(pptxChartPalettePoints(chart, 'bar', cool, overrides)).toBe(overrides)
  expect(pptxChartPalettePoints(chart, 'pie', undefined, overrides)).toBe(overrides)
  expect(pptxChartPalettePoints(chart, 'pie', warm, undefined, [3, 2, 1])?.[2]).toEqual({
    0: '#112233',
  })
  expect(chart).toEqual(before)
})
