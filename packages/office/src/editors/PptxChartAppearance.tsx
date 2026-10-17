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
import {
  pptxChartColorSchemes,
  pptxChartPointColor,
  pptxChartSeriesColors,
} from './pptx-chart-colors.js'

export interface PptxChartAppearancePatch {
  barDir?: 'col' | 'bar'
  gridlines?: boolean
  catAxisTitle?: string
  valAxisTitle?: string
  gapWidthPct?: number
  holeSizePct?: number
  colorScheme?: string[]
  /** Local palette intent; submitted as native pointColors only for pie defaults. */
  pointColorScheme?: string[]
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
  const schemes = pptxChartColorSchemes(chart)
  const palette = pptxChartSeriesColors(chart, patch.colorScheme)
  const originalPalette = pptxChartSeriesColors(chart)
  const update = (next: PptxChartAppearancePatch) =>
    setPatch((current) => ({ ...current, ...next }))
  const pointOverride = patch.pointColors?.[String(pointSeries)]?.[String(point)]
  const hasPointOverride =
    (pointOverride === undefined
      ? chart.series[pointSeries]?.pointColors?.[point]
      : pointOverride) != null
  const pointColor = pptxChartPointColor(
    chart,
    pointSeries,
    point,
    patch.colorScheme,
    pointOverride,
    patch.pointColorScheme,
    currentKind,
  )
  const colorOptions = [
    ...new Set([
      ...schemes[0]!.colors,
      ...schemes
        .filter((scheme) => ['blue', 'warm', 'cool', 'mono'].includes(scheme.key))
        .flatMap((scheme) => scheme.colors),
      ...palette,
      pointColor,
    ]),
  ].map((value) => ({ value, label: value, swatch: value }))
  const colorPoint = (color: string | null) =>
    setPatch((current) => ({
      ...current,
      pointColors: {
        ...current.pointColors,
        [pointSeries]: { ...current.pointColors?.[pointSeries], [point]: color },
      },
    }))
  const presets = PRESETS.filter((p) => hasBars || !['宽柱', '细柱'].includes(p[0]))
  const activeScheme = pie ? patch.pointColorScheme : patch.colorScheme
  const matchesPalette = (colors?: string[]) =>
    colors?.length === activeScheme?.length &&
    colors?.every((color, index) => color === activeScheme?.[index])
  const selectedPalette = !activeScheme
    ? ''
    : (schemes.find((item) => matchesPalette(item.colors))?.key ?? 'custom')
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
              ...schemes.map((item) => ({ value: item.key, label: item.name })),
              ...(selectedPalette === 'custom' ? [{ value: 'custom', label: '自定义配色' }] : []),
            ]}
            onChange={(value) => {
              if (value === '') {
                update({ colorScheme: undefined, pointColorScheme: undefined })
                return
              }
              const colors = schemes.find((item) => item.key === value)?.colors
              if (colors?.length) update({ colorScheme: colors, pointColorScheme: colors })
            }}
          />
          <div className="mimir-pptx-chart-palette" aria-label="当前图表系列配色">
            {(pie
              ? (patch.pointColorScheme ?? chart.themePalette ?? schemes[0]!.colors)
              : palette
            ).map((color, index) => (
              <span
                key={seriesKeys[index] ?? String(index)}
                style={{ backgroundColor: color }}
                title={`${pie ? '方案色' : '系列'}${index + 1}：${color}`}
              />
            ))}
          </div>
          {!pie && (
            <>
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
                allowCustomRgb
                icon={<span>系列颜色</span>}
                onPick={(color) => {
                  const colors = [...palette]
                  colors[colorSeries] = color
                  update({ colorScheme: colors })
                }}
              />
              <ToolbarMenuNote>当前系列：{palette[colorSeries] ?? '无系列'}</ToolbarMenuNote>
              <ToolbarButton
                label="恢复所选系列颜色"
                disabled={palette[colorSeries] === originalPalette[colorSeries]}
                disabledReason="所选系列已使用原颜色"
                onClick={() => {
                  const colors = [...palette]
                  colors[colorSeries] = originalPalette[colorSeries]!
                  update({
                    colorScheme: colors.every((color, index) => color === originalPalette[index])
                      ? undefined
                      : colors,
                  })
                }}
              >
                恢复此系列原颜色
              </ToolbarButton>
            </>
          )}
          <ToolbarMenuNote>
            {pie
              ? '方案应用于未单独着色的数据点，保留单独颜色。保存后方案色成为显式点色，再次配色时会保留。'
              : '数据点的显式颜色优先于系列配色，修改系列不会清除数据点颜色。'}
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
            value={pointColor}
            options={colorOptions}
            allowCustomRgb
            icon={<span>数据点</span>}
            onPick={colorPoint}
          />
          <ToolbarMenuNote>当前数据点：{pointColor}</ToolbarMenuNote>
          <ToolbarButton
            label="重置数据点颜色"
            disabled={!hasPointOverride}
            disabledReason="此数据点已使用自动颜色"
            onClick={() => colorPoint(null)}
          >
            {pie
              ? patch.pointColorScheme
                ? '使用当前方案颜色'
                : '恢复此数据点自动颜色'
              : '使用系列颜色'}
          </ToolbarButton>
        </ToolbarMenuFields>
      )}
    </>
  )
}
