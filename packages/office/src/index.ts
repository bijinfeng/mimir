/**
 * `@mimir/office` —— Office 文档的浏览器内预览与编辑。
 *
 * ## 它是什么
 *
 * 引擎与编辑器 vendored 自 [GenOffice](https://github.com/genspark-ai/genoffice)
 * （Apache-2.0），见 `vendor/UPSTREAM.json` 与 `scripts/sync-upstream.mjs`。
 *
 * 为什么是它：调研（`.trellis/spec/project/research.md` §13）里没有第二条同时满足
 * **真编辑 + 无独立服务 + 许可宽松**的路——
 *   - ONLYOFFICE：1.9 GB 镜像 + 4 GB RAM 的独立容器
 *   - Collabora CODE：开发版官方明说「不适合生产」，生产版收费
 *   - CryptPad 路线：~580 MB 静态资源、AGPL §7 附加条款、堆内存下限 283 MB
 *   - 纯前端库（docx-preview / mammoth）：都只能预览，不能编辑
 * GenOffice 是**补丁式保存**：未改动的 zip 条目逐字节原样写回。实测——
 * 原样保存 11/11 条目字节相同；改一段只有 `word/document.xml` 变化
 * （2724 → 2739 字节，正好是新增 5 个汉字的 UTF-8 长度）。
 *
 * ## 三层结构
 *
 * ```
 * vendor/   vendored 的上游代码，**一律不改**（同步会覆盖）
 * src/shims/ 上游依赖的等价替代（i18n），改写规则把它们接起来
 * src/       mimir 自己的适配层：解析、编辑、保存的编排
 * ```
 *
 * ## 这一层对外只暴露四件事
 *
 * ```ts
 * const session = await openDocx(bytes)      // 解析 + 转 ProseMirror
 * session.content                            // 交给 Tiptap 渲染
 * const bytes = await session.save(pmDoc)    // 编辑后写回
 * ```
 *
 * UI（工具栏、分页容器）由调用方决定——上游的 ribbon 与办公壳没有 vendored
 * 进来，那是 mimir 自己的界面决定的。
 *
 * ## 三种格式，三条路（`.trellis/spec/project/architecture.md` §15.7）
 *
 * | 格式 | 怎么做 | 为什么 |
 * |---|---|---|
 * | docx | vendored 上游引擎 + 编辑器，**可编辑** | 编辑要求文件能读写回来，那是上游 134 个文件的价值 |
 * | xlsx | 自己写的网格解析（`xlsx.ts`，约 300 行），只读 | 「把表画出来」用不到上游的 Rust 侧车 + Univer |
 * | pptx | vendored 上游的**解析与渲染两层**，画成 SVG（`pptx-svg.ts`），只读 | 上游把保真逻辑做在纯数据的 RenderTree 里，适配器可换 |
 */

export { openDocx, type DocxSession } from './docx.js'
export type { SaveOptions as DocxSaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
export {
  DOCX_AGENT_TOOL_NAMES,
  DOCX_AGENT_OP_NAMES,
  createDocxAgentHandle,
  type DocxAgentHandle,
  type DocxAgentContext,
  type DocxAgentSelection,
  type DocxAgentExecuteOptions,
  type DocxAgentResult,
} from './agent/docx-agent.js'
export {
  HtmlAgentHandle,
  HTML_AGENT_TOOL_NAMES,
  HTML_OP_NAMES,
  type HtmlAgentResult,
} from './agent/html-agent.js'
export {
  createMarkdownAgentHandle,
  type MarkdownAgentHandle,
  type MarkdownAgentServices,
} from './agent/markdown-agent.js'
export { usePagination } from './pagination.js'
export { readXlsx, type XlsxCell, type XlsxSheet, type XlsxWorkbook } from './xlsx.js'
export { openXlsxForEdit, type XlsxCellRef, type XlsxEditSession } from './xlsx-edit.js'
export {
  openPptx,
  openPptxForEdit,
  // 编辑入口的两个判别函数：一处定义，界面与测试都用它（散开写必然有
  // 一处漏掉 'shape'——而那种漏是静默的：形状选不上，用户以为它不能编辑）
  editableElements,
  textOfElement,
  type PptxDeck,
  type PptxEditSession,
} from './pptx.js'
export {
  renderSlide,
  renderDeck,
  type RenderPptxOptions,
  type RenderedSlide,
  type PptxRenderable,
  type PptxMetrics,
} from './pptx-render.js'
export {
  pageFootnotesOf,
  makeGapNotesEl,
  notesAreaHeight,
  FOOTNOTE_SEPARATOR_H,
  type FootnoteContext,
} from './footnotes.js'
export type { Block } from '../vendor/packages/docx-engine/src/types.js'

/**
 * 界面层（D-054）：外壳与三种 Office 编辑器。
 *
 * 界面放在这个包里而不是 `apps/web`，理由是四种编辑器（docx / xlsx / pptx /
 * markdown 笔记）的外壳必须长得一样，而「一样」只能由同一份实现保证——
 * 各写一份的漂移只在用户眼里看得出来。宿主因此只负责「给字节 / 收回字节」
 * 与主题变量，不参与编辑器的布局。
 */
export {
  EditorShell,
  EditorState,
  ToolbarButton,
  ToolbarConfirm,
  ToolbarDivider,
  ToolbarGridPicker,
  ToolbarGroup,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarMenuItemRow,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarMenuSeparator,
  ToolbarNote,
  ToolbarNotice,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarSpacer,
  ToolbarTabs,
  ToolbarTextArea,
  ToolbarTextButton,
  ToolbarTextField,
  ToolbarToggleGroup,
  ToolbarColorPicker,
  ToolbarFileButton,
  FindReplaceBar,
  useToolbarState,
  type EditorShellProps,
  type FindAdapter,
  type FindReplaceAdapter,
  type FindReplaceBarProps,
  type ToolbarButtonProps,
  type ToolbarColorOption,
  type ToolbarColorPickerProps,
  type ToolbarConfirmProps,
  type ToolbarFileButtonProps,
  type ToolbarGridPickerProps,
  type ToolbarMenuItem,
  type ToolbarMenuItemRowProps,
  type ToolbarMenuProps,
  type ToolbarNumberFieldProps,
  type ToolbarSelectOption,
  type ToolbarSelectProps,
  type ToolbarTextAreaProps,
  type ToolbarTextButtonProps,
  type ToolbarTextFieldProps,
  type ToolbarToggleGroupProps,
  type ToolbarToggleOption,
} from './shell/EditorShell.js'
export {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BlankPageIcon,
  BoldIcon,
  BulletListIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClearFormatIcon,
  CloseIcon,
  CodeBlockIcon,
  CodeIcon,
  CopyIcon,
  CropIcon,
  CrossHighlightIcon,
  DeviceDesktopIcon,
  DevicePhoneIcon,
  DeviceTabletIcon,
  EraserIcon,
  EyeIcon,
  FileImportIcon,
  FindIcon,
  FontGrowIcon,
  FontShrinkIcon,
  HeadingIcon,
  HighlightIcon,
  HorizontalRuleIcon,
  ImageIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  ListOpsIcon,
  LtrIcon,
  OrderedListIcon,
  OutdentIcon,
  PageBreakIcon,
  PaintFormatIcon,
  ParaShadingIcon,
  QuoteIcon,
  RedoIcon,
  ReverseOrderIcon,
  RotateCcwIcon,
  RotateCwIcon,
  RtlIcon,
  SaveIcon,
  SearchIcon,
  SpellCheckIcon,
  SplitViewIcon,
  StrikeIcon,
  SubscriptIcon,
  SuperscriptIcon,
  TableIcon,
  TaskListIcon,
  TextColorIcon,
  TrackChangesIcon,
  TrashIcon,
  UnderlineIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './shell/icons.js'
export { statusText, useSource, type SourceHandle } from './editors/use-source.js'
export { OFFICE_MIME, type EditorIo, type EditorProps, type SaveTarget } from './editors/types.js'
export {
  DocxEditor,
  DocxToolbar,
  type DocxEditorProps,
  type DocxToolbarProps,
} from './editors/DocxEditor.js'
export { XlsxEditor } from './editors/XlsxEditor.js'
export { PptxEditor } from './editors/PptxEditor.js'
export {
  MarkdownEditor,
  MarkdownToolbar,
  type MarkdownEditorProps,
  type MarkdownImageUpload,
  type MarkdownToolbarProps,
} from './editors/MarkdownEditor.js'
export { MarkdownSearchHighlight, markdownFindAdapter } from './editors/markdown-find.js'
/**
 * markdown 方言的工具条逻辑。**导出**是有意的：宿主（`apps/web`）拿着真方言，
 * 只有它能验证这些行为（`apps/web/src/editor/markdown-toolbar.test.tsx`）。
 * 不导出的话那些判据就只能靠人肉点界面，而这个仓库最怕的正是「人肉点不出来
 * 的静默失效」。
 */
export {
  PARAGRAPH_STYLES,
  applyLink,
  applyParagraphStyle,
  canInsertTable,
  codeLanguageOptions,
  currentCodeLanguage,
  currentColumnAlign,
  currentLinkHref,
  indentStateOf,
  listItemNameAt,
  listItemNameFromState,
  nodeNameOfStyle,
  paragraphStyleOf,
  removeLink,
  setCodeLanguage,
  setColumnAlign,
  styleFromToolbarState,
  taskListToggleBlockedReason,
  toggleWholeTaskList,
  toolbarHas,
  toolbarStateOf,
  wholeListRange,
  type ColumnAlign,
  type IndentState,
  type ListItemName,
  type ParagraphStyle,
} from './editors/markdown-format.js'
export { HtmlEditor, type HtmlAgentServices } from './editors/HtmlEditor.js'
export type { PptxAiSnapshotDraft } from './editors/pptx-ai-snapshot.js'
export { PdfEditor } from './editors/PdfEditor.js'
export { PdfAgentHandle, PDF_PAGE_AGENT_OPS } from './agent/pdf-agent.js'
export {
  hasCommand,
  hasMark,
  hasNode,
  runCommand,
  runCommandChain,
  toggleMarkByName,
  type CommandStep,
} from './shell/editor-commands.js'
