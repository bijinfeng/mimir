import { useLayoutEffect, useRef, useState } from 'react'
import type { PptxManualFill } from '@mimir/shared'
import type { Fill, Slide, SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import type { PptxTarget } from './PptxControlPanel.js'
import {
  PPTX_FILL_TEXTURES,
  pptxBackgroundFillOps,
  pptxFillDraft,
  pptxFillPreview,
  pptxFillSummary,
  pptxGradientPresets,
  pptxShapeFillOp,
  type PptxFillDraft,
} from './pptx-fill-presets.js'
import './pptx-fill-controls.css'

type ApplyFill = (input: PptxManualFill) => Promise<boolean>
type ApplyOps = (ops: Record<string, unknown>[]) => Promise<boolean>
const COLORS = [
  '#FFFFFF',
  '#000000',
  '#4472C4',
  '#ED7D31',
  '#FFC000',
  '#70AD47',
  '#00B0F0',
  '#7030A0',
].map((value) => ({ value, label: value, swatch: value }))
function FillColor({
  label,
  value,
  change,
}: {
  label: string
  value: string
  change: (color: string) => void
}) {
  return (
    <div className="mimir-pptx-fill-colors">
      <ToolbarTextField label={label} value={value} onChange={change} />
      <ToolbarColorPicker label={`选择${label}`} value={value} options={COLORS} onPick={change} />
    </div>
  )
}
async function textureSource(id: string): Promise<string> {
  const texture = PPTX_FILL_TEXTURES.find((item) => item.id === id)
  if (!texture) throw new Error('请选择纹理')
  const response = await fetch(texture.url)
  if (!response.ok) throw new Error('纹理载入失败，请重试')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error('纹理资源无效')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function validDraft(draft: PptxFillDraft) {
  const hex = /^#[\da-f]{6}([\da-f]{2})?$/i
  return (
    hex.test(draft.color) &&
    draft.stops.every(
      (stop) => hex.test(stop.color) && Number.isFinite(stop.pos) && stop.pos >= 0 && stop.pos <= 1,
    )
  )
}
function FillEditor({
  fill,
  version,
  background,
  slideIndex,
  slideCount,
  hidden,
  own,
  target,
  applyOps,
  applyFill,
  media,
}: {
  fill: Fill | undefined
  version: number
  background: boolean
  slideIndex: number
  slideCount: number
  hidden?: boolean
  own?: boolean
  target: PptxTarget | null
  applyOps: ApplyOps
  applyFill?: ApplyFill
  media?: ReadonlyMap<string, string>
}) {
  const [seenVersion, setSeenVersion] = useState(version)
  const [draft, setDraft] = useState<PptxFillDraft | null>(null)
  const [stopIndex, setStopIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const operationEpoch = useRef<{
    version: number
    slideIndex: number
    element: string | undefined
    live: boolean
  } | null>(null)
  useLayoutEffect(() => {
    const activation = { version, slideIndex, element: target?.el, live: true }
    operationEpoch.current = activation
    return () => {
      activation.live = false
    }
  }, [version, slideIndex, target?.el])
  if (seenVersion !== version) {
    setSeenVersion(version)
    setDraft(null)
    setError('')
  }
  const current = draft ?? pptxFillDraft(fill)
  const selectedStop = Math.min(stopIndex, current.stops.length - 1)
  const stop = current.stops[selectedStop]!
  const update = (patch: Partial<PptxFillDraft>) => {
    setDraft({ ...current, ...patch })
    setError('')
  }
  const updateStop = (patch: Partial<typeof stop>) =>
    update({
      stops: current.stops.map((item, index) =>
        index === selectedStop ? { ...item, ...patch } : item,
      ),
    })
  const perform = async (ops: () => Promise<Record<string, unknown>[] | PptxManualFill>) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    const submitted = draft
    const submittedEpoch = operationEpoch.current
    try {
      const prepared = await ops()
      if (!submittedEpoch?.live || operationEpoch.current !== submittedEpoch) return
      if (!Array.isArray(prepared) && !applyFill) throw new Error('当前未连接手动填充宿主')
      if (await (Array.isArray(prepared) ? applyOps(prepared) : applyFill!(prepared))) {
        if (!background && submitted?.mode === 'gradient')
          setStopIndex(
            submitted.stops
              .toSorted((a, b) => a.pos - b.pos)
              .indexOf(submitted.stops[selectedStop]!),
          )
        setDraft((value) => (value === submitted ? null : value))
      }
    } catch (cause) {
      if (submittedEpoch?.live && operationEpoch.current === submittedEpoch)
        setError(cause instanceof Error ? cause.message : '应用失败，请重试')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const imageCommand = (
    source: Extract<PptxManualFill, { kind: 'shape' }>['source'],
    allSlides: boolean,
    tile: boolean,
  ): PptxManualFill => {
    if (background) return { kind: 'background', slide: slideIndex, allSlides, source, tile }
    if (!target) throw new Error('请选择形状或文本框')
    return { kind: 'shape', slide: target.slide, elementId: target.el, source, tile }
  }
  const submit = (all: boolean) =>
    perform(async () => {
      if (!draft && all && background)
        return { kind: 'copy-current-background', slide: slideIndex, allSlides: true }
      if (current.mode === 'texture')
        return imageCommand(
          {
            kind: 'texture',
            id: current.texture as Extract<
              Extract<PptxManualFill, { kind: 'shape' }>['source'],
              { kind: 'texture' }
            >['id'],
            png: await textureSource(current.texture),
          },
          all,
          true,
        )
      return background
        ? pptxBackgroundFillOps(
            current,
            all ? Array.from({ length: slideCount }, (_, index) => index) : [slideIndex],
          )
        : target
          ? [pptxShapeFillOp(current, target)]
          : []
    })
  const unavailable = !background && !target
  const complexBackground =
    background &&
    fill?.type === 'gradient' &&
    (fill.stops.length !== 2 ||
      fill.stops[0]?.pos !== 0 ||
      fill.stops[1]?.pos !== 1 ||
      Boolean(fill.path && fill.path !== 'circle') ||
      fill.scaled === false ||
      Boolean(fill.tileRect) ||
      Boolean(fill.fillTo && Object.values(fill.fillTo).some((value) => value !== 0.5)))
  const previewUrl = !draft && fill?.type === 'image' ? media?.get(fill.mediaRef) : undefined
  return (
    <fieldset className="mimir-pptx-fill-editor" disabled={busy} aria-busy={busy}>
      <div className="mimir-pptx-fill-editor__content">
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuNote>
            当前填充：{pptxFillSummary(fill)}
            {background ? (own ? ' · 本页自定义' : ' · 继承母版') : ''}
          </ToolbarMenuNote>
          {unavailable && <ToolbarMenuNote>请选择形状或文本框</ToolbarMenuNote>}
          <ToolbarMenuFields label="填充方式">
            <ToolbarSelect
              label="填充类型"
              value={
                !draft && fill?.type === 'image'
                  ? 'image'
                  : !draft && fill?.type === 'pattern'
                    ? 'pattern'
                    : current.mode
              }
              disabled={unavailable}
              options={[
                { value: 'none', label: background ? '使用母版背景' : '无填充' },
                { value: 'solid', label: '纯色' },
                { value: 'gradient', label: '渐变' },
                { value: 'texture', label: '纹理' },
                ...(!draft && fill?.type === 'image'
                  ? [{ value: 'image', label: '当前图片填充' }]
                  : []),
                ...(!draft && fill?.type === 'pattern'
                  ? [{ value: 'pattern', label: '当前图案填充' }]
                  : []),
              ]}
              onChange={(mode) => {
                if (['solid', 'gradient', 'texture', 'none'].includes(mode))
                  update({
                    mode: mode as PptxFillDraft['mode'],
                    ...(background
                      ? {
                          stops: [
                            { ...current.stops[0]!, pos: 0 },
                            { ...current.stops.at(-1)!, pos: 1 },
                          ],
                          path: current.path ? 'circle' : '',
                        }
                      : {}),
                  })
              }}
            />
            {!draft && (fill?.type === 'image' || fill?.type === 'pattern') ? (
              previewUrl ? (
                <img className="mimir-pptx-fill-preview" src={previewUrl} alt="当前填充图片" />
              ) : (
                <ToolbarMenuNote>原有填充保留。可在图片填充工具中更换图片。</ToolbarMenuNote>
              )
            ) : (
              <div
                role="img"
                aria-label={draft ? '待应用填充预览' : '当前填充预览'}
                className={`mimir-pptx-fill-preview${current.mode === 'gradient' ? ' mimir-pptx-fill-preview--gradient' : ''}`}
                style={{ background: pptxFillPreview(current) }}
              />
            )}
          </ToolbarMenuFields>
          {!draft && fill?.type === 'image' && (
            <ToolbarMenuFields label="图片填充方式">
              <div className="mimir-pptx-fill-pair">
                {(['stretch', 'tile'] as const).map((mode) => (
                  <ToolbarButton
                    key={mode}
                    label={mode === 'tile' ? '平铺当前图片' : '拉伸当前图片'}
                    active={(fill.mode ?? 'stretch') === mode}
                    disabled={unavailable}
                    onClick={() =>
                      void perform(async () =>
                        imageCommand({ kind: 'current' }, false, mode === 'tile'),
                      )
                    }
                  >
                    {mode === 'tile' ? '平铺' : '拉伸填满'}
                  </ToolbarButton>
                ))}
              </div>
            </ToolbarMenuFields>
          )}
          {current.mode === 'solid' &&
            (draft || (fill?.type !== 'image' && fill?.type !== 'pattern')) && (
              <ToolbarMenuFields label="纯色填充">
                <FillColor
                  label="填充颜色"
                  value={current.color}
                  change={(color) => update({ color })}
                />
              </ToolbarMenuFields>
            )}
          {complexBackground && !draft && (
            <ToolbarMenuFields label="原有渐变">
              <ToolbarMenuNote>
                此背景含多个色标或自定义路径。应用到全部会完整保留原有设置；编辑颜色前可改为双色渐变。
              </ToolbarMenuNote>
              <ToolbarButton
                label="改为双色渐变"
                onClick={() =>
                  update({
                    stops: [
                      { ...current.stops[0]!, pos: 0 },
                      { ...current.stops.at(-1)!, pos: 1 },
                    ],
                    path: current.path ? 'circle' : '',
                  })
                }
              >
                改为双色渐变
              </ToolbarButton>
            </ToolbarMenuFields>
          )}
          {current.mode === 'gradient' && (!complexBackground || draft) && (
            <>
              <ToolbarMenuFields label="渐变预设">
                <div
                  className="mimir-pptx-fill-directions mimir-pptx-fill-gradient-presets"
                  role="group"
                  aria-label="渐变预设"
                >
                  {pptxGradientPresets(
                    /^#[\da-f]{6}/i.test(current.color) ? current.color.slice(0, 7) : '#4472C4',
                  ).map((preset) => (
                    <ToolbarButton
                      key={preset.label}
                      label={`渐变：${preset.label}`}
                      onClick={() =>
                        update({ stops: preset.stops, angle: preset.angle, path: preset.path })
                      }
                    >
                      <span className="mimir-pptx-fill-direction">
                        <span
                          className="mimir-pptx-fill-direction-preview"
                          aria-hidden="true"
                          style={{ background: pptxFillPreview({ ...current, ...preset }) }}
                        />
                        <span className="mimir-pptx-fill-direction-label" aria-hidden="true">
                          <span>{preset.tone}</span>
                          <span>{preset.direction}</span>
                        </span>
                      </span>
                    </ToolbarButton>
                  ))}
                </div>
              </ToolbarMenuFields>
              <ToolbarMenuFields label="方向与类型">
                <ToolbarSelect
                  label="渐变类型"
                  value={current.path}
                  options={[
                    { value: '', label: '线性' },
                    { value: 'circle', label: '径向（圆形）' },
                    ...(!background
                      ? [
                          { value: 'rect', label: '矩形路径' },
                          { value: 'shape', label: '形状路径' },
                        ]
                      : []),
                  ]}
                  onChange={(path) => update({ path: path as PptxFillDraft['path'] })}
                />
                <div className="mimir-pptx-fill-directions" role="group" aria-label="渐变方向预设">
                  {(
                    [
                      ['从左到右', 0, ''],
                      ['从上到下', 90, ''],
                      ['左上到右下', 45, ''],
                      ['由中心向外', 0, 'circle'],
                    ] as const
                  ).map(([label, angle, path]) => (
                    <ToolbarButton
                      key={label}
                      label={label}
                      active={
                        current.path === path && (path === 'circle' || current.angle === angle)
                      }
                      onClick={() => update({ angle, path })}
                    >
                      <span className="mimir-pptx-fill-direction">
                        <span
                          aria-hidden="true"
                          className="mimir-pptx-fill-direction-preview"
                          style={{ background: pptxFillPreview({ ...current, angle, path }) }}
                        />
                        <span>{label}</span>
                      </span>
                    </ToolbarButton>
                  ))}
                </div>
                {!current.path && (
                  <ToolbarNumberField
                    key={`${version}:${current.angle}`}
                    label="渐变角度（°）"
                    value={current.angle}
                    min={0}
                    max={360}
                    step={1}
                    onCommit={(angle) => update({ angle })}
                  />
                )}
              </ToolbarMenuFields>
              <ToolbarMenuFields label="渐变色标">
                <ToolbarSelect
                  label="当前色标"
                  value={String(selectedStop)}
                  options={current.stops.map((item, index) => ({
                    value: String(index),
                    label: `色标 ${index + 1} · ${Math.round(item.pos * 100)}%`,
                  }))}
                  onChange={(value) => setStopIndex(Number(value))}
                />
                <FillColor
                  label="色标颜色"
                  value={stop.color}
                  change={(color) => updateStop({ color })}
                />
                {!background && (
                  <>
                    <ToolbarNumberField
                      key={`${version}:${selectedStop}:${stop.pos}`}
                      label="色标位置（%）"
                      value={stop.pos * 100}
                      min={0}
                      max={100}
                      step={1}
                      onCommit={(value) => updateStop({ pos: value / 100 })}
                    />
                    <div className="mimir-pptx-fill-pair">
                      <ToolbarButton
                        label="添加渐变色标"
                        disabled={current.stops.length >= 16}
                        onClick={() => {
                          update({ stops: [...current.stops, { pos: 0.5, color: stop.color }] })
                          setStopIndex(current.stops.length)
                        }}
                      >
                        添加色标
                      </ToolbarButton>
                      <ToolbarButton
                        label="删除当前色标"
                        disabled={current.stops.length <= 2}
                        disabledReason="渐变至少保留两个色标"
                        onClick={() => {
                          update({
                            stops: current.stops.filter((_, index) => index !== selectedStop),
                          })
                          setStopIndex(0)
                        }}
                      >
                        删除色标
                      </ToolbarButton>
                    </div>
                  </>
                )}
                {background && (
                  <ToolbarMenuNote>
                    背景渐变使用起止两个颜色。选择方向或颜色后应用。
                  </ToolbarMenuNote>
                )}
              </ToolbarMenuFields>
            </>
          )}
          {current.mode === 'texture' && (
            <ToolbarMenuFields label="内置纹理">
              <div className="mimir-pptx-fill-textures" role="group" aria-label="内置纹理">
                {PPTX_FILL_TEXTURES.map((texture) => (
                  <ToolbarButton
                    key={texture.id}
                    label={`纹理：${texture.label}`}
                    active={current.texture === texture.id}
                    onClick={() => update({ texture: texture.id })}
                  >
                    <span className="mimir-pptx-fill-texture">
                      <img src={texture.url} alt="" />
                      <span>{texture.label}</span>
                    </span>
                  </ToolbarButton>
                ))}
              </div>
              <ToolbarMenuNote>原图平铺，可保存为可编辑的图片填充。</ToolbarMenuNote>
            </ToolbarMenuFields>
          )}
          {background && (
            <ToolbarMenuFields label="背景图形">
              <ToolbarButton
                label="隐藏背景图形"
                active={Boolean(hidden)}
                onClick={() =>
                  void perform(async () => [
                    {
                      op: 'setBackground',
                      target: { slide: slideIndex },
                      kind: 'graphics',
                      hidden: !hidden,
                    },
                  ])
                }
              >
                隐藏背景图形
              </ToolbarButton>
              <ToolbarMenuNote>
                {hidden ? '已隐藏母版和版式上的背景图形' : '正在显示母版和版式上的背景图形'}
              </ToolbarMenuNote>
              <ToolbarButton
                label="重置本页背景"
                disabled={!own}
                disabledReason="本页正在使用母版背景"
                onClick={() =>
                  void perform(async () => [
                    { op: 'setBackground', target: { slide: slideIndex }, kind: 'reset' },
                  ])
                }
              >
                重置本页背景
              </ToolbarButton>
            </ToolbarMenuFields>
          )}
          {error && (
            <div role="alert">
              <ToolbarMenuNote>{error}</ToolbarMenuNote>
            </div>
          )}
          {draft && !validDraft(current) && (
            <ToolbarMenuNote>颜色请输入 #RRGGBB 或 #RRGGBBAA。</ToolbarMenuNote>
          )}
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-fill-editor__actions">
        <ToolbarButton
          primary
          label={background ? '应用本页背景' : '应用形状填充'}
          disabled={busy || unavailable || !draft || !validDraft(current)}
          disabledReason={
            busy ? '正在应用填充' : unavailable ? '请选择形状或文本框' : '填充没有变化'
          }
          onClick={() => void submit(false)}
        />
        {background && (
          <ToolbarButton
            label="背景应用到全部幻灯片"
            disabled={busy || (Boolean(draft) && !validDraft(current)) || !applyFill}
            disabledReason={busy ? '正在应用填充' : '当前未连接手动填充宿主'}
            onClick={() => void submit(true)}
          >
            应用到全部幻灯片（{slideCount} 页）
          </ToolbarButton>
        )}
      </div>
    </fieldset>
  )
}
export function PptxShapeFillControls({
  element,
  target,
  version,
  applyOps,
  applyFill,
  media,
}: {
  element: SlideElement | null
  target: PptxTarget | null
  version: number
  applyOps: ApplyOps
  applyFill?: ApplyFill
  media?: ReadonlyMap<string, string>
}) {
  const fill = element?.type === 'shape' || element?.type === 'text' ? element.fill : undefined
  return (
    <FillEditor
      fill={fill}
      version={version}
      background={false}
      slideIndex={target?.slide ?? 0}
      slideCount={1}
      target={element?.type === 'shape' || element?.type === 'text' ? target : null}
      applyOps={applyOps}
      applyFill={applyFill}
      media={media}
    />
  )
}
export function PptxBackgroundControls({
  slide,
  slideIndex,
  slideCount,
  version,
  applyOps,
  applyFill,
  media,
}: {
  slide: Slide
  slideIndex: number
  slideCount: number
  version: number
  applyOps: ApplyOps
  applyFill?: ApplyFill
  media?: ReadonlyMap<string, string>
}) {
  return (
    <FillEditor
      fill={slide.background}
      hidden={slide.masterSpHidden}
      own={slide.bgOwn}
      version={version}
      background
      slideIndex={slideIndex}
      slideCount={slideCount}
      target={null}
      applyOps={applyOps}
      applyFill={applyFill}
      media={media}
    />
  )
}
