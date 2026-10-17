import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { PaintBucket, Plus, Trash2, X } from 'lucide-react'
import type { XlsxCell } from '../xlsx.js'
import {
  DEFAULT_THEME_PALETTE,
  PATTERN_TYPES,
  THEME_SLOT_NAMES,
  XLSX_PATTERN_NAMES,
  resolveStyleColor,
  xlsxFillBackground,
  xlsxFillLabel,
  type FillSpec,
  type StyleColor,
} from '../xlsx-fill.js'
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
import './xlsx-fill-controls.css'

export interface XlsxFillControlsProps {
  ref?: Ref<XlsxFillControlsHandle>
  /** The editor keeps this Inspector mounted outside responsive Ribbon groups. */
  hideTrigger?: boolean
  cells: XlsxCell[]
  range: string
  palette?: readonly string[]
  sourceKey: unknown
  contextKey: string
  busy?: boolean
  disabledReason?: string
  inspector?: string | null
  onInspectorOpen?: () => void
  onApply: (fill: FillSpec | null, options: { signal: AbortSignal }) => Promise<boolean>
}
export interface XlsxFillControlsHandle {
  open: (trigger: HTMLButtonElement) => void
}
const COLORS = [
  '#000000',
  '#FFFFFF',
  '#C00000',
  '#FFC000',
  '#70AD47',
  '#4472C4',
  '#7030A0',
  '#D9E2F3',
].map((color) => ({ value: color, label: color, swatch: color }))
const THEME_LABELS = [
  '背景 1',
  '文字 1',
  '背景 2',
  '文字 2',
  '强调 1',
  '强调 2',
  '强调 3',
  '强调 4',
  '强调 5',
  '强调 6',
  '超链接',
  '已访问链接',
]
function FillColor({
  label,
  value,
  palette,
  disabled,
  onChange,
}: {
  label: string
  value: StyleColor
  palette: readonly string[]
  disabled: boolean
  onChange: (value: StyleColor) => void
}) {
  return (
    <ToolbarMenuFields label={label}>
      <ToolbarSelect
        label={`${label}来源`}
        disabled={disabled}
        value={typeof value === 'string' ? 'rgb' : 'theme'}
        options={[
          { value: 'rgb', label: '自定义颜色' },
          { value: 'theme', label: '文档主题色' },
        ]}
        onChange={(mode) =>
          onChange(mode === 'theme' ? { theme: 4 } : resolveStyleColor(value, palette))
        }
      />
      {typeof value === 'string' ? (
        <>
          <ToolbarColorPicker
            label={`${label}颜色`}
            value={value}
            options={COLORS}
            disabled={disabled}
            onPick={(color) => {
              if (color) onChange(color)
            }}
          />
          <fieldset disabled={disabled} className="mimir-xlsx-fill__hex">
            <ToolbarTextField
              label={`${label}色值（#RRGGBB）`}
              value={value}
              onChange={(color) => onChange(color.toUpperCase())}
              placeholder="#RRGGBB"
            />
          </fieldset>
        </>
      ) : (
        <>
          <ToolbarSelect
            label={`${label}主题色`}
            disabled={disabled}
            value={String(value.theme)}
            options={THEME_SLOT_NAMES.map((_, index) => ({
              value: String(index),
              label: THEME_LABELS[index]!,
              swatch: palette[index],
            }))}
            onChange={(theme) => onChange({ ...value, theme: Number(theme) })}
          />
          <ToolbarNumberField
            label={`${label}明暗（%）`}
            disabled={disabled}
            value={(value.tint ?? 0) * 100}
            min={-100}
            max={100}
            step={1}
            suffix="%"
            onCommit={(tint) => onChange({ ...value, tint: tint / 100 })}
          />
        </>
      )}
    </ToolbarMenuFields>
  )
}
function FillDraft({
  cells,
  range,
  palette = DEFAULT_THEME_PALETTE,
  busy,
  onApply,
  onClose,
}: XlsxFillControlsProps & { onClose: () => void }) {
  const first = cells[0]?.format?.fill,
    mixed = cells.some(
      (cell) =>
        JSON.stringify(cell.format?.fill?.spec ?? null) !== JSON.stringify(first?.spec ?? null) ||
        cell.format?.fill?.unsupported !== first?.unsupported,
    )
  const [fill, setFill] = useState<FillSpec | null>(() =>
    first?.spec ? structuredClone(first.spec) : null,
  )
  const [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState('')
  const request = useRef<AbortController | null>(null),
    lock = useRef(false),
    sequence = useRef(10)
  const [stopKeys, setStopKeys] = useState(() =>
    Array.from({ length: 10 }, (_, index) => `stop-${index}`),
  )
  useLayoutEffect(() => () => request.current?.abort(), [])
  const disabled = !!busy || pending
  const colors = !fill
    ? []
    : 'gradient' in fill
      ? fill.gradient.stops.map((stop) => stop.color)
      : [fill.fg, ...(fill.bg ? [fill.bg] : [])]
  const valid = colors.every((color) => typeof color !== 'string' || /^#[0-9A-F]{6}$/i.test(color))
  const mode = !fill
    ? 'none'
    : 'gradient' in fill
      ? fill.gradient.type === 'path'
        ? 'path'
        : 'linear'
      : fill.pattern === 'solid'
        ? 'solid'
        : 'pattern'
  const changeMode = (next: string) => {
    setFeedback('')
    if (next === 'none') setFill(null)
    else if (next === 'solid' || next === 'pattern')
      setFill({
        pattern: next === 'solid' ? 'solid' : 'lightDown',
        fg: { theme: 4 },
        ...(next === 'pattern' ? { bg: { theme: 0 } } : {}),
      })
    else
      setFill({
        gradient: {
          type: next as 'linear' | 'path',
          ...(next === 'linear' ? { angle: 0 } : { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 }),
          stops: [
            { position: 0, color: { theme: 4 } },
            { position: 1, color: { theme: 0 } },
          ],
        },
      })
  }
  const apply = async () => {
    if (disabled || !valid || lock.current) return
    lock.current = true
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setFeedback('')
    try {
      const ok = await onApply(fill, { signal: controller.signal })
      if (!controller.signal.aborted)
        setFeedback(ok ? '已应用填充' : '填充未应用，配置已保留；请查看编辑器错误说明后重试')
    } catch (error) {
      if (!controller.signal.aborted)
        setFeedback(
          error instanceof Error ? `${error.message}；配置已保留` : '填充未应用，配置已保留',
        )
    } finally {
      if (!controller.signal.aborted) {
        lock.current = false
        setPending(false)
      }
    }
  }
  return (
    <>
      <div className="mimir-xlsx-inspector__content mimir-xlsx-fill__content">
        <p className="mimir-xlsx-fill__range">
          {range} · {cells.length} 个可见单元格
        </p>
        <p className="mimir-xlsx-fill__current">
          当前：{mixed ? '混合填充' : xlsxFillLabel(first)}
        </p>
        <div
          className="mimir-xlsx-fill__preview"
          aria-label="填充效果预览"
          style={{
            background: valid ? (xlsxFillBackground(fill, palette) ?? '#FFFFFF') : '#FFFFFF',
          }}
        >
          <span>Aa 123</span>
        </div>
        <ToolbarPropertyForm>
          <ToolbarSelect
            label="填充类型"
            disabled={disabled}
            value={mode}
            options={[
              { value: 'none', label: '无填充' },
              { value: 'solid', label: '纯色' },
              { value: 'pattern', label: '图案' },
              { value: 'linear', label: '线性渐变' },
              { value: 'path', label: '路径渐变' },
            ]}
            onChange={changeMode}
          />
          {fill && 'pattern' in fill && (
            <>
              {mode === 'pattern' && (
                <ToolbarSelect
                  label="填充图案"
                  disabled={disabled}
                  value={fill.pattern}
                  options={PATTERN_TYPES.filter((p) => p !== 'solid').map((p) => ({
                    value: p,
                    label: XLSX_PATTERN_NAMES[PATTERN_TYPES.indexOf(p)]!,
                  }))}
                  onChange={(pattern) =>
                    setFill({ ...fill, pattern: pattern as (typeof PATTERN_TYPES)[number] })
                  }
                />
              )}
              <FillColor
                label={mode === 'solid' ? '填充' : '前景'}
                value={fill.fg}
                palette={palette}
                disabled={disabled}
                onChange={(fg) => setFill({ ...fill, fg })}
              />
              {mode === 'pattern' && (
                <FillColor
                  label="背景"
                  value={fill.bg ?? { theme: 0 }}
                  palette={palette}
                  disabled={disabled}
                  onChange={(bg) => setFill({ ...fill, bg })}
                />
              )}
            </>
          )}
          {fill && 'gradient' in fill && (
            <>
              {mode === 'linear' ? (
                <ToolbarNumberField
                  label="渐变角度（°）"
                  disabled={disabled}
                  value={fill.gradient.angle ?? 0}
                  min={0}
                  max={360}
                  suffix="°"
                  onCommit={(angle) => setFill({ gradient: { ...fill.gradient, angle } })}
                />
              ) : (
                <ToolbarMenuFields label="渐变中心区域">
                  {(
                    [
                      ['left', '左'],
                      ['right', '右'],
                      ['top', '上'],
                      ['bottom', '下'],
                    ] as const
                  ).map(([edge, label]) => (
                    <ToolbarNumberField
                      key={edge}
                      label={`距${label}边（%）`}
                      disabled={disabled}
                      value={(fill.gradient[edge] ?? 0) * 100}
                      min={0}
                      max={100}
                      suffix="%"
                      onCommit={(value) =>
                        setFill({ gradient: { ...fill.gradient, [edge]: value / 100 } })
                      }
                    />
                  ))}
                </ToolbarMenuFields>
              )}
              <div className="mimir-xlsx-fill__stops">
                <h3>
                  渐变色标 <span>{fill.gradient.stops.length} / 10</span>
                </h3>
                {fill.gradient.stops.map((stop, index) => (
                  <section className="mimir-xlsx-fill__stop" key={stopKeys[index]}>
                    <div className="mimir-xlsx-fill__stop-heading">
                      <strong>色标 {index + 1}</strong>
                      <ToolbarButton
                        label={`删除色标 ${index + 1}`}
                        disabled={disabled || fill.gradient.stops.length <= 2}
                        disabledReason="渐变至少保留两个色标"
                        onClick={() => {
                          setFill({
                            gradient: {
                              ...fill.gradient,
                              stops: fill.gradient.stops.filter((_, i) => i !== index),
                            },
                          })
                          setStopKeys(stopKeys.filter((_, i) => i !== index))
                        }}
                      >
                        <Trash2 size={14} />
                      </ToolbarButton>
                    </div>
                    <ToolbarNumberField
                      label={`色标 ${index + 1} 位置（%）`}
                      disabled={disabled}
                      value={stop.position * 100}
                      min={0}
                      max={100}
                      suffix="%"
                      onCommit={(position) =>
                        setFill({
                          gradient: {
                            ...fill.gradient,
                            stops: fill.gradient.stops.map((s, i) =>
                              i === index ? { ...s, position: position / 100 } : s,
                            ),
                          },
                        })
                      }
                    />
                    <FillColor
                      label={`色标 ${index + 1}`}
                      value={stop.color}
                      palette={palette}
                      disabled={disabled}
                      onChange={(color) =>
                        setFill({
                          gradient: {
                            ...fill.gradient,
                            stops: fill.gradient.stops.map((s, i) =>
                              i === index ? { ...s, color } : s,
                            ),
                          },
                        })
                      }
                    />
                  </section>
                ))}
                <ToolbarButton
                  label="添加渐变色标"
                  disabled={disabled || fill.gradient.stops.length >= 10}
                  disabledReason="最多十个色标"
                  onClick={() => {
                    setFill({
                      gradient: {
                        ...fill.gradient,
                        stops: [...fill.gradient.stops, { position: 0.5, color: { theme: 5 } }],
                      },
                    })
                    setStopKeys([
                      ...stopKeys.slice(0, fill.gradient.stops.length),
                      `stop-${sequence.current++}`,
                    ])
                  }}
                >
                  <Plus size={14} />
                  添加色标
                </ToolbarButton>
              </div>
            </>
          )}
          <ToolbarMenuNote>
            修改后点击应用。清除填充后，条件格式和表格样式仍可能显示底色。
          </ToolbarMenuNote>
        </ToolbarPropertyForm>
        {!valid && (
          <p role="alert" className="mimir-xlsx-fill__feedback">
            请输入完整的 #RRGGBB 色值，例如 #4472C4。
          </p>
        )}
        {feedback && (
          <p
            role={feedback === '已应用填充' ? 'status' : 'alert'}
            className="mimir-xlsx-fill__feedback"
          >
            {feedback}
          </p>
        )}
      </div>
      <footer className="mimir-xlsx-fill__footer">
        <ToolbarButton label="取消填充配置" onClick={onClose}>
          取消
        </ToolbarButton>
        <ToolbarButton
          label={pending ? '正在应用填充' : '应用填充'}
          primary
          disabled={disabled || !valid}
          disabledReason={!valid ? '请输入完整的 #RRGGBB 色值' : '正在应用或保存工作簿'}
          onClick={() => void apply()}
        >
          <PaintBucket size={14} />
        </ToolbarButton>
      </footer>
    </>
  )
}
export function XlsxFillControls({ ref, hideTrigger, ...props }: XlsxFillControlsProps) {
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [shown, setShown] = useState({ sourceKey: props.sourceKey, contextKey: props.contextKey })
  const close = () => setContainer(null)
  const open = (button: HTMLButtonElement) => {
    trigger.current = button
    props.onInspectorOpen?.()
    setContainer(
      button.closest('.mimir-editor')?.querySelector<HTMLElement>('.mimir-editor__body') ??
        button.parentElement,
    )
  }
  useImperativeHandle(ref, () => ({ open }))
  if (shown.sourceKey !== props.sourceKey || shown.contextKey !== props.contextKey) {
    setShown({ sourceKey: props.sourceKey, contextKey: props.contextKey })
    setContainer(null)
  }
  if (container && props.inspector && props.inspector !== 'fill') setContainer(null)
  useEffect(() => {
    if (!container) return
    container.classList.add('mimir-xlsx-inspector-host')
    const currentPanel = panel.current,
      currentTrigger = trigger.current,
      triggerGroup = currentTrigger?.closest('[data-section-key]')
    currentPanel?.focus()
    return () => {
      container.classList.remove('mimir-xlsx-inspector-host')
      const active = document.activeElement
      if (active === document.body || active === currentPanel || currentPanel?.contains(active))
        (
          (currentTrigger?.isConnected ? currentTrigger : null) ??
          triggerGroup?.querySelector<HTMLButtonElement>('button[aria-label="范围填充"]') ??
          triggerGroup?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
        )?.focus()
    }
  }, [container])
  return (
    <>
      {!hideTrigger && (
        <ToolbarButton
          ref={trigger}
          label="范围填充"
          active={!!container}
          disabled={!props.cells.length || !!props.disabledReason || props.busy}
          disabledReason={props.disabledReason ?? '先选择可编辑单元格'}
          onClick={() => {
            if (container) close()
            else if (trigger.current) open(trigger.current)
          }}
        >
          <PaintBucket size={16} />
          <span>填充</span>
        </ToolbarButton>
      )}
      {container &&
        createPortal(
          <aside
            ref={panel}
            tabIndex={-1}
            aria-label="范围填充设置"
            className="mimir-xlsx-inspector mimir-xlsx-fill"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                close()
              }
            }}
          >
            <header className="mimir-xlsx-inspector__header">
              <h2>单元格填充</h2>
              <ToolbarButton label="关闭填充设置" onClick={close}>
                <X size={16} />
              </ToolbarButton>
            </header>
            <FillDraft {...props} onClose={close} />
          </aside>,
          container,
        )}
    </>
  )
}
