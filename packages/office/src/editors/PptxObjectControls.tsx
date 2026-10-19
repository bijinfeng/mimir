import { useEffect, useRef, useState } from 'react'
import { Check, Crop, ImagePlus, RotateCcw, RotateCw } from 'lucide-react'
import {
  pptxParagraphFormatSchema,
  PPTX_PARAGRAPH_NUMBER_TYPES,
  PPTX_PARAGRAPH_IMAGE_MAX_BYTES,
  type PptxParagraphFormat,
} from '../../../shared/src/pptx-paragraph.js'
import {
  pptxParagraphIndices,
  pptxParagraphScope,
  uniformPptxParagraphValue,
} from '../pptx-paragraph-range.js'
import type { PptxTextSelection } from '../pptx-text-range.js'
import type { Paragraph } from '../../vendor/packages/pptx-engine/src/types.js'
import './pptx-paragraph-controls.css'
import './pptx-picture-controls.css'
import type { SlideElement, TextBody } from '../../vendor/packages/pptx-engine/src/types.js'
import type { PptxLink } from '../pptx-metadata.js'
import { PptxCurveControls } from './PptxCurveControls.js'
import {
  elementDurableId,
  matchesElementRef,
} from '../../vendor/packages/pptx-engine/src/identity.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextField,
  ToolbarTextArea,
  ToolbarPropertyForm,
  ToolbarColorPicker,
} from '../shell/EditorShell.js'

export {
  PptxControlPanel,
  usePptxAction,
  type PptxApply,
  type PptxTarget,
} from './PptxControlPanel.js'
import {
  PptxControlPanel,
  usePptxAction,
  type PptxApply,
  type PptxTarget,
} from './PptxControlPanel.js'
const PT = 12700
const options = (values: readonly (readonly [string, string])[]) =>
  values.map(([value, label]) => ({ value, label }))

export interface PptxParagraphControlsProps {
  text: TextBody
  target: PptxTarget
  apply: PptxApply
  selection?: PptxTextSelection | null
  version?: number
  applyParagraphFormat?: (
    format: PptxParagraphFormat,
    paraIndices: number[],
    signal: AbortSignal,
  ) => Promise<boolean>
}
type ParagraphTab = 'paragraph' | 'list' | 'textbox'
const paragraphNumberNames = [
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
const bulletPresets = [
  { char: '•', font: 'Arial', glyph: '•', label: '实心圆' },
  { char: 'o', font: 'Courier New', glyph: '○', label: '空心圆' },
  { char: '§', font: 'Wingdings', glyph: '▪', label: '实心方块' },
  { char: 'q', font: 'Wingdings', glyph: '❑', label: '空心方块' },
  { char: 'v', font: 'Wingdings', glyph: '❖', label: '菱形' },
  { char: 'Ø', font: 'Wingdings', glyph: '➢', label: '箭头' },
  { char: 'ü', font: 'Wingdings', glyph: '✓', label: '对勾' },
] as const
const bulletColors = [
  ['#000000', '黑色'],
  ['#FFFFFF', '白色'],
  ['#C00000', '红色'],
  ['#ED7D31', '橙色'],
  ['#FFC000', '金色'],
  ['#70AD47', '绿色'],
  ['#4472C4', '蓝色'],
  ['#7030A0', '紫色'],
].map(([color, label]) => ({ value: color!, swatch: color!, label: `符号${label!}` }))
export function PptxParagraphControls(props: PptxParagraphControlsProps) {
  const [tab, setTab] = useState<ParagraphTab>('paragraph')
  const range = props.selection
  const source = `${props.target.slide}:${props.target.el}:${props.version ?? 0}:${range ? `${range.start}:${range.end}` : 'all'}`
  return <ParagraphEditor key={source} {...props} tab={tab} setTab={setTab} />
}
function ParagraphEditor({
  text,
  target,
  apply,
  selection = null,
  applyParagraphFormat,
  tab,
  setTab,
}: PptxParagraphControlsProps & { tab: ParagraphTab; setTab: (tab: ParagraphTab) => void }) {
  const { busy: bodyBusy, run } = usePptxAction(apply)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [imageName, setImageName] = useState('')
  const operation = useRef<AbortController | null>(null)
  const reader = useRef<FileReader | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  useEffect(
    () => () => {
      operation.current?.abort()
      reader.current?.abort()
    },
    [],
  )
  const indices = pptxParagraphIndices(text.paragraphs, selection)
  const scope = pptxParagraphScope(indices, selection)
  const uniform = <T,>(read: (paragraph: Paragraph) => T) =>
    uniformPptxParagraphValue(text.paragraphs, indices, read)
  const value = <T,>(key: string, read: (paragraph: Paragraph) => T): T | null =>
    Object.hasOwn(draft, key) ? (draft[key] as T) : uniform(read)
  const change = (patch: Record<string, unknown>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError('')
    setStatus('')
  }
  const listType = value('bullet', (p) => p.bullet?.type ?? 'none')
  const paragraphRtl = value('rtl', (p) => p.rtl)
  const numberType = value('numType', (p) => p.bullet?.numType ?? 'arabicPeriod')
  const numberOptions = PPTX_PARAGRAPH_NUMBER_TYPES.map((type, i) => ({
    value: type as string,
    label: paragraphNumberNames[i]!,
    disabled: false,
  }))
  if (numberType && !numberOptions.some((option) => option.value === numberType))
    numberOptions.push({ value: numberType, label: '原件编号格式', disabled: true })
  const dirty = Object.keys(draft).length > 0
  const locked = busy || bodyBusy || reading
  const body = (props: Record<string, unknown>) =>
    void run({ op: 'setTextBodyProps', target, props })
  const reset = () => {
    setDraft({})
    setImageName('')
    setError('')
    setStatus('')
    reader.current?.abort()
    setReading(false)
  }
  const submit = async () => {
    if (operation.current || locked || !dirty) return
    const patch = { ...draft }
    const numericLabels: Record<string, string> = {
      lineSpacingPct: '行距',
      spaceBeforePt: '段前',
      spaceAfterPt: '段后',
      startAt: '起始编号',
      bulletSizePct: '符号大小',
      bulletHangEmu: '悬挂缩进',
    }
    for (const [key, label] of Object.entries(numericLabels)) {
      if (!Object.hasOwn(patch, key)) continue
      const number =
        typeof patch[key] === 'number'
          ? patch[key]
          : String(patch[key]).trim() === ''
            ? NaN
            : Number(patch[key])
      if (!Number.isFinite(number)) {
        setError(`${label}请输入有效数字`)
        return
      }
      patch[key] = key === 'bulletHangEmu' ? Math.round(number * PT) : number
    }
    const parsed = pptxParagraphFormatSchema.safeParse(patch)
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? '')
      const hints: Record<string, string> = {
        lineSpacingPct: '行距须为0–13200%',
        spaceBeforePt: '段前须为0–1584pt',
        spaceAfterPt: '段后须为0–1584pt',
        startAt: '起始编号须为1–32767的整数',
        bulletSizePct: '符号大小须为25–400%',
        bulletHangEmu: '悬挂缩进须为0–4032pt',
        bulletColor: '符号颜色使用#RRGGBB，例如#4472C4',
        bulletChar: '请输入1–16个字符的项目符号',
        bulletFont: '请输入1–128个字符的字体名称',
      }
      setError(hints[field] ?? '请检查列表参数；图片符号须先选择PNG或JPEG文件')
      return
    }
    if (selection && !applyParagraphFormat) {
      setError('当前宿主不支持所选段落格式，请重新打开文档')
      return
    }
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const ok = applyParagraphFormat
        ? await applyParagraphFormat(parsed.data, indices, controller.signal)
        : await apply({ op: 'setParagraphFormat', target, format: parsed.data })
      if (!controller.signal.aborted && ok) {
        setDraft({})
        setImageName('')
        setStatus('已应用到' + scope)
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '段落修改失败，请重试')
    } finally {
      if (operation.current === controller) {
        operation.current = null
        if (!controller.signal.aborted) setBusy(false)
      }
    }
  }
  const numberField = (key: string, label: string, read: (p: Paragraph) => number | string) => {
    const current = value(key, read)
    return (
      <ToolbarTextField
        key={key}
        label={label}
        value={current === null ? '' : String(current)}
        placeholder="混合"
        onChange={(next) => change({ [key]: next })}
        onSubmit={() => void submit()}
        onCancel={reset}
      />
    )
  }
  const pickImage = (file: File | undefined) => {
    if (!file) return
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size > PPTX_PARAGRAPH_IMAGE_MAX_BYTES ||
      !file.size
    ) {
      setError('请选择512 KiB以内的PNG或JPEG图片')
      return
    }
    reader.current?.abort()
    const next = new FileReader()
    reader.current = next
    setReading(true)
    setError('')
    next.addEventListener(
      'load',
      () => {
        if (reader.current !== next) return
        setReading(false)
        const base64 = String(next.result).split(',')[1]
        if (!base64) {
          setError('图片读取失败，请重新选择')
          return
        }
        change({
          bullet: 'blip',
          bulletImage: { ext: file.type === 'image/png' ? 'png' : 'jpg', base64 },
        })
        setImageName(file.name)
      },
      { once: true },
    )
    next.addEventListener(
      'error',
      () => {
        if (reader.current === next) {
          setReading(false)
          setError('图片读取失败，请重新选择')
        }
      },
      { once: true },
    )
    next.readAsDataURL(file)
  }
  return (
    <fieldset className="mimir-pptx-paragraph" disabled={locked} aria-busy={locked}>
      <div className="mimir-pptx-paragraph__tabs" role="group" aria-label="段落设置分类">
        {(
          [
            ['paragraph', '段落'],
            ['list', '列表'],
            ['textbox', '文本框'],
          ] as const
        ).map(([key, label]) => (
          <ToolbarButton
            key={key}
            label={`${label}设置`}
            active={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </ToolbarButton>
        ))}
      </div>
      <div className="mimir-pptx-paragraph__content">
        <ToolbarPropertyForm columns={1}>
          {tab !== 'textbox' && (
            <ToolbarMenuNote>{scope}。仅应用修改过的字段；混合值保持各段原格式。</ToolbarMenuNote>
          )}
          {tab === 'paragraph' && (
            <>
              <ToolbarMenuFields label="对齐与方向">
                <ToolbarSelect
                  disabled={locked}
                  label="段落对齐"
                  value={value('align', (p) => p.align ?? 'left')}
                  emptyLabel="混合"
                  options={options([
                    ['left', '左对齐'],
                    ['center', '居中'],
                    ['right', '右对齐'],
                    ['justify', '两端对齐'],
                  ])}
                  onChange={(align) => change({ align })}
                />
                <ToolbarSelect
                  disabled={locked}
                  label="文字基础方向"
                  value={
                    paragraphRtl === null
                      ? null
                      : paragraphRtl === undefined
                        ? 'auto'
                        : paragraphRtl
                          ? 'rtl'
                          : 'ltr'
                  }
                  emptyLabel="混合"
                  options={[
                    { value: 'auto', label: '自动（按文字）', disabled: true },
                    ...options([
                      ['ltr', '从左到右'],
                      ['rtl', '从右到左'],
                    ]),
                  ]}
                  onChange={(direction) => change({ rtl: direction === 'rtl' })}
                />
              </ToolbarMenuFields>
              <ToolbarMenuFields label="段落间距">
                {numberField('lineSpacingPct', '行距（%）', (p) =>
                  p.lineExact !== undefined ? `${p.lineExact} pt（固定）` : (p.lineHeight ?? 100),
                )}
                <ToolbarMenuNote>100%为单倍行距；修改固定行距后改用百分比。</ToolbarMenuNote>
                <div className="mimir-pptx-paragraph__pair">
                  {numberField('spaceBeforePt', '段前（pt）', (p) =>
                    p.spaceBeforePct !== undefined ? `${p.spaceBeforePct}%` : (p.spaceBefore ?? 0),
                  )}
                  {numberField('spaceAfterPt', '段后（pt）', (p) =>
                    p.spaceAfterPct !== undefined ? `${p.spaceAfterPct}%` : (p.spaceAfter ?? 0),
                  )}
                </div>
              </ToolbarMenuFields>
              <ToolbarMenuFields label="列表层级">
                <ToolbarMenuNote>
                  当前层级：{uniform((p) => (p.level ?? 0) + 1) ?? '混合'}
                  {draft.indentDelta ? `；待${draft.indentDelta === 1 ? '增加' : '减少'}一级` : ''}
                </ToolbarMenuNote>
                <div className="mimir-pptx-paragraph__pair">
                  <ToolbarButton
                    label="减少列表缩进"
                    disabled={indices.every((i) => (text.paragraphs[i]?.level ?? 0) <= 0)}
                    disabledReason="所选段落已在第一级"
                    onClick={() => change({ indentDelta: -1 })}
                  >
                    减少缩进
                  </ToolbarButton>
                  <ToolbarButton
                    label="增加列表缩进"
                    disabled={indices.every((i) => (text.paragraphs[i]?.level ?? 0) >= 8)}
                    disabledReason="所选段落已达到最大层级"
                    onClick={() => change({ indentDelta: 1 })}
                  >
                    增加缩进
                  </ToolbarButton>
                </div>
              </ToolbarMenuFields>
            </>
          )}
          {tab === 'list' && (
            <>
              <ToolbarMenuFields label="列表样式">
                <ToolbarSelect
                  disabled={locked}
                  label="列表样式"
                  value={listType}
                  emptyLabel="混合"
                  options={options([
                    ['none', '无列表'],
                    ['char', '项目符号'],
                    ['number', '数字编号'],
                    ...(listType === 'blip' ? [['blip', '图片符号'] as const] : []),
                  ])}
                  onChange={(bullet) => {
                    setError('')
                    setStatus('')
                    setImageName('')
                    setDraft((current) => {
                      const {
                        bulletImage: _image,
                        bulletChar: _char,
                        bulletFont: _font,
                        numType: _type,
                        startAt: _start,
                        ...rest
                      } = current
                      return { ...rest, bullet }
                    })
                  }}
                />
                {listType === 'char' && (
                  <>
                    <div
                      className="mimir-pptx-paragraph__gallery"
                      role="group"
                      aria-label="项目符号预设"
                    >
                      {bulletPresets.map((preset) => (
                        <ToolbarButton
                          key={preset.label}
                          label={preset.label}
                          active={
                            value('bulletChar', (p) => p.bullet?.char ?? '•') === preset.char &&
                            value('bulletFont', (p) => p.bullet?.font ?? '') === preset.font
                          }
                          onClick={() =>
                            change({
                              bullet: 'char',
                              bulletChar: preset.char,
                              bulletFont: preset.font,
                            })
                          }
                        >
                          {preset.glyph}
                        </ToolbarButton>
                      ))}
                    </div>
                    <ToolbarTextField
                      label="项目符号字符"
                      value={value('bulletChar', (p) => p.bullet?.char ?? '•') ?? ''}
                      placeholder="混合"
                      onChange={(bulletChar) =>
                        change({ bullet: 'char', bulletChar, bulletFont: 'Arial' })
                      }
                    />
                    <ToolbarTextField
                      label="符号字体"
                      value={value('bulletFont', (p) => p.bullet?.font ?? '') ?? ''}
                      placeholder={
                        uniform((p) => p.bullet?.font ?? '') === null ? '混合' : '随文字字体'
                      }
                      onChange={(bulletFont) => change({ bulletFont })}
                    />
                  </>
                )}
                {listType === 'number' && (
                  <>
                    <ToolbarSelect
                      disabled={locked}
                      label="编号格式"
                      value={numberType}
                      emptyLabel="混合"
                      fallbackLabel={uniform((p) => p.bullet?.numType ?? 'arabicPeriod') ?? '混合'}
                      options={numberOptions}
                      onChange={(numType) => change({ numType })}
                    />
                    {numberField('startAt', '起始编号', (p) => p.bullet?.startAt ?? 1)}
                  </>
                )}
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label="图片项目符号文件"
                  onChange={(event) => {
                    pickImage(event.currentTarget.files?.[0])
                    event.currentTarget.value = ''
                  }}
                />
                <ToolbarButton label="选择图片项目符号" onClick={() => fileInput.current?.click()}>
                  <ImagePlus size={15} />
                  {listType === 'blip' ? '替换图片符号' : '使用图片符号'}
                </ToolbarButton>
                <ToolbarMenuNote>
                  {imageName
                    ? `待应用：${imageName}`
                    : listType === 'blip'
                      ? '当前为图片符号；未替换时保留原图片。'
                      : 'PNG或JPEG，最多512 KiB。'}
                </ToolbarMenuNote>
              </ToolbarMenuFields>
              {listType !== 'none' && (
                <ToolbarMenuFields label="符号外观与缩进">
                  <div className="mimir-pptx-paragraph__pair">
                    {numberField('bulletSizePct', '符号大小（%）', (p) =>
                      p.bullet?.sizePt !== undefined
                        ? `${p.bullet.sizePt} pt（固定）`
                        : (p.bullet?.sizePct ?? 100),
                    )}
                    {numberField('bulletHangEmu', '悬挂缩进（pt）', (p) =>
                      p.indent !== undefined ? Math.max(0, -p.indent) / PT : 22.5,
                    )}
                  </div>
                  <ToolbarColorPicker
                    label="符号颜色预设"
                    inline
                    disabled={locked}
                    value={value('bulletColor', (p) => p.bullet?.color ?? '')}
                    options={bulletColors}
                    onPick={(bulletColor) => change({ bulletColor })}
                  />
                  <ToolbarTextField
                    label="符号颜色"
                    value={
                      value('bulletColor', (p) =>
                        typeof p.bullet?.color === 'string' ? p.bullet.color : '',
                      ) ?? ''
                    }
                    placeholder="混合或随文字颜色 · #RRGGBB"
                    onChange={(bulletColor) => change({ bulletColor })}
                  />
                  <ToolbarMenuNote>
                    100%与文字等大。悬挂缩进按当前列表层级同步调整。
                  </ToolbarMenuNote>
                </ToolbarMenuFields>
              )}
            </>
          )}
          {tab === 'textbox' && (
            <ToolbarMenuFields label="整个文本框 · 即时应用">
              <ToolbarSelect
                disabled={locked}
                label="文本垂直对齐"
                value={text.anchor ?? 'top'}
                options={options([
                  ['top', '顶部'],
                  ['middle', '中部'],
                  ['bottom', '底部'],
                ])}
                onChange={(anchor) => void run({ op: 'setTextAnchor', target, anchor })}
              />
              <ToolbarSelect
                disabled={locked}
                label="文本方向"
                value={text.vert ?? 'horz'}
                options={options([
                  ['horz', '水平'],
                  ['eaVert', '东亚竖排'],
                  ['vert', '垂直'],
                  ['vert270', '旋转270°'],
                  ['wordArtVert', '堆叠'],
                ])}
                onChange={(vert) => body({ vert })}
              />
              <ToolbarSelect
                disabled={locked}
                label="文本自适应"
                value={text.autofit ?? 'none'}
                options={options([
                  ['none', '不自动调整'],
                  ['shrink', '溢出时缩小文字'],
                  ['resize', '随文字调整文本框'],
                ])}
                onChange={(autofit) => body({ autofit })}
              />
              <ToolbarSelect
                disabled={locked}
                label="文本自动换行"
                value={text.wrap === false ? 'false' : 'true'}
                options={options([
                  ['true', '换行'],
                  ['false', '不换行'],
                ])}
                onChange={(next) => body({ wrap: next === 'true' })}
              />
              <div className="mimir-pptx-paragraph__pair">
                {(['l', 't', 'r', 'b'] as const).map((side, index) => (
                  <ToolbarNumberField
                    key={side}
                    label={`文本${['左', '上', '右', '下'][index]}边距（pt）`}
                    value={(text.insets?.[side] ?? 0) / PT}
                    min={0}
                    max={1000}
                    step={0.5}
                    onCommit={(next) =>
                      body({ insets: { ...text.insets, [side]: Math.round(next * PT) } })
                    }
                  />
                ))}
              </div>
            </ToolbarMenuFields>
          )}
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-paragraph__actions">
        {error && <p role="alert">{error}</p>}
        {status && <ToolbarMenuNote>{status}</ToolbarMenuNote>}
        {locked && <ToolbarMenuNote>{reading ? '正在读取图片…' : '正在应用修改…'}</ToolbarMenuNote>}
        <ToolbarMenuNote>
          {dirty
            ? `待应用到${scope}`
            : tab === 'textbox'
              ? '文本框设置即时应用'
              : '修改字段后应用到所选段落'}
        </ToolbarMenuNote>
        <div className="mimir-pptx-paragraph__buttons">
          <ToolbarButton
            label="重置段落草稿"
            disabled={!dirty}
            disabledReason="尚未修改段落格式"
            onClick={reset}
          >
            <RotateCcw size={14} />
            重置
          </ToolbarButton>
          <ToolbarButton
            label="应用段落格式"
            primary
            disabled={!dirty || !indices.length}
            disabledReason="请先修改段落格式"
            onClick={() => void submit()}
          >
            <Check size={15} />
          </ToolbarButton>
        </div>
      </div>
    </fieldset>
  )
}

export function PptxPictureControls({
  element,
  target,
  apply,
  onStartCrop,
  cropUnavailableReason,
}: {
  element: Extract<SlideElement, { type: 'picture' }>
  target: PptxTarget
  apply: PptxApply
  onStartCrop?: () => void
  cropUnavailableReason?: string
}) {
  const { busy, run } = usePptxAction(apply)
  const [crop, setCrop] = useState(() => ({
    l: element.srcRect?.l ?? 0,
    t: element.srcRect?.t ?? 0,
    r: element.srcRect?.r ?? 0,
    b: element.srcRect?.b ?? 0,
  }))
  const invalid = crop.l + crop.r >= 1 || crop.t + crop.b >= 1
  const [error, setError] = useState('')
  const submit = async (srcRect: typeof crop | null) => {
    setError('')
    try {
      const changed = await run({ op: 'setPictureSrcRect', target, srcRect })
      if (!changed) setError('裁切未应用，请重试；原有图片已保留')
    } catch {
      setError('裁切未应用，请重试；原有图片已保留')
    }
  }
  const rotate = (rotDeg: number) =>
    void run({
      op: 'setTransform',
      target,
      box: element.transform.offset,
      rotDeg: ((rotDeg % 360) + 360) % 360,
    })
  return (
    <fieldset className="mimir-pptx-picture-controls" disabled={busy} aria-busy={busy}>
      <div className="mimir-pptx-picture-controls__content">
        <ToolbarPropertyForm>
          <ToolbarMenuFields label="裁切范围">
            {onStartCrop && (
              <ToolbarButton
                label="在画布裁切图片"
                disabled={busy || !!cropUnavailableReason}
                disabledReason={cropUnavailableReason || '正在处理图片'}
                onClick={onStartCrop}
              >
                <Crop size={15} />
                在画布裁切
              </ToolbarButton>
            )}
            <ToolbarMenuNote>设置四边裁去的比例，点击应用后生效。</ToolbarMenuNote>
            <div className="mimir-pptx-picture-controls__pair">
              {(['l', 't', 'r', 'b'] as const).map((side, index) => (
                <ToolbarNumberField
                  key={side}
                  label={`裁去${['左', '上', '右', '下'][index]}侧（%）`}
                  value={crop[side] * 100}
                  min={0}
                  max={99}
                  step={1}
                  onCommit={(value) => setCrop({ ...crop, [side]: value / 100 })}
                />
              ))}
            </div>
            {invalid && <ToolbarMenuNote>相对两边裁切之和必须小于100%。</ToolbarMenuNote>}
          </ToolbarMenuFields>
          <ToolbarMenuFields label="图片外观">
            <ToolbarNumberField
              label="图片不透明度（%）"
              value={(element.opacity ?? 1) * 100}
              min={0}
              max={100}
              step={1}
              onCommit={(value) =>
                void run({ op: 'setPictureOpacity', target, opacity: value / 100 })
              }
            />
            <ToolbarNumberField
              label="旋转角度（°）"
              value={element.transform.rot / 60000}
              min={-360}
              max={360}
              onCommit={rotate}
            />
            <div className="mimir-pptx-picture-controls__pair">
              <ToolbarButton
                label="图片向左旋转90度"
                onClick={() => rotate(element.transform.rot / 60000 - 90)}
              >
                <RotateCcw size={15} />
                向左90°
              </ToolbarButton>
              <ToolbarButton
                label="图片向右旋转90度"
                onClick={() => rotate(element.transform.rot / 60000 + 90)}
              >
                <RotateCw size={15} />
                向右90°
              </ToolbarButton>
            </div>
            <ToolbarMenuNote>不透明度和旋转角度即时应用。</ToolbarMenuNote>
          </ToolbarMenuFields>
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-picture-controls__actions">
        {error && <p role="alert">{error}</p>}
        {busy && <ToolbarMenuNote>正在应用图片修改…</ToolbarMenuNote>}
        <div className="mimir-pptx-picture-controls__pair">
          <ToolbarButton
            label="重置图片裁切"
            disabled={busy || !element.srcRect}
            disabledReason="图片没有裁切"
            onClick={() => void submit(null)}
          >
            <RotateCcw size={15} />
            重置裁切
          </ToolbarButton>
          <ToolbarButton
            label="应用图片裁切"
            primary
            disabled={busy || invalid}
            disabledReason={busy ? '正在应用图片修改' : '裁切后须保留可见区域'}
            onClick={() => void submit(crop)}
          >
            <Check size={15} />
          </ToolbarButton>
        </div>
      </div>
    </fieldset>
  )
}

export function PptxEffectsControls({
  element,
  target,
  apply,
}: {
  element: SlideElement
  target: PptxTarget
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  if (element.type !== 'picture' && element.type !== 'shape' && element.type !== 'text')
    return <ToolbarMenuNote>效果适用于图片、文本框和形状。</ToolbarMenuNote>
  const effects = (value: Record<string, unknown>) =>
    void run({ op: 'setEffects', target, effects: value })
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="对象效果">
        <ToolbarMenuNote>
          画布以 SVG 近似显示阴影、发光、柔化和倒影；原件保留 Office 效果参数。
        </ToolbarMenuNote>
        <ToolbarSelect
          label="阴影"
          disabled={busy}
          value={element.shadow ? (element.shadow.inner ? 'inner' : 'outer') : 'none'}
          options={options([
            ['none', '无阴影'],
            ['outer', '外阴影'],
            ['inner', '内阴影'],
          ])}
          onChange={(value) =>
            effects({
              shadow:
                value === 'none'
                  ? null
                  : {
                      color: element.shadow?.color ?? '#00000066',
                      blurRad: element.shadow?.blurRad ?? 4 * PT,
                      dist: element.shadow?.dist ?? 3 * PT,
                      dirDeg: element.shadow?.dirDeg ?? 45,
                      inner: value === 'inner',
                    },
            })
          }
        />
        <ToolbarNumberField
          label="阴影模糊（pt）"
          value={(element.shadow?.blurRad ?? 0) / PT}
          min={0}
          max={100}
          onCommit={(value) =>
            effects({
              shadow: {
                ...element.shadow,
                color: element.shadow?.color ?? '#00000066',
                dist: element.shadow?.dist ?? 3 * PT,
                dirDeg: element.shadow?.dirDeg ?? 45,
                blurRad: value * PT,
              },
            })
          }
        />
        <ToolbarNumberField
          label="发光半径（pt）"
          value={(element.glow?.radius ?? 0) / PT}
          min={0}
          max={100}
          onCommit={(value) =>
            effects({
              glow: value
                ? { color: element.glow?.color ?? '#4A90E299', radius: value * PT }
                : null,
            })
          }
        />
        <ToolbarNumberField
          label="柔化边缘（pt）"
          value={(element.softEdge ?? 0) / PT}
          min={0}
          max={100}
          onCommit={(value) => effects({ softEdge: value ? value * PT : null })}
        />
        <ToolbarSelect
          label="倒影"
          disabled={busy}
          value={element.reflection ? 'true' : 'false'}
          options={options([
            ['false', '无倒影'],
            ['true', '半透明倒影'],
          ])}
          onChange={(value) =>
            effects({
              reflection:
                value === 'true' ? { blurRad: PT, startA: 0.4, endPos: 0.6, dist: 2 * PT } : null,
            })
          }
        />
        <ToolbarButton
          label="清除全部对象效果"
          onClick={() => effects({ shadow: null, glow: null, reflection: null, softEdge: null })}
        >
          清除效果
        </ToolbarButton>
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}

export function PptxLinkControls({
  link,
  target,
  count,
  apply,
}: {
  link: PptxLink | null
  target: PptxTarget
  count: number
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  const [kind, setKind] = useState<string>(link?.kind ?? 'url')
  const [url, setUrl] = useState(link?.kind === 'url' ? link.url : '')
  const [slide, setSlide] = useState(link?.kind === 'slide' ? link.slideIndex : 0)
  const [action, setAction] = useState(link?.kind === 'action' ? link.action : 'nextslide')
  const valid = kind !== 'url' || /^(https?:|mailto:|tel:)/i.test(url)
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="对象超链接">
        <ToolbarMenuNote>点击编辑画布只选择对象。放映时可点击对象打开链接或跳页。</ToolbarMenuNote>
        <ToolbarSelect
          label="链接类型"
          disabled={busy}
          value={kind}
          options={options([
            ['url', '网页或邮箱'],
            ['slide', '此演示文稿中的幻灯片'],
            ['action', '放映动作'],
          ])}
          onChange={setKind}
        />
        {kind === 'url' && <ToolbarTextField label="链接地址" value={url} onChange={setUrl} />}
        {kind === 'slide' && (
          <ToolbarNumberField
            label="链接目标页"
            value={slide + 1}
            min={1}
            max={count}
            onCommit={(value) => setSlide(value - 1)}
          />
        )}
        {kind === 'action' && (
          <ToolbarSelect
            label="放映动作"
            disabled={busy}
            value={action}
            options={options([
              ['nextslide', '下一页'],
              ['previousslide', '上一页'],
              ['firstslide', '第一页'],
              ['lastslide', '最后一页'],
              ['lastslideviewed', '上次查看的页'],
              ['endshow', '结束放映'],
            ])}
            onChange={setAction}
          />
        )}
        <ToolbarButton
          label="应用对象链接"
          disabled={!valid}
          disabledReason="请输入 http、https、mailto 或 tel 链接"
          onClick={() =>
            void run({
              op: 'setLink',
              target,
              link:
                kind === 'url'
                  ? { kind, url }
                  : kind === 'slide'
                    ? { kind, slideIndex: slide }
                    : { kind, action },
            })
          }
        >
          应用链接
        </ToolbarButton>
        <ToolbarButton
          label="移除对象链接"
          disabled={!link}
          disabledReason="对象没有链接"
          onClick={() => void run({ op: 'setLink', target, link: null })}
        >
          移除链接
        </ToolbarButton>
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}

const SHAPES = options([
  ['rect', '矩形'],
  ['roundRect', '圆角矩形'],
  ['ellipse', '椭圆'],
  ['triangle', '三角形'],
  ['diamond', '菱形'],
  ['rightArrow', '右箭头'],
  ['chevron', '燕尾箭头'],
  ['star5', '五角星'],
  ['hexagon', '六边形'],
  ['wedgeRoundRectCallout', '圆角标注'],
  ['line', '直线'],
  ['lineArrow', '箭头线'],
  ['lineArrowDouble', '双向箭头'],
  ['lineBent', '折线'],
  ['lineCurved', '曲线'],
])
export function PptxShapeControls({
  target,
  element,
  slide,
  width,
  height,
  apply,
}: {
  target: PptxTarget | null
  element: SlideElement | null
  slide: number
  width: number
  height: number
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  const [kind, setKind] = useState(
    element && (element.type === 'shape' || element.type === 'text')
      ? (element.presetGeometry ?? 'rect')
      : 'rect',
  )
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="形状库">
        <ToolbarSelect
          label="形状类型"
          disabled={busy}
          value={kind}
          options={
            SHAPES.some((item) => item.value === kind)
              ? SHAPES
              : [...SHAPES, { value: kind, label: `${kind}（当前）` }]
          }
          onChange={setKind}
        />
        <ToolbarButton
          label="插入所选形状"
          onClick={() =>
            void run({
              op: 'addElement',
              target: { slide },
              kind,
              offset: {
                x: Math.round(width * 0.2),
                y: Math.round(height * 0.25),
                cx: Math.round(width * 0.3),
                cy: Math.round(height * 0.2),
              },
              fill: '#D9E8FB',
              stroke: { color: '#245A9B', widthEmu: PT },
            })
          }
        >
          插入形状
        </ToolbarButton>
        <ToolbarButton
          label="更改选中形状"
          disabled={
            !target ||
            !element ||
            (element.type !== 'shape' && element.type !== 'text') ||
            !element.presetGeometry
          }
          disabledReason="先选择带预设几何的形状"
          onClick={() => target && void run({ op: 'setShapeGeometry', target, prst: kind })}
        >
          更改形状
        </ToolbarButton>
        {target &&
          element &&
          (element.type === 'shape' || element.type === 'text') &&
          Object.entries(
            element.adjust ??
              (element.presetGeometry === 'roundRect'
                ? { adj: 16667 }
                : ['rightArrow', 'chevron'].includes(element.presetGeometry ?? '')
                  ? { adj1: 50000, adj2: 50000 }
                  : {}),
          ).map(([key, value]) => (
            <ToolbarNumberField
              key={key}
              label={`形状调节 ${key}`}
              value={value}
              min={-1000000}
              max={1000000}
              step={1000}
              onCommit={(next) =>
                void run({
                  op: 'setShapeAdjust',
                  target,
                  adjust: { ...element.adjust, [key]: next },
                })
              }
            />
          ))}
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}

const id = (el: SlideElement) => elementDurableId(el) ?? el.id
export function PptxArrangeControls({
  elements,
  slide,
  selected,
  selectedRefs,
  onSelectionChange,
  apply,
}: {
  elements: readonly SlideElement[]
  slide: number
  selected: string | null
  selectedRefs?: readonly string[]
  onSelectionChange?: (refs: string[]) => void
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  const [localIds, setLocalIds] = useState<string[]>(() =>
    elements.filter((el) => el.id === selected).map(id),
  )
  const ids = selectedRefs
    ? elements.filter((el) => selectedRefs.some((ref) => matchesElementRef(el, ref))).map(id)
    : localIds
  const setIds = (next: string[]) =>
    onSelectionChange ? onSelectionChange(next) : setLocalIds(next)
  const [to, setTo] = useState('selection')
  const [mode, setMode] = useState('left')
  const [axis, setAxis] = useState('horizontal')
  const [from, setFrom] = useState(elements[0] ? id(elements[0]) : '')
  const [end, setEnd] = useState(elements[1] ? id(elements[1]) : '')
  const [connector, setConnector] = useState('straight')
  const choices = elements.map((el, index) => ({
    value: id(el),
    label: `${index + 1}. ${el.name || el.type}`,
  }))
  const group = elements.find((el) => el.id === selected && el.type === 'group')
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="多对象排列">
        <ToolbarMenuNote>
          与画布使用同一组选中对象。按住 Shift 可追加选择；组合成员可在“选择与格式”中编辑。
        </ToolbarMenuNote>
        {choices.map((item) => (
          <ToolbarButton
            key={item.value}
            label={`排列选择 ${item.label}`}
            active={ids.includes(item.value)}
            onClick={() =>
              setIds(
                ids.includes(item.value)
                  ? ids.filter((value) => value !== item.value)
                  : [...ids, item.value],
              )
            }
          >
            {item.label}
          </ToolbarButton>
        ))}
        <ToolbarSelect
          label="排列参照"
          disabled={busy}
          value={to}
          options={options([
            ['selection', '选中对象范围'],
            ['slide', '幻灯片'],
          ])}
          onChange={setTo}
        />
        <ToolbarSelect
          label="对齐方式"
          disabled={busy}
          value={mode}
          options={options([
            ['left', '左对齐'],
            ['centerH', '水平居中'],
            ['right', '右对齐'],
            ['top', '顶端对齐'],
            ['centerV', '垂直居中'],
            ['bottom', '底端对齐'],
          ])}
          onChange={setMode}
        />
        <ToolbarButton
          label="对齐所选对象"
          disabled={ids.length < (to === 'slide' ? 1 : 2)}
          disabledReason={to === 'slide' ? '至少选择1个对象' : '至少选择2个对象'}
          onClick={() => void run({ op: 'alignElements', target: { slide }, els: ids, to, mode })}
        >
          应用对齐
        </ToolbarButton>
        <ToolbarSelect
          label="分布方向"
          disabled={busy}
          value={axis}
          options={options([
            ['horizontal', '水平分布'],
            ['vertical', '垂直分布'],
          ])}
          onChange={setAxis}
        />
        <ToolbarButton
          label="分布所选对象"
          disabled={ids.length < (to === 'slide' ? 1 : 3)}
          disabledReason={to === 'slide' ? '至少选择1个对象' : '至少选择3个对象'}
          onClick={() =>
            void run({ op: 'distributeElements', target: { slide }, els: ids, to, axis })
          }
        >
          应用分布
        </ToolbarButton>
        <ToolbarButton
          label="组合所选对象"
          disabled={ids.length < 2}
          disabledReason="至少选择2个顶层对象"
          onClick={() => void run({ op: 'groupElements', target: { slide }, els: ids })}
        >
          组合
        </ToolbarButton>
        <ToolbarButton
          label="取消所选组合"
          disabled={!group}
          disabledReason="先在画布或对象选择器中选择组合"
          onClick={() =>
            group && void run({ op: 'ungroupElement', target: { slide, el: id(group) } })
          }
        >
          取消组合
        </ToolbarButton>
      </ToolbarMenuFields>
      <ToolbarMenuFields label="连接两个对象">
        <ToolbarSelect
          label="连接起点对象"
          disabled={busy}
          value={from}
          options={choices}
          onChange={setFrom}
        />
        <ToolbarSelect
          label="连接终点对象"
          disabled={busy}
          value={end}
          options={choices}
          onChange={setEnd}
        />
        <ToolbarSelect
          label="连接线类型"
          disabled={busy}
          value={connector}
          options={options([
            ['straight', '直线'],
            ['elbow', '肘形'],
            ['curved', '曲线'],
          ])}
          onChange={setConnector}
        />
        <ToolbarButton
          label="插入对象连接线"
          disabled={!from || !end || from === end}
          disabledReason="选择两个不同的顶层对象"
          onClick={() =>
            void run({
              op: 'addConnector',
              target: { slide },
              from,
              to: end,
              kind: connector,
              arrow: 'end',
            })
          }
        >
          插入连接线
        </ToolbarButton>
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}

/** Explicit points are local to the selected shape; a closed polygon is a useful edit-points subset. */
export function PptxFreeformControls({
  element,
  target,
  apply,
}: {
  element: Extract<SlideElement, { type: 'shape' | 'text' }>
  target: PptxTarget
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  const [mode, setMode] = useState(element.customGeometry ? 'curves' : 'polygon')
  const rawPath = /<a:path\b([^>]*)>([\s\S]*?)<\/a:path>/.exec(element.anchor.originalXml)
  const w = Number(/\bw="([^"]+)"/.exec(rawPath?.[1] ?? '')?.[1]),
    h = Number(/\bh="([^"]+)"/.exec(rawPath?.[1] ?? '')?.[1])
  const initial =
    rawPath && w > 0 && h > 0 && !/<a:(?:quadBezTo|cubicBezTo|arcTo)\b/.test(rawPath[2]!)
      ? [...rawPath[2]!.matchAll(/<a:pt\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"/g)]
          .map(
            (match) =>
              `${Math.round((Number(match[1]) / w) * 10000) / 100},${Math.round((Number(match[2]) / h) * 10000) / 100}`,
          )
          .join('\n')
      : ''
  const [points, setPoints] = useState(initial)
  const pairs = points
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/[,，\s]+/).map(Number))
  const invalid =
    pairs.length < 3 ||
    pairs.length > 100 ||
    pairs.some(
      (pair) =>
        pair.length !== 2 ||
        pair.some((value) => !Number.isFinite(value) || value < 0 || value > 100),
    )
  const box = element.transform.offset
  return (
    <>
      <ToolbarSelect
        label="路径编辑方式"
        disabled={busy}
        value={mode}
        options={[
          { value: 'polygon', label: '多边形顶点' },
          { value: 'curves', label: '曲线与开放路径' },
        ]}
        onChange={setMode}
      />
      {mode === 'curves' ? (
        <PptxCurveControls element={element} target={target} apply={run} />
      ) : (
        <PptxControlPanel busy={busy}>
          <ToolbarMenuFields label="编辑形状顶点">
            <ToolbarMenuNote>
              输入闭合多边形顶点，每行“横向百分比,纵向百分比”，范围0–100。应用会替换当前几何，保留文字与填充。
            </ToolbarMenuNote>
            <ToolbarTextArea
              label="形状顶点（每行x,y）"
              value={points}
              rows={5}
              onChange={setPoints}
            />
            <ToolbarButton
              label="应用自定义多边形"
              disabled={invalid || box.cx <= 0 || box.cy <= 0}
              disabledReason="输入至少3个有效顶点且形状须有可见尺寸"
              onClick={() =>
                void run({
                  op: 'setShapeCustomGeometry',
                  target,
                  path: {
                    w: box.cx,
                    h: box.cy,
                    cmds: [
                      ...pairs.map((pair, index) => ({
                        op: index === 0 ? 'M' : 'L',
                        pts: [
                          Math.round((pair[0]! * box.cx) / 100),
                          Math.round((pair[1]! * box.cy) / 100),
                        ],
                      })),
                      { op: 'Z', pts: [] },
                    ],
                  },
                })
              }
            >
              应用顶点
            </ToolbarButton>
          </ToolbarMenuFields>
        </PptxControlPanel>
      )}
    </>
  )
}
export function PptxConnectorControls({
  element,
  elements,
  target,
  apply,
}: {
  element: SlideElement
  elements: readonly SlideElement[]
  target: PptxTarget
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply),
    box = element.transform.offset
  const [points, setPoints] = useState({
    x1: (element.transform.flipH ? box.x + box.cx : box.x) / PT,
    y1: (element.transform.flipV ? box.y + box.cy : box.y) / PT,
    x2: (element.transform.flipH ? box.x : box.x + box.cx) / PT,
    y2: (element.transform.flipV ? box.y : box.y + box.cy) / PT,
  })
  const connection = (end: 'start' | 'end') =>
    elements.find((item) => Number(item.nvId) === element.connection?.[end]?.id)
  const [from, setFrom] = useState(() => {
      const item = connection('start')
      return item ? id(item) : ''
    }),
    [to, setTo] = useState(() => {
      const item = connection('end')
      return item ? id(item) : ''
    })
  const [startIndex, setStartIndex] = useState(element.connection?.start?.idx ?? 0),
    [endIndex, setEndIndex] = useState(element.connection?.end?.idx ?? 0)
  const choices = [
    { value: '', label: '不连接对象' },
    ...elements
      .filter((item) => item.id !== element.id)
      .map((item) => ({ value: id(item), label: item.name ?? item.type })),
  ]
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="连接线端点">
        {Object.entries(points).map(([key, value]) => (
          <ToolbarNumberField
            key={key}
            label={`端点${{ x1: '1 横坐标', y1: '1 纵坐标', x2: '2 横坐标', y2: '2 纵坐标' }[key]}（pt）`}
            value={value}
            step={1}
            onCommit={(next) => setPoints({ ...points, [key]: next })}
          />
        ))}
        <ToolbarSelect
          label="端点1连接对象"
          disabled={busy}
          value={from}
          options={choices}
          onChange={setFrom}
        />
        <ToolbarNumberField
          label="端点1连接点索引"
          value={startIndex}
          min={0}
          max={15}
          onCommit={setStartIndex}
        />
        <ToolbarSelect
          label="端点2连接对象"
          disabled={busy}
          value={to}
          options={choices}
          onChange={setTo}
        />
        <ToolbarNumberField
          label="端点2连接点索引"
          value={endIndex}
          min={0}
          max={15}
          onCommit={setEndIndex}
        />
        <ToolbarMenuNote>连接点索引沿用原件几何；移除对象连接后可自由设置端点。</ToolbarMenuNote>
        <ToolbarButton
          label="应用连接线端点"
          onClick={() =>
            void run({
              op: 'setConnectorEndpoints',
              target,
              p1: { x: Math.round(points.x1 * PT), y: Math.round(points.y1 * PT) },
              p2: { x: Math.round(points.x2 * PT), y: Math.round(points.y2 * PT) },
              start: from ? { targetId: from, idx: startIndex } : null,
              end: to ? { targetId: to, idx: endIndex } : null,
            })
          }
        >
          应用端点
        </ToolbarButton>
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}
