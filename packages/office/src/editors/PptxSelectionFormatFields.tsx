import { PPTX_PARAGRAPH_NUMBER_TYPES } from '@mimir/shared'
import { useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import type { Paragraph, SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ToolbarMenuFields,
  ToolbarButton,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { pptxMixedValue } from './pptx-selection.js'
import {
  PPTX_OUTLINE_DASHES,
  pptxElementStroke,
  type PptxOutlineDraft,
} from './PptxOutlineControls.js'

const NUMBER_LABELS = [
  '1. 2. 3.',
  '1) 2) 3)',
  'I. II. III.',
  'A. B. C.',
  'a) b) c)',
  'a. b. c.',
  'i. ii. iii.',
  '① ② ③',
  '一、二、三、',
]
const BULLETS = [
  { value: '•|Arial', label: '实心圆 · Arial' },
  { value: 'o|Courier New', label: '空心圆 · Courier New' },
  { value: '§|Wingdings', label: '实心方块 · Wingdings' },
  { value: 'q|Wingdings', label: '空心方块 · Wingdings' },
  { value: 'v|Wingdings', label: '菱形 · Wingdings' },
  { value: 'Ø|Wingdings', label: '箭头 · Wingdings' },
  { value: 'ü|Wingdings', label: '勾选 · Wingdings' },
]
const pair = 'mimir-pptx-selection-controls__fields mimir-pptx-selection-controls__fields--equal'

export function PptxSelectionParagraphFields({
  paragraphs,
  draft,
  onChange,
  disabled,
  lists,
  imageName,
  onPickImage,
}: {
  paragraphs: readonly Paragraph[]
  draft: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
  disabled: boolean
  lists: boolean
  imageName: string
  onPickImage: (file?: File) => void
}) {
  const imageInput = useRef<HTMLInputElement>(null)
  const current = <T,>(read: (paragraph: Paragraph) => T) => pptxMixedValue(paragraphs.map(read))
  const text = (field: string, read: (paragraph: Paragraph) => string | number | undefined) => {
    const value = current(read)
    return {
      value: String(draft[field] ?? value ?? ''),
      placeholder: value === null ? '混合' : '继承',
    }
  }
  const change = (field: string) => (value: string) => onChange({ [field]: value })
  const direction = current((p) => p.rtl)
  const bullet = (draft.bullet as string | undefined) ?? current((p) => p.bullet?.type ?? 'none')
  const scheme = (draft.numType as string | undefined) ?? current((p) => p.bullet?.numType)
  const schemes: { value: string; label: string; disabled?: boolean }[] =
    PPTX_PARAGRAPH_NUMBER_TYPES.map((value, i) => ({ value, label: NUMBER_LABELS[i]! }))
  if (scheme && !schemes.some((option) => option.value === scheme))
    schemes.push({ value: scheme, label: `原件编号（${scheme}）`, disabled: true })
  const currentGlyph = current((p) =>
    p.bullet?.type === 'char' ? `${p.bullet.char ?? '•'}|${p.bullet.font ?? 'Arial'}` : undefined,
  )
  const pickedGlyph =
    draft.bulletChar !== undefined
      ? `${draft.bulletChar}|${draft.bulletFont ?? 'Arial'}`
      : currentGlyph
  const glyphs =
    pickedGlyph && !BULLETS.some((option) => option.value === pickedGlyph)
      ? [...BULLETS, { value: pickedGlyph, label: '原件自定义符号' }]
      : BULLETS
  return (
    <fieldset className="mimir-pptx-selection-controls__fields" disabled={disabled}>
      {!lists ? (
        <>
          <ToolbarMenuFields label={`段落 · ${paragraphs.length} 段`}>
            <ToolbarSelect
              label="批量段落对齐"
              disabled={disabled}
              value={(draft.align as string | undefined) ?? current((p) => p.align ?? 'left')}
              emptyLabel="混合"
              options={[
                { value: 'left', label: '左对齐' },
                { value: 'center', label: '居中' },
                { value: 'right', label: '右对齐' },
                { value: 'justify', label: '两端对齐' },
              ]}
              onChange={(align) => onChange({ align })}
            />
            <div className={pair}>
              <ToolbarSelect
                label="批量文字方向"
                disabled={disabled}
                value={
                  typeof draft.rtl === 'boolean'
                    ? draft.rtl
                      ? 'rtl'
                      : 'ltr'
                    : direction === null
                      ? null
                      : direction === undefined
                        ? 'inherit'
                        : direction
                          ? 'rtl'
                          : 'ltr'
                }
                emptyLabel="混合"
                options={[
                  { value: 'inherit', label: '继承', disabled: true },
                  { value: 'ltr', label: '从左向右' },
                  { value: 'rtl', label: '从右向左' },
                ]}
                onChange={(value) => onChange({ rtl: value === 'rtl' })}
              />
              <ToolbarTextField
                label="批量行距（%）"
                {...text('lineSpacingPct', (p) =>
                  p.lineExact !== undefined ? `${p.lineExact} pt（固定）` : p.lineHeight,
                )}
                onChange={change('lineSpacingPct')}
              />
              <ToolbarTextField
                label="批量段前（pt）"
                {...text('spaceBeforePt', (p) =>
                  p.spaceBeforePct !== undefined ? `${p.spaceBeforePct}%` : p.spaceBefore,
                )}
                onChange={change('spaceBeforePt')}
              />
              <ToolbarTextField
                label="批量段后（pt）"
                {...text('spaceAfterPt', (p) =>
                  p.spaceAfterPct !== undefined ? `${p.spaceAfterPct}%` : p.spaceAfter,
                )}
                onChange={change('spaceAfterPt')}
              />
            </div>
            <ToolbarMenuNote>
              行距 0–13200%，段前/段后 0–1584pt。修改数值会替换原件的固定行距或百分比间距。
            </ToolbarMenuNote>
          </ToolbarMenuFields>
          <ToolbarMenuFields label="段落级别">
            <ToolbarMenuNote>
              当前级别：{current((p) => (p.level ?? 0) + 1) ?? '混合'}（1–9）
            </ToolbarMenuNote>
            <ToolbarSelect
              label="批量级别调整"
              disabled={disabled}
              value={
                draft.indentDelta === 1
                  ? 'increase'
                  : draft.indentDelta === -1
                    ? 'decrease'
                    : 'keep'
              }
              options={[
                { value: 'keep', label: '保持当前' },
                { value: 'increase', label: '增加一级' },
                { value: 'decrease', label: '减少一级' },
              ]}
              onChange={(value) =>
                onChange({
                  indentDelta: value === 'keep' ? undefined : value === 'increase' ? 1 : -1,
                })
              }
            />
          </ToolbarMenuFields>
        </>
      ) : (
        <>
          <ToolbarMenuFields label="符号与编号">
            <ToolbarSelect
              label="批量列表类型"
              disabled={disabled}
              value={bullet ?? null}
              emptyLabel="混合"
              options={[
                { value: 'none', label: '无符号或编号' },
                { value: 'char', label: '字符符号' },
                { value: 'number', label: '自动编号' },
                { value: 'blip', label: '图片符号' },
              ]}
              onChange={(value) =>
                onChange({
                  bullet: value,
                  bulletImage: undefined,
                  bulletChar: undefined,
                  bulletFont: undefined,
                  numType: undefined,
                  startAt: undefined,
                })
              }
            />
            {(bullet === 'char' || bullet === null) && (
              <>
                <ToolbarSelect
                  label="批量符号预设"
                  disabled={disabled}
                  value={pickedGlyph ?? null}
                  emptyLabel={currentGlyph === null ? '混合' : '选择符号'}
                  options={glyphs}
                  onChange={(value) => {
                    const [bulletChar, bulletFont] = value.split('|')
                    onChange({ bullet: 'char', bulletChar, bulletFont })
                  }}
                />
                <div className={pair}>
                  <ToolbarTextField
                    label="批量符号字符"
                    {...text('bulletChar', (p) =>
                      p.bullet?.type === 'char' ? p.bullet.char : undefined,
                    )}
                    onChange={(value) => onChange({ bullet: 'char', bulletChar: value })}
                  />
                  <ToolbarTextField
                    label="批量符号字体"
                    {...text('bulletFont', (p) => p.bullet?.font)}
                    onChange={change('bulletFont')}
                  />
                </div>
              </>
            )}
            {(bullet === 'number' || bullet === null) && (
              <div className={pair}>
                <ToolbarSelect
                  label="批量编号格式"
                  disabled={disabled}
                  value={scheme ?? null}
                  emptyLabel={scheme === null ? '混合' : '选择格式'}
                  options={schemes}
                  onChange={(numType) => onChange({ bullet: 'number', numType })}
                />
                <ToolbarTextField
                  label="批量起始编号"
                  {...text('startAt', (p) => p.bullet?.startAt)}
                  onChange={change('startAt')}
                />
              </div>
            )}
            <input
              ref={imageInput}
              hidden
              type="file"
              accept="image/png,image/jpeg"
              aria-label="批量图片项目符号文件"
              disabled={disabled}
              onChange={(event) => {
                onPickImage(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
            />
            <ToolbarButton
              label="选择批量图片项目符号"
              disabled={disabled}
              onClick={() => imageInput.current?.click()}
            >
              <ImagePlus size={15} />
              {bullet === 'blip' ? '替换图片符号' : '使用图片符号'}
            </ToolbarButton>
            <ToolbarMenuNote>
              {draft.bulletImage && imageName
                ? `待应用：${imageName}`
                : draft.bullet === 'blip'
                  ? '请选择PNG或JPEG图片，再应用到全部所选文本。'
                  : bullet === 'blip'
                    ? `当前图片${current((p) => p.bullet?.mediaRef) === null ? '混合' : '相同'}；未替换时保留各对象原图片。`
                    : 'PNG或JPEG，最多512 KiB；选图后点击“应用对象格式”。'}
            </ToolbarMenuNote>
            {bullet === 'none' && (
              <ToolbarMenuNote>
                选择符号或编号后可调整细节；移除列表同时收回原有悬挂缩进。
              </ToolbarMenuNote>
            )}
          </ToolbarMenuFields>
          {bullet !== 'none' && (
            <ToolbarMenuFields label="列表细节">
              <div className={pair}>
                <ToolbarTextField
                  label="批量符号大小（%）"
                  {...text('bulletSizePct', (p) =>
                    p.bullet?.sizePt !== undefined
                      ? `${p.bullet.sizePt} pt（固定）`
                      : p.bullet?.sizePct,
                  )}
                  onChange={change('bulletSizePct')}
                />
                <ToolbarTextField
                  label="批量悬挂缩进（pt）"
                  {...text('bulletHangPt', (p) =>
                    p.indent !== undefined && p.indent <= 0 ? -p.indent / 12700 : undefined,
                  )}
                  onChange={change('bulletHangPt')}
                />
              </div>
              <ToolbarTextField
                label="批量符号颜色"
                {...text('bulletColor', (p) => p.bullet?.color)}
                onChange={change('bulletColor')}
              />
              <ToolbarMenuNote>
                大小 25–400%，悬挂 0–4032pt，编号
                1–32767。未选择新类型时，细节只修改已有的符号/编号。
              </ToolbarMenuNote>
            </ToolbarMenuFields>
          )}
        </>
      )}
    </fieldset>
  )
}

export function PptxSelectionOutlineFields({
  elements,
  draft,
  onChange,
  disabled,
}: {
  elements: readonly SlideElement[]
  draft: PptxOutlineDraft
  onChange: (patch: PptxOutlineDraft) => void
  disabled: boolean
}) {
  const strokes = elements.map(pptxElementStroke)
  const dash = draft.dash ?? pptxMixedValue(strokes.map((s) => s?.dash ?? 'solid'))
  const dashOptions =
    dash && !PPTX_OUTLINE_DASHES.some((option) => option.value === dash)
      ? [...PPTX_OUTLINE_DASHES, { value: dash, label: `原件线型（${dash}）`, disabled: true }]
      : PPTX_OUTLINE_DASHES
  const enabled = draft.enabled ?? pptxMixedValue(strokes.map((s) => !!s && s.fill.type !== 'none'))
  return (
    <ToolbarMenuFields label="轮廓细节">
      <div className={pair}>
        <ToolbarSelect
          label="批量轮廓显示"
          disabled={disabled}
          value={enabled === null ? null : enabled ? 'line' : 'none'}
          emptyLabel="混合"
          options={[
            { value: 'line', label: '显示轮廓' },
            { value: 'none', label: '无轮廓' },
          ]}
          onChange={(value) => onChange({ enabled: value === 'line' })}
        />
        <ToolbarSelect
          label="批量轮廓线型"
          disabled={disabled || enabled === false}
          value={dash}
          emptyLabel="混合"
          options={dashOptions}
          onChange={(value) => onChange({ dash: value })}
        />
        <ToolbarSelect
          label="批量端点样式"
          disabled={disabled || enabled === false}
          value={draft.cap ?? pptxMixedValue(strokes.map((s) => s?.cap ?? 'flat'))}
          emptyLabel="混合"
          options={[
            { value: 'flat', label: '平头' },
            { value: 'round', label: '圆头' },
            { value: 'square', label: '方头' },
          ]}
          onChange={(cap) => onChange({ cap })}
        />
        <ToolbarSelect
          label="批量连接样式"
          disabled={disabled || enabled === false}
          value={draft.join ?? pptxMixedValue(strokes.map((s) => s?.join ?? 'miter'))}
          emptyLabel="混合"
          options={[
            { value: 'miter', label: '尖角' },
            { value: 'round', label: '圆角' },
            { value: 'bevel', label: '斜角' },
          ]}
          onChange={(join) => onChange({ join })}
        />
      </div>
      <ToolbarSelect
        label="批量复合线条"
        disabled={disabled || enabled === false}
        value={draft.compound ?? pptxMixedValue(strokes.map((s) => s?.compound ?? 'sng'))}
        emptyLabel="混合"
        options={[
          { value: 'sng', label: '单线' },
          { value: 'dbl', label: '双线' },
          { value: 'thickThin', label: '粗细双线' },
          { value: 'thinThick', label: '细粗双线' },
          { value: 'tri', label: '三线' },
        ]}
        onChange={(compound) => onChange({ compound })}
      />
      <ToolbarMenuNote>仅应用已调整的字段，保留各对象原有箭头和其他线条属性。</ToolbarMenuNote>
    </ToolbarMenuFields>
  )
}
