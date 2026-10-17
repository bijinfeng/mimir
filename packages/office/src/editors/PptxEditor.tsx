import { PptxDeckWritingPreview, usePptxDeckWriting } from './PptxDeckWritingPreview.js'
import { PPTX_PICTURE_ACCEPT, PPTX_PICTURE_FORMATS } from '@mimir/shared'
import { preparePptxPictureFile } from '../pptx-image-display.js'
/**
 * Current-workbook PPTX editor. Rendering, manual tools and Agent writes share one
 * patch-preserving session and history. Native text selection spans paragraphs;
 * range edits preserve source run XML and collapsed carets hold typing marks.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { editableElements, openPptxForEdit, textOfElement } from '../pptx.js'
import { PptxClipboardControls, publishPptxClipboardResult } from './PptxClipboardControls.js'
import { PptxClipboardBridge } from './PptxClipboardBridge.js'
import { writePptxClipboardMarker } from '../pptx-system-clipboard.js'
import { pptxClipboardTargets } from '../pptx-selection-clipboard.js'
import { PptxOutputControls } from './PptxOutputControls.js'
import { PptxTextRangeEditor, type PptxTextSelectionEvent } from './PptxTextRangeEditor.js'
import {
  formatPptxTextRange,
  pptxSelectionRuns,
  type PptxTextSelection,
} from '../pptx-text-range.js'
import { PptxAnimationPreview, type PptxAnimationPreviewRequest } from './PptxAnimationPreview.js'
import { PptxZoomControls } from './PptxZoomControls.js'
import {
  PptxShowControls,
  type PptxShowRequest,
  type PptxRehearsalResult,
} from './PptxShowControls.js'
import { PptxIconControls, PptxCutoutControls } from './PptxPictureTools.js'
import { PptxGroupPictureControls } from './PptxGroupPictureControls.js'
import { capturePptxBrush, pptxBrushOps, type PptxBrush } from '../pptx-format-brush.js'
import { PptxMasterControls } from './PptxMasterControls.js'
import { PptxModelControls } from './PptxModelControls.js'
import { PptxShapeFillControls, PptxBackgroundControls } from './PptxFillControls.js'
import { PptxInkControls, usePptxInkSettings } from './PptxInkControls.js'
import { PptxInkCanvas } from './PptxInkCanvas.js'
import { PptxShapeInsertCanvas } from './PptxShapeInsertCanvas.js'
import { PptxPictureCropCanvas } from './PptxPictureCropCanvas.js'
import { PptxAiControls } from './PptxAiControls.js'
import { preparePptxAiSnapshot, type PptxAiSnapshotDraft } from './pptx-ai-snapshot.js'
import { PptxSelectionControls } from './PptxSelectionControls.js'
import { PptxSelectionGeometryControls } from './PptxSelectionGeometryControls.js'
import './pptx-selection-workspace.css'
import { PptxCommentControls } from './PptxCommentControls.js'
import { PptxSelectionCanvas } from './PptxSelectionCanvas.js'
import {
  pptxResolveSelection,
  pptxNormalizeSelection,
  pptxExpandSelection,
  pptxSelectionOp,
  pptxSelectionText,
} from './pptx-selection.js'
import { pptxGroupPictureCropReason } from '../pptx-group-picture-crop-guard.js'
import { pptxPictureCropUnavailableReason } from './pptx-picture-crop.js'
import { PptxOutlineControls, pptxElementStroke, pptxOutlineOp } from './PptxOutlineControls.js'
import {
  PPTX_CHART_KINDS,
  pptxChartNeedsPositiveValues,
  type PptxChartKind,
} from './pptx-chart-kinds.js'
import { inkNodesOf } from '../pptx-ink.js'
import type { PptxManualInk, PptxManualShape, PptxManualPicture } from '@mimir/shared'
import {
  PptxWorkspaceViews,
  pptxSlideMoveOps,
  type PptxWorkspaceMode,
} from './PptxWorkspaceViews.js'
import {
  PptxViewControls,
  PptxViewOverlay,
  PptxWorkspaceModeControls,
  defaultPptxView,
} from './PptxViewControls.js'
import type { PptxManualAsset, PptxManualUpload } from '@mimir/shared'
import {
  PptxMediaControls,
  PptxImageFillControls,
  PptxImportControls,
  PptxMediaPlayer,
} from './PptxAssetControls.js'
import {
  createPptxAgentHandle,
  type PptxAgentHandle,
  type PptxHostApply,
} from '../agent/pptx-agent.js'
import {
  elementDurableId,
  matchesElementRef,
} from '../../vendor/packages/pptx-engine/src/identity.js'
import { renderSlide, type PptxRenderable, type RenderedSlide } from '../pptx-render.js'
import {
  EditorShell,
  EditorState,
  FindReplaceBar,
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarConfirm,
  ToolbarFileButton,
  ToolbarGroup,
  ToolbarGridPicker,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuItemRow,
  ToolbarMenuNote,
  ToolbarMenuSeparator,
  ToolbarNotice,
  ToolbarPropertyForm,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarToggleGroup,
  ToolbarTabs,
  ToolbarTextArea,
  ToolbarTextField,
  useFindHotkey,
  type FindReplaceAdapter,
  type ToolbarColorOption,
  type ToolbarSelectOption,
} from '../shell/EditorShell.js'
import {
  BoldIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  FindIcon,
  ItalicIcon,
  RedoIcon,
  SaveIcon,
  UnderlineIcon,
  UndoIcon,
} from '../shell/icons.js'
import type { FindOptions } from '../shims/ui.js'
import type { EditParagraph, EditRun } from '../../vendor/packages/pptx-ops/src/types.js'
import type { Paragraph, TextRun } from '../../vendor/packages/pptx-engine/src/types.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { ThumbnailSidebar } from './ThumbnailSidebar.js'
import { OFFICE_MIME, type EditorProps, type PptxHostAsset } from './types.js'
import { CompactToolbar } from './CompactToolbar.js'
import { ChartEditControls, SlidePlaybackControls } from './PptxAdvancedControls.js'
import { PptxTableControls } from './PptxTableControls.js'
import { PptxShapeGallery } from './PptxShapeGallery.js'
import { PptxScreenRecordControls } from './PptxScreenRecordControls.js'
import {
  PptxParagraphControls,
  PptxFreeformControls,
  PptxConnectorControls,
  PptxPictureControls,
  PptxEffectsControls,
  PptxLinkControls,
  PptxArrangeControls,
} from './PptxObjectControls.js'
import {
  PptxPageControls,
  PptxThemeControls,
  PptxHeaderFooterControls,
  PptxReviewControls,
} from './PptxDeckControls.js'
import { PptxPresentation } from './PptxPresentation.js'
import { PptxHistory } from '../pptx-history.js'
import { PptxClarificationControls } from './PptxClarificationControls.js'
import {
  PptxEquationControls,
  PptxDiagramControls,
  PptxWordArtControls,
  PptxFieldControls,
} from './PptxInsertControls.js'
import type { PptxClarification } from '@mimir/shared'
import './pptx-tools.css'
import './compact-toolbar.css'
import '../shell/shell.css'
import './editors.css'
import './pptx-pdf-toolbar.css'
import './pptx-chart-insert.css'

/**
 * 画布宽度（px）。渲染器按这个宽度算缩放，所以它决定文字大小与换行位置。
 * 960 是「宽屏下不缩得太小、窄屏下还能看」的折中。
 */
const FIT_WIDTH_PX = 960
const THUMBNAIL_WIDTH_PX = 136
const TABLE_GRID_SIZE = 6
const tableCellLabel = (row: number, column: number) => `插入 ${row} 行 ${column} 列表格`
const PICTURE_OPACITIES = [100, 75, 50, 25] as const

/** Only user-entered, finite figures reach addChart; this panel never supplies sample data. */
function ChartInsertControls({
  slide,
  width,
  height,
  apply,
  close,
}: {
  slide: number
  width: number
  height: number
  apply: (op: Record<string, unknown>) => Promise<boolean>
  close: () => void
}) {
  const [kind, setKind] = useState<PptxChartKind>('bar')
  const [title, setTitle] = useState('')
  const [seriesName, setSeriesName] = useState('')
  const [categoryText, setCategoryText] = useState('')
  const [valueText, setValueText] = useState('')
  const [lineName, setLineName] = useState('')
  const [lineText, setLineText] = useState('')
  const [busy, setBusy] = useState(false)
  const draftRevision = useRef(0)
  const categories = categoryText.trim()
    ? categoryText
        .trim()
        .split(/\r?\n/)
        .map((item) => item.trim())
    : []
  const rawValues = valueText.trim()
    ? valueText
        .trim()
        .split(/\r?\n/)
        .map((item) => item.trim())
    : []
  const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i
  const values = rawValues.map(Number)
  const lineRaw = lineText.trim()
    ? lineText
        .trim()
        .split(/\r?\n/)
        .map((item) => item.trim())
    : []
  const lineValues = lineRaw.map(Number)
  const combo = kind === 'comboBarLine'
  const reason =
    categories.length === 0
      ? '请填写类别，每行一项'
      : categories.length > 50 || categories.some((item) => !item || item.length > 80)
        ? '类别须为 1–50 项，且每项不超过 80 个字符'
        : !seriesName.trim() || seriesName.trim().length > 80
          ? '请填写不超过 80 个字符的系列名称'
          : title.length > 120
            ? '图表标题不能超过 120 个字符'
            : rawValues.length !== categories.length
              ? '数值行数必须与类别行数相同'
              : rawValues.some(
                    (item, index) => !numberPattern.test(item) || !Number.isFinite(values[index]),
                  )
                ? '每行须为一个有限数值，不要填单位或千位分隔符'
                : combo && (!lineName.trim() || lineName.trim().length > 80)
                  ? '请填写不超过 80 个字符的折线系列名称'
                  : combo &&
                      (lineRaw.length !== categories.length ||
                        lineRaw.some(
                          (item, index) =>
                            !numberPattern.test(item) || !Number.isFinite(lineValues[index]),
                        ))
                    ? '折线系列须为每个类别填写一个有限数值'
                    : pptxChartNeedsPositiveValues(kind) &&
                        (values.some((value) => value < 0) || !values.some((value) => value > 0))
                      ? '饼图数值不能为负，且至少有一项大于零'
                      : undefined

  const submit = async () => {
    if (reason || busy) return
    const submittedRevision = draftRevision.current
    setBusy(true)
    try {
      const applied = await apply({
        op: 'addChart',
        target: { slide },
        kind,
        title: title.trim() || undefined,
        categories,
        series: [
          { name: seriesName.trim(), values },
          ...(combo ? [{ name: lineName.trim(), values: lineValues }] : []),
        ],
        dataSource: 'user',
        offset: {
          x: Math.round(width * 0.1),
          y: Math.round(height * 0.18),
          cx: Math.round(width * 0.8),
          cy: Math.round(height * 0.62),
        },
      })
      if (applied && draftRevision.current === submittedRevision) close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="mimir-pptx-chart-insert" disabled={busy} aria-busy={busy}>
      <div className="mimir-pptx-chart-insert__content">
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuFields label="插入图表（用户数据）">
            <ToolbarMenuNote>
              数据来源：你在此输入的数值。
              {combo ? '柱形和折线分别使用两个系列。' : '当前每次插入一个数据系列。'}
            </ToolbarMenuNote>
            <ToolbarSelect
              label="图表类型"
              disabled={busy}
              value={kind}
              options={PPTX_CHART_KINDS}
              onChange={(value) => {
                draftRevision.current += 1
                setKind(value)
              }}
            />
            {kind === 'scatter' && (
              <ToolbarMenuNote>类别填数字时作为 X 坐标；文字类别按 1、2、3…排列。</ToolbarMenuNote>
            )}
            <ToolbarTextField
              label="图表标题（可选）"
              value={title}
              onChange={(value) => {
                draftRevision.current += 1
                setTitle(value)
              }}
            />
            <ToolbarTextField
              label="数据系列名称"
              value={seriesName}
              onChange={(value) => {
                draftRevision.current += 1
                setSeriesName(value)
              }}
            />
            <ToolbarTextArea
              label="图表类别（每行一项）"
              rows={3}
              value={categoryText}
              onChange={(value) => {
                draftRevision.current += 1
                setCategoryText(value)
              }}
            />
            <ToolbarTextArea
              label="图表数值（每行一项）"
              rows={3}
              value={valueText}
              onChange={(value) => {
                draftRevision.current += 1
                setValueText(value)
              }}
            />
            {combo && (
              <>
                <ToolbarTextField
                  label="折线系列名称"
                  value={lineName}
                  onChange={(value) => {
                    draftRevision.current += 1
                    setLineName(value)
                  }}
                />
                <ToolbarTextArea
                  label="折线系列数值（每行一项）"
                  rows={3}
                  value={lineText}
                  onChange={(value) => {
                    draftRevision.current += 1
                    setLineText(value)
                  }}
                />
              </>
            )}
          </ToolbarMenuFields>
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-chart-insert__actions">
        <ToolbarMenuNote>
          {busy ? '正在插入图表…' : (reason ?? '数据有效，可以插入图表')}
        </ToolbarMenuNote>
        <ToolbarButton
          label="按输入数据插入图表"
          primary
          disabled={Boolean(reason) || busy}
          disabledReason={busy ? '正在插入图表' : reason}
          onClick={() => void submit()}
        />
      </div>
    </fieldset>
  )
}

function PptxThumbnail({ deck, index }: { deck: PptxRenderable; index: number }) {
  const svgIdPrefix = useId()
  const rendered = useMemo(
    () => renderSlide(deck, index, { fitWidthPx: THUMBNAIL_WIDTH_PX, svgIdPrefix }),
    [deck, index, svgIdPrefix],
  )
  return rendered ? <span dangerouslySetInnerHTML={{ __html: rendered.svg }} /> : null
}

/**
 * 上标 / 下标的 baseline 百分比。
 *
 * **只有三个状态表达得了**：`applyEditParagraphs` 按**符号**判断变化
 * （`edit-text.ts`：`Math.sign(r.baseline) !== Math.sign(oldRun.baseline ?? 0)`），
 * 所以原件里一个 40% 的上标点「上标」不会被打成 30%——同号即不动，那个精确值
 * 保住。取消（0）才写 `baseline="0"`。
 */
const SUPERSCRIPT_BASELINE = 30
const SUBSCRIPT_BASELINE = -25

/** 增大/减小字号的步长（pt） */
const SIZE_STEP_PT = 2
/** 字号区间。`generate.ts` 的 `szAttr` 上限是 4000pt，界面给一个合理的区间 */
const MIN_FONT_SIZE_PT = 1
const MAX_FONT_SIZE_PT = 400

/** 查找命中的描边颜色。**不是**品牌蓝——「选中的」与「找到的那个」要看得出是两件事 */
const FIND_MARK_COLOR = '#d48806'

/** 画布上描边的元素用的类（`editors.css` 里那条 `[data-element-id]` 规则） */
const MARKED_CLASS = 'mimir-pptx-selected'

/**
 * 字体颜色的一档。
 *
 * `value` 就是写进 XML 的 `srgbClr`（`patchRunColor` 取前 6 位），`swatch` 是
 * 界面上画出来的颜色——docx 那边这两个必须分开（它存 OOXML 色名），这里恰好
 * 是同一个字符串，但接口分开的规矩照旧，免得哪天变成第二种格式时被当成一个
 * 东西用。
 */
const TEXT_COLORS: readonly ToolbarColorOption[] = [
  { value: '#000000', label: '黑', swatch: '#000000' },
  { value: '#404040', label: '深灰', swatch: '#404040' },
  { value: '#7F7F7F', label: '中灰', swatch: '#7F7F7F' },
  { value: '#BFBFBF', label: '浅灰', swatch: '#BFBFBF' },
  { value: '#D9D9D9', label: '更浅灰', swatch: '#D9D9D9' },
  { value: '#F2F2F2', label: '极浅灰', swatch: '#F2F2F2' },
  { value: '#FFFFFF', label: '白', swatch: '#FFFFFF' },
  { value: '#C00000', label: '深红', swatch: '#C00000' },
  { value: '#FF0000', label: '红', swatch: '#FF0000' },
  { value: '#ED7D31', label: '橙', swatch: '#ED7D31' },
  { value: '#C55A11', label: '赭', swatch: '#C55A11' },
  { value: '#FFC000', label: '金', swatch: '#FFC000' },
  { value: '#FFD966', label: '浅金', swatch: '#FFD966' },
  { value: '#A64D79', label: '紫红', swatch: '#A64D79' },
  { value: '#7030A0', label: '紫', swatch: '#7030A0' },
  { value: '#FF66CC', label: '粉', swatch: '#FF66CC' },
  { value: '#375623', label: '深绿', swatch: '#375623' },
  { value: '#548235', label: '绿', swatch: '#548235' },
  { value: '#70AD47', label: '亮绿', swatch: '#70AD47' },
  { value: '#A9D08E', label: '浅绿', swatch: '#A9D08E' },
  { value: '#00B050', label: '翠绿', swatch: '#00B050' },
  { value: '#00B0B0', label: '青', swatch: '#00B0B0' },
  { value: '#1F4E79', label: '深蓝', swatch: '#1F4E79' },
  { value: '#2E75B6', label: '蓝', swatch: '#2E75B6' },
  { value: '#0070C0', label: '亮蓝', swatch: '#0070C0' },
  { value: '#4472C4', label: '靛蓝', swatch: '#4472C4' },
  { value: '#8FAADC', label: '浅蓝', swatch: '#8FAADC' },
  { value: '#9DC3E6', label: '淡蓝', swatch: '#9DC3E6' },
  { value: '#00B0F0', label: '天蓝', swatch: '#00B0F0' },
]

/**
 * 常见字体。排在文档里出现过的字体**之后**（那些才是这份文件真正在用的）。
 *
 * 中英文一起换：`patchRunFont` 把 `<a:latin>` / `<a:ea>` / `<a:cs>` 三个槽位
 * 写成同一个值，所以中文名（微软雅黑/苹方）与西文名（Calibri）走同一条路。
 */
const COMMON_FONTS: readonly string[] = [
  'Calibri',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  '微软雅黑',
  '等线',
  '宋体',
  '黑体',
  '楷体',
  '仿宋',
  '苹方',
]

/**
 * 写进 run 的格式项（`EditRun` 里界面能表达的那几项）。
 *
 * **是「要写哪几项」而不是「完整的取值」**：`applyEditParagraphs` 的契约就是
 * 「`undefined` = 保持原值」，只传改动的那一项，其余 run 属性一个字节都不动。
 */
type RunFormat = Partial<
  Pick<
    EditRun,
    'bold' | 'italic' | 'underline' | 'strike' | 'baseline' | 'fontSize' | 'fontFamily' | 'color'
  >
>

/** 一处查找命中：哪一页、哪个元素、第几段、段内偏移 */
interface PptxMatch {
  slideIndex: number
  elementId: string
  paraIndex: number
  start: number
  end: number
}

/* ── 纯函数：文本与匹配 ─────────────────────────────────────────── */

/** 一段的纯文本。查找与「当前值」都按它算 */
function paragraphText(paragraph: Paragraph): string {
  return paragraph.runs.map((run) => run.text).join('')
}

/**
 * 所有 run 的同一个属性是否**完全一致**。
 *
 * 返回 `null` 有三种情形，界面上一律显示「多档…」：空集合、有 run 缺这个属性、
 * 取值不一致。**不拿第一条 run 冒充**——显示的值得是文档里的值。
 */
function uniformOf<T>(runs: readonly TextRun[], pick: (run: TextRun) => T | undefined): T | null {
  let value: T | null = null
  let seen = false
  for (const run of runs) {
    const next = pick(run)
    if (next === undefined) return null
    if (!seen) {
      value = next
      seen = true
      continue
    }
    if (next !== value) return null
  }
  return seen ? value : null
}

/** 颜色归一化到 `#RRGGBB`。模型里可能是小写、也可能带 alpha（8 位） */
function hex6(color: string | undefined): string | null {
  if (color === undefined) return null
  const digits = color.replace(/^#/, '').slice(0, 6).toUpperCase()
  return /^[0-9A-F]{6}$/.test(digits) ? `#${digits}` : null
}

/** 把一段文本变成正则用的字面量（用户敲的 `.` `(` 之类不该当元字符） */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 段内的一处匹配（半开区间） */
interface MatchRange {
  start: number
  end: number
}

/**
 * 两侧都不是「词字符」才算一个词。
 *
 * 用字符类别（`\p{L}`/`\p{N}`）而不是空格：中文没有词边界，「组件」两侧是
 * 标点或行首/行尾照样算一个词，而英文的 `optimize` 不会在 `optimization`
 * 里被算成命中。
 */
function isWholeWord(text: string, start: number, end: number): boolean {
  const wordChar = /[\p{L}\p{N}_]/u
  const before = start > 0 ? text[start - 1]! : ''
  const after = end < text.length ? text[end]! : ''
  return !wordChar.test(before) && !wordChar.test(after)
}

/** 一段文本里的全部匹配。偏移是**原文的**（正则带 `i` 时也要对得上） */
function matchRanges(text: string, query: string, options: FindOptions): MatchRange[] {
  if (query === '') return []
  let pattern: RegExp
  try {
    pattern = new RegExp(escapeRegExp(query), options.matchCase ? 'gu' : 'giu')
  } catch {
    // 查询串构造不出正则（正常输入不会走到这里）：当作没有匹配，不抛
    return []
  }
  const out: MatchRange[] = []
  for (const found of text.matchAll(pattern)) {
    const start = found.index ?? 0
    const end = start + found[0].length
    if (options.wholeWord && !isWholeWord(text, start, end)) continue
    out.push({ start, end })
  }
  return out
}

/**
 * 在**一组 run 的文本**里替换掉若干处匹配，返回新的文本数组。
 *
 * ## 为什么按偏移落到 run 上，而不是拼成一条
 *
 * 替换只该改被替换掉的那几个字，其余 run 的格式一个都不能动。所以找出每处
 * 匹配与哪些 run 相交，只改相交的部分：第一个相交的 run 拿到替换文本，其余
 * 相交的 run 去掉被匹配的部分。**run 的条数不变**——`patchTextElementXml` 的
 * 「位置对齐」前提因此保住（哨兵与 `<a:br/>` 的字节也不用重排）。
 *
 * 多处匹配**从后往前**套用：前面的偏移不会被后面的替换挪动。
 */
function replaceRanges(
  runTexts: readonly string[],
  ranges: readonly MatchRange[],
  replacement: string,
): string[] {
  const out = [...runTexts]
  for (const range of ranges.toSorted((a, b) => b.start - a.start)) {
    let offset = 0
    let inserted = false
    for (let index = 0; index < out.length; index += 1) {
      const text = out[index]!
      const start = offset
      offset += text.length
      const end = offset
      if (end <= range.start || start >= range.end) continue
      const head = text.slice(0, Math.max(0, range.start - start))
      const tail = text.slice(Math.max(0, range.end - start))
      out[index] = head + (inserted ? '' : replacement) + tail
      inserted = true
    }
  }
  return out
}

/**
 * 纯插入（只加字、不删字）落到哪条 run 的哪个位置。
 *
 * 插入没有「被改掉的原文」，按「与几条 run 相交」找不到归属——零宽区间与
 * **0 条** run 相交。规则取**插入点前一个字符所在的 run**：段尾追加落在最后
 * 一条（在段尾打字，延续的就是最后一条 run 的格式）、run 边界落在前一条
 * （紧跟在加粗文字后面打字，新字也是加粗的）、段首落在第一条；插入点在某条
 * run 内部时就地插进那个位置。
 *
 * **软换行哨兵不是文字**，新字符不该混进去——混进去哨兵就不再是 `'\n'`，
 * `patchTextElementXml` 的逐 run 对齐随之失效，明明只加一个字却退化成整段
 * 重建。所以落点是哨兵的**右边缘**（换行之后 = 下一行行首）且下一条是普通
 * 文字时，改落到下一条的开头。哨兵与哨兵之间（连续换行的空行）没有普通 run
 * 可落，仍进哨兵：文本是对的，只是这个元素这一次走 `rebuildTxBody` 的重建
 * 分支（`generateRunXml` 会把带 `\n` 的 run 重新拆成 run + `<a:br/>`）。
 */
function insertIntoRuns(runTexts: readonly string[], at: number, insertion: string): string[] {
  let target = 0
  let local = 0
  let offset = 0
  for (let index = 0; index < runTexts.length; index += 1) {
    const start = offset
    offset += runTexts[index]!.length
    if (at > 0 && start < at && offset >= at) {
      target = index
      local = at - start
      break
    }
  }
  const here = runTexts[target]
  const next = runTexts[target + 1]
  if (here === '\n' && local === here.length && next !== undefined && next !== '\n') {
    target += 1
    local = 0
  }
  return runTexts.map((text, index) =>
    index === target ? text.slice(0, local) + insertion + text.slice(local) : text,
  )
}

/**
 * 段落的文字被改之后怎么回传（返回 `null` = 走「整段重写」那条路）。
 *
 * ## 为什么不是「一律压成一条 run」
 *
 * 段落输入框回传的是整段的纯文本，所以最直觉的写法是「每段一条 run」。但那是
 * **破坏性**的：同段其余 run 的格式会被顶掉——实测一份「加粗标签 + 普通正文」
 * 的段落（`b="1" sz="3600"` + `sz="2400"`），在正文里改一个字之后标签的加粗与
 * 字号就没了，而保存成功、文字也对。
 *
 * ## 所以：只改真正变动的那一部分
 *
 * 取新旧文本的**公共前缀与公共后缀**，中间那段就是用户实际改动的范围。
 *
 *  - 改动**落在一条 run 内** → 只改那一条（其余 run 原样回传、带自己的 `srcRun`）
 *  - 区间是**零宽**（纯插入：段尾追加、段首补字、run 边界塞字）→ 它与 0 条 run
 *    「相交」，不能按相交数判断——插入落进 `insertIntoRuns` 算出的那一条，其余
 *    run 原样
 *  - 跨了多条 run（整段删了重打、粘一大段进来）→ **这确实是一次整段重写**，
 *    交给上游按 `dominantRun` 处理——那是 `applyEditParagraphs` 里写明的行为
 *    （「a rewrite of the whole paragraph is not a rewrite of its label」）
 *
 * 返回 `null` 的情形：改动跨了多条 run（或段落没有 run 可落）。文本没变时返回
 * 原样的一组文本——提交它们与「未编辑的段落」走同一条路，一个字节都不会变。
 */
function editParagraphRuns(runTexts: readonly string[], next: string): { texts: string[] } | null {
  const joined = runTexts.join('')
  if (next === joined) return { texts: [...runTexts] }
  const limit = Math.min(joined.length, next.length)
  let head = 0
  while (head < limit && joined[head] === next[head]) head += 1
  let tail = 0
  while (tail < limit - head && joined[joined.length - 1 - tail] === next[next.length - 1 - tail]) {
    tail += 1
  }
  const range: MatchRange = { start: head, end: joined.length - tail }
  const replacement = next.slice(head, next.length - tail)
  if (range.start === range.end) {
    // 纯插入：零宽区间与任何 run 都不相交，落点单独算（见 `insertIntoRuns`）
    if (runTexts.length === 0) return null
    return { texts: insertIntoRuns(runTexts, range.start, replacement) }
  }
  /** 这个范围与几条 run 相交。跨多条 = 这是一次整段重写，交给上游 */
  let touched = 0
  let offset = 0
  for (const text of runTexts) {
    const start = offset
    offset += text.length
    if (offset <= range.start || start >= range.end) continue
    touched += 1
  }
  if (touched !== 1) return null
  return { texts: replaceRanges(runTexts, [range], replacement) }
}

/**
 * 画布上某个元素对应的 SVG 节点。
 *
 * **按属性比而不是拼选择器**：`data-element-id` 的值是我们自己生成的
 * （`sp_`/`pic_` 一类），拼进 `querySelector` 也能用，但那要求「值里永远没有
 * 引号」——这条约定没有人守。逐个比一遍，元素数量本来就小。
 */
function elementNode(root: HTMLElement, id: string): Element | null {
  for (const node of root.querySelectorAll('[data-element-id]')) {
    if (node.getAttribute('data-element-id') === id) return node
  }
  return null
}

/**
 * 上一次 `search` 命中的那些位置。查找栏的接口是「先 `search`（拿数量、记下
 * 位置）再 `activate` / `replaceOne(index)`」，所以这份结果必须活过两次调用。
 *
 * ## 为什么不写 `let matches = []` 在 `useMemo` 里
 *
 * 那会被 `react-hooks(immutability)` 判违规：**渲染结束后重新赋值一个渲染期
 * 声明的变量**（编译器会因此跳过整个组件，而这个仓库把它当铁律）。
 * `useState(createMatchStore)` 是同一个手法在本仓的既有写法
 * （`EditorShell.tsx` 的 `createFindStore`）：把可变状态藏进模块级工厂返回的
 * 闭包里，编译器看到的是一个不透明对象，事件里改它的内容不构成渲染期副作用。
 */
function createMatchStore() {
  let list: PptxMatch[] = []
  return {
    all: (): readonly PptxMatch[] => list,
    put: (next: PptxMatch[]): void => {
      list = next
    },
  }
}

/**
 * 文档变化事件的转发（查找栏订阅它）。
 *
 * 查找栏的接口里只有 `onDocChanged(listener)`，而**改文档的有两处**：段落输入框
 * 与查找替换自己。两处都走 `afterEdit` → 这里，于是匹配数不会停在编辑之前
 * （那是「替换了但计数没变」那种看着像坏了的状态）。
 */
function createFindEvents() {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify(): void {
      for (const listener of listeners) listener()
    },
  }
}

export function PptxEditor({
  documentId,
  io,
  onDirtyChange,
  onAgentHandleChange,
  hostApply,
  hostPicture,
  hostAsset,
  onAiPreset,
  onAiSnapshotDraft,
  flush = false,
}: EditorProps & {
  onAgentHandleChange?: (handle: PptxAgentHandle | null) => void
  hostApply?: PptxHostApply
  hostAsset?: PptxHostAsset
  onAiPreset?: ((instruction: string) => void) | undefined
  onAiSnapshotDraft?: ((draft: PptxAiSnapshotDraft) => void) | undefined
  hostPicture?: (request: {
    documentId: string
    bytes: Uint8Array
    expectedVersion: number
    imageBytes: Uint8Array
    slide: number
    action: 'insert' | 'replace'
    elementId?: string
  }) => Promise<{ bytes: Uint8Array; version: number }>
}) {
  const svgIdPrefix = useId()
  const source = useSource(io, documentId)
  const parsed = useParsed(source.bytes, openPptxForEdit)
  const session = parsed.value
  const history = useMemo(() => (session ? new PptxHistory(session) : null), [session])
  const [active, setActive] = useState(0)
  const [viewSettings, setViewSettings] = useState(defaultPptxView)
  const [workspaceView, setWorkspaceView] = useState<{
    documentId: string
    mode: PptxWorkspaceMode
  } | null>(null)
  const workspaceMode = workspaceView?.documentId === documentId ? workspaceView.mode : 'normal'
  const [formatBrush, setFormatBrush] = useState<PptxBrush | null>(null)
  const [brushContinuous, setBrushContinuous] = useState(false)
  const brushApplyRef = useRef<(id: string) => void>(() => {})
  /** Native identity survives host reparsing, which allocates new runtime element IDs. */
  const [selectedTarget, setSelectedTarget] = useState<{
    source: Uint8Array
    documentId: string
    slidePath: string
    elementRefs: string[]
  } | null>(null)
  const [textRange, setTextRange] = useState<{
    targetKey: string
    version: number
    selection: PptxTextSelection | null
    pendingFormat?: RunFormat
  } | null>(null)
  const [playbackSection, setPlaybackSection] = useState<{
    documentId: string
    value: 'effects' | 'timeline' | 'transition' | 'notes'
  } | null>(null)
  const [animationPreview, setAnimationPreview] = useState<{
    documentId: string
    path: string
    version: number
    selected: string | null
    request: PptxAnimationPreviewRequest
  } | null>(null)
  const [shapeInsert, setShapeInsert] = useState<{
    documentId: string
    path: string
    version: number
    kind: PptxManualShape['kind']
  } | null>(null)
  /** 有改动还没保存（保存后清掉） */
  const [dirty, setDirty] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [pageStatus, setPageStatus] = useState<string | null>(null)
  useEffect(() => {
    if (!formatBrush) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFormatBrush(null)
        setPageStatus('已退出格式刷')
      }
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [formatBrush])
  const [manualUndoRound, setManualUndoRound] = useState<string | null>(null)
  const [pictureBusy, setPictureBusy] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [inkBusy, setInkBusy] = useState(false)
  const [shapeBusy, setShapeBusy] = useState(false)
  const [cropBusy, setCropBusy] = useState(false)
  const [pictureCrop, setPictureCrop] = useState<{
    documentId: string
    path: string
    elementRef: string
    group?: string
    source: Uint8Array | null
    workspace: PptxWorkspaceMode
    version: number
  } | null>(null)
  const ink = usePptxInkSettings()
  const manualPending = useRef(false)
  const editingBusy = manualBusy || pictureBusy || source.saving || inkBusy || shapeBusy || cropBusy
  const withManualWrite = async <T,>(
    work: () => Promise<T>,
    pendingStatus = '正在应用修改…',
  ): Promise<T | undefined> => {
    if (manualPending.current || pictureBusy || source.saving) {
      setPageError('正在处理文档，请稍后重试')
      return undefined
    }
    // Lock synchronously, before React paints disabled controls or host work awaits.
    manualPending.current = true
    setManualBusy(true)
    setPageError(null)
    const previousStatus = pageStatus
    setPageStatus(pendingStatus)
    try {
      return await work()
    } finally {
      manualPending.current = false
      setManualBusy(false)
      setPageStatus((current) => (current === pendingStatus ? previousStatus : current))
    }
  }
  const assetAbort = useRef<AbortController | null>(null)
  const pictureAbort = useRef<AbortController | null>(null)
  const panelWriteAbort = useRef<{
    binding: string
    session: typeof session
    controller: AbortController
  } | null>(null)
  useEffect(() => {
    if (!session || !documentId) return
    return () => {
      assetAbort.current?.abort()
      pictureAbort.current?.abort()
      panelWriteAbort.current?.controller.abort()
    }
  }, [session, documentId])
  const [inspector, setInspector] = useState<string | null>(null)
  const [selectionTool, setSelectionTool] = useState<'format' | 'geometry'>('format')
  const [clarification, setClarification] = useState<{
    input: PptxClarification
    finish: (value: unknown) => void
  } | null>(null)
  const cancelClarification = useRef<(() => void) | null>(null)
  const inspectorRef = useRef<HTMLElement>(null)
  const groupCropReturnFocus = useRef(false)
  const selectionInspectorTriggerRef = useRef<HTMLButtonElement>(null)
  const commentReturnRef = useRef<HTMLElement | null>(null)
  const presentationTriggerRef = useRef<HTMLButtonElement>(null)
  const presenterTriggerRef = useRef<HTMLButtonElement>(null)
  const inspectorTriggers = useRef(new Map<string, { focus: () => void }>())
  const inspectorSections = useRef(new Map<string, string>())
  useEffect(() => {
    if (inspector === '新建批注')
      inspectorRef.current
        ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')
        ?.focus()
    else if (inspector) inspectorRef.current?.focus()
  }, [inspector])
  useEffect(() => {
    if (!groupCropReturnFocus.current || editingBusy || inspector !== '组合图片') return
    const entry = inspectorRef.current?.querySelector<HTMLButtonElement>(
      'button[aria-label="在画布裁切组合图片"]',
    )
    if (!entry || entry.disabled) return
    groupCropReturnFocus.current = false
    const focus = document.activeElement
    if (focus === document.body || focus === inspectorRef.current) entry.focus()
  }, [editingBusy, inspector])
  const closeInspector = () => {
    assetAbort.current?.abort()
    panelWriteAbort.current?.controller.abort()
    if (inspector === '演示需求') cancelClarification.current?.()
    setInspector(null)
    if (inspector) {
      if (inspector === '新建批注' && commentReturnRef.current?.isConnected)
        commentReturnRef.current.focus()
      else inspectorTriggers.current.get(inspector)?.focus()
      const focused = document.activeElement
      if (focused === document.body || inspectorRef.current?.contains(focused)) {
        // A collapsed group's inner opener is unmounted when its menu closes.
        const section = inspectorSections.current.get(inspector)
        const group = Array.from(
          inspectorRef.current
            ?.closest('.mimir-editor')
            ?.querySelectorAll<HTMLElement>('[data-section-key]') ?? [],
        ).find((element) => element.dataset.sectionKey === section)
        group?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
        if (
          document.activeElement === document.body ||
          inspectorRef.current?.contains(document.activeElement)
        )
          inspectorRef.current
            ?.closest('.mimir-editor')
            ?.querySelector<HTMLButtonElement>(
              '.mimir-compact-toolbar__tabs [aria-selected="true"]',
            )
            ?.focus()
      }
    }
  }
  const [presentation, setPresentation] = useState<
    | (PptxShowRequest & {
        documentId: string
        mode: 'slides' | 'presenter'
      })
    | null
  >(null)
  const [rehearsal, setRehearsal] = useState<{
    documentId: string
    result: PptxRehearsalResult
  } | null>(null)
  const presentationReturnRef = useRef<HTMLButtonElement | null>(null)
  const fromStartTriggerRef = useRef<HTMLButtonElement | null>(null)
  const presenterStartTriggerRef = useRef<HTMLButtonElement | null>(null)
  const startPresentation = (request: PptxShowRequest, trigger?: HTMLButtonElement | null) => {
    presentationReturnRef.current =
      trigger ??
      (document.activeElement instanceof HTMLButtonElement &&
      inspectorRef.current?.contains(document.activeElement)
        ? document.activeElement
        : request.presenter
          ? presenterTriggerRef.current
          : presentationTriggerRef.current)
    setPresentation({ ...request, documentId, mode: request.presenter ? 'presenter' : 'slides' })
  }
  const agentHandleRef = useRef<PptxAgentHandle | null>(null)
  /** 画布容器：SVG 里注入 `data-element-id` 后用它做事件代理与描边 */
  const canvasRef = useRef<HTMLDivElement>(null)

  /** 查找栏的显隐、查询串与两个开关（栏本身是受控的） */
  const [findOpen, setFindOpen] = useState(false)
  useFindHotkey(() => setFindOpen(true))
  const [findQuery, setFindQuery] = useState('')
  const [findOptions, setFindOptions] = useState<FindOptions>({
    matchCase: false,
    wholeWord: false,
  })
  /** 当前高亮的命中（跨页也记着：翻到那一页才画得出来） */
  const [findMark, setFindMark] = useState<PptxMatch | null>(null)
  /** 文档变化事件（见 `createFindEvents`）。初始化一次，之后是同一个对象 */
  const [findEvents] = useState(createFindEvents)
  /** 上一次查找命中（见 `createMatchStore`） */
  const [matchStore] = useState(createMatchStore)

  /**
   * 渲染用的**不可变快照**（见 `PptxEditSession.view()` 的说明）。
   *
   * 编辑是就地改模型的，所以不能拿 `slides()` 当依赖（引用不变，重算不触发）。
   * 快照的身份随改动变化：**没改动时 `view()` 返回同一个对象**，改动后是新
   * 对象——于是 `useMemo` 的依赖是诚实的，不需要外面数版本号。
   *
   * `edited` 只是给「改过之后的快照」一个落脚处，同样绑着「哪一份字节」，
   * 所以换文件时它自然作废。没改过时直接用 `session.view()`（同一个对象，
   * 不会让下游重算）。
   */
  const [edited, setEdited] = useState<{
    source: Uint8Array
    view: PptxRenderable
    version: number
  } | null>(null)
  const initialView = useMemo(
    () => (session ? { view: session.view(), version: session.version() } : null),
    [session],
  )
  // A host reparse mutates the session before its accepted onChange publishes it.
  // Keep control identities on the published revision during that interval.
  const published = edited?.source === source.bytes ? edited : initialView
  const view = published?.view ?? null
  const viewVersion = published?.version ?? 0

  const selectedSlide = view?.slides()[active]
  const selectedRefs =
    selectedTarget?.source === source.bytes &&
    selectedTarget?.documentId === documentId &&
    selectedTarget?.slidePath === selectedSlide?.path
      ? selectedTarget.elementRefs
      : []
  const selectedContexts = pptxResolveSelection(selectedSlide?.elements ?? [], selectedRefs)
  // Existing local geometry/text paths are top-level only. Group members use
  // the object Inspector's explicit native group operations.
  const singleContext = selectedContexts.length === 1 ? selectedContexts[0] : null
  const groupPictureContext =
    singleContext?.depth === 1 &&
    singleContext.group &&
    singleContext.element.type === 'picture' &&
    !singleContext.element.media
      ? { ...singleContext, group: singleContext.group, element: singleContext.element }
      : null
  const groupPictureParent =
    groupPictureContext &&
    selectedSlide?.elements.find((element) => matchesElementRef(element, groupPictureContext.group))
  // Forget invalidated drafts so returning to the same durable reference does
  // not revive an abandoned crop. React permits this guarded own-state reset.
  if (
    pictureCrop &&
    (pictureCrop.documentId !== documentId ||
      pictureCrop.source !== source.bytes ||
      pictureCrop.workspace !== workspaceMode ||
      pictureCrop.path !== selectedSlide?.path ||
      pictureCrop.version !== viewVersion ||
      pictureCrop.elementRef !== (pictureCrop.group ? groupPictureContext?.ref : selectedRefs[0]) ||
      pictureCrop.group !== groupPictureContext?.group)
  )
    setPictureCrop(null)
  const selectedObject = singleContext?.depth === 0 ? singleContext.element : null
  const selected = selectedObject?.id ?? null
  const selectedElementRef = selectedObject ? (selectedRefs[0] ?? null) : null
  const selectionBinding = JSON.stringify(
    selectedContexts.map(
      (item) => selectedRefs.find((ref) => matchesElementRef(item.element, ref)) ?? item.ref,
    ),
  )
  const setSelection = useCallback(
    (refs: string[]) => {
      const slide = session?.slides()[active]
      const normalized = pptxNormalizeSelection(slide?.elements ?? [], refs)
      setSelectedTarget(
        normalized.length && slide && source.bytes
          ? { source: source.bytes, documentId, slidePath: slide.path, elementRefs: normalized }
          : null,
      )
      setTextRange(null)
    },
    [session, active, source.bytes, documentId],
  )
  const setSelected = useCallback(
    (id: string | null) => setSelection(id ? [id] : []),
    [setSelection],
  )

  const rendered = useMemo<RenderedSlide | null>(() => {
    if (!view) return null
    return renderSlide(view, active, { fitWidthPx: FIT_WIDTH_PX, svgIdPrefix })
  }, [view, active, svgIdPrefix])

  const slideCount = view?.slides().length ?? 0
  const thumbnailPages = useMemo(
    () => view?.slides().map((slide) => ({ key: slide.path })) ?? [],
    [view],
  )

  /**
   * 模型变了之后的**React 侧跟进**：刷新渲染快照、标脏、通知查找栏重扫。
   *
   * 放进 ref 里给查找适配器用：适配器要保持**同一个对象**（它一变，查找栏的
   * effect 就重扫一遍），而它调用的那个回调又要读到最新一轮的 `dirty` /
   * `onDirtyChange`。仓里另外三处（`useSource` 的 `io`、`MarkdownEditor` 的
   * `saveNow`、`PdfCanvas` 的 `onError`）是同一个手法：ref 承接最新闭包，
   * 注册的 effect 只依赖真正是输入的东西。ref 的更新 effect 声明在渲染
   * **之前**——顺序反了 React Compiler 会判违规。
   */
  const selectionBindingRef = useRef(selectionBinding)
  useEffect(() => {
    selectionBindingRef.current = selectionBinding
  }, [selectionBinding, selectionBindingRef])
  const selectedDurableRef = useRef<string | null>(null)
  useEffect(() => {
    selectedDurableRef.current = selectedElementRef
  }, [selectedElementRef])
  const afterEdit = () => {
    if (session === null || source.bytes === null) return
    history?.record()
    setEdited({ source: source.bytes, view: session.view(), version: session.version() })
    const changed = session.hasChanges()
    if (changed !== dirty) {
      setDirty(changed)
      onDirtyChange?.(changed)
    }
    findEvents.notify()
    const activeSlide = session.slides()[active]
    if (selectedTarget && activeSlide) {
      const valid = selectedTarget.elementRefs.filter(
        (ref) => pptxResolveSelection(activeSlide.elements, [ref]).length > 0,
      )
      if (valid.length !== selectedTarget.elementRefs.length)
        setSelectedTarget(valid.length ? { ...selectedTarget, elementRefs: valid } : null)
    }
  }
  const afterEditRef = useRef(afterEdit)
  useEffect(() => {
    afterEditRef.current = afterEdit
  })

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target
      const root = canvasRef.current?.closest('.mimir-editor')
      if (!session || !(target instanceof Node) || !root?.contains(target)) return
      if (
        (event.ctrlKey || event.metaKey) &&
        event.altKey &&
        event.key.toLowerCase() === 'm' &&
        !editingBusy &&
        hostApply
      ) {
        event.preventDefault()
        if (inspector !== '新建批注' && target instanceof HTMLElement)
          commentReturnRef.current = target
        setInspector('新建批注')
        inspectorRef.current
          ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')
          ?.focus()
        return
      }
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        editingBusy ||
        (target instanceof Element &&
          target.closest('input,textarea,[contenteditable="true"],[role="combobox"]'))
      )
        return
      const key = event.key.toLowerCase(),
        undo = key === 'z' && !event.shiftKey,
        redo = key === 'y' || (key === 'z' && event.shiftKey)
      if (!undo && !redo) return
      const changed = undo ? history?.undo() : history?.redo()
      if (!changed) return
      event.preventDefault()
      setActive((current) => Math.min(current, session.slides().length - 1))
      setManualUndoRound(null)
      afterEditRef.current()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [history, session, editingBusy, hostApply, inspector])

  const agentSelectionRef = useRef<{
    slideIndex: number
    elementId: string | null
    elementIds: readonly string[]
  }>({ slideIndex: active, elementId: selected, elementIds: selectedRefs })
  const onAgentHandleChangeRef = useRef(onAgentHandleChange)
  const hostApplyRef = useRef(hostApply)
  const { draft: deckWritingDraft, apply: applyWithDeckWriting } = usePptxDeckWriting(
    hostApplyRef,
    session,
    documentId,
    viewVersion,
  )
  useEffect(() => {
    agentSelectionRef.current = {
      slideIndex: active,
      elementId: singleContext?.element.id ?? null,
      elementIds: selectedRefs,
    }
    onAgentHandleChangeRef.current = onAgentHandleChange
    hostApplyRef.current = hostApply
  })
  useEffect(() => {
    if (!session) return
    const handle = createPptxAgentHandle(
      session,
      documentId,
      () => agentSelectionRef.current,
      () => afterEditRef.current(),
      hostApplyRef.current
        ? (request) => {
            if (!hostApplyRef.current) throw new Error('PPTX 宿主执行器未配置')
            return applyWithDeckWriting(request)
          }
        : undefined,
      (input, signal) =>
        new Promise((resolve, reject) => {
          cancelClarification.current?.()
          const focused =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          let finished = false
          const finish = (value?: unknown) => {
            if (finished) return
            finished = true
            signal.removeEventListener('abort', onAbort)
            cancelClarification.current = null
            setClarification(null)
            setInspector((current) => (current === '演示需求' ? null : current))
            focused?.focus()
            if (value === undefined) reject(new Error('演示需求选择已取消'))
            else resolve({ answers: value })
          }
          const onAbort = () => finish()
          signal.addEventListener('abort', onAbort, { once: true })
          cancelClarification.current = onAbort
          setClarification({ input, finish })
          setInspector('演示需求')
        }),
    )
    agentHandleRef.current = handle
    onAgentHandleChangeRef.current?.(handle)
    return () => {
      handle.dispose()
      if (agentHandleRef.current === handle) agentHandleRef.current = null
      onAgentHandleChangeRef.current?.(null)
    }
  }, [
    session,
    documentId,
    agentSelectionRef,
    hostApplyRef,
    onAgentHandleChangeRef,
    applyWithDeckWriting,
  ])

  /**
   * 当前页的**最新值**，给查找适配器的 `activate` 用。
   *
   * 它要在事件里判断「命中的那一页是不是当前页」——是的话**不调 `goTo`**：
   * `goTo` 会清掉选中与段落 key（换页时那是对的），而「同一个元素里按下一个
   * 匹配」不该把用户刚选中的文本框取消掉。`active` 直接进适配器的依赖会让
   * 适配器每翻一页换一次身份（查找栏于是重扫并重订阅），所以走 ref。
   *
   * 读它的地方是事件（`activate`），不是渲染期——渲染期读 ref 会被 React
   * Compiler 判违规。
   */
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  })
  const snapshotSource = useRef<object | null>(null)
  useEffect(() => {
    const binding = {}
    snapshotSource.current = binding
    return () => {
      if (snapshotSource.current === binding) snapshotSource.current = null
    }
  }, [session, documentId, source.bytes])
  const snapshotAbort = useRef<AbortController | null>(null)
  const [snapshotPending, setSnapshotPending] = useState(false)
  useEffect(() => {
    return () => snapshotAbort.current?.abort()
  }, [session, documentId, source.bytes, active, viewVersion])
  useEffect(() => {
    if (!snapshotPending) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault()
        snapshotAbort.current?.abort()
      }
    }
    window.addEventListener('keydown', cancel, true)
    return () => window.removeEventListener('keydown', cancel, true)
  }, [snapshotPending])
  const prepareSnapshot = async () => {
    if (snapshotAbort.current) {
      snapshotAbort.current.abort()
      return
    }
    if (!session || !view || !source.bytes || !onAiSnapshotDraft || editingBusy) return
    const controller = new AbortController()
    snapshotAbort.current = controller
    setSnapshotPending(true)
    setPageError(null)
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const binding = snapshotSource.current
    const sourceIsCurrent = () => binding !== null && snapshotSource.current === binding
    const index = active
    const version = viewVersion
    const target = { documentId, slidePath: view.slides()[index]!.path, slideIndex: index, version }
    const isCurrent = () =>
      sourceIsCurrent() &&
      snapshotAbort.current === controller &&
      !controller.signal.aborted &&
      session.version() === version &&
      activeRef.current === index &&
      session.slides()[index]?.path === target.slidePath
    try {
      const draft = await preparePptxAiSnapshot(
        view,
        target,
        controller.signal,
        isCurrent,
        undefined,
        sourceIsCurrent,
      )
      if (isCurrent()) onAiSnapshotDraft(draft)
    } catch (error) {
      if (!controller.signal.aborted)
        setPageError(
          error instanceof Error && error.name === 'TimeoutError'
            ? '截图准备超时，请重试'
            : error instanceof Error
              ? error.message
              : '截图准备失败，请重试',
        )
      else if (sourceIsCurrent()) {
        if (focused?.isConnected) focused.focus({ preventScroll: true })
        else {
          const root = canvasRef.current?.closest('.mimir-editor')
          const trigger =
            root?.querySelector<HTMLElement>('[aria-label="美化本页"]') ??
            root?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          trigger?.focus({ preventScroll: true })
        }
      }
    }
    if (snapshotAbort.current === controller) {
      snapshotAbort.current = null
      setSnapshotPending(false)
    }
  }
  useEffect(() => () => pictureAbort.current?.abort(), [active])
  const panelWriteBinding = JSON.stringify([
    documentId,
    active,
    selectionBinding,
    inspector,
    inspector === '对象选择与格式' ? selectionTool : null,
  ])
  useEffect(() => {
    return () => {
      const pending = panelWriteAbort.current
      if (pending?.binding === panelWriteBinding && pending.session === session)
        pending.controller.abort()
    }
  }, [panelWriteBinding, session])

  /**
   * 换到某一页。
   *
   * 稳定引用（只碰 state setter）：查找适配器要用它把跨页的命中带出来，而
   * 适配器的依赖一变就会让查找栏重扫，所以它必须稳定。
   */
  const goTo = useCallback((index: number) => {
    setActive(index)
    // 换页要清掉选中：那个元素不在这一页了
    setSelectedTarget(null)
  }, [])

  const editPage = (operation: () => number) => {
    try {
      const nextIndex = operation()
      setPageError(null)
      goTo(nextIndex)
      setFindMark(null)
      afterEditRef.current()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : '页面操作失败')
    }
  }

  const insertPage = (afterIndex: number) => {
    if (session) editPage(() => session.insertBlank(afterIndex))
  }
  const duplicatePage = (index: number) => {
    if (session) editPage(() => session.duplicate(index))
  }
  const deletePage = (index: number) => {
    if (session) editPage(() => session.remove(index))
  }
  const movePage = (fromIndex: number, toIndex: number) => {
    if (session) editPage(() => session.move(fromIndex, toIndex))
  }

  /**
   * 选中元素的**文字模型**。
   *
   * 不缓存（不用 `useMemo`）：返回的 `el.text` 是模型里的同一个对象，而编辑是
   * **就地**改它的（`setText` 把 `text.paragraphs` 换成新数组）。按元素的身份
   * 缓存就会踩「对象没变、里面的东西变了」——那类缓存失效是静默的。这里每次
   * 渲染重新读一遍，代价是几十次属性访问。
   */
  /**
   * 选中元素的文字。`null` 与 `undefined` 都收成 `null`：`TextElement['text']` 是
   * 可选的，而这个组件对「没有文字」只有一种处理——按钮禁用 + 一句原因。
   */
  const selectedText = (selectedObject === null ? null : textOfElement(selectedObject)) ?? null

  const textTargetKey = `${documentId}:${view?.slides()[active]?.path ?? active}:${selectedElementRef ?? ''}`
  const currentRange =
    textRange?.targetKey === textTargetKey && textRange.version === viewVersion ? textRange : null
  const textSelection = currentRange?.selection ?? null
  const pendingFormat = currentRange?.pendingFormat
  const bulkTextTargets = pptxExpandSelection(selectedSlide?.elements ?? [], selectedRefs).filter(
    (context) => pptxSelectionText(context),
  )
  const formatRuns = selectedText
    ? pptxSelectionRuns(selectedText.paragraphs, textSelection).map((run) =>
        textSelection?.start === textSelection?.end && textSelection !== null
          ? Object.assign({}, run, pendingFormat)
          : run,
      )
    : bulkTextTargets.flatMap(
        (context) => textOfElement(context.element)?.paragraphs.flatMap((para) => para.runs) ?? [],
      )
  const acceptTextEvent = (event: PptxTextSelectionEvent) =>
    !!session &&
    !editingBusy &&
    !manualPending.current &&
    event.targetKey === textTargetKey &&
    event.version === session.version() &&
    activeRef.current === active
  const selectTextRange = (event: PptxTextSelectionEvent) => {
    if (!acceptTextEvent(event)) return
    const sameCaret =
      currentRange?.selection?.start === event.selection?.start &&
      currentRange?.selection?.end === event.selection?.end &&
      event.selection !== null
    setTextRange({ ...event, pendingFormat: sameCaret ? pendingFormat : undefined })
  }
  const editTextRange = (next: EditParagraph[], event: PptxTextSelectionEvent) => {
    if (!session || !selected || !acceptTextEvent(event)) return
    if (session.setText(active, selected, next)) afterEditRef.current()
    setTextRange({ ...event, version: session.version(), pendingFormat })
  }
  const bulkFormatApplyRef = useRef<(ops: Record<string, unknown>[]) => Promise<boolean>>(
    async () => false,
  )
  useEffect(() => {
    bulkFormatApplyRef.current = applyPanelOps
  })
  const applyFormat = (format: RunFormat | ((run: TextRun) => RunFormat)) => {
    if (!session || editingBusy || manualPending.current) return
    if (!selected || !selectedText) {
      const ops = bulkTextTargets.map((context) =>
        pptxSelectionOp(context, {
          op: 'setText',
          target: { slide: active, el: context.ref },
          paragraphs: formatPptxTextRange(textOfElement(context.element)!.paragraphs, null, format),
        }),
      )
      if (ops.length) void bulkFormatApplyRef.current(ops)
      return
    }
    if (textSelection && textSelection.start === textSelection.end) {
      const marks = typeof format === 'function' ? format(formatRuns[0] ?? { text: '' }) : format
      setTextRange({
        targetKey: textTargetKey,
        version: session.version(),
        selection: textSelection,
        pendingFormat: { ...pendingFormat, ...marks },
      })
      return
    }
    const next = formatPptxTextRange(selectedText.paragraphs, textSelection, format)
    if (!session.setText(active, selected, next)) return
    afterEditRef.current()
    setTextRange({ targetKey: textTargetKey, version: session.version(), selection: textSelection })
  }

  /**
   * 查找/替换的适配器。
   *
   * 扫描走 `session.slides()`（**当前模型**，编辑后立刻是新的），所以不必把
   * `view` 放进依赖——适配器在整个文档期间是同一个对象，查找栏不会因为一次
   * 编辑就重挂。匹配按「页 + 元素 + 段」记，`replaceOne` 用上一次 `search`
   * 的结果定位。
   */
  const findAdapter = useMemo<FindReplaceAdapter>(() => {
    const collect = (query: string, options: FindOptions): PptxMatch[] => {
      const out: PptxMatch[] = []
      if (query === '' || session === null) return out
      session.slides().forEach((slide, slideIndex) => {
        for (const element of editableElements(slide)) {
          const text = textOfElement(element) ?? null
          if (text === null) continue
          text.paragraphs.forEach((paragraph, paraIndex) => {
            for (const range of matchRanges(paragraphText(paragraph), query, options)) {
              out.push({
                slideIndex,
                elementId: element.id,
                paraIndex,
                start: range.start,
                end: range.end,
              })
            }
          })
        }
      })
      return out
    }

    /**
     * 把若干处命中写回模型。
     *
     * 按「页 + 元素」分组，一个元素只调一次 `setText`（它一次改完整个元素）。
     * 每段都带 `srcPara`、每条 run 都带 `srcRun`——不带的话那一段的格式会被
     * 冲掉。
     */
    const applyReplacements = (list: readonly PptxMatch[], replacement: string): void => {
      if (session === null) return
      const byElement = new Map<string, PptxMatch[]>()
      for (const match of list) {
        const key = `${match.slideIndex}:${match.elementId}`
        const bucket = byElement.get(key)
        if (bucket === undefined) byElement.set(key, [match])
        else bucket.push(match)
      }
      let changed = false
      for (const group of byElement.values()) {
        const head = group[0]
        if (head === undefined) continue
        const slide = session.slides()[head.slideIndex]
        const element = slide
          ? editableElements(slide).find((item) => item.id === head.elementId)
          : undefined
        const text = (element ? textOfElement(element) : null) ?? null
        if (text === null) continue

        const byParagraph = new Map<number, MatchRange[]>()
        for (const match of group) {
          const bucket = byParagraph.get(match.paraIndex)
          if (bucket === undefined) byParagraph.set(match.paraIndex, [match])
          else bucket.push(match)
        }

        const next: EditParagraph[] = text.paragraphs.map((paragraph, paraIndex) => ({
          runs: paragraph.runs.map((run, runIndex) => ({ text: run.text, srcRun: runIndex })),
          srcPara: paraIndex,
        }))
        for (const [paraIndex, ranges] of byParagraph) {
          const target = next[paraIndex]
          if (target === undefined) continue
          const texts = replaceRanges(
            target.runs.map((run) => run.text),
            ranges,
            replacement,
          )
          target.runs = texts.map((value, runIndex) => ({ text: value, srcRun: runIndex }))
        }
        if (session.setText(head.slideIndex, head.elementId, next)) changed = true
      }
      if (changed) afterEditRef.current()
    }

    return {
      search(query, options) {
        const found = collect(query, options)
        matchStore.put(found)
        // 没有命中就把高亮撤掉：留着一条描边配「无匹配」是界面在说假话
        if (found.length === 0) setFindMark(null)
        return found.length
      },

      activate(index) {
        const match = matchStore.all()[index]
        if (match === undefined) return
        setFindMark(match)
        // 命中在别的页上才翻页（理由见 `activeRef`：同页翻页会白清一次选中）
        if (match.slideIndex !== activeRef.current) goTo(match.slideIndex)
      },

      clear() {
        setFindMark(null)
      },

      replaceOne(index, replacement) {
        const match = matchStore.all()[index]
        if (match === undefined) return
        applyReplacements([match], replacement)
      },

      replaceAll(replacement) {
        const found = matchStore.all()
        if (found.length === 0) return
        applyReplacements(found, replacement)
      },

      onDocChanged(listener) {
        return findEvents.subscribe(listener)
      },
    }
  }, [session, findEvents, goTo, matchStore])

  /**
   * 画布上的点击 → 选中元素。
   *
   * 用**事件代理**而不是给每个元素绑：SVG 是 `dangerouslySetInnerHTML` 注入的
   * 字符串，每次编辑后整体换掉，逐个绑会全部失效。代理挂在容器上，由
   * `closest('[data-element-id]')` 找最近的元素——渲染器给每个节点写了这个属性。
   */
  useEffect(() => {
    brushApplyRef.current = (id: string) => {
      const handle = agentHandleRef.current
      const element = session?.slides()[active]?.elements.find((item) => item.id === id)
      if (!handle || !session || !element || !formatBrush) return
      try {
        void handle
          .execute(
            'apply_ops',
            { ops: pptxBrushOps(formatBrush, element, active) },
            { expectedVersion: session.version(), roundId: crypto.randomUUID() },
          )
          .then((raw) => {
            const result = raw as { ok: boolean; error?: string }
            if (!result.ok) {
              setPageError(result.error ?? '格式刷失败')
              return
            }
            setPageError(null)
            setPageStatus('已应用对象格式')
            if (!brushContinuous) setFormatBrush(null)
          })
      } catch (cause) {
        setPageError(cause instanceof Error ? cause.message : '格式刷失败')
      }
    }
  }, [session, active, formatBrush, brushContinuous])

  const onClickCanvas = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || shapeKind || cropTarget || ink.tool !== 'select') return
    event.preventDefault()
    const target = event.target as Element | null
    let hit = target?.closest('[data-element-id]') ?? null
    // A first click selects the group. Alt-click or a second click inside the
    // selected group enters its immediate child; deeper groups stay explicit.
    const parents: Element[] = []
    for (let node = hit; node; node = node.parentElement?.closest('[data-element-id]') ?? null)
      parents.unshift(node)
    if (parents.length > 1) {
      const top = parents[0]!
      const topId = top.getAttribute('data-element-id')!
      const groupSelected = selectedContexts.some((item) => item.element.id === topId)
      const childSelected = selectedContexts.some(
        (item) =>
          item.depth === 1 &&
          item.group &&
          selectedSlide?.elements.some(
            (element) => element.id === topId && matchesElementRef(element, item.group!),
          ),
      )
      hit = event.altKey || groupSelected || childSelected ? parents[1]! : top
    }
    const id = hit?.getAttribute('data-element-id') ?? null
    if (id && formatBrush) {
      brushApplyRef.current(id)
      return
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      if (!id) return
      const existing = selectedContexts.find((item) => item.element.id === id)
      setSelection(
        existing
          ? selectedRefs.filter((ref) => !matchesElementRef(existing.element, ref))
          : [...selectedRefs, id],
      )
    } else setSelected(id)
  }

  /** 当前 SVG（空串 = 还没渲染出来）。用它当 effect 的依赖，见下面的描边 */
  const svg = rendered?.svg ?? ''

  /**
   * 把选中与查找命中画出来。
   *
   * 直接改 DOM：SVG 是字符串注入的（React 拿不到那些节点的引用），而
   * `editors.css` 里那条 `[data-element-id]` 规则本就是给这件事准备的
   * （在此之前它一直是死代码——选中了画布上没有任何反馈）。
   *
   * 两个来源两种颜色：选中是品牌蓝（CSS 里那个 `--me-accent`），查找命中是
   * 琥珀色（内联覆盖颜色）。同一个元素既是选中又是命中时琥珀色赢——那正是
   * 「刚跳过来的那一个」。依赖里有 `svg`：SVG 一换，React 会把整段 innerHTML
   * 换掉，描边要重画（不然一次编辑之后高亮就没了）。
   */
  useEffect(() => {
    const root = canvasRef.current
    if (root === null || svg === '') return
    const marked: SVGElement[] = []
    const mark = (id: string | null, color: string | null) => {
      if (id === null) return
      const node = elementNode(root, id)
      if (node === null) return
      node.classList.add(MARKED_CLASS)
      const styled = node as SVGElement
      if (color !== null) styled.style.outlineColor = color
      marked.push(styled)
    }
    for (const item of selectedContexts) mark(item.element.id, null)
    if (findMark !== null && findMark.slideIndex === active)
      mark(findMark.elementId, FIND_MARK_COLOR)
    return () => {
      for (const node of marked) {
        node.classList.remove(MARKED_CLASS)
        node.style.outlineColor = ''
      }
    }
  }, [svg, selectedContexts, findMark, active])

  /**
   * 把当前命中的元素滚进视野。
   *
   * 依赖里**没有** `svg`：跟着渲染走的话，在段落输入框里敲一个字就会把画布滚
   * 回命中处——编辑时的滚动位置是用户的。换页会改 `active`，所以翻过去之后
   * 照样滚得到。
   */
  useEffect(() => {
    if (findMark === null || findMark.slideIndex !== active) return
    const root = canvasRef.current
    if (root === null) return
    const node = elementNode(root, findMark.elementId)
    // scrollIntoView 是 Element 的方法；测试用的 DOM 环境里可能没有
    if (node !== null && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' })
    }
  }, [findMark, active])

  const save = async () => {
    if (!session) return
    await withManualWrite(async () => {
      const savedVersion = session.version()
      const savedRange = currentRange
      const savedTarget = selectedElementRef
      const savedHandle = agentHandleRef.current
      const bytes = await session.save()
      const ok = await source.save(bytes, { name: 'slides.pptx', mime: OFFICE_MIME.pptx })
      if (!ok) return
      if (session.version() !== savedVersion) {
        setPageStatus('已保存操作开始时的版本')
        return
      }
      /**
       * **保存成功后必须 commit**：把新 XML 烧回元素锚点。不做的话第二次编辑
       * 会拿旧锚点拼字节，第一次的改动被静默回滚（保存本身还是成功）。
       */
      session.commit()
      const committedVersion = session.version()
      if (
        savedRange?.version === savedVersion &&
        savedRange.targetKey === textTargetKey &&
        savedTarget !== null &&
        selectedDurableRef.current === savedTarget &&
        activeRef.current === active &&
        agentHandleRef.current === savedHandle
      ) {
        setTextRange((current) =>
          current === savedRange ? { ...current, version: committedVersion } : current,
        )
      }
      history?.synchronize()
      // commit 之后模型与刚写出的字节对齐了，取一份新快照（同时丢掉 edited）
      setEdited({ source: source.bytes!, view: session.view(), version: session.version() })
      setDirty(false)
      onDirtyChange?.(false)
    }, '正在保存…')
  }

  if (source.loadError !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取失败</ToolbarLabel>}>
        <EditorState tone="error">
          读取失败：{source.loadError}
          <div style={{ marginTop: 12 }}>
            <ToolbarButton label="重试" onClick={source.reload}>
              重试
            </ToolbarButton>
          </div>
        </EditorState>
      </EditorShell>
    )
  }

  if (parsed.error !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>解析失败</ToolbarLabel>}>
        <EditorState tone="error">解析失败：{parsed.error}</EditorState>
      </EditorShell>
    )
  }

  if (!session || !view || !rendered) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取中…</ToolbarLabel>}>
        <EditorState>正在解析幻灯片…</EditorState>
      </EditorShell>
    )
  }

  const status = statusText({
    handle: source,
    dirty,
    idle: `第 ${active + 1} / ${slideCount} 页`,
  })

  /* ── 格式工具条要读的当前值（都在 `editable` / `view` 上现算，不缓存） ── */

  /** 这个元素里有没有可改格式的文字（软换行哨兵不算） */
  const hasRuns = formatRuns.length > 0
  const everyRun = (test: (run: TextRun) => boolean) => hasRuns && formatRuns.every(test)

  const boldOn = everyRun((run) => run.bold === true)
  const italicOn = everyRun((run) => run.italic === true)
  const underlineOn = everyRun((run) => run.underline === true)
  const strikeOn = everyRun((run) => run.strike === true)
  const superscriptOn = everyRun((run) => (run.baseline ?? 0) > 0)
  const subscriptOn = everyRun((run) => (run.baseline ?? 0) < 0)

  /** 字号/字体/颜色：所有 run 一致时才是「当前值」，否则 null（不冒充第一档） */
  const uniformSize = uniformOf(formatRuns, (run) => run.fontSize)
  const uniformFont = uniformOf(formatRuns, (run) => run.fontFamily)
  const uniformColor = uniformOf(formatRuns, (run) => hex6(run.color) ?? undefined)
  /** 当前色不在调色板里时把它摆在第一档：否则触发器会画成「没设置」（那是假话） */
  const colorOptions: readonly ToolbarColorOption[] =
    uniformColor === null || TEXT_COLORS.some((option) => option.value === uniformColor)
      ? TEXT_COLORS
      : [
          { value: uniformColor, label: `当前颜色 ${uniformColor}`, swatch: uniformColor },
          ...TEXT_COLORS,
        ]

  /** 字体下拉的选项：这份文稿真正用过的字体在前，常见字体兜底 */
  const fontOptions: readonly ToolbarSelectOption<string>[] = (() => {
    const used = new Set<string>()
    for (const slide of view.slides()) {
      for (const element of editableElements(slide)) {
        for (const paragraph of textOfElement(element)?.paragraphs ?? []) {
          for (const run of paragraph.runs) {
            if (run.fontFamily) used.add(run.fontFamily)
          }
        }
      }
    }
    const inDeck = [...used].toSorted((a, b) => a.localeCompare(b))
    return [...inDeck, ...COMMON_FONTS.filter((name) => !used.has(name))].map((name) => ({
      value: name,
      label: name,
    }))
  })()

  /**
   * 禁用原因。**两个原因各不相同，不能合成一句「不可用」**——一个灰着的按钮
   * 加一句含糊的原因是让人猜。
   */
  const formatReason = editingBusy
    ? '正在处理修改，请稍后重试'
    : hasRuns
      ? undefined
      : selectedContexts.length
        ? '所选对象中没有文字'
        : '先在画布上选择文字框或形状'

  /** 增大/减小字号要**每条 run** 都读得到具体值（继承来的也算解析得出；读不到就禁用） */
  const formatScope =
    !selectedText && bulkTextTargets.length
      ? '所选对象'
      : textSelection
        ? textSelection.start === textSelection.end
          ? '插入点'
          : '选中文字'
        : '整框'
  const canStepSize =
    !editingBusy && hasRuns && formatRuns.every((run) => Number.isFinite(run.fontSize))
  const sizeStepReason =
    formatReason ?? (canStepSize ? undefined : '有文字的字号取不到具体值，只能先用字号框设一个')

  const stepSize = (delta: number) => {
    applyFormat((run) => ({
      fontSize: Math.max(MIN_FONT_SIZE_PT, (run.fontSize ?? MIN_FONT_SIZE_PT) + delta),
    }))
  }

  const runManualTool = async (
    tool:
      | 'apply_ops'
      | 'edit_chart'
      | 'edit_animation'
      | 'manual_ink'
      | 'manual_fill'
      | 'manual_picture'
      | 'manual_zoom'
      | 'manual_animation'
      | 'manual_shape'
      | 'manual_paragraph',
    args: Record<string, unknown>,
    options?: { expectedVersion: number; signal: AbortSignal },
  ) => {
    const handle = agentHandleRef.current
    if (!handle || !session || handle.documentId !== documentId) return false
    const roundId = crypto.randomUUID()
    const response = (await withManualWrite(() =>
      handle.execute(tool, args, {
        expectedVersion: options?.expectedVersion ?? session.version(),
        roundId,
        signal: options?.signal,
      }),
    )) as { ok: boolean; changed?: boolean; error?: string } | undefined
    if (!response) return false
    // The handle checks cancellation before committing. A version-driven panel
    // unmount may abort its signal after that commit; retain the successful fact.
    if (options?.signal.aborted) return response.ok
    if (!response.ok) {
      setPageError(response.error ?? '幻灯片操作失败')
      return false
    }
    setPageError(null)
    setPageStatus('已应用幻灯片修改')
    if (response.changed) setManualUndoRound(roundId)
    return true
  }
  const runManualOp = (op: Record<string, unknown>) => runManualTool('apply_ops', { ops: [op] })
  const runInk = (input: PptxManualInk, expectedVersion: number, signal: AbortSignal) => {
    if (signal.aborted || input.slide !== activeRef.current) return Promise.resolve(false)
    return runManualTool('manual_ink', input, { expectedVersion, signal })
  }
  const changeWorkspaceMode = (mode: PptxWorkspaceMode) => {
    ink.setTool('select')
    setShapeInsert(null)
    setWorkspaceView({ documentId, mode })
    setSelected(null)

    setInspector(null)
    if (mode === 'normal')
      requestAnimationFrame(() => {
        const editor = canvasRef.current?.closest('.mimir-editor')
        const trigger =
          editor?.querySelector<HTMLButtonElement>('[aria-label="普通视图"]') ??
          editor?.querySelector<HTMLButtonElement>(
            '[data-section-key="workspace-view"] button:not(:disabled)',
          ) ??
          editor?.querySelector<HTMLButtonElement>(
            '.mimir-compact-toolbar__tabs [aria-selected="true"]',
          )
        if (document.activeElement === document.body || editor?.contains(document.activeElement))
          trigger?.focus()
      })
  }
  const reorderWorkspaceSlides = async (paths: string[], boundary: number) => {
    const before = session.slides().map((slide) => slide.path)
    const activePath = before[active]
    const ops = pptxSlideMoveOps(before, paths, boundary)
    if (!ops.length) return false
    const handle = agentHandleRef.current
    const applied = await runManualTool('apply_ops', { ops })
    if (applied && agentHandleRef.current === handle && activeRef.current === active) {
      const index = session.slides().findIndex((slide) => slide.path === activePath)
      if (index >= 0) goTo(index)
    }
    return applied
  }

  const runClipboard = async (input: PptxManualAsset, options?: { signal: AbortSignal }) => {
    const handle = agentHandleRef.current
    if (!handle || !session) return null
    const version = viewVersion
    if (
      options?.signal.aborted ||
      session.version() !== version ||
      activeRef.current !== active ||
      selectionBindingRef.current !== selectionBinding ||
      ('slide' in input && input.slide !== active) ||
      ('afterIndex' in input && input.afterIndex !== active)
    ) {
      setPageError('画布已变化，请重新打开剪贴板')
      return null
    }
    if (panelWriteAbort.current && !panelWriteAbort.current.controller.signal.aborted) return null
    const controller = new AbortController()
    const pending = { binding: panelWriteBinding, session, controller }
    panelWriteAbort.current = pending
    const roundId = crypto.randomUUID()
    try {
      const response = (await withManualWrite(() =>
        handle.execute('manual_asset', input, {
          expectedVersion: version,
          roundId,
          signal: options
            ? AbortSignal.any([controller.signal, options.signal])
            : controller.signal,
        }),
      )) as
        | { ok: boolean; changed?: boolean; data?: Record<string, unknown>; error?: string }
        | undefined
      if (!response || agentHandleRef.current !== handle) return null
      if (!response.ok) {
        if (!controller.signal.aborted && !options?.signal.aborted)
          setPageError(response.error ?? '复制粘贴失败，请重新复制')
        return null
      }
      // The live handle checks cancellation before accepting bytes. A successful
      // cut may itself change the selection and unmount the initiating controls.
      if (!response.changed && (controller.signal.aborted || options?.signal.aborted)) return null
      if (
        activeRef.current !== active ||
        session.version() !== version + Number(response.changed === true)
      )
        return null
      const data = response.data ?? {}
      const copied = publishPptxClipboardResult(data)
      if (copied)
        void writePptxClipboardMarker(data).then((written) => {
          if (!written && agentHandleRef.current === handle)
            setPageStatus('已保存内部复制内容；系统标记未获准写入，请使用剪贴板面板粘贴')
        })
      setPageError(null)
      if (response.changed) {
        setManualUndoRound(roundId)
        if (input.kind === 'paste_elements') {
          const refs = data.elementRefs ?? data.elementIds
          if (Array.isArray(refs) && refs.every((ref) => typeof ref === 'string'))
            setSelection(refs)
        } else if (input.kind === 'cut_elements') setSelection([])
        else if (typeof data.slideIndex === 'number') goTo(data.slideIndex)
        else setActive((current) => Math.min(current, session.slides().length - 1))
      }
      return data
    } finally {
      if (panelWriteAbort.current === pending) panelWriteAbort.current = null
    }
  }
  const insertTable = (rows: number, cols: number) =>
    runManualOp({
      op: 'addTable',
      target: { slide: active },
      rows,
      cols,
      offset: {
        x: Math.round(session.size.cx * 0.12),
        y: Math.round(session.size.cy * 0.2),
        cx: Math.round(session.size.cx * 0.76),
        cy: Math.round(session.size.cy * 0.12 * rows),
      },
    })
  const applyLocalPicture = async (file: File, action: 'insert' | 'replace') => {
    if (!hostPicture || !session || pictureBusy || pictureAbort.current) return
    if (file.size === 0 || file.size > 8 * 1024 * 1024) {
      setPageError(`请选择不超过 8 MiB 的 ${PPTX_PICTURE_FORMATS} 图片`)
      return
    }
    const elementId =
      action === 'replace' && selectedObject?.type === 'picture'
        ? (elementDurableId(selectedObject) ?? selectedObject.id)
        : undefined
    if (action === 'replace' && !elementId) {
      setPageError('请先在画布上选中要替换的图片')
      return
    }
    const expectedVersion = session.version()
    const controller = new AbortController()
    const handle = agentHandleRef.current
    const check = () => {
      if (
        controller.signal.aborted ||
        agentHandleRef.current !== handle ||
        activeRef.current !== active ||
        session.version() !== expectedVersion
      )
        throw new Error('画布已变化或图片操作已取消，请重新操作')
    }
    pictureAbort.current = controller
    setPictureBusy(true)
    setPageError(null)
    try {
      const prepared = await preparePptxPictureFile(file, controller.signal)
      check()
      const currentBytes = await session.save()
      check()
      const response = await hostPicture({
        documentId,
        bytes: currentBytes,
        expectedVersion,
        imageBytes: prepared.bytes,
        slide: active,
        action,
        ...(elementId ? { elementId } : {}),
      })
      check()
      if (response.version !== expectedVersion + 1) throw new Error('图片宿主返回的画布版本无效')
      await session.replaceFromHost(response.bytes, expectedVersion, controller.signal)
      setManualUndoRound(null)
      afterEditRef.current()
    } catch (cause) {
      if (!controller.signal.aborted)
        setPageError(cause instanceof Error ? cause.message : '图片操作失败')
    } finally {
      if (pictureAbort.current === controller) pictureAbort.current = null
      setPictureBusy(false)
    }
  }
  const objectTarget = selectedObject ? { slide: active, el: selectedElementRef! } : null
  const applyLocalAsset = async (
    input: PptxManualUpload,
    assetFile: File,
    posterFile?: File,
    callerSignal?: AbortSignal,
  ) => {
    if (!hostAsset || !session || assetAbort.current) return false
    const expectedVersion = session.version()
    const controller = new AbortController()
    const startedSlide = active,
      liveSignal = callerSignal
        ? AbortSignal.any([controller.signal, callerSignal])
        : controller.signal
    assetAbort.current = controller
    setPictureBusy(true)
    setPageError(null)
    setPageStatus('正在处理素材…')
    try {
      const bytes = await session.save()
      if (
        liveSignal.aborted ||
        session.version() !== expectedVersion ||
        activeRef.current !== startedSlide
      )
        throw new Error('画布已变化或操作已取消，请重新操作')
      const response = await hostAsset({
        documentId,
        bytes,
        expectedVersion,
        input,
        assetFile,
        ...(posterFile ? { posterFile } : {}),
        signal: liveSignal,
      })
      if (liveSignal.aborted) throw new Error('素材操作已取消，文档未修改')
      if (session.version() !== expectedVersion || activeRef.current !== startedSlide)
        throw new Error('素材处理期间画布已变化，请重新操作')
      if (response.version !== expectedVersion + 1) throw new Error('素材宿主返回的画布版本无效')
      await session.replaceFromHost(response.bytes, expectedVersion, liveSignal)
      setManualUndoRound(null)
      afterEditRef.current()
      const data = response.data as { slideIndex?: number; elementId?: string } | undefined
      if (typeof data?.slideIndex === 'number') goTo(data.slideIndex)
      if (input.kind === 'picture' && data?.elementId) setSelection([data.elementId])
      if ((input.kind === 'media' || input.kind === 'model3d') && data?.elementId) {
        const mediaSlide = session.slides()[input.slide]
        const element = mediaSlide?.elements.find((item) =>
          matchesElementRef(item, data.elementId!),
        )
        if (element) {
          setSelected(element.id)
          setInspector(input.kind === 'model3d' ? '3D 预览' : '媒体播放')
        }
      }
      setPageStatus(
        input.kind === 'import_slides'
          ? '已导入幻灯片'
          : input.kind === 'media'
            ? input.mediaKind === 'audio'
              ? '已插入音频'
              : '已插入视频'
            : '已应用素材',
      )
      return true
    } catch (cause) {
      if (!liveSignal.aborted) {
        setPageError(cause instanceof Error ? cause.message : '素材操作失败')
        setPageStatus(null)
      }
      return false
    } finally {
      if (assetAbort.current === controller) {
        assetAbort.current = null
        setPageStatus((current) => (current === '正在处理素材…' ? null : current))
      }
      setPictureBusy(false)
    }
  }
  const objectOrder = selectedObject
    ? (view?.slides()[active]?.elements.findIndex((element) => element.id === selectedObject.id) ??
      -1)
    : -1
  const objectCount = view?.slides()[active]?.elements.length ?? 0
  const objectBox = selectedObject?.transform.offset
  const setObjectBox = (field: 'x' | 'y' | 'cx' | 'cy', valuePt: number) => {
    if (!objectTarget || !objectBox || !selectedObject) return
    const box = { ...objectBox, [field]: Math.round(valuePt * 12700) }
    void runManualOp({
      op: 'setTransform',
      target: objectTarget,
      box,
      rotDeg: selectedObject.transform.rot / 60000,
    })
  }

  /** 打开/关掉查找栏。关的时候连高亮一起撤——留一条描边配「没有在查找」是假话 */
  const toggleFind = () => {
    if (findOpen) {
      setFindOpen(false)
      setFindMark(null)
      return
    }
    setFindOpen(true)
  }
  const toggleBold = () => applyFormat({ bold: !boldOn })
  const toggleItalic = () => applyFormat({ italic: !italicOn })
  const toggleUnderline = () => applyFormat({ underline: !underlineOn })

  const basicToolbar = (
    <>
      <span className="mimir-pptx-pdf-toolbar__basic">
        <ToolbarGroup label="文字格式">
          <ToolbarButton
            label={`加粗（${formatScope}）`}
            active={boldOn}
            disabled={formatReason !== undefined}
            disabledReason={formatReason}
            onClick={toggleBold}
          >
            <BoldIcon />
          </ToolbarButton>
          <ToolbarButton
            label={`倾斜（${formatScope}）`}
            active={italicOn}
            disabled={formatReason !== undefined}
            disabledReason={formatReason}
            onClick={toggleItalic}
          >
            <ItalicIcon />
          </ToolbarButton>
          <ToolbarButton
            label={`下划线（${formatScope}）`}
            active={underlineOn}
            disabled={formatReason !== undefined}
            disabledReason={formatReason}
            onClick={toggleUnderline}
          >
            <UnderlineIcon />
          </ToolbarButton>
        </ToolbarGroup>
      </span>
      <span className="mimir-pptx-pdf-toolbar__size">
        {hasRuns && uniformSize !== null ? (
          <ToolbarNumberField
            label={`字号（pt，${formatScope}）`}
            disabled={editingBusy}
            disabledReason={formatReason}
            value={uniformSize}
            min={MIN_FONT_SIZE_PT}
            max={MAX_FONT_SIZE_PT}
            suffix="pt"
            onCommit={(next) => applyFormat({ fontSize: next })}
          />
        ) : (
          <ToolbarLabel>{hasRuns ? '多档字号' : '未选中文字'}</ToolbarLabel>
        )}
      </span>
      <span className="mimir-pptx-pdf-toolbar__find">
        <ToolbarButton label="查找和替换" active={findOpen} onClick={toggleFind}>
          <FindIcon />
        </ToolbarButton>
      </span>
    </>
  )
  const textFormatMenu = (
    <ToolbarMenu
      label="文字格式"
      text="文字格式"
      panelWidth={310}
      renderPanel={(close) => (
        <div className="mimir-pptx-pdf-toolbar__panel">
          <div className="mimir-pptx-pdf-toolbar__narrow-only">
            <ToolbarMenuItemRow
              item={{
                key: 'bold',
                label: `加粗（${formatScope}）`,
                active: boldOn,
                disabled: formatReason !== undefined,
                disabledReason: formatReason,
                onSelect: toggleBold,
              }}
              close={close}
            />
            <ToolbarMenuItemRow
              item={{
                key: 'italic',
                label: `倾斜（${formatScope}）`,
                active: italicOn,
                disabled: formatReason !== undefined,
                disabledReason: formatReason,
                onSelect: toggleItalic,
              }}
              close={close}
            />
            <ToolbarMenuItemRow
              item={{
                key: 'underline',
                label: `下划线（${formatScope}）`,
                active: underlineOn,
                disabled: formatReason !== undefined,
                disabledReason: formatReason,
                onSelect: toggleUnderline,
              }}
              close={close}
            />
            <ToolbarMenuSeparator />
          </div>
          <ToolbarMenuItemRow
            item={{
              key: 'strike',
              label: `删除线（${formatScope}）`,
              active: strikeOn,
              disabled: formatReason !== undefined,
              disabledReason: formatReason,
              onSelect: () => applyFormat({ strike: !strikeOn }),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'superscript',
              label: `上标（${formatScope}）`,
              active: superscriptOn,
              disabled: formatReason !== undefined,
              disabledReason: formatReason,
              onSelect: () => applyFormat({ baseline: superscriptOn ? 0 : SUPERSCRIPT_BASELINE }),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'subscript',
              label: `下标（${formatScope}）`,
              active: subscriptOn,
              disabled: formatReason !== undefined,
              disabledReason: formatReason,
              onSelect: () => applyFormat({ baseline: subscriptOn ? 0 : SUBSCRIPT_BASELINE }),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'clear',
              label: '清除字形（加粗、倾斜、下划线、删除线、上下标；不动字号、字体与颜色）',
              disabled: formatReason !== undefined,
              disabledReason: formatReason,
              onSelect: () =>
                applyFormat({
                  bold: false,
                  italic: false,
                  underline: false,
                  strike: false,
                  baseline: 0,
                }),
            }}
            close={close}
          />
          <ToolbarMenuSeparator />
          <ToolbarMenuItemRow
            item={{
              key: 'size-up',
              label: `增大字号 ${SIZE_STEP_PT}pt（${formatScope}）`,
              disabled: !canStepSize,
              disabledReason: sizeStepReason,
              onSelect: () => stepSize(SIZE_STEP_PT),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'size-down',
              label: `减小字号 ${SIZE_STEP_PT}pt（${formatScope}）`,
              disabled: !canStepSize,
              disabledReason: sizeStepReason,
              onSelect: () => stepSize(-SIZE_STEP_PT),
            }}
            close={close}
          />
          {hasRuns ? (
            <ToolbarMenuFields label="字体和颜色">
              <ToolbarSelect
                label={`字体（${formatScope}，中英文一起换）`}
                disabled={editingBusy}
                disabledReason={formatReason}
                value={uniformFont}
                options={fontOptions}
                fallbackLabel="多档字体"
                onChange={(family) => applyFormat({ fontFamily: family })}
              />
              <ToolbarColorPicker
                label={`字体颜色（${formatScope}）`}
                disabled={editingBusy}
                value={uniformColor}
                options={colorOptions}
                onPick={(color) => applyFormat({ color })}
              />
            </ToolbarMenuFields>
          ) : (
            <ToolbarMenuNote>
              {formatReason ?? '字号、字体与颜色只作用于选中的文本框'}
            </ToolbarMenuNote>
          )}
          <div className="mimir-pptx-pdf-toolbar__find-menu">
            <ToolbarMenuSeparator />
            <ToolbarMenuItemRow
              item={{
                key: 'find',
                label: '查找和替换',
                active: findOpen,
                onSelect: toggleFind,
              }}
              close={close}
            />
          </div>
        </div>
      )}
    />
  )
  const objectMenu = (
    <ToolbarMenu
      label="对象与幻灯片操作"
      text="对象"
      panelWidth={330}
      renderPanel={(close) => (
        <div className="mimir-pptx-pdf-toolbar__panel">
          <ToolbarMenuFields label="插入">
            <ToolbarMenuItemRow
              item={{
                key: 'insert-textbox',
                label: '文本框',
                onSelect: () =>
                  void runManualOp({
                    op: 'addElement',
                    target: { slide: active },
                    kind: 'textbox',
                    offset: {
                      x: Math.round(session.size.cx * 0.1),
                      y: Math.round(session.size.cy * 0.12),
                      cx: Math.round(session.size.cx * 0.6),
                      cy: Math.round(session.size.cy * 0.14),
                    },
                    paragraphs: [{ runs: [{ text: '新文本框' }] }],
                  }),
              }}
              close={close}
            />
            <ToolbarMenuItemRow
              item={{
                key: 'insert-shape',
                label: '矩形',
                onSelect: () =>
                  void runManualOp({
                    op: 'addElement',
                    target: { slide: active },
                    kind: 'rect',
                    offset: {
                      x: Math.round(session.size.cx * 0.2),
                      y: Math.round(session.size.cy * 0.25),
                      cx: Math.round(session.size.cx * 0.35),
                      cy: Math.round(session.size.cy * 0.22),
                    },
                    fill: '#D9E8FB',
                  }),
              }}
              close={close}
            />
          </ToolbarMenuFields>
          <ToolbarMenuSeparator />
          {objectTarget && selectedObject ? (
            <>
              {selectedObject.type === 'chart' && (
                <ToolbarMenuItemRow
                  item={{
                    key: 'chart-editor',
                    label: '编辑图表',
                    onSelect: () => {
                      inspectorSections.current.set('编辑图表', 'object-extra')
                      inspectorTriggers.current.set('编辑图表', {
                        focus: () =>
                          canvasRef.current
                            ?.closest('.mimir-editor')
                            ?.querySelector<HTMLButtonElement>(
                              'button[aria-label="对象与幻灯片操作"]',
                            )
                            ?.focus(),
                      })
                      assetAbort.current?.abort()
                      cancelClarification.current?.()
                      setInspector('编辑图表')
                    },
                  }}
                  close={close}
                />
              )}
              {selectedObject.type === 'table' && (
                <ToolbarMenuItemRow
                  item={{
                    key: 'table-editor',
                    label: '编辑表格',
                    onSelect: () => {
                      inspectorSections.current.set('编辑表格', 'object-extra')
                      inspectorTriggers.current.set('编辑表格', {
                        focus: () =>
                          canvasRef.current
                            ?.closest('.mimir-editor')
                            ?.querySelector<HTMLButtonElement>(
                              'button[aria-label="对象与幻灯片操作"]',
                            )
                            ?.focus(),
                      })
                      assetAbort.current?.abort()
                      cancelClarification.current?.()
                      setInspector('编辑表格')
                    },
                  }}
                  close={close}
                />
              )}
              <ToolbarMenuFields label="选中对象">
                {selectedObject.type === 'picture' && (
                  <>
                    {hostPicture ? (
                      <ToolbarFileButton
                        label="替换选中图片"
                        accept={PPTX_PICTURE_ACCEPT}
                        disabled={pictureBusy}
                        onPick={(file) => applyLocalPicture(file, 'replace')}
                      >
                        替换选中图片
                      </ToolbarFileButton>
                    ) : (
                      <ToolbarMenuNote>当前未连接 PPTX 图片宿主，无法替换图片</ToolbarMenuNote>
                    )}
                    <ToolbarMenuNote>
                      图片不透明度：{Math.round((selectedObject.opacity ?? 1) * 100)}%
                    </ToolbarMenuNote>
                    {PICTURE_OPACITIES.map((percent) => {
                      const current = Math.round((selectedObject.opacity ?? 1) * 100) === percent
                      return (
                        <ToolbarMenuItemRow
                          key={percent}
                          item={{
                            key: `picture-opacity-${percent}`,
                            label: `图片不透明度 ${percent}%`,
                            active: current,
                            disabled: !hostApply || current,
                            disabledReason: !hostApply
                              ? '当前未连接 PPTX 宿主，无法调整图片'
                              : '已是当前不透明度',
                            onSelect: () =>
                              void runManualOp({
                                op: 'setPictureOpacity',
                                target: objectTarget,
                                opacity: percent / 100,
                              }),
                          }}
                          close={close}
                        />
                      )
                    })}
                  </>
                )}
                {(selectedObject.type === 'text' || selectedObject.type === 'shape') && (
                  <>
                    <ToolbarColorPicker
                      label="填充颜色"
                      value={null}
                      options={TEXT_COLORS}
                      onPick={(color) =>
                        void runManualOp({ op: 'setFill', target: objectTarget, fill: color })
                      }
                    />
                    <ToolbarMenuItemRow
                      item={{
                        key: 'no-fill',
                        label: '无填充',
                        onSelect: () =>
                          void runManualOp({
                            op: 'setFill',
                            target: objectTarget,
                            fill: 'none',
                          }),
                      }}
                      close={close}
                    />
                  </>
                )}
                <ToolbarColorPicker
                  label="轮廓颜色"
                  value={(() => {
                    const fill = pptxElementStroke(selectedObject)?.fill
                    return fill?.type === 'solid' ? fill.color : null
                  })()}
                  options={TEXT_COLORS}
                  onPick={(color) =>
                    void runManualOp(
                      pptxOutlineOp(objectTarget, pptxElementStroke(selectedObject), { color }),
                    )
                  }
                />
                <ToolbarMenuItemRow
                  item={{
                    key: 'no-stroke',
                    label: '无轮廓',
                    onSelect: () =>
                      void runManualOp({
                        op: 'setStroke',
                        target: objectTarget,
                        stroke: null,
                      }),
                  }}
                  close={close}
                />
              </ToolbarMenuFields>
              {objectBox && (
                <ToolbarMenuFields label="位置和大小（pt）">
                  <ToolbarNumberField
                    label="左"
                    disabled={editingBusy}
                    disabledReason="正在应用修改，请稍后重试"
                    value={Math.round(objectBox.x / 12700)}
                    onCommit={(value) => setObjectBox('x', value)}
                  />
                  <ToolbarNumberField
                    label="上"
                    disabled={editingBusy}
                    disabledReason="正在应用修改，请稍后重试"
                    value={Math.round(objectBox.y / 12700)}
                    onCommit={(value) => setObjectBox('y', value)}
                  />
                  <ToolbarNumberField
                    label="宽"
                    disabled={editingBusy}
                    disabledReason="正在应用修改，请稍后重试"
                    value={Math.round(objectBox.cx / 12700)}
                    min={1}
                    onCommit={(value) => setObjectBox('cx', value)}
                  />
                  <ToolbarNumberField
                    label="高"
                    disabled={editingBusy}
                    disabledReason="正在应用修改，请稍后重试"
                    value={Math.round(objectBox.cy / 12700)}
                    min={1}
                    onCommit={(value) => setObjectBox('cy', value)}
                  />
                </ToolbarMenuFields>
              )}
              <ToolbarMenuFields label="排列与翻转">
                {(
                  [
                    ['front', '置于顶层'],
                    ['forward', '上移一层'],
                    ['backward', '下移一层'],
                    ['back', '置于底层'],
                  ] as const
                ).map(([dir, label]) => {
                  const atExtreme =
                    dir === 'front' || dir === 'forward'
                      ? objectOrder >= objectCount - 1
                      : objectOrder <= 0
                  return (
                    <ToolbarMenuItemRow
                      key={dir}
                      item={{
                        key: `reorder-${dir}`,
                        label,
                        disabled: atExtreme,
                        disabledReason: atExtreme ? '对象已在这一层的边缘' : undefined,
                        onSelect: () =>
                          void runManualOp({
                            op: 'reorderElement',
                            target: objectTarget,
                            dir,
                          }),
                      }}
                      close={close}
                    />
                  )
                })}
                <ToolbarMenuItemRow
                  item={{
                    key: 'flip-horizontal',
                    label: '水平翻转',
                    active: selectedObject.transform.flipH,
                    onSelect: () =>
                      void runManualOp({
                        op: 'flipElements',
                        target: { slide: active },
                        els: [objectTarget.el],
                        axis: 'h',
                      }),
                  }}
                  close={close}
                />
                <ToolbarMenuItemRow
                  item={{
                    key: 'flip-vertical',
                    label: '垂直翻转',
                    active: selectedObject.transform.flipV,
                    onSelect: () =>
                      void runManualOp({
                        op: 'flipElements',
                        target: { slide: active },
                        els: [objectTarget.el],
                        axis: 'v',
                      }),
                  }}
                  close={close}
                />
              </ToolbarMenuFields>
              <ToolbarMenuItemRow
                item={{
                  key: 'delete-element',
                  label: '删除选中对象…',
                  onSelect: () => {
                    if (window.confirm('删除选中的对象？'))
                      void runManualOp({ op: 'deleteElement', target: objectTarget })
                  },
                }}
                close={close}
              />
            </>
          ) : (
            <ToolbarMenuNote>未选中对象</ToolbarMenuNote>
          )}
          <ToolbarMenuSeparator />
          <ToolbarMenuFields label="本页背景与放映">
            <ToolbarColorPicker
              label="本页背景颜色"
              value={null}
              options={TEXT_COLORS}
              onPick={(color) =>
                void runManualOp({
                  op: 'setBackground',
                  target: { slide: active },
                  kind: 'solid',
                  color,
                })
              }
            />
            <ToolbarMenuItemRow
              item={{
                key: 'reset-background',
                label: '重置本页背景',
                disabled: !view?.slides()[active]?.bgOwn,
                disabledReason: '本页正在使用母版背景',
                onSelect: () =>
                  void runManualOp({
                    op: 'setBackground',
                    target: { slide: active },
                    kind: 'reset',
                  }),
              }}
              close={close}
            />
            <ToolbarMenuItemRow
              item={{
                key: 'toggle-hidden',
                label: rendered?.hidden ? '在放映中显示本页' : '在放映中隐藏本页',
                active: rendered?.hidden === true,
                onSelect: () =>
                  void runManualOp({
                    op: 'setHidden',
                    target: { slide: active },
                    hidden: !rendered?.hidden,
                  }),
              }}
              close={close}
            />
          </ToolbarMenuFields>
          <ToolbarMenuSeparator />
          {manualUndoRound && (
            <ToolbarMenuItemRow
              item={{
                key: 'undo-object',
                label: '撤销上一次对象操作',
                disabled: editingBusy,
                disabledReason: '正在应用修改，请稍后重试',
                onSelect: () => {
                  const undone = agentHandleRef.current?.undoRound(manualUndoRound)
                  setManualUndoRound(null)
                  if (!undone) setPageError('画布已发生其他修改，无法撤销这一步')
                },
              }}
              close={close}
            />
          )}
        </div>
      )}
    />
  )

  const metadata = session.metadata(active)
  const panelVersion = viewVersion
  const panelKey = `${active}:${selectionBinding}:${panelVersion}`
  const panelSelectionChanged = (_ops: Record<string, unknown>[]) =>
    selectionBindingRef.current !== selectionBinding

  const applyPanelOp = async (op: Record<string, unknown>) => {
    if (
      session.version() !== panelVersion ||
      activeRef.current !== active ||
      panelSelectionChanged([op])
    ) {
      setPageError('画布已变化，请重新打开工具面板')
      return false
    }
    if (panelWriteAbort.current && !panelWriteAbort.current.controller.signal.aborted) return false
    const controller = new AbortController()
    const pending = { binding: panelWriteBinding, session, controller }
    panelWriteAbort.current = pending
    try {
      return await runManualTool(
        'apply_ops',
        { ops: [op] },
        { expectedVersion: panelVersion, signal: controller.signal },
      )
    } finally {
      if (panelWriteAbort.current === pending) panelWriteAbort.current = null
    }
  }
  async function applyPanelOps(ops: Record<string, unknown>[]) {
    if (!session) return false
    if (
      session.version() !== panelVersion ||
      activeRef.current !== active ||
      panelSelectionChanged(ops)
    ) {
      setPageError('画布已变化，请重新打开工具面板')
      return false
    }
    const handle = agentHandleRef.current,
      beforeSelection = selectedDurableRef.current,
      inserting = ops.length === 1 && ops[0]?.op === 'addElement',
      beforeIds = new Set(
        session.slides()[active]?.elements.map((item) => elementDurableId(item) ?? item.id),
      )
    if (panelWriteAbort.current && !panelWriteAbort.current.controller.signal.aborted) return false
    const controller = new AbortController()
    const pending = { binding: panelWriteBinding, session, controller }
    panelWriteAbort.current = pending
    let applied: boolean
    try {
      applied = await runManualTool(
        'apply_ops',
        { ops },
        { expectedVersion: panelVersion, signal: controller.signal },
      )
    } finally {
      if (panelWriteAbort.current === pending) panelWriteAbort.current = null
    }
    if (
      applied &&
      inserting &&
      agentHandleRef.current === handle &&
      activeRef.current === active &&
      session.version() === panelVersion + 1 &&
      selectedDurableRef.current === beforeSelection
    ) {
      const slide = session.slides()[active]
      const added = slide?.elements.filter(
        (item) => !beforeIds.has(elementDurableId(item) ?? item.id),
      )
      if (added?.length === 1) {
        setSelected(added[0]!.id)
      }
    }
    return applied
  }
  const applyPanelFill = async (input: import('@mimir/shared').PptxManualFill) => {
    if (
      session.version() !== panelVersion ||
      activeRef.current !== active ||
      input.slide !== active ||
      (input.kind === 'shape' && selectedDurableRef.current !== input.elementId)
    ) {
      setPageError('画布已变化，请重新打开工具面板')
      return false
    }
    return runManualTool('manual_fill', input)
  }
  const applySelectionFill = async (input: import('@mimir/shared').PptxManualFill) => {
    if (
      input.kind !== 'selection' ||
      session.version() !== panelVersion ||
      activeRef.current !== active ||
      input.slide !== active ||
      selectionBindingRef.current !== selectionBinding
    ) {
      setPageError('画布已变化，请重新打开工具面板')
      return false
    }
    if (panelWriteAbort.current && !panelWriteAbort.current.controller.signal.aborted) return false
    const controller = new AbortController()
    const pending = { binding: panelWriteBinding, session, controller }
    panelWriteAbort.current = pending
    try {
      return await runManualTool('manual_fill', input, {
        expectedVersion: panelVersion,
        signal: controller.signal,
      })
    } finally {
      if (panelWriteAbort.current === pending) panelWriteAbort.current = null
    }
  }
  const applyPanelAsset = async (
    input: PptxManualUpload,
    file: File,
    poster?: File,
    signal?: AbortSignal,
  ) => {
    if (
      session.version() !== panelVersion ||
      activeRef.current !== active ||
      (objectTarget && selectedDurableRef.current !== objectTarget.el)
    ) {
      setPageError('画布已变化，请重新打开工具面板')
      return false
    }
    return applyLocalAsset(input, file, poster, signal)
  }
  const inspectorPanels: Record<string, ReactNode> = {}
  if (groupPictureContext) {
    const target = {
      slide: active,
      group: groupPictureContext.group,
      elementId: groupPictureContext.ref,
    }
    const validGroupPictureBinding = (signal: AbortSignal) => {
      if (
        signal.aborted ||
        session.version() !== panelVersion ||
        activeRef.current !== active ||
        selectionBindingRef.current !== selectionBinding
      ) {
        if (!signal.aborted) setPageError('画布已变化，请重新打开组合图片工具')
        return false
      }
      return true
    }
    inspectorPanels['组合图片'] = (
      <PptxGroupPictureControls
        key={`${documentId}:${selectedSlide?.path}:${panelKey}`}
        element={groupPictureContext.element}
        groupName={
          selectedSlide?.elements.find((element) =>
            matchesElementRef(element, groupPictureContext.group),
          )?.name || '组合'
        }
        target={target}
        source={
          view.media.get(groupPictureContext.element.mediaRef) ??
          groupPictureContext.element.dataUrl ??
          ''
        }
        disabled={editingBusy || !hostApply}
        canUpload={!!hostAsset}
        cropUnavailableReason={
          groupPictureParent?.type === 'group'
            ? (pptxGroupPictureCropReason(
                selectedSlide!,
                groupPictureParent,
                groupPictureContext.element,
              ) ??
              pptxPictureCropUnavailableReason(groupPictureContext.element, {
                width: rendered.widthPx,
                height: rendered.heightPx,
                slideWidth: session.size.cx,
                slideHeight: session.size.cy,
              }) ??
              (!(
                view.media.get(groupPictureContext.element.mediaRef) ??
                groupPictureContext.element.dataUrl
              )
                ? '图片源未加载，请重新打开文档后重试'
                : undefined))
            : '父组合已失效，请重新选择图片'
        }
        onStartCrop={() => {
          setShapeInsert(null)
          ink.setTool('select')
          setPictureCrop({
            documentId,
            path: selectedSlide!.path,
            elementRef: target.elementId,
            group: target.group,
            source: source.bytes,
            workspace: workspaceMode,
            version: panelVersion,
          })
          closeInspector()
        }}
        apply={async (input: PptxManualPicture, signal: AbortSignal) => {
          if (!validGroupPictureBinding(signal)) return false
          if (panelWriteAbort.current && !panelWriteAbort.current.controller.signal.aborted)
            return false
          const controller = new AbortController()
          const pending = { binding: panelWriteBinding, session, controller }
          panelWriteAbort.current = pending
          try {
            return await runManualTool('manual_picture', input, {
              expectedVersion: panelVersion,
              signal: AbortSignal.any([signal, controller.signal]),
            })
          } finally {
            if (panelWriteAbort.current === pending) panelWriteAbort.current = null
          }
        }}
        upload={(input, file, signal) =>
          validGroupPictureBinding(signal)
            ? applyLocalAsset(input, file, undefined, signal)
            : Promise.resolve(false)
        }
      />
    )
  }
  inspectorPanels['对象选择与格式'] = (
    <div className="mimir-pptx-selection-workspace">
      <div className="mimir-pptx-selection-workspace__nav">
        <ToolbarToggleGroup
          label="对象属性分类"
          value={selectionTool}
          options={[
            { value: 'format', label: '选择与格式', disabled: editingBusy },
            { value: 'geometry', label: '位置与形状', disabled: editingBusy },
          ]}
          onChange={(value) => {
            if (!manualPending.current) setSelectionTool(value)
          }}
        />
      </div>
      <div className="mimir-pptx-selection-workspace__view" hidden={selectionTool !== 'format'}>
        <PptxSelectionControls
          elements={selectedSlide?.elements ?? []}
          selectedRefs={selectedRefs}
          onSelectionChange={setSelection}
          slide={active}
          version={panelVersion}
          sourceKey={`${documentId}:${selectedSlide?.path}`}
          applyOps={applyPanelOps}
          applyFill={applySelectionFill}
          disabled={editingBusy || !hostApply}
        />
      </div>
      <div className="mimir-pptx-selection-workspace__view" hidden={selectionTool !== 'geometry'}>
        <PptxSelectionGeometryControls
          elements={selectedSlide?.elements ?? []}
          selectedRefs={selectedRefs}
          slide={active}
          version={panelVersion}
          sourceKey={`${documentId}:${selectedSlide?.path}`}
          applyOps={applyPanelOps}
          disabled={editingBusy || !hostApply}
        />
      </div>
    </div>
  )
  if (selectedObject?.type === 'table' && objectTarget)
    inspectorPanels['编辑表格'] = hostApply ? (
      <PptxTableControls
        table={selectedObject}
        version={panelVersion}
        target={objectTarget}
        apply={applyPanelOp}
        editParagraphRuns={editParagraphRuns}
        colors={TEXT_COLORS}
      />
    ) : (
      <ToolbarMenuNote>当前未连接 PPTX 宿主，无法编辑表格单元格</ToolbarMenuNote>
    )
  if (selectedObject?.type === 'chart' && objectTarget)
    inspectorPanels['编辑图表'] = hostApply ? (
      <ChartEditControls
        chart={selectedObject}
        target={objectTarget}
        apply={(args) => {
          if (session.version() !== panelVersion) {
            setPageError('画布已变化，请重新打开工具面板')
            return Promise.resolve(false)
          }
          return runManualTool('edit_chart', args)
        }}
      />
    ) : (
      <ToolbarMenuNote>当前未连接 PPTX 宿主，无法编辑图表</ToolbarMenuNote>
    )
  if (clarification)
    inspectorPanels['演示需求'] = (
      <PptxClarificationControls input={clarification.input} complete={clarification.finish} />
    )
  const advancedMenu = (label: string, content: ReactNode, reason?: string) => {
    const body =
      !hostApply && label !== '导出与打印' ? (
        <ToolbarMenuNote>
          {label === '插入图表' ? '当前未连接 PPTX 宿主，无法插入图表' : '当前未连接 PPTX 宿主'}
        </ToolbarMenuNote>
      ) : reason ? (
        <ToolbarMenuNote>{reason}</ToolbarMenuNote>
      ) : (
        content
      )
    if (
      [
        '剪贴板',
        '对象选择与格式',
        '段落与文本框',
        '插入图表',
        '图片裁切',
        '组合图片',
        '轮廓',
        '形状库',
        '对齐与组合',
        '主题',
        '分节与批注',
        '新建批注',
        '编辑顶点',
        '公式',
        '图示',
        '音视频',
        '屏幕录制',
        '图片填充',
        '形状填充',
        '设置背景',
        '导入幻灯片',
        '媒体播放',
        '备注与放映',
        '自定义放映与排练',
        '缩放导航',
        '导出与打印',
        '图标',
        '图片去背景',
        '母版编辑',
        '3D 模型',
        '3D 预览',
      ].includes(label)
    ) {
      inspectorPanels[label] = body
      return (
        <ToolbarButton
          label={label}
          active={inspector === label}
          ref={(node) => {
            if (node) inspectorTriggers.current.set(label, node)
            else inspectorTriggers.current.delete(label)
          }}
          onClick={() => {
            if (inspector === label) closeInspector()
            else {
              const trigger = inspectorTriggers.current.get(label)
              if (label === '新建批注' && trigger instanceof HTMLElement)
                commentReturnRef.current = trigger
              const section =
                trigger instanceof HTMLElement
                  ? trigger.closest<HTMLElement>('[data-section-key]')?.dataset.sectionKey
                  : undefined
              if (section) inspectorSections.current.set(label, section)
              assetAbort.current?.abort()
              cancelClarification.current?.()
              setInspector(label)
            }
          }}
        >
          {label}
        </ToolbarButton>
      )
    }
    return (
      <ToolbarMenu
        label={label}
        text={label}
        panelWidth={350}
        renderPanel={() => (
          <div className="mimir-pptx-tool-popover" key={panelKey}>
            {body}
          </div>
        )}
      />
    )
  }

  const restoreShapeFocus = () => {
    const editor = canvasRef.current?.closest('.mimir-editor')
    const focus = document.activeElement
    if (
      focus !== document.body &&
      !editor?.querySelector('.mimir-pptx-shape-insert-layer')?.contains(focus)
    )
      return
    requestAnimationFrame(() => {
      const trigger =
        editor?.querySelector<HTMLButtonElement>(
          '[data-section-key="shape-library"] button[aria-label="形状库"]',
        ) ??
        editor?.querySelector<HTMLButtonElement>(
          '[data-section-key="shape-library"] button:not(:disabled)',
        )
      trigger?.focus()
    })
  }
  const exitShapeInsert = () => {
    setShapeInsert(null)
    restoreShapeFocus()
  }
  const shapeKind =
    shapeInsert?.documentId === documentId &&
    shapeInsert.path === view.slides()[active]!.path &&
    shapeInsert.version === panelVersion &&
    (workspaceMode === 'normal' || workspaceMode === 'outline')
      ? shapeInsert.kind
      : null
  const applyDrawShape = async (
    input: PptxManualShape,
    expectedVersion: number,
    signal: AbortSignal,
  ) => {
    if (
      signal.aborted ||
      input.slide !== activeRef.current ||
      session.version() !== expectedVersion
    )
      return false
    const before = new Set(
      session.slides()[active]!.elements.map((item) => elementDurableId(item) ?? item.id),
    )
    const applied = await runManualTool('manual_shape', input, { expectedVersion, signal })
    if (
      applied &&
      activeRef.current === active &&
      session.version() === expectedVersion + 1 &&
      agentHandleRef.current?.documentId === documentId
    ) {
      const currentSlide = session.slides()[active]!
      const added = currentSlide.elements.filter(
        (item) => !before.has(elementDurableId(item) ?? item.id),
      )
      if (added.length === 1) setSelected(added[0]!.id)
      setShapeInsert(null)
      restoreShapeFocus()
    }
    return applied
  }

  const cropElement = pictureCrop?.group ? groupPictureContext?.element : selectedObject
  const cropRef = pictureCrop?.group ? groupPictureContext?.ref : objectTarget?.el
  const cropTarget =
    cropElement?.type === 'picture' &&
    cropRef &&
    pictureCrop?.documentId === documentId &&
    pictureCrop.source === source.bytes &&
    pictureCrop.workspace === workspaceMode &&
    pictureCrop.path === view.slides()[active]!.path &&
    pictureCrop.elementRef === cropRef &&
    pictureCrop.group === groupPictureContext?.group &&
    pictureCrop.version === panelVersion &&
    (workspaceMode === 'normal' || workspaceMode === 'outline')
      ? {
          element: cropElement,
          target: { slide: active, el: cropRef },
          group: pictureCrop.group,
          parent: groupPictureParent?.type === 'group' ? groupPictureParent : undefined,
        }
      : null
  const exitPictureCrop = () => {
    const wasGroup = !!pictureCrop?.group
    setPictureCrop(null)
    if (wasGroup) {
      groupCropReturnFocus.current = true
      setInspector('组合图片')
    }
    requestAnimationFrame(() => {
      const editor = canvasRef.current?.closest('.mimir-editor')
      const focus = document.activeElement
      if (
        focus !== document.body &&
        !editor?.querySelector('.mimir-pptx-picture-crop-layer')?.contains(focus)
      )
        return
      if (wasGroup) {
        editor?.querySelector<HTMLButtonElement>('button[aria-label="在画布裁切组合图片"]')?.focus()
        return
      }
      inspectorTriggers.current.get('图片裁切')?.focus()
      if (document.activeElement === document.body)
        editor
          ?.querySelector<HTMLButtonElement>(
            '[data-section-key="picture-crop"] button:not(:disabled)',
          )
          ?.focus()
    })
  }

  const workspaceStage = (
    <div className={`me-scroll mimir-pptx-stage${viewSettings.ruler ? ' has-ruler' : ''}`}>
      <div
        className="mimir-pptx-sheet"
        style={{
          width:
            viewSettings.zoom === 'fit'
              ? FIT_WIDTH_PX
              : (FIT_WIDTH_PX * Number(viewSettings.zoom)) / 100,
          maxWidth: viewSettings.zoom === 'fit' ? '100%' : 'none',
        }}
      >
        {/* Canvas hit testing stays on injected SVG. The object Inspector and
            focused-canvas arrows provide the corresponding keyboard path. */}
        <div
          ref={canvasRef}
          className="mimir-pptx-slide"
          onClick={onClickCanvas}
          tabIndex={0}
          role="group"
          aria-label="幻灯片对象画布"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || editingBusy) return
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
              event.preventDefault()
              setSelection(selectedSlide?.elements.map((item) => item.id) ?? [])
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setSelection([])
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault()
              const items = selectedSlide?.elements ?? []
              if (!items.length) return
              const anchor = selectedContexts.at(-1)
              const index = items.findIndex(
                (item) =>
                  item.id === anchor?.element.id ||
                  anchor?.ancestors.some((ref) => matchesElementRef(item, ref)),
              )
              const nextIndex =
                index < 0
                  ? event.key === 'ArrowRight'
                    ? 0
                    : items.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length
              const next = items[nextIndex]!
              setSelection(event.shiftKey ? [...selectedRefs, next.id] : [next.id])
            }
          }}
          /*
            注入渲染好的 SVG。**为什么用 dangerouslySetInnerHTML 而不是 React
            元素**：渲染器是纯函数（绘制列表 → 字符串），产物要能脱离 React
            单独用（存成 .svg、在测试里比对字符串、将来做导出）。重写成 React
            组件会让那几处各写一份。字符串来自我们自己的渲染器、内容是转义过的
            XML（`pptx-svg.ts` 有转义与可解析性测试），不是用户可控的 HTML。
            **点选靠 data-element-id 属性**——渲染器给每个元素节点写了它。
          */
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
        <PptxSelectionCanvas
          host={canvasRef}
          binding={`${documentId}:${selectedSlide?.path}:${panelVersion}`}
          ids={selectedSlide?.elements.map((item) => item.id) ?? []}
          selectedIds={selectedContexts.map((item) => item.element.id)}
          disabled={
            editingBusy || !!shapeKind || !!cropTarget || ink.tool !== 'select' || !!formatBrush
          }
          onSelect={setSelection}
        />
        <PptxAnimationPreview
          host={canvasRef}
          slide={view.slides()[active]!}
          version={session.version()}
          selectionKey={textTargetKey}
          onEnd={() => setAnimationPreview(null)}
          request={
            inspector === '备注与放映' &&
            animationPreview?.documentId === documentId &&
            animationPreview.path === view.slides()[active]!.path &&
            animationPreview.version === session.version() &&
            animationPreview.selected === selected
              ? animationPreview.request
              : null
          }
        />
        <PptxViewOverlay size={view.size} settings={viewSettings} />
        {cropTarget && (
          <PptxPictureCropCanvas
            documentId={documentId}
            slideKey={view.slides()[active]!.path}
            version={panelVersion}
            element={cropTarget.element}
            parent={cropTarget.parent}
            groupRef={cropTarget.group}
            target={cropTarget.target}
            imageHref={view.media.get(cropTarget.element.mediaRef)}
            width={rendered.widthPx}
            height={rendered.heightPx}
            slideWidth={session.size.cx}
            slideHeight={session.size.cy}
            disabled={
              (manualBusy && !cropBusy) ||
              pictureBusy ||
              source.saving ||
              inkBusy ||
              shapeBusy ||
              !hostApply
            }
            apply={async (srcRect, expectedVersion, signal, box) => {
              if (
                signal.aborted ||
                session.version() !== expectedVersion ||
                activeRef.current !== active ||
                (cropTarget.group
                  ? selectionBindingRef.current !== selectionBinding
                  : selectedDurableRef.current !== cropTarget.target.el)
              )
                return false
              const changed = await runManualTool(
                cropTarget.group ? 'manual_picture' : 'apply_ops',
                cropTarget.group
                  ? {
                      slide: active,
                      group: cropTarget.group,
                      elementId: cropTarget.target.el,
                      srcRect,
                      box,
                    }
                  : {
                      ops: [
                        {
                          op: 'setPictureSrcRect',
                          target: cropTarget.target,
                          srcRect,
                          ...(box ? { box } : {}),
                        },
                      ],
                    },
                { expectedVersion, signal },
              )
              if (changed) exitPictureCrop()
              return changed
            }}
            onExit={exitPictureCrop}
            onBusy={setCropBusy}
          />
        )}
        <PptxShapeInsertCanvas
          documentId={documentId}
          slideKey={view.slides()[active]!.path}
          slide={active}
          version={panelVersion}
          kind={shapeKind}
          width={rendered.widthPx}
          height={rendered.heightPx}
          slideWidth={session.size.cx}
          slideHeight={session.size.cy}
          disabled={
            (manualBusy && !shapeBusy) || pictureBusy || source.saving || inkBusy || !hostApply
          }
          apply={applyDrawShape}
          onExit={exitShapeInsert}
          onBusy={setShapeBusy}
        />
        <PptxInkCanvas
          key={`${documentId}:${active}`}
          slide={active}
          version={session.version()}
          tree={rendered.tree}
          width={rendered.widthPx}
          height={rendered.heightPx}
          tool={ink.tool}
          preset={ink.presets[ink.selectedPreset]!}
          disabled={editingBusy || !hostApply}
          apply={runInk}
          onExit={() => ink.setTool('select')}
          onBusy={setInkBusy}
        />
      </div>
    </div>
  )

  return (
    <>
      <EditorShell
        flush={flush}
        toolbar={
          <CompactToolbar
            quickAccess={
              <>
                <ToolbarButton
                  label={source.saving ? '保存中…' : '保存到库'}
                  disabled={!dirty || editingBusy}
                  disabledReason={editingBusy ? '正在处理文档，请稍后重试' : '没有未保存的改动'}
                  onClick={() => void save()}
                >
                  <SaveIcon />
                </ToolbarButton>
                <ToolbarButton
                  label="撤销"
                  disabled={!history?.canUndo || editingBusy}
                  disabledReason={editingBusy ? '正在处理文档' : '没有可撤销的修改'}
                  onClick={() => {
                    if (history?.undo()) {
                      setActive(Math.min(active, session.slides().length - 1))
                      setManualUndoRound(null)
                      afterEditRef.current()
                    }
                  }}
                >
                  <UndoIcon />
                </ToolbarButton>
                <ToolbarButton
                  label="重做"
                  disabled={!history?.canRedo || editingBusy}
                  disabledReason={editingBusy ? '正在处理文档' : '没有可重做的修改'}
                  onClick={() => {
                    if (history?.redo()) {
                      setActive(Math.min(active, session.slides().length - 1))
                      setManualUndoRound(null)
                      afterEditRef.current()
                    }
                  }}
                >
                  <RedoIcon />
                </ToolbarButton>
              </>
            }
            tabs={[
              { key: 'home', label: '开始' },
              { key: 'insert', label: '插入' },
              { key: 'object', label: '对象' },
              { key: 'draw', label: '绘图' },
              { key: 'slide', label: '幻灯片' },
              { key: 'view', label: '视图' },
            ]}
            sections={[
              {
                key: 'clipboard',
                label: '剪贴板',
                tab: 'home',
                minWidth: 0,
                content: advancedMenu(
                  '剪贴板',
                  <PptxClipboardControls
                    slide={active}
                    elementId={objectTarget?.el ?? null}
                    elements={selectedSlide?.elements ?? []}
                    selectedRefs={selectedRefs}
                    contextKey={`${panelWriteBinding}:${viewVersion}`}
                    disabled={editingBusy}
                    slideCount={session.slides().length}
                    slideNames={session
                      .slides()
                      .map(
                        (slide) => slide.originalXml.match(/<p:cSld[^>]*name="([^"]*)"/)?.[1] ?? '',
                      )}
                    insertSystemImage={
                      hostAsset
                        ? (file, signal) =>
                            applyLocalAsset(
                              {
                                kind: 'picture',
                                slide: active,
                                widthPt: 72,
                                keepCrop: false,
                                naturalSize: true,
                              },
                              file,
                              undefined,
                              signal,
                            )
                        : undefined
                    }
                    execute={runClipboard}
                  />,
                ),
              },
              { key: 'text', label: '字形与查找', tab: 'home', minWidth: 0, content: basicToolbar },
              {
                key: 'format-brush',
                label: '格式刷',
                tab: 'home',
                minWidth: 0,
                content: (
                  <ToolbarMenu
                    label="格式刷"
                    text="格式刷"
                    panelWidth={280}
                    renderPanel={() => (
                      <ToolbarMenuFields label="对象格式刷">
                        <ToolbarMenuNote>
                          从选中对象复制纯色填充、边框及首段字体与对齐。图片仅接收边框；文字内容保持不变。
                        </ToolbarMenuNote>
                        <ToolbarSelect
                          label="使用方式"
                          value={brushContinuous ? 'continuous' : 'once'}
                          options={[
                            { value: 'once', label: '使用一次' },
                            { value: 'continuous', label: '连续使用' },
                          ]}
                          onChange={(value) => setBrushContinuous(value === 'continuous')}
                        />
                        <ToolbarButton
                          label="复制选中对象格式"
                          disabled={!selectedObject || !hostApply}
                          disabledReason="先选择文字、形状或图片"
                          onClick={() => {
                            const node = rendered.tree.nodes.find(
                              (item) => item.sourceId === selectedObject?.id,
                            )
                            const brush = node
                              ? capturePptxBrush(node, view.size.cx / 12700 / rendered.widthPx)
                              : null
                            if (!brush) {
                              setPageError('格式刷支持文字、形状和图片')
                              return
                            }
                            setFormatBrush(brush)
                            setPageStatus('已复制格式；点击目标对象应用，Esc 退出')
                          }}
                        >
                          复制选中对象格式
                        </ToolbarButton>
                        <ToolbarButton
                          label="应用到选中对象"
                          disabled={!formatBrush || !selectedObject}
                          onClick={() => {
                            if (selectedObject) brushApplyRef.current(selectedObject.id)
                          }}
                        >
                          应用到选中对象
                        </ToolbarButton>
                        <ToolbarButton
                          label="退出格式刷"
                          disabled={!formatBrush}
                          onClick={() => {
                            setFormatBrush(null)
                            setPageStatus('已退出格式刷')
                          }}
                        >
                          退出格式刷
                        </ToolbarButton>
                      </ToolbarMenuFields>
                    )}
                  />
                ),
              },
              {
                key: 'paragraph-advanced',
                label: '段落与文本框',
                tab: 'home',
                minWidth: 0,
                content: advancedMenu(
                  '段落与文本框',
                  selectedText && objectTarget ? (
                    <PptxParagraphControls
                      text={selectedText}
                      target={objectTarget}
                      selection={textSelection}
                      version={panelVersion}
                      applyParagraphFormat={async (format, paraIndices, signal) => {
                        if (
                          signal.aborted ||
                          session.version() !== panelVersion ||
                          activeRef.current !== active ||
                          selectedDurableRef.current !== objectTarget.el
                        )
                          return false
                        const changed = await runManualTool(
                          'manual_paragraph',
                          { ...objectTarget, paraIndices, format },
                          { expectedVersion: panelVersion, signal },
                        )
                        if (
                          changed &&
                          activeRef.current === active &&
                          selectedDurableRef.current === objectTarget.el &&
                          session.version() === panelVersion + 1
                        ) {
                          setTextRange({
                            targetKey: textTargetKey,
                            version: session.version(),
                            selection: textSelection,
                          })
                        }
                        return changed
                      }}
                      apply={applyPanelOp}
                    />
                  ) : null,
                  !selectedText || !objectTarget ? '先选择带文字的对象' : undefined,
                ),
              },

              {
                key: 'text-extra',
                label: '字体与颜色',
                tab: 'home',
                minWidth: 0,
                content: textFormatMenu,
              },
              {
                key: 'ai-create',
                label: 'AI 编辑',
                tab: 'home',
                minWidth: 0,
                content: (
                  <PptxAiControls
                    documentId={documentId}
                    slidePath={view.slides()[active]!.path}
                    slideIndex={active}
                    version={panelVersion}
                    onAiPreset={onAiPreset}
                    onSnapshot={onAiSnapshotDraft ? () => void prepareSnapshot() : undefined}
                    snapshotPending={snapshotPending}
                    disabled={editingBusy}
                    section="create"
                  />
                ),
              },
              {
                key: 'ai-review',
                label: '检查与翻译',
                tab: 'slide',
                minWidth: 0,
                content: (
                  <PptxAiControls
                    documentId={documentId}
                    slidePath={view.slides()[active]!.path}
                    slideIndex={active}
                    version={panelVersion}
                    onAiPreset={onAiPreset}
                    onSnapshot={onAiSnapshotDraft ? () => void prepareSnapshot() : undefined}
                    snapshotPending={snapshotPending}
                    disabled={editingBusy}
                    section="review"
                  />
                ),
              },
              {
                key: 'insert',
                label: '对象',
                tab: 'insert',
                minWidth: 0,
                content: (
                  <ToolbarGroup label="插入对象">
                    <ToolbarButton
                      label="插入文本框"
                      onClick={() =>
                        void runManualOp({
                          op: 'addElement',
                          target: { slide: active },
                          kind: 'textbox',
                          offset: {
                            x: Math.round(session.size.cx * 0.1),
                            y: Math.round(session.size.cy * 0.12),
                            cx: Math.round(session.size.cx * 0.6),
                            cy: Math.round(session.size.cy * 0.14),
                          },
                          paragraphs: [{ runs: [{ text: '新文本框' }] }],
                        })
                      }
                    >
                      文本框
                    </ToolbarButton>
                    <ToolbarButton
                      label="插入矩形"
                      onClick={() =>
                        void runManualOp({
                          op: 'addElement',
                          target: { slide: active },
                          kind: 'rect',
                          offset: {
                            x: Math.round(session.size.cx * 0.2),
                            y: Math.round(session.size.cy * 0.25),
                            cx: Math.round(session.size.cx * 0.35),
                            cy: Math.round(session.size.cy * 0.22),
                          },
                          fill: '#D9E8FB',
                        })
                      }
                    >
                      矩形
                    </ToolbarButton>
                    <ToolbarMenu
                      label="插入表格"
                      text="表格"
                      panelWidth={190}
                      renderPanel={(close) =>
                        hostApply ? (
                          <ToolbarMenuFields label="选择表格大小">
                            <ToolbarGridPicker
                              label="插入表格的大小"
                              rows={TABLE_GRID_SIZE}
                              columns={TABLE_GRID_SIZE}
                              cellLabel={tableCellLabel}
                              onPick={(rows, cols) => {
                                close()
                                void insertTable(rows, cols)
                              }}
                            />
                          </ToolbarMenuFields>
                        ) : (
                          <ToolbarMenuNote>当前未连接 PPTX 宿主，无法插入表格</ToolbarMenuNote>
                        )
                      }
                    />
                    {advancedMenu(
                      '插入图表',
                      hostApply ? (
                        <ChartInsertControls
                          slide={active}
                          width={session.size.cx}
                          height={session.size.cy}
                          apply={applyPanelOp}
                          close={closeInspector}
                        />
                      ) : null,
                    )}
                    {hostPicture ? (
                      <ToolbarFileButton
                        label="插入图片"
                        accept={PPTX_PICTURE_ACCEPT}
                        disabled={pictureBusy}
                        onPick={(file) => applyLocalPicture(file, 'insert')}
                      >
                        图片
                      </ToolbarFileButton>
                    ) : (
                      <ToolbarButton
                        label="插入图片"
                        disabled
                        disabledReason="当前未连接 PPTX 图片宿主"
                      >
                        图片
                      </ToolbarButton>
                    )}
                  </ToolbarGroup>
                ),
              },
              {
                key: 'equation',
                label: '公式',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '公式',
                  <PptxEquationControls
                    slide={active}
                    width={session.size.cx}
                    height={session.size.cy}
                    target={
                      selectedObject?.type === 'text' || selectedObject?.type === 'shape'
                        ? objectTarget
                        : null
                    }
                    apply={applyPanelOp}
                  />,
                ),
              },
              {
                key: 'media-insert',
                label: '音视频',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '音视频',
                  <PptxMediaControls
                    key={`${documentId}:${selectedSlide?.path}:${panelVersion}`}
                    slide={active}
                    upload={applyPanelAsset}
                  />,
                  !hostAsset ? '当前未连接素材宿主' : undefined,
                ),
              },
              {
                key: 'screen-recording',
                label: '录屏',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '屏幕录制',
                  <PptxScreenRecordControls slide={active} upload={applyPanelAsset} />,
                  !hostAsset ? '当前未连接素材宿主' : undefined,
                ),
              },
              {
                key: 'image-fill',
                label: '图片填充',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '图片填充',
                  <PptxImageFillControls
                    slide={active}
                    elementId={
                      selectedObject?.type === 'shape' || selectedObject?.type === 'text'
                        ? (objectTarget?.el ?? null)
                        : null
                    }
                    upload={applyPanelAsset}
                  />,
                  !hostAsset ? '当前未连接素材宿主' : undefined,
                ),
              },
              {
                key: 'shape-fill',
                label: '形状填充',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '形状填充',
                  <PptxShapeFillControls
                    element={selectedObject ?? null}
                    target={objectTarget}
                    version={panelVersion}
                    applyOps={applyPanelOps}
                    applyFill={applyPanelFill}
                    media={view.media}
                  />,
                  selectedObject?.type === 'shape' || selectedObject?.type === 'text'
                    ? undefined
                    : '请选择形状或文本框',
                ),
              },
              {
                key: 'background-fill',
                label: '背景',
                tab: 'slide',
                minWidth: 0,
                content: advancedMenu(
                  '设置背景',
                  <PptxBackgroundControls
                    slide={view.slides()[active]!}
                    slideIndex={active}
                    slideCount={slideCount}
                    version={panelVersion}
                    applyOps={applyPanelOps}
                    applyFill={applyPanelFill}
                    media={view.media}
                  />,
                ),
              },
              {
                key: 'drawing',
                label: '绘图',
                tab: 'draw',
                minWidth: 0,
                content: (
                  <PptxInkControls
                    {...ink}
                    setTool={(tool) => {
                      if (
                        tool !== 'select' &&
                        (workspaceMode === 'reading' || workspaceMode === 'sorter')
                      )
                        changeWorkspaceMode('normal')
                      ink.setTool(tool)
                    }}
                    selectPreset={(index) => {
                      if (workspaceMode === 'reading' || workspaceMode === 'sorter')
                        changeWorkspaceMode('normal')
                      ink.selectPreset(index)
                    }}
                    updatePreset={(patch) => {
                      if (workspaceMode === 'reading' || workspaceMode === 'sorter')
                        changeWorkspaceMode('normal')
                      ink.updatePreset(patch)
                    }}
                    count={inkNodesOf(rendered.tree).length}
                    disabled={editingBusy || !hostApply}
                    clear={() => runManualTool('manual_ink', { kind: 'clear', slide: active })}
                  />
                ),
              },
              {
                key: 'slide-import',
                label: '导入',
                tab: 'slide',
                minWidth: 0,
                content: advancedMenu(
                  '导入幻灯片',
                  <PptxImportControls afterIndex={active} upload={applyPanelAsset} />,
                  !hostAsset ? '当前未连接素材宿主' : undefined,
                ),
              },
              ...(selectedObject?.type === 'picture' && selectedObject.media
                ? [
                    {
                      key: 'media-playback',
                      label: '媒体播放',
                      tab: 'object',
                      minWidth: 0,
                      content: advancedMenu(
                        '媒体播放',
                        <PptxMediaPlayer
                          key={`${documentId}:${selectedSlide?.path}:${selectedElementRef}:${panelVersion}`}
                          session={session}
                          element={selectedObject}
                          version={panelVersion}
                        />,
                      ),
                    },
                  ]
                : []),
              {
                key: 'diagram',
                label: '图示',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '图示',
                  <PptxDiagramControls
                    slide={active}
                    width={session.size.cx}
                    height={session.size.cy}
                    apply={applyPanelOp}
                  />,
                ),
              },
              {
                key: 'wordart',
                label: '艺术字',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '艺术字',
                  <PptxWordArtControls
                    slide={active}
                    width={session.size.cx}
                    height={session.size.cy}
                    apply={applyPanelOp}
                  />,
                ),
              },
              {
                key: 'dynamic-field',
                label: '动态字段',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '动态字段',
                  <PptxFieldControls
                    slide={active}
                    width={session.size.cx}
                    height={session.size.cy}
                    apply={applyPanelOp}
                  />,
                ),
              },
              {
                key: 'shape-library',
                label: '形状库',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '形状库',
                  <PptxShapeGallery
                    version={panelVersion}
                    target={objectTarget}
                    element={selectedObject}
                    slide={active}
                    width={session.size.cx}
                    height={session.size.cy}
                    applyOps={applyPanelOps}
                    onDrawShape={(kind) => {
                      ink.setTool('select')
                      setFormatBrush(null)
                      closeInspector()
                      setShapeInsert({
                        documentId,
                        path: view.slides()[active]!.path,
                        version: panelVersion,
                        kind,
                      })
                    }}
                  />,
                ),
              },
              {
                key: 'object-selection',
                label: '对象选择与格式',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu('对象选择与格式', inspectorPanels['对象选择与格式']),
              },
              {
                key: 'object-arrange-advanced',
                label: '对齐与组合',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '对齐与组合',
                  <PptxArrangeControls
                    elements={view.slides()[active]!.elements}
                    slide={active}
                    selected={selected}
                    selectedRefs={selectedRefs}
                    onSelectionChange={setSelection}
                    apply={applyPanelOp}
                  />,
                ),
              },
              {
                key: 'object-effects',
                label: '效果',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '对象效果',
                  selectedObject && objectTarget ? (
                    <PptxEffectsControls
                      element={selectedObject}
                      target={objectTarget}
                      apply={applyPanelOp}
                    />
                  ) : null,
                  !selectedObject ? '先选择对象' : undefined,
                ),
              },
              {
                key: 'object-link',
                label: '链接',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '对象链接',
                  selectedObject && objectTarget ? (
                    <PptxLinkControls
                      link={session.link(active, selectedObject)}
                      target={objectTarget}
                      count={slideCount}
                      apply={applyPanelOp}
                    />
                  ) : null,
                  !selectedObject ? '先选择对象' : undefined,
                ),
              },
              {
                key: 'object-outline',
                label: '轮廓',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '轮廓',
                  selectedObject && objectTarget ? (
                    <PptxOutlineControls
                      element={selectedObject}
                      target={objectTarget}
                      apply={applyPanelOp}
                      version={panelVersion}
                    />
                  ) : null,
                  !selectedObject ? '先选择对象' : undefined,
                ),
              },
              {
                key: 'group-picture',
                label: '组合图片',
                tab: 'object',
                minWidth: 0,
                content: groupPictureContext
                  ? advancedMenu('组合图片', inspectorPanels['组合图片'])
                  : null,
              },
              {
                key: 'picture-crop',
                label: '图片裁切',
                tab: 'object',
                minWidth: 0,
                content:
                  selectedObject?.type === 'picture' && objectTarget
                    ? advancedMenu(
                        '图片裁切',
                        <PptxPictureControls
                          element={selectedObject}
                          target={objectTarget}
                          apply={applyPanelOp}
                          cropUnavailableReason={
                            pptxPictureCropUnavailableReason(selectedObject, {
                              width: rendered.widthPx,
                              height: rendered.heightPx,
                              slideWidth: session.size.cx,
                              slideHeight: session.size.cy,
                            }) ??
                            (!(view.media.get(selectedObject.mediaRef) ?? selectedObject.dataUrl)
                              ? '图片源未加载，请重新打开文档后重试'
                              : undefined)
                          }
                          onStartCrop={() => {
                            setShapeInsert(null)
                            ink.setTool('select')
                            setPictureCrop({
                              documentId,
                              path: view.slides()[active]!.path,
                              elementRef: objectTarget.el,
                              source: source.bytes,
                              workspace: workspaceMode,
                              version: panelVersion,
                            })
                            closeInspector()
                          }}
                        />,
                      )
                    : null,
              },
              {
                key: 'object-freeform',
                label: '编辑顶点',
                tab: 'object',
                minWidth: 0,
                content:
                  selectedObject &&
                  objectTarget &&
                  (selectedObject.type === 'shape' || selectedObject.type === 'text')
                    ? advancedMenu(
                        '编辑顶点',
                        <PptxFreeformControls
                          element={selectedObject}
                          target={objectTarget}
                          apply={applyPanelOp}
                        />,
                        selectedObject.presetGeometry || selectedObject.customGeometry
                          ? undefined
                          : '当前文本框没有形状轮廓；请先在形状库中设置形状，再编辑顶点',
                      )
                    : null,
              },
              {
                key: 'connector-endpoints',
                label: '连接线端点',
                tab: 'object',
                minWidth: 0,
                content:
                  selectedObject &&
                  objectTarget &&
                  /<(?:p:)?cxnSp\b/.test(selectedObject.anchor.originalXml)
                    ? advancedMenu(
                        '连接线端点',
                        <PptxConnectorControls
                          element={selectedObject}
                          elements={view.slides()[active]!.elements}
                          target={objectTarget}
                          apply={applyPanelOp}
                        />,
                      )
                    : null,
              },
              {
                key: 'object-main',
                label: '排列',
                tab: 'object',
                minWidth: 0,
                content: (
                  <ToolbarGroup label="对象排列">
                    <ToolbarButton
                      label="置于顶层"
                      disabled={objectTarget === null || objectOrder >= objectCount - 1}
                      disabledReason={objectTarget === null ? '先选中一个对象' : '对象已在顶层'}
                      onClick={() =>
                        objectTarget &&
                        void runManualOp({
                          op: 'reorderElement',
                          target: objectTarget,
                          dir: 'front',
                        })
                      }
                    >
                      置顶
                    </ToolbarButton>
                    <ToolbarButton
                      label="置于底层"
                      disabled={objectTarget === null || objectOrder <= 0}
                      disabledReason={objectTarget === null ? '先选中一个对象' : '对象已在底层'}
                      onClick={() =>
                        objectTarget &&
                        void runManualOp({
                          op: 'reorderElement',
                          target: objectTarget,
                          dir: 'back',
                        })
                      }
                    >
                      置底
                    </ToolbarButton>
                  </ToolbarGroup>
                ),
              },
              {
                key: 'object-box',
                label: '位置与大小',
                tab: 'object',
                minWidth: 0,
                content: objectBox ? (
                  <ToolbarGroup label="对象位置与大小">
                    <ToolbarNumberField
                      label="左"
                      disabled={editingBusy}
                      disabledReason="正在应用修改，请稍后重试"
                      value={Math.round(objectBox.x / 12700)}
                      onCommit={(value) => setObjectBox('x', value)}
                    />
                    <ToolbarNumberField
                      label="上"
                      disabled={editingBusy}
                      disabledReason="正在应用修改，请稍后重试"
                      value={Math.round(objectBox.y / 12700)}
                      onCommit={(value) => setObjectBox('y', value)}
                    />
                    <ToolbarNumberField
                      label="宽"
                      disabled={editingBusy}
                      disabledReason="正在应用修改，请稍后重试"
                      value={Math.round(objectBox.cx / 12700)}
                      min={1}
                      onCommit={(value) => setObjectBox('cx', value)}
                    />
                    <ToolbarNumberField
                      label="高"
                      disabled={editingBusy}
                      disabledReason="正在应用修改，请稍后重试"
                      value={Math.round(objectBox.cy / 12700)}
                      min={1}
                      onCommit={(value) => setObjectBox('cy', value)}
                    />
                  </ToolbarGroup>
                ) : null,
              },
              {
                key: 'object-extra',
                label: '属性与位置',
                tab: 'object',
                minWidth: 0,
                content: objectMenu,
              },
              {
                key: 'slides',
                label: '页面',
                tab: 'slide',
                minWidth: 0,
                content: (
                  <ToolbarGroup label="幻灯片操作">
                    <ToolbarButton label="新增幻灯片" onClick={() => insertPage(active)}>
                      新建
                    </ToolbarButton>
                    <ToolbarButton label="复制当前幻灯片" onClick={() => duplicatePage(active)}>
                      复制
                    </ToolbarButton>
                    <ToolbarConfirm
                      title="删除当前幻灯片？"
                      description="删除后可以通过不保存退出恢复。"
                      confirmLabel="删除幻灯片"
                      disabled={slideCount <= 1}
                      onConfirm={() => deletePage(active)}
                    >
                      <ToolbarButton
                        label="删除当前幻灯片"
                        disabled={slideCount <= 1}
                        disabledReason="至少保留一张幻灯片"
                      >
                        删除
                      </ToolbarButton>
                    </ToolbarConfirm>
                    <ToolbarButton
                      label={rendered.hidden ? '放映时显示本页' : '放映时隐藏本页'}
                      active={rendered.hidden}
                      onClick={() =>
                        void runManualOp({
                          op: 'setHidden',
                          target: { slide: active },
                          hidden: !rendered.hidden,
                        })
                      }
                    >
                      {rendered.hidden ? '显示' : '隐藏'}
                    </ToolbarButton>
                  </ToolbarGroup>
                ),
              },
              {
                key: 'page-layout',
                label: '尺寸与版式',
                tab: 'slide',
                minWidth: 0,
                content: advancedMenu(
                  '尺寸与版式',
                  <PptxPageControls
                    size={session.size}
                    slide={view.slides()[active]!}
                    index={active}
                    metadata={metadata}
                    apply={applyPanelOp}
                  />,
                ),
              },
              {
                key: 'deck-theme',
                label: '主题',
                tab: 'slide',
                minWidth: 0,
                content: advancedMenu(
                  '主题',
                  <PptxThemeControls metadata={metadata} apply={applyPanelOp} />,
                ),
              },
              {
                key: 'deck-footer',
                label: '页脚',
                tab: 'slide',
                minWidth: 0,
                content: advancedMenu(
                  '页脚与页码',
                  <PptxHeaderFooterControls slide={view.slides()[active]!} apply={applyPanelOp} />,
                ),
              },
              {
                key: 'deck-review',
                label: '分节与批注',
                tab: 'slide',
                minWidth: 0,
                content: (
                  <ToolbarGroup label="分节与批注">
                    {advancedMenu(
                      '分节与批注',
                      <PptxReviewControls
                        metadata={metadata}
                        index={active}
                        count={slideCount}
                        apply={applyPanelOp}
                      />,
                    )}
                    {advancedMenu(
                      '新建批注',
                      <PptxCommentControls
                        metadata={metadata}
                        index={active}
                        apply={applyPanelOp}
                        disabled={editingBusy}
                      />,
                    )}
                  </ToolbarGroup>
                ),
              },
              {
                key: 'presentation',
                label: '放映',
                tab: 'slide',
                minWidth: 0,
                content: (
                  <ToolbarGroup label="播放演示文稿">
                    <ToolbarButton
                      label="从头放映"
                      ref={fromStartTriggerRef}
                      onClick={() =>
                        startPresentation(
                          {
                            start: Math.max(
                              0,
                              view
                                .slides()
                                .findIndex((slide) => !/\bshow="0"/.test(slide.bodyPrefix)),
                            ),
                          },
                          fromStartTriggerRef.current,
                        )
                      }
                    >
                      从头放映
                    </ToolbarButton>
                    <ToolbarButton
                      label="从当前页放映"
                      ref={presentationTriggerRef}
                      onClick={() =>
                        startPresentation({ start: active }, presentationTriggerRef.current)
                      }
                    >
                      放映
                    </ToolbarButton>
                    <ToolbarButton
                      label="演讲者视图"
                      ref={presenterTriggerRef}
                      onClick={() =>
                        startPresentation(
                          { start: active, presenter: true },
                          presenterTriggerRef.current,
                        )
                      }
                    >
                      演讲者视图
                    </ToolbarButton>
                    <ToolbarButton
                      label="从头演讲者视图"
                      ref={presenterStartTriggerRef}
                      onClick={() =>
                        startPresentation(
                          {
                            start: Math.max(
                              0,
                              view
                                .slides()
                                .findIndex((slide) => !/\bshow="0"/.test(slide.bodyPrefix)),
                            ),
                            presenter: true,
                          },
                          presenterStartTriggerRef.current,
                        )
                      }
                    >
                      从头演讲
                    </ToolbarButton>
                    {advancedMenu(
                      '自定义放映与排练',
                      <PptxShowControls
                        documentId={documentId}
                        slides={view.slides()}
                        version={panelVersion}
                        pending={editingBusy}
                        rehearsal={rehearsal?.documentId === documentId ? rehearsal.result : null}
                        onDismissRehearsal={() => setRehearsal(null)}
                        onStart={startPresentation}
                        apply={applyPanelOps}
                      />,
                    )}
                  </ToolbarGroup>
                ),
              },
              {
                key: 'zoom-navigation',
                label: '缩放导航',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '缩放导航',
                  <PptxZoomControls
                    deck={view}
                    sections={metadata.sections}
                    slideIndex={active}
                    version={panelVersion}
                    disabled={editingBusy}
                    applyZoom={async (input, signal) => {
                      if (
                        signal.aborted ||
                        activeRef.current !== active ||
                        session.version() !== panelVersion
                      ) {
                        setPageError('画布已变化，请重新打开缩放导航')
                        return false
                      }
                      const applied = await runManualTool('manual_zoom', input, {
                        expectedVersion: panelVersion,
                        signal,
                      })
                      if (
                        applied &&
                        input.mode === 'summary' &&
                        activeRef.current === active &&
                        session.version() === panelVersion + 1 &&
                        agentHandleRef.current?.documentId === documentId
                      ) {
                        setActive(Math.min(...input.targets.map((target) => target.slide)))
                        setSelected(null)
                      }
                      return applied
                    }}
                  />,
                ),
              },
              {
                key: 'playback',
                label: '备注与放映',
                tab: 'slide',
                minWidth: 0,
                content: advancedMenu(
                  '备注与放映',
                  <SlidePlaybackControls
                    key={`${documentId}:${active}:${selected}:${session.version()}`}
                    initialSection={
                      playbackSection?.documentId === documentId ? playbackSection.value : 'effects'
                    }
                    onSectionChange={(value) => setPlaybackSection({ documentId, value })}
                    editTiming={(patch) => runManualTool('edit_animation', patch)}
                    editStyle={async (input) => (await runClipboard(input)) !== null}
                    slide={view.slides()[active]!}
                    index={active}
                    notes={session.notes(active)}
                    slideCount={slideCount}
                    previewing={
                      inspector === '备注与放映' &&
                      animationPreview?.version === panelVersion &&
                      animationPreview.selected === selected &&
                      animationPreview.path === view.slides()[active]!.path
                    }
                    applyBatch={(ops) => runManualTool('apply_ops', { ops })}
                    applyAnimation={(input, signal) =>
                      runManualTool('manual_animation', input, {
                        expectedVersion: panelVersion,
                        signal,
                      })
                    }
                    onPreview={(request) =>
                      setAnimationPreview(
                        request
                          ? {
                              documentId,
                              path: view.slides()[active]!.path,
                              version: panelVersion,
                              selected,
                              request,
                            }
                          : null,
                      )
                    }
                    target={objectTarget}
                    apply={runManualOp}
                  />,
                ),
              },
              {
                key: 'icons',
                label: '图标',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '图标',
                  <PptxIconControls
                    slide={active}
                    upload={applyPanelAsset}
                    sourceKey={`${documentId}:${view.slides()[active]!.path}`}
                    version={panelVersion}
                    disabled={editingBusy}
                    onCancel={closeInspector}
                  />,
                ),
              },
              {
                key: 'cutout',
                label: '图片去背景',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '图片去背景',
                  selectedObject?.type === 'picture' && objectTarget ? (
                    <PptxCutoutControls
                      slide={active}
                      elementId={objectTarget.el}
                      source={
                        view.media.get(selectedObject.mediaRef) ?? selectedObject.dataUrl ?? ''
                      }
                      upload={applyPanelAsset}
                    />
                  ) : null,
                  selectedObject?.type !== 'picture' || selectedObject.media
                    ? '请选择普通图片；音视频封面不支持去背景'
                    : undefined,
                ),
              },
              {
                key: 'model3d',
                label: '3D 模型',
                tab: 'insert',
                minWidth: 0,
                content: advancedMenu(
                  '3D 模型',
                  <PptxModelControls slide={active} upload={applyPanelAsset} />,
                ),
              },
              {
                key: 'model3d-preview',
                label: '3D 预览',
                tab: 'object',
                minWidth: 0,
                content: advancedMenu(
                  '3D 预览',
                  selectedObject?.descr?.startsWith('aislides-3d:') ? (
                    <PptxModelControls
                      slide={active}
                      upload={applyPanelAsset}
                      existing={{
                        bytes:
                          session.mediaPart(selectedObject.descr.slice('aislides-3d:'.length)) ??
                          new Uint8Array(),
                        name: '模型.glb',
                      }}
                    />
                  ) : null,
                  selectedObject?.descr?.startsWith('aislides-3d:')
                    ? undefined
                    : '请选择已嵌入的 3D 模型',
                ),
              },
              {
                key: 'master-edit',
                label: '母版编辑',
                tab: 'view',
                minWidth: 0,
                content: advancedMenu('母版编辑', <PptxMasterControls execute={runClipboard} />),
              },
              {
                key: 'output',
                label: '导出与打印',
                tab: 'view',
                minWidth: 0,
                content: advancedMenu(
                  '导出与打印',
                  <PptxOutputControls
                    deck={view}
                    active={active}
                    documentId={documentId}
                    version={panelVersion}
                    notes={(index) => session.notes(index)}
                    isCurrent={() =>
                      agentHandleRef.current?.documentId === documentId &&
                      agentHandleRef.current?.getVersion() === panelVersion
                    }
                    saveCopy={async ({ signal }) => {
                      const handle = agentHandleRef.current
                      const bytes = await withManualWrite(async () => {
                        signal.throwIfAborted()
                        if (
                          !handle ||
                          handle.documentId !== documentId ||
                          session.version() !== panelVersion
                        )
                          throw new Error('文稿已变化，请重新打开导出与打印')
                        const result = await session.save()
                        signal.throwIfAborted()
                        if (agentHandleRef.current !== handle || session.version() !== panelVersion)
                          throw new Error('文稿已变化，请重新打开导出与打印')
                        return result
                      }, '正在生成 PPTX 副本…')
                      if (!bytes) throw new Error('正在处理文档，请稍后重试')
                      return bytes
                    }}
                  />,
                ),
              },
              {
                key: 'workspace-view',
                label: '演示文稿视图',
                tab: 'view',
                minWidth: 0,
                content: (
                  <PptxWorkspaceModeControls mode={workspaceMode} change={changeWorkspaceMode} />
                ),
              },
              {
                key: 'canvas-view',
                label: '画布视图',
                tab: 'view',
                minWidth: 0,
                content: <PptxViewControls value={viewSettings} change={setViewSettings} />,
              },
              {
                key: 'view',
                label: '查找',
                tab: 'view',
                minWidth: 0,
                content: (
                  <ToolbarButton label="查找和替换" active={findOpen} onClick={toggleFind}>
                    <FindIcon />
                  </ToolbarButton>
                ),
              },
            ]}
          />
        }
        /*
        次工具条：幻灯片导航 + 查找栏。

        **导航挪到这里**（原先在工具条上）：页签的数量跟着页数长，30 页的演示
        文稿会把工具条挤成好几行；而次工具条是真正吸顶的那一层，`.me-tabs` 自己
        横滚（`overflow-x: auto` 让它的自动最小宽度是 0），窄窗口下也不会撑破外壳。
      */
        subbar={
          <>
            <ToolbarGroup label="翻页">
              <ToolbarButton
                label="上一页"
                disabled={active === 0}
                disabledReason="已经是第一页"
                onClick={() => goTo(active - 1)}
              >
                <ChevronLeftIcon />
              </ToolbarButton>
              <ToolbarButton
                label="下一页"
                disabled={active >= slideCount - 1}
                disabledReason="已经是最后一页"
                onClick={() => goTo(active + 1)}
              >
                <ChevronRightIcon />
              </ToolbarButton>
              {/* 跳到第 N 页：取值是 1..页数，页数打开文件才知道，所以是输入框不是下拉 */}
              <ToolbarNumberField
                label="跳到第几页"
                value={active + 1}
                min={1}
                max={slideCount}
                suffix="页"
                onCommit={(next) => goTo(next - 1)}
              />
            </ToolbarGroup>

            {slideCount > 1 && (
              <ToolbarTabs
                label="幻灯片"
                value={active}
                onChange={goTo}
                items={Array.from({ length: slideCount }, (_, i) => ({
                  value: i,
                  label: `${i + 1}`,
                }))}
              />
            )}

            <ToolbarButton
              label="打开对象选择与格式"
              ref={selectionInspectorTriggerRef}
              active={inspector === '对象选择与格式'}
              onClick={() => {
                const trigger = selectionInspectorTriggerRef.current
                if (trigger) inspectorTriggers.current.set('对象选择与格式', trigger)
                assetAbort.current?.abort()
                cancelClarification.current?.()
                setInspector('对象选择与格式')
              }}
            >
              {selectedContexts.length ? `已选 ${selectedContexts.length} 个对象` : '选择对象'}
            </ToolbarButton>
            {/* 放映隐藏状态由同一宿主操作写回 slide 的 show 属性。 */}
            {rendered.hidden && (
              <ToolbarLabel>
                <EyeIcon /> 这一页在放映时隐藏
              </ToolbarLabel>
            )}

            {findOpen && (
              <FindReplaceBar
                adapter={findAdapter}
                query={findQuery}
                onQueryChange={setFindQuery}
                options={findOptions}
                onOptionsChange={setFindOptions}
                onClose={toggleFind}
              />
            )}
          </>
        }
        footer={
          selected && selectedText ? (
            <PptxTextRangeEditor
              paragraphs={selectedText.paragraphs}
              targetKey={textTargetKey}
              version={viewVersion}
              disabled={editingBusy}
              selection={textSelection}
              pendingFormat={pendingFormat}
              onSelectionChange={selectTextRange}
              onEdit={editTextRange}
            />
          ) : undefined
        }
        status={
          <>
            <ToolbarLabel>{status}</ToolbarLabel>
            {dirty && (
              <ToolbarLabel>
                第 {active + 1} / {slideCount} 页
              </ToolbarLabel>
            )}
            {!inspector && pageError && <ToolbarNotice>{pageError}</ToolbarNotice>}
            {!inspector && !pageError && pageStatus && <span role="status">{pageStatus}</span>}
            {/*
            缺几何的文本框如实说明（DESIGN §0.2）。**这一条不是可选的**：那些
            框是按幻灯片比例补出来的（`pptx-render.ts` 的 `withFallbackGeometry`），
            用户看到的版式不是文件里的版式——不说的话他会以为这就是原件的样子，
            然后在 PowerPoint 里发现位置完全不同。短句，理由与下面那条相同。
          */}
            {rendered.geometryFilled > 0 && (
              <ToolbarLabel>
                {rendered.geometryFilled} 个文本框在文件里没有几何，按默认框渲染
              </ToolbarLabel>
            )}
          </>
        }
      >
        <div className="mimir-pptx-workspace">
          <PptxClipboardBridge
            canvasRef={canvasRef}
            contextKey={`${documentId}:${selectedSlide?.path}:${viewVersion}:${selectionBinding}`}
            slide={active}
            disabled={editingBusy}
            copyInput={(cut, slides) =>
              slides?.length
                ? { kind: cut ? 'cut_slides' : 'copy_slides', slides: [...slides] }
                : selectedRefs.length
                  ? {
                      kind: cut ? 'cut_elements' : 'copy_elements',
                      slide: active,
                      targets: pptxClipboardTargets(selectedSlide?.elements ?? [], selectedRefs),
                    }
                  : { kind: cut ? 'cut_slide' : 'copy_slide', slide: active }
            }
            execute={runClipboard}
            insertImage={
              hostAsset
                ? (file, signal, center) =>
                    applyLocalAsset(
                      {
                        kind: 'picture',
                        slide: active,
                        widthPt: 72,
                        keepCrop: false,
                        naturalSize: true,
                        ...(center ? { center } : {}),
                      },
                      file,
                      undefined,
                      signal,
                    )
                : undefined
            }
            onError={setPageError}
          />
          <PptxWorkspaceViews
            key={`${documentId}:${workspaceMode}`}
            mode={workspaceMode}
            deck={view}
            active={active}
            busy={editingBusy}
            onSelect={goTo}
            onMode={changeWorkspaceMode}
            onReorder={reorderWorkspaceSlides}
            normal={
              <ThumbnailSidebar
                pages={thumbnailPages}
                activeIndex={active}
                noun="幻灯片"
                onSelect={goTo}
                onInsert={insertPage}
                onDuplicate={duplicatePage}
                onDelete={deletePage}
                onMove={movePage}
                renderThumbnail={(index) => <PptxThumbnail deck={view} index={index} />}
              >
                {workspaceStage}
              </ThumbnailSidebar>
            }
          >
            {workspaceStage}
          </PptxWorkspaceViews>
          {deckWritingDraft && (
            <PptxDeckWritingPreview draft={deckWritingDraft} focusFallback={canvasRef} />
          )}
          {!deckWritingDraft && inspector && (
            <aside
              ref={inspectorRef}
              tabIndex={-1}
              className="mimir-pptx-inspector"
              aria-label={`${inspector}面板`}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !event.defaultPrevented) {
                  event.stopPropagation()
                  closeInspector()
                }
              }}
            >
              <div className="mimir-pptx-inspector__head">
                <h2>{inspector}</h2>
                <ToolbarButton label="关闭幻灯片属性面板" onClick={closeInspector}>
                  关闭
                </ToolbarButton>
              </div>
              <div
                className="mimir-pptx-inspector__body"
                data-panel={inspector}
                key={
                  inspector === '对象选择与格式'
                    ? `${active}:selection`
                    : inspector === '新建批注'
                      ? `${documentId}:${selectedSlide?.path}:comments`
                      : inspector === '形状库'
                        ? `${active}:shape-library`
                        : inspector === '设置背景'
                          ? `${active}:background`
                          : inspector === '编辑表格' ||
                              inspector === '形状填充' ||
                              inspector === '段落与文本框'
                            ? `${active}:${objectTarget?.el ?? selected}`
                            : panelKey
                }
              >
                {inspectorPanels[inspector]}
                {pageError && <ToolbarNotice>{pageError}</ToolbarNotice>}
                {!pageError && pageStatus && <span role="status">{pageStatus}</span>}
              </div>
            </aside>
          )}
        </div>
      </EditorShell>
      {presentation?.documentId === documentId && (
        <PptxPresentation
          session={session}
          start={presentation.start}
          slideIndices={presentation.slideIndices}
          rehearse={presentation.rehearse}
          onRehearsal={(result) => {
            setRehearsal({ documentId, result })
            setInspector('自定义放映与排练')
          }}
          presenter={presentation.mode === 'presenter'}
          triggerRef={presentationReturnRef}
          onClose={() => setPresentation(null)}
        />
      )}
    </>
  )
}
