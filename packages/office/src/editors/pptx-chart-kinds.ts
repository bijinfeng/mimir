/** The twelve native chart kinds exposed by the fixed GenOffice Ribbon. */
export const PPTX_CHART_KINDS = [
  { value: 'bar', label: '柱状图' },
  { value: 'barStacked', label: '堆积柱状图' },
  { value: 'barPercentStacked', label: '百分比堆积柱状图' },
  { value: 'bar3D', label: '三维柱状图' },
  { value: 'line', label: '折线图' },
  { value: 'area', label: '面积图' },
  { value: 'pie', label: '饼图' },
  { value: 'pie3D', label: '三维饼图' },
  { value: 'doughnut', label: '圆环图' },
  { value: 'scatter', label: '散点图' },
  { value: 'radar', label: '雷达图' },
  { value: 'comboBarLine', label: '柱形折线组合图' },
] as const
export type PptxChartKind = (typeof PPTX_CHART_KINDS)[number]['value']

export function pptxChartNeedsPositiveValues(kind: PptxChartKind): boolean {
  return kind === 'pie' || kind === 'pie3D' || kind === 'doughnut'
}
