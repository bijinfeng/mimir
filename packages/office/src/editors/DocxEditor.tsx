/**
 * docx 的原件编辑器。
 *
 * ## 一条路：vendored 引擎 + 补丁式保存
 *
 * 1. 宿主给原件字节（`io.load`）
 * 2. vendored 的 GenOffice 引擎解析 → ProseMirror 文档 → Tiptap 渲染
 * 3. 用户编辑 → `pmDocToSavePlan` 生成补丁 → **只把改动的块写回**
 * 4. 新字节交回宿主（`io.save`），服务端重算正文与哈希
 *
 * 第 3 步是关键：补丁式保存让「改两个字」不会重排整篇 XML，因此不会丢掉
 * Word 文档里那些我们没建模的东西（域代码、修订标记、OLE 对象）。
 * 实测（`packages/office/src/docx.test.ts`）：原样保存 zip 条目逐字节相同；
 * 改一段只有 `word/document.xml` 变化。
 *
 * ## 工具栏为什么常驻顶栏
 *
 * 笔记编辑器（`InlineToolbar`）用气泡菜单——跟随选区，适合「写完再调格式」。
 * Word 的习惯是**顶栏常驻**：Office 文档的格式是边写边调的，而且要能一眼
 * 看到光标处当前的格式状态。用气泡的话每次都要先选中才看得到工具。
 *
 * ## 命令必须用 `toggleMark('bold')` 而不是 `toggleBold()`
 *
 * **踩过**：`toggleBold()` 这些是 `@tiptap/extension-bold` 之类的扩展提供的
 * 便捷命令，而 vendored 的编辑器没有用那些扩展——它自己定义了
 * `Mark.create({ name: 'bold' })`，只注册了 `commands.toggleMark('bold')`。
 * 所以调 `toggleBold()` 是**静默无效**：命令不存在，`chain()` 照样返回成功，
 * 只是什么都不做。实测症状是「点了加粗，没有反应，也不报错」。
 *
 * 于是这个文件里的每一个动作都走 `editor-commands.ts` 的
 * `hasMark` / `hasNode` / `runCommand`：**先问命令在不在，再调**。
 *
 * ## 列表：不能调 `toggleList`，要自己改节点
 *
 * 这份编辑器的列表**不是标准的「listItem 嵌在 bulletList 里」结构**，
 * 而是扁平的块节点 `docListItem`（带 `kind` 与 `numId`，对应 docx 真实的
 * 「段落 + `w:numPr`」形状）。所以 `toggleList('bulletList', 'listItem')`
 * 在这里没有对应节点，调了无效，正确做法是改节点类型与属性。
 *
 * `numId` 沿用文档里已有的同类列表（新建编号定义要写 `numbering.xml`，
 * 那件事在保存路径上，本版没做）。
 *
 * ## 「引用」是直接段落格式，不是 Word 的样式
 *
 * 上游的样式画廊写 `styleId`（`w:pStyle`），而**按 styleId 的 CSS 来自
 * `doc-style-css.ts`——那个文件没有 vendored**（它跟着上游的 App 壳，
 * 样式表由它在运行时注入）。所以在这里写 `styleId='Quote'` 的结果是：
 * 文件里多了一个 `w:pStyle`，画布上**一个字都不变**——正是这个仓库最不
 * 接受的那类静默失效。
 *
 * 所以「引用」落成**直接段落格式**：左缩进 0.25 英寸 + 左侧一条 2pt 边线
 * （颜色 `BFBFBF`）。它们三个都在 schema 里、画布会画（`extensions.ts` 的
 * `blockAttrs` 读 `indentLeft`/`borders`）、保存会写
 * （`generate.ts:1211-1239` 的 `w:pBdr` / `w:ind`）——而 `清除格式` 清的正是
 * 这几项，所以它可进可出。取舍见 `.trellis/spec/project/decisions.md` D-062。
 *
 * 同理**不提供**「表格样式」（`tblStyleId`）与「六边」（`tblLook`）：那两个
 * 属性在画布上只渲染成 `data-tbl-style`（没有规则命中它），改了也是只改 XML。
 *
 * ## 数字的单位
 *
 * 段落格式在 OOXML 里是 **twips**（1 磅 = 20 twips），字号是**半磅**
 * （1 磅 = 2 半磅），列宽也是 twips。工具条一律**显示磅**，进出各换算一次——
 * 存进去的单位不对不会报错，只会在 Word 里变成离谱的间距。
 */

import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import type { Mark } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import {
  CellSelection,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  mergeCells,
  selectedRect,
  setCellAttr,
  splitCell,
  type TableRect,
} from '@tiptap/pm/tables'
import {
  editorExtensions,
  HIGHLIGHT_CSS,
} from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { tableModelToPmNode } from '../../vendor/apps/docs/src/renderer/editor/convert.js'
import {
  setParagraphDirection,
  setSelectionAlign,
} from '../../vendor/apps/docs/src/renderer/editor/direction.js'
import { moveBlocks } from '../../vendor/apps/docs/src/renderer/editor/move-block.js'
import { insertPageBreak } from '../../vendor/apps/docs/src/renderer/editor/page-break.js'
import {
  acceptAllRevisions,
  acceptCurrentRevision,
  collectRevisions,
  gotoRevision,
  rejectAllRevisions,
  rejectCurrentRevision,
} from '../../vendor/apps/docs/src/renderer/editor/revisions.js'
import {
  fontFamiliesFor,
  isEastAsianFontName,
} from '../../vendor/apps/docs/src/renderer/font-list.js'
import type { SectionInfo } from '../../vendor/packages/docx-engine/src/types.js'
import { openDocx, type DocxSession } from '../docx.js'
import { usePagination } from '../pagination.js'
import {
  effectiveBottomPx,
  effectiveTopPx,
  paperWidthPx,
  sectionPageBox,
} from '../../vendor/apps/docs/src/renderer/pagination-sections.js'
import {
  EditorShell,
  EditorState as EditorStateBlock,
  FindReplaceBar,
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarFileButton,
  ToolbarGridPicker,
  ToolbarGroup,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarMenuItemRow,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarMenuSeparator,
  ToolbarNotice,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextField,
  ToolbarToggleGroup,
  useFindHotkey,
  useToolbarState,
  type ToolbarColorOption,
  type ToolbarMenuItem,
  type ToolbarSelectOption,
} from '../shell/EditorShell.js'
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BoldIcon,
  BulletListIcon,
  ClearFormatIcon,
  FindIcon,
  FontGrowIcon,
  FontShrinkIcon,
  HighlightIcon,
  ImageIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  LtrIcon,
  OrderedListIcon,
  OutdentIcon,
  PageBreakIcon,
  ParaShadingIcon,
  PaintFormatIcon,
  RedoIcon,
  RtlIcon,
  SaveIcon,
  SpellCheckIcon,
  StrikeIcon,
  SubscriptIcon,
  SuperscriptIcon,
  TableIcon,
  TextColorIcon,
  TrackChangesIcon,
  UnderlineIcon,
  UndoIcon,
} from '../shell/icons.js'
import { hasNode, runCommand, toggleMarkByName } from '../shell/editor-commands.js'
import { docxFindAdapter } from './docx-find.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import {
  createDocxAgentHandle,
  docxAgentLiveSections,
  type DocxAgentHandle,
} from '../agent/docx-agent.js'
import type { SaveOptions as DocxSaveOptions } from '../../vendor/packages/docx-engine/src/patch.js'
import type { FindOptions } from '../shims/ui.js'
import '../shell/shell.css'
// 编辑器样式：从 vendored 的整份办公壳样式里裁出的「编辑器 + 纸张排版」部分
// （见 packages/office/scripts/trim-editor-css.mjs）。字体是分页保真的前提
// ——缺了 metric-compatible 字体，浏览器会静默回退，换行与分页整体错位
import '../generated/editor.css'
import '../../vendor/apps/docs/src/renderer/fonts/fonts.css'
// 查找高亮那条 `.search-hit` 补在这里（`trim-editor-css.mjs` 会裁掉上游那份，
// 而它的配色来自未 vendored 的 App 壳变量）
import './editors.css'

/** 文档未加载时的空分段（模块级常量：保证 hook 的依赖引用稳定） */
const NO_SECTIONS: SectionInfo[] = []
/** 文档没有标题样式时的空级别表（同上：引用要稳定） */
const NO_LEVELS: readonly number[] = []

/** 带可逆编号的段落块。**顺序就是「谁更具体」**——判定当前块类型时先查前面的 */
const PARA_NODE_TYPES = ['docHeading', 'docListItem', 'docParagraph'] as const
type ParaNodeName = (typeof PARA_NODE_TYPES)[number]

/** 插图后不超过正文宽度（上游 Ribbon 的同一个常量：US Letter 的正文宽） */
const MAX_IMAGE_WIDTH_PX = 620

/** 1 磅 = 20 twips（OOXML 的长度单位）。**换算只在这两个函数里** */
const ptToTwips = (pt: number): number => Math.round(pt * 20)
const twipsToPt = (twips: number | null): number | null => (twips === null ? null : twips / 20)

/** 1 磅 = 2 半磅（w:sz 的单位） */
const halfPointsToPt = (half: number): number => half / 2

/**
 * 字号档位，**半磅**。
 *
 * 21 档照上游 `Ribbon.tsx:418` 的预设列表（5 / 5.5 / 6.5 … 48 / 72 磅）——
 * 那是 Word 的预设字号表，用户在这里看到的就是 Word 里熟悉的那串数字。
 */
const FONT_SIZES_HALF_POINTS = [
  10, 11, 13, 15, 16, 18, 20, 21, 22, 24, 28, 32, 36, 40, 44, 48, 52, 56, 72, 96, 144,
] as const

/** 行距倍数，照上游 `Ribbon.tsx:514` */
const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3] as const

/** 缩进/制表步长：半英寸（上游 `ops.ts:657` 的 INDENT_STEP） */
const INDENT_STEP_TWIPS = 720

/* ── 颜色 ─────────────────────────────────────────────────────── */

/** 字体颜色。`w:color` 收的是十六进制，写错色名 Word 会当没看见 */
const TEXT_COLORS: readonly ToolbarColorOption[] = [
  { value: '000000', label: '黑色', swatch: '#000000' },
  { value: '404040', label: '深灰', swatch: '#404040' },
  { value: '808080', label: '灰色', swatch: '#808080' },
  { value: 'BFBFBF', label: '浅灰', swatch: '#BFBFBF' },
  { value: 'C00000', label: '深红', swatch: '#C00000' },
  { value: 'FF0000', label: '红色', swatch: '#FF0000' },
  { value: 'ED7D31', label: '橙色', swatch: '#ED7D31' },
  { value: 'FFC000', label: '琥珀', swatch: '#FFC000' },
  { value: 'FFFF00', label: '黄色', swatch: '#FFFF00' },
  { value: '70AD47', label: '绿色', swatch: '#70AD47' },
  { value: '00B050', label: '亮绿', swatch: '#00B050' },
  { value: '4472C4', label: '蓝色', swatch: '#4472C4' },
  { value: '1F4E79', label: '深蓝', swatch: '#1F4E79' },
  { value: '7030A0', label: '紫色', swatch: '#7030A0' },
  { value: 'FFFFFF', label: '白色', swatch: '#FFFFFF' },
]

/**
 * 突出显示。**值必须是 OOXML 的那 16 个色名**（`marks.ts:233` 的
 * `HIGHLIGHT_CSS`）——`w:highlight` 只收名字，写一个十六进制进去 Word 会
 * 静默忽略整条属性。所以这里把 `value`（存储）与 `swatch`（显示）分开：
 * 直接从 `HIGHLIGHT_CSS` 取，色名与色值不可能写岔。
 */
const HIGHLIGHT_COLORS: readonly ToolbarColorOption[] = (
  [
    ['yellow', '黄色'],
    ['green', '绿色'],
    ['cyan', '青色'],
    ['magenta', '品红'],
    ['blue', '蓝色'],
    ['red', '红色'],
    ['darkBlue', '深蓝'],
    ['darkCyan', '深青'],
    ['darkGreen', '深绿'],
    ['darkMagenta', '深品红'],
    ['darkRed', '深红'],
    ['darkYellow', '深黄'],
    ['darkGray', '深灰'],
    ['lightGray', '浅灰'],
    ['black', '黑色'],
    ['white', '白色'],
  ] as const
).flatMap(([value, label]) => {
  const swatch = HIGHLIGHT_CSS[value]
  return swatch === undefined ? [] : [{ value, label, swatch }]
})

/**
 * 段落底纹（`w:shd w:fill`）。
 *
 * **与突出显示是两条路**：那个是 `w:highlight`（画在字后面、永远不打印背景
 * 之外的东西），这个是段落背景。同一个浅色在两个色板里都有，但存进文件的是
 * 完全不同的两个属性——所以是两个取色器，不是同一个的两种称呼。
 */
const SHADING_COLORS: readonly ToolbarColorOption[] = [
  { value: 'F2F2F2', label: '浅灰', swatch: '#F2F2F2' },
  { value: 'E7E6E6', label: '灰', swatch: '#E7E6E6' },
  { value: 'DEEAF6', label: '浅蓝', swatch: '#DEEAF6' },
  { value: 'E2EFDA', label: '浅绿', swatch: '#E2EFDA' },
  { value: 'FFF2CC', label: '浅黄', swatch: '#FFF2CC' },
  { value: 'FCE4E4', label: '浅红', swatch: '#FCE4E4' },
  { value: 'EDE7F6', label: '浅紫', swatch: '#EDE7F6' },
]

/** 单元格底纹（`w:tcPr/w:shd`）。几个常用的浅色 + 一个清除 */
const CELL_FILLS: readonly ToolbarColorOption[] = [
  { value: 'DEEAF6', label: '浅蓝', swatch: '#DEEAF6' },
  { value: 'E2EFDA', label: '浅绿', swatch: '#E2EFDA' },
  { value: 'FFF2CC', label: '浅黄', swatch: '#FFF2CC' },
  { value: 'F2F2F2', label: '浅灰', swatch: '#F2F2F2' },
]

/* ── 「引用」那三个属性 ────────────────────────────────────────── */

/** 左缩进半英寸的一半（0.25 英寸）：Word 的引用块就是这样往里让一格 */
const QUOTE_INDENT_TWIPS = 360
/** 左侧那条线：2 磅 `BFBFBF`。`paraBorderCss` 会把它画成约 2.7px（DESIGN §4 的「左侧 3px 边框」） */
const QUOTE_BORDER_LINES = JSON.stringify({ l: { color: 'BFBFBF', szPt: 2, spacePt: 12 } })

/** 引用段落的完整属性（判定与写入共用一份，两边不可能写岔） */
const QUOTE_ATTRS = {
  borders: 'l',
  borderLines: QUOTE_BORDER_LINES,
  indentLeft: QUOTE_INDENT_TWIPS,
} as const

/**
 * 「引用」是不是这个段落**当前**的样子。
 *
 * 三个判据与 `QUOTE_ATTRS` 一一对应。`borderLines` 是 JSON 字符串，所以
 * **比解析后的值**而不是比字符串：重新打开文档后那串 JSON 的键顺序由解析
 * 侧决定，字符串比较会在「明明还是引用」的段落上判否——下拉于是显示成
 * 「自定义」。那是诚实的（不冒充），但它其实是错的，而错的显示不如不显示。
 */
function isQuoteParagraph(attrs: Record<string, unknown>): boolean {
  if (attrs.borders !== QUOTE_ATTRS.borders) return false
  if (Number(attrs.indentLeft) !== QUOTE_INDENT_TWIPS) return false
  const raw = attrs.borderLines
  if (typeof raw !== 'string') return false
  try {
    const line = (JSON.parse(raw) as { l?: { color?: unknown; szPt?: unknown; spacePt?: unknown } })
      .l
    return line?.color === 'BFBFBF' && Number(line.szPt) === 2
  } catch {
    return false
  }
}

/**
 * 「清除格式」要抹掉的段落属性。
 *
 * 这份清单比「上游 Ctrl+Q 那份」短，是**有意**的：
 *
 *  - 每一项都必须是**这个工具条能写进去的**——不然按了没反应的按钮会换成
 *    「按了清不掉的格式」。`lineRule` / `lineRawTwips`（固定行距菜单）与
 *    `shadingDisplay`（段落底纹的显示层）、`borderLines`（引用的线色）
 *    都属于这一类，漏掉任何一个都会留下看得见的残迹。
 *  - **不含 `pageBreakBefore`**：正文里的分页符就是它（`page-break.ts` 在
 *    段首只打这个属性、不插字符），清掉它等于把用户插的分页符删了，而隔着
 *    几屏根本看不出来。它归「插入」，不归「格式」。
 *  - 不含 `caps` / `charSpacingTwips` 那批：它们在 schema 里是
 *    `rendered: false` 的透传属性，模板里改了保存不下去（见 D-062）。
 */
const CLEARED_PARA_ATTRS: Record<string, null> = {
  align: null,
  indentLeft: null,
  indentRight: null,
  indentFirstLine: null,
  spaceBefore: null,
  spaceAfter: null,
  lineSpacing: null,
  lineRule: null,
  lineRawTwips: null,
  shadingFill: null,
  shadingDisplay: null,
  borders: null,
  borderLines: null,
}

/** 格式刷搬运的标记类型（上游 `Ribbon.tsx:283`）。语义类标记（链接、批注、修订、域）不搬 */
const PAINTER_MARK_TYPES = ['bold', 'italic', 'underline', 'strike', 'docTextStyle'] as const

/**
 * 格式刷举起的源格式。
 *
 * **不能只取 `$from.marks()`**：ProseMirror 的 `ResolvedPos.marks()` 在位置
 * 正好压在两个节点的边界上时（`textOffset === 0`），取的是**前一个节点**的
 * marks。于是「源选区起点正好是格式区间起点」——加粗字前面有个没加粗的字，
 * 选区从加粗字开始——它返回**空**：刷子以空格式举起，往目标上一点反而把
 * 目标的格式抹掉。实测：选区 `{from:2,to:6}` 起点压在加粗区间起点上，
 * `$from.marks()` 为 `[]`，而选区里的文字全是加粗。
 *
 * 修法与上游 `Ribbon.tsx` 相同：取**选区区间里第一个文本节点**的 marks——
 * 起点正好是格式起点时，第一个文本节点就是带格式的那一个。空选区（没选中
 * 文字就举起）与区间里没有文本节点（选中了纯原子块）两个场景退回
 * `$from.marks()`，那是它唯一说得通的用法。
 */
function painterSourceMarks(editor: Editor): readonly Mark[] {
  const { from, to, empty, $from } = editor.state.selection
  if (empty) return $from.marks()
  let found: readonly Mark[] | null = null
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (found !== null) return false
    if (node.isText) {
      found = node.marks
      return false
    }
    return true
  })
  return found ?? $from.marks()
}

/** 工具条强制重读一次「不在编辑器状态里」的东西时用的 meta（见 `refreshToolbar`） */
const TOOLBAR_REFRESH = 'docxToolbarRefresh'

/* ── 字体候选 ─────────────────────────────────────────────────── */

/**
 * 候选字体。**东亚与西文两个下拉分开**，因为它们是**两个不同的槽位**：
 * `w:rFonts` 的 `w:eastAsia` 与 `w:ascii`/`w:hAnsi`。合成一个下拉的话，
 * 选一次中文字体会把西文字体一起冲掉（反过来也一样）——Word 里这两个是
 * 分开设的，正是为了避免这件事。
 */
const FONT_CANDIDATES = fontFamiliesFor('zh')
const EAST_ASIA_FONTS: readonly string[] = [
  ...new Set(FONT_CANDIDATES.filter((name) => isEastAsianFontName(name))),
]
const LATIN_FONTS: readonly string[] = [
  ...new Set(FONT_CANDIDATES.filter((name) => !isEastAsianFontName(name))),
]

/** 下拉的第一项永远是「（默认）」：它写 `null`，也就是回到样式/文档默认 */
const DEFAULT_FONT_OPTION = { value: '', label: '（默认）' }
const fontOptions = (names: readonly string[]): ToolbarSelectOption<string>[] => [
  DEFAULT_FONT_OPTION,
  ...names.map((name) => ({ value: name, label: name })),
]

/* ── 只读快照 ─────────────────────────────────────────────────── */

/**
 * 工具条要显示的全部状态。
 *
 * **一个对象在一个 selector 里算完**（而不是每个按钮各订阅一次）：一次事务只
 * 走一遍，而且按钮之间不会出现「这一帧我亮、你灭」的中间态。序列化成字符串
 * 交给 `useToolbarState`——它按值比较，字符串最省也最不容易出意外。
 */
interface DocxSnapshot {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  superscript: boolean
  subscript: boolean
  color: string | null
  highlight: string | null
  font: string | null
  fontAscii: string | null
  sizeHalfPoints: number | null
  style: string
  align: string
  bidi: boolean
  lineSpacing: number | null
  spaceBefore: number | null
  spaceAfter: number | null
  indentLeft: number | null
  indentRight: number | null
  indentFirstLine: number | null
  lineRule: string | null
  lineRawTwips: number | null
  shadingFill: string | null
  link: string | null
  listKind: string | null
  ilvl: number
  inTable: boolean
  canUndo: boolean
  canRedo: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  trackChanges: boolean
  spellcheck: boolean
}

/** 编辑器还没就绪时的空快照（形状必须与 `readSnapshot` 完全一致） */
const EMPTY_SNAPSHOT: DocxSnapshot = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  superscript: false,
  subscript: false,
  color: null,
  highlight: null,
  font: null,
  fontAscii: null,
  sizeHalfPoints: null,
  style: 'p',
  align: 'left',
  bidi: false,
  lineSpacing: null,
  spaceBefore: null,
  spaceAfter: null,
  indentLeft: null,
  indentRight: null,
  indentFirstLine: null,
  lineRule: null,
  lineRawTwips: null,
  shadingFill: null,
  link: null,
  listKind: null,
  ilvl: 0,
  inTable: false,
  canUndo: false,
  canRedo: false,
  canMoveUp: false,
  canMoveDown: false,
  trackChanges: false,
  spellcheck: false,
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** 光标所在块的三种段落类型里最具体的那个 */
function paraNodeName(editor: Editor): ParaNodeName {
  for (const name of PARA_NODE_TYPES) if (editor.isActive(name)) return name
  return 'docParagraph'
}

/** 光标所在段落的属性（三种段落类型共用一套 `anchorAttrs`） */
function paraAttrs(editor: Editor): Record<string, unknown> {
  return editor.getAttributes(paraNodeName(editor))
}

/**
 * 「上移/下移」现在能不能做。
 *
 * 判据与 `moveBlocks`（`move-block.ts:14`）内部那一段**逐字对应**：可移动的
 * 是整块，而选区可能横跨好几块，末端正好落在块首时那一块不算在内。不这么算
 * 的话按钮会在「文档的第一段上」亮着，点下去什么都不发生。
 */
function moveRange(editor: Editor): { first: number; last: number } {
  const { doc, selection } = editor.state
  const first = doc.resolve(selection.from).index(0)
  const $to = doc.resolve(selection.to)
  const last =
    $to.parentOffset === 0 && $to.depth > 0 && $to.index(0) > first
      ? $to.index(0) - 1
      : $to.index(0)
  return { first, last }
}

function readSnapshot(editor: Editor): DocxSnapshot {
  const attrs = paraAttrs(editor)
  const style = editor.getAttributes('docTextStyle') as Record<string, unknown>
  const list = editor.getAttributes('docListItem') as Record<string, unknown>
  const { first, last } = moveRange(editor)
  const bidi = attrs.bidi === true
  const storage = editor.storage as unknown as {
    trackChanges?: { enabled?: boolean }
  }
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    superscript: style.vertAlign === 'superscript',
    subscript: style.vertAlign === 'subscript',
    color: asString(style.color),
    highlight: asString(style.highlight),
    font: asString(style.font),
    fontAscii: asString(style.fontAscii),
    sizeHalfPoints: asNumber(style.sizeHalfPoints),
    style: editor.isActive('docHeading')
      ? `h${Number(attrs.level) || 1}`
      : isQuoteParagraph(attrs)
        ? 'quote'
        : 'p',
    align: asString(attrs.align) ?? (bidi ? 'right' : 'left'),
    bidi,
    lineSpacing: asNumber(attrs.lineSpacing),
    spaceBefore: asNumber(attrs.spaceBefore),
    spaceAfter: asNumber(attrs.spaceAfter),
    indentLeft: asNumber(attrs.indentLeft),
    indentRight: asNumber(attrs.indentRight),
    indentFirstLine: asNumber(attrs.indentFirstLine),
    lineRule: asString(attrs.lineRule),
    lineRawTwips: asNumber(attrs.lineRawTwips),
    shadingFill: asString(attrs.shadingFill),
    link: asString(editor.getAttributes('link').href),
    listKind: editor.isActive('docListItem')
      ? ((asString(list.kind) as 'bullet' | 'ordered' | null) ?? 'bullet')
      : null,
    ilvl: asNumber(list.ilvl) ?? 0,
    inTable: isInTable(editor.state),
    canUndo: undoDepth(editor.state) > 0,
    canRedo: redoDepth(editor.state) > 0,
    canMoveUp: first > 0,
    canMoveDown: last + 1 < editor.state.doc.childCount,
    trackChanges: storage.trackChanges?.enabled === true,
    spellcheck: editor.isDestroyed ? false : editor.view.dom.getAttribute('spellcheck') === 'true',
  }
}

/**
 * 让工具条重读一次不在编辑器状态里的东西（修订开关、拼写检查属性）。
 *
 * 那两个值一个在 extension 的 `storage` 里、一个在 DOM 属性上——**它们变了
 * 不会派发事务**，所以按钮的按下态会停在旧值上。派一个**没有 step** 的事务
 * 让订阅者重算一遍：它不改文档、进不了撤销栈、不触发 `onUpdate`（Tiptap 只在
 * `tr.docChanged` 时 emit），因此也不会把文档标脏。
 */
function refreshToolbar(editor: Editor): void {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(TOOLBAR_REFRESH, true))
}

/** 修订开关的当前值（在 extension 的 storage 上，不在编辑器状态里） */
function trackChangesEnabled(editor: Editor): boolean {
  const storage = editor.storage as unknown as { trackChanges?: { enabled?: boolean } }
  return storage.trackChanges?.enabled === true
}

/**
 * 开关修订。
 *
 * **写成模块级函数，不能写在组件里。** `storage` 是 `editor` 的一个属性，
 * 而在组件的 render/回调里改 `editor` 上挂的东西会被判成
 * `react(immutability)`——那条规则的代价不是「一个警告」，是 **React Compiler
 * 静默跳过整个组件**（铁律 1）。所以「改一个别人拥有的对象」这件事收进一个
 * 普通函数里，组件只负责调它。
 */
function setTrackChangesEnabled(editor: Editor, enabled: boolean): void {
  const storage = editor.storage as unknown as { trackChanges?: { enabled?: boolean } }
  if (storage.trackChanges === undefined) return
  storage.trackChanges.enabled = enabled
  refreshToolbar(editor)
}

/* ── 命令 ─────────────────────────────────────────────────────── */

/**
 * 跑一条 `prosemirror-tables` 那类「`(state, dispatch)` 签名」的命令。
 *
 * **必须包一层**：那批命令的签名是 `(state, dispatch)`，直接放进 Tiptap 的
 * 链里会被当成 `(props)` 调用，`state` 收到一个对象、`dispatch` 收到
 * `undefined`，于是抛 `Cannot read properties of undefined`。
 *
 * 里面的 `state` 是链上的**可链式 state**——它的 `.tr` 就是链里的那个事务，
 * 所以命令改出来的步骤最后会由 `run()` 一次性派发（`.run()` 不能省）。
 */
function runTableCommand(
  editor: Editor,
  command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean,
): boolean {
  return runCommand(editor, 'command', (props: { state: EditorState; dispatch?: () => void }) =>
    command(props.state, props.dispatch),
  )
}

/**
 * 改段落的格式属性。
 *
 * **三种类型逐个写**，不是「挑一个」：`updateAttributes` 只认它拿到的那个
 * 类型名，光标在标题上时写 `docParagraph` 什么都不会发生（
 * `@tiptap/core` 的 `updateAttributes` 找不到节点就 `return false`）。
 * 一次链里写三遍是安全的——不匹配的那两次各自返回 false，匹配的那次生效。
 */
function updateParagraphAttrs(editor: Editor, attrs: Record<string, unknown>): void {
  for (const name of PARA_NODE_TYPES) {
    if (hasNode(editor, name)) runCommand(editor, 'updateAttributes', name, attrs)
  }
}

/** 当前块的段落格式（以**光标所在类型**为准，供菜单里的输入框显示） */
function runStepIndent(editor: Editor, delta: 1 | -1): void {
  const name = paraNodeName(editor)
  if (name === 'docListItem') {
    // 列表项改层级：第几层就是它的缩进
    const ilvl = Math.min(8, Math.max(0, (asNumber(paraAttrs(editor).ilvl) ?? 0) + delta))
    runCommand(editor, 'updateAttributes', 'docListItem', { ilvl })
    return
  }
  if (name === 'docHeading') {
    // 标题没有 ilvl，跟正文一样走 indentLeft
    const current = asNumber(paraAttrs(editor).indentLeft) ?? 0
    runCommand(editor, 'updateAttributes', 'docHeading', { indentLeft: nextStop(current, delta) })
    return
  }
  const current = asNumber(paraAttrs(editor).indentLeft) ?? 0
  updateParagraphAttrs(editor, { indentLeft: nextStop(current, delta) })
}

/** 半个英寸一档的缩进（上游 `ops.ts:678-682`：往下一个整数档位靠，减到 0 为止） */
function nextStop(current: number, delta: 1 | -1): number | null {
  const next =
    delta > 0
      ? Math.floor(current / INDENT_STEP_TWIPS) * INDENT_STEP_TWIPS + INDENT_STEP_TWIPS
      : Math.max(Math.ceil(current / INDENT_STEP_TWIPS) * INDENT_STEP_TWIPS - INDENT_STEP_TWIPS, 0)
  // 0 写成 null：显式的 `w:left="0"` 会盖掉样式的缩进，而那多半不是用户想要的
  return next === 0 ? null : next
}

/**
 * 应用「段落样式」。
 *
 * 三支：
 *  - `p` 正文、`hN` 标题 N —— 走 `setNode`（上游 `ribbon-tabs.tsx:135-136`）
 *  - `quote` 引用 —— 走直接段落格式（原因见文件顶部）
 *
 * 从引用切回正文/标题时**只清引用自己写的那三项**：段落上可能还有用户手动
 * 加的缩进或底纹，一口气清掉是未经请求的副作用。
 *
 * **`styleId` 必须显式清成 null**：Tiptap 的 `setNode` 会把段落上没点名的属性
 * 原样带过去（实现里的 `attributesToCopy`），不清的话画布换了级别、文件里的
 * `w:pStyle` 还是旧样式（保存路径 `generate.ts:1742` 优先写 `block.styleId`）
 * ——重开又变回去。实测：Heading1 选「标题 2」，保存后 XML 仍是
 * `<w:pStyle w:val="Heading1"/>`。
 *
 * **导出仅供测试**（`docx-save.test.ts` 断言它落盘的 `w:pStyle`；产品里只经
 * 段落样式下拉使用）。
 */
export function applyParagraphStyle(editor: Editor, key: string): void {
  if (key === 'quote') {
    // 引用一律是正文段落：标题上点引用应当变成「被引用的正文」，而不是「被引用的标题 2」
    runCommand(editor, 'setNode', 'docParagraph', {
      ...QUOTE_ATTRS,
      kind: null,
      numId: null,
      styleId: null,
    })
    return
  }
  const clear = {
    borders: null,
    borderLines: null,
    indentLeft: null,
    kind: null,
    numId: null,
    styleId: null,
  }
  if (key === 'p') runCommand(editor, 'setNode', 'docParagraph', clear)
  else runCommand(editor, 'setNode', 'docHeading', { ...clear, level: Number(key.slice(1)) || 1 })
}

/** 切换光标所在块的列表类型（两种列表 + 取消） */
function toggleList(editor: Editor, kind: 'bullet' | 'ordered'): void {
  const { $from } = editor.state.selection
  const node = $from.parent
  if (node.type.name === 'docListItem') {
    const current = asString(node.attrs.kind) ?? 'bullet'
    if (current === kind) {
      runCommand(editor, 'setNode', 'docParagraph', { ...node.attrs, kind: null, numId: null })
    } else {
      runCommand(editor, 'updateAttributes', 'docListItem', { kind })
    }
    return
  }
  runCommand(editor, 'setNode', 'docListItem', {
    ...node.attrs,
    kind,
    numId: findExistingNumId(editor, kind),
    ilvl: 0,
  })
}

/**
 * 文档里第一个同类列表项的 `numId`（没有则 null）。
 *
 * 沿用而不是新建：新建编号定义要往 `numbering.xml` 里加一段，而那是保存路径
 * 上的活（本版没做，见文件顶部）。沿用已有的定义，编号至少是连着的。
 */
function findExistingNumId(editor: Editor, kind: 'bullet' | 'ordered'): string | null {
  let found: string | null = null
  editor.state.doc.descendants((node) => {
    if (found !== null) return false
    if (node.type.name !== 'docListItem') return true
    if ((asString(node.attrs.kind) ?? 'bullet') !== kind) return true
    const id = asString(node.attrs.numId)
    if (id !== null) found = id
    return found === null
  })
  return found
}

/** 插入一个 n×m 的表格。**边框必须给**——不给的话新表保存前是看不见的（上游同一条） */
function insertTable(editor: Editor, rows: number, cols: number): void {
  const line = { style: 'single', szEighths: 4, color: 'auto' }
  const model = {
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ paras: [''] }))),
    colWidthsPct: Array.from({ length: cols }, () => 100 / cols),
    widthPct: 100,
    autoFit: 'window' as const,
    borders: { top: line, bottom: line, left: line, right: line, insideH: line, insideV: line },
  }
  runCommand(editor, 'insertContent', tableModelToPmNode(model as never))
}

/* ── 表格：读当前状态 ─────────────────────────────────────────── */

interface TableInfo {
  rect: TableRect
  /** 光标所在的列（0 起） */
  column: number
  canDeleteRow: boolean
  canDeleteColumn: boolean
  canMerge: boolean
  canSplit: boolean
  /** 第一行的列宽（twips，长度 = 列数）。拿不到基准时为 null，见 `columnWidthsTwips` */
  columnWidths: number[] | null
}

/**
 * 「1 px = 15 twips」是仓库自己的换算（`convert.ts:829`，96dpi）。
 *
 * **这两个函数是 px 与 twips 之间仅有的通道**：单元格的 `colwidth` 属性存的是
 * **px**（解析时 `convert.ts:930` 写入，保存时 `convert.ts:1236` 自己乘 15 换回
 * twips），而界面上的一切都说 twips。漏掉一次换算不报错——症状是「每次编辑把
 * 列宽放大 15 倍，重开显示值又缩小 15 倍」。
 */
const pxToTwips = (px: number): number => Math.round(px * 15)
/** 反向：界面的 twips 写进 `colwidth`（px）之前过这里 */
const twipsToPx = (twips: number): number => Math.round(twips / 15)

/**
 * 表格当前每列的宽度（twips）。
 *
 * 来源按可靠性排：
 *  1. 第一行的 `colwidth`（它才是保存时的依据，`convert.ts:1233`）——**它是
 *     px**（解析 `convert.ts:930` 写入、保存 `convert.ts:1236` ×15 回 twips），
 *     这里过一次 `pxToTwips` 才是界面要的 twips
 *  2. `colWidthsPct` × 表格总宽
 *  3. 都没有 → **null**（调用方据此禁用输入框，而不是编一个数填进去）
 *
 * 总宽优先用 `widthPx`（模型里就有），没有就**量 DOM**——量出来的宽度是分页
 * 与排版都在用的真实值，比自己编一个「6.5 英寸」诚实。
 *
 * **导出仅供测试**（`docx-save.test.ts` 的列宽往返断言直接调它；产品里只经
 * 表格菜单使用）。
 */
export function columnWidthsTwips(editor: Editor, rect: TableRect): number[] | null {
  const columns = rect.map.width
  const widths: Array<number | null> = Array.from({ length: columns }, () => null)
  let column = 0
  rect.table.child(0).forEach((cell) => {
    const span = Math.max(1, Number(cell.attrs.colspan) || 1)
    const declared = cell.attrs.colwidth as number[] | null
    if (Array.isArray(declared) && declared.length === span) {
      for (let i = 0; i < span; i += 1) {
        const width = asNumber(declared[i])
        // colwidth 是 px，当 twips 用会把显示值缩小 15 倍（2000 twips 的列显示成 6.65 磅）
        if (width !== null && width > 0 && column + i < columns)
          widths[column + i] = pxToTwips(width)
      }
    }
    column += span
  })
  if (widths.every((width) => width !== null)) return widths as number[]

  const declaredPx = asNumber(rect.table.attrs.widthPx)
  let totalTwips = declaredPx !== null && declaredPx > 0 ? pxToTwips(declaredPx) : null
  if (totalTwips === null) {
    const dom = editor.view.nodeDOM(rect.tableStart - 1)
    const measured = dom instanceof HTMLElement ? dom.getBoundingClientRect().width : 0
    if (measured > 0) totalTwips = pxToTwips(measured)
  }
  if (totalTwips === null) return null

  const pct = rect.table.attrs.colWidthsPct as number[] | null
  const share = Array.isArray(pct) && pct.length === columns ? pct : null
  for (let i = 0; i < columns; i += 1) {
    if (widths[i] !== null) continue
    const fraction = share === null ? 1 / columns : (asNumber(share[i]) ?? 0) / 100
    widths[i] = Math.max(1, Math.round(totalTwips * fraction))
  }
  return widths as number[]
}

/** 表格里的当前状态。光标不在表格里时返回 null（调用方据此决定显不显示菜单） */
function tableInfo(editor: Editor): TableInfo | null {
  if (!isInTable(editor.state)) return null
  const rect = selectedRect(editor.state)
  const selection = editor.state.selection
  const cell = editor.getAttributes('docTableCell') as Record<string, unknown>
  return {
    rect,
    column: rect.left,
    // 与 prosemirror-tables 内部的守卫一致：整张表都是选区时删不动
    canDeleteRow: !(rect.top === 0 && rect.bottom === rect.map.height),
    canDeleteColumn: !(rect.left === 0 && rect.right === rect.map.width),
    canMerge:
      selection instanceof CellSelection && selection.$anchorCell.pos !== selection.$headCell.pos,
    canSplit: (Number(cell.colspan) || 1) > 1 || (Number(cell.rowspan) || 1) > 1,
    columnWidths: columnWidthsTwips(editor, rect),
  }
}

/**
 * 把某一列设成 `twips` 宽。
 *
 * **每一行的对应格子都要写**：第一行决定保存时算出来的列宽
 * （`convert.ts:1233` 只读第一行），其余行决定画布上这一列有多宽——只写第一行
 * 的话「保存对了、屏幕上看不出来」。跨列的格子按它覆盖的列改数组里那一项。
 *
 * **`colwidth` 属性存的是 px**，这里过一次 `twipsToPx`。把 twips 直接写进去的话，
 * 保存路径（`convert.ts:1236`）会再乘 15：输入 234 磅，文件里出现
 * `<w:gridCol w:w="70200"/>`（3510 磅，远超页宽）。
 *
 * **导出仅供测试**（`docx-save.test.ts` 的列宽往返断言直接调它；产品里只经
 * 表格菜单使用）。
 */
export function setColumnWidth(
  editor: Editor,
  rect: TableRect,
  column: number,
  twips: number,
): void {
  const px = twipsToPx(twips)
  runTableCommand(editor, (state, dispatch) => {
    const tr = state.tr
    let rowPos = rect.tableStart
    for (let r = 0; r < rect.table.childCount; r += 1) {
      const row = rect.table.child(r)
      let cellPos = rowPos + 1
      let at = 0
      for (let c = 0; c < row.childCount; c += 1) {
        const cell = row.child(c)
        const span = Math.max(1, Number(cell.attrs.colspan) || 1)
        const declared = cell.attrs.colwidth as number[] | null
        if (at === column && span === 1) {
          tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, colwidth: [px] })
        } else if (
          Array.isArray(declared) &&
          declared.length === span &&
          at <= column &&
          column < at + span
        ) {
          const next = [...declared]
          next[column - at] = px
          tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, colwidth: next })
        }
        cellPos += cell.nodeSize
        at += span
      }
      rowPos += row.nodeSize
    }
    if (dispatch) dispatch(tr)
    return true
  })
}

/* ── 插图 ─────────────────────────────────────────────────────── */

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(new Error('读不出这个文件')))
    reader.readAsDataURL(file)
  })
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight }),
    )
    image.addEventListener('error', () => reject(new Error('这张图片读不出尺寸')))
    image.src = dataUrl
  })
}

/**
 * 插图。`mime` 只支持 png / jpeg / gif —— 保存路径上
 * `imageFromProtectedAttrs`（`convert.ts:2284`）的正则只认这三种，别的格式
 * 进了文档也存不下去。
 */
async function insertImage(editor: Editor, file: File): Promise<void> {
  const dataUrl = await readDataUrl(file)
  const match = /^data:(image\/(?:png|jpeg|gif));base64,(.+)$/s.exec(dataUrl)
  if (match === null) throw new Error('只支持 PNG / JPEG / GIF 图片')
  const natural = await imageSize(dataUrl)
  if (natural.width <= 0 || natural.height <= 0) throw new Error('这张图片的尺寸是空的')
  const scale = Math.min(1, MAX_IMAGE_WIDTH_PX / natural.width)
  const widthPx = Math.round(natural.width * scale)
  const heightPx = Math.round(natural.height * scale)
  runCommand(editor, 'insertContent', {
    type: 'docProtected',
    attrs: {
      docxIndex: null,
      blockType: 'image',
      label: file.name,
      // imageDataUrl 不能省：渲染分支是 `blockType === 'image' && imageDataUrl`
      // （`extensions.ts:4057`），缺了它画布上只落一个空框——「点了没反应，
      // 保存重开后图才出现」
      imageDataUrl: dataUrl,
      imageWidthPx: widthPx,
      imageHeightPx: heightPx,
      genImage: { base64: match[2] as string, mime: match[1] as string, widthPx, heightPx },
    },
  })
}

/* ── 页面 ─────────────────────────────────────────────────────── */

export interface DocxEditorProps extends EditorProps {
  onAgentHandleChange?: (handle: DocxAgentHandle | null) => void
}

export function DocxEditor({
  documentId,
  io,
  onDirtyChange,
  onAgentHandleChange,
  flush = false,
  appearance = 'light',
}: DocxEditorProps) {
  const source = useSource(io, documentId)
  /** 解析。结果与「哪一份字节」绑在一起（见 useParsed 的说明） */
  const parsed = useParsed(source.bytes, openDocx)
  const session = parsed.value
  const [pageCount, setPageCount] = useState(1)
  /** 有改动还没保存。保存成功了才清掉 */
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const onDirtyChangeRef = useRef(onDirtyChange)
  const onAgentHandleChangeRef = useRef(onAgentHandleChange)
  const agentHandleRef = useRef<DocxAgentHandle | null>(null)
  const saveOptionsRef = useRef<DocxSaveOptions>({})
  const [saveOptionsSnapshot, setSaveOptionsSnapshot] = useState<{
    session: DocxSession | null
    options: DocxSaveOptions
  }>({ session: null, options: {} })
  useEffect(() => {
    if (!session) return
    saveOptionsRef.current = {}
  }, [session])
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
    onAgentHandleChangeRef.current = onAgentHandleChange
  })
  /** 查找栏的显隐、查询串与两个开关（栏本身是受控的） */
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findOptions, setFindOptions] = useState<FindOptions>({
    matchCase: false,
    wholeWord: false,
  })
  /**
   * 一次性的提示（插图失败之类）。
   *
   * **必须有一条能说话的路**：文件选错了格式时不能只是「什么都没发生」——
   * 那正是 DESIGN §7.4 禁止的「可点而无事发生」。落在状态行上，不弹窗。
   */
  const [notice, setNotice] = useState<string | null>(null)
  /** 分页要的两个元素：滚动容器与 ProseMirror 根 */
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * 当前页（跟随滚动）。
   *
   * 页间隙是分页引擎插进文档的 `.page-gap` 元素（一页一条）——所以
   * 「滚过几个间隙」就是「在第几页」。**不额外量页高**：那是分页引擎的
   * 职责，再算一遍必然有一天与它不一致。
   *
   * 原先状态行的 `第 1` 是**写死的**：滚到第 7 页仍显示「第 1 / 共 7 页」，
   * 而 pptx / pdf 都显示真实页码（实测发现，D-096）。
   */
  const [currentPage, setCurrentPage] = useState(1)
  const syncCurrentPage = useCallback(() => {
    const scroller = scrollRef.current
    if (scroller === null) return
    const top = scroller.getBoundingClientRect().top
    let crossed = 0
    for (const gap of scroller.querySelectorAll('.page-gap')) {
      // +1 的容差：间隙的顶边恰好落在滚动口顶边时算「已经翻过去」
      if (gap.getBoundingClientRect().top <= top + 1) crossed += 1
    }
    // setState 只在值真的变化时才产生渲染（相同值 React 会跳过）
    setCurrentPage(crossed + 1)
  }, [])

  const handlePaged = useCallback(
    (count: number) => {
      setPageCount(count)
      // 分页重排后页数可能变了（删内容、改字号），当前页重新算一次——
      // 不重算的话会停在越界的页码上
      syncCurrentPage()
    },
    [syncCurrentPage],
  )

  /** 滚动时更新当前页。用**被动监听**：滚动是高频事件，默认的主动监听
      会等我们的处理器跑完才继续滚，长文档里能看出卡顿 */
  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller === null) return
    scroller.addEventListener('scroll', syncCurrentPage, { passive: true })
    return () => scroller.removeEventListener('scroll', syncCurrentPage)
  }, [syncCurrentPage])

  /**
   * Ctrl+F 打开查找栏（工具条标签上写着这个快捷键，就得真的能用——见
   * `useFindHotkey` 的说明）。只负责「显示」，焦点归那个 hook 管。
   */
  const openFind = useCallback(() => setFindOpen(true), [])
  useFindHotkey(openFind)

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: session?.content,
      editable: true,
      /**
       * `spellcheck` 写成**显式属性**。
       *
       * 不写的话浏览器按 contenteditable 的默认值走（通常是开），而 DOM 上
       * 读出来是 `null`——工具条上那个开关于是「实际开着、显示关着」。写上，
       * 属性与显示就只有一个真相（开关本身见 `ToggleSpellcheck`）。
       */
      editorProps: { attributes: { spellcheck: 'true' } },
      onUpdate: () => {
        dirtyRef.current = true
        setDirty(true)
        onDirtyChangeRef.current?.(true)
      },
    },
    [session],
  )

  useEffect(() => {
    if (!editor || !session) return
    const handle = createDocxAgentHandle(editor, documentId, {
      isDirty: () => dirtyRef.current,
      headingLevels: session.headingLevels,
      session,
      saveOptions: saveOptionsRef,
      onSaveOptionsChange: () =>
        setSaveOptionsSnapshot({ session, options: structuredClone(saveOptionsRef.current) }),
      onDirtyChange: (next) => {
        dirtyRef.current = next
        setDirty(next)
        onDirtyChangeRef.current?.(next)
      },
    })
    agentHandleRef.current = handle
    onAgentHandleChangeRef.current?.(handle)
    return () => {
      handle.dispose()
      if (agentHandleRef.current === handle) agentHandleRef.current = null
      onAgentHandleChangeRef.current?.(null)
    }
  }, [editor, session, documentId])

  const liveHeaderFooter = useMemo(() => {
    if (!session) return null
    const current = saveOptionsSnapshot.session === session ? saveOptionsSnapshot.options : {}
    const part = (value: DocxSaveOptions['header']) =>
      value === undefined
        ? null
        : {
            text: value.text,
            hasPageNumber: value.pageNumber ?? false,
            paras: value.paras ?? [],
          }
    return {
      ...session.headerFooter,
      header: current.header === undefined ? session.headerFooter.header : part(current.header),
      footer: current.footer === undefined ? session.headerFooter.footer : part(current.footer),
      headerFirst:
        current.headerFirst === undefined
          ? session.headerFooter.headerFirst
          : part(current.headerFirst),
      footerFirst:
        current.footerFirst === undefined
          ? session.headerFooter.footerFirst
          : part(current.footerFirst),
      headerEven:
        current.headerEven === undefined
          ? session.headerFooter.headerEven
          : part(current.headerEven),
      footerEven:
        current.footerEven === undefined
          ? session.headerFooter.footerEven
          : part(current.footerEven),
      titlePg: current.titlePg ?? session.headerFooter.titlePg,
      evenAndOdd: current.evenAndOddHeaders ?? session.headerFooter.evenAndOdd,
    }
  }, [session, saveOptionsSnapshot])
  const liveSections = useMemo(() => {
    if (!session || !editor) return NO_SECTIONS
    const options = saveOptionsSnapshot.session === session ? saveOptionsSnapshot.options : {}
    return docxAgentLiveSections(editor, session, options)
  }, [session, editor, saveOptionsSnapshot])
  const pageStyle = useMemo(() => {
    const first = liveSections[0]?.settings
    if (!first) return undefined
    const box = sectionPageBox(first)
    const px = (twips: number) => (twips / 1440) * 96
    return {
      '--page-w': `${paperWidthPx(liveSections)}px`,
      '--page-h': `${box.height}px`,
      '--page-pad': `${effectiveTopPx(first, 0)}px ${px(first.marginRight)}px ${effectiveBottomPx(first, 0)}px ${px(first.marginLeft)}px`,
    } as CSSProperties
  }, [liveSections])

  /**
   * 分页：把连续流切成纸张（`src/pagination.ts`）。它插的是**装饰器**，
   * 不改文档内容——所以保存路径完全不受影响。
   */
  usePagination({
    editor,
    scrollRef,
    containerRef,
    /**
     * 必须是**稳定引用**：`session?.sections ?? []` 每次都新建数组，会让
     * hook 的 effect 每次渲染都重跑并互相取消。未加载时用同一个空数组常量。
     */
    sections: liveSections,
    headerFooter: liveHeaderFooter,
    footnotes: session?.footnotes ?? null,
    onPaged: handlePaged,
  })

  const save = async () => {
    if (!session || !editor) return
    const savingHandle = agentHandleRef.current
    const savingVersion = savingHandle?.getVersion()
    const bytes = await session.save(editor.getJSON() as never, saveOptionsRef.current)
    const ok = await source.save(bytes, { name: 'document.docx', mime: OFFICE_MIME.docx })
    if (!ok) return
    if (agentHandleRef.current !== savingHandle) return
    savingHandle?.markSaved()
    if (savingVersion !== savingHandle?.getVersion()) return
    const pendingDraft = savingHandle?.hasPendingDraft() ?? false
    dirtyRef.current = pendingDraft
    setDirty(pendingDraft)
    onDirtyChange?.(pendingDraft)
  }

  const status = statusText({
    handle: source,
    dirty,
    // 页码跟随滚动。`min` 只是防越界：分页重排的那一帧里 gap 数量与
    // pageCount 可能差一，显示越界页码比慢半拍更难看
    idle: session ? `第 ${Math.min(currentPage, pageCount)} / 共 ${pageCount} 页` : '读取中…',
  })

  /**
   * 查找/替换的适配器。按编辑器实例缓存（见 `docxFindAdapter` 的说明），
   * 所以这里每次渲染调用它是幂等的——不会因为新建对象而让那条栏每帧重扫。
   */
  const findAdapter = editor === null ? null : docxFindAdapter(editor)

  if (source.loadError !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>{status}</ToolbarLabel>}>
        <EditorStateBlock tone="error">
          读取失败：{source.loadError}
          <div style={{ marginTop: 12 }}>
            <ToolbarButton label="重试" onClick={source.reload}>
              重试
            </ToolbarButton>
          </div>
        </EditorStateBlock>
      </EditorShell>
    )
  }

  if (parsed.error !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>{status}</ToolbarLabel>}>
        <EditorStateBlock tone="error">解析失败：{parsed.error}</EditorStateBlock>
      </EditorShell>
    )
  }

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          <DocxToolbar
            editor={editor}
            disabled={session === null}
            headingLevels={session?.headingLevels ?? NO_LEVELS}
            findOpen={findOpen}
            onToggleFind={() => setFindOpen((open) => !open)}
            onNotice={setNotice}
          />
        </>
      }
      toolbarActions={
        <ToolbarButton
          label={source.saving ? '保存中…' : '保存到库'}
          primary
          disabled={session === null || !dirty || source.saving}
          /*
              禁用必须给原因（DESIGN §8.4）。判据是三件事（还没解析出来 / 没改动 /
              正在保存），各有各的说法：不区分的话按钮灰着时用户只能猜。其余四种
              格式都给了（pptx / html / markdown / pdf），这里是漏掉的一处。
            */
          disabledReason={
            session === null ? '文档还没读完' : source.saving ? '正在保存…' : '没有未保存的改动'
          }
          onClick={() => void save()}
        >
          <SaveIcon />
        </ToolbarButton>
      }
      /*
        次工具条：查找替换栏。它**与工具条同包在 sticky 容器里**（见 shell.css）
        ——让 subbar 自己再写一条 `position: sticky; top: 0` 会盖住工具条命令。
        保存位于底部状态行。没打开时不传这个槽位，不留一条空行。
      */
      subbar={
        findOpen ? (
          <FindReplaceBar
            adapter={findAdapter}
            query={findQuery}
            onQueryChange={setFindQuery}
            options={findOptions}
            onOptionsChange={setFindOptions}
            onClose={() => setFindOpen(false)}
          />
        ) : undefined
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          {/*
            提示走外壳的 `ToolbarNotice`（危险色、能断词）——原来这里是一个
            自造的 `span.mimir-docx-notice`，与 pdf 那边拿 `ToolbarNote` 顶的
            写法分叉。状态行是 flex + space-between，一长句原因不能 nowrap。
          */}
          {notice !== null && notice !== '' && <ToolbarNotice>{notice}</ToolbarNotice>}
          {session && (
            <ToolbarLabel>{session.blocks.filter((b) => !b.hidden).length} 个块</ToolbarLabel>
          )}
        </>
      }
    >
      {/*
        滚动容器：分页要量它的顶部作原点，所以它必须是真正滚动的那一层。

        `page-dark` **只在外观是深色时挂上**：文档里作者显式写的文字颜色
        按原样渲染（`w:color` 的孪生值 `--dk-*` 由编辑器发出），而上游的
        「切到孪生值」规则写在 `.page-dark` 子树里——不挂这个类的话，
        深色纸上「显式黑字」就是黑压黑，实测完全不可见（D-096）。
        浅色下**绝不能挂**：那些规则同样会把颜色改掉（浅色纸上的
        孪生值是另一套）。
      */}
      <div
        ref={scrollRef}
        className={`me-scroll mimir-docx-scroll${appearance === 'dark' ? ' page-dark' : ''}`}
      >
        <div ref={containerRef} className="editor-scroll mimir-office">
          <div className="page-wrap" style={pageStyle}>
            <div className="doc-page">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>
    </EditorShell>
  )
}

/* ── 工具条 ───────────────────────────────────────────────────── */

interface DocxToolbarSection {
  label: string
  content: ReactNode
  disabledReason?: string
}

/** Width-independent access to every DOCX command; the direct row only changes priority. */
function DocxMoreMenu({ sections }: { sections: readonly DocxToolbarSection[] }) {
  const [section, setSection] = useState<string | null>(null)
  const panelContent = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target =
      section === null
        ? panelContent.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        : panelContent.current?.querySelector<HTMLButtonElement>(
            '[role="menuitem"][title="返回全部命令"]',
          )
    target?.focus()
  }, [section])

  return (
    <ToolbarMenu
      label="更多命令"
      text="更多"
      panelWidth={270}
      renderPanel={() => (
        <div ref={panelContent}>
          {section === null ? (
            sections.map((entry) => (
              <ToolbarMenuItemRow
                key={entry.label}
                item={{
                  key: entry.label,
                  label: entry.label,
                  onSelect: () => setSection(entry.label),
                  disabled: entry.disabledReason !== undefined,
                  disabledReason: entry.disabledReason,
                }}
              />
            ))
          ) : (
            <>
              <ToolbarMenuItemRow
                item={{ key: 'back', label: '返回全部命令', onSelect: () => setSection(null) }}
              />
              <ToolbarMenuSeparator />
              <ToolbarMenuFields label={section}>
                {sections.find((entry) => entry.label === section)?.content}
              </ToolbarMenuFields>
            </>
          )}
        </div>
      )}
    />
  )
}

export interface DocxToolbarProps {
  editor: Editor | null
  disabled: boolean
  headingLevels: readonly number[]
  findOpen: boolean
  onToggleFind: () => void
  onNotice: (text: string) => void
}

/**
 * 格式工具条。**只在编辑器就绪后可用**：文档还在解析时按钮点下去没有意义，
 * 禁用比「点了没反应」诚实。
 *
 * 每一项的可用性都来自 `readSnapshot`（一次订阅算完全部），所以按钮的亮灭
 * 跟着光标走，而不是停在打开文档那一刻。
 *
 * **导出**是为了让渲染契约的测试能直接挂这一棵子树（`DocxEditor` 本体要先
 * 取字节、再解析，那些与工具条无关）。产品里只经 `DocxEditor` 使用。
 */
export function DocxToolbar({
  editor,
  disabled,
  headingLevels,
  findOpen,
  onToggleFind,
  onNotice,
}: DocxToolbarProps) {
  const raw = useToolbarState(editor, (instance) => JSON.stringify(readSnapshot(instance)))
  const state: DocxSnapshot = raw === '' ? EMPTY_SNAPSHOT : (JSON.parse(raw) as DocxSnapshot)

  /**
   * 格式刷的「已举起」状态与源格式。
   *
   * 源格式放 ref（它只是被搬运的数据，不参与渲染）；举没举起来放 state——
   * 按钮的按下态要看得见。**渲染期不读 ref**（React Compiler 会因此跳过整个
   * 组件），所以 ref 只在 effect 与事件里用。
   */
  const [painterArmed, setPainterArmed] = useState(false)
  const painterSource = useRef<{ type: string; attrs: Record<string, unknown> }[]>([])

  useEffect(() => {
    if (editor === null || !painterArmed) return
    let applied = false
    const onSelection = () => {
      // 一次举起只刷一次：派发之后还会再收到一次 selectionUpdate，不拦会连刷
      if (applied) return
      const { selection } = editor.state
      if (selection.empty) return
      applied = true
      const from = selection.from
      const to = selection.to
      const schema = editor.state.schema
      editor.commands.command(({ tr }) => {
        /*
         * **逐类 removeMark，不能 `tr.removeMark(from, to)`。** 不传 markType
         * 的那一次会把区间上**所有**标记清掉——链接、批注、修订、域代码
         * （`refField`/`instrField`/`docSym`）一起没。格式刷只该动格式。
         */
        for (const name of PAINTER_MARK_TYPES) {
          if (schema.marks[name] !== undefined) tr.removeMark(from, to, schema.marks[name])
        }
        for (const source of painterSource.current) {
          const mark = schema.marks[source.type]
          if (mark === undefined) continue
          tr.addMark(from, to, mark.create(source.attrs))
        }
        return true
      })
      setPainterArmed(false)
    }
    editor.on('selectionUpdate', onSelection)
    return () => {
      editor.off('selectionUpdate', onSelection)
    }
  }, [editor, painterArmed])

  if (!editor) return null

  const table = tableInfo(editor)

  const styleOptions: ToolbarSelectOption<string>[] = [{ value: 'p', label: '正文' }]
  if (headingLevels.length === 0) {
    // 规矩来自 DESIGN §8.4：**不留空子菜单**，给一条禁用的说明项，
    // 而不是把这个下拉变成只有「正文」一项的空控件
    styleOptions.push({ value: 'h0', label: '标题（这份文档没有标题样式）', disabled: true })
  }
  for (const level of headingLevels) {
    styleOptions.push({ value: `h${level}`, label: `标题 ${level}` })
  }
  styleOptions.push({ value: 'quote', label: '引用' })

  const historyControls = (
    <ToolbarGroup label="历史记录">
      <ToolbarButton
        label="撤销 (Ctrl+Z)"
        disabled={disabled || !state.canUndo}
        disabledReason="没有可以撤销的改动了"
        onClick={() => runCommand(editor, 'undo')}
      >
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton
        label="重做 (Ctrl+Shift+Z)"
        disabled={disabled || !state.canRedo}
        disabledReason="没有可以重做的改动了"
        onClick={() => runCommand(editor, 'redo')}
      >
        <RedoIcon />
      </ToolbarButton>
    </ToolbarGroup>
  )
  const styleControl = (
    <ToolbarSelect
      label="段落样式"
      value={state.style}
      options={styleOptions}
      fallbackLabel="自定义"
      onChange={(value) => applyParagraphStyle(editor, value)}
    />
  )
  const fontControls = (
    <ToolbarGroup label="字体">
      <ToolbarLabel>中文</ToolbarLabel>
      <ToolbarSelect
        label="中文字体"
        value={state.font ?? ''}
        options={fontOptions(EAST_ASIA_FONTS)}
        onChange={(value) =>
          runCommand(editor, 'setMark', 'docTextStyle', { font: value === '' ? null : value })
        }
      />
      <ToolbarLabel>西文</ToolbarLabel>
      <ToolbarSelect
        label="西文字体"
        value={state.fontAscii ?? ''}
        options={fontOptions(LATIN_FONTS)}
        onChange={(value) =>
          runCommand(editor, 'setMark', 'docTextStyle', {
            fontAscii: value === '' ? null : value,
          })
        }
      />
    </ToolbarGroup>
  )
  const sizeControls = (
    <ToolbarGroup label="字号">
      <ToolbarLabel>字号</ToolbarLabel>
      <ToolbarSelect
        label="字号（磅）"
        value={state.sizeHalfPoints === null ? null : String(state.sizeHalfPoints)}
        options={FONT_SIZES_HALF_POINTS.map((half) => ({
          value: String(half),
          label: String(halfPointsToPt(half)),
        }))}
        fallbackLabel="其它"
        /*
            `null` 与「不在档位里」是两件事，不能共用「其它」：这一份文档上
            文字没有直接字号（继承自段落样式），显示「其它」会被读成
            「我选了别的字号」。`emptyLabel` 的说明在 `ToolbarSelect` 上。
          */
        emptyLabel="（默认）"
        onChange={(value) =>
          runCommand(editor, 'setMark', 'docTextStyle', { sizeHalfPoints: Number(value) })
        }
      />
      {/*
          增大 / 减小字号。**必须有兜底**：`getAttributes('docTextStyle')` 在
          文字没有直接字号时返回 `{}`（字号继承自样式/文档默认），此时
          `undefined ± 2` 是 `NaN`，而它会一路走到保存——`convert.ts` 把
          `sizeHalfPoints` 写进签名、`generate.ts:2772` 拿它生成 `w:sz`，
          于是文件里出现 `w:sz w:val="NaN"`。所以没值时**禁用**，并说明原因。
        */}
      <ToolbarButton
        label="减小字号"
        disabled={disabled || state.sizeHalfPoints === null}
        disabledReason="当前文字没有直接字号：字号继承自段落样式，先在左边选一个字号"
        onClick={() =>
          runCommand(editor, 'setMark', 'docTextStyle', {
            sizeHalfPoints: (state.sizeHalfPoints ?? 0) - 2,
          })
        }
      >
        <FontShrinkIcon />
      </ToolbarButton>
      <ToolbarButton
        label="增大字号"
        disabled={disabled || state.sizeHalfPoints === null}
        disabledReason="当前文字没有直接字号：字号继承自段落样式，先在左边选一个字号"
        onClick={() =>
          runCommand(editor, 'setMark', 'docTextStyle', {
            sizeHalfPoints: (state.sizeHalfPoints ?? 0) + 2,
          })
        }
      >
        <FontGrowIcon />
      </ToolbarButton>
    </ToolbarGroup>
  )
  const basicControls = (
    <ToolbarGroup label="字符格式">
      <ToolbarButton
        label="加粗 (Ctrl+B)"
        active={state.bold}
        disabled={disabled}
        onClick={() => toggleMarkByName(editor, 'bold')}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label="倾斜 (Ctrl+I)"
        active={state.italic}
        disabled={disabled}
        onClick={() => toggleMarkByName(editor, 'italic')}
      >
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton
        label="下划线 (Ctrl+U)"
        active={state.underline}
        disabled={disabled}
        onClick={() => toggleMarkByName(editor, 'underline')}
      >
        <UnderlineIcon />
      </ToolbarButton>
    </ToolbarGroup>
  )
  const additionalFontControls = (
    <ToolbarGroup label="其他字符格式">
      <ToolbarButton
        label="删除线"
        active={state.strike}
        disabled={disabled}
        onClick={() => toggleMarkByName(editor, 'strike')}
      >
        <StrikeIcon />
      </ToolbarButton>
      <ToolbarButton
        label="上标"
        active={state.superscript}
        disabled={disabled}
        onClick={() =>
          runCommand(editor, 'setMark', 'docTextStyle', {
            vertAlign: state.superscript ? null : 'superscript',
          })
        }
      >
        <SuperscriptIcon />
      </ToolbarButton>
      <ToolbarButton
        label="下标"
        active={state.subscript}
        disabled={disabled}
        onClick={() =>
          runCommand(editor, 'setMark', 'docTextStyle', {
            vertAlign: state.subscript ? null : 'subscript',
          })
        }
      >
        <SubscriptIcon />
      </ToolbarButton>
      <ToolbarColorPicker
        label="字体颜色"
        icon={<TextColorIcon />}
        value={state.color}
        options={TEXT_COLORS}
        onPick={(value) => runCommand(editor, 'setMark', 'docTextStyle', { color: value })}
        onClear={() => runCommand(editor, 'setMark', 'docTextStyle', { color: null })}
      />
      <ToolbarColorPicker
        label="文本突出显示"
        icon={<HighlightIcon />}
        value={state.highlight}
        options={HIGHLIGHT_COLORS}
        onPick={(value) => runCommand(editor, 'setMark', 'docTextStyle', { highlight: value })}
        onClear={() => runCommand(editor, 'setMark', 'docTextStyle', { highlight: null })}
      />
      <ToolbarButton
        label="清除格式"
        disabled={disabled}
        onClick={() => {
          /*
           * 两半：字符的（所有标记）与段落的（`CLEARED_PARA_ATTRS`）。
           *
           * `unsetAllMarks` 对**空选区直接 return**（`@tiptap/core` 的
           * `unsetAllMarks.ts`：`if (empty) return true`）——所以光标停在一处
           * 不选任何字时，字符那半得自己处理：清掉 storedMarks，也就是
           * 「接下来敲的字用什么格式」。不清的话按钮看着按了、敲出来还是旧格式。
           */
          runCommand(editor, 'unsetAllMarks')
          editor
            .chain()
            .focus()
            .command(({ tr, dispatch }) => {
              if (dispatch && tr.selection.empty) tr.setStoredMarks([])
              return true
            })
            .run()
          updateParagraphAttrs(editor, CLEARED_PARA_ATTRS)
        }}
      >
        <ClearFormatIcon />
      </ToolbarButton>
      <ToolbarButton
        label={painterArmed ? '格式刷：选中要套用的文字' : '格式刷（先选中格式来源，再选目标）'}
        active={painterArmed}
        disabled={disabled}
        onClick={() => {
          if (painterArmed) {
            setPainterArmed(false)
            return
          }
          painterSource.current = painterSourceMarks(editor)
            .filter((mark) => (PAINTER_MARK_TYPES as readonly string[]).includes(mark.type.name))
            .map((mark) => ({ type: mark.type.name, attrs: mark.attrs }))
          setPainterArmed(true)
        }}
      >
        <PaintFormatIcon />
      </ToolbarButton>
    </ToolbarGroup>
  )
  const alignControls = (
    <ToolbarToggleGroup
      label="对齐方式"
      value={state.align}
      options={[
        { value: 'left', label: '左对齐', icon: <AlignLeftIcon /> },
        { value: 'center', label: '居中', icon: <AlignCenterIcon /> },
        { value: 'right', label: '右对齐', icon: <AlignRightIcon /> },
        { value: 'justify', label: '两端对齐', icon: <AlignJustifyIcon /> },
      ]}
      onChange={(value) =>
        setSelectionAlign(editor, value as 'left' | 'center' | 'right' | 'justify')
      }
    />
  )
  const listControls = (
    <ToolbarGroup label="列表与缩进">
      <ToolbarButton
        label="项目符号列表"
        active={state.listKind === 'bullet'}
        disabled={disabled}
        onClick={() => toggleList(editor, 'bullet')}
      >
        <BulletListIcon />
      </ToolbarButton>
      <ToolbarButton
        label="编号列表"
        active={state.listKind === 'ordered'}
        disabled={disabled}
        onClick={() => toggleList(editor, 'ordered')}
      >
        <OrderedListIcon />
      </ToolbarButton>
      <ToolbarButton label="减少缩进" disabled={disabled} onClick={() => runStepIndent(editor, -1)}>
        <OutdentIcon />
      </ToolbarButton>
      <ToolbarButton label="增加缩进" disabled={disabled} onClick={() => runStepIndent(editor, 1)}>
        <IndentIcon />
      </ToolbarButton>
    </ToolbarGroup>
  )
  const paragraphControls = (
    <>
      <ToolbarSelect
        label="行距（倍数）"
        value={state.lineSpacing === null ? null : String(state.lineSpacing)}
        options={LINE_SPACINGS.map((value) => ({ value: String(value), label: `${value} 倍` }))}
        fallbackLabel="自定义"
        onChange={(value) =>
          updateParagraphAttrs(editor, {
            lineSpacing: Number(value),
            /*
             * 同时清掉固定行距：`lineRule='exact'` 在画布与保存两侧都**优先于**
             * 倍数（`line-metrics.ts:1465`、`generate.ts:1178`），不清的话选了
             * 「1.5 倍」屏幕上和文件里都不会变——又是一次静默失效。
             */
            lineRule: null,
            lineRawTwips: null,
          })
        }
      />
      <ToolbarColorPicker
        label="段落底纹"
        icon={<ParaShadingIcon />}
        value={state.shadingFill}
        options={SHADING_COLORS}
        onPick={(value) =>
          // shadingDisplay 是显示层的图案混色，留着会盖住新选的纯色
          updateParagraphAttrs(editor, { shadingFill: value, shadingDisplay: null })
        }
        onClear={() =>
          updateParagraphAttrs(editor, {
            shadingFill: null,
            shadingDisplay: null,
            shadingClear: false,
          })
        }
      />
      <ToolbarToggleGroup
        label="文字方向"
        value={state.bidi ? 'rtl' : 'ltr'}
        options={[
          { value: 'ltr', label: '从左到右', icon: <LtrIcon /> },
          { value: 'rtl', label: '从右到左', icon: <RtlIcon /> },
        ]}
        onChange={(value) => setParagraphDirection(editor, value as 'ltr' | 'rtl')}
      />
      <ParagraphSpacingMenu editor={editor} state={state} disabled={disabled} />
      <LineRuleMenu editor={editor} state={state} disabled={disabled} />
      {listControls}
      <ToolbarGroup label="段落位置">
        <ToolbarButton
          label="上移这一段 (Alt+Shift+↑)"
          disabled={disabled || !state.canMoveUp}
          disabledReason="已经是第一段了"
          onClick={() => moveBlocks(editor, -1)}
        >
          <ArrowUpIcon />
        </ToolbarButton>
        <ToolbarButton
          label="下移这一段 (Alt+Shift+↓)"
          disabled={disabled || !state.canMoveDown}
          disabledReason="已经是最后一段了"
          onClick={() => moveBlocks(editor, 1)}
        >
          <ArrowDownIcon />
        </ToolbarButton>
      </ToolbarGroup>
    </>
  )
  const tableControls = <TableMenu editor={editor} table={table} />
  const insertControls = (
    <>
      <ToolbarMenu
        label="插入表格"
        icon={<TableIcon />}
        renderPanel={() => <InsertTablePanel editor={editor} />}
      />
      <ToolbarGroup label="插入">
        <ToolbarFileButton
          label="插入图片"
          accept="image/png,image/jpeg,image/gif"
          disabled={disabled}
          onPick={(file) => {
            // 上一次的失败提示先撤掉：不撤的话这次成功了它还挂在那里
            onNotice('')
            void insertImage(editor, file).catch((cause: unknown) =>
              onNotice(cause instanceof Error ? cause.message : String(cause)),
            )
          }}
        >
          <ImageIcon />
        </ToolbarFileButton>
        <ToolbarMenu
          label="插入链接"
          icon={<LinkIcon />}
          renderPanel={(close) => <LinkPanel editor={editor} current={state.link} onDone={close} />}
        />
        <ToolbarButton
          label="插入分页符 (Ctrl+Enter)"
          disabled={disabled}
          onClick={() => insertPageBreak(editor)}
        >
          <PageBreakIcon />
        </ToolbarButton>
      </ToolbarGroup>
    </>
  )
  const findControl = (
    <ToolbarButton
      label="查找和替换 (Ctrl+F)"
      active={findOpen}
      disabled={disabled}
      onClick={onToggleFind}
    >
      <FindIcon />
    </ToolbarButton>
  )
  const reviewControls = (
    <>
      <ToolbarMenu
        label="修订"
        icon={<TrackChangesIcon />}
        text={state.trackChanges ? '修订中' : undefined}
        renderPanel={() => <RevisionsPanel editor={editor} enabled={state.trackChanges} />}
      />
      <ToolbarButton
        label={state.spellcheck ? '关闭拼写检查' : '打开拼写检查'}
        active={state.spellcheck}
        disabled={disabled}
        onClick={() => {
          /*
           * **`editor.setOptions`，不是 `useEditor`**（那是 hook，只能在组件
           * 顶部调一次）。通路已核实：`setOptions` → `view.setProps`
           * （`@tiptap/core` 的 `Editor.setOptions`），属性落在 contenteditable
           * 那个元素上。
           */
          editor.setOptions({
            editorProps: { attributes: { spellcheck: state.spellcheck ? 'false' : 'true' } },
          })
          // 属性变了不会派发事务，得叫工具条重读一次（见 refreshToolbar）
          refreshToolbar(editor)
        }}
      >
        <SpellCheckIcon />
      </ToolbarButton>
    </>
  )

  const sections = [
    { label: '历史记录', content: historyControls },
    {
      label: '字体',
      content: (
        <>
          {fontControls}
          {sizeControls}
          {additionalFontControls}
        </>
      ),
    },
    {
      label: '段落',
      content: (
        <>
          {alignControls}
          {paragraphControls}
        </>
      ),
    },
    { label: '插入', content: insertControls },
    {
      label: '表格',
      content: tableControls,
      disabledReason: table === null ? '将光标放在表格中可编辑表格' : undefined,
    },
    { label: '审阅', content: reviewControls },
    { label: '查找', content: findControl },
  ]

  return (
    <div className="mimir-docx-toolbar" role="toolbar" aria-label="DOCX 编辑命令">
      <span className="mimir-docx-toolbar__style">{styleControl}</span>
      <span className="mimir-docx-toolbar__basic">{basicControls}</span>
      <span className="mimir-docx-toolbar__size">{sizeControls}</span>
      <span className="mimir-docx-toolbar__history">{historyControls}</span>
      <span className="mimir-docx-toolbar__find">{findControl}</span>
      <span className="mimir-docx-toolbar__align">{alignControls}</span>
      <span className="mimir-docx-toolbar__lists">{listControls}</span>
      <span className="mimir-docx-toolbar__categories">
        <ToolbarMenu
          label="字体"
          text="字体"
          renderPanel={() => (
            <ToolbarMenuFields label="字体">{sections[1]?.content}</ToolbarMenuFields>
          )}
        />
        <ToolbarMenu
          label="段落"
          text="段落"
          renderPanel={() => (
            <ToolbarMenuFields label="段落">{sections[2]?.content}</ToolbarMenuFields>
          )}
        />
        <ToolbarMenu
          label="插入"
          text="插入"
          renderPanel={() => <ToolbarMenuFields label="插入">{insertControls}</ToolbarMenuFields>}
        />
        {tableControls}
        <ToolbarMenu
          label="审阅"
          text="审阅"
          renderPanel={() => <ToolbarMenuFields label="审阅">{reviewControls}</ToolbarMenuFields>}
        />
      </span>
      <DocxMoreMenu sections={sections} />
    </div>
  )
}

/* ── 段落间距与缩进 ───────────────────────────────────────────── */

/*
 * 面板里「标签 + 控件」的摆法走外壳的 `ToolbarMenuFields`（原来这里是本地
 * `MenuFields` 手写 `div.me-menu__fields`，而那个类写在 `shell.css` 里——
 * 「样式表定义、外壳不产出」的耦合又多一处）。方向键的规矩一直在
 * `ToolbarMenu` 的 `onPanelKeyDown` 里（按事件来源判断，表单控件里的一律不抢）。
 */

/** 磅 → twips 的一组输入框共用的行 */
function TwipsField({
  label,
  pt,
  onCommit,
}: {
  label: string
  pt: number | null
  onCommit: (twips: number | null) => void
}) {
  return (
    <>
      <span className="me-label">{label}</span>
      <ToolbarNumberField
        label={label}
        value={pt ?? 0}
        suffix="磅"
        onCommit={(value) => onCommit(ptToTwips(value) === 0 ? null : ptToTwips(value))}
      />
    </>
  )
}

function ParagraphSpacingMenu({
  editor,
  state,
  disabled,
}: {
  editor: Editor
  state: DocxSnapshot
  disabled: boolean
}) {
  return (
    <ToolbarMenu
      label="段落间距与缩进"
      text="间距"
      emptyLabel="选中一段文字后可用"
      renderPanel={() => (
        <ToolbarMenuFields label="段落间距与缩进">
          <TwipsField
            label="段前"
            pt={twipsToPt(state.spaceBefore)}
            onCommit={(twips) => updateParagraphAttrs(editor, { spaceBefore: twips })}
          />
          <TwipsField
            label="段后"
            pt={twipsToPt(state.spaceAfter)}
            onCommit={(twips) => updateParagraphAttrs(editor, { spaceAfter: twips })}
          />
          <TwipsField
            label="左缩进"
            pt={twipsToPt(state.indentLeft)}
            onCommit={(twips) => updateParagraphAttrs(editor, { indentLeft: twips })}
          />
          <TwipsField
            label="右缩进"
            pt={twipsToPt(state.indentRight)}
            onCommit={(twips) => updateParagraphAttrs(editor, { indentRight: twips })}
          />
          {/*
            首行缩进。**负值是悬挂**：`generate.ts:1234-1238` 把负的
            `indentFirstLine` 写成 `w:hanging`，正的写成 `w:firstLine`。
          */}
          <TwipsField
            label="首行（负值=悬挂）"
            pt={twipsToPt(state.indentFirstLine)}
            onCommit={(twips) => updateParagraphAttrs(editor, { indentFirstLine: twips })}
          />
          <ToolbarLabel>未设置显示为 0</ToolbarLabel>
          <ToolbarButton
            label="清除这一段的间距与缩进"
            disabled={disabled}
            onClick={() =>
              updateParagraphAttrs(editor, {
                spaceBefore: null,
                spaceAfter: null,
                indentLeft: null,
                indentRight: null,
                indentFirstLine: null,
              })
            }
          >
            清除
          </ToolbarButton>
        </ToolbarMenuFields>
      )}
    />
  )
}

/**
 * 固定行距（`w:spacing w:line + w:lineRule`）。
 *
 * 与上面那个「行距倍数」是**两条不同的路**：倍数是 `w:lineRule="auto"` 加一个
 * 倍数，固定值是把行高钉死成多少磅。Word 的这个下拉也是分开的两个入口。
 */
function LineRuleMenu({
  editor,
  state,
  disabled,
}: {
  editor: Editor
  state: DocxSnapshot
  disabled: boolean
}) {
  return (
    <ToolbarMenu
      label="固定行距"
      text="固定行距"
      renderPanel={() => (
        <ToolbarMenuFields label="固定行距">
          <ToolbarSelect
            label="行距规则"
            value={state.lineRule === 'exact' || state.lineRule === 'atLeast' ? state.lineRule : ''}
            options={[
              { value: '', label: '自动（按倍数）' },
              { value: 'atLeast', label: '最小值' },
              { value: 'exact', label: '固定值' },
            ]}
            onChange={(value) => {
              if (value === '') {
                updateParagraphAttrs(editor, { lineRule: null, lineRawTwips: null })
                return
              }
              // 规则换了但没有值，Word 会按 0 处理（等于没有行距）：给一个当前值兜底
              updateParagraphAttrs(editor, {
                lineRule: value,
                lineRawTwips: state.lineRawTwips ?? ptToTwips(12),
              })
            }}
          />
          <TwipsField
            label="行高"
            pt={twipsToPt(state.lineRawTwips)}
            onCommit={(twips) =>
              updateParagraphAttrs(editor, {
                lineRawTwips: twips,
                lineRule: state.lineRule ?? 'exact',
              })
            }
          />
          <ToolbarLabel>固定值：钉死行高；最小值：不低于这个高度</ToolbarLabel>
          <ToolbarButton
            label="回到自动行距"
            disabled={disabled}
            onClick={() => updateParagraphAttrs(editor, { lineRule: null, lineRawTwips: null })}
          >
            回到自动
          </ToolbarButton>
        </ToolbarMenuFields>
      )}
    />
  )
}

/* ── 插入表格 ─────────────────────────────────────────────────── */

/** 尺寸网格的行列上限。Word 允许到 63 列，但网格做不了那么宽——够用即可 */
const GRID_MAX = 8

/** 网格里某一格的说明。模块级：它不捕获任何东西 */
const gridCellLabel = (row: number, column: number): string => `插入 ${row} 行 ${column} 列`

/**
 * 插入表格：8×8 的格子，点哪一格就插多大的表。
 *
 * 网格本体是外壳的 `ToolbarGridPicker`——**样式一直在 `shell.css`**（原语自己的
 * 样式表），却没有任何原语产出这些类名。现在 markup 与样式归同一处，这里只剩
 * 「点一格要插多大的表」这条业务判断。
 *
 * markdown 的「插入表格」是行/列两个数字框（它的方言要显式给行数），两条路
 * 各自合理：这里要的是「划过一片格子挑大小」，数格子比读两个数字直观。
 */
function InsertTablePanel({ editor }: { editor: Editor }) {
  return (
    <ToolbarMenuFields label="插入表格">
      <ToolbarGridPicker
        label="插入表格的大小"
        rows={GRID_MAX}
        columns={GRID_MAX}
        cellLabel={gridCellLabel}
        onPick={(row, column) => insertTable(editor, row, column)}
      />
    </ToolbarMenuFields>
  )
}

/* ── 插入链接 ─────────────────────────────────────────────────── */

function LinkPanel({
  editor,
  current,
  onDone,
}: {
  editor: Editor
  current: string | null
  onDone: () => void
}) {
  const [href, setHref] = useState(current ?? '')
  const apply = () => {
    const value = href.trim()
    if (value === '') return
    /*
     * `rId: null` **不能省**：关系 id 由保存路径上的 `allocateHyperlinkRel`
     * （`patch.ts:442-448`）分配、经 `:453` 进生成上下文、`generate.ts:2315`
     * 才写出 `r:id`。这里给一个非空的 rId 反而会指向一条不存在的关系。
     */
    runCommand(editor, 'setMark', 'link', { href: value, rId: null })
    onDone()
  }
  return (
    <ToolbarMenuFields label="链接地址">
      <span className="me-label">地址</span>
      <ToolbarTextField
        label="链接地址"
        value={href}
        onChange={setHref}
        onSubmit={apply}
        onCancel={onDone}
        placeholder="https://…"
      />
      <ToolbarButton label="应用链接" disabled={href.trim() === ''} onClick={apply}>
        应用
      </ToolbarButton>
      <ToolbarButton
        label="移除链接"
        onClick={() => {
          runCommand(editor, 'unsetMark', 'link')
          onDone()
        }}
      >
        移除
      </ToolbarButton>
    </ToolbarMenuFields>
  )
}

/* ── 表格 ─────────────────────────────────────────────────────── */

/**
 * 菜单里三个「读当前值」的下拉。
 *
 * 写成函数而不是就地 `as` 断言：`ToolbarSelect` 的选项类型是**字面量联合**，
 * 而 `getAttributes` 给的是 `string`。就地断言要写成 `value as 'exact'`，
 * 而那个断言在值是 `'atLeast'` 时是**假的**（TS 不会报，因为断言本来就
 * 允许收窄）——于是运行期传进一个不在选项里的值，下拉显示成第一项。
 * 这三个函数把「不是已知取值就回到默认档」写清楚。
 */
const rowHeightRule = (editor: Editor): 'atLeast' | 'exact' | '' => {
  const value = asString(editor.getAttributes('docTableRow').heightRule)
  return value === 'atLeast' || value === 'exact' ? value : ''
}

const tableAlign = (editor: Editor): 'left' | 'center' | 'right' => {
  const value = asString(editor.getAttributes('docTable').tblAlign)
  return value === 'center' || value === 'right' ? value : 'left'
}

const tableAutoFit = (editor: Editor): 'fixed' | 'contents' | 'window' => {
  const value = asString(editor.getAttributes('docTable').tblAutoFit)
  return value === 'contents' || value === 'window' ? value : 'fixed'
}

/**
 * 光标所在格的底纹（`w:tcPr/w:shd w:fill`）。没有就 `null`。
 *
 * **两个节点类型都要问**：正文格是 `docTableCell`、表头格是 `docTableHeader`
 * （`vAlign` / `borders` 那两处也是同一个原因各写一遍）。只问前者的症状是
 * 「光标在表头格里时色块全都不亮」——界面说「这里没有底纹」，而文件里其实有。
 */
const cellFill = (editor: Editor): string | null =>
  asString(editor.getAttributes('docTableCell').fill) ??
  asString(editor.getAttributes('docTableHeader').fill)

/**
 * 菜单项列表。
 *
 * **一行一个 `ToolbarMenuItemRow`（外壳原语），这里不再自己抄一遍 markup。**
 * 抄的那份漏掉了 `aria-current` 与「active 时打勾」——「当前值是这一项」于是
 * 只在 `items` 分支里有，混排面板里读不出来。规矩（当前值打勾、禁用时把
 * `title` 让给原因、点完关面板）现在只有一处实现。
 *
 * 这里保留 `ToolbarMenuItem` 这个中间形状，是因为表格菜单的项要**先算出来**
 * （可用性来自 `TableInfo`），而 `ToolbarMenu` 的 `items` 走的是另一条分支
 * （它不接受「菜单项 + 输入框混排」）。
 */
function TableActions({ items, close }: { items: readonly ToolbarMenuItem[]; close: () => void }) {
  return items.map((entry) => <ToolbarMenuItemRow key={entry.key} item={entry} close={close} />)
}

/**
 * 菜单项的两个构造器。
 *
 * **放在模块级而不是 `TableMenu` 里**：它们不捕获任何东西，写在组件里等于每次
 * 渲染重建一份（`unicorn(consistent-function-scoping)` 指出的正是这个）。
 */
function menuItem(key: string, label: string, run: () => void, blocked?: string): ToolbarMenuItem {
  return { key, label, onSelect: run, disabled: blocked !== undefined, disabledReason: blocked }
}

function menuSeparator(key: string): ToolbarMenuItem {
  return { key, label: '', separator: true }
}

/**
 * 表格菜单。**只在光标落在表格里时显示**（`isActive('docTable')`）。
 *
 * 每一项的可用性都按 prosemirror-tables 内部的守卫算过（整张表被选中时删不动
 * 行/列、没有跨格选区时合并不了、单格没跨行跨列时拆不了）——不用自己写一份
 * 「大概能不能」的判断，而是把同一份条件提前算出来给 `disabled` 用。
 *
 * `disabled` 这个 prop 只在「文档还没解析完」时影响这个菜单——而那时候
 * `tableInfo` 返回 null，整块都不渲染，所以它其实用不上（留着会让 lint 报
 * 未使用）。这里刻意不接：**表格菜单的可用性由光标位置决定，不由加载状态决定**。
 */
function TableMenu({ editor, table }: { editor: Editor; table: TableInfo | null }) {
  if (table === null) return null

  return (
    <ToolbarMenu
      label="表格"
      icon={<TableIcon />}
      renderPanel={(close) => (
        <>
          <TableActions
            items={[
              menuItem('row-before', '上方插入行', () => runTableCommand(editor, addRowBefore)),
              menuItem('row-after', '下方插入行', () => runTableCommand(editor, addRowAfter)),
              menuItem(
                'row-del',
                '删除行',
                () => runTableCommand(editor, deleteRow),
                table.canDeleteRow ? undefined : '整张表都在选区里，删行就没有表了',
              ),
              menuSeparator('sep-1'),
              menuItem('col-before', '左侧插入列', () => runTableCommand(editor, addColumnBefore)),
              menuItem('col-after', '右侧插入列', () => runTableCommand(editor, addColumnAfter)),
              menuItem(
                'col-del',
                '删除列',
                () => runTableCommand(editor, deleteColumn),
                table.canDeleteColumn ? undefined : '整张表都在选区里，删列就没有表了',
              ),
              menuSeparator('sep-2'),
              menuItem(
                'merge',
                '合并单元格',
                () => runTableCommand(editor, mergeCells),
                table.canMerge ? undefined : '先拖选一个矩形区域的多个单元格',
              ),
              menuItem(
                'split',
                '拆分单元格',
                () => runTableCommand(editor, splitCell),
                table.canSplit ? undefined : '这一格没有跨行也没有跨列',
              ),
              menuItem('table-del', '删除表格', () => runTableCommand(editor, deleteTable)),
            ]}
            close={close}
          />

          <ToolbarMenuSeparator />

          <ToolbarMenuFields label="单元格">
            {/*
              单元格底纹**内联**用外壳的取色器（`inline`，不套触发器与弹层）：
              它长在已经展开的表格菜单里，再开一层面板是两层弹层。
              以前这里照着 `ToolbarColorPicker` 的内部 markup 手抄了一排
              `button.me-color__cell`——抄漏了 `aria-pressed`，于是「这一格现在
              是什么底纹」在界面与读屏上都读不出来，而它看起来只是「点色块没
              反应」。现在两种形态共用同一份网格，那个漏项不可能再出现。

              `value` 走 `cellFill(editor)`（`docTableCell` 与 `docTableHeader`
              两个节点类型都问）：只问前者的症状是「光标在表头格里时色块全都
              不亮」——界面说这里没有底纹，而文件里其实有。
            */}
            <ToolbarColorPicker
              inline
              label="单元格底纹"
              value={cellFill(editor)}
              options={CELL_FILLS}
              onPick={(value) => runTableCommand(editor, setCellAttr('fill', value))}
              onClear={() => runTableCommand(editor, setCellAttr('fill', null))}
              clearLabel="清除底纹"
            />

            <ToolbarLabel>垂直对齐</ToolbarLabel>
            {/* docTableCell 与 docTableHeader 是两个节点类型，表头格也要能改 */}
            <ToolbarGroup label="垂直对齐">
              {(['top', 'center', 'bottom'] as const).map((value) => (
                <ToolbarButton
                  key={value}
                  label={value === 'top' ? '顶端对齐' : value === 'center' ? '居中' : '底端对齐'}
                  onClick={() => {
                    for (const name of ['docTableCell', 'docTableHeader']) {
                      if (hasNode(editor, name))
                        runCommand(editor, 'updateAttributes', name, { vAlign: value })
                    }
                  }}
                >
                  {value === 'top' ? '上' : value === 'center' ? '中' : '下'}
                </ToolbarButton>
              ))}
            </ToolbarGroup>

            <ToolbarLabel>边框</ToolbarLabel>
            <ToolbarGroup label="单元格边框">
              {(
                [
                  [
                    '全部',
                    {
                      top: { style: 'single', szEighths: 4 },
                      left: { style: 'single', szEighths: 4 },
                      bottom: { style: 'single', szEighths: 4 },
                      right: { style: 'single', szEighths: 4 },
                    },
                  ],
                  [
                    '无',
                    {
                      top: { style: 'none' },
                      left: { style: 'none' },
                      bottom: { style: 'none' },
                      right: { style: 'none' },
                    },
                  ],
                  ['下框线', { bottom: { style: 'single', szEighths: 8 } }],
                ] as const
              ).map(([label, borders]) => (
                <ToolbarButton
                  key={label}
                  label={`边框：${label}`}
                  onClick={() => {
                    for (const name of ['docTableCell', 'docTableHeader']) {
                      if (hasNode(editor, name))
                        runCommand(editor, 'updateAttributes', name, { borders })
                    }
                  }}
                >
                  {label}
                </ToolbarButton>
              ))}
            </ToolbarGroup>
          </ToolbarMenuFields>

          <ToolbarMenuSeparator />

          <ToolbarMenuFields label="表格属性">
            <ToolbarLabel>行高</ToolbarLabel>
            <ToolbarNumberField
              label="行高"
              value={Math.round(
                (asNumber(editor.getAttributes('docTableRow').heightTwips) ?? 0) / 20,
              )}
              suffix="磅"
              onCommit={(pt) => {
                runCommand(editor, 'updateAttributes', 'docTableRow', {
                  heightTwips: ptToTwips(pt) === 0 ? null : ptToTwips(pt),
                })
              }}
            />
            <ToolbarSelect<'atLeast' | 'exact' | ''>
              label="行高规则"
              value={rowHeightRule(editor)}
              options={[
                { value: '', label: '自动' },
                { value: 'atLeast', label: '最小值' },
                { value: 'exact', label: '固定值' },
              ]}
              onChange={(value) =>
                runCommand(editor, 'updateAttributes', 'docTableRow', {
                  heightRule: value === '' ? null : value,
                })
              }
            />
            <ToolbarButton
              label="重复标题行"
              active={editor.getAttributes('docTableRow').repeatHeader === true}
              onClick={() =>
                runCommand(editor, 'updateAttributes', 'docTableRow', {
                  repeatHeader: editor.getAttributes('docTableRow').repeatHeader !== true,
                  // edited 不能省：只在它被显式改过时保存路径才写回 trPr
                  repeatHeaderEdited: true,
                })
              }
            >
              重复标题行
            </ToolbarButton>

            <TwipsField
              label={`列宽（第 ${table.column + 1} 列）`}
              pt={twipsToPt(table.columnWidths?.[table.column] ?? null)}
              onCommit={(twips) => {
                if (twips !== null) setColumnWidth(editor, table.rect, table.column, twips)
              }}
            />
            {table.columnWidths === null && (
              <ToolbarLabel>这一列的宽度量不出来，先给表格设一个宽度</ToolbarLabel>
            )}

            <ToolbarLabel>单元格边距（磅）</ToolbarLabel>
            <ToolbarNumberField
              label="左边距"
              value={Math.round(
                (asNumber(editor.getAttributes('docTable').cellMar?.left) ?? 108) / 20,
              )}
              suffix="磅"
              onCommit={(pt) => {
                const current = (editor.getAttributes('docTable').cellMar ?? {}) as Record<
                  string,
                  number
                >
                runCommand(editor, 'updateAttributes', 'docTable', {
                  cellMar: { ...current, left: ptToTwips(pt) },
                  cellMarEdited: true,
                })
              }}
            />

            <ToolbarSelect<'left' | 'center' | 'right'>
              label="表格对齐"
              value={tableAlign(editor)}
              options={[
                { value: 'left', label: '左' },
                { value: 'center', label: '居中' },
                { value: 'right', label: '右' },
              ]}
              onChange={(value) =>
                runCommand(editor, 'updateAttributes', 'docTable', { tblAlign: value })
              }
            />

            <ToolbarSelect<'fixed' | 'contents' | 'window'>
              label="自动调整"
              value={tableAutoFit(editor)}
              options={[
                { value: 'fixed', label: '固定列宽' },
                { value: 'contents', label: '根据内容调整' },
                { value: 'window', label: '根据窗口调整' },
              ]}
              onChange={(value) =>
                runCommand(editor, 'updateAttributes', 'docTable', {
                  tblAutoFit: value,
                  // edited 不能省：只有它被显式改过，保存路径才写回 tblPr
                  tblAutoFitEdited: true,
                })
              }
            />

            {/*
              这两项**故意不给控件**。理由与「引用」不用 styleId 同源：
              `tblStyleId` 在画布上只渲染成 `data-tbl-style`（没有任何规则命中
              它——样式 CSS 来自未 vendored 的 docStyleCss），`tblLook` 连渲染
              都没有。改了只动 XML、屏幕不变，正是这个仓库最讨厌的一类按钮。
            */}
            <ToolbarLabel>表格样式、六边：这份文档没有可用的样式表，改了画布不动</ToolbarLabel>
          </ToolbarMenuFields>
        </>
      )}
    />
  )
}

/* ── 修订 ─────────────────────────────────────────────────────── */

/**
 * 修订（`w:ins` / `w:del`）。
 *
 * 收集修订是一次**全文遍历**，所以它写在面板里而不是工具条的快照里：面板只在
 * 展开时挂载，不展开就一次都不走。挂在快照里的话每敲一个字都要把整篇扫一遍。
 */
function RevisionsPanel({ editor, enabled }: { editor: Editor; enabled: boolean }) {
  /*
   * 收集修订是一次**全文遍历**。放在这个面板里（而不是工具条的快照里）是有意
   * 的：面板只在展开时挂载，不展开就一次都不走——挂在快照里的话每敲一个字都会
   * 把整篇扫一遍。
   */
  const revisions = collectRevisions(editor.state.doc)
  const none = revisions.length === 0
  const trackOn = useToolbarState(editor, (instance) =>
    trackChangesEnabled(instance) ? 'on' : 'off',
  )
  const on = trackOn === 'on'

  return (
    <>
      {/*
        开关修订：`aria-current` 表达「现在开着」。**不给 `close`**——这个面板
        是连着用的（开着修订 → 看下一处 → 接受/拒绝），点一下就收面板等于每做
        一步都要重开一次。
      */}
      <ToolbarMenuItemRow
        item={{
          key: 'track',
          label: on ? '关闭修订' : '打开修订',
          active: on,
          onSelect: () => setTrackChangesEnabled(editor, !on),
        }}
      />
      {/*
        只报数的说明项。禁用且**没有 `onSelect`**——它本来就不是一个动作，
        可点而无事发生正是最坏的一种。
      */}
      <ToolbarMenuItemRow
        item={{
          key: 'count',
          label: none ? '文档里没有修订' : `文档里有 ${revisions.length} 处修订`,
          disabled: true,
          disabledReason: none ? '文档里没有修订' : `文档里有 ${revisions.length} 处修订`,
        }}
      />
      <ToolbarMenuSeparator />
      {/*
        六条动作。**可用性只有一条判据**（文档里有没有修订），所以统一算一次；
        不可用时 `disabledReason` 说明为什么——六个灰着的行各自沉默等于让人猜。
      */}
      {(
        [
          ['接受这一处', () => acceptCurrentRevision(editor)],
          ['拒绝这一处', () => rejectCurrentRevision(editor)],
          ['接受全部', () => acceptAllRevisions(editor)],
          ['拒绝全部', () => rejectAllRevisions(editor)],
          ['上一处', () => gotoRevision(editor, -1)],
          ['下一处', () => gotoRevision(editor, 1)],
        ] as const
      ).map(([label, run]) => (
        <ToolbarMenuItemRow
          key={label}
          item={{
            key: label,
            label,
            onSelect: run,
            disabled: none,
            disabledReason: '文档里没有修订',
          }}
        />
      ))}
      <ToolbarMenuNote>
        {enabled ? '打开状态下输入的文字与删除都会记成修订' : '关闭状态下编辑不留修订记录'}
      </ToolbarMenuNote>
    </>
  )
}
