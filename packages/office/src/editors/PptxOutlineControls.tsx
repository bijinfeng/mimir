import { useEffect, useRef, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { SlideElement, Stroke } from '../../vendor/packages/pptx-engine/src/types.js'
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
import type { PptxApply, PptxTarget } from './PptxControlPanel.js'
import { pptxElementStroke, pptxOutlineOp, type PptxOutlineDraft } from './pptx-outline.js'
export { pptxElementStroke, pptxOutlineOp, type PptxOutlineDraft } from './pptx-outline.js'
import './pptx-outline-controls.css'

const PT = 12700
export const PPTX_OUTLINE_DASHES = [
  ['solid', '实线'],
  ['dash', '短划线'],
  ['sysDot', '点线'],
  ['dashDot', '点划线'],
  ['lgDash', '长划线'],
  ['lgDashDot', '长点划线'],
  ['lgDashDotDot', '长双点划线'],
  ['sysDash', '系统短划线'],
  ['sysDashDot', '系统点划线'],
  ['sysDashDotDot', '系统双点划线'],
  ['dot', '圆点线'],
].map(([value, label]) => ({ value: value!, label: label! }))
const COLORS = [
  ['#000000', '黑色'],
  ['#FFFFFF', '白色'],
  ['#C00000', '红色'],
  ['#ED7D31', '橙色'],
  ['#FFC000', '金色'],
  ['#70AD47', '绿色'],
  ['#4472C4', '蓝色'],
  ['#7030A0', '紫色'],
].map(([color, label]) => ({ value: color!, swatch: color!, label: `轮廓${label!}` }))
export interface PptxOutlineControlsProps {
  element: SlideElement
  target: PptxTarget
  apply: PptxApply
  version: number
}
export function PptxOutlineControls(props: PptxOutlineControlsProps) {
  const stroke = pptxElementStroke(props.element)
  const source = JSON.stringify([props.target.slide, props.target.el, props.version, stroke])
  return <OutlineEditor key={source} {...props} stroke={stroke} />
}
function OutlineEditor({
  element,
  target,
  apply,
  stroke,
}: PptxOutlineControlsProps & { stroke?: Stroke }) {
  const [draft, setDraft] = useState<PptxOutlineDraft>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const supported =
    element.type === 'shape' || element.type === 'text' || element.type === 'picture'
  const enabled = draft.enabled ?? !!(stroke && stroke.fill.type !== 'none')
  const locked = busy || !supported
  const dirty = Object.keys(draft).length > 0
  const change = (patch: PptxOutlineDraft) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError('')
    setStatus('')
  }
  const reset = () => {
    setDraft({})
    setError('')
    setStatus('')
  }
  const submit = async () => {
    if (pending.current || locked || !dirty) return
    let op: Record<string, unknown>
    try {
      op = pptxOutlineOp(target, stroke, draft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请检查轮廓设置')
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const ok = await apply(op)
      if (controller.signal.aborted) return
      if (ok) {
        setDraft({})
        setStatus('已应用轮廓')
      } else setError('修改未应用，已保留草稿，请重试')
    } catch {
      if (!controller.signal.aborted) setError('修改未应用，已保留草稿，请重试')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  const currentColor = draft.color ?? (stroke?.fill.type === 'solid' ? stroke.fill.color : null)
  const dash = draft.dash ?? stroke?.dash ?? 'solid'
  const dashOptions = PPTX_OUTLINE_DASHES.some((option) => option.value === dash)
    ? PPTX_OUTLINE_DASHES
    : [...PPTX_OUTLINE_DASHES, { value: dash, label: `原件线型（${dash}）` }]
  return (
    <fieldset className="mimir-pptx-outline-controls" disabled={locked} aria-busy={busy}>
      <div className="mimir-pptx-outline-controls__content">
        <ToolbarMenuNote>
          {supported
            ? `当前轮廓：${stroke && stroke.fill.type !== 'none' ? `${Number((stroke.width / PT).toFixed(3))}pt · ${PPTX_OUTLINE_DASHES.find((item) => item.value === (stroke.dash ?? 'solid'))?.label ?? '原件线型'}${stroke.fill.type === 'gradient' ? ' · 渐变' : ''}` : '无轮廓'}`
            : '请选择文字、形状或图片'}
        </ToolbarMenuNote>
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuFields label="轮廓">
            <ToolbarSelect
              label="轮廓显示"
              value={enabled ? 'line' : 'none'}
              disabled={locked}
              options={[
                { value: 'line', label: '显示轮廓' },
                { value: 'none', label: '无轮廓' },
              ]}
              onChange={(value) => change({ enabled: value === 'line' })}
            />
            {enabled && (
              <>
                <ToolbarColorPicker
                  label="轮廓颜色"
                  inline
                  value={currentColor}
                  options={
                    currentColor &&
                    !COLORS.some(
                      (item) => item.value.toLowerCase() === currentColor.toLowerCase(),
                    ) &&
                    /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(currentColor)
                      ? [
                          ...COLORS,
                          { value: currentColor, swatch: currentColor, label: '轮廓当前颜色' },
                        ]
                      : COLORS
                  }
                  disabled={locked}
                  onPick={(color) => change({ color })}
                />
                <ToolbarTextField
                  label="轮廓色值"
                  value={currentColor ?? ''}
                  placeholder={stroke?.fill.type === 'gradient' ? '原件渐变' : '#RRGGBB'}
                  onChange={(color) => change({ color })}
                />
                <ToolbarNumberField
                  label="轮廓宽度（pt）"
                  value={draft.widthPt ?? (stroke?.width ?? PT) / PT}
                  min={0.01}
                  max={1584}
                  step={0.25}
                  suffix="pt"
                  disabled={locked}
                  onCommit={(widthPt) => change({ widthPt })}
                />
                <ToolbarSelect
                  label="轮廓线型"
                  value={dash}
                  options={dashOptions}
                  disabled={locked}
                  onChange={(value) => change({ dash: value })}
                />
              </>
            )}
          </ToolbarMenuFields>
          {enabled && (
            <ToolbarMenuFields label="线条细节">
              <ToolbarSelect
                label="端点样式"
                value={draft.cap ?? stroke?.cap ?? 'flat'}
                disabled={locked}
                options={[
                  { value: 'flat', label: '平头' },
                  { value: 'round', label: '圆头' },
                  { value: 'square', label: '方头' },
                ]}
                onChange={(cap) => change({ cap })}
              />
              <ToolbarSelect
                label="连接样式"
                value={draft.join ?? stroke?.join ?? 'miter'}
                disabled={locked}
                options={[
                  { value: 'miter', label: '尖角' },
                  { value: 'round', label: '圆角' },
                  { value: 'bevel', label: '斜角' },
                ]}
                onChange={(join) => change({ join })}
              />
              <ToolbarSelect
                label="复合线条"
                value={draft.compound ?? stroke?.compound ?? 'sng'}
                disabled={locked}
                options={[
                  { value: 'sng', label: '单线' },
                  { value: 'dbl', label: '双线' },
                  { value: 'thickThin', label: '粗细双线' },
                  { value: 'thinThick', label: '细粗双线' },
                  { value: 'tri', label: '三线' },
                ]}
                onChange={(compound) => change({ compound })}
              />
            </ToolbarMenuFields>
          )}
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-outline-controls__actions">
        {error && <p role="alert">{error}</p>}
        {status && <ToolbarMenuNote>{status}</ToolbarMenuNote>}
        <ToolbarButton
          label={busy ? '正在应用轮廓' : '应用轮廓'}
          primary
          disabled={locked || !dirty}
          disabledReason={
            busy ? '正在应用修改' : !supported ? '请选择文字、形状或图片' : '请先调整轮廓设置'
          }
          onClick={() => void submit()}
        >
          <Check size={14} />
        </ToolbarButton>
        <ToolbarButton label="重置轮廓草稿" disabled={locked || !dirty} onClick={reset}>
          <RotateCcw size={14} />
          重置
        </ToolbarButton>
      </div>
    </fieldset>
  )
}
