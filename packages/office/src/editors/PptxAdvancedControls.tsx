import { useEffect, useId, useRef, useState } from 'react'
import { Play, Square, Layers } from 'lucide-react'
import type { PptxManualAnimation } from '../../../shared/src/pptx-animation.js'
import { PptxAnimationGallery } from './PptxAnimationGallery.js'
import { pptxAnimationOps, PPTX_ANIMATION_LABELS } from './pptx-animation-tools.js'
import type { PptxAnimationPreviewRequest } from './PptxAnimationPreview.js'
import type { PptxManualAsset } from '@mimir/shared'
import type { ChartElement, Slide } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ANIM_EFFECTS,
  ANIM_TRIGGERS,
  getSlideAnimations,
  type AnimEffectKind,
} from '../../vendor/packages/pptx-engine/src/animation.js'
import {
  TRANSITION_KINDS,
  readSlideAdvanceTimeXml,
  readSlideTransitionXml,
} from '../../vendor/packages/pptx-engine/src/generate.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
  ToolbarTabs,
  ToolbarPropertyForm,
} from '../shell/EditorShell.js'

import { PptxControlPanel } from './PptxObjectControls.js'
import {
  PptxChartAppearance,
  pptxChartEditKind,
  type PptxChartAppearancePatch,
} from './PptxChartAppearance.js'

type Apply = (op: Record<string, unknown>) => Promise<boolean>
type Target = { slide: number; el: string }
const KINDS = [
  'bar',
  'barStacked',
  'barPercentStacked',
  'bar3D',
  'line',
  'area',
  'pie',
  'pie3D',
  'doughnut',
  'scatter',
  'radar',
  'comboBarLine',
] as const
const KIND_LABELS: Record<string, string> = {
  bar: '柱状图',
  barStacked: '堆积柱状图',
  barPercentStacked: '百分比堆积柱状图',
  bar3D: '三维柱状图',
  line: '折线图',
  area: '面积图',
  pie: '饼图',
  pie3D: '三维饼图',
  doughnut: '圆环图',
  scatter: '散点图',
  radar: '雷达图',
  comboBarLine: '柱形折线组合图',
}

/** Keeps all existing series; data is sent only when the user actually changes it. */
export function ChartEditControls({
  chart,
  target,
  apply,
}: {
  chart: ChartElement
  target: Target
  apply: Apply
}) {
  const [title, setTitle] = useState(chart.chart.title ?? '')
  const [kind, setKind] = useState('')
  const [categories, setCategories] = useState(chart.chart.categories.join('\n'))
  const [series, setSeries] = useState(() =>
    chart.chart.series.map((item) => ({
      key: crypto.randomUUID(),
      name: item.name ?? '',
      values: item.values.map((value) => value ?? '').join('\n'),
    })),
  )
  const [dataEdited, setDataEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [legend, setLegend] = useState(chart.chart.legendPos ?? 'none')
  const [labels, setLabels] = useState<boolean | null>(null)
  const [appearance, setAppearance] = useState<PptxChartAppearancePatch>({})
  const [section, setSection] = useState<'style' | 'colors' | 'data'>('style')
  const [dataSeries, setDataSeries] = useState(0)
  const panelId = useId()
  const pending = useRef(false)
  const parsedCategories = categories.split(/\r?\n/)
  const parsedSeries = series.map((item) => ({
    name: item.name,
    values: item.values.split(/\r?\n/).map((value) => (value.trim() === '' ? NaN : Number(value))),
  }))
  const reason =
    dataEdited &&
    (parsedCategories.length > 200 ||
      parsedSeries.length > 20 ||
      parsedSeries.length === 0 ||
      parsedCategories.some((item) => !item.trim()) ||
      parsedSeries.some(
        (item) =>
          !item.name.trim() ||
          item.values.length !== parsedCategories.length ||
          item.values.some((value) => !Number.isFinite(value)),
      ))
      ? '每个系列须有名称，数值数量须与类别一致，且每行都是有效数字'
      : undefined
  const currentKind = kind || pptxChartEditKind(chart.chart)
  const { barDir, gapWidthPct, holeSizePct, gridlines, catAxisTitle, valAxisTitle, ...colors } =
    appearance
  const patch = {
    ...colors,
    ...(currentKind.startsWith('bar') ? { barDir } : {}),
    ...(currentKind.startsWith('bar') || currentKind === 'comboBarLine' ? { gapWidthPct } : {}),
    ...(currentKind === 'doughnut' ? { holeSizePct } : {}),
    ...(!['pie', 'pie3D', 'doughnut'].includes(currentKind)
      ? { gridlines, catAxisTitle, valAxisTitle }
      : {}),
    ...(title !== (chart.chart.title ?? '') ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(dataEdited ? { categories: parsedCategories, series: parsedSeries } : {}),
    ...(legend !== (chart.chart.legendPos ?? 'none') ? { legendPos: legend } : {}),
    ...(labels !== null ? { dataLabels: labels } : {}),
  }
  const changed = Object.values(patch).some((value) => value !== undefined)
  const submit = (next: Record<string, unknown>) => {
    if (pending.current) return
    const imported = chart.descr !== 'aislides-chart'
    if (imported && !window.confirm('将此导入图表转换为可编辑图表？特殊图表格式可能简化。')) return
    pending.current = true
    setBusy(true)
    void apply({
      target,
      patch: next,
      ...(dataEdited ? { dataSource: 'user' } : {}),
      ...(imported ? { confirmImport: true } : {}),
    }).finally(() => {
      pending.current = false
      setBusy(false)
    })
  }
  return (
    <fieldset disabled={busy} className="mimir-pptx-chart-editor" aria-busy={busy}>
      <div
        className="mimir-pptx-chart-tabs"
        onKeyDown={(event) => {
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          )
          const index = tabs.indexOf(event.target as HTMLButtonElement)
          if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          tabs[next]?.click()
          tabs[next]?.focus()
        }}
      >
        <ToolbarTabs
          label="图表编辑分类"
          value={section}
          items={[
            { value: 'style', label: '样式' },
            { value: 'colors', label: '配色' },
            { value: 'data', label: '数据' },
          ]}
          onChange={setSection}
        />
      </div>
      <div
        className="mimir-pptx-chart-editor__content"
        role="tabpanel"
        aria-label={{ style: '图表样式', colors: '图表配色', data: '图表数据' }[section]}
        id={panelId}
      >
        <ToolbarPropertyForm columns={1}>
          {section === 'style' && (
            <>
              <ToolbarMenuFields label="编辑选中图表">
                <ToolbarTextField label="图表标题" value={title} onChange={setTitle} />
                <ToolbarSelect
                  label="更改图表类型"
                  value={currentKind}
                  options={KINDS.map((value) => ({ value, label: KIND_LABELS[value]! }))}
                  onChange={setKind}
                />
                <ToolbarSelect
                  label="图例位置"
                  value={legend}
                  options={[
                    { value: 'none', label: '无图例' },
                    { value: 'b', label: '底部' },
                    { value: 't', label: '顶部' },
                    { value: 'l', label: '左侧' },
                    { value: 'r', label: '右侧' },
                    ...(legend === 'tr' ? [{ value: 'tr', label: '右上（当前）' }] : []),
                  ]}
                  onChange={setLegend}
                />
                <ToolbarSelect
                  label="数据标签"
                  value={labels === null ? 'keep' : String(labels)}
                  options={[
                    {
                      value: 'keep',
                      label: `保留当前（${chart.chart.dataLabels ? '显示数值' : '隐藏数值'}）`,
                    },
                    { value: 'true', label: '显示数值' },
                    { value: 'false', label: '隐藏数值' },
                  ]}
                  onChange={(value) => setLabels(value === 'keep' ? null : value === 'true')}
                />
              </ToolbarMenuFields>
            </>
          )}
          {section !== 'data' && (
            <PptxChartAppearance
              chart={chart.chart}
              kind={kind}
              section={section}
              patch={appearance}
              setPatch={setAppearance}
              preset={(legendPos, dataLabels, style) => {
                setLegend(legendPos)
                setLabels(dataLabels)
                setAppearance((current) => ({ ...current, ...style }))
              }}
            />
          )}
          {section === 'data' && (
            <ToolbarMenuFields label="图表数据">
              <ToolbarButton
                label="切换图表行列"
                disabled={busy || changed}
                disabledReason={changed ? '先应用或放弃当前修改，再切换行列' : undefined}
                onClick={() => submit({ switchRowCol: true })}
              >
                切换行列
              </ToolbarButton>
              <ToolbarTextArea
                label="类别（每行一项）"
                value={categories}
                rows={3}
                onChange={(value) => {
                  setCategories(value)
                  setDataEdited(true)
                }}
              />
              <ToolbarSelect
                label="要编辑的系列"
                value={String(dataSeries)}
                options={series.map((item, index) => ({
                  value: String(index),
                  label: item.name || `系列${index + 1}`,
                }))}
                onChange={(value) => setDataSeries(Number(value))}
              />
              {series.map(
                (item, index) =>
                  dataSeries === index && (
                    <ToolbarMenuFields key={item.key} label={`系列 ${index + 1}`}>
                      <ToolbarTextField
                        label={`系列 ${index + 1} 名称`}
                        value={item.name}
                        onChange={(value) => {
                          setSeries((items) =>
                            items.map((entry, at) =>
                              at === index ? { ...entry, name: value } : entry,
                            ),
                          )
                          setDataEdited(true)
                        }}
                      />
                      <ToolbarTextArea
                        label={`系列 ${index + 1} 数值（每行一项）`}
                        value={item.values}
                        rows={3}
                        onChange={(value) => {
                          setSeries((items) =>
                            items.map((entry, at) =>
                              at === index ? { ...entry, values: value } : entry,
                            ),
                          )
                          setDataEdited(true)
                        }}
                      />
                      <ToolbarButton
                        label={`删除系列 ${index + 1}`}
                        disabled={series.length <= 1}
                        disabledReason="至少保留一个系列"
                        onClick={() => {
                          setSeries((items) => items.filter((_, at) => at !== index))
                          setDataSeries(Math.max(0, index - 1))
                          setDataEdited(true)
                        }}
                      >
                        删除系列
                      </ToolbarButton>
                    </ToolbarMenuFields>
                  ),
              )}
              <ToolbarButton
                label="添加图表系列"
                disabled={series.length >= 20}
                disabledReason="最多20个系列"
                onClick={() => {
                  setDataSeries(series.length)
                  setSeries((items) => [
                    ...items,
                    {
                      key: crypto.randomUUID(),
                      name: `系列${items.length + 1}`,
                      values: parsedCategories.map(() => 0).join('\n'),
                    },
                  ])
                  setDataEdited(true)
                }}
              >
                添加系列
              </ToolbarButton>
            </ToolbarMenuFields>
          )}
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-chart-editor__actions">
        {chart.descr !== 'aislides-chart' && (
          <ToolbarMenuNote>
            首次编辑将转换导入图表，特殊格式可能简化。应用时需要确认。
          </ToolbarMenuNote>
        )}
        <ToolbarButton
          primary
          label="应用图表修改"
          disabled={!changed || busy || Boolean(reason)}
          disabledReason={busy ? '正在修改图表' : (reason ?? '图表没有变化')}
          onClick={() => submit(patch)}
        />
      </div>
    </fieldset>
  )
}

const EFFECT_LABELS: Record<string, string> = PPTX_ANIMATION_LABELS
export type PptxPlaybackSection = 'effects' | 'timeline' | 'transition' | 'notes'
const TRIGGER_LABELS = { onClick: '单击时', withPrev: '与上一动画同时', afterPrev: '上一动画之后' }
export function SlidePlaybackControls({
  slide,
  index,
  notes,
  target,
  apply,
  editTiming,
  editStyle,
  applyBatch,
  applyAnimation,
  slideCount = 1,
  onPreview,
  previewing = false,
  initialSection = 'effects',
  onSectionChange,
}: {
  slide: Slide
  index: number
  notes: string
  target: Target | null
  apply: Apply
  applyBatch?: (ops: Record<string, unknown>[]) => Promise<boolean>
  applyAnimation?: (input: PptxManualAnimation, signal: AbortSignal) => Promise<boolean>
  slideCount?: number
  onPreview?: (request: PptxAnimationPreviewRequest | null) => void
  previewing?: boolean
  initialSection?: PptxPlaybackSection
  onSectionChange?: (value: PptxPlaybackSection) => void
  editTiming?: (patch: Record<string, unknown>) => Promise<boolean>
  editStyle?: (input: Extract<PptxManualAsset, { kind: 'animation_style' }>) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [section, setSection] = useState<PptxPlaybackSection>(initialSection)
  const [error, setError] = useState('')
  const [cancellable, setCancellable] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const previewNonce = useRef(0)
  useEffect(() => () => operation.current?.abort(), [])
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const pending = useRef(false)
  const animationOccurrences = new Map<string, number>()
  const animations = getSlideAnimations(slide)
  const timeline = animations.map((item) => {
    const signature = [
      item.spid,
      item.effect,
      item.trigger,
      item.durationMs,
      item.delayMs,
      item.paragraph,
    ].join(':')
    const occurrence = animationOccurrences.get(signature) ?? 0
    animationOccurrences.set(signature, occurrence + 1)
    return { item, key: `${signature}:${occurrence}` }
  })
  const advance = readSlideAdvanceTimeXml(slide.bodySuffix)
  const currentTransition = readSlideTransitionXml(slide.bodySuffix)
  const submit = async (op: Record<string, unknown>) => {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    try {
      return await apply(op)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const submitTiming = async (patch: Record<string, unknown>) => {
    if (!editTiming || pending.current) return false
    pending.current = true
    setBusy(true)
    try {
      return await editTiming(patch)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const submitStyle = async (input: Extract<PptxManualAsset, { kind: 'animation_style' }>) => {
    if (!editStyle || pending.current) return false
    pending.current = true
    setBusy(true)
    onPreview?.(null)
    try {
      return await editStyle(input)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const submitManual = async (input: PptxManualAnimation) => {
    if (pending.current) return false
    const controller = new AbortController()
    operation.current = controller
    pending.current = true
    setBusy(true)
    setError('')
    setCancellable(true)
    onPreview?.(null)
    try {
      if (applyAnimation) return await applyAnimation(input, controller.signal)
      const ops =
        input.kind === 'transition-all'
          ? Array.from({ length: slideCount }, (_, slideIndex) => ({
              op: 'setTransition',
              target: { slide: slideIndex },
              kind: currentTransition,
            }))
          : pptxAnimationOps(
              slide,
              { slide: input.slide, el: input.elementId },
              input.operation === 'remove' ? 'none' : { ...input, effect: input.effect! },
              input.operation !== 'add',
            )
      if (applyBatch) return await applyBatch(ops)
      if (ops.length === 1) return await apply(ops[0]!)
      throw new Error('批量动画宿主不可用，请刷新后重试')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '动画操作失败，请重试')
      return false
    } finally {
      if (!controller.signal.aborted) {
        pending.current = false
        setBusy(false)
        setCancellable(false)
      }
      if (operation.current === controller) operation.current = null
    }
  }
  return (
    <div className="mimir-pptx-animation" aria-busy={busy}>
      <div className="mimir-pptx-animation__header">
        <ToolbarTabs<PptxPlaybackSection>
          label="放映工具分类"
          value={section}
          items={[
            { value: 'effects', label: '效果' },
            { value: 'timeline', label: '时间线' },
            { value: 'transition', label: '切换' },
            { value: 'notes', label: '备注' },
          ]}
          onChange={(value) => {
            onPreview?.(null)
            setSection(value)
            onSectionChange?.(value)
          }}
        />
        <ToolbarMenuNote>
          {animations.length ? `共 ${animations.length} 个动画` : '本页没有动画'}
        </ToolbarMenuNote>
        {onPreview && (
          <ToolbarButton
            label={previewing ? '停止动画预览' : '预览本页动画'}
            disabled={busy || animations.length === 0}
            disabledReason={busy ? '正在修改动画' : '本页没有动画'}
            onClick={() => onPreview(previewing ? null : { token: ++previewNonce.current })}
          >
            {previewing ? <Square size={16} /> : <Play size={16} />}
            <span>{previewing ? '停止预览' : '预览本页'}</span>
          </ToolbarButton>
        )}
        {cancellable && (
          <ToolbarButton
            label="取消动画操作"
            onClick={() => {
              operation.current?.abort()
              operation.current = null
              pending.current = false
              setBusy(false)
              setCancellable(false)
              setError('已取消，文稿保持原状')
            }}
          >
            <Square size={16} />
            <span>取消</span>
          </ToolbarButton>
        )}
        {error && (
          <p className="mimir-pptx-animation__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="mimir-pptx-animation__body">
        {section === 'effects' && (
          <PptxAnimationGallery
            key={target?.el ?? 'none'}
            slide={slide}
            target={target}
            busy={busy}
            run={submitManual}
            onPreview={onPreview}
          />
        )}
        {section === 'notes' && (
          <PptxControlPanel busy={busy}>
            <ToolbarMenuFields label="本页讲稿">
              <ToolbarTextArea
                label="演讲者备注"
                rows={4}
                value={draft ?? notes}
                onChange={(value) => {
                  revision.current++
                  setDraft(value)
                }}
              />
              <ToolbarButton
                label="应用演讲者备注"
                disabled={busy || draft === null || draft === notes}
                disabledReason={busy ? '正在修改幻灯片' : '备注没有变化'}
                onClick={() => {
                  const submitted = revision.current
                  void submit({
                    op: 'setNotes',
                    target: { slide: index },
                    text: draft ?? notes,
                  }).then((ok) => {
                    if (ok && submitted === revision.current) setDraft(null)
                  })
                }}
              >
                应用备注
              </ToolbarButton>
            </ToolbarMenuFields>
          </PptxControlPanel>
        )}
        {section === 'transition' && (
          <PptxControlPanel busy={busy}>
            <ToolbarMenuFields label="切换与换页">
              <ToolbarSelect
                label="本页切换效果"
                value={currentTransition}
                options={TRANSITION_KINDS.map((value) => ({
                  value,
                  label: {
                    none: '无切换',
                    morph: '平滑',
                    fade: '淡入',
                    push: '推进',
                    wipe: '擦除',
                    split: '劈裂',
                    circle: '圆形',
                    cover: '覆盖',
                    pull: '揭开',
                    dissolve: '溶解',
                    zoom: '缩放',
                    random: '随机',
                  }[value],
                }))}
                disabled={busy}
                onChange={(kind) =>
                  void submit({ op: 'setTransition', target: { slide: index }, kind })
                }
              />
              <ToolbarMenuNote>
                {advance === null ? '当前手动换页' : `当前 ${advance / 1000} 秒后自动换页`}
              </ToolbarMenuNote>
              <ToolbarNumberField
                label="自动换页秒数"
                value={(advance ?? 5000) / 1000}
                min={0}
                max={3600}
                step={1}
                disabled={busy}
                onCommit={(seconds) =>
                  void submit({
                    op: 'setAdvanceTime',
                    target: { slide: index },
                    ms: Math.round(seconds * 1000),
                  })
                }
              />
              <ToolbarButton
                label="关闭自动换页"
                disabled={busy || advance === null}
                onClick={() =>
                  void submit({ op: 'setAdvanceTime', target: { slide: index }, ms: null })
                }
              >
                手动换页
              </ToolbarButton>
            </ToolbarMenuFields>
          </PptxControlPanel>
        )}
        {section === 'timeline' && (
          <PptxControlPanel busy={busy}>
            <ToolbarMenuFields label="本页动画">
              <ToolbarMenuNote>
                {animations.length ? `共 ${animations.length} 个动画` : '本页没有动画'}
              </ToolbarMenuNote>
              {timeline.map(({ item, key }, seq) => (
                <ToolbarMenuFields key={key} label={`动画 ${seq + 1}`}>
                  <ToolbarMenuNote>
                    {EFFECT_LABELS[item.effect] ?? item.effect} · {TRIGGER_LABELS[item.trigger]} ·{' '}
                    {item.durationMs}ms · 延迟 {item.delayMs}ms
                    {item.presetXml ? ' · 保留原始效果' : ''}
                  </ToolbarMenuNote>
                  {editTiming && (
                    <>
                      <ToolbarSelect
                        label={`动画 ${seq + 1} 开始方式`}
                        value={item.trigger}
                        disabled={busy}
                        options={ANIM_TRIGGERS.map((value) => ({
                          value,
                          label: TRIGGER_LABELS[value],
                        }))}
                        onChange={(value) =>
                          void submitTiming({ target: { slide: index }, seq, trigger: value })
                        }
                      />
                      <ToolbarNumberField
                        label={`动画 ${seq + 1} 持续毫秒`}
                        value={item.durationMs}
                        min={0}
                        max={60000}
                        step={100}
                        disabled={busy}
                        onCommit={(durationMs) =>
                          void submitTiming({ target: { slide: index }, seq, durationMs })
                        }
                      />
                      <ToolbarNumberField
                        label={`动画 ${seq + 1} 延迟毫秒`}
                        value={item.delayMs}
                        min={0}
                        max={60000}
                        step={100}
                        disabled={busy}
                        onCommit={(delayMs) =>
                          void submitTiming({ target: { slide: index }, seq, delayMs })
                        }
                      />
                    </>
                  )}
                  {editStyle && (
                    <>
                      <ToolbarSelect
                        label={`动画 ${seq + 1} 效果`}
                        value={item.effect}
                        options={ANIM_EFFECTS.map((value) => ({
                          value,
                          label: EFFECT_LABELS[value] ?? value,
                        }))}
                        onChange={(value) =>
                          void submitStyle({
                            kind: 'animation_style',
                            slide: index,
                            seq,
                            effect: value as AnimEffectKind,
                          })
                        }
                      />
                      {['flyIn', 'flyOut', 'wipe', 'wipeOut'].includes(item.effect) && (
                        <ToolbarSelect
                          label={`动画 ${seq + 1} 方向`}
                          value={item.direction ?? 'bottom'}
                          options={[
                            { value: 'top', label: '从上方' },
                            { value: 'bottom', label: '从下方' },
                            { value: 'left', label: '从左侧' },
                            { value: 'right', label: '从右侧' },
                          ]}
                          onChange={(value) =>
                            void submitStyle({
                              kind: 'animation_style',
                              slide: index,
                              seq,
                              direction: value as 'top' | 'bottom' | 'left' | 'right',
                            })
                          }
                        />
                      )}
                      {!item.effect.startsWith('media') && (
                        <ToolbarNumberField
                          label={`动画 ${seq + 1} 目标段落（0为整个对象）`}
                          value={item.paragraph === undefined ? 0 : item.paragraph + 1}
                          min={0}
                          max={1000}
                          onCommit={(value) =>
                            void submitStyle({
                              kind: 'animation_style',
                              slide: index,
                              seq,
                              paragraph: value === 0 ? null : value - 1,
                            })
                          }
                        />
                      )}
                      {item.effect === 'motionPath' && (
                        <MotionPathControl
                          seq={seq}
                          value={item.motionPath ?? 'M 0 0 L 0.25 0'}
                          apply={(path) =>
                            editStyle({
                              kind: 'animation_style',
                              slide: index,
                              seq,
                              motionPath: path,
                            })
                          }
                        />
                      )}
                    </>
                  )}
                  <ToolbarButton
                    label={`上移动画 ${seq + 1}`}
                    disabled={busy || seq === 0}
                    onClick={() =>
                      void submit({
                        op: 'reorderAnimation',
                        target: { slide: index },
                        seq,
                        to: seq - 1,
                      })
                    }
                  >
                    上移
                  </ToolbarButton>
                  <ToolbarButton
                    label={`下移动画 ${seq + 1}`}
                    disabled={busy || seq === animations.length - 1}
                    onClick={() =>
                      void submit({
                        op: 'reorderAnimation',
                        target: { slide: index },
                        seq,
                        to: seq + 1,
                      })
                    }
                  >
                    下移
                  </ToolbarButton>
                  <ToolbarButton
                    label={`删除动画 ${seq + 1}`}
                    disabled={busy}
                    onClick={() =>
                      void submit({ op: 'removeAnimation', target: { slide: index }, seq })
                    }
                  >
                    删除动画
                  </ToolbarButton>
                </ToolbarMenuFields>
              ))}
              <ToolbarMenuNote>
                动画顺序和时间保存在文件中，可在 PowerPoint 放映时播放。
              </ToolbarMenuNote>
            </ToolbarMenuFields>
          </PptxControlPanel>
        )}
      </div>
      {section === 'transition' && (
        <div className="mimir-pptx-animation__footer">
          <ToolbarButton
            label="将本页切换应用到全部幻灯片"
            primary
            disabled={busy || slideCount < 2}
            disabledReason={busy ? '正在应用切换' : '文稿只有一页'}
            onClick={() => void submitManual({ kind: 'transition-all', slide: index })}
          >
            <Layers size={16} />
          </ToolbarButton>
        </div>
      )}
    </div>
  )
}

function MotionPathControl({
  seq,
  value,
  apply,
}: {
  seq: number
  value: string
  apply: (value: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(value)
  return (
    <>
      <ToolbarTextField label={`动画 ${seq + 1} 运动路径`} value={draft} onChange={setDraft} />
      <ToolbarButton
        label={`应用动画 ${seq + 1} 运动路径`}
        disabled={draft === value}
        onClick={() => void apply(draft)}
      >{`应用动画 ${seq + 1} 运动路径`}</ToolbarButton>
    </>
  )
}
