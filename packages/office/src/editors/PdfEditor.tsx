/**
 * PDF 画布：pdf.js 渲染与文字层、pdf-lib 页面结构、宿主 PDFium 内容流写入。
 * 页面模型是 `PdfPageRef`；手动命令与 Agent 页面操作共用它。点击页面插字
 * 由 pdf.js viewport 换算到 PDF 坐标，再经鉴权宿主返回真实字节。内容字节在
 * 保存前保留为工作副本，画布和文字索引立即切换到该副本；保存成功才更新基线。
 *
 * 原文整段可点选并由宿主核验后替换或标注；查找命中的子串未核验，查找栏仍只读。
 * 页面裁剪和纸型在保存前仍是待生效结构；本地工具与保存物化同一工作副本，
 * 保留原生表单和书签。未知 Catalog、签名和活动动作继续由宿主拒绝。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  EditorShell,
  EditorState,
  FindReplaceBar,
  ToolbarButton,
  ToolbarConfirm,
  ToolbarFileButton,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuItemRow,
  ToolbarMenuNote,
  ToolbarMenuSeparator,
  ToolbarNotice,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextField,
  ToolbarTextArea,
  useFindHotkey,
  type FindAdapter,
  type ToolbarMenuItem,
} from '../shell/EditorShell.js'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileImportIcon,
  FindIcon,
  RedoIcon,
  SaveIcon,
  TrashIcon,
  UndoIcon,
} from '../shell/icons.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import type { FindOptions } from '../shims/ui.js'
import {
  cancelPdfRender,
  loadPdfDocument,
  renderPdfPages,
  retainPdfDocuments,
  type PdfRenderHandle,
} from './pdf-render.js'
import {
  BLANK_PAGE_SIZE,
  CROP_PRESETS,
  displaySize,
  isPristine,
  maxCropInset,
  paperForPage,
  paperKeyOf,
  PAPER_KEYS,
  PAPER_SIZES,
  projectBox,
  readPdfPages,
  sameLayout,
  screenSize,
  visibleBox,
  visibleSize,
  withCrop,
  withPaper,
  withRotation,
  type PaperKey,
  type PdfCropInsets,
  type PdfPageRef,
} from './pdf-pages.js'
import {
  buildPdfTextIndex,
  pickPdfTextRun,
  searchPdfText,
  type PdfMatch,
  type PdfRect,
  type PdfTextIndex,
  type PdfTextRun,
} from './pdf-text.js'
import { ThumbnailSidebar } from './ThumbnailSidebar.js'
import {
  PdfAgentHandle,
  type PdfAgentSnapshot,
  type PdfAgentTextInsert,
  type PdfPendingTextInsert,
} from '../agent/pdf-agent.js'
import {
  executePdfContentTool,
  type PdfHostAnnotations,
  type PdfHostForms,
  type PdfHostBlocks,
} from '../agent/pdf-content-agent.js'
import type { PdfHostImages } from '../agent/pdf-image-agent.js'
import {
  PDF_LOCAL_TOOLS,
  pdfLocalToolOperation,
  type PdfHostLocal,
  type PdfLocalOutput,
} from '../agent/pdf-local-agent.js'
import { PdfHistory } from '../agent/pdf-history.js'
import { buildPdfWorkingCopy } from '../agent/pdf-working-copy.js'
import {
  buildPdfBatchCandidate,
  replayPdfPendingText,
  type PdfPendingTextState,
} from '../agent/pdf-batch.js'
import {
  usePdfDrawingCanvas,
  usePdfDrawingPreview,
  PdfDrawingRibbonIcon,
} from './PdfDrawingCanvas.js'
import { PdfLocalAssetRequest, PdfLocalPanel, type PdfLocalPanelMode } from './PdfLocalPanel.js'
import { PdfImagePanel } from './PdfImagePanel.js'
import { PdfImageExportControls } from './PdfImageExportControls.js'
import { usePdfRedactionCopy } from './PdfRedactionCopy.js'
import { PdfTextBlockPanel } from './PdfTextBlockPanel.js'
import { groupPdfTextBlocks, pickPdfTextBlock, type PdfTextBlock } from './pdf-text-blocks.js'
import { PdfInspector, PdfInspectorHeader, focusPdfInspectorTrigger } from './PdfInspector.js'
import { PdfFormPanel } from './PdfFormPanel.js'
import type { PdfAnnotation, PdfFormSnapshot, PdfImageSnapshot, PdfLocalInfo } from '@mimir/shared'
import { usePdfSignature } from './PdfSignatureCanvas.js'
import { PenLine } from 'lucide-react'
import { CompactToolbar } from './CompactToolbar.js'
import './compact-toolbar.css'
import '../shell/shell.css'
import './editors.css'
import './pptx-pdf-toolbar.css'

/** 画布宽度（px）。与 pptx 同一档，换文件时视觉宽度不变 */
const FIT_WIDTH_PX = 900

/** 缩放范围。超出这个区间纸会小到看不清或大到没法用（与按钮的禁用理由一致） */
const ZOOM_MIN = 40
const ZOOM_MAX = 240
const ZOOM_STEP = 20

/** 没有导入页时的空表。**模块级常量**：每次渲染新建一个 Map 会让下游的依赖比较永远不等 */
const NO_IMPORTS: ReadonlyMap<string, Uint8Array> = new Map()

export interface PdfHostApply {
  (request: {
    bytes: Uint8Array
    expectedVersion: number
    kind: 'edit' | 'insert'
    items: unknown[]
    signal?: AbortSignal
  }): Promise<{ bytes: Uint8Array; version: number }>
}

export interface PdfInspectedTextTarget {
  sha256: string
  pageIndex: number
  objectIndex: number
  text: string
  bounds: [number, number, number, number]
}

export interface PdfHostInspect {
  (request: {
    bytes: Uint8Array
    probe: {
      pageIndex: number
      rect: [number, number, number, number]
      oldText: string
    }
    signal?: AbortSignal
  }): Promise<PdfInspectedTextTarget>
}

export interface PdfHostMarkup {
  (request: {
    bytes: Uint8Array
    expectedVersion: number
    markup: { target: PdfInspectedTextTarget; type: 'highlight' | 'underline' | 'strikeout' }
    signal?: AbortSignal
  }): Promise<{ bytes: Uint8Array; version: number }>
}

interface PdfWorkingBytes {
  source: Uint8Array
  bytes: Uint8Array
  /** Geometry verified before publication; avoids a loading/remount gap on byte changes. */
  structure: Awaited<ReturnType<typeof readPdfPages>>
}

interface PdfSavedBaseline {
  documentId: string
  source: Uint8Array
  bytes: Uint8Array
}

function samePendingInsert(left: PdfPendingTextInsert, right: PdfPendingTextInsert): boolean {
  return (
    left.id === right.id &&
    left.pageIndex === right.pageIndex &&
    left.x === right.x &&
    left.y === right.y &&
    left.text === right.text &&
    left.fontSize === right.fontSize &&
    left.color.every((value, index) => value === right.color[index])
  )
}

/** Keep operation cleanup on every success and failure path without a finalizer in a component. */
async function runWithCleanup<T>(run: () => Promise<T>, cleanup: () => void): Promise<T> {
  try {
    return await run()
  } finally {
    cleanup()
  }
}

/**
 * 一次改动：新的页面结构、导入的字节，以及**它是为哪一份字节做的**。
 *
 * 把「属于哪一份字节」一起存下来，于是换文档（或保存后重读）时**不需要一个
 * effect 去清空它**——比较字节即可，旧改动自然作废。
 *
 * 用 effect 清空会踩 `set-state-in-effect`（多一轮渲染），而且那一轮里界面
 * 处于「新文件 + 旧页面结构」的不一致状态——页数对不上、点删除会删错页。
 *
 * **导入的字节必须跟改动一起存**：导入的页在原件里根本不存在，丢了它
 * 第一次保存成功、第二次保存就把那些页静默丢掉（两次都报成功）。
 */
interface PdfEdit {
  bytes: Uint8Array
  pages: PdfPageRef[]
  imports: ReadonlyMap<string, Uint8Array>
  /**
   * **磁盘上那份文件**的结构与它需要的导入字节。`null` = 还没保存过，
   * 那时基线就是打开文件时解析出来的原件结构。
   *
   * ## 为什么必须有这一项（保存之后才看得出来的两个错）
   *
   * 保存成功后，加载时的 `source.bytes` 仍是旧字节；工作副本承接刚保存的
   * 字节。后续页面改动必须相对刚保存的结构比较。否则：
   *
   *   - 「有没有改动」若只比旧的原件，**保存完仍会显示有改动**（真浏览器里
   *     实测到：字节已经写出 2075 字节，状态行还挂着「已修改，未保存」）
   *   - 用户保存完再把手动的那一页转回去时，界面会说「没有改动」并把保存
   *     按钮变灰——**而磁盘上的文件是转过的那一份**，他再也退不回来
   *
   * 两者都是「拿旧基线当真相」。所以保存成功时把**刚写出的结构**记成新的
   * 基线，判据从「与原件比」改成「与磁盘上那份比」。
   */
  file: { pages: PdfPageRef[]; imports: ReadonlyMap<string, Uint8Array> } | null
}

/**
 * 命中的高亮。
 *
 * ## 为什么它是一份外部 store，而不是 `useState`
 *
 * `search` / `activate` / `clear` 由**查找栏**调用（`FindReplaceBar` 在自己的
 * effect 里发起搜索），而结果要画在本组件的画布上。用 `setState` 会变成「在
 * effect 里同步 setState」——那是 `react(set-state-in-effect)` 报的东西，也是
 * React Compiler 会因此**静默跳过整个组件**的那一类（铁律 1）。
 *
 * `useSyncExternalStore` 是 React 给「读外部可变来源」的答案，`EditorShell.tsx`
 * 的查找栏自己也用同一个手法（那个 `createFindStore`）。这里的快照多一维：
 * 除了「共几处」「第几处」，还有**每一处的矩形**（要画出来）。
 *
 * ## 发布要能判定「没变」
 *
 * `publish` 在快照没变时**不通知**，否则「渲染 → 适配器新建 → 重扫 → 发布
 * → 渲染」会转成一个死循环。判据是矩形数组的**引用**相等，所以 `search` 对
 * 同样的查询复用同一份结果（见 `PdfFindCache`）——引用相等比深比较便宜，
 * 也比它更不容易出意外。
 */
interface FindHighlight {
  matches: readonly PdfMatch[]
  /** 当前那一处在 `matches` 里的下标 */
  at: number
}

const NO_HIGHLIGHT: FindHighlight = { matches: [], at: 0 }

function createHighlightStore() {
  let snapshot: FindHighlight = NO_HIGHLIGHT
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    publish(next: FindHighlight) {
      if (next.matches === snapshot.matches && next.at === snapshot.at) return
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

/**
 * 这一页要用的字节与页号。
 *
 * 画布与文字层都从这里取——**导入的页**要读导入的那一份字节（原件里没有
 * 它们），空白页没有来源（返回 null，画布画一张占位纸）。
 */
function sourceOf(
  ref: PdfPageRef,
  bytes: Uint8Array | null,
  imports: ReadonlyMap<string, Uint8Array>,
): { bytes: Uint8Array | null; index: number } {
  const origin = ref.origin
  if (origin.kind === 'blank') return { bytes: null, index: 0 }
  if (origin.kind === 'imported') {
    return { bytes: imports.get(origin.source) ?? null, index: origin.index }
  }
  return { bytes, index: origin.index }
}

/** 页序里这一项的稳定标识。用来判断「文字层要不要重扫」 */
function pageKey(ref: PdfPageRef): string {
  const origin = ref.origin
  const where =
    origin.kind === 'original'
      ? `o${origin.index}`
      : origin.kind === 'blank'
        ? 'b'
        : `i${origin.source}:${origin.index}`
  return `${where}@${ref.rotation}`
}

export function PdfEditor({
  documentId,
  io,
  onDirtyChange,
  onAgentHandleChange,
  hostApply,
  hostInspect,
  hostMarkup,
  hostAnnotations,
  hostForms,
  hostImages,
  hostBlocks,
  hostLocal,
  flush = false,
}: EditorProps & {
  onAgentHandleChange?: (handle: PdfAgentHandle | null) => void
  hostApply?: PdfHostApply
  hostInspect?: PdfHostInspect
  hostMarkup?: PdfHostMarkup
  hostAnnotations?: PdfHostAnnotations
  hostForms?: PdfHostForms
  hostImages?: PdfHostImages
  hostBlocks?: PdfHostBlocks
  hostLocal?: PdfHostLocal
}) {
  const source = useSource(io, documentId)
  const [working, setWorking] = useState<PdfWorkingBytes | null>(null)
  const activeWorking = working?.source === source.bytes ? working : null
  const currentBytes = activeWorking?.bytes ?? source.bytes
  const history = useMemo(
    () => ({ documentId, source: source.bytes, history: new PdfHistory() }),
    [documentId, source.bytes],
  ).history
  const historyVersion = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
    history.getSnapshot,
  )
  const historySavedRef = useRef<Uint8Array | null>(null)
  const [savedBaseline, setSavedBaseline] = useState<PdfSavedBaseline | null>(null)
  const activeSavedBaseline =
    savedBaseline?.documentId === documentId && savedBaseline.source === source.bytes
      ? savedBaseline
      : null
  const savedBytes = activeSavedBaseline?.bytes ?? source.bytes
  const [pendingText, setPendingText] = useState<PdfPendingTextState | null>(null)
  const activePendingText =
    pendingText?.documentId === documentId && pendingText.source === source.bytes
      ? pendingText
      : null
  const [insertMode, setInsertMode] = useState(false)
  const [insertPoint, setInsertPoint] = useState<{ page: number; origin: [number, number] } | null>(
    null,
  )
  const [insertText, setInsertText] = useState('')
  const [pendingEditorOpen, setPendingEditorOpen] = useState(false)
  const [selectTextMode, setSelectTextMode] = useState(false)
  const [selectedText, setSelectedText] = useState<{
    bytes: Uint8Array
    key: string
    run: PdfTextRun
    target?: PdfInspectedTextTarget
  } | null>(null)
  const [inspectingText, setInspectingText] = useState(false)
  const [replacementDraft, setReplacementDraft] = useState('')
  const [markupFeedback, setMarkupFeedback] = useState<{
    bytes: Uint8Array
    key: string
    run: PdfTextRun
    type: 'highlight' | 'underline' | 'strikeout'
  } | null>(null)
  const inspectRequestRef = useRef(0)
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null)
  const [pendingDraft, setPendingDraft] = useState<{
    id: string
    text: string
    x: number
    y: number
    fontSize: number
    color: string
  } | null>(null)
  const [contentBusy, setContentBusy] = useState(false)
  const [assetRequest, setAssetRequest] = useState<{
    tool: string
    confirm(file: File): void
    cancel(): void
  } | null>(null)
  const [localMode, setLocalMode] = useState<PdfLocalPanelMode | null>(null)
  const [localInfo, setLocalInfo] = useState<{
    bytes: Uint8Array
    pages?: readonly PdfPageRef[]
    info: PdfLocalInfo
  } | null>(null)
  const [localOutputs, setLocalOutputs] = useState<PdfLocalOutput[]>([])
  const localTriggerRef = useRef<HTMLButtonElement>(null)
  const signatureTriggerRef = useRef<HTMLButtonElement>(null)
  const imagesTriggerRef = useRef<HTMLButtonElement>(null)
  const formsTriggerRef = useRef<HTMLButtonElement>(null)
  const annotationsTriggerRef = useRef<HTMLButtonElement>(null)
  const deferredInspectorFocus = useRef<{
    documentId: string
    trigger: HTMLButtonElement | null
    editor: Element | null
    sectionKey: string
  } | null>(null)
  const [imagesOpen, setImagesOpen] = useState(false)
  const [imageExportOpen, setImageExportOpen] = useState(false)
  const [redactionOpen, setRedactionOpenState] = useState(false)
  const redactionRequestRef = useRef<AbortController | null>(null)
  const setRedactionOpen = (open: boolean) => {
    if (!open) redactionRequestRef.current?.abort()
    setRedactionOpenState(open)
  }
  const redactionTriggerRef = useRef<HTMLButtonElement>(null)
  const [blocksOpen, setBlocksOpen] = useState(false)
  const blocksTriggerRef = useRef<HTMLButtonElement>(null)
  const [blockSelection, setBlockSelection] = useState<{
    bytes: Uint8Array
    key: string
    block: PdfTextBlock
  } | null>(null)
  const imageExportTriggerRef = useRef<HTMLButtonElement>(null)
  const [imageList, setImageList] = useState<{
    bytes: Uint8Array
    snapshot: PdfImageSnapshot
  } | null>(null)
  const [imageSelection, setImageSelection] = useState<number | null>(null)
  const [formsOpen, setFormsOpen] = useState(false)
  const [formsReading, setFormsReading] = useState(false)
  const formsReadRequest = useRef(0)
  const [formList, setFormList] = useState<{
    bytes: Uint8Array
    pages?: readonly PdfPageRef[]
    snapshot: PdfFormSnapshot
  } | null>(null)
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  useEffect(() => {
    const pending = deferredInspectorFocus.current
    if (!pending) return
    if (
      pending.documentId !== documentId ||
      imagesOpen ||
      formsOpen ||
      annotationsOpen ||
      blocksOpen ||
      localMode !== null
    ) {
      deferredInspectorFocus.current = null
      return
    }
    if (contentBusy) {
      const cancelDeferredFocus = () => {
        deferredInspectorFocus.current = null
      }
      document.addEventListener('focusin', cancelDeferredFocus)
      return () => document.removeEventListener('focusin', cancelDeferredFocus)
    }
    deferredInspectorFocus.current = null
    if (document.activeElement === document.body && pending.editor?.isConnected) {
      focusPdfInspectorTrigger(pending.trigger, pending.editor, pending.sectionKey)
    }
  }, [contentBusy, documentId, imagesOpen, formsOpen, annotationsOpen, blocksOpen, localMode])
  const [annotationList, setAnnotationList] = useState<{
    bytes: Uint8Array
    items: PdfAnnotation[]
  } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteId, setNoteId] = useState('')
  const [noteX, setNoteX] = useState(40)
  const [noteY, setNoteY] = useState(40)
  /**
   * 当前页号，以及**它是哪一份文档的页号**。
   *
   * 与 `useSource` 的 `loaded` 同一个手法：把身份与值放在一起，换文档时
   * 不需要 effect 去清空（那会多一轮渲染，而那一轮里显示的是新文档的第 7 页）。
   * 保存后 `source.bytes` 会换新，但 `documentId` 不变——所以页号**保留**，
   * 用户不会在保存后被打回第一页。
   */
  const [nav, setNav] = useState<{ doc: string; at: number }>({ doc: documentId, at: 0 })
  const active = nav.doc === documentId ? nav.at : 0
  const [renderError, setRenderError] = useState<string | null>(null)
  /** 界面级错误（导入失败、文字层读不出来）。画布的渲染错误走 `renderError` */
  const [notice, setNotice] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [edit, setEdit] = useState<PdfEdit | null>(null)
  /** 查找栏开着吗，以及它的三个受控值（栏本身是受控的） */
  const [findOpen, setFindOpen] = useState(false)
  useFindHotkey(() => setFindOpen(true))
  const [findQuery, setFindQuery] = useState('')
  const [findOptions, setFindOptions] = useState<FindOptions>({
    matchCase: false,
    wholeWord: false,
  })
  /**
   * 文字层索引，以及**它是为哪一份页序扫的**。
   *
   * 旋转、调序、导入都会让矩形失效（矩形按旋转换算，页号按顺序算），所以
   * 索引记下它对应的 `key`——与 `patch`/`loaded` 同一条思路：比较身份，而不是
   * 用一个 effect 去清空。
   */
  const [textIndex, setTextIndex] = useState<{
    bytes: Uint8Array
    key: string
    index: PdfTextIndex
  } | null>(null)
  /** 扫描进度（`null` 表示还没报过进度）。大文档扫起来要几秒，得让人看见在动 */
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null)
  const [highlightStore] = useState(createHighlightStore)
  const highlight = useSyncExternalStore(highlightStore.subscribe, highlightStore.getSnapshot)
  const canvasRef = useRef<HTMLDivElement>(null)
  const agentRef = useRef<PdfAgentHandle | null>(null)
  const getBlockVersion = useCallback(() => agentRef.current?.getVersion() ?? 0, [])
  const agentSnapshotRef = useRef<PdfAgentSnapshot | null>(null)
  const agentApplyRef = useRef<(pages: PdfPageRef[]) => void>(() => {})
  const agentGoToRef = useRef<(index: number) => void>(() => {})
  const agentTextRef = useRef<() => Promise<PdfTextIndex>>(() =>
    Promise.reject(new Error('PDF 文字层未就绪')),
  )
  const agentInsertRef = useRef<
    (
      input: PdfAgentTextInsert,
      version: number,
      signal?: AbortSignal,
    ) => Promise<PdfPendingTextInsert>
  >(() => Promise.reject(new Error('PDF 文字写入尚未就绪')))
  const agentPendingRef = useRef<PdfPendingTextState | null>(null)
  const pageMutationVersionRef = useRef(0)
  const savedBaselineRef = useRef<PdfSavedBaseline | null>(null)
  const savingPendingRef = useRef<{
    documentId: string
    source: Uint8Array
    workingBytes: Uint8Array
    edit: PdfEdit | null
    bytes: Uint8Array
    inserts: readonly PdfPendingTextInsert[]
  } | null>(null)
  const agentReplaceRef = useRef<
    (
      inserts: readonly PdfPendingTextInsert[],
      version: number,
      signal?: AbortSignal,
    ) => Promise<void>
  >(() => Promise.reject(new Error('PDF 文字写入尚未就绪')))
  const agentContentRef = useRef<
    (
      tool: string,
      args: Record<string, unknown>,
      version: number,
      signal?: AbortSignal,
      manual?: boolean,
    ) => Promise<{ changed: boolean; data?: unknown }>
  >(() => Promise.reject(new Error('PDF 内容执行器未就绪')))
  const agentCaptureRef = useRef<() => unknown>(() => null)
  const agentRestoreRef = useRef<(state: unknown) => void>(() => {})
  const agentContentReady =
    hostApply !== undefined ||
    hostForms !== undefined ||
    hostImages !== undefined ||
    hostBlocks !== undefined ||
    hostLocal !== undefined
  const batchLiveRef = useRef<{
    documentId: string
    source: Uint8Array | null
    edit: PdfEdit | null
    saving: boolean
  } | null>(null)
  const contentAbortRef = useRef<AbortController | null>(null)
  useEffect(() => () => contentAbortRef.current?.abort(), [])
  const onAgentHandleChangeRef = useRef(onAgentHandleChange)
  useEffect(() => {
    onAgentHandleChangeRef.current = onAgentHandleChange
  }, [onAgentHandleChange])

  /**
   * 打开文档：读每页的可视区尺寸与旋转（一次 pdf-lib 加载）。
   *
   * 之后所有操作都在这份结构上做（pdf.js 只负责画与取文字，不参与修改）。
   * `readPdfPages` 取的是 **CropBox** 而不是 MediaBox——用户看到的是 CropBox
   * 那一块，取 MediaBox 会让界面上的尺寸比实际大一圈。
   */
  const opened = useParsed(currentBytes, readPdfPages)

  const currentStructure = activeWorking?.structure ?? opened.value

  /** 打开时的页面结构（没有任何改动时的页序） */
  const original = useMemo<PdfPageRef[] | null>(() => {
    if (currentStructure === null) return null
    return currentStructure.map((entry, index) => ({
      origin: { kind: 'original', index },
      rotation: entry.rotation,
      base: { width: entry.width, height: entry.height },
      crop: null,
      paper: null,
    }))
  }, [currentStructure])
  const ready = original !== null

  /** 当前的改动（属于这一份字节才作数） */
  const settled =
    edit !== null && currentBytes !== null && edit.bytes === currentBytes ? edit : null

  /**
   * 当前页序与旋转：有改动时用改动，否则用解析出来的原样。
   *
   * **引用要稳**（`useMemo` + state）：它是文字层与查找适配器的依赖，每次渲染
   * 新建一份会让它们跟着重建（重扫整份文档）。
   */
  const layout = useMemo<PdfPageRef[]>(() => settled?.pages ?? original ?? [], [settled, original])
  const imports = settled?.imports ?? NO_IMPORTS
  const imageExportIdentity = useMemo(
    () => ({ documentId, currentBytes, layout, historyVersion }),
    [documentId, currentBytes, layout, historyVersion],
  )
  const retainedSources = useMemo(
    () => [currentBytes, ...imports.values()],
    [currentBytes, imports],
  )
  useEffect(() => retainPdfDocuments(retainedSources), [retainedSources])
  useEffect(() => () => retainPdfDocuments([]), [])
  const thumbnailPages = useMemo(
    () => layout.map((ref, index) => ({ key: `${index}:${pageKey(ref)}` })),
    [layout],
  )

  /** 当前页号夹进有效范围。页数变少（删页、换文档）时**在渲染期导出**，不留中间态 */
  const at = Math.min(active, Math.max(0, layout.length - 1))
  const page = layout[at] ?? null

  /**
   * 有未保存的改动吗。
   *
   * ## 判据是**结构**，不是「有没有操作过」
   *
   * 转过去再转回来仍是原样，那时保存按钮该是灰的——否则「什么都没改」也会把
   * 整份文件重写一遍（而文件字节会全变）。没保存过时基线的原件
   * （`isPristine` 比的就是它）。
   *
   * ## 保存过之后基线换成**磁盘上那份**
   *
   * 见 `PdfEdit.file`：拿旧原件当基线会让「保存完仍显示已修改」与「转回去
   * 之后退不回来」两个错同时出现。
   */
  /**
   * 一份页面结构与**磁盘上那份文件**相同吗。
   *
   * 抽成函数是为了让两处共用同一套判据：渲染期的 `dirty`（保存按钮、状态行）
   * 与事件期的 `onDirtyChange`（宿主离开前的拦截）。两处各写一遍必然漂移，
   * 而漂移的症状就是「按钮灰着但保存被拦下」。
   *
   * **必须用 `useCallback`**：它进 `applyPages` 的闭包，而 `applyPages` 又被
   * 工具条的事件用；不固定引用的话每次渲染都是新的（不致命，但 React Compiler
   * 会因此放弃对下面那串 `useMemo` 的优化）。
   */
  const matchesFile = useCallback(
    (pages: readonly PdfPageRef[], file: PdfEdit['file']): boolean =>
      file === null
        ? currentStructure !== null && isPristine(pages, currentStructure)
        : sameLayout(pages, file.pages),
    [currentStructure],
  )

  const sameAsFile = settled === null ? true : matchesFile(settled.pages, settled.file)
  const contentDirty = activeWorking !== null && activeWorking.bytes !== savedBytes
  const dirty = contentDirty || (settled !== null && !sameAsFile)

  /**
   * 状态行左侧。
   *
   * ## 为什么保存字节要有独立基线，而不是只用 `useSource.saveCount`
   *
   * 两件事叠在一起会让状态行**卡在「已修改，未保存」**（真浏览器里实测到的：
   * 字节已经写出 2075 字节，状态行还说没保存）：
   *
   *   1. 这里的 `dirty` 是**算出来的**（内容字节与页面结构对磁盘基线），不是
   *      显式的 state。若仍用加载时的旧字节作基线，保存后会继续显示未保存
   *   2. `statusText` 里 `dirty` 的优先级高于 `saveCount`
   *
   * 而 `saveCount` 本身也不能直接用来判「已保存」：它的语义是「打开以来保存过
   * 几次」，保存后**又改一笔**它还是 > 0——那时界面会一边写着「已保存」一边
   * 挂着未保存的改动，比不说更坏（与 `isPristine` 那条注释是同一个理由：真相
   * 只能有一个）。
   *
   * 所以内容字节比较 `savedBytes`，页结构比较 `sameAsFile`。保存后再插入
   * 并删除文字，会回到刚保存的字节，而不是误拿打开时的原件当基线。
   */
  const status = statusText({
    // `dirty` 在 `statusText` 里优先级更高，所以这两个不会同时生效
    handle: {
      ...source,
      saveCount: activeSavedBaseline !== null || (settled !== null && sameAsFile) ? 1 : 0,
    },
    dirty,
    idle: layout.length > 0 ? `${zoom}%` : '读取中…',
  })

  /**
   * 改一页（返回新的页序）并记下「属于哪一份字节」。
   *
   * 顺带报给宿主的脏标记：`onDirtyChange` 在这里算——**在事件里**算才有两个
   * 端点（改回原样也要报 `false`）。放在渲染期算就得用 effect 转发。
   */
  const applyPages = (pages: PdfPageRef[], nextImports = imports, fromAgent = false) => {
    redactionRequestRef.current?.abort()
    // A structural edit changes the page coordinate system. The already rendered
    // text stays in the working bytes; its temporary object ids can no longer be
    // safely replayed against the earlier base.
    if (agentPendingRef.current !== null) {
      agentPendingRef.current = null
      setPendingText(null)
    }
    // 抓住这一份字节（下面在闭包里用；`source.bytes` 是属性访问，TS 收窄不过去）
    const bytes = fromAgent ? (agentSnapshotRef.current?.bytes ?? currentBytes) : currentBytes
    if (bytes === null) return
    pageMutationVersionRef.current++
    // `file` 要一起带上：它是「磁盘上那份」的基线，改一笔不该把它丢掉
    setEdit((prev) => ({
      bytes,
      pages,
      imports: nextImports,
      file: prev !== null && prev.bytes === bytes ? prev.file : null,
    }))
    /**
     * 脏标记当场算并报给宿主（离开前的拦截靠它）。
     *
     * **两个方向都要报对**：算不出来就一律报 `true` 的话，「转过去再转回来」
     * 之后宿主仍然拦着问「有未保存的改动」，而用户在界面上看到的是保存按钮
     * 已经灰了——两处说法不一致。基线就是 `settled.file`（保存过）或打开时
     * 的原件，两者都在手边，所以能算准。
     */
    const pageDirty = !matchesFile(pages, settled?.file ?? null)
    onDirtyChange?.(pageDirty || contentDirty)
    if (agentSnapshotRef.current?.bytes === bytes) {
      agentSnapshotRef.current = {
        ...agentSnapshotRef.current,
        pages,
        dirty: pageDirty || contentDirty,
      }
    }
    if (!fromAgent) agentRef.current?.markManualChange()
  }

  /** 改**当前页**。按页序下标定位（不是按原页号——导入的页会与原页号撞上） */
  const updateCurrent = (change: (ref: PdfPageRef) => PdfPageRef) => {
    applyPages(layout.map((ref, position) => (position === at ? change(ref) : ref)))
  }

  /**
   * 跳到某一页。**`useCallback` 不是为了省一点开销**：查找适配器要调它（命中
   * 在别的页上就翻过去），而适配器被 `useMemo` 固定引用（理由见那里的注解）。
   * 不固定 `goTo` 的话适配器每一帧都是新的，栏的 effect 于是每次渲染重扫一遍
   * ——而重扫会发布高亮，发布会触发渲染：一个转不停的循环。
   */
  const goTo = useCallback((next: number) => setNav({ doc: documentId, at: next }), [documentId])

  /** 旋转当前页（±90 度）。这是最常用的 PDF 页面操作（扫描件常常方向不对） */
  const rotate = (delta: number) => updateCurrent((ref) => withRotation(ref, delta))

  /**
   * 整份一起转。
   *
   * 判据是「把 rotation 映射一遍」，不是「逐页执行 rotate」——差异在于**只
   * 生成一次新页序**：逐页执行会写 N 次 state（N 次渲染），而每次都用同一份
   * 旧 layout 的话最后只有一页生效（那是静默的错误）。
   */
  const rotateAll = (delta: number) => applyPages(layout.map((ref) => withRotation(ref, delta)))

  /**
   * 整份倒序。
   *
   * 当前页要跟着走：第 1 页倒序后是最后一页，用户不该被留在「另一页」上。
   */
  const reverseOrder = () => {
    if (layout.length < 2) return
    applyPages(layout.toReversed())
    goTo(layout.length - 1 - at)
  }

  /** 删除指定页。**最后一页不允许删**——一份零页的 PDF 是坏文件 */
  const removePageAt = (index: number) => {
    if (index < 0 || index >= layout.length || layout.length <= 1) return
    applyPages(layout.filter((_, position) => position !== index))
    goTo(Math.max(0, Math.min(index, layout.length - 2)))
  }
  const removePage = () => removePageAt(at)

  /** 将指定页移到目标位置，工具条和缩略图拖放共用同一动作。 */
  const movePage = (from: number, to: number) => {
    if (from < 0 || from >= layout.length || to < 0 || to >= layout.length || from === to) return
    const next = [...layout]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    applyPages(next)
    goTo(to)
  }
  const move = (delta: -1 | 1) => movePage(at, at + delta)

  /**
   * 在当前页之后插入一张空白页，并跳到它。
   *
   * 空白页在页面模型里没有来源（`origin.kind === 'blank'`），保存时由
   * `buildPdfBytes` 用 `insertPage` 补一张 A4。**尺寸是 A4 竖版**——不跟当前页
   * 走：插入空白页的用途是「在这两页之间加一张纸」，纸型交给「纸型」那一档。
   */
  const insertBlankAt = (afterIndex: number) => {
    if (afterIndex < 0 || afterIndex >= layout.length) return
    const blank: PdfPageRef = {
      origin: { kind: 'blank' },
      rotation: 0,
      base: { ...BLANK_PAGE_SIZE },
      crop: null,
      paper: null,
    }
    applyPages([...layout.slice(0, afterIndex + 1), blank, ...layout.slice(afterIndex + 1)])
    goTo(afterIndex + 1)
  }
  const insertBlank = () => insertBlankAt(at)

  /** 复制为独立页项；来源可相同，但后续旋转/裁剪等只修改其中一项。 */
  const duplicatePage = (index: number) => {
    const originalPage = layout[index]
    if (originalPage === undefined) return
    const copy: PdfPageRef = {
      origin: { ...originalPage.origin },
      rotation: originalPage.rotation,
      base: { ...originalPage.base },
      crop: originalPage.crop === null ? null : { ...originalPage.crop },
      paper: originalPage.paper === null ? null : { ...originalPage.paper },
    }
    applyPages([...layout.slice(0, index + 1), copy, ...layout.slice(index + 1)])
    goTo(index + 1)
  }

  /**
   * 从另一份 PDF 导入**它的全部页面**，插在当前页之后。
   *
   * ## 导入的字节留在改动里
   *
   * 它的页在原件里不存在，所以字节必须跟着改动一起带着走（`PdfEdit.imports`）
   * ——不然第一次保存成功、第二次保存就把它们静默丢掉（两次都报成功）。
   *
   * ## 为什么读一遍页数
   *
   * 一是**校验**：选错文件（一张图、一个 zip）要在这里报错，而不是保存时从
   * pdf-lib 里冒出一句看不懂的话；二是**每页的可视区尺寸**——导入的页也要能
   * 裁剪与换纸型，那需要它的 `base`。原件里没有它的信息，只能现在读。
   */
  const importPages = async (file: File) => {
    if (currentBytes === null) return
    const identity = agentSnapshotRef.current
    const startVersion = agentRef.current?.getVersion()
    setNotice(null)
    try {
      if (file.size < 1 || file.size > 50 * 1024 * 1024) throw new Error('请选择 50 MiB 以内的 PDF')
      if (hostLocal) {
        const handle = agentRef.current
        if (!handle) throw new Error('PDF 原件尚未读取完成')
        const result = await handle.execute(
          'import_pages',
          {
            after_page: at + 1,
            source_pages: 'all',
            assetFile: file,
          },
          { expectedVersion: startVersion, manual: true },
        )
        if (!result.ok) throw new Error(result.error ?? '导入未应用')
        goTo(at + 1)
        return
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const pages = await readPdfPages(bytes)
      if (pages.length === 0) {
        setNotice(`「${file.name}」里没有页面`)
        return
      }
      /**
       * 键用 `文件.大小.时间`：它只要在这一次编辑里唯一就够了（`imports` 是
       * 这个组件的一个 state）。用随机数也行，但那样两次导入同一份文件会各自
       * 存一份字节——白白多占一倍内存。
       */
      if (
        agentSnapshotRef.current?.bytes !== identity?.bytes ||
        agentRef.current?.getVersion() !== startVersion
      )
        throw new Error('导入期间画布已变化，请重新导入')
      if (
        layout.length + pages.length > 1000 ||
        [...imports.values()].reduce((n, b) => n + b.length, 0) + bytes.length > 50 * 1024 * 1024
      )
        throw new Error('导入后超过 1000 页或导入素材合计超过 50 MiB')
      const key = `import:${file.name}:${bytes.length}:${file.lastModified}`
      const refs: PdfPageRef[] = pages.map((entry, index) => ({
        origin: { kind: 'imported', source: key, index },
        rotation: entry.rotation,
        base: { width: entry.width, height: entry.height },
        crop: null,
        paper: null,
      }))
      const nextImports = new Map(imports)
      nextImports.set(key, bytes)
      applyPages([...layout.slice(0, at + 1), ...refs, ...layout.slice(at + 1)], nextImports)
      goTo(at + 1)
    } catch (cause) {
      setNotice(`导入「${file.name}」失败：${messageOf(cause)}`)
    }
  }

  /** 裁剪当前页：四边各裁多少 pt（0 表示还原） */
  const crop = (inset: number) => {
    updateCurrent((ref) =>
      withCrop(
        ref,
        inset === 0
          ? null
          : // 四边同一个值：这是一个刻意的取舍（见 cropItems 的说明）
            { top: inset, right: inset, bottom: inset, left: inset },
      ),
    )
  }

  /** 换当前页的纸型（`null` = 回到原件尺寸） */
  const paper = (key: PaperKey | '') => {
    updateCurrent((ref) => withPaper(ref, key === '' ? null : paperForPage(key, ref)))
  }

  const save = async () => {
    if (currentBytes === null || !dirty || source.saving || contentBusy) return
    redactionRequestRef.current?.abort()
    setNotice(null)
    const handle = agentRef.current
    const version = handle?.getVersion()
    const pageMutationVersion = pageMutationVersionRef.current
    let bytes: Uint8Array
    let structure: Awaited<ReturnType<typeof readPdfPages>>
    try {
      if (settled === null || sameAsFile) bytes = currentBytes
      else {
        bytes = await buildPdfWorkingCopy({
          bytes: currentBytes,
          layout: settled.pages,
          imports: settled.imports,
          host: hostLocal,
          version: version ?? 0,
          assertCurrent: () => {
            if (agentRef.current !== handle || version !== handle?.getVersion())
              throw new Error('画布已变化，请重新保存当前内容')
          },
        })
      }
      structure = await readPdfPages(bytes)
    } catch (cause) {
      setNotice(`未保存：${messageOf(cause)}`)
      return
    }
    if (handle !== agentRef.current || version !== handle?.getVersion()) {
      setNotice('画布已变化，请重新保存当前内容')
      return
    }
    const sourceIdentity = source.bytes!
    const pendingAtSave = activePendingText
    savingPendingRef.current = {
      documentId,
      source: sourceIdentity,
      workingBytes: currentBytes,
      edit: settled,
      bytes,
      inserts: pendingAtSave?.inserts ?? [],
    }
    const ok = await source.save(bytes, { name: 'document.pdf', mime: OFFICE_MIME.pdf })
    savingPendingRef.current = null
    if (!ok) return
    const baseline = { documentId, source: sourceIdentity, bytes }
    savedBaselineRef.current = baseline
    setSavedBaseline(baseline)
    const changedDuringSave = handle !== agentRef.current || version !== handle?.getVersion()
    if (!changedDuringSave) {
      historySavedRef.current = bytes
      // The saved bytes become the live canvas, including content and page edits.
      setWorking({ source: source.bytes!, bytes, structure })
      setEdit(null)
      setPendingText(null)
      agentPendingRef.current = null
      agentSnapshotRef.current = null
      handle?.markManualChange()
      onDirtyChange?.(false)
    } else {
      const pendingNow = agentPendingRef.current
      const pageUnchanged = pageMutationVersionRef.current === pageMutationVersion
      let restoredSavedBytes = false
      if (
        pageUnchanged &&
        pendingAtSave !== null &&
        pendingNow?.documentId === documentId &&
        pendingNow.source === sourceIdentity &&
        pendingNow.base === pendingAtSave.base &&
        pendingNow.inserts.length >= pendingAtSave.inserts.length &&
        pendingAtSave.inserts.every((insert, index) =>
          samePendingInsert(insert, pendingNow.inserts[index]!),
        )
      ) {
        // The save committed the old prefix. Later inserts now replay on the
        // exact bytes that reached disk, so deleting them can return cleanly.
        const remaining = pendingNow.inserts.slice(pendingAtSave.inserts.length)
        const rebased =
          remaining.length > 0 ? { ...pendingNow, base: bytes, inserts: remaining } : null
        agentPendingRef.current = rebased
        setPendingText(rebased)
        if (remaining.length === 0) restoredSavedBytes = true
      }
      if (
        pageUnchanged &&
        pendingAtSave === null &&
        pendingNow === null &&
        agentSnapshotRef.current?.bytes === bytes
      )
        restoredSavedBytes = true
      if (restoredSavedBytes) {
        historySavedRef.current = bytes
        setWorking({ source: sourceIdentity, bytes, structure })
        setEdit(null)
        agentSnapshotRef.current = agentSnapshotRef.current
          ? { ...agentSnapshotRef.current, bytes, dirty: false }
          : null
        onDirtyChange?.(false)
        return
      }
      // A later edit stays pending; the new on-disk baseline is the saved layout.
      // A content edit may complete while the older save is in flight. Only
      // the exact bytes written by that save can become the disk baseline.
      setEdit((prev) =>
        prev?.bytes === currentBytes && settled !== null
          ? { ...prev, file: { pages: settled.pages, imports: settled.imports } }
          : prev,
      )
      onDirtyChange?.(true)
    }
  }

  const insertAtPoint = async () => {
    if (
      !hostApply ||
      !insertPoint ||
      insertPoint.page !== at ||
      !insertText.trim() ||
      currentBytes === null ||
      contentBusy
    )
      return
    const handle = agentRef.current
    const expectedVersion = handle?.getVersion()
    if (!handle || expectedVersion === undefined) return
    setNotice(null)
    const result = await handle.execute(
      'insert_text',
      { page: insertPoint.page + 1, origin: insertPoint.origin, text: insertText, font_size: 12 },
      { expectedVersion, manual: true },
    )
    if (result.ok) {
      setInsertPoint(null)
      setInsertText('')
      setInsertMode(false)
    } else {
      setNotice(`插入文字失败：${result.error ?? '未知错误'}`)
    }
  }

  const pendingInserts = activePendingText?.inserts ?? []
  const selectedPending =
    pendingInserts.find((insert) => insert.id === selectedPendingId) ?? pendingInserts[0] ?? null
  const pendingValues =
    selectedPending === null
      ? null
      : pendingDraft?.id === selectedPending.id
        ? pendingDraft
        : {
            id: selectedPending.id,
            text: selectedPending.text,
            x: selectedPending.x,
            y: selectedPending.y,
            fontSize: selectedPending.fontSize,
            color: `#${selectedPending.color
              .map((channel) =>
                Math.round(channel * 255)
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join('')}`,
          }
  const changePending = async (
    tool: 'edit_inserted_text' | 'move_inserted_text' | 'delete_inserted_text',
  ) => {
    const handle = agentRef.current
    if (!handle || !pendingValues) return
    const args =
      tool === 'edit_inserted_text'
        ? {
            id: pendingValues.id,
            text: pendingValues.text,
            font_size: pendingValues.fontSize,
            color: pendingValues.color,
          }
        : tool === 'move_inserted_text'
          ? { id: pendingValues.id, x: pendingValues.x, y: pendingValues.y }
          : { id: pendingValues.id }
    setNotice(null)
    const result = await handle.execute(tool, args, {
      expectedVersion: handle.getVersion(),
      manual: true,
    })
    if (result.ok) {
      setPendingDraft(null)
      if (tool === 'delete_inserted_text') setSelectedPendingId(null)
    } else {
      setNotice(`修改文字失败：${result.error ?? '未知错误'}`)
    }
  }

  /**
   * 文字层：打开查找时才扫（不过早花掉几百毫秒），页序一变就重扫。
   *
   * ## 为什么不在打开文档时就扫
   *
   * 扫一遍要把**每一页**的文字都取出来（`getTextContent`），几百页的文档是
   * 秒级的工作，而它排在**首屏那一页的渲染**前面（同一个 worker）——那正是
   * 用户最不该等的东西。所以扫描是「点了查找才开始」。
   *
   * ## 为什么页序变化要重扫
   *
   * 矩形按**旋转**换算（`pdf-text.ts` 的 viewport），页号按**顺序**算。两者都
   * 变了。原始文字按（字节, 原页号）缓存，所以重扫只重做坐标变换，不重新解析
   * PDF——那才是慢的那一步。
   */
  const textKey = useMemo(() => layout.map(pageKey).join('|'), [layout])
  const textSources = useMemo(
    () =>
      layout.map((ref) => {
        const from = sourceOf(ref, currentBytes, imports)
        return { bytes: from.bytes, index: from.index, rotation: ref.rotation }
      }),
    [layout, currentBytes, imports],
  )

  useEffect(() => {
    batchLiveRef.current = {
      documentId,
      source: source.bytes,
      edit: settled,
      saving: source.saving,
    }
    agentSnapshotRef.current =
      currentBytes === null || original === null
        ? null
        : { bytes: currentBytes, pages: layout, activePage: at, dirty }
    agentApplyRef.current = (pages) => applyPages(pages, imports, true)
    agentGoToRef.current = (next) => {
      const snapshot = agentSnapshotRef.current
      if (snapshot && next >= 0 && next < snapshot.pages.length)
        agentSnapshotRef.current = { ...snapshot, activePage: next }
      goTo(next)
    }
    agentTextRef.current = () =>
      buildPdfTextIndex(
        (agentSnapshotRef.current?.pages ?? []).map((ref) => {
          const from = sourceOf(ref, agentSnapshotRef.current?.bytes ?? currentBytes, imports)
          return { bytes: from.bytes, index: from.index, rotation: ref.rotation }
        }),
        loadPdfDocument,
      )
    agentCaptureRef.current = () => ({
      working:
        activeWorking ??
        (currentBytes && source.bytes && currentStructure
          ? { source: source.bytes, bytes: currentBytes, structure: currentStructure }
          : null),
      edit: settled,
      snapshot: agentSnapshotRef.current,
      pending: agentPendingRef.current,
    })
    agentRestoreRef.current = (state) => {
      const before = state as {
        working: PdfWorkingBytes | null
        edit: PdfEdit | null
        snapshot: PdfAgentSnapshot | null
        pending: PdfPendingTextState | null
      }
      const restored =
        before.working ??
        (source.bytes && currentStructure
          ? { source: source.bytes, bytes: source.bytes, structure: currentStructure }
          : null)
      setWorking(restored)
      setEdit(before.edit)
      setPendingText(before.pending)
      agentPendingRef.current = before.pending
      agentSnapshotRef.current = before.snapshot
      onDirtyChange?.(
        (restored?.bytes ?? source.bytes) !== savedBytes || before.snapshot?.dirty === true,
      )
    }
    agentPendingRef.current = activePendingText
    const writePendingInserts = async (
      base: Uint8Array,
      inserts: readonly PdfPendingTextInsert[],
      expectedVersion: number,
      signal?: AbortSignal,
    ) => {
      redactionRequestRef.current?.abort()
      const sourceBytes = source.bytes
      if (!hostApply || currentBytes === null || sourceBytes === null)
        throw new Error('PDF 文字宿主执行器尚未就绪')
      const handle = agentRef.current
      if (!handle || handle.documentId !== documentId || handle.getVersion() !== expectedVersion)
        throw new Error('PDF 画布已变化，文字结果未应用')
      if (contentAbortRef.current !== null) throw new Error('已有 PDF 文字操作正在执行')
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) controller.abort()
      contentAbortRef.current = controller
      setContentBusy(true)
      await runWithCleanup(
        async () => {
          const assertCurrent = () => {
            if (
              controller.signal.aborted ||
              agentRef.current !== handle ||
              handle.getVersion() !== expectedVersion
            )
              throw new Error('PDF 画布已变化，文字结果未应用')
          }
          const applied = {
            bytes: await replayPdfPendingText({
              base,
              inserts,
              version: expectedVersion,
              apply: hostApply,
              assertCurrent,
              signal: controller.signal,
            }),
          }
          const entries = await readPdfPages(applied.bytes)
          if (
            controller.signal.aborted ||
            agentRef.current !== handle ||
            handle.getVersion() !== expectedVersion
          )
            throw new Error('PDF 画布已变化，文字结果未应用')
          const pages: PdfPageRef[] = entries.map((entry, index) => ({
            origin: { kind: 'original', index },
            rotation: entry.rotation,
            base: { width: entry.width, height: entry.height },
            crop: null,
            paper: null,
          }))
          const nextPending =
            inserts.length === 0 ? null : { documentId, source: sourceBytes, base, inserts }
          agentPendingRef.current = nextPending
          setPendingText(nextPending)
          const recorded = savedBaselineRef.current
          const baselineBytes =
            recorded?.documentId === documentId && recorded.source === sourceBytes
              ? recorded.bytes
              : sourceBytes
          const pendingDirty = applied.bytes !== baselineBytes
          setWorking({ source: sourceBytes, bytes: applied.bytes, structure: entries })
          setEdit(null)
          agentSnapshotRef.current = {
            bytes: applied.bytes,
            pages,
            activePage: Math.min(at, pages.length - 1),
            dirty: pendingDirty,
          }
          onDirtyChange?.(pendingDirty)
        },
        () => {
          signal?.removeEventListener('abort', abort)
          if (contentAbortRef.current === controller) contentAbortRef.current = null
          setContentBusy(false)
        },
      )
    }
    agentInsertRef.current = async (input, expectedVersion, signal) => {
      redactionRequestRef.current?.abort()
      if (currentBytes === null || source.bytes === null) throw new Error('PDF 原件尚未读取完成')
      const pending = agentPendingRef.current
      const liveBytes = agentSnapshotRef.current?.bytes ?? currentBytes
      const currentEdit = liveBytes === currentBytes ? settled : null
      const saving = savingPendingRef.current
      const base =
        pending?.documentId === documentId && pending.source === source.bytes
          ? pending.base
          : saving?.documentId === documentId &&
              saving.source === source.bytes &&
              saving.workingBytes === liveBytes &&
              saving.edit === currentEdit
            ? saving.bytes
            : currentEdit === null || sameAsFile
              ? liveBytes
              : await buildPdfWorkingCopy({
                  bytes: liveBytes,
                  layout: currentEdit.pages,
                  imports: currentEdit.imports,
                  host: hostLocal,
                  version: expectedVersion,
                  signal,
                  assertCurrent: () => {
                    if (signal?.aborted || agentRef.current?.getVersion() !== expectedVersion)
                      throw new Error('PDF 画布已变化，结果未应用')
                  },
                })
      const pdf = await loadPdfDocument(base)
      const viewport = (await pdf.getPage(input.pageIndex + 1)).getViewport({ scale: 1 })
      const point = input.origin
        ? viewport.convertToViewportPoint(...input.origin)
        : [input.x, (input.y ?? NaN) + input.fontSize]
      const inserted: PdfPendingTextInsert = {
        id: `T${crypto.randomUUID()}`,
        pageIndex: input.pageIndex,
        x: point[0]!,
        y: point[1]! - input.fontSize,
        text: input.text,
        fontSize: input.fontSize,
        color: input.color,
      }
      await writePendingInserts(
        base,
        [...(pending?.inserts ?? []), inserted],
        expectedVersion,
        signal,
      )
      return inserted
    }
    agentContentRef.current = async (tool, args, expectedVersion, signal, manual) => {
      redactionRequestRef.current?.abort()
      const handle = agentRef.current
      const snapshotBytes = agentSnapshotRef.current?.bytes
      const sourceBytes = source.bytes
      if (!handle || !snapshotBytes || !sourceBytes) throw new Error('PDF 原件尚未读取完成')
      const frozenPending = agentPendingRef.current
      const frozenBaseline = savedBaselineRef.current
      const frozenSaving = savingPendingRef.current
      const atomicBatch =
        tool === 'apply_ops' &&
        (frozenPending !== null ||
          (Array.isArray(args.ops) &&
            args.ops.some((op) =>
              ['removeMarkup', 'setNoteContents', 'removeTextInsert'].includes(String(op?.op)),
            )))
      let base: Uint8Array = snapshotBytes
      const isLocal =
        (PDF_LOCAL_TOOLS as readonly string[]).includes(tool) ||
        atomicBatch ||
        (tool === 'apply_ops' &&
          Array.isArray(args.ops) &&
          args.ops.some((op) => op?.op === 'setMetadata'))
      const isForm =
        tool === 'list_form_fields' ||
        (tool === 'apply_ops' &&
          Array.isArray(args.ops) &&
          args.ops.some((op) => op?.op === 'setFormValue'))
      const canMaterialize = isLocal || isForm
      if (
        (!canMaterialize && base === currentBytes && settled !== null && !sameAsFile) ||
        (tool !== 'apply_ops' && (agentPendingRef.current?.inserts.length ?? 0) > 0) ||
        source.saving
      )
        throw new Error('请先保存当前页面或插字改动，再编辑PDF内容')
      if (contentAbortRef.current) throw new Error('已有 PDF 内容操作正在执行')
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) controller.abort()
      const assertCurrent = () => {
        if (
          controller.signal.aborted ||
          agentRef.current !== handle ||
          handle.getVersion() !== expectedVersion ||
          agentSnapshotRef.current?.bytes !== snapshotBytes ||
          (tool === 'apply_ops' &&
            (agentPendingRef.current !== frozenPending ||
              savedBaselineRef.current !== frozenBaseline ||
              savingPendingRef.current !== frozenSaving ||
              batchLiveRef.current?.documentId !== documentId ||
              batchLiveRef.current.source !== sourceBytes ||
              batchLiveRef.current.edit !== settled ||
              batchLiveRef.current.saving))
        )
          throw new Error('PDF 画布已变化，内容结果未应用')
      }
      contentAbortRef.current = controller
      setContentBusy(true)
      return runWithCleanup(
        async () => {
          assertCurrent()
          if (tool === 'apply_ops' && frozenPending && settled !== null && !sameAsFile)
            throw new Error('待保存插字与页面布局不能可靠映射，请先保存后重新读取')
          if (canMaterialize && base === currentBytes && settled !== null && !sameAsFile) {
            if (!hostLocal) throw new Error('PDF 本地工具宿主未连接，页面调整后请先保存再填写表单')
            base = await buildPdfWorkingCopy({
              bytes: base,
              layout: settled.pages,
              imports: settled.imports,
              host: hostLocal,
              version: expectedVersion,
              assertCurrent,
              signal: controller.signal,
            })
          }
          assertCurrent()
          if (atomicBatch) {
            if (
              frozenPending &&
              (frozenPending.documentId !== documentId || frozenPending.source !== sourceBytes)
            )
              throw new Error('待保存文字已失效，请重新读取')
            const candidate = await buildPdfBatchCandidate({
              args,
              bytes: base,
              pending: frozenPending,
              version: expectedVersion,
              local: hostLocal,
              apply: hostApply,
              annotations: hostAnnotations,
              assertCurrent,
              signal: controller.signal,
            })
            assertCurrent()
            if (candidate.dryRun)
              return { changed: false, data: { ...candidate.data, dryRun: true } }
            const pages: PdfPageRef[] = candidate.structure.map((entry, index) => ({
              origin: { kind: 'original', index },
              rotation: entry.rotation,
              base: { width: entry.width, height: entry.height },
              crop: null,
              paper: null,
            }))
            const baselineBytes =
              frozenBaseline?.documentId === documentId && frozenBaseline.source === sourceBytes
                ? frozenBaseline.bytes
                : sourceBytes
            const nextDirty = candidate.bytes !== baselineBytes
            // One synchronous publication. No intermediate host result has touched editor state.
            agentPendingRef.current = candidate.nextPending
            agentSnapshotRef.current = {
              bytes: candidate.bytes,
              pages,
              activePage: Math.min(at, pages.length - 1),
              dirty: nextDirty,
            }
            setWorking({
              source: sourceBytes,
              bytes: candidate.bytes,
              structure: candidate.structure,
            })
            setPendingText(candidate.nextPending)
            setEdit(null)
            setSelectedText(null)
            setSelectedPendingId(null)
            setPendingDraft(null)
            setImageList(null)
            setImageSelection(null)
            setFormList(null)
            setLocalInfo(candidate.info ? { bytes: candidate.bytes, info: candidate.info } : null)
            setNotice(candidate.data.message ?? null)
            onDirtyChange?.(nextDirty)
            return { changed: true, data: candidate.data }
          }
          const result = isLocal
            ? await (async () => {
                if (!hostLocal) throw new Error('PDF 本地工具宿主未连接')
                const { assetFile, ...input } = args
                if (tool === 'add_form_mark' && input.anchor_text !== undefined) {
                  if (input.x !== undefined || input.y !== undefined)
                    throw new Error('锚定文字与 x/y 不能混用')
                  const pageIndex = Number(input.page) - 1
                  const materializedBytes = base
                  const index =
                    materializedBytes !== snapshotBytes
                      ? await buildPdfTextIndex(
                          (await readPdfPages(materializedBytes)).map((entry, sourceIndex) => ({
                            bytes: materializedBytes,
                            index: sourceIndex,
                            rotation: entry.rotation,
                          })),
                          loadPdfDocument,
                        )
                      : await agentTextRef.current()
                  assertCurrent()
                  const chunks =
                    index.pages[pageIndex]?.chunks.filter(
                      (chunk) => chunk.sourceText === input.anchor_text,
                    ) ?? []
                  if (chunks.length !== 1) throw new Error('锚点须为页面唯一完整文字项')
                  const rect = chunks[0]!.rect,
                    dim = displaySize(agentSnapshotRef.current!.pages[pageIndex]!)
                  const size = typeof input.size === 'number' ? input.size : 16,
                    gap = 4
                  const x = rect.x * dim.width,
                    y = rect.y * dim.height,
                    w = rect.width * dim.width,
                    h = rect.height * dim.height
                  const placement = input.placement ?? 'right'
                  if (!['right', 'left', 'above', 'below'].includes(String(placement)))
                    throw new Error('锚定方向无效')
                  input.x =
                    placement === 'right'
                      ? x + w + gap
                      : placement === 'left'
                        ? x - size - gap
                        : x + (w - size) / 2
                  input.y =
                    placement === 'above'
                      ? y - size - gap
                      : placement === 'below'
                        ? y + h + gap
                        : y + (h - size) / 2
                  delete input.anchor_text
                  delete input.placement
                }
                let selectedFile = manual && assetFile instanceof File ? assetFile : undefined
                if ((tool === 'replace_pages' || tool === 'import_pages') && !selectedFile) {
                  setBlocksOpen(false)
                  setRedactionOpen(false)
                  setImagesOpen(false)
                  setFormsOpen(false)
                  setAnnotationsOpen(false)
                  setLocalMode('pages')
                  selectedFile = await new Promise<File>((resolve, reject) => {
                    const finish = (file?: File) => {
                      controller.signal.removeEventListener('abort', cancel)
                      setAssetRequest(null)
                      if (file) resolve(file)
                      else reject(new Error('已取消 PDF 文件选择，原件未修改'))
                    }
                    const cancel = () => finish()
                    controller.signal.addEventListener('abort', cancel, { once: true })
                    setAssetRequest({ tool, confirm: finish, cancel })
                    if (controller.signal.aborted) cancel()
                  })
                  assertCurrent()
                }
                const response = await hostLocal({
                  bytes: base,
                  expectedVersion,
                  operation: pdfLocalToolOperation(tool, input),
                  assetFile: selectedFile,
                  signal: controller.signal,
                })
                assertCurrent()
                if (response.version !== expectedVersion + (response.bytes ? 1 : 0))
                  throw new Error('PDF 宿主返回版本不匹配')
                if (response.info && !(tool === 'apply_ops' && input.dry_run === true))
                  setLocalInfo({
                    bytes: response.bytes ?? snapshotBytes,
                    pages: response.bytes ? undefined : layout,
                    info: response.info,
                  })
                if (response.outputs) {
                  setLocalOutputs(response.outputs)
                  setBlocksOpen(false)
                  setRedactionOpen(false)
                  setImagesOpen(false)
                  setFormsOpen(false)
                  setAnnotationsOpen(false)
                  setLocalMode('pages')
                }
                return {
                  ...response,
                  data: response.outputs
                    ? {
                        outputs: response.outputs.map((o) => ({
                          name: o.name,
                          size: o.bytes.length,
                        })),
                        downloadReady: true,
                      }
                    : response.info,
                }
              })()
            : await executePdfContentTool({
                tool,
                args,
                manual,
                bytes: base,
                version: expectedVersion,
                pageCount: agentSnapshotRef.current!.pages.length,
                textIndex: () => agentTextRef.current(),
                inspect: hostInspect,
                apply: hostApply,
                markup: hostMarkup,
                annotations: hostAnnotations,
                forms: hostForms,
                images: hostImages,
                blocks: hostBlocks,
                signal: controller.signal,
              })
          assertCurrent()
          const imageSnapshot = result.data as PdfImageSnapshot | undefined
          if (imageSnapshot?.images)
            setImageList({ bytes: result.bytes ?? base, snapshot: imageSnapshot })
          if (tool === 'delete_image') setImageSelection(null)
          const forms = result.data as PdfFormSnapshot | undefined
          if (tool === 'list_form_fields' || (tool === 'apply_ops' && forms?.fields))
            setFormList({
              bytes: result.bytes ?? snapshotBytes,
              pages: result.bytes ? undefined : layout,
              snapshot: forms!,
            })
          if (!result.bytes) return { changed: false, data: result.data }
          const entries = await readPdfPages(result.bytes)
          assertCurrent()
          const pages: PdfPageRef[] = entries.map((entry, index) => ({
            origin: { kind: 'original', index },
            rotation: entry.rotation,
            base: { width: entry.width, height: entry.height },
            crop: null,
            paper: null,
          }))
          setWorking({ source: sourceBytes, bytes: result.bytes, structure: entries })
          setEdit(null)
          setSelectedText(null)
          agentSnapshotRef.current = {
            bytes: result.bytes,
            pages,
            activePage: Math.min(at, pages.length - 1),
            dirty: true,
          }
          onDirtyChange?.(true)
          return { changed: true, data: result.data }
        },
        () => {
          signal?.removeEventListener('abort', abort)
          if (contentAbortRef.current === controller) contentAbortRef.current = null
          setContentBusy(false)
        },
      )
    }
    agentReplaceRef.current = async (inserts, expectedVersion, signal) => {
      const pending = agentPendingRef.current
      if (!pending || pending.documentId !== documentId || pending.source !== source.bytes)
        throw new Error('待保存文字已失效')
      const saving = savingPendingRef.current
      if (
        saving?.documentId === documentId &&
        saving.source === source.bytes &&
        saving.inserts.some((insert) => {
          const next = inserts.find((candidate) => candidate.id === insert.id)
          return next === undefined || !samePendingInsert(insert, next)
        })
      )
        throw new Error('这段文字正在保存，请稍后再修改')
      await writePendingInserts(pending.base, inserts, expectedVersion, signal)
    }
  })

  useEffect(() => {
    const snapshot = agentSnapshotRef.current
    if (!snapshot || !ready) return
    const entry = {
      bytes: snapshot.bytes,
      pages: snapshot.pages,
      assets: [...imports.values(), ...(activePendingText ? [activePendingText.base] : [])],
      state: agentCaptureRef.current(),
    }
    if (historySavedRef.current === snapshot.bytes) {
      historySavedRef.current = null
      history.rebase(entry)
    } else history.observe(entry)
  })
  const moveHistory = (direction: 'undo' | 'redo') => {
    if (contentBusy || source.saving) return
    const entry = direction === 'undo' ? history.undo() : history.redo()
    if (!entry) return
    agentRestoreRef.current(entry.state)
    agentRef.current?.markManualChange()
    setSelectedText(null)
    setNotice(null)
  }
  const moveHistoryRef = useRef(moveHistory)
  useEffect(() => {
    moveHistoryRef.current = moveHistory
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      )
        return
      const target = event.target
      if (
        !(target instanceof Element) ||
        !canvasRef.current?.closest('.mimir-editor')?.contains(target) ||
        target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')
      )
        return
      const key = event.key.toLowerCase()
      const direction =
        key === 'z'
          ? event.shiftKey
            ? 'redo'
            : 'undo'
          : key === 'y' && !event.shiftKey
            ? 'redo'
            : null
      if (!direction) return
      event.preventDefault()
      moveHistoryRef.current(direction)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (source.bytes === null || !ready || !agentContentReady) return
    const handle = new PdfAgentHandle(documentId, {
      snapshot: () => agentSnapshotRef.current,
      applyPages: (pages) => agentApplyRef.current(pages),
      gotoPage: (index) => agentGoToRef.current(index),
      textIndex: () => agentTextRef.current(),
      insertText: (input, version, signal) => agentInsertRef.current(input, version, signal),
      pendingTextInserts: () => agentPendingRef.current?.inserts ?? [],
      replaceTextInserts: (inserts, version, signal) =>
        agentReplaceRef.current(inserts, version, signal),
      contentTool: (tool, args, version, signal, manual) =>
        agentContentRef.current(tool, args, version, signal, manual),
      captureState: () => agentCaptureRef.current(),
      restoreState: (state) => agentRestoreRef.current(state),
    })
    agentRef.current = handle
    onAgentHandleChangeRef.current?.(handle)
    return () => {
      contentAbortRef.current?.abort()
      handle.dispose()
      if (agentRef.current === handle) agentRef.current = null
      onAgentHandleChangeRef.current?.(null)
    }
  }, [
    documentId,
    source.bytes,
    ready,
    agentContentReady,
    agentRef,
    contentAbortRef,
    agentSnapshotRef,
    agentApplyRef,
    agentGoToRef,
    agentTextRef,
    agentInsertRef,
    agentPendingRef,
    agentReplaceRef,
    agentContentRef,
    agentCaptureRef,
    agentRestoreRef,
  ])

  const blocksShown =
    blocksOpen &&
    !assetRequest &&
    !localMode &&
    !imagesOpen &&
    !formsOpen &&
    !annotationsOpen &&
    !imageExportOpen
  const currentBlocks = useMemo(
    () =>
      textIndex?.bytes === currentBytes && textIndex.key === textKey
        ? groupPdfTextBlocks(textIndex.index, at)
        : [],
    [textIndex, currentBytes, textKey, at],
  )
  const selectedBlock =
    blocksShown &&
    blockSelection?.bytes === currentBytes &&
    blockSelection.key === textKey &&
    blockSelection.block.page === at
      ? blockSelection.block
      : null
  const blockIssue =
    !sameAsFile || pendingInserts.length > 0
      ? '请先保存页面或插字改动，再移动原文段落。'
      : undefined
  const selectBlock = (block: PdfTextBlock) => {
    if (!currentBytes || contentBusy || source.saving || blockIssue) return
    setBlockSelection({ bytes: currentBytes, key: textKey, block })
    setNotice(null)
  }
  const pickBlock = (x: number, y: number) => {
    if (textIndex?.bytes !== currentBytes || textIndex.key !== textKey) return
    const block = pickPdfTextBlock(textIndex.index, at, x, y)
    if (block) selectBlock(block)
    else setNotice('这里没有可单独定位的段落；请点击文字或从面板选择。')
  }

  useEffect(() => {
    if ((!findOpen && !selectTextMode && !blocksShown) || currentBytes === null) return
    // 这一份页序已经扫过了
    if (textIndex !== null && textIndex.bytes === currentBytes && textIndex.key === textKey) return
    let cancelled = false
    void (async () => {
      try {
        const index = await buildPdfTextIndex(textSources, loadPdfDocument, (done, total) => {
          if (!cancelled) setScan({ done, total })
        })
        if (cancelled) return
        setScan(null)
        setTextIndex({ bytes: currentBytes, key: textKey, index })
        /**
         * 一页文字都没有 = 扫描件。**如实说，而不是打开一条永远搜不到的栏**：
         * 栏上会显示「无匹配」，那看起来像搜索坏了。同时把它关掉并说明原因，
         * 「查找」按钮此后也是灰的（`findReason`）。
         */
        if (index.pagesWithText === 0) {
          setFindOpen(false)
          setNotice(
            selectTextMode || blocksShown
              ? '这份 PDF 没有文字层（可能是扫描件），无法定位原文'
              : '这份 PDF 没有文字层（可能是扫描件），搜不到内容',
          )
        }
      } catch (cause) {
        if (cancelled) return
        setScan(null)
        setFindOpen(false)
        setNotice(`读取文字层失败：${messageOf(cause)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [findOpen, selectTextMode, blocksShown, currentBytes, textIndex, textKey, textSources])

  const activeSelectedText =
    selectedText?.bytes === currentBytes && selectedText.key === textKey ? selectedText.run : null
  const verifiedSelection =
    selectedText?.bytes === currentBytes && selectedText.key === textKey
      ? selectedText.target
      : undefined
  const pickText = async (x: number, y: number) => {
    if (textIndex?.bytes !== currentBytes || textIndex.key !== textKey) return
    const request = ++inspectRequestRef.current
    const run = pickPdfTextRun(textIndex.index, at, x, y)
    if (run === null) {
      setSelectedText(null)
      setNotice('这里没有可单独定位的整段原文；重叠文字也不能安全点选')
      return
    }
    setSelectedText({ bytes: currentBytes!, key: textKey, run })
    setReplacementDraft('')
    setNotice(null)
    if (!hostInspect || currentBytes === null) return
    const version = agentRef.current?.getVersion()
    setInspectingText(true)
    try {
      const target = await hostInspect({
        bytes: currentBytes,
        probe: { pageIndex: run.page, rect: [...run.pdfRect], oldText: run.text },
      })
      if (
        request !== inspectRequestRef.current ||
        agentRef.current?.getVersion() !== version ||
        agentSnapshotRef.current?.bytes !== currentBytes
      )
        return
      setSelectedText({ bytes: currentBytes, key: textKey, run, target })
    } catch (cause) {
      if (request === inspectRequestRef.current)
        setNotice(`原文对象未通过核验：${messageOf(cause)}`)
    } finally {
      if (request === inspectRequestRef.current) setInspectingText(false)
    }
  }

  const runManualContentTool = async (
    tool: string,
    args: Record<string, unknown>,
    expectedVersion?: number,
    signal?: AbortSignal,
  ) => {
    const handle = agentRef.current
    if (!handle) return
    setNotice(null)
    const result = await handle.execute(tool, args, {
      expectedVersion: expectedVersion ?? handle.getVersion(),
      manual: true,
      signal,
    })
    if (signal?.aborted) return result
    if (!result.ok) {
      setNotice(
        `${tool === 'markup_text' ? '标注原文失败' : tool === 'edit_text' ? '替换原文失败' : 'PDF 操作失败'}：${result.error ?? '未知错误'}`,
      )
      return result
    }
    const data = result.data as { annotations?: PdfAnnotation[] } | undefined
    if (data?.annotations && agentSnapshotRef.current)
      setAnnotationList({ bytes: agentSnapshotRef.current.bytes, items: data.annotations })
    if (result.changed) setNoteDraft('')
    return result
  }
  useEffect(() => {
    if (
      !formsOpen ||
      !hostForms ||
      !currentBytes ||
      (formList?.bytes === currentBytes &&
        (formList.pages ? formList.pages === layout : sameAsFile)) ||
      contentBusy ||
      source.saving ||
      notice ||
      (activePendingText?.inserts.length ?? 0) > 0
    )
      return
    const handle = agentRef.current
    if (!handle) return
    const version = handle.getVersion(),
      request = ++formsReadRequest.current,
      controller = new AbortController()
    const assertCurrent = () => {
      if (
        controller.signal.aborted ||
        agentRef.current !== handle ||
        handle.getVersion() !== version ||
        agentSnapshotRef.current?.bytes !== currentBytes
      )
        throw new Error('PDF 画布已变化，表单结果未应用')
    }
    setFormsReading(true)
    void (async () => {
      if (settled !== null && !sameAsFile && !hostLocal)
        throw new Error('PDF 本地工具宿主未连接，页面调整后请先保存再填写表单')
      const bytes =
        settled !== null && !sameAsFile
          ? await buildPdfWorkingCopy({
              bytes: currentBytes,
              layout,
              imports,
              host: hostLocal,
              version,
              assertCurrent,
              signal: controller.signal,
            })
          : currentBytes
      assertCurrent()
      const response = await hostForms({
        bytes,
        expectedVersion: version,
        operation: { op: 'read' },
        signal: controller.signal,
      })
      assertCurrent()
      if (response.bytes || response.version !== version) throw new Error('PDF 表单读取响应无效')
      setFormList({ bytes: currentBytes, pages: layout, snapshot: response.forms })
    })()
      .catch((cause) => {
        if (
          !controller.signal.aborted &&
          agentRef.current === handle &&
          handle.getVersion() === version
        )
          setNotice(`读取 PDF 表单失败：${messageOf(cause)}`)
      })
      .finally(() => {
        if (formsReadRequest.current === request) setFormsReading(false)
      })
    return () => controller.abort()
  }, [
    formsOpen,
    hostForms,
    currentBytes,
    formList?.bytes,
    formList?.pages,
    layout,
    imports,
    settled,
    hostLocal,
    sameAsFile,
    contentBusy,
    source.saving,
    notice,
    activePendingText,
    agentRef,
    agentSnapshotRef,
  ])
  useEffect(() => {
    if (
      !localMode ||
      !hostLocal ||
      !currentBytes ||
      (localInfo?.bytes === currentBytes &&
        (localInfo.pages ? localInfo.pages === layout : sameAsFile)) ||
      contentBusy ||
      source.saving ||
      (activePendingText?.inserts.length ?? 0) > 0
    )
      return
    const handle = agentRef.current
    if (!handle) return
    const controller = new AbortController()
    const version = handle.getVersion()
    const assertCurrent = () => {
      if (
        controller.signal.aborted ||
        agentRef.current !== handle ||
        handle.getVersion() !== version ||
        agentSnapshotRef.current?.bytes !== currentBytes
      )
        throw new Error('PDF 画布已变化，属性结果未应用')
    }
    void (async () => {
      const bytes =
        settled !== null && !sameAsFile
          ? await buildPdfWorkingCopy({
              bytes: currentBytes,
              layout,
              imports,
              host: hostLocal,
              version,
              assertCurrent,
              signal: controller.signal,
            })
          : currentBytes
      assertCurrent()
      const result = await hostLocal({
        bytes,
        expectedVersion: version,
        operation: { op: 'read' },
        signal: controller.signal,
      })
      assertCurrent()
      if (!result.info || result.bytes || result.version !== version)
        throw new Error('PDF 属性响应无效')
      setLocalInfo({ bytes: currentBytes, pages: layout, info: result.info })
    })().catch((cause) => {
      if (!controller.signal.aborted) setNotice(`读取 PDF 属性失败：${messageOf(cause)}`)
    })
    return () => controller.abort()
  }, [
    localMode,
    hostLocal,
    currentBytes,
    localInfo?.bytes,
    localInfo?.pages,
    layout,
    imports,
    contentBusy,
    source.saving,
    settled,
    sameAsFile,
    activePendingText,
    agentRef,
    agentSnapshotRef,
  ])
  const signatureEnabled = localMode === 'signature'
  const drawingEnabled = localMode === 'drawing'
  const redactionShown =
    redactionOpen &&
    !assetRequest &&
    !localMode &&
    !imagesOpen &&
    !formsOpen &&
    !annotationsOpen &&
    !blocksOpen &&
    !imageExportOpen
  const redactionIssue =
    dirty ||
    !sameAsFile ||
    pendingInserts.length > 0 ||
    (insertMode && (!!insertText.trim() || insertPoint !== null)) ||
    !!replacementDraft.trim()
      ? '请先保存或取消页面、文字和其他待提交修改，再标记涂黑副本。'
      : null
  const redaction = usePdfRedactionCopy({
    identity: imageExportIdentity,
    enabled: redactionShown,
    bytes: currentBytes,
    pageIndex: at,
    rotation: page?.rotation ?? 0,
    blocked: contentBusy || source.saving || !!redactionIssue,
    host: hostLocal,
    agent: agentRef,
    onRequest: (controller) => {
      redactionRequestRef.current = controller
    },
    onClose: () => setRedactionOpen(false),
  })
  const drawingBinding = { documentId, currentBytes, layout, at, drawingEnabled, historyVersion }
  const drawingPreview = usePdfDrawingPreview({
    enabled: drawingEnabled || signatureEnabled,
    bytes: currentBytes,
    layout,
    imports,
    host: hostLocal,
    revision: historyVersion,
    agent: agentRef,
  })
  const drawingPage = drawingPreview.value?.pages[at]
  const validLocalInfo =
    localInfo?.bytes === currentBytes && (localInfo.pages ? localInfo.pages === layout : sameAsFile)
      ? localInfo.info
      : undefined
  const drawing = usePdfDrawingCanvas({
    enabled: drawingEnabled,
    binding: drawingBinding,
    selectionKey: `${documentId}:${at}`,
    page: at + 1,
    size: drawingPage ? screenSize(drawingPage, drawingPage.rotation) : { width: 1, height: 1 },
    drawings: validLocalInfo?.drawings ?? [],
    ready: !!drawingPage && !!validLocalInfo,
    busy: contentBusy || source.saving || (activePendingText?.inserts.length ?? 0) > 0,
    getVersion: () => agentRef.current?.getVersion() ?? 0,
    apply: runManualContentTool,
  })
  const signature = usePdfSignature({
    identity: {
      documentId,
      bytes: currentBytes,
      layout,
      page: at + 1,
      revision: historyVersion,
      enabled: signatureEnabled,
      saving: source.saving,
    },
    size: drawingPage ? screenSize(drawingPage, drawingPage.rotation) : { width: 1, height: 1 },
    ready:
      !!drawingPage &&
      !!validLocalInfo &&
      !validLocalInfo.signatureIssues?.some((item) => item.page === at + 1),
    issue: validLocalInfo?.signatureIssues?.find((item) => item.page === at + 1)?.reason,
    busy: contentBusy || source.saving || (activePendingText?.inserts.length ?? 0) > 0,
    signatures: validLocalInfo?.signatures ?? [],
    getVersion: () => agentRef.current?.getVersion() ?? 0,
    apply: runManualContentTool,
    onClose: () => closeInspector(),
  })
  const signatureTrigger = (close?: () => void) => (
    <ToolbarButton
      ref={signatureTriggerRef}
      label="签名与印章"
      active={signatureEnabled}
      disabled={!ready || contentBusy || source.saving || !hostLocal}
      disabledReason="PDF 正在处理或本地工具宿主未连接"
      onClick={() => {
        close?.()
        setBlocksOpen(false)
        setRedactionOpen(false)
        setImagesOpen(false)
        setFormsOpen(false)
        setAnnotationsOpen(false)
        setImageExportOpen(false)
        setInsertMode(false)
        setSelectTextMode(false)
        setLocalMode('signature')
      }}
    >
      <PenLine size={14} />
      签名
    </ToolbarButton>
  )
  const formsTrigger = (close?: () => void) => (
    <ToolbarButton
      label="交互表单"
      ref={formsTriggerRef}
      disabled={!hostForms || contentBusy}
      disabledReason="PDF 表单宿主未连接或正在处理"
      onClick={() => {
        close?.()
        setBlocksOpen(false)
        setRedactionOpen(false)
        setImagesOpen(false)
        setAnnotationsOpen(false)
        setFormsOpen(!formsOpen)
        if (!formsOpen) void runManualContentTool('list_form_fields', {})
      }}
    >
      交互表单
    </ToolbarButton>
  )
  const annotationsTrigger = (close?: () => void) => (
    <ToolbarButton
      label="便笺与标注"
      ref={annotationsTriggerRef}
      disabled={!hostAnnotations || contentBusy}
      disabledReason="PDF 批注执行器未连接或正在写入"
      onClick={() => {
        close?.()
        setBlocksOpen(false)
        setRedactionOpen(false)
        setImagesOpen(false)
        setFormsOpen(false)
        setAnnotationsOpen(!annotationsOpen)
        if (!annotationsOpen) void runManualContentTool('read_annotations', {})
      }}
    >
      便笺与标注
    </ToolbarButton>
  )
  const markupSelectedOriginal = async (type: 'highlight' | 'underline' | 'strikeout') => {
    const run = activeSelectedText
    if (!run || !verifiedSelection) return
    await runManualContentTool('markup_text', { page: run.page + 1, text: run.text, type })
    const bytes = agentSnapshotRef.current?.bytes
    if (bytes && bytes !== currentBytes) setMarkupFeedback({ bytes, key: textKey, run, type })
  }
  const replaceSelectedOriginal = async () => {
    const run = activeSelectedText
    if (!run || !verifiedSelection) return
    await runManualContentTool('edit_text', {
      page: run.page + 1,
      old_text: run.text,
      new_text: replacementDraft,
    })
  }

  /**
   * 查找的适配器。**只实现 `FindAdapter`**——没有 `replaceOne` / `replaceAll`，
   * 于是 `FindReplaceBar` 不渲染替换区；查找命中的子串没有经过完整
   * PDF 文字对象核验。原文替换只从画布点选后走宿主核验入口。
   *
   * 用一个 `useMemo` 固定引用：栏的 effect 依赖 `adapter`，每次渲染换一个新
   * 对象会让它每次渲染都重扫一遍（而重扫发布会触发渲染——一个死循环）。
   */
  const findAdapter = useMemo<FindAdapter | null>(() => {
    if (textIndex === null || textIndex.bytes !== currentBytes || textIndex.key !== textKey)
      return null
    const text = textIndex.index
    /** 上一次的查询。同样的查询复用同一份结果——`publish` 靠引用判「没变」 */
    let last: {
      query: string
      matchCase: boolean
      wholeWord: boolean
      matches: PdfMatch[]
    } | null = null
    const run = (query: string, matchCase: boolean, wholeWord: boolean): PdfMatch[] => {
      if (
        last !== null &&
        last.query === query &&
        last.matchCase === matchCase &&
        last.wholeWord === wholeWord
      ) {
        return last.matches
      }
      const matches = searchPdfText(text, query, { matchCase, wholeWord })
      last = { query, matchCase, wholeWord, matches }
      return matches
    }
    const clamp = (value: number, count: number) => (count === 0 ? 0 : Math.min(value, count - 1))
    return {
      search(query, options, activeIndex) {
        const matches = run(query, options.matchCase, options.wholeWord)
        highlightStore.publish({ matches, at: clamp(activeIndex, matches.length) })
        return matches.length
      },
      activate(index) {
        const matches = highlightStore.getSnapshot().matches
        const target = matches[clamp(index, matches.length)]
        highlightStore.publish({ matches, at: clamp(index, matches.length) })
        // 命中在别的页上就翻过去——画布只画一页，不翻过去就看不到高亮
        if (target !== undefined) goTo(target.page)
      },
      clear() {
        last = null
        highlightStore.publish(NO_HIGHLIGHT)
      },
    }
  }, [textIndex, textKey, currentBytes, highlightStore, goTo])

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

  /**
   * 解析失败。
   *
   * **必须单独分一支**：`page === null` 同时覆盖「还没解析完」与「解析失败」，
   * 只写一个「正在解析 PDF…」的话，一份坏掉的 PDF（或者不是 PDF 的文件——上传
   * 端只按扩展名判断）会永久停在那个转圈提示上，用户以为它在慢慢读。
   */
  if (opened.error !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>解析失败</ToolbarLabel>}>
        <EditorState tone="error">
          这份 PDF 打不开：{opened.error}
          <div style={{ marginTop: 12 }}>
            <ToolbarButton label="重试" onClick={source.reload}>
              重试
            </ToolbarButton>
          </div>
        </EditorState>
      </EditorShell>
    )
  }

  /**
   * 空文档（0 页）。
   *
   * **必须单独分一支**：`page === null` 同时覆盖三种情况——「还在解析」
   * 「解析失败」与「解析成功但一页都没有」。前两种上面已经拦掉了，
   * 留下的这一种直接落到「正在解析 PDF…」上就**永久转圈**：一份合法的
   * 0 页 PDF（`/Kids []`、`/Count 0`——导出的空白文档、被清空过的
   * 扫描件都可能长这样）实测会一直停在那句提示上，看起来像在慢慢读。
   *
   * 判据用 `opened.value` 而不是 `layout.length`：后者在没有改动时才等于
   * 解析结果，而这里的场景就是「没有任何页可编辑」——解析已经完成、
   * 结果就是空数组。
   */
  if (opened.value?.length === 0) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>这份 PDF 没有页面</ToolbarLabel>}>
        <EditorState>
          这份 PDF 里一页都没有（0 页）。原件已保存，可以下载后用别的工具打开确认。
        </EditorState>
      </EditorShell>
    )
  }

  if (page === null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取中…</ToolbarLabel>}>
        <EditorState>正在解析 PDF…</EditorState>
      </EditorShell>
    )
  }

  /* ── 工具条上那几个「什么时候不能点」的判据 ──────────────────── */

  const canFind =
    textIndex !== null && textIndex.bytes === currentBytes && textIndex.key === textKey
      ? textIndex.index.pagesWithText > 0
      : true
  const findReason =
    textIndex !== null &&
    textIndex.bytes === currentBytes &&
    textIndex.key === textKey &&
    textIndex.index.pagesWithText === 0
      ? '这份 PDF 没有文字层（扫描件），搜不到内容'
      : undefined
  const cropLimit = maxCropInset(page.base)
  const currentInset = page.crop === null ? 0 : Math.round(page.crop.left)

  /**
   * 裁剪档位。
   *
   * ## 为什么是「四边同一个值」而不是四边各自填
   *
   * 裁剪的常见用途只有一个：去掉扫描件四周的黑边/装订边。四个输入框的代价
   * 是四倍的界面与四倍的状态，而**四边等量是旋转无关的**——只裁左边 20pt 在
   * 旋转 90 度之后是「上面」还是「下面」需要想一遍，而「四边各 20pt」不需要。
   * 页面模型里仍然是四边分开的（`PdfCropInsets`），将来加单边裁剪不用改它。
   *
   * 超上限的档位**禁用并说明原因**（上限 = 短边的半径减 20pt）——不给出理由
   * 的灰按钮等于让人猜。
   */
  const cropItems: ToolbarMenuItem[] = [
    {
      key: 'none',
      label: '不裁剪（还原这一页）',
      active: page.crop === null,
      onSelect: () => crop(0),
    },
    { key: 'sep', label: '', separator: true },
    ...CROP_PRESETS.map((inset) => ({
      key: `crop-${inset}`,
      label: `四边各裁 ${inset} pt`,
      active: currentInset === inset,
      disabled: inset > cropLimit,
      disabledReason:
        inset > cropLimit
          ? `这一页只有 ${Math.round(page.base.width)} × ${Math.round(page.base.height)} pt，裁 ${inset} pt 就几乎没有内容了（上限 ${cropLimit} pt）`
          : undefined,
      onSelect: () => crop(inset),
    })),
  ]

  const paperKey = page.paper === null ? null : paperKeyOf(page.paper)
  /** 裁剪/纸型的说明。**只有还有未保存的改动时才加「待保存」前缀**——
      保存之后那些属性就是文件本身的一部分，再写「待保存」是说假话 */
  const geometry = describeGeometry(page)
  const geometryText = geometry === null ? null : dirty ? `待保存 · ${geometry}` : geometry
  const previousPage = () => goTo(at - 1)
  const nextPage = () => goTo(at + 1)
  const toggleFind = () => {
    setNotice(null)
    setFindOpen((open) => !open)
  }
  const canInsertText = hostApply !== undefined && page.crop === null && page.paper === null
  const insertReason =
    hostApply === undefined ? 'PDF 文字执行器尚未连接' : '请先保存当前页的裁剪或纸型，再插入文字'

  const navigationToolbar = (
    <>
      <span className="mimir-pptx-pdf-toolbar__page-nav">
        <ToolbarButton
          label="上一页"
          disabled={at === 0}
          disabledReason="已经是第一页"
          onClick={previousPage}
        >
          <ChevronLeftIcon />
        </ToolbarButton>
      </span>
      <ToolbarNumberField
        label="页码"
        value={at + 1}
        min={1}
        max={layout.length}
        suffix={`/ ${layout.length}`}
        onCommit={(next) => goTo(next - 1)}
      />
      <span className="mimir-pptx-pdf-toolbar__page-nav">
        <ToolbarButton
          label="下一页"
          disabled={at >= layout.length - 1}
          disabledReason="已经是最后一页"
          onClick={nextPage}
        >
          <ChevronRightIcon />
        </ToolbarButton>
      </span>
      <span className="mimir-pptx-pdf-toolbar__zoom">
        <ToolbarNumberField
          label="缩放（%）"
          value={zoom}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          suffix="%"
          onCommit={setZoom}
        />
      </span>
      <span className="mimir-pptx-pdf-toolbar__find">
        <ToolbarButton
          label="查找文字"
          active={findOpen}
          disabled={!canFind}
          disabledReason={findReason}
          onClick={toggleFind}
        >
          <FindIcon />
        </ToolbarButton>
      </span>
      {/* 删除保持独立确认，收纳菜单不能把它变成一步操作。 */}
      <ToolbarConfirm
        title="删掉这一页？"
        description="删除后可撤销；保存前不会改变库中的原件"
        confirmLabel="删除这一页"
        disabled={layout.length <= 1}
        onConfirm={removePage}
      >
        <ToolbarButton
          label="删除这一页"
          disabled={layout.length <= 1}
          disabledReason="至少要留一页"
        >
          <TrashIcon />
        </ToolbarButton>
      </ToolbarConfirm>
    </>
  )
  const pageMenu = (
    <ToolbarMenu
      label="页面与版式操作"
      text="页面"
      panelWidth={330}
      renderPanel={(close) => (
        <div className="mimir-pptx-pdf-toolbar__panel">
          <div className="mimir-pptx-pdf-toolbar__page-nav-menu">
            <ToolbarMenuItemRow
              item={{
                key: 'previous',
                label: '上一页',
                disabled: at === 0,
                disabledReason: '已经是第一页',
                onSelect: previousPage,
              }}
              close={close}
            />
            <ToolbarMenuItemRow
              item={{
                key: 'next',
                label: '下一页',
                disabled: at >= layout.length - 1,
                disabledReason: '已经是最后一页',
                onSelect: nextPage,
              }}
              close={close}
            />
            <ToolbarMenuSeparator />
          </div>
          <ToolbarMenuNote>旋转与页面顺序</ToolbarMenuNote>
          <ToolbarMenuItemRow
            item={{ key: 'left', label: '向左旋转 90 度', onSelect: () => rotate(-90) }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{ key: 'right', label: '向右旋转 90 度', onSelect: () => rotate(90) }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'move-before',
              label: '把这一页往前挪',
              disabled: at === 0,
              disabledReason: '已经在最前面',
              onSelect: () => move(-1),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'move-after',
              label: '把这一页往后挪',
              disabled: at >= layout.length - 1,
              disabledReason: '已经在最后面',
              onSelect: () => move(1),
            }}
            close={close}
          />
          <ToolbarMenuSeparator />
          <ToolbarMenuNote>整份文档</ToolbarMenuNote>
          <ToolbarMenuItemRow
            item={{
              key: 'rot-all-left',
              label: '全部页向左旋转 90 度',
              onSelect: () => rotateAll(-90),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'rot-all-right',
              label: '全部页向右旋转 90 度',
              onSelect: () => rotateAll(90),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'reverse',
              label: '整份倒序（第一页与最后一页互换）',
              disabled: layout.length < 2,
              disabledReason: '只有一页，倒序没有变化',
              onSelect: reverseOrder,
            }}
            close={close}
          />
          <ToolbarMenuSeparator />
          <ToolbarMenuNote>裁剪只改可视区，不删除页内容；换纸型会按比例缩放内容。</ToolbarMenuNote>
          {cropItems.map((item) => (
            <ToolbarMenuItemRow key={item.key} item={item} close={close} />
          ))}
          <ToolbarMenuFields label="这一页的纸型">
            <ToolbarSelect<PaperKey | ''>
              label="这一页的纸型（会按比例缩放内容）"
              value={paperKey ?? ''}
              options={[
                { value: '', label: '原件尺寸' },
                ...PAPER_KEYS.map((key) => ({
                  value: key,
                  label: `${PAPER_SIZES[key].label}（${Math.round(PAPER_SIZES[key].width)} × ${Math.round(PAPER_SIZES[key].height)} pt）`,
                })),
              ]}
              onChange={paper}
            />
          </ToolbarMenuFields>
          <ToolbarMenuSeparator />
          <ToolbarMenuNote>插入页面</ToolbarMenuNote>
          <ToolbarMenuItemRow
            item={{
              key: 'insert-text',
              label: '点击页面位置插入文字',
              active: insertMode,
              disabled: !canInsertText || contentBusy,
              disabledReason: contentBusy ? '文字正在写入' : insertReason,
              onSelect: () => {
                setAnnotationsOpen(false)
                setRedactionOpen(false)
                setInsertMode((value) => !value)
                setInsertPoint(null)
                setNotice(null)
              },
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'insert-blank',
              label: '在当前页之后插入一张 A4 空白页',
              onSelect: insertBlank,
            }}
            close={close}
          />
          <ToolbarMenuFields label="从另一份 PDF 导入页面">
            <ToolbarFileButton
              label="从另一份 PDF 导入页面（它的全部页面，插在当前页之后）"
              accept="application/pdf,.pdf"
              onPick={importPages}
            >
              <FileImportIcon />
            </ToolbarFileButton>
          </ToolbarMenuFields>
          <div className="mimir-pptx-pdf-toolbar__find-menu">
            <ToolbarMenuSeparator />
            <ToolbarMenuItemRow
              item={{
                key: 'find',
                label: '查找文字',
                active: findOpen,
                disabled: !canFind,
                disabledReason: findReason,
                onSelect: toggleFind,
              }}
              close={close}
            />
          </div>
          <ToolbarMenuSeparator />
          <ToolbarMenuNote>缩放</ToolbarMenuNote>
          <ToolbarMenuItemRow
            item={{
              key: 'zoom-out',
              label: '缩小',
              disabled: zoom <= ZOOM_MIN,
              disabledReason: `已经到最小缩放 ${ZOOM_MIN}%`,
              onSelect: () => setZoom((value) => Math.max(ZOOM_MIN, value - ZOOM_STEP)),
            }}
            close={close}
          />
          <ToolbarMenuItemRow
            item={{
              key: 'zoom-in',
              label: '放大',
              disabled: zoom >= ZOOM_MAX,
              disabledReason: `已经到最大缩放 ${ZOOM_MAX}%`,
              onSelect: () => setZoom((value) => Math.min(ZOOM_MAX, value + ZOOM_STEP)),
            }}
            close={close}
          />
        </div>
      )}
    />
  )

  const closeInspector = () => {
    assetRequest?.cancel()
    if (contentBusy) {
      deferredInspectorFocus.current = {
        documentId,
        editor: document.activeElement?.closest('.mimir-editor') ?? null,
        sectionKey: signatureEnabled
          ? 'visual-signature'
          : localMode
            ? 'document-tools'
            : blocksShown
              ? 'text-blocks'
              : imagesOpen
                ? 'images'
                : formsOpen
                  ? 'forms'
                  : 'annotations',
        trigger: (signatureEnabled
          ? signatureTriggerRef
          : localMode
            ? localTriggerRef
            : blocksShown
              ? blocksTriggerRef
              : imagesOpen
                ? imagesTriggerRef
                : formsOpen
                  ? formsTriggerRef
                  : annotationsTriggerRef
        ).current,
      }
    }
    setBlocksOpen(false)
    setRedactionOpen(false)
    setImagesOpen(false)
    setFormsOpen(false)
    setAnnotationsOpen(false)
    setLocalMode(null)
    setImageExportOpen(false)
  }
  const imageExportShown =
    imageExportOpen && !assetRequest && !localMode && !imagesOpen && !formsOpen && !annotationsOpen
  const inspectorPanel = redactionShown ? (
    redaction.panel
  ) : assetRequest ? (
    <PdfLocalAssetRequest
      tool={assetRequest.tool}
      onContinue={assetRequest.confirm}
      onCancel={closeInspector}
    />
  ) : signatureEnabled ? (
    signature.placing ? null : (
      signature.panel
    )
  ) : localMode ? (
    <PdfLocalPanel
      key={`${documentId}:${localMode}`}
      mode={localMode}
      onModeChange={setLocalMode}
      drawingControls={drawing.controls}
      drawingFooter={drawing.footer}
      selectedDrawingId={drawing.selectedId}
      onSelectDrawing={drawing.onSelect}
      page={at + 1}
      pageCount={layout.length}
      info={
        localInfo?.bytes === currentBytes &&
        (localInfo.pages ? localInfo.pages === layout : sameAsFile)
          ? localInfo.info
          : undefined
      }
      outputs={localOutputs}
      busy={contentBusy}
      error={notice ?? (drawingEnabled ? drawingPreview.error : null)}
      onClose={closeInspector}
      onAction={(tool, args) => runManualContentTool(tool, args)}
    />
  ) : imagesOpen ? (
    <PdfImagePanel
      sourceKey={`${documentId}:${imageList?.snapshot.sha256}`}
      snapshot={imageList?.bytes === currentBytes ? imageList.snapshot : undefined}
      page={at + 1}
      selected={imageSelection}
      busy={contentBusy}
      onSelect={setImageSelection}
      onAction={(tool, args, version) => runManualContentTool(tool, args, version)}
      error={notice}
      onClose={() => closeInspector()}
      getVersion={() => agentRef.current?.getVersion() ?? 0}
    />
  ) : formsOpen ? (
    <PdfFormPanel
      snapshot={
        formList?.bytes === currentBytes &&
        (formList.pages ? formList.pages === layout : sameAsFile)
          ? formList.snapshot
          : undefined
      }
      busy={contentBusy || formsReading}
      onAction={(tool, args) => runManualContentTool(tool, args)}
      error={notice}
      onGotoPage={(pageNumber) => goTo(pageNumber - 1)}
      onClose={() => closeInspector()}
    />
  ) : annotationsOpen ? (
    <section className="mimir-pdf-panel" role="region" aria-label="PDF 批注面板">
      <PdfInspectorHeader
        title="批注"
        detail={`第 ${at + 1} 页`}
        busy={contentBusy}
        refreshLabel="刷新批注"
        closeLabel="关闭批注面板"
        onRefresh={() => void runManualContentTool('read_annotations', {})}
        onClose={() => closeInspector()}
      />
      <div className="mimir-pdf-inspector__content mimir-pdf-annotations">
        {notice && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {notice}
          </p>
        )}
        <div className="mimir-pdf-annotations__selection">
          <span className="mimir-pdf-inspector__meta">选择批注</span>
          <ToolbarSelect
            label="选择批注"
            value={noteId}
            options={[
              { value: '', label: '选择便笺或标注' },
              ...(annotationList?.bytes === currentBytes ? annotationList.items : [])
                .filter((entry) => entry.page === at + 1)
                .map((entry) => ({
                  value: entry.id,
                  label: `${entry.parentId ? '回复' : entry.type === 'note' ? '便笺' : entry.type}：${entry.text || entry.id}`,
                })),
            ]}
            onChange={(id) => {
              setNoteId(id)
              setNoteDraft(annotationList?.items.find((entry) => entry.id === id)?.text ?? '')
            }}
          />
        </div>
        <label className="mimir-pdf-inspector__control">
          <span>批注内容</span>
          <ToolbarTextArea label="批注内容" value={noteDraft} onChange={setNoteDraft} rows={2} />
        </label>
        <h3 className="mimir-pdf-inspector__section-title">新便笺位置</h3>
        <div className="mimir-pdf-inspector__grid">
          <label className="mimir-pdf-inspector__control">
            <span>横坐标 · pt</span>
            <ToolbarNumberField
              label="便笺横坐标（pt）"
              value={noteX}
              min={0}
              onCommit={setNoteX}
            />
          </label>
          <label className="mimir-pdf-inspector__control">
            <span>纵坐标 · pt</span>
            <ToolbarNumberField
              label="便笺纵坐标（pt）"
              value={noteY}
              min={0}
              onCommit={setNoteY}
            />
          </label>
        </div>
        <div className="mimir-pdf-annotations__actions">
          <ToolbarButton
            label="添加便笺"
            primary
            disabled={contentBusy || !noteDraft.trim()}
            onClick={() =>
              void runManualContentTool('add_note', {
                page: at + 1,
                text: noteDraft,
                x: noteX,
                y: noteY,
              })
            }
          />
          {(() => {
            const selected =
              annotationList?.bytes === currentBytes
                ? annotationList.items.find((entry) => entry.id === noteId && entry.page === at + 1)
                : undefined
            if (!selected) return null
            return (
              <div className="mimir-pdf-annotations__context-actions">
                <ToolbarButton
                  label="回复便笺"
                  disabled={
                    contentBusy ||
                    !noteDraft.trim() ||
                    selected?.type !== 'note' ||
                    !!selected.parentId
                  }
                  onClick={() =>
                    void runManualContentTool('reply_note', {
                      page: at + 1,
                      note_id: noteId,
                      text: noteDraft,
                    })
                  }
                >
                  回复
                </ToolbarButton>
                <ToolbarButton
                  label="修改批注内容"
                  disabled={contentBusy || !noteDraft.trim() || selected?.type !== 'note'}
                  onClick={() =>
                    void runManualContentTool('edit_note', {
                      page: at + 1,
                      note_id: noteId,
                      text: noteDraft,
                    })
                  }
                >
                  修改
                </ToolbarButton>
                <ToolbarConfirm
                  title="删除所选批注？"
                  description="删除便笺也会删除其回复，保存前可放弃保存退出。"
                  confirmLabel="删除批注"
                  disabled={contentBusy || !!selected.parentId}
                  onConfirm={() =>
                    void runManualContentTool(
                      selected.type === 'note' ? 'delete_note' : 'delete_markup',
                      {
                        page: at + 1,
                        ...(selected.type === 'note'
                          ? { note_id: noteId }
                          : { markup_ids: [noteId] }),
                      },
                    )
                  }
                >
                  <ToolbarButton
                    label="删除所选批注"
                    disabled={contentBusy || !!selected.parentId}
                    disabledReason={contentBusy ? 'PDF 操作正在执行' : '请选择主批注后删除'}
                  >
                    删除
                  </ToolbarButton>
                </ToolbarConfirm>
              </div>
            )
          })()}
        </div>
        <ul className="mimir-pdf-annotations__threads" aria-label="本页批注与回复">
          {(annotationList?.bytes === currentBytes ? annotationList.items : [])
            .filter((entry) => entry.page === at + 1)
            .map((entry) => (
              <li key={entry.id}>
                {entry.parentId ? '↳ ' : ''}
                {entry.author}：{entry.text || entry.type}
              </li>
            ))}
        </ul>
      </div>
    </section>
  ) : blocksShown && currentBytes && hostBlocks ? (
    <PdfTextBlockPanel
      key={`${documentId}:${at}:${historyVersion}`}
      bytes={currentBytes}
      blocks={currentBlocks}
      selected={selectedBlock}
      getVersion={getBlockVersion}
      size={displaySize(page)}
      host={hostBlocks}
      busy={contentBusy || source.saving}
      ready={textIndex?.bytes === currentBytes && textIndex.key === textKey && !blockIssue}
      issue={blockIssue}
      onSelect={selectBlock}
      onApply={runManualContentTool}
      onClose={closeInspector}
    />
  ) : imageExportShown ? (
    <PdfImageExportControls
      identity={imageExportIdentity}
      page={at + 1}
      pageCount={layout.length}
      blocked={contentBusy || source.saving}
      onClose={closeInspector}
      getSnapshot={async (signal) => {
        const handle = agentRef.current
        const version = handle?.getVersion()
        if (!currentBytes || !handle || version === undefined) throw new Error('PDF 尚未就绪')
        const assertCurrent = () => {
          signal.throwIfAborted()
          if (
            agentRef.current !== handle ||
            handle.getVersion() !== version ||
            agentSnapshotRef.current?.bytes !== currentBytes ||
            agentSnapshotRef.current?.pages !== layout
          )
            throw new Error('PDF 画布已变化，请重新生成页面图像')
        }
        assertCurrent()
        const bytes = await buildPdfWorkingCopy({
          bytes: currentBytes,
          layout,
          imports,
          host: hostLocal,
          version,
          signal,
          assertCurrent,
        })
        assertCurrent()
        return bytes
      }}
    />
  ) : null
  return (
    <EditorShell
      flush={flush}
      toolbar={
        <CompactToolbar
          quickAccess={
            <>
              <ToolbarButton
                label={source.saving ? '保存中…' : '保存到库'}
                disabled={!dirty || source.saving || contentBusy}
                disabledReason={
                  contentBusy ? 'PDF 正在处理' : source.saving ? '正在保存' : '没有改动，不用保存'
                }
                onClick={() => void save()}
              >
                <SaveIcon />
              </ToolbarButton>
              <ToolbarButton
                label="撤销"
                disabled={!history.canUndo || contentBusy || source.saving}
                disabledReason="没有可撤销的编辑"
                onClick={() => moveHistory('undo')}
              >
                <UndoIcon />
              </ToolbarButton>
              <ToolbarButton
                label="重做"
                disabled={!history.canRedo || contentBusy || source.saving}
                disabledReason="没有可重做的编辑"
                onClick={() => moveHistory('redo')}
              >
                <RedoIcon />
              </ToolbarButton>
            </>
          }
          tabs={[
            { key: 'home', label: '开始' },
            { key: 'edit', label: '编辑' },
            { key: 'page', label: '页面' },
            { key: 'draw', label: '绘制' },
            { key: 'view', label: '视图' },
          ]}
          sections={[
            {
              key: 'redaction-copy',
              label: '涂黑副本',
              tab: 'edit',
              minWidth: 0,
              content: (
                <ToolbarButton
                  ref={redactionTriggerRef}
                  label="标记涂黑副本"
                  active={redactionShown}
                  disabled={!ready || contentBusy || source.saving || !hostLocal}
                  disabledReason={!hostLocal ? 'PDF 本地工具宿主未连接' : 'PDF 尚未就绪或正在处理'}
                  onClick={() => {
                    if (redactionIssue) {
                      setNotice(redactionIssue)
                      return
                    }
                    setBlocksOpen(false)
                    setImagesOpen(false)
                    setFormsOpen(false)
                    setAnnotationsOpen(false)
                    setImageExportOpen(false)
                    setLocalMode(null)
                    setInsertMode(false)
                    setSelectTextMode(false)
                    setPendingEditorOpen(false)
                    setSelectedText(null)
                    setInsertPoint(null)
                    setNotice(null)
                    setRedactionOpen(!redactionShown)
                  }}
                >
                  涂黑副本
                </ToolbarButton>
              ),
            },
            {
              key: 'page-images',
              label: '页面图像',
              tab: 'view',
              minWidth: 0,
              content: (
                <ToolbarButton
                  ref={imageExportTriggerRef}
                  label="导出页面图像"
                  active={imageExportShown}
                  disabled={!ready || contentBusy || source.saving}
                  disabledReason="PDF 尚未就绪或正在处理"
                  onClick={() => {
                    setBlocksOpen(false)
                    setRedactionOpen(false)
                    setImagesOpen(false)
                    setFormsOpen(false)
                    setAnnotationsOpen(false)
                    setLocalMode(null)
                    setImageExportOpen(true)
                  }}
                >
                  导出页面图像
                </ToolbarButton>
              ),
            },
            {
              key: 'visual-signature',
              label: '签名',
              tab: 'draw',
              minWidth: 0,
              content: signatureTrigger(),
              collapsedContent: (close) => signatureTrigger(close),
            },
            {
              key: 'canvas-drawing',
              label: '画布绘图',
              tab: 'draw',
              minWidth: 0,
              content: (
                <ToolbarButton
                  label="打开画布绘图"
                  active={drawingEnabled}
                  disabled={!ready || contentBusy || source.saving || !hostLocal}
                  disabledReason="PDF 正在处理或本地工具宿主未连接"
                  onClick={() => {
                    setBlocksOpen(false)
                    setRedactionOpen(false)
                    setImagesOpen(false)
                    setFormsOpen(false)
                    setAnnotationsOpen(false)
                    setInsertMode(false)
                    setSelectTextMode(false)
                    setLocalMode('drawing')
                  }}
                >
                  <PdfDrawingRibbonIcon />
                  画布绘图
                </ToolbarButton>
              ),
            },
            {
              key: 'document-tools',
              label: '文档工具',
              tab: 'page',
              minWidth: 0,
              content: (
                <ToolbarButton
                  ref={localTriggerRef}
                  label="页面、绘图与文档属性"
                  active={localMode !== null}
                  disabled={!ready || contentBusy || !hostLocal}
                  disabledReason={!hostLocal ? 'PDF 本地工具宿主未连接' : 'PDF 正在处理'}
                  onClick={() => {
                    setBlocksOpen(false)
                    setRedactionOpen(false)
                    setImagesOpen(false)
                    setFormsOpen(false)
                    setAnnotationsOpen(false)
                    setLocalOutputs([])
                    setLocalMode('pages')
                    void runManualContentTool('get_document_properties', {})
                  }}
                >
                  页面与文档工具
                </ToolbarButton>
              ),
            },
            {
              key: 'navigation',
              label: '导航与查找',
              tab: 'home',
              minWidth: 0,
              content: navigationToolbar,
            },
            {
              key: 'insert-text',
              label: '文字',
              tab: 'edit',
              minWidth: 0,
              content: (
                <>
                  <ToolbarButton
                    label="插入文字"
                    active={insertMode}
                    disabled={!canInsertText || contentBusy}
                    disabledReason={contentBusy ? '文字正在写入' : insertReason}
                    onClick={() => {
                      setBlocksOpen(false)
                      setRedactionOpen(false)
                      setAnnotationsOpen(false)
                      setInsertMode((value) => !value)
                      setInsertPoint(null)
                      setNotice(null)
                    }}
                  >
                    插入文字
                  </ToolbarButton>
                  <ToolbarButton
                    label="编辑待保存文字"
                    active={pendingEditorOpen}
                    disabled={pendingInserts.length === 0 || contentBusy}
                    disabledReason={contentBusy ? '文字正在写入' : '当前没有待保存的插入文字'}
                    onClick={() => {
                      setRedactionOpen(false)
                      setPendingEditorOpen((value) => !value)
                    }}
                  >
                    编辑插字
                  </ToolbarButton>
                  <ToolbarButton
                    label="定位原文"
                    active={selectTextMode}
                    disabled={!ready || contentBusy}
                    disabledReason={contentBusy ? '文字正在写入' : 'PDF 尚未读取完成'}
                    onClick={() => {
                      setBlocksOpen(false)
                      setRedactionOpen(false)
                      setAnnotationsOpen(false)
                      setSelectTextMode((value) => !value)
                      inspectRequestRef.current++
                      setInspectingText(false)
                      setInsertMode(false)
                      setSelectedText(null)
                      setReplacementDraft('')
                      setNotice(null)
                    }}
                  >
                    定位／标注原文
                  </ToolbarButton>
                </>
              ),
            },
            {
              key: 'page-rotate',
              label: '旋转',
              tab: 'page',
              minWidth: 0,
              content: (
                <>
                  <ToolbarButton label="向左旋转 90 度" onClick={() => rotate(-90)}>
                    向左旋转
                  </ToolbarButton>
                  <ToolbarButton label="向右旋转 90 度" onClick={() => rotate(90)}>
                    向右旋转
                  </ToolbarButton>
                </>
              ),
            },
            {
              key: 'text-blocks',
              label: '原文段落',
              tab: 'edit',
              minWidth: 0,
              content: (
                <ToolbarButton
                  ref={blocksTriggerRef}
                  label="原文段落编辑"
                  active={blocksShown}
                  disabled={!ready || !hostBlocks || contentBusy || source.saving}
                  disabledReason={!hostBlocks ? 'PDF 原文段落宿主未连接' : 'PDF 正在处理'}
                  onClick={() => {
                    const open = !blocksShown
                    setImagesOpen(false)
                    setFormsOpen(false)
                    setAnnotationsOpen(false)
                    setImageExportOpen(false)
                    setLocalMode(null)
                    setInsertMode(false)
                    setSelectTextMode(false)
                    setBlocksOpen(open)
                    setBlockSelection(null)
                    setNotice(null)
                  }}
                >
                  原文段落
                </ToolbarButton>
              ),
            },
            {
              key: 'images',
              label: '图片',
              tab: 'edit',
              minWidth: 0,
              content: (
                <ToolbarButton
                  label="PDF图片工具"
                  ref={imagesTriggerRef}
                  disabled={!hostImages || contentBusy}
                  disabledReason="PDF图片宿主未连接或正在处理"
                  onClick={() => {
                    setBlocksOpen(false)
                    setRedactionOpen(false)
                    setFormsOpen(false)
                    setAnnotationsOpen(false)
                    setImagesOpen(!imagesOpen)
                    if (!imagesOpen) void runManualContentTool('list_page_images', {})
                  }}
                >
                  图片
                </ToolbarButton>
              ),
            },
            {
              key: 'forms',
              label: '表单',
              tab: 'edit',
              minWidth: 0,
              content: formsTrigger(),
              collapsedContent: (close) => formsTrigger(close),
            },
            {
              key: 'annotations',
              label: '批注',
              tab: 'edit',
              minWidth: 0,
              content: annotationsTrigger(),
              collapsedContent: (close) => annotationsTrigger(close),
            },
            {
              key: 'page-order',
              label: '顺序',
              tab: 'page',
              minWidth: 0,
              content: (
                <>
                  <ToolbarButton
                    label="上一页位置"
                    disabled={at === 0}
                    disabledReason="已经在最前面"
                    onClick={() => move(-1)}
                  >
                    前移
                  </ToolbarButton>
                  <ToolbarButton
                    label="下一页位置"
                    disabled={at >= layout.length - 1}
                    disabledReason="已经在最后面"
                    onClick={() => move(1)}
                  >
                    后移
                  </ToolbarButton>
                  <ToolbarButton label="插入空白页" onClick={insertBlank}>
                    空白页
                  </ToolbarButton>
                  <ToolbarFileButton
                    label="从 PDF 导入页面"
                    accept="application/pdf,.pdf"
                    onPick={importPages}
                  >
                    <FileImportIcon />
                  </ToolbarFileButton>
                </>
              ),
            },
            {
              key: 'page-layout',
              label: '裁剪与纸型',
              tab: 'page',
              minWidth: 0,
              content: pageMenu,
            },
            {
              key: 'page-delete',
              label: '删除',
              tab: 'page',
              minWidth: 0,
              content: (
                <ToolbarConfirm
                  title="删掉这一页？"
                  description="删除后可撤销；保存前不会改变库中的原件"
                  confirmLabel="删除这一页"
                  disabled={layout.length <= 1}
                  onConfirm={removePage}
                >
                  <ToolbarButton
                    label="删除这一页"
                    disabled={layout.length <= 1}
                    disabledReason="至少要留一页"
                  >
                    <TrashIcon />
                  </ToolbarButton>
                </ToolbarConfirm>
              ),
            },
            {
              key: 'view',
              label: '缩放',
              tab: 'view',
              minWidth: 0,
              content: (
                <ToolbarNumberField
                  label="缩放（%）"
                  value={zoom}
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  suffix="%"
                  onCommit={setZoom}
                />
              ),
            },
          ]}
        />
      }
      /*
        次工具条：查找栏。它排在这里（而不是工具条里）的原因是**它有自己的
        两行**（查询 + 替换），塞进工具条会把工具条撑成两行半。索引还没扫完时
        显示一行进度——此时不挂查找栏：栏上没有索引会显示「无匹配」，那是在
        说假话。
      */
      subbar={
        selectTextMode ? (
          <div className="mimir-pdf-insert-bar">
            <ToolbarLabel>
              {textIndex?.bytes !== currentBytes || textIndex.key !== textKey
                ? scan === null
                  ? '正在读取原文位置…'
                  : `正在读取原文位置… ${scan.done} / ${scan.total} 页`
                : textIndex.index.pagesWithText === 0
                  ? '这份 PDF 没有可点选的文字层'
                  : activeSelectedText === null
                    ? '点选页面上的一整段原文，以核对内容和位置'
                    : `${selectedText?.target === undefined ? (inspectingText ? '正在核验原文对象' : '只读定位') : '已核验原文对象'} · 第 ${activeSelectedText.page + 1} 页：${activeSelectedText.text.slice(0, 120)}`}
            </ToolbarLabel>
            {verifiedSelection !== undefined && activeSelectedText !== null && (
              <>
                {(['highlight', 'underline', 'strikeout'] as const).map((type) => (
                  <ToolbarButton
                    key={type}
                    label={
                      type === 'highlight'
                        ? '高亮原文'
                        : type === 'underline'
                          ? '下划线标注'
                          : '删除线标注'
                    }
                    disabled={
                      contentBusy ||
                      source.saving ||
                      settled !== null ||
                      pendingInserts.length > 0 ||
                      !hostMarkup
                    }
                    disabledReason={
                      !hostMarkup
                        ? 'PDF 标注执行器尚未连接'
                        : contentBusy
                          ? '内容正在写入'
                          : source.saving
                            ? '正在保存'
                            : '请先保存当前页面或插字改动'
                    }
                    onClick={() => void markupSelectedOriginal(type)}
                  >
                    {type === 'highlight' ? '高亮' : type === 'underline' ? '下划线' : '删除线'}
                  </ToolbarButton>
                ))}
                <ToolbarConfirm
                  title="删除这段原文？"
                  description="删除后保留原来的空白位置，保存前可放弃保存退出。"
                  confirmLabel="删除原文"
                  disabled={
                    contentBusy || source.saving || settled !== null || pendingInserts.length > 0
                  }
                  onConfirm={() =>
                    void runManualContentTool('edit_text', {
                      page: activeSelectedText.page + 1,
                      old_text: activeSelectedText.text,
                      new_text: '',
                    })
                  }
                >
                  <ToolbarButton
                    label="删除原文"
                    disabled={
                      contentBusy || source.saving || settled !== null || pendingInserts.length > 0
                    }
                  >
                    删除原文
                  </ToolbarButton>
                </ToolbarConfirm>
                <ToolbarTextField
                  label="替换为"
                  value={replacementDraft}
                  onChange={setReplacementDraft}
                  placeholder="输入新文字"
                />
                <ToolbarButton
                  label="替换原文"
                  disabled={
                    !replacementDraft.trim() ||
                    replacementDraft === activeSelectedText.text ||
                    replacementDraft.includes(activeSelectedText.text) ||
                    replacementDraft.length > 10_000 ||
                    contentBusy ||
                    source.saving ||
                    settled !== null ||
                    pendingInserts.length > 0
                  }
                  disabledReason={
                    contentBusy
                      ? '文字正在写入'
                      : source.saving
                        ? '正在保存'
                        : settled !== null || pendingInserts.length > 0
                          ? '请先保存当前页面或插字改动'
                          : replacementDraft.includes(activeSelectedText.text)
                            ? '替换结果不能包含原文'
                            : '请输入不同于原文的新文字'
                  }
                  onClick={() => void replaceSelectedOriginal()}
                >
                  替换原文
                </ToolbarButton>
              </>
            )}
          </div>
        ) : insertMode ? (
          <div className="mimir-pdf-insert-bar">
            <ToolbarLabel>
              {insertPoint === null || insertPoint.page !== at
                ? '未选择位置'
                : `第 ${at + 1} 页 · X ${Math.round(insertPoint.origin[0])} / Y ${Math.round(insertPoint.origin[1])} pt`}
            </ToolbarLabel>
            <ToolbarTextField
              label="要插入的文字"
              value={insertText}
              onChange={setInsertText}
              onSubmit={() => void insertAtPoint()}
              placeholder="输入文字"
            />
            <ToolbarButton
              label={contentBusy ? '写入中…' : '插入文字'}
              disabled={contentBusy || insertPoint?.page !== at || !insertText.trim()}
              onClick={() => void insertAtPoint()}
            >
              插入
            </ToolbarButton>
            <ToolbarButton label="取消插入文字" onClick={() => setInsertMode(false)}>
              取消
            </ToolbarButton>
          </div>
        ) : pendingEditorOpen && pendingValues !== null ? (
          <div className="mimir-pdf-insert-bar">
            <ToolbarSelect<string>
              label="待保存文字"
              value={pendingValues.id}
              options={pendingInserts.map((insert) => ({
                value: insert.id,
                label: `第 ${insert.pageIndex + 1} 页 · ${insert.text.slice(0, 24)}`,
              }))}
              onChange={(id) => {
                setSelectedPendingId(id)
                setPendingDraft(null)
              }}
            />
            <ToolbarTextField
              label="插入文字内容"
              value={pendingValues.text}
              onChange={(text) => setPendingDraft({ ...pendingValues, text })}
            />
            <ToolbarNumberField
              label="文字 X 坐标"
              value={Math.round(pendingValues.x)}
              min={0}
              max={10000}
              onCommit={(x) => setPendingDraft({ ...pendingValues, x })}
            />
            <ToolbarNumberField
              label="文字 Y 坐标"
              value={Math.round(pendingValues.y)}
              min={0}
              max={10000}
              onCommit={(y) => setPendingDraft({ ...pendingValues, y })}
            />
            <ToolbarNumberField
              label="文字字号"
              value={pendingValues.fontSize}
              min={1}
              max={500}
              onCommit={(fontSize) => setPendingDraft({ ...pendingValues, fontSize })}
            />
            <ToolbarTextField
              label="文字颜色"
              value={pendingValues.color}
              onChange={(color) => setPendingDraft({ ...pendingValues, color })}
            />
            <ToolbarButton
              label="更新插入文字"
              disabled={contentBusy}
              onClick={() => void changePending('edit_inserted_text')}
            >
              更新
            </ToolbarButton>
            <ToolbarButton
              label="移动插入文字"
              disabled={contentBusy}
              onClick={() => void changePending('move_inserted_text')}
            >
              移动
            </ToolbarButton>
            <ToolbarConfirm
              title="删除这段待保存文字？"
              description="删除后仍可在保存前重新插入"
              confirmLabel="删除文字"
              onConfirm={() => void changePending('delete_inserted_text')}
            >
              <ToolbarButton label="删除插入文字" disabled={contentBusy}>
                删除
              </ToolbarButton>
            </ToolbarConfirm>
            <ToolbarButton label="关闭插入文字编辑" onClick={() => setPendingEditorOpen(false)}>
              关闭
            </ToolbarButton>
          </div>
        ) : findOpen ? (
          findAdapter !== null ? (
            <FindReplaceBar
              adapter={findAdapter}
              query={findQuery}
              onQueryChange={setFindQuery}
              options={findOptions}
              onOptionsChange={setFindOptions}
              onClose={() => setFindOpen(false)}
              label="在 PDF 里查找"
            />
          ) : (
            <ToolbarLabel>
              {scan === null
                ? '正在读取文字层…'
                : `正在读取文字层… ${scan.done} / ${scan.total} 页`}
            </ToolbarLabel>
          )
        ) : undefined
      }
      footer={
        notice !== null ? (
          <>
            <ToolbarNotice>{notice}</ToolbarNotice>
            <ToolbarButton label="关掉这条提示" onClick={() => setNotice(null)}>
              知道了
            </ToolbarButton>
          </>
        ) : undefined
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          <ToolbarLabel>
            {pageLabel(page, at, layout.length)}
            {geometryText === null ? null : ` · ${geometryText}`}
          </ToolbarLabel>
        </>
      }
    >
      <div className="mimir-pdf-workspace">
        <div className="mimir-pdf-workspace__canvas">
          <ThumbnailSidebar
            pages={thumbnailPages}
            activeIndex={at}
            onSelect={goTo}
            onInsert={insertBlankAt}
            onDuplicate={duplicatePage}
            onDelete={removePageAt}
            onMove={movePage}
            renderThumbnail={(index: number) => {
              const ref = layout[index]
              return ref === undefined ? null : (
                <PdfThumbnail bytes={currentBytes} page={ref} imports={imports} />
              )
            }}
            noun="页"
          >
            <div ref={canvasRef} className="me-scroll mimir-pdf-stage">
              {renderError !== null ? (
                <EditorState tone="error">渲染失败：{renderError}</EditorState>
              ) : (
                <PdfSheet
                  bytes={
                    (drawingEnabled || signatureEnabled) && drawingPage
                      ? drawingPreview.value!.bytes
                      : currentBytes
                  }
                  page={
                    (drawingEnabled || signatureEnabled) && drawingPage
                      ? {
                          origin: { kind: 'original', index: at },
                          rotation: drawingPage.rotation,
                          base: drawingPage,
                          crop: null,
                          paper: null,
                        }
                      : page
                  }
                  imports={
                    (drawingEnabled || signatureEnabled) && drawingPage ? NO_IMPORTS : imports
                  }
                  drawingOverlay={
                    redactionShown
                      ? redaction.overlay
                      : signatureEnabled
                        ? signature.overlay
                        : drawing.overlay
                  }
                  zoom={zoom}
                  highlight={{
                    matches:
                      textIndex?.bytes === currentBytes && textIndex.key === textKey
                        ? highlight.matches
                        : [],
                    at: highlight.at,
                    page: at,
                  }}
                  selectedText={activeSelectedText?.page === at ? activeSelectedText : null}
                  blockSelection={selectedBlock?.rect}
                  imageSelection={(() => {
                    const item =
                      imagesOpen && imageList?.bytes === currentBytes
                        ? imageList.snapshot.images.find(
                            (entry) =>
                              entry.page === at + 1 && entry.image_number === imageSelection,
                          )
                        : undefined
                    const shown = displaySize(page)
                    return item
                      ? {
                          x: item.x / shown.width,
                          y: item.y / shown.height,
                          width: item.width / shown.width,
                          height: item.height / shown.height,
                        }
                      : undefined
                  })()}
                  markupFeedback={
                    markupFeedback?.bytes === currentBytes &&
                    markupFeedback.key === textKey &&
                    markupFeedback.run.page === at
                      ? markupFeedback
                      : null
                  }
                  onError={setRenderError}
                  onPickPoint={
                    !redactionShown && !drawingEnabled && !signatureEnabled && insertMode
                      ? (origin) => setInsertPoint({ page: at, origin })
                      : undefined
                  }
                  onPickText={
                    blocksShown && !contentBusy && !source.saving && !blockIssue
                      ? pickBlock
                      : !redactionShown &&
                          !drawingEnabled &&
                          !signatureEnabled &&
                          selectTextMode &&
                          textIndex?.bytes === currentBytes &&
                          textIndex.key === textKey
                        ? pickText
                        : undefined
                  }
                />
              )}
            </div>
          </ThumbnailSidebar>
        </div>
        {signatureEnabled && signature.actions}
        {inspectorPanel && (
          <PdfInspector
            fallbackSectionKey={
              redactionShown
                ? 'redaction-copy'
                : imageExportShown
                  ? 'page-images'
                  : blocksShown
                    ? 'text-blocks'
                    : signatureEnabled
                      ? 'visual-signature'
                      : localMode
                        ? 'document-tools'
                        : imagesOpen
                          ? 'images'
                          : formsOpen
                            ? 'forms'
                            : 'annotations'
            }
            onClose={closeInspector}
            onEscape={() => {
              if (signatureEnabled && signature.hasDraft) signature.cancel()
              else if (drawingEnabled && drawing.hasDraft) drawing.cancel()
              else closeInspector()
            }}
            triggerRef={
              redactionShown
                ? redactionTriggerRef
                : imageExportShown
                  ? imageExportTriggerRef
                  : blocksShown
                    ? blocksTriggerRef
                    : signatureEnabled
                      ? signatureTriggerRef
                      : localMode
                        ? localTriggerRef
                        : imagesOpen
                          ? imagesTriggerRef
                          : formsOpen
                            ? formsTriggerRef
                            : annotationsTriggerRef
            }
          >
            {inspectorPanel}
          </PdfInspector>
        )}
      </div>
    </EditorShell>
  )
}

/** 缩略图复用与主画布相同的来源和旋转，错误只留在本页项。 */
function PdfThumbnail({
  bytes,
  page,
  imports,
}: {
  bytes: Uint8Array | null
  page: PdfPageRef
  imports: ReadonlyMap<string, Uint8Array>
}) {
  const [error, setError] = useState<string | null>(null)
  const from = sourceOf(page, bytes, imports)
  const shown = screenSize(page.base, page.rotation)
  const style: CSSProperties = {
    position: 'relative',
    width: 120,
    aspectRatio: `${shown.width} / ${shown.height}`,
    background: '#fff',
    overflow: 'hidden',
  }
  if (from.bytes === null) {
    return (
      <div style={style}>
        {page.origin.kind === 'blank' ? null : '无法预览'}
        <CropOverlay page={page} />
      </div>
    )
  }
  return (
    <div style={style}>
      <PdfCanvas
        bytes={from.bytes}
        pageIndex={from.index}
        rotation={page.rotation}
        width={120}
        onError={setError}
      />
      <CropOverlay page={page} />
      {error === null ? null : <span role="status">预览失败</span>}
    </div>
  )
}

/** 状态行左侧那一页是什么（原件 / 空白 / 导入） */
function pageLabel(ref: PdfPageRef, at: number, total: number): string {
  const size = displaySize(ref)
  const where =
    ref.origin.kind === 'blank'
      ? '空白页（保存后才有这一页）'
      : ref.origin.kind === 'imported'
        ? '导入的页'
        : ''
  const prefix = where === '' ? '' : `${where} · `
  return `${prefix}第 ${at + 1} / ${total} 页 · 本页 ${Math.round(size.width)} × ${Math.round(size.height)} pt · 旋转 ${ref.rotation}°`
}

/**
 * 待生效的裁剪与纸型写成一句话（没有改动时返回 null）。
 *
 * 数字要具体：用户按了「四边各裁 20 pt」，就该看到裁完还有多大、以及换纸型
 * 之后内容会缩放多少——不然只能靠保存之后再看。
 */
function describeGeometry(ref: PdfPageRef): string | null {
  const parts: string[] = []
  if (ref.crop !== null) {
    const inset = ref.crop.left
    const same = ref.crop.top === inset && ref.crop.right === inset && ref.crop.bottom === inset
    const visible = visibleSize(ref)
    parts.push(
      `裁剪：${same ? `四边各 ${round(inset)} pt` : `左边 ${round(ref.crop.left)} / 上边 ${round(ref.crop.top)} / 右边 ${round(ref.crop.right)} / 下边 ${round(ref.crop.bottom)} pt`}（可视区 ${round(visible.width)} × ${round(visible.height)} pt，内容未动）`,
    )
  }
  if (ref.paper !== null) {
    const visible = visibleSize(ref)
    const k = Math.min(ref.paper.width / visible.width, ref.paper.height / visible.height)
    const key = paperKeyOf(ref.paper)
    parts.push(
      `纸型：${key === null ? '自定义' : PAPER_SIZES[key].label} ${round(ref.paper.width)} × ${round(ref.paper.height)} pt（内容 ×${k.toFixed(2)}）`,
    )
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

/** pt 保留一位小数就够（0.28pt 的差别看不出来，写全了反而难读） */
function round(value: number): number {
  return Math.round(value * 10) / 10
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/* ── 画布 ─────────────────────────────────────────────────────── */

/**
 * 一页 + 它上面的两层（命中高亮、待生效的裁剪框）。
 *
 * ## 为什么外面要包一层
 *
 * 因为高亮与裁剪框是**按页面比例**定位的（`pdf-text.ts` 的 `PdfRect` 是
 * 0..1），而它们的百分比要相对**页面那一块**算。外层的尺寸由 canvas 自己撑开
 * （canvas 的 CSS 宽高由渲染器按目标宽度设），所以缩放、换页时两层自动跟着走
 * ——不需要在这里再算一遍像素尺寸（再算一遍就是第二套坐标系）。
 */
function PdfSheet({
  bytes,
  page,
  imports,
  zoom,
  highlight,
  selectedText,
  blockSelection,
  markupFeedback,
  imageSelection,
  drawingOverlay,
  onError,
  onPickPoint,
  onPickText,
}: {
  bytes: Uint8Array | null
  page: PdfPageRef
  imports: ReadonlyMap<string, Uint8Array>
  zoom: number
  highlight: { matches: readonly PdfMatch[]; at: number; page: number }
  imageSelection?: PdfRect
  drawingOverlay?: ReactNode
  selectedText: PdfTextRun | null
  blockSelection?: PdfRect
  markupFeedback: { run: PdfTextRun; type: 'highlight' | 'underline' | 'strikeout' } | null
  onError: (message: string | null) => void
  onPickPoint?: (origin: [number, number]) => void
  onPickText?: (x: number, y: number) => void
}) {
  const [rendered, setRendered] = useState<{
    bytes: Uint8Array
    index: number
    rotation: number
    width: number
  } | null>(null)
  const from = sourceOf(page, bytes, imports)
  /**
   * 画布上的宽高比。
   *
   * 用**显示尺寸**（`displaySize`，旋转 90/270 时交换）而不是盒子尺寸：画布
   * 渲染时传了 `rotation`，pdf.js 的 viewport 已经把长宽转过去了。用盒子尺寸
   * 会让横排的页在转 90 度之后画成竖的（内容被压扁）。
   */
  const shown = displaySize(page)
  const ratio = shown.height / shown.width
  const width = FIT_WIDTH_PX * (zoom / 100)

  /**
   * 空白页没有内容可画：按显示尺寸画一张占位纸——**尺寸就是保存后的尺寸**
   * （它没有内容会被缩放），所以用户看到的长宽比与保存出来的那页一致。
   */
  if (from.bytes === null) {
    return (
      <div
        className="mimir-pdf-sheet mimir-pdf-sheet--blank"
        style={{ width: `${width}px`, height: `${width * ratio}px` }}
      >
        <span className="mimir-pdf-sheet__note">空白页</span>
        <CropOverlay page={page} />
        {drawingOverlay}
      </div>
    )
  }

  const hits = highlight.matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.page === highlight.page)

  return (
    <div className={`mimir-pdf-sheet${onPickPoint || onPickText ? ' mimir-pdf-sheet--pick' : ''}`}>
      <PdfCanvas
        bytes={from.bytes}
        pageIndex={from.index}
        rotation={page.rotation}
        width={width}
        onError={onError}
        onRendered={() =>
          from.bytes &&
          setRendered({ bytes: from.bytes, index: from.index, rotation: page.rotation, width })
        }
        onPickPoint={onPickPoint}
        onPickText={onPickText}
      />
      {imageSelection && (
        <span
          className="mimir-pdf-hit"
          data-active="true"
          data-image-selected="true"
          style={hitStyle(imageSelection)}
          aria-hidden="true"
        />
      )}
      {selectedText !== null && (
        <span
          className="mimir-pdf-hit"
          data-active="true"
          style={hitStyle(selectedText.rect)}
          aria-hidden="true"
        />
      )}
      {blockSelection && (
        <span
          className="mimir-pdf-hit"
          data-active="true"
          data-block-selected="true"
          style={hitStyle(blockSelection)}
          aria-hidden="true"
        />
      )}
      {markupFeedback !== null && (
        <span
          className="mimir-pdf-hit"
          data-markup={markupFeedback.type}
          style={{
            ...hitStyle(markupFeedback.run.rect),
            background:
              markupFeedback.type === 'highlight'
                ? 'rgba(255, 210, 47, 0.35)'
                : markupFeedback.type === 'strikeout'
                  ? 'linear-gradient(to bottom, transparent 48%, #d54b37 48%, #d54b37 52%, transparent 52%)'
                  : 'transparent',
            borderBottom: markupFeedback.type === 'underline' ? '2px solid #d54b37' : undefined,
          }}
          aria-hidden="true"
        />
      )}
      {hits.map(({ match, index }) =>
        /*
          一处命中可能有**多个矩形**（跨行、或者 PDF 把一个词拆成几段）。
          每一个都要画——只画第一个的症状是「换行处的那个词只有半截亮」。

          key 用**矩形自己的几何**（页号 + 四个比例 + 两个 inset）：命中列表
          每次重扫都是新数组，而几何是它唯一的数据身份。用下标的话，换一个
          查询会让 React 复用旧元素——高亮会从上一个命中飘过来；而同一页里
          两处命中是同一块几何的情况等于它们完全重叠，那时复用也无所谓。
        */
        match.rects.map((rect) => (
          <span
            key={rectKey(match.page, rect)}
            className="mimir-pdf-hit"
            data-active={index === highlight.at ? 'true' : undefined}
            style={hitStyle(rect)}
          />
        )),
      )}
      <CropOverlay page={page} />
      {rendered?.bytes === from.bytes &&
        rendered.index === from.index &&
        rendered.rotation === page.rotation &&
        rendered.width === width &&
        drawingOverlay}
    </div>
  )
}

/** 高亮的 key：页号 + 矩形的几何。见上面那段说明 */
function rectKey(page: number, rect: PdfRect): string {
  const insets = `${rect.insetLeft ?? ''}:${rect.insetRight ?? ''}`
  return `${page}:${rect.x}:${rect.y}:${rect.width}:${rect.height}:${insets}`
}

/**
 * 一处高亮（一个矩形）的定位。
 *
 * `insetLeft` / `insetRight`（命中只覆盖一段文字的一截时）在这里折算成最终的
 * left/width——它们本来就是**相对这一段的盒子**的比例，而盒子的百分比宽高都
 * 在手边，所以一次乘加就够，不必再套一层元素。
 *
 * 斜排的文字（水印、侧边标签）这一段是**近似的**：矩形是旋转后四边形的外包
 * 框，按比例切是在这个外框上水平切的。要精确得取每个字形的矩阵
 * （`getOperatorList`），而高亮是给人看位置的。
 */
function hitStyle(rect: PdfRect): CSSProperties {
  const insetLeft = rect.insetLeft ?? 0
  const insetRight = rect.insetRight ?? 0
  return {
    left: `${(rect.x + rect.width * insetLeft) * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * (1 - insetLeft - insetRight) * 100}%`,
    height: `${rect.height * 100}%`,
  }
}

/**
 * 待生效的裁剪框：框外压暗。
 *
 * 位置由 `projectBox` 算（它与 pdf.js 的 viewport 逐个角比对过，见
 * `pdf-pages.test.ts`）——**不在界面里手写「旋转了就交换宽高」**：四个旋转角
 * 是四套换法，手写的话平时只看得见不旋转那一个，另外三个错了只是框跑偏。
 *
 * 分母用 `screenSize`（画布尺寸，不是盒子尺寸）——画布是按旋转后的尺寸画的。
 *
 * 只处理**四边等量**（界面上也只能这样设）：不等量时返回 null（宁可不画，
 * 也不画一个错位置的框）。
 */
function CropOverlay({ page }: { page: PdfPageRef }) {
  const insets: PdfCropInsets | null = page.crop
  if (insets === null) return null
  if (insets.top !== insets.left || insets.top !== insets.right || insets.top !== insets.bottom) {
    return null
  }
  const screen = screenSize(page.base, page.rotation)
  const box = projectBox(visibleBox(page), page.base, page.rotation)
  return (
    <span
      className="mimir-pdf-crop"
      aria-hidden="true"
      style={{
        left: `${(box.x / screen.width) * 100}%`,
        top: `${(box.y / screen.height) * 100}%`,
        right: `${((screen.width - box.x - box.width) / screen.width) * 100}%`,
        bottom: `${((screen.height - box.y - box.height) / screen.height) * 100}%`,
      }}
    />
  )
}

/**
 * 画一页（pdf.js → canvas）。
 *
 * 抽成一个组件是因为渲染是**异步且带副作用**的（加载文档、createPage、
 * render 都返回 promise，且要在卸载时取消）。放在父组件的渲染路径里做会
 * 变成「每次渲染都重画」，而那个症状是页面闪烁 + 滚动位置丢失。
 */
function PdfCanvas({
  bytes,
  pageIndex,
  rotation,
  width,
  onError,
  onRendered,
  onPickPoint,
  onPickText,
}: {
  bytes: Uint8Array
  pageIndex: number
  rotation: number
  width: number
  onError: (message: string | null) => void
  onRendered?(): void
  onPickPoint?: (origin: [number, number]) => void
  onPickText?: (x: number, y: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<PdfRenderHandle | null>(null)

  /**
   * `onError` 的「最新值 ref」。
   *
   * 它是父组件每次渲染新建的闭包（与 `useSource` 收到的 `io` 同一个形状）。
   * 放进依赖数组会让**每一帧都重新渲染整页**（渲染是重活：解析文档 +
   * 画 canvas）；而把 `onError` 从依赖里去掉会被 `react-hooks/exhaustive-deps`
   * 正确地拦下——抑制那条规则是禁的（铁律 1：编译器会静默跳过整个组件）。
   *
   * 所以用 ref 承接最新闭包，注册的 effect 依赖里只有真正的输入
   * （字节、页号、旋转、宽度）。ref 的更新 effect 声明在渲染 effect **之前**
   * ——顺序反了 React Compiler 会报 `Immutability` 并跳过这个组件。
   */
  const onRenderedRef = useRef(onRendered)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
    onRenderedRef.current = onRendered
  })

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    void (async () => {
      try {
        const handle = await renderPdfPages({
          bytes,
          pageIndex,
          rotation,
          width,
          canvas,
        })
        if (cancelled) {
          handle?.dispose()
          return
        }
        handleRef.current = handle
        onErrorRef.current(null)
        onRenderedRef.current?.()
      } catch (cause) {
        if (!cancelled) {
          onErrorRef.current(cause instanceof Error ? cause.message : String(cause))
        }
      }
    })()
    return () => {
      cancelled = true
      cancelPdfRender(canvas)
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [bytes, pageIndex, rotation, width])

  const pickPoint = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPickPoint && !onPickText) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    if (onPickText) {
      onPickText(localX / rect.width, localY / rect.height)
      return
    }
    if (!onPickPoint) return
    try {
      const doc = await loadPdfDocument(bytes)
      const page = await doc.getPage(pageIndex + 1)
      const base = page.getViewport({ scale: 1, rotation })
      const viewport = page.getViewport({ scale: width / base.width, rotation })
      const [x, y] = viewport.convertToPdfPoint(
        (localX * viewport.width) / rect.width,
        (localY * viewport.height) / rect.height,
      )
      onPickPoint([x, y])
    } catch (cause) {
      onError(messageOf(cause))
    }
  }

  return (
    <canvas ref={canvasRef} className="mimir-pdf-page" onClick={(event) => void pickPoint(event)} />
  )
}
