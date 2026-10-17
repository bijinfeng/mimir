import { useEffect, useRef, useState } from 'react'
import { Check, FlipHorizontal2, FlipVertical2, RotateCcw } from 'lucide-react'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ToolbarButton,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import {
  PPTX_SHAPES,
  isPptxLineKind,
  pptxShapeLabel,
  pptxShapePreview,
} from './pptx-shape-presets.js'
import {
  pptxGeometryContext,
  pptxGeometryPreset,
  pptxGeometryValue,
  pptxSelectionGeometryOps,
  type PptxGeometryField,
  type PptxSelectionGeometryDraft,
} from './pptx-selection-geometry.js'
import type { PptxSelectionContext } from './pptx-selection.js'
import './pptx-selection-geometry.css'

export interface PptxSelectionGeometryControlsProps {
  elements: readonly SlideElement[]
  selectedRefs: readonly string[]
  slide: number
  version: number
  sourceKey?: string
  disabled?: boolean
  applyOps: (ops: Record<string, unknown>[]) => Promise<boolean>
}
export function PptxSelectionGeometryControls(props: PptxSelectionGeometryControlsProps) {
  const { context, reason } = pptxGeometryContext(props.elements, props.selectedRefs)
  const binding = JSON.stringify([props.sourceKey, props.slide, props.version, props.selectedRefs])
  return context ? (
    <GeometryDraft key={binding} {...props} context={context} />
  ) : (
    <div className="mimir-pptx-selection-geometry__empty">
      <ToolbarMenuNote>{reason}</ToolbarMenuNote>
    </div>
  )
}
function GeometryDraft({
  context,
  selectedRefs,
  slide,
  applyOps,
  disabled = false,
}: PptxSelectionGeometryControlsProps & { context: PptxSelectionContext }) {
  const [draft, setDraft] = useState<PptxSelectionGeometryDraft>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const locked = disabled || busy
  const dirty = Object.keys(draft).length > 0
  const preset = pptxGeometryPreset(context)
  const selectedPreset = draft.preset ?? preset
  const shapeOptions = PPTX_SHAPES.filter((item) => !isPptxLineKind(item.kind)).map((item) => ({
    value: item.kind,
    label: item.label,
  }))
  if (preset && !shapeOptions.some((item) => item.value === preset))
    shapeOptions.unshift({ value: preset, label: `${pptxShapeLabel(preset)}（当前）` })
  const preview = selectedPreset ? pptxShapePreview(selectedPreset, 44, 32) : null
  const change = (patch: PptxSelectionGeometryDraft) => {
    if (locked) return
    setDraft((current) => ({ ...current, ...patch }))
    setError('')
    setStatus('')
  }
  const reset = () => {
    if (locked) return
    setDraft({})
    setError('')
    setStatus('已恢复当前值')
  }
  const submit = async () => {
    if (locked || pending.current || !dirty) return
    let ops: Record<string, unknown>[]
    try {
      ops = pptxSelectionGeometryOps(context, selectedRefs[0]!, slide, draft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '草稿无法应用，请检查数值')
      return
    }
    if (!ops.length) {
      setDraft({})
      setStatus('当前值未改变')
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const ok = await applyOps(ops)
      if (controller.signal.aborted) return
      if (ok) {
        setDraft({})
        setStatus('位置与形状已应用')
      } else setError('未能应用，已保留草稿，请重试')
    } catch {
      if (!controller.signal.aborted) setError('未能应用，已保留草稿，请重试')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  const field = (key: PptxGeometryField, label: string) => (
    <ToolbarTextField
      label={label}
      value={draft[key] ?? pptxGeometryValue(context, key)}
      onChange={(value) => change({ [key]: value })}
      onSubmit={() => void submit()}
      onCancel={reset}
    />
  )
  const flipH = draft.flipH ?? context.element.transform.flipH
  const flipV = draft.flipV ?? context.element.transform.flipV
  return (
    <fieldset
      className="mimir-pptx-selection-geometry"
      disabled={locked}
      aria-label="对象位置与形状"
      aria-busy={busy}
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          dirty &&
          !locked &&
          event.target instanceof HTMLInputElement &&
          event.target.getAttribute('role') !== 'combobox'
        ) {
          event.preventDefault()
          event.stopPropagation()
          reset()
        }
      }}
    >
      <div className="mimir-pptx-selection-geometry__content">
        <section className="mimir-pptx-selection-geometry__section" aria-label="位置与大小">
          <strong>位置与大小</strong>
          <ToolbarMenuNote>
            {context.group ? '父组合局部坐标 · pt' : '幻灯片坐标 · pt'}
          </ToolbarMenuNote>
          {context.group && (
            <ToolbarMenuNote>坐标沿父组合缩放、旋转与翻转；数值不是画布绝对位置。</ToolbarMenuNote>
          )}
          <ToolbarPropertyForm>
            {field('x', '水平位置（pt）')}
            {field('y', '垂直位置（pt）')}
            {field('width', '宽度（pt）')}
            {field('height', '高度（pt）')}
          </ToolbarPropertyForm>
        </section>
        <section className="mimir-pptx-selection-geometry__section" aria-label="旋转与翻转">
          <strong>旋转与翻转</strong>
          <ToolbarPropertyForm columns={1}>
            {field('rotation', '旋转角度（°）')}
          </ToolbarPropertyForm>
          <div className="mimir-pptx-selection-geometry__flips">
            <ToolbarButton
              label="水平翻转"
              active={flipH}
              disabled={locked}
              onClick={() => change({ flipH: !flipH })}
            >
              <FlipHorizontal2 size={14} />
              水平翻转
            </ToolbarButton>
            <ToolbarButton
              label="垂直翻转"
              active={flipV}
              disabled={locked}
              onClick={() => change({ flipV: !flipV })}
            >
              <FlipVertical2 size={14} />
              垂直翻转
            </ToolbarButton>
          </div>
          <ToolbarMenuNote>翻转保持旋转后的中心，位置数值可能随之调整。</ToolbarMenuNote>
        </section>
        {preset && (
          <section className="mimir-pptx-selection-geometry__section" aria-label="形状预设">
            <strong>形状预设</strong>
            <div className="mimir-pptx-selection-geometry__preset-preview">
              {preview && (
                <svg viewBox="-4 -4 52 40" aria-hidden="true">
                  <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                    {preview.path && <path d={preview.path} />}
                    {preview.fillPath && <path d={preview.fillPath} />}{' '}
                    {preview.strokePath && <path d={preview.strokePath} />}
                  </g>
                </svg>
              )}
              <span>{pptxShapeLabel(selectedPreset ?? undefined)}</span>
            </div>
            <ToolbarPropertyForm columns={1}>
              <ToolbarSelect
                label="更改形状"
                value={selectedPreset}
                options={shapeOptions}
                disabled={locked}
                onChange={(value) => change({ preset: value })}
              />
            </ToolbarPropertyForm>
            <ToolbarMenuNote>
              更改预设保留文字与样式，形状调节点恢复为新预设默认值。
            </ToolbarMenuNote>
          </section>
        )}
      </div>
      <div className="mimir-pptx-selection-geometry__actions">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <ToolbarMenuNote>
            {busy
              ? '正在应用位置与形状…'
              : dirty
                ? '草稿未应用；关闭面板会丢弃。'
                : status || '修改数值后应用。'}
          </ToolbarMenuNote>
        )}
        <ToolbarButton
          label={busy ? '正在应用位置与形状' : '应用位置与形状'}
          primary
          disabled={locked || !dirty}
          disabledReason={busy ? '正在应用' : '请先修改位置或形状'}
          onClick={() => void submit()}
        >
          <Check size={14} />
        </ToolbarButton>
        <ToolbarButton label="取消位置与形状草稿" disabled={locked || !dirty} onClick={reset}>
          <RotateCcw size={14} />
          取消草稿
        </ToolbarButton>
      </div>
    </fieldset>
  )
}
