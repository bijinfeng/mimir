import { useState, type ReactNode } from 'react'
import type { XlsxVisual } from '../xlsx-visuals.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
  ToolbarTabs,
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
const inlineAction = (node: ReactNode) => node
export function XlsxVisualProperties({
  visual,
  onApply,
  renderAction = inlineAction,
  busy = false,
}: {
  visual: XlsxVisual
  renderAction?: (node: ReactNode) => ReactNode
  busy?: boolean
  onApply: (op: Record<string, unknown>) => Promise<boolean>
}) {
  const [task, setTask] = useState('properties')
  const [patch, setPatch] = useState<Record<string, unknown>>({})
  const [seriesIndex, setSeriesIndex] = useState('0'),
    [seriesName, setSeriesName] = useState(''),
    [values, setValues] = useState(''),
    [categories, setCategories] = useState(''),
    [color, setColor] = useState<string | null>(null)
  const change = (key: string, value: unknown) =>
    setPatch((before) => {
      const next = { ...before }
      const original: Record<string, unknown> = {
        title: visual.name,
        chartType: visual.chart?.type ?? '',
        legend: visual.chart?.legend ?? 'none',
        dataLabels: visual.chart?.dataLabels ?? 'none',
        grouping: visual.chart?.grouping ?? 'clustered',
      }
      if (value === original[key]) delete next[key]
      else next[key] = value
      return next
    })
  const fill = visual.shapePreview?.element?.fill
  const solid = visual.shapePreview
    ? fill?.type === 'solid' && /^#[0-9a-f]{6}$/i.test(fill.color)
      ? fill.color
      : null
    : visual.fillColor
      ? '#' + visual.fillColor
      : null
  const fillDescription = visual.shapePreview?.unsupported
    ? '未支持的原生填充'
    : fill?.type === 'gradient'
      ? '原生渐变'
      : fill?.type === 'none'
        ? '无填充'
        : solid
          ? `纯色 ${solid.toUpperCase()}`
          : '原生主题或其他填充'
  const chart = visual.chart
  const seriesColor = color ?? chart?.seriesColors?.[Number(seriesIndex)]
  const changeShape = (key: string, value: string) =>
    setPatch((before) => {
      const next = { ...before }
      const original = key === 'text' ? (visual.text ?? '') : key === 'fillColor' ? solid : ''
      if (value === original) delete next[key]
      else next[key] = value
      return next
    })
  const axes = patch.axisTitles as { category?: string | null; value?: string | null } | undefined
  return (
    <>
      {visual.kind === 'chart' && (
        <ToolbarMenuFields label="图表属性">
          <ToolbarTabs
            label="图表管理任务"
            value={task}
            onChange={(value) => {
              if (!busy) setTask(value)
            }}
            items={[
              { value: 'properties', label: '属性' },
              { value: 'series', label: '系列数据' },
              { value: 'color', label: '系列颜色' },
            ]}
          />
          {task === 'properties' && (
            <>
              <ToolbarTextField
                label="图表标题"
                value={String(patch.title ?? visual.name)}
                onChange={(v) => change('title', v)}
              />
              <ToolbarSelect
                disabled={busy}
                label="图表类型"
                value={String(patch.chartType ?? chart?.type ?? '')}
                options={XLSX_CHART_TYPES}
                onChange={(v) => change('chartType', v)}
              />
              <ToolbarSelect
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
                      axes?.value !== undefined
                        ? (axes.value ?? '')
                        : (chart?.axisTitles?.value ?? ''),
                    )}
                    onChange={(value) => change('axisTitles', { ...axes, value: value || null })}
                  />
                </>
              )}
              {renderAction(
                <ToolbarButton
                  label="应用图表属性"
                  primary
                  disabled={busy || !Object.keys(patch).length}
                  disabledReason="先更改图表属性"
                  onClick={() =>
                    void onApply({ op: 'edit_chart', chartPath: visual.chartPath, ...patch }).then(
                      (ok) => {
                        if (ok) setPatch({})
                      },
                    )
                  }
                />,
              )}
            </>
          )}
          {task !== 'properties' && (
            <>
              <ToolbarSelect
                disabled={busy}
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
              {task === 'series' && (
                <>
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
                  {renderAction(
                    <ToolbarButton
                      label="更新图表系列数据"
                      primary
                      disabled={busy || (!seriesName && !values && !categories)}
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
                        }).then((ok) => {
                          if (ok) {
                            setSeriesName('')
                            setValues('')
                            setCategories('')
                          }
                        })
                      }
                    />,
                  )}
                </>
              )}
              {task === 'color' && (
                <>
                  {!seriesColor && (
                    <ToolbarMenuNote>当前系列颜色由主题决定；选择颜色后可覆盖。</ToolbarMenuNote>
                  )}
                  <ToolbarColorPicker
                    label="系列颜色"
                    value={seriesColor ?? null}
                    options={XLSX_COLORS}
                    onPick={setColor}
                  />
                  {renderAction(
                    <ToolbarButton
                      label="应用系列颜色"
                      primary
                      disabled={busy || !chart?.series.length || color === null}
                      disabledReason={color === null ? '先选择新的系列颜色' : '图表没有数据系列'}
                      onClick={() =>
                        void onApply({
                          op: 'edit_chart',
                          chartPath: visual.chartPath,
                          seriesColors: { [seriesIndex]: color },
                        }).then((ok) => {
                          if (ok) setColor(null)
                        })
                      }
                    />,
                  )}
                </>
              )}
            </>
          )}
        </ToolbarMenuFields>
      )}
      {visual.kind === 'shape' && (
        <ToolbarMenuFields label="形状属性">
          <ToolbarTextArea
            label="形状文字"
            value={String(patch.text ?? visual.text ?? '')}
            onChange={(v) => changeShape('text', v)}
          />
          <ToolbarTextField
            label="形状左上角（A1）"
            value={String(patch.anchorCell ?? '')}
            onChange={(v) => changeShape('anchorCell', v.toUpperCase())}
            placeholder="留空保留当前位置"
          />
          <ToolbarMenuNote>当前填充：{fillDescription}。选择颜色将改为纯色填充。</ToolbarMenuNote>
          <ToolbarColorPicker
            label="形状填充"
            value={typeof patch.fillColor === 'string' ? patch.fillColor : solid}
            options={XLSX_COLORS}
            onPick={(v) => changeShape('fillColor', v)}
          />
          {renderAction(
            <ToolbarButton
              label="应用形状属性"
              primary
              disabled={busy || !Object.keys(patch).length}
              disabledReason="先更改形状属性"
              onClick={() =>
                void onApply({ op: 'edit_shape', visualId: visual.id, ...patch }).then((ok) => {
                  if (ok) setPatch({})
                })
              }
            />,
          )}
        </ToolbarMenuFields>
      )}
    </>
  )
}
