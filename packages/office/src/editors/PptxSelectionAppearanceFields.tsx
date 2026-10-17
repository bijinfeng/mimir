import { useRef, useState, type KeyboardEvent } from 'react'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarTextField,
  ToolbarToggleGroup,
} from '../shell/EditorShell.js'
import {
  pptxFillPreview,
  pptxFillSummary,
  pptxGradientPresets,
  PPTX_FILL_TEXTURES,
} from './pptx-fill-presets.js'
import {
  pptxElementFill,
  pptxSelectionFillValue,
  type PptxSelectionFillDraft,
} from './pptx-selection-fill.js'
import {
  currentPptxShapeStyle,
  PPTX_SHAPE_STYLE_ROWS,
  PPTX_SHAPE_STYLES,
} from './pptx-shape-presets.js'
import { PptxShapePreview } from './PptxShapeGallery.js'
import { pptxMixedValue } from './pptx-selection.js'

export interface PptxSelectionImageFillDraft {
  kind: 'texture' | 'current'
  texture: (typeof PPTX_FILL_TEXTURES)[number]['id']
  tile: boolean
}
export function PptxSelectionAppearanceFields({
  elements,
  styleElements = elements,
  draft,
  styleKey,
  onChange,
  onStylePick,
  imageDraft,
  onImageChange,
  imageAvailable,
  imageLocked,
  disabled,
}: {
  elements: readonly SlideElement[]
  styleElements?: readonly SlideElement[]
  draft: PptxSelectionFillDraft
  styleKey?: string
  onChange: (draft: PptxSelectionFillDraft) => void
  onStylePick: (key: string) => void
  imageDraft: PptxSelectionImageFillDraft | null
  onImageChange: (draft: PptxSelectionImageFillDraft) => void
  imageAvailable: boolean
  imageLocked: boolean
  disabled: boolean
}) {
  const [section, setSection] = useState<'fill' | 'styles'>('fill')
  const [stopIndex, setStopIndex] = useState(0)
  const stylesRef = useRef<HTMLDivElement>(null)
  const fills = elements.map(pptxElementFill)
  const currentType = pptxMixedValue(fills.map((fill) => fill?.type ?? 'none'))
  const allImages = fills.length > 0 && fills.every((fill) => fill?.type === 'image')
  const values = fills.map((fill) => pptxSelectionFillValue(fill, draft))
  const mode = imageDraft
    ? imageDraft.kind === 'texture'
      ? 'texture'
      : 'image'
    : (draft.mode ?? currentType)
  const angle = pptxMixedValue(values.map((value) => value.angle))
  const path = pptxMixedValue(values.map((value) => value.path))
  const count = Math.min(...values.map((value) => value.stops.length), 16)
  const selectedStop = Math.min(stopIndex, Math.max(0, count - 1))
  const equalCounts = pptxMixedValue(values.map((value) => value.stops.length)) !== null
  const stopColor = pptxMixedValue(values.map((value) => value.stops[selectedStop]?.color))
  const stopPosition = pptxMixedValue(values.map((value) => value.stops[selectedStop]?.pos))
  const solidColor = pptxMixedValue(values.map((value) => value.color))
  const last = draft.stopEdits?.at(-1)
  const positionText =
    last?.kind === 'patch' && last.index === selectedStop && last.pos !== undefined
      ? String(last.pos)
      : stopPosition == null
        ? ''
        : String(Number((stopPosition * 100).toFixed(3)))
  const update = (patch: Partial<PptxSelectionFillDraft>) => onChange({ ...draft, ...patch })
  const updateStop = (patch: { color?: string; pos?: string }) => {
    const edits = [...(draft.stopEdits ?? [])]
    if (last?.kind === 'patch' && last.index === selectedStop)
      edits[edits.length - 1] = { ...last, ...patch }
    else edits.push({ kind: 'patch', index: selectedStop, ...patch })
    update({ stopEdits: edits })
  }
  const presets = pptxGradientPresets(
    /^#[\da-f]{6}/i.test(solidColor ?? '') ? solidColor!.slice(0, 7) : '#4472C4',
  )
  const currentStyle = pptxMixedValue(
    styleElements.map((element) => currentPptxShapeStyle(element)?.key ?? 'custom'),
  )
  const chosenStyle = styleKey ?? currentStyle
  const uniform = pptxMixedValue(values.map(pptxFillPreview)) !== null
  const styleNavigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || imageDraft) return
    const buttons = [...(stylesRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (
      index < 0 ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.max(
              0,
              Math.min(
                buttons.length - 1,
                index +
                  ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key] ?? 0),
              ),
            )
    onStylePick(PPTX_SHAPE_STYLES[next]!.key)
    buttons[next]?.focus()
  }
  const actualSummary = pptxMixedValue(fills.map(pptxFillSummary))
  const presetIndex = presets.findIndex((preset) =>
    values.every(
      (value) =>
        value.mode === 'gradient' &&
        value.angle === preset.angle &&
        value.path === preset.path &&
        JSON.stringify(value.stops) === JSON.stringify(preset.stops),
    ),
  )
  return (
    <fieldset className="mimir-pptx-selection-controls__fields" disabled={disabled}>
      <ToolbarToggleGroup
        label="外观分类"
        value={section}
        onChange={setSection}
        options={[
          { value: 'fill', label: '填充', disabled },
          { value: 'styles', label: '组合样式', disabled: disabled || !!imageDraft },
        ]}
      />
      {styleElements.length > elements.length && (
        <ToolbarMenuNote>
          填充不含 {styleElements.length - elements.length} 条线条；组合样式仍调整线条轮廓。
        </ToolbarMenuNote>
      )}
      {section === 'fill' ? (
        !elements.length ? (
          <ToolbarMenuNote>
            请选择可填充的形状或文本框。线条可在组合样式或轮廓中调整。
          </ToolbarMenuNote>
        ) : (
          <>
            <ToolbarMenuFields label={`填充 · ${elements.length} 个对象`}>
              <ToolbarMenuNote>当前：{actualSummary ?? '混合填充'}</ToolbarMenuNote>
              <ToolbarSelect
                label="批量填充类型"
                value={mode}
                emptyLabel="混合"
                disabled={disabled}
                options={[
                  { value: 'none', label: '无填充', disabled: !!imageDraft },
                  { value: 'solid', label: '纯色', disabled: !!imageDraft },
                  { value: 'gradient', label: '渐变', disabled: !!imageDraft },
                  { value: 'texture', label: '内置纹理', disabled: !imageAvailable || imageLocked },
                  {
                    value: 'image',
                    label: '当前图片',
                    disabled: !imageAvailable || imageLocked || !allImages,
                  },
                  { value: 'pattern', label: '原件图案填充', disabled: true },
                ]}
                onChange={(next) => {
                  if (next === 'texture' || next === 'image')
                    onImageChange({
                      kind: next === 'texture' ? 'texture' : 'current',
                      texture: imageDraft?.texture ?? 'paper',
                      tile: imageDraft?.tile ?? true,
                    })
                  else if (next === 'none' || next === 'solid' || next === 'gradient')
                    update({ mode: next })
                }}
              />
              {imageLocked && !imageDraft && (
                <ToolbarMenuNote>
                  应用或重置现有格式草稿后，可选择纹理或调整当前图片。
                </ToolbarMenuNote>
              )}
              {imageDraft && (
                <ToolbarMenuNote>
                  正在编辑图片填充草稿。应用或重置后可继续调整其他格式。
                </ToolbarMenuNote>
              )}
              {!imageDraft && mode === 'image' && allImages && (
                <div className="mimir-pptx-selection-appearance__buttons">
                  <ToolbarButton
                    label="批量平铺当前图片"
                    disabled={disabled || imageLocked || !imageAvailable}
                    onClick={() => onImageChange({ kind: 'current', texture: 'paper', tile: true })}
                  >
                    平铺当前图片
                  </ToolbarButton>
                  <ToolbarButton
                    label="批量拉伸当前图片"
                    disabled={disabled || imageLocked || !imageAvailable}
                    onClick={() =>
                      onImageChange({ kind: 'current', texture: 'paper', tile: false })
                    }
                  >
                    拉伸填满
                  </ToolbarButton>
                </div>
              )}
              {!imageDraft &&
                mode !== 'image' &&
                mode !== 'pattern' &&
                mode !== null &&
                uniform &&
                values[0] && (
                  <div
                    role="img"
                    aria-label="批量填充预览"
                    className="mimir-pptx-selection-appearance__preview"
                    style={{ background: pptxFillPreview(values[0]) }}
                  />
                )}
              {!imageDraft && mode === 'gradient' && !uniform && (
                <ToolbarMenuNote>渐变参数混合；仅统一已调整的参数。</ToolbarMenuNote>
              )}
            </ToolbarMenuFields>
            {mode === 'solid' && !imageDraft && (
              <ToolbarMenuFields label="纯色">
                <ToolbarTextField
                  label="批量纯色填充"
                  value={solidColor ?? ''}
                  placeholder="混合"
                  onChange={(color) => update({ mode: 'solid', color })}
                />
                <ToolbarMenuNote>
                  色值支持 #RRGGBB 或 #RRGGBBAA（末两位为不透明度）。
                </ToolbarMenuNote>
              </ToolbarMenuFields>
            )}
            {mode === 'gradient' && !imageDraft && (
              <>
                <ToolbarMenuFields label="渐变设置">
                  <ToolbarSelect
                    label="批量渐变预设"
                    disabled={disabled}
                    value={presetIndex < 0 ? null : String(presetIndex)}
                    emptyLabel="选择预设，统一色标"
                    options={presets.map((preset, index) => ({
                      value: String(index),
                      label: preset.label,
                    }))}
                    onChange={(value) => {
                      const preset = presets[Number(value)]!
                      update({
                        mode: 'gradient',
                        stops: preset.stops,
                        angle: preset.angle,
                        path: preset.path,
                        stopEdits: [],
                      })
                      setStopIndex(0)
                    }}
                  />
                  <div className="mimir-pptx-selection-controls__fields mimir-pptx-selection-controls__fields--equal">
                    <ToolbarSelect
                      label="批量渐变类型"
                      disabled={disabled}
                      value={path}
                      emptyLabel="混合"
                      options={[
                        { value: '', label: '线性' },
                        { value: 'circle', label: '圆形径向' },
                        { value: 'rect', label: '矩形路径' },
                        { value: 'shape', label: '形状路径' },
                      ]}
                      onChange={(next) => update({ path: next as PptxFillDraftPath })}
                    />
                    {(path === '' || path === null) && (
                      <ToolbarTextField
                        label="批量渐变角度（°）"
                        value={
                          draft.angle === undefined
                            ? angle == null
                              ? ''
                              : String(angle)
                            : String(draft.angle)
                        }
                        placeholder="混合"
                        onChange={(next) => update({ angle: next })}
                      />
                    )}
                  </div>
                </ToolbarMenuFields>
                <ToolbarMenuFields label="色标">
                  <ToolbarSelect
                    label="批量当前色标"
                    disabled={disabled}
                    value={String(selectedStop)}
                    options={Array.from({ length: count }, (_, index) => ({
                      value: String(index),
                      label: `色标 ${index + 1}`,
                    }))}
                    onChange={(value) => setStopIndex(Number(value))}
                  />
                  <div className="mimir-pptx-selection-controls__fields mimir-pptx-selection-controls__fields--equal">
                    <ToolbarTextField
                      label="批量色标颜色"
                      value={stopColor ?? ''}
                      placeholder="混合"
                      onChange={(color) => updateStop({ color })}
                    />
                    <ToolbarTextField
                      label="批量色标位置（%）"
                      value={positionText}
                      placeholder="混合"
                      onChange={(pos) => updateStop({ pos })}
                    />
                  </div>
                  <div className="mimir-pptx-selection-appearance__buttons">
                    <ToolbarButton
                      label="添加批量渐变色标"
                      disabled={disabled || !equalCounts || count >= 16}
                      onClick={() => {
                        update({
                          stopEdits: [
                            ...(draft.stopEdits ?? []),
                            { kind: 'append', from: selectedStop },
                          ],
                        })
                        setStopIndex(count)
                      }}
                    >
                      添加色标
                    </ToolbarButton>
                    <ToolbarButton
                      label="删除批量当前色标"
                      disabled={disabled || !equalCounts || count <= 2}
                      onClick={() => {
                        update({
                          stopEdits: [
                            ...(draft.stopEdits ?? []),
                            { kind: 'remove', index: selectedStop },
                          ],
                        })
                        setStopIndex(0)
                      }}
                    >
                      删除色标
                    </ToolbarButton>
                  </div>
                  <ToolbarMenuNote>
                    色标 2–16 个，位置
                    0–100%。颜色末两位可设不透明度；数量不同时，先选预设再添加或删除。
                  </ToolbarMenuNote>
                </ToolbarMenuFields>
              </>
            )}
            {imageDraft?.kind === 'texture' && (
              <ToolbarMenuFields label="内置纹理">
                <div
                  className="mimir-pptx-selection-appearance__textures"
                  role="group"
                  aria-label="批量内置纹理"
                >
                  {PPTX_FILL_TEXTURES.map((texture) => (
                    <ToolbarButton
                      key={texture.id}
                      label={`批量纹理：${texture.label}`}
                      active={imageDraft.texture === texture.id}
                      disabled={disabled}
                      onClick={() => onImageChange({ ...imageDraft, texture: texture.id })}
                    >
                      <span className="mimir-pptx-selection-appearance__tile">
                        <img src={texture.url} alt="" />
                        <span className="mimir-pptx-selection-appearance__tile-label">
                          {texture.label}
                        </span>
                      </span>
                    </ToolbarButton>
                  ))}
                </div>
              </ToolbarMenuFields>
            )}
            {imageDraft && (
              <ToolbarSelect
                label="批量图片填充方式"
                disabled={disabled}
                value={imageDraft.tile ? 'tile' : 'stretch'}
                options={[
                  { value: 'tile', label: '平铺' },
                  { value: 'stretch', label: '拉伸填满' },
                ]}
                onChange={(value) => onImageChange({ ...imageDraft, tile: value === 'tile' })}
              />
            )}
          </>
        )
      ) : (
        <>
          <ToolbarMenuNote>
            当前样式：
            {currentStyle === null
              ? '混合'
              : (PPTX_SHAPE_STYLES.find((style) => style.key === currentStyle)?.label ?? '自定义')}
          </ToolbarMenuNote>
          {styleKey && (
            <ToolbarMenuNote>
              待应用：{PPTX_SHAPE_STYLES.find((style) => style.key === styleKey)?.label}
            </ToolbarMenuNote>
          )}
          <ToolbarMenuNote>
            替换填充、描边颜色与线型，保留各对象原有线宽、端点和箭头。
          </ToolbarMenuNote>
          <div ref={stylesRef} onKeyDown={styleNavigate}>
            {PPTX_SHAPE_STYLE_ROWS.map((row) => (
              <ToolbarMenuFields key={row.key} label={row.label}>
                <div
                  className="mimir-pptx-selection-appearance__styles"
                  role="group"
                  aria-label={`批量${row.label}`}
                >
                  {PPTX_SHAPE_STYLES.filter((style) => style.row === row.key).map((style) => (
                    <ToolbarButton
                      key={style.key}
                      label={`批量样式：${style.label}`}
                      active={chosenStyle === style.key}
                      disabled={disabled || !!imageDraft}
                      onClick={() => onStylePick(style.key)}
                    >
                      <span className="mimir-pptx-selection-appearance__tile">
                        <PptxShapePreview kind="roundRect" style={style} />
                        <span className="mimir-pptx-selection-appearance__tile-label">
                          {style.colorLabel}
                        </span>
                      </span>
                    </ToolbarButton>
                  ))}
                </div>
              </ToolbarMenuFields>
            ))}
          </div>
        </>
      )}
    </fieldset>
  )
}
type PptxFillDraftPath = '' | 'circle' | 'rect' | 'shape'
