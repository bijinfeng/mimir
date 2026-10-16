import { useState } from 'react'
import type { XlsxVisual } from '../xlsx-visuals.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { XLSX_COLORS } from './XlsxFormatControls.js'
export const XLSX_CHART_TYPES = [
  ['column', '柱形图'],
  ['bar', '条形图'],
  ['line', '折线图'],
  ['area', '面积图'],
  ['pie', '饼图'],
  ['doughnut', '圆环图'],
  ['scatter', '散点图'],
  ['radar', '雷达图'],
  ['combo', '组合图'],
].map(([value, label]) => ({ value: value!, label: label! }))
export function XlsxVisualProperties({
  visual,
  onApply,
}: {
  visual: XlsxVisual
  onApply: (op: Record<string, unknown>) => Promise<boolean>
}) {
  const [patch, setPatch] = useState<Record<string, unknown>>({})
  const [seriesIndex, setSeriesIndex] = useState('0'),
    [seriesName, setSeriesName] = useState(''),
    [values, setValues] = useState(''),
    [categories, setCategories] = useState(''),
    [color, setColor] = useState<string | null>(null)
  const change = (key: string, value: unknown) => setPatch((p) => ({ ...p, [key]: value }))
  const chart = visual.chart
  const seriesColor = color ?? chart?.seriesColors?.[Number(seriesIndex)]
  const axes = patch.axisTitles as { category?: string | null; value?: string | null } | undefined
  return (
    <>
      {visual.kind === 'chart' && (
        <ToolbarMenuFields label="图表属性">
          <ToolbarTextField
            label="图表标题"
            value={String(patch.title ?? visual.name)}
            onChange={(v) => change('title', v)}
          />
          <ToolbarSelect
            label="图表类型"
            value={String(patch.chartType ?? chart?.type ?? '')}
            options={XLSX_CHART_TYPES}
            onChange={(v) => change('chartType', v)}
          />
          <ToolbarSelect
            label="图例位置"
            value={String(patch.legend ?? chart?.legend ?? 'none')}
            options={[
              ['none', '不显示'],
              ['right', '右侧'],
              ['bottom', '底部'],
              ['top', '顶部'],
              ['left', '左侧'],
            ].map(([value, label]) => ({ value: value!, label: label! }))}
            onChange={(v) => change('legend', v)}
          />
          <ToolbarSelect
            label="数据标签"
            value={String(patch.dataLabels ?? chart?.dataLabels ?? 'none')}
            options={[
              ['none', '不显示'],
              ['value', '数值'],
              ['percent', '百分比'],
              ['category-percent', '分类和百分比'],
            ].map(([value, label]) => ({ value: value!, label: label! }))}
            onChange={(v) => change('dataLabels', v)}
          />
          <ToolbarSelect
            label="系列排列"
            value={String(patch.grouping ?? chart?.grouping ?? 'clustered')}
            options={[
              ['clustered', '簇状'],
              ['stacked', '堆积'],
              ['percentStacked', '百分比堆积'],
            ].map(([value, label]) => ({ value: value!, label: label! }))}
            onChange={(v) => change('grouping', v)}
          />
          {!['pie', 'doughnut'].includes(chart?.type ?? '') && (
            <>
              <ToolbarTextField
                label="分类轴标题"
                value={String(
                  axes?.category !== undefined
                    ? (axes.category ?? '')
                    : (chart?.axisTitles?.category ?? ''),
                )}
                onChange={(value) => change('axisTitles', { ...axes, category: value || null })}
              />
              <ToolbarTextField
                label="数值轴标题"
                value={String(
                  axes?.value !== undefined ? (axes.value ?? '') : (chart?.axisTitles?.value ?? ''),
                )}
                onChange={(value) => change('axisTitles', { ...axes, value: value || null })}
              />
            </>
          )}
          <ToolbarButton
            label="应用图表属性"
            primary
            disabled={!Object.keys(patch).length}
            disabledReason="先更改图表属性"
            onClick={() =>
              void onApply({ op: 'edit_chart', chartPath: visual.chartPath, ...patch }).then(
                (ok) => {
                  if (ok) setPatch({})
                },
              )
            }
          />
          <ToolbarSelect
            label="数据系列"
            value={seriesIndex}
            onChange={(value) => {
              setSeriesIndex(value)
              setSeriesName('')
              setValues('')
              setCategories('')
              setColor(null)
            }}
            options={(chart?.series ?? []).map((s, i) => ({
              value: String(i),
              label: s || `系列${i + 1}`,
            }))}
          />
          <ToolbarTextField
            label="系列名称（留空保留）"
            value={seriesName}
            onChange={setSeriesName}
          />
          <ToolbarTextField
            label="数值范围（当前表，留空保留）"
            value={values}
            onChange={(v) => setValues(v.toUpperCase())}
            placeholder="C3:C5"
          />
          <ToolbarTextField
            label="分类范围（当前表，留空保留）"
            value={categories}
            onChange={(v) => setCategories(v.toUpperCase())}
            placeholder="A3:A5"
          />
          <ToolbarButton
            label="更新图表系列数据"
            disabled={!seriesName && !values && !categories}
            disabledReason="先填写系列名称或数据范围"
            onClick={() =>
              void onApply({
                op: 'edit_chart',
                chartPath: visual.chartPath,
                seriesData: [
                  {
                    index: Number(seriesIndex),
                    ...(seriesName ? { name: seriesName } : {}),
                    ...(values ? { valuesRange: values } : {}),
                    ...(categories ? { categoriesRange: categories } : {}),
                  },
                ],
              })
            }
          >
            更新系列数据
          </ToolbarButton>
          {!seriesColor && (
            <ToolbarMenuNote>当前系列颜色由主题决定；选择颜色后可覆盖。</ToolbarMenuNote>
          )}
          <ToolbarColorPicker
            label="系列颜色"
            value={seriesColor ?? null}
            options={XLSX_COLORS}
            onPick={setColor}
          />
          <ToolbarButton
            label="应用系列颜色"
            disabled={!chart?.series.length || color === null}
            disabledReason={color === null ? '先选择新的系列颜色' : '图表没有数据系列'}
            onClick={() =>
              void onApply({
                op: 'edit_chart',
                chartPath: visual.chartPath,
                seriesColors: { [seriesIndex]: color },
              })
            }
          >
            应用系列颜色
          </ToolbarButton>
        </ToolbarMenuFields>
      )}
      {visual.kind === 'shape' && (
        <ToolbarMenuFields label="形状属性">
          <ToolbarTextArea
            label="形状文字"
            value={String(patch.text ?? visual.text ?? '')}
            onChange={(v) => change('text', v)}
          />
          <ToolbarTextField
            label="形状左上角（A1）"
            value={String(patch.anchorCell ?? '')}
            onChange={(v) => change('anchorCell', v.toUpperCase())}
            placeholder="留空保留当前位置"
          />
          <ToolbarColorPicker
            label="形状填充"
            value={String(patch.fillColor ?? '#' + (visual.fillColor ?? '4472C4'))}
            options={XLSX_COLORS}
            onPick={(v) => change('fillColor', v)}
          />
          <ToolbarButton
            label="应用形状属性"
            primary
            disabled={!Object.keys(patch).length}
            disabledReason="先更改形状属性"
            onClick={() =>
              void onApply({ op: 'edit_shape', visualId: visual.id, ...patch }).then((ok) => {
                if (ok) setPatch({})
              })
            }
          />
        </ToolbarMenuFields>
      )}
    </>
  )
}
