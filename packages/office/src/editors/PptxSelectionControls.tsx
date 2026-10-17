import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent,
} from 'react'
import { Check, Layers, RotateCcw } from 'lucide-react'
import type { PptxManualFill } from '@mimir/shared'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { elementCNvPrId } from '../../vendor/packages/pptx-engine/src/identity.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
  ToolbarToggleGroup,
} from '../shell/EditorShell.js'
import {
  pptxMixedValue,
  pptxSelectionContexts,
  pptxResolveSelection,
  pptxNormalizeSelection,
  pptxExpandSelection,
  pptxSelectionText,
  pptxSelectionFormatOps,
  type PptxSelectionDraft,
} from './pptx-selection.js'
import { pptxElementStroke } from './PptxOutlineControls.js'
import { PptxGroupTextControls } from './PptxGroupTextControls.js'
import {
  PptxSelectionParagraphFields,
  PptxSelectionOutlineFields,
} from './PptxSelectionFormatFields.js'
import {
  PptxSelectionAppearanceFields,
  type PptxSelectionImageFillDraft,
} from './PptxSelectionAppearanceFields.js'
import { PPTX_FILL_TEXTURES } from './pptx-fill-presets.js'
import { PPTX_SHAPE_STYLES } from './pptx-shape-presets.js'
import { pptxSupportsShapeFill } from '../pptx-element-capabilities.js'
import './pptx-selection-controls.css'

export interface PptxSelectionControlsProps {
  elements: readonly SlideElement[]
  selectedRefs: readonly string[]
  onSelectionChange: (refs: string[]) => void
  slide: number
  version: number
  sourceKey?: string
  applyOps: (ops: Record<string, unknown>[]) => Promise<boolean>
  applyFill?: (input: PptxManualFill) => Promise<boolean>
  disabled?: boolean
}
const TYPES: Record<string, string> = {
  text: '文字',
  shape: '形状',
  picture: '图片',
  group: '组合',
  table: '表格',
  chart: '图表',
  passthrough: '原件对象',
}
function typeLabel(element: SlideElement) {
  if (element.type === 'picture' && element.media)
    return element.media.kind === 'audio' ? '音频' : '视频'
  return TYPES[element.type] ?? '对象'
}
function name(element: SlideElement, index: number) {
  const text =
    element.type === 'text' || element.type === 'shape'
      ? element.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ')
      : ''
  return element.name || text?.slice(0, 60) || `${typeLabel(element)} ${index + 1}`
}
export function PptxSelectionControls(props: PptxSelectionControlsProps) {
  return <SelectionScope key={JSON.stringify([props.sourceKey, props.slide])} {...props} />
}
function SelectionScope(props: PptxSelectionControlsProps) {
  const [tab, setTab] = useState<'common' | 'paragraph' | 'list' | 'outline' | 'appearance'>(
    'common',
  )
  const anchor = useRef<string | null>(null)
  const focusRow = useRef<string | null>(null)
  const binding = JSON.stringify([props.version, props.selectedRefs])
  const selected = pptxResolveSelection(props.elements, props.selectedRefs)
  const member = selected.length === 1 && selected[0]?.depth === 1 ? selected[0] : null
  const text = member ? pptxSelectionText(member) : null
  const memberRef = props.selectedRefs[0] ?? member?.ref
  const parent = member?.group ? pptxResolveSelection(props.elements, [member.group])[0] : null
  const groupRef = parent ? (elementCNvPrId(parent.element) ?? parent.ref) : member?.group
  return (
    <div className="mimir-pptx-selection-controls__scope">
      {groupRef && memberRef && text && (
        <PptxGroupTextControls
          key={memberRef}
          element={text}
          group={groupRef}
          target={{ slide: props.slide, el: memberRef }}
          version={props.version}
          applyOps={props.applyOps}
          disabled={props.disabled}
        />
      )}
      <SelectionEditor
        key={binding}
        {...props}
        tab={tab}
        onTabChange={setTab}
        readAnchor={() => anchor.current}
        onAnchorChange={(ref) => {
          anchor.current = ref
        }}
        readFocusRow={() => focusRow.current}
        onFocusRowChange={(ref) => {
          focusRow.current = ref
        }}
      />
    </div>
  )
}
function SelectionEditor({
  elements,
  selectedRefs,
  onSelectionChange,
  slide,
  applyOps,
  applyFill,
  disabled = false,
  readAnchor,
  onAnchorChange,
  readFocusRow,
  onFocusRowChange,
  tab,
  onTabChange,
}: PptxSelectionControlsProps & {
  readAnchor: () => string | null
  onAnchorChange: (ref: string) => void
  readFocusRow: () => string | null
  onFocusRowChange: (ref: string | null) => void
  tab: 'common' | 'paragraph' | 'list' | 'outline' | 'appearance'
  onTabChange: (tab: 'common' | 'paragraph' | 'list' | 'outline' | 'appearance') => void
}) {
  const container = useRef<HTMLFieldSetElement>(null)
  useLayoutEffect(() => {
    if (readFocusRow() && document.activeElement === document.body) {
      const focus = pptxResolveSelection(elements, [readFocusRow()!])[0]
      const row = [
        ...(container.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []),
      ].find((item) => item.dataset.ref === focus?.ref)
      row?.focus()
    }
  }, [elements, readFocusRow])
  const rows = pptxSelectionContexts(elements)
  const selected = pptxResolveSelection(elements, selectedRefs)
  const selectedIds = new Set(selected.map((item) => item.ref))
  const targets = pptxExpandSelection(elements, selectedRefs)
  const textTargets = targets.flatMap((item) => {
    const text = pptxSelectionText(item)
    return text ? [text] : []
  })
  const runs = textTargets.flatMap((item) => item.text!.paragraphs.flatMap((p) => p.runs))
  const paragraphs = textTargets.flatMap((item) => item.text!.paragraphs)
  const shapeTargets = targets.filter(
    ({ element }) => element.type === 'text' || element.type === 'shape',
  )
  const fillTargets = shapeTargets.filter(({ element }) => pptxSupportsShapeFill(element))
  const lineTargets = targets.filter(({ element }) =>
    ['text', 'shape', 'picture'].includes(element.type),
  )
  const [draft, setDraft] = useState<PptxSelectionDraft>({})
  const [imageFill, setImageFill] = useState<PptxSelectionImageFillDraft | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [width, setWidth] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const locked = disabled || busy
  const formatDirty =
    Object.entries(draft).some(([key, value]) =>
      (key === 'paragraph' || key === 'outline') && value && typeof value === 'object'
        ? Object.values(value).some((entry) => entry !== undefined)
        : value !== undefined,
    ) ||
    size !== null ||
    width !== null
  const dirty = formatDirty || imageFill !== null
  const change = (patch: PptxSelectionDraft) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError('')
    setStatus('')
  }
  const choose = (ref: string, event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>) => {
    if (locked) return
    let refs: string[]
    const anchorRef = readAnchor()
    const anchor = anchorRef ? pptxResolveSelection(elements, [anchorRef])[0] : null
    const start = rows.findIndex((row) => row.ref === anchor?.ref)
    const end = rows.findIndex((row) => row.ref === ref)
    if (event.shiftKey && start >= 0) {
      const range = rows
        .slice(Math.min(start, end), Math.max(start, end) + 1)
        .filter((row) => row.depth <= 1)
        .map((row) => row.ref)
      refs = event.ctrlKey || event.metaKey ? [...selectedRefs, ...range] : range
    } else if (event.ctrlKey || event.metaKey)
      refs = selectedIds.has(ref)
        ? selectedRefs.filter(
            (old) => !pptxResolveSelection(elements, [old]).some((row) => row.ref === ref),
          )
        : [...selectedRefs, ref]
    else refs = [ref]
    onAnchorChange(ref)
    onSelectionChange(pptxNormalizeSelection(elements, refs))
  }
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked) return
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'),
    ]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      onSelectionChange(rows.filter((row) => row.depth === 0).map((row) => row.ref))
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.min(buttons.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))
    const button = buttons[next]
    button?.focus()
    if (event.shiftKey && button?.dataset.ref) choose(button.dataset.ref, event)
  }
  const reset = () => {
    setDraft({})
    setImageFill(null)
    setSize(null)
    setWidth(null)
    setError('')
    setStatus('')
  }
  const submit = async () => {
    if (locked || pending.current || !dirty) return
    let ops: Record<string, unknown>[] = []
    try {
      if (size !== null && !size.trim()) throw new Error('请输入字号')
      if (width !== null && !width.trim()) throw new Error('请输入轮廓宽度')
      if (imageFill) {
        if (formatDirty) throw new Error('请先应用或重置其他格式草稿')
        if (!applyFill) throw new Error('当前未连接手动填充宿主')
        if (!fillTargets.length || fillTargets.length > 200)
          throw new Error('请选择1–200个可填充对象')
      } else
        ops = pptxSelectionFormatOps(elements, selectedRefs, slide, {
          ...draft,
          ...(size === null ? {} : { fontSizePt: Number(size) }),
          ...(width === null ? {} : { strokeWidthPt: Number(width) }),
        })
      if (!imageFill && !ops.length) throw new Error('所选对象不支持本次格式，请调整选择')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请检查格式')
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      let ok: boolean
      if (imageFill) {
        let fillSource: Extract<PptxManualFill, { kind: 'selection' }>['source'] = {
          kind: 'current',
        }
        if (imageFill.kind === 'texture') {
          const texture = PPTX_FILL_TEXTURES.find((item) => item.id === imageFill.texture)!
          const response = await fetch(texture.url, { signal: controller.signal })
          if (!response.ok) throw new Error('纹理载入失败，请重试')
          const bytes = new Uint8Array(await response.arrayBuffer())
          if (!bytes.length || bytes.length > 1024 * 1024) throw new Error('纹理资源无效')
          let binary = ''
          for (const byte of bytes) binary += String.fromCharCode(byte)
          fillSource = { kind: 'texture', id: imageFill.texture, png: btoa(binary) }
        }
        if (controller.signal.aborted) return
        ok = await applyFill!({
          kind: 'selection',
          slide,
          targets: fillTargets.map((context) => ({
            elementId: context.ref,
            ...(context.group ? { group: context.group } : {}),
          })),
          source: fillSource,
          tile: imageFill.tile,
        })
      } else ok = await applyOps(ops)
      if (controller.signal.aborted) return
      if (ok) {
        reset()
        setStatus(imageFill ? '已应用所选对象填充' : '已应用所选对象格式')
      } else setError('修改未应用，已保留草稿，请重试')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? `${cause.message}；已保留草稿`
            : '修改未应用，已保留草稿，请重试',
        )
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  const boolValue = (field: 'bold' | 'italic' | 'underline') =>
    draft[field] ?? pptxMixedValue(runs.map((run) => !!run[field]))
  const currentSize = pptxMixedValue(runs.map((run) => run.fontSize))
  const currentColor = pptxMixedValue(runs.map((run) => run.color))
  const currentFill = pptxMixedValue(
    fillTargets.map(({ element }) =>
      (element.type === 'text' || element.type === 'shape') && element.fill?.type === 'solid'
        ? element.fill.color
        : element.type === 'text' || element.type === 'shape'
          ? element.fill?.type === 'none'
            ? 'none'
            : undefined
          : undefined,
    ),
  )
  const currentStroke = pptxMixedValue(
    lineTargets.map(({ element }) => {
      const stroke = pptxElementStroke(element)
      return stroke?.fill.type === 'solid' ? stroke.fill.color : undefined
    }),
  )
  const currentWidth = pptxMixedValue(
    lineTargets.map(({ element }) => {
      const stroke = pptxElementStroke(element)
      return stroke ? stroke.width / 12700 : undefined
    }),
  )
  const selectedStyle = PPTX_SHAPE_STYLES.find((style) => style.key === draft.shapeStyle)
  const outlineElements = lineTargets.map(({ element }) => {
    if (!selectedStyle || (element.type !== 'shape' && element.type !== 'text')) return element
    return {
      ...element,
      stroke: {
        ...element.stroke,
        width: element.stroke?.width || 12700,
        fill: { type: 'solid' as const, color: selectedStyle.stroke },
        dash: selectedStyle.dash,
      },
    }
  })
  return (
    <fieldset
      className="mimir-pptx-selection-controls"
      ref={container}
      onFocusCapture={(event) => {
        onFocusRowChange(
          (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')?.dataset.ref ??
            null,
        )
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          onFocusRowChange(null)
      }}
      disabled={locked}
      aria-busy={busy}
    >
      <div className="mimir-pptx-selection-controls__content">
        <section className="mimir-pptx-selection-controls__objects" aria-label="本页对象">
          <div className="mimir-pptx-selection-controls__heading">
            <strong>本页对象</strong>
            <span>已选 {selected.length} 个</span>
          </div>
          <ToolbarMenuNote>Ctrl / ⌘ 加选，Shift 连选。组合格式作用于直接成员。</ToolbarMenuNote>
          <div
            className="mimir-pptx-selection-controls__list"
            role="listbox"
            aria-label="选择幻灯片对象"
            aria-multiselectable="true"
            onKeyDown={navigate}
          >
            {rows.map((row, index) => (
              <button
                key={row.ref}
                type="button"
                role="option"
                aria-selected={selectedIds.has(row.ref)}
                data-ref={row.ref}
                disabled={locked || row.depth > 1}
                title={row.depth > 1 ? '更深层组合暂不支持编辑' : name(row.element, index)}
                onClick={(event) => choose(row.ref, event)}
                className="mimir-pptx-selection-controls__row"
                style={{ paddingInlineStart: 8 + Math.min(row.depth, 2) * 14 }}
              >
                <span className="mimir-pptx-selection-controls__check" aria-hidden="true">
                  {selectedIds.has(row.ref) ? (
                    <Check size={12} />
                  ) : row.element.type === 'group' ? (
                    <Layers size={12} />
                  ) : null}
                </span>
                <span className="mimir-pptx-selection-controls__name">
                  {name(row.element, index)}
                </span>
                <span className="mimir-pptx-selection-controls__type">
                  {typeLabel(row.element)}
                </span>
              </button>
            ))}
            {!rows.length && <ToolbarMenuNote>本页没有对象</ToolbarMenuNote>}
          </div>
          <div className="mimir-pptx-selection-controls__selection-actions">
            <ToolbarButton
              label="选择全部顶层对象"
              disabled={locked || !rows.length}
              onClick={() =>
                onSelectionChange(rows.filter((row) => row.depth === 0).map((row) => row.ref))
              }
            >
              全选
            </ToolbarButton>
            <ToolbarButton
              label="清除对象选择"
              disabled={locked || !selected.length}
              onClick={() => onSelectionChange([])}
            >
              清除
            </ToolbarButton>
          </div>
        </section>
        {!selected.length ? (
          <ToolbarMenuNote>从画布或上方列表选择对象，再调整格式。</ToolbarMenuNote>
        ) : (
          <ToolbarPropertyForm columns={1}>
            <div className="mimir-pptx-selection-controls__tabs">
              <ToolbarToggleGroup
                label="批量格式分类"
                value={tab}
                options={[
                  { value: 'common', label: '常用', disabled: locked || !!imageFill },
                  { value: 'paragraph', label: '段落', disabled: locked || !!imageFill },
                  { value: 'list', label: '列表', disabled: locked || !!imageFill },
                  { value: 'outline', label: '轮廓', disabled: locked || !!imageFill },
                  { value: 'appearance', label: '外观', disabled: locked },
                ]}
                onChange={onTabChange}
              />
            </div>
            {tab === 'appearance' && (
              <PptxSelectionAppearanceFields
                elements={fillTargets.map((context) => context.element)}
                styleElements={shapeTargets.map((context) => context.element)}
                draft={
                  draft.fillFormat ??
                  (draft.fill !== undefined
                    ? {
                        mode: draft.fill === 'none' ? 'none' : 'solid',
                        color: draft.fill === 'none' ? undefined : draft.fill,
                      }
                    : selectedStyle
                      ? { mode: 'solid', color: selectedStyle.fill }
                      : {})
                }
                styleKey={draft.shapeStyle}
                onChange={(fillFormat) => change({ fillFormat, fill: undefined })}
                onStylePick={(shapeStyle) =>
                  change({
                    shapeStyle,
                    fillFormat: undefined,
                    fill: undefined,
                    strokeColor: undefined,
                    outline: {
                      ...draft.outline,
                      color: undefined,
                      dash: undefined,
                      enabled: undefined,
                    },
                  })
                }
                imageDraft={imageFill}
                onImageChange={(next) => {
                  setImageFill(next)
                  setError('')
                  setStatus('')
                }}
                imageAvailable={!!applyFill}
                imageLocked={formatDirty}
                disabled={locked || !shapeTargets.length}
              />
            )}
            {tab === 'common' && (
              <>
                <ToolbarMenuFields label={`文字与段落 · ${textTargets.length} 个对象`}>
                  {!textTargets.length && (
                    <ToolbarMenuNote>请选择含文字的形状或文本框</ToolbarMenuNote>
                  )}
                  <div className="mimir-pptx-selection-controls__booleans">
                    {(['bold', 'italic', 'underline'] as const).map((field) => (
                      <div key={field} className="mimir-pptx-selection-controls__boolean">
                        <span>{{ bold: '加粗', italic: '倾斜', underline: '下划线' }[field]}</span>
                        <ToolbarSelect
                          key={field}
                          label={
                            { bold: '批量加粗', italic: '批量倾斜', underline: '批量下划线' }[field]
                          }
                          disabled={locked || !textTargets.length}
                          value={boolValue(field) === null ? null : boolValue(field) ? 'yes' : 'no'}
                          emptyLabel="混合"
                          options={[
                            { value: 'yes', label: '开启' },
                            { value: 'no', label: '关闭' },
                          ]}
                          onChange={(value) => change({ [field]: value === 'yes' })}
                        />
                      </div>
                    ))}
                  </div>
                  <fieldset
                    disabled={locked || !textTargets.length}
                    className="mimir-pptx-selection-controls__fields mimir-pptx-selection-controls__fields--pair"
                  >
                    <ToolbarTextField
                      label="批量字号（pt）"
                      value={size ?? (currentSize == null ? '' : String(currentSize))}
                      placeholder={currentSize === null ? '混合' : '继承'}
                      onChange={(value) => {
                        setSize(value)
                        setError('')
                      }}
                    />
                    <ToolbarTextField
                      label="批量文字颜色"
                      value={draft.color ?? currentColor ?? ''}
                      placeholder="混合或继承"
                      onChange={(color) => change({ color })}
                    />
                  </fieldset>
                  <ToolbarSelect
                    label="批量段落对齐"
                    disabled={locked || !textTargets.length}
                    value={
                      (draft.paragraph?.align as PptxSelectionDraft['align']) ??
                      draft.align ??
                      pptxMixedValue(paragraphs.map((p) => p.align ?? 'left'))
                    }
                    emptyLabel="混合"
                    options={[
                      { value: 'left', label: '左对齐' },
                      { value: 'center', label: '居中' },
                      { value: 'right', label: '右对齐' },
                      { value: 'justify', label: '两端对齐' },
                    ]}
                    onChange={(align) => change({ paragraph: { ...draft.paragraph, align } })}
                  />
                </ToolbarMenuFields>
                <ToolbarMenuFields label={`填充 · ${fillTargets.length} 个对象`}>
                  {draft.fillFormat && draft.fillFormat.mode !== 'solid' && (
                    <ToolbarMenuNote>
                      已暂存{draft.fillFormat.mode === 'none' ? '无填充' : '渐变填充'}
                      ；可在外观中继续调整。
                    </ToolbarMenuNote>
                  )}
                  <fieldset
                    disabled={locked || !fillTargets.length}
                    className="mimir-pptx-selection-controls__fields"
                  >
                    <ToolbarTextField
                      label="批量填充颜色"
                      value={
                        draft.fill ??
                        (draft.fillFormat?.mode === 'solid' ? draft.fillFormat.color : undefined) ??
                        selectedStyle?.fill ??
                        currentFill ??
                        ''
                      }
                      placeholder="混合或原件填充"
                      onChange={(fill) => change({ fill, fillFormat: undefined })}
                    />
                    <ToolbarButton
                      label="批量无填充"
                      active={draft.fill === 'none'}
                      disabled={locked || !fillTargets.length}
                      onClick={() => change({ fill: 'none', fillFormat: undefined })}
                    >
                      无填充
                    </ToolbarButton>
                  </fieldset>
                </ToolbarMenuFields>
              </>
            )}
            {(tab === 'paragraph' || tab === 'list') && (
              <>
                {!textTargets.length && (
                  <ToolbarMenuNote>请选择含文字的形状或文本框</ToolbarMenuNote>
                )}
                <PptxSelectionParagraphFields
                  paragraphs={paragraphs}
                  draft={draft.paragraph ?? {}}
                  onChange={(patch) =>
                    change({
                      paragraph: Object.fromEntries(
                        Object.entries({ ...draft.paragraph, ...patch }).filter(
                          ([, value]) => value !== undefined,
                        ),
                      ),
                    })
                  }
                  disabled={locked || !textTargets.length}
                  lists={tab === 'list'}
                />
              </>
            )}
            {(tab === 'common' || tab === 'outline') && (
              <>
                <ToolbarMenuFields label={`轮廓 · ${lineTargets.length} 个对象`}>
                  <fieldset
                    disabled={locked || !lineTargets.length}
                    className="mimir-pptx-selection-controls__fields"
                  >
                    <ToolbarTextField
                      label="批量轮廓颜色"
                      value={draft.strokeColor ?? selectedStyle?.stroke ?? currentStroke ?? ''}
                      placeholder="混合或原件轮廓"
                      onChange={(strokeColor) => change({ strokeColor })}
                    />
                    <ToolbarTextField
                      label="批量轮廓宽度（pt）"
                      value={width ?? (currentWidth == null ? '' : String(currentWidth))}
                      placeholder="混合或无轮廓"
                      onChange={(value) => {
                        setWidth(value)
                        setError('')
                      }}
                    />
                  </fieldset>
                  <ToolbarMenuNote>
                    仅应用已调整的字段，保留各对象原有线型、端点和箭头。
                  </ToolbarMenuNote>
                </ToolbarMenuFields>
                {tab === 'outline' && (
                  <PptxSelectionOutlineFields
                    elements={outlineElements}
                    draft={draft.outline ?? {}}
                    onChange={(patch) => change({ outline: { ...draft.outline, ...patch } })}
                    disabled={locked || !lineTargets.length}
                  />
                )}
              </>
            )}
          </ToolbarPropertyForm>
        )}
      </div>
      <div className="mimir-pptx-selection-controls__actions">
        {error && <p role="alert">{error}</p>}
        {status && <ToolbarMenuNote>{status}</ToolbarMenuNote>}
        <ToolbarButton
          label={
            imageFill
              ? busy
                ? '正在应用对象填充'
                : '应用对象填充'
              : busy
                ? '正在应用对象格式'
                : '应用对象格式'
          }
          primary
          disabled={locked || !dirty || !targets.length}
          disabledReason={
            locked ? '正在处理修改' : !targets.length ? '请先选择可编辑对象' : '请先调整格式'
          }
          onClick={() => void submit()}
        >
          <Check size={14} />
        </ToolbarButton>
        <ToolbarButton label="重置对象格式草稿" disabled={locked || !dirty} onClick={reset}>
          <RotateCcw size={14} />
          重置
        </ToolbarButton>
      </div>
    </fieldset>
  )
}
