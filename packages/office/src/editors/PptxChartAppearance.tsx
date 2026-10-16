import { useState, type Dispatch, type SetStateAction } from 'react'
import type { ChartModel } from '../../vendor/packages/pptx-engine/src/chart.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'

export interface PptxChartAppearancePatch {
  barDir?: 'col' | 'bar'
  gridlines?: boolean
  catAxisTitle?: string
  valAxisTitle?: string
  gapWidthPct?: number
  holeSizePct?: number
  colorScheme?: string[]
  pointColors?: Record<string, Record<string, string | null>>
}
/** Parser render kinds intentionally collapse variants; restore editable kind for current values. */
export function pptxChartEditKind(chart: ChartModel): string {
  if (chart.kind === 'pie') return chart.holePct ? 'doughnut' : chart.pseudo3D ? 'pie3D' : 'pie'
  if (chart.kind === 'bar') {
    if (chart.series.some((series) => series.plotKind === 'line')) return 'comboBarLine'
    if (chart.pseudo3D) return 'bar3D'
    if (chart.grouping === 'stacked') return 'barStacked'
    if (chart.grouping === 'percentStacked') return 'barPercentStacked'
  }
  return chart.kind
}
// Fixed GenOffice Ribbon presets: these are real editChart parameters, not theme IDs.
const PRESETS = [
  ['经典', 'b', false, false, 150],
  ['网格', 'b', false, true, 150],
  ['数值标签', 'b', true, false, 150],
  ['详细', 'b', true, true, 150],
  ['简洁', 'none', false, false, 150],
  ['简洁标签', 'none', true, false, 150],
  ['宽柱', 'b', false, true, 50],
  ['细柱', 'b', false, true, 300],
  ['顶部图例', 't', false, true, 150],
  ['右侧图例', 'r', false, true, 150],
] as const
const PALETTES = [
  { key: 'blue', name: '蓝色', colors: ['#2E75B6', '#4472C4', '#5B9BD5', '#70AD47'] },
  { key: 'warm', name: '暖色', colors: ['#ED7D31', '#FFC000', '#FF0000', '#C55A11'] },
  { key: 'cool', name: '冷色', colors: ['#0070C0', '#00B0F0', '#00B0A0', '#7030A0'] },
  { key: 'mono', name: '灰度', colors: ['#404040', '#666666', '#888888', '#AAAAAA'] },
]
export function PptxChartAppearance({
  chart,
  kind,
  section,
  patch,
  setPatch,
  preset,
}: {
  chart: ChartModel
  kind: string
  section: 'style' | 'colors'
  patch: PptxChartAppearancePatch
  setPatch: Dispatch<SetStateAction<PptxChartAppearancePatch>>
  preset: (
    legend: 'b' | 't' | 'r' | 'none',
    labels: boolean,
    patch: PptxChartAppearancePatch,
  ) => void
}) {
  const [pointSeries, setPointSeries] = useState(0),
    [point, setPoint] = useState(0),
    [colorSeries, setColorSeries] = useState(0)
  const [seriesKeys] = useState(() => chart.series.map(() => crypto.randomUUID()))
  const currentKind = kind || pptxChartEditKind(chart)
  const bar = currentKind.startsWith('bar'),
    pie = ['pie', 'pie3D', 'doughnut'].includes(currentKind)
  const hasBars = bar || currentKind === 'comboBarLine'
  const axes = !pie
  const palette = chart.series.map(
    (series, index) =>
      patch.colorScheme?.[index % patch.colorScheme.length] ??
      series.color ??
      chart.themePalette?.[index % (chart.themePalette.length || 1)] ??
      PALETTES[0]!.colors[index % 4]!,
  )
  const update = (next: PptxChartAppearancePatch) =>
    setPatch((current) => ({ ...current, ...next }))
  const pointOverride = patch.pointColors?.[String(pointSeries)]?.[String(point)]
  const pointColor =
    pointOverride === undefined ? chart.series[pointSeries]?.pointColors?.[point] : pointOverride
  const colorOptions = [...new Set([...PALETTES.flatMap((item) => item.colors), ...palette])].map(
    (value) => ({ value, label: value, swatch: value }),
  )
  const colorPoint = (color: string | null) =>
    setPatch((current) => ({
      ...current,
      pointColors: {
        ...current.pointColors,
        [pointSeries]: { ...current.pointColors?.[pointSeries], [point]: color },
      },
    }))
  const presets = PRESETS.filter((p) => hasBars || !['宽柱', '细柱'].includes(p[0]))
  const matchesPalette = (colors?: string[]) =>
    colors?.length === patch.colorScheme?.length &&
    colors?.every((color, index) => color === patch.colorScheme?.[index])
  const selectedPalette = !patch.colorScheme
    ? ''
    : (PALETTES.find((item) => matchesPalette(item.colors))?.key ??
      (matchesPalette(chart.themePalette) ? 'theme' : 'custom'))
  return (
    <>
      {section === 'style' && (
        <ToolbarMenuFields label="图表样式">
          <ToolbarSelect
            label="图表样式预设"
            value=""
            options={[
              { value: '', label: '选择样式…' },
              ...presets.map((p, index) => ({ value: String(index), label: p[0] })),
            ]}
            onChange={(value) => {
              const selected = presets[Number(value)]
              if (selected)
                preset(selected[1], selected[2], {
                  ...(axes ? { gridlines: selected[3] } : {}),
                  ...(hasBars ? { gapWidthPct: selected[4] } : {}),
                })
            }}
          />
          {axes && (
            <>
              <ToolbarSelect
                label="图表网格线"
                value={String(
                  patch.gridlines ?? !!(chart.valAxis?.gridColor || chart.valAxis?.gridColorAuto),
                )}
                options={[
                  { value: 'true', label: '显示' },
                  { value: 'false', label: '隐藏' },
                ]}
                onChange={(value) => update({ gridlines: value === 'true' })}
              />
              <ToolbarTextField
                label="类别轴标题"
                value={patch.catAxisTitle ?? chart.catAxis?.title ?? ''}
                onChange={(value) => update({ catAxisTitle: value })}
              />
              <ToolbarTextField
                label="数值轴标题"
                value={patch.valAxisTitle ?? chart.valAxis?.title ?? ''}
                onChange={(value) => update({ valAxisTitle: value })}
              />
            </>
          )}
          {hasBars && (
            <>
              {bar && (
                <ToolbarSelect
                  label="柱形方向"
                  value={patch.barDir ?? chart.barDir ?? 'col'}
                  options={[
                    { value: 'col', label: '竖向柱形' },
                    { value: 'bar', label: '横向条形' },
                  ]}
                  onChange={(value) => update({ barDir: value as 'col' | 'bar' })}
                />
              )}
              <ToolbarNumberField
                label="柱形间距（%）"
                min={0}
                max={500}
                value={patch.gapWidthPct ?? chart.gapWidthPct ?? 150}
                onCommit={(value) => update({ gapWidthPct: value })}
              />
            </>
          )}
          {currentKind === 'doughnut' && (
            <ToolbarNumberField
              label="圆环孔径（%）"
              min={10}
              max={90}
              value={patch.holeSizePct ?? chart.holePct ?? 50}
              onCommit={(value) => update({ holeSizePct: value })}
            />
          )}
        </ToolbarMenuFields>
      )}
      {section === 'colors' && (
        <ToolbarMenuFields label="图表配色">
          <ToolbarSelect
            label="图表配色方案"
            value={selectedPalette}
            options={[
              { value: '', label: '保留当前配色' },
              ...(chart.themePalette?.length ? [{ value: 'theme', label: '当前文档主题' }] : []),
              ...PALETTES.map((item) => ({ value: item.key, label: item.name })),
              ...(selectedPalette === 'custom' ? [{ value: 'custom', label: '自定义配色' }] : []),
            ]}
            onChange={(value) => {
              if (value === '') {
                update({ colorScheme: undefined })
                return
              }
              const colors =
                value === 'theme'
                  ? chart.themePalette
                  : PALETTES.find((item) => item.key === value)?.colors
              if (colors?.length) update({ colorScheme: colors })
            }}
          />
          <div className="mimir-pptx-chart-palette" aria-label="当前图表系列配色">
            {palette.map((color, index) => (
              <span
                key={seriesKeys[index]}
                style={{ backgroundColor: color }}
                title={`系列${index + 1}：${color}`}
              />
            ))}
          </div>
          <ToolbarSelect
            label="要配色的系列"
            value={String(colorSeries)}
            options={chart.series.map((series, index) => ({
              value: String(index),
              label: series.name || `系列${index + 1}`,
            }))}
            onChange={(value) => setColorSeries(Number(value))}
          />
          <ToolbarColorPicker
            label="所选系列颜色"
            value={palette[colorSeries] ?? null}
            options={colorOptions}
            icon={<span>系列颜色</span>}
            onPick={(color) => {
              const colors = [...palette]
              colors[colorSeries] = color
              update({ colorScheme: colors })
            }}
          />
          <ToolbarMenuNote>
            系列颜色与数据点颜色分别保存。数据点的显式颜色优先于系列配色。
          </ToolbarMenuNote>
          <ToolbarSelect
            label="数据点所属系列"
            value={String(pointSeries)}
            options={chart.series.map((series, index) => ({
              value: String(index),
              label: series.name || `系列${index + 1}`,
            }))}
            onChange={(value) => setPointSeries(Number(value))}
          />
          <ToolbarSelect
            label="数据点类别"
            value={String(point)}
            options={chart.categories.map((category, index) => ({
              value: String(index),
              label: category || `类别${index + 1}`,
            }))}
            onChange={(value) => setPoint(Number(value))}
          />
          <ToolbarColorPicker
            label="数据点颜色"
            value={pointColor ?? palette[pointSeries] ?? null}
            options={colorOptions}
            icon={<span>数据点</span>}
            onPick={colorPoint}
          />
          <ToolbarButton label="重置数据点颜色" onClick={() => colorPoint(null)}>
            使用系列颜色
          </ToolbarButton>
        </ToolbarMenuFields>
      )}
    </>
  )
}
