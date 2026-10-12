/**
 * PDF 原件的编辑器：页面级操作 + 文字层查找。
 *
 * ## 能做到什么、做不到什么（D-056，如实写在界面上）
 *
 * | 能做 | 做不到（本版） |
 * |---|---|
 * | 渲染每一页（pdf.js，含中文 cmaps） | **改文字内容**：PDF 的文字是内容流里的绘制指令，改一个字要重排那一段（上游用 PDFium 的 WASM 做，7062 行在 Electron 主进程） |
 * | 旋转（这一页 / 全部页）、删除、调序、倒序 | 删掉一段文字并让后面的文字上移 |
 * | 插入空白页、从别的 PDF 导入页面 | 改字体、颜色、字号 |
 * | 裁剪（只改可视区）、换纸型（缩放内容） | 编辑矢量图形 |
 * | **查找文字**（含中文）并高亮到字上 | 替换文字——查找的适配器只给 `FindAdapter`，不给 `replaceOne`/`replaceAll`（`EditorShell.tsx` 的注释说明了为什么那两个是可选的：空实现点了没反应） |
 *
 * **为什么页面级先行**：PDF 与另外三种格式有一个根本区别——它不是「结构化
 * 文档」而是「一叠页面指令」。页面级操作（旋转、删除、重排、裁剪）是**纯结构
 * 改动**，用 pdf-lib（MIT、纯 JS）就能做对，而且做出来的文件在任何阅读器里
 * 都对。文字编辑则要拆内容流（PDFium / qpdf 那一类），代价与风险都高出两个
 * 数量级。
 *
 * **这条边界是上游的镜像**：它用 PDFium 的 WASM 做成文本替换，但那 7062 行
 * 写着 Electron 的主进程与 Node API。搬进浏览器要重写跨进程那一段，而且
 * PDFium 的 WASM 是 7MB——那是另一件工程（见 `.trellis/spec/project/architecture.md` §16 的「仍未做」）。
 *
 * ## 三份库的分工是刻意的
 *
 * ```
 * pdf.js   读：画页面（pdf-render.ts）、取文字层（pdf-text.ts）
 * pdf-lib  写：页面结构（pdf-pages.ts 的 buildPdfBytes）
 * ```
 *
 * 反过来（用一个库做两件事）两头都做不好——pdf.js 没有写 API，pdf-lib 的渲染
 * 能力很弱。`pdf-render.ts` 与 `pdf-text.ts` **共用同一份文档缓存**（按字节的
 * 身份），否则同一份 PDF 会被解析两遍（各持一个 worker 侧的对象树）。
 *
 * ## 保存是**整体重建**，不是补丁
 *
 * 这一点与 docx/xlsx/pptx 不同，必须说清：pdf-lib 用「加载 → 改结构 → 序列化」
 * 的模型，它**不保留**原始字节里那些它没理解的东西（增量更新的对象、
 * 线性化提示、未引用的对象）。所以保存后的文件会比原件小、内容逐字节不同。
 *
 * 页面编辑的边界：
 *   - **页面级操作是它擅长的**：页对象、字体、图像流能随页面搬运；书签目录不在此列
 *   - 未编辑时**不保存**——判据是**页面结构与原件是否逐页相同**（`isPristine`），
 *     不是「有没有操作过」：转过去再转回来仍然是原样，那时按钮就该是灰的，
 *     否则「什么都没改」也会把整份文件重写一遍
 *   - 常见文档信息显式复制；有额外 Catalog 结构时拒绝写回，不静默丢表单等数据
 *   - 界面上如实写着「保存会重写整个文件」，用户下载原件可以对比
 *
 * ## 一页改了什么，都记在 `PdfPageRef` 上
 *
 * 页面模型（来源 / 旋转 / 裁剪 / 纸型）与它的几何在 `pdf-pages.ts`，那里没有
 * 一行 JSX——所以它测得动（`pdf-pages.test.ts` 用 pdf-lib 读回产出物逐页断言，
 * 再用 pdf.js 读回文字位置验证几何）。这个文件只负责「界面把哪些动作交给它」
 * 与「当前页长什么样」。
 *
 * ## 画布画的是**原件**
 *
 * 裁剪与纸型是「保存后才生效」的改动，而画布上那一页来自原件字节。所以：
 *
 *   - 裁剪用一层**待生效框**表达（框外压暗），而不是把画面裁掉
 *   - 纸型只在状态行写着目标尺寸——改画布尺寸会让画面与文字层、命中高亮
 *     各说各话（它们是同一套坐标，见 `pdf-text.ts`）
 *
 * 保存之后这些改动就是原件了（`source.reload()` 重新读字节），画布随之改变。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
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
  type FindAdapter,
  type ToolbarMenuItem,
} from '../shell/EditorShell.js'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileImportIcon,
  FindIcon,
  SaveIcon,
  TrashIcon,
} from '../shell/icons.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import type { FindOptions } from '../shims/ui.js'
import { loadPdfDocument, renderPdfPages, type PdfRenderHandle } from './pdf-render.js'
import {
  BLANK_PAGE_SIZE,
  buildPdfBytes,
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
  searchPdfText,
  type PdfMatch,
  type PdfRect,
  type PdfTextIndex,
} from './pdf-text.js'
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
   * 保存成功后 `source.reload()` 是一个来回的异步：在新字节到之前，
   * `source.bytes` 还是**旧**的那一份。于是：
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

export function PdfEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
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
  const [textIndex, setTextIndex] = useState<{ key: string; index: PdfTextIndex } | null>(null)
  /** 扫描进度（`null` 表示还没报过进度）。大文档扫起来要几秒，得让人看见在动 */
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null)
  const [highlightStore] = useState(createHighlightStore)
  const highlight = useSyncExternalStore(highlightStore.subscribe, highlightStore.getSnapshot)
  const canvasRef = useRef<HTMLDivElement>(null)

  /**
   * 打开文档：读每页的可视区尺寸与旋转（一次 pdf-lib 加载）。
   *
   * 之后所有操作都在这份结构上做（pdf.js 只负责画与取文字，不参与修改）。
   * `readPdfPages` 取的是 **CropBox** 而不是 MediaBox——用户看到的是 CropBox
   * 那一块，取 MediaBox 会让界面上的尺寸比实际大一圈。
   */
  const opened = useParsed(source.bytes, readPdfPages)

  /** 打开时的页面结构（没有任何改动时的页序） */
  const original = useMemo<PdfPageRef[] | null>(() => {
    if (opened.value === null) return null
    return opened.value.map((entry, index) => ({
      origin: { kind: 'original', index },
      rotation: entry.rotation,
      base: { width: entry.width, height: entry.height },
      crop: null,
      paper: null,
    }))
  }, [opened.value])

  /** 当前的改动（属于这一份字节才作数） */
  const settled =
    edit !== null && source.bytes !== null && edit.bytes === source.bytes ? edit : null

  /**
   * 当前页序与旋转：有改动时用改动，否则用解析出来的原样。
   *
   * **引用要稳**（`useMemo` + state）：它是文字层与查找适配器的依赖，每次渲染
   * 新建一份会让它们跟着重建（重扫整份文档）。
   */
  const layout = useMemo<PdfPageRef[]>(() => settled?.pages ?? original ?? [], [settled, original])
  const imports = settled?.imports ?? NO_IMPORTS

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
        ? opened.value !== null && isPristine(pages, opened.value)
        : sameLayout(pages, file.pages),
    [opened.value],
  )

  const sameAsFile = settled === null ? true : matchesFile(settled.pages, settled.file)
  const dirty = settled !== null && !sameAsFile

  /**
   * 状态行左侧。
   *
   * ## 为什么要自己带一个 `saved`，而不是用 `useSource.saveCount`
   *
   * 两件事叠在一起会让状态行**卡在「已修改，未保存」**（真浏览器里实测到的：
   * 字节已经写出 2075 字节，状态行还说没保存）：
   *
   *   1. 这里的 `dirty` 是**算出来的**（页面结构与原件是否逐页相同），不是
   *      显式的 state。保存完成后 `source.reload()` 要等一个来回才拿到新字节；
   *      在那之前改动仍挂在旧的 `bytes` 上，`dirty` 还是真
   *   2. `statusText` 里 `dirty` 的优先级高于 `saveCount`
   *
   * 而 `saveCount` 本身也不能直接用来判「已保存」：它的语义是「打开以来保存过
   * 几次」，保存后**又改一笔**它还是 > 0——那时界面会一边写着「已保存」一边
   * 挂着未保存的改动，比不说更坏（与 `isPristine` 那条注释是同一个理由：真相
   * 只能有一个）。
   *
   * 所以判据是**当前结构与磁盘上那份是否相同**（`sameAsFile`）：保存完就是
   * 相同（`saveCount` 报 1 → 「已保存」），再改一笔就不相同了（`dirty` 先命中，
   * 报「已修改，未保存」）。
   */
  const status = statusText({
    // `dirty` 在 `statusText` 里优先级更高，所以这两个不会同时生效
    handle: { ...source, saveCount: settled !== null && sameAsFile ? 1 : 0 },
    dirty,
    idle: layout.length > 0 ? `第 ${at + 1} / ${layout.length} 页 · ${zoom}%` : '读取中…',
  })

  /**
   * 改一页（返回新的页序）并记下「属于哪一份字节」。
   *
   * 顺带报给宿主的脏标记：`onDirtyChange` 在这里算——**在事件里**算才有两个
   * 端点（改回原样也要报 `false`）。放在渲染期算就得用 effect 转发。
   */
  const applyPages = (pages: PdfPageRef[], nextImports = imports) => {
    // 抓住这一份字节（下面在闭包里用；`source.bytes` 是属性访问，TS 收窄不过去）
    const bytes = source.bytes
    if (bytes === null) return
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
    onDirtyChange?.(!matchesFile(pages, settled?.file ?? null))
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

  /** 删除当前页。**最后一页不允许删**——一份零页的 PDF 是坏文件 */
  const removePage = () => {
    if (page === null || layout.length <= 1) return
    applyPages(layout.filter((_, position) => position !== at))
    goTo(Math.max(0, Math.min(at, layout.length - 2)))
  }

  /** 把当前页往前/往后挪一格 */
  const move = (delta: -1 | 1) => {
    if (page === null) return
    const to = at + delta
    if (to < 0 || to >= layout.length) return
    const next = [...layout]
    const [moved] = next.splice(at, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    applyPages(next)
    goTo(to)
  }

  /**
   * 在当前页之后插入一张空白页，并跳到它。
   *
   * 空白页在页面模型里没有来源（`origin.kind === 'blank'`），保存时由
   * `buildPdfBytes` 用 `insertPage` 补一张 A4。**尺寸是 A4 竖版**——不跟当前页
   * 走：插入空白页的用途是「在这两页之间加一张纸」，纸型交给「纸型」那一档。
   */
  const insertBlank = () => {
    const blank: PdfPageRef = {
      origin: { kind: 'blank' },
      rotation: 0,
      base: { ...BLANK_PAGE_SIZE },
      crop: null,
      paper: null,
    }
    applyPages([...layout.slice(0, at + 1), blank, ...layout.slice(at + 1)])
    goTo(at + 1)
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
    if (source.bytes === null) return
    setNotice(null)
    try {
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
    if (settled === null || source.bytes === null) return
    setNotice(null)
    let bytes: Uint8Array
    try {
      bytes = await buildPdfBytes({
        bytes: source.bytes,
        layout: settled.pages,
        imports: settled.imports,
      })
    } catch (cause) {
      setNotice(`未保存：${messageOf(cause)}`)
      return
    }
    const ok = await source.save(bytes, { name: 'document.pdf', mime: OFFICE_MIME.pdf })
    if (!ok) return
    /**
     * 让编辑器回到「以刚写出的字节为准」。
     *
     * 与 pptx/xlsx 的 `commit()` 同一个理由：不做的话下一次保存会从**旧字节**
     * 重建，把这一次的改动静默回滚（两次保存都「成功」）。PDF 这边多一步
     * 重新加载——`useSource` 的 `reload()` 会重新取原件，于是 `source.bytes`
     * 换新，`layout` 也随之从新字节派生（改动与导入的字节都随之作废，
     * 因为它们的键是旧字节）。
     */
    /**
     * 把**刚写出的结构**记成「磁盘上那份」的基线（理由见 `PdfEdit.file`）。
     * 用更新函数读 `prev`：保存是异步的，期间用户可能又改了一笔——那一笔在
     * `pages` 里，而基线必须是写出的那一份，不读 `prev` 就会把两者搞混。
     */
    setEdit((prev) =>
      prev === null || prev.bytes !== source.bytes
        ? prev
        : { ...prev, file: { pages: settled.pages, imports: settled.imports } },
    )
    onDirtyChange?.(false)
    void source.reload()
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
        const from = sourceOf(ref, source.bytes, imports)
        return { bytes: from.bytes, index: from.index, rotation: ref.rotation }
      }),
    [layout, source.bytes, imports],
  )

  useEffect(() => {
    if (!findOpen || source.bytes === null) return
    // 这一份页序已经扫过了
    if (textIndex !== null && textIndex.key === textKey) return
    let cancelled = false
    void (async () => {
      try {
        const index = await buildPdfTextIndex(textSources, loadPdfDocument, (done, total) => {
          if (!cancelled) setScan({ done, total })
        })
        if (cancelled) return
        setScan(null)
        setTextIndex({ key: textKey, index })
        /**
         * 一页文字都没有 = 扫描件。**如实说，而不是打开一条永远搜不到的栏**：
         * 栏上会显示「无匹配」，那看起来像搜索坏了。同时把它关掉并说明原因，
         * 「查找」按钮此后也是灰的（`findReason`）。
         */
        if (index.pagesWithText === 0) {
          setFindOpen(false)
          setNotice('这份 PDF 没有文字层（可能是扫描件），搜不到内容')
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
  }, [findOpen, source.bytes, textIndex, textKey, textSources])

  /**
   * 查找的适配器。**只实现 `FindAdapter`**——没有 `replaceOne` / `replaceAll`，
   * 于是 `FindReplaceBar` 不渲染替换区（改文字要 PDFium 的 WASM，见文件顶部）。
   *
   * 用一个 `useMemo` 固定引用：栏的 effect 依赖 `adapter`，每次渲染换一个新
   * 对象会让它每次渲染都重扫一遍（而重扫发布会触发渲染——一个死循环）。
   */
  const findAdapter = useMemo<FindAdapter | null>(() => {
    if (textIndex === null || textIndex.key !== textKey) return null
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
  }, [textIndex, textKey, highlightStore, goTo])

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
    textIndex !== null && textIndex.key === textKey ? textIndex.index.pagesWithText > 0 : true
  const findReason =
    textIndex !== null && textIndex.key === textKey && textIndex.index.pagesWithText === 0
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

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <div className="mimir-pptx-pdf-toolbar mimir-pptx-pdf-toolbar--pdf">
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
            description="没有撤销，只能靠不保存退出"
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
                <ToolbarMenuNote>
                  裁剪只改可视区，不删除页内容；换纸型会按比例缩放内容。
                </ToolbarMenuNote>
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
        </div>
      }
      toolbarActions={
        <ToolbarButton
          label={source.saving ? '保存中…' : '保存到库'}
          primary
          disabled={!dirty || source.saving}
          disabledReason={source.saving ? '正在保存' : '没有改动，不用保存'}
          onClick={() => void save()}
        >
          <SaveIcon />
        </ToolbarButton>
      }
      /*
        次工具条：查找栏。它排在这里（而不是工具条里）的原因是**它有自己的
        两行**（查询 + 替换），塞进工具条会把工具条撑成两行半。索引还没扫完时
        显示一行进度——此时不挂查找栏：栏上没有索引会显示「无匹配」，那是在
        说假话。
      */
      subbar={
        findOpen ? (
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
      <div ref={canvasRef} className="me-scroll mimir-pdf-stage">
        {renderError !== null ? (
          <EditorState tone="error">渲染失败：{renderError}</EditorState>
        ) : (
          <PdfSheet
            bytes={source.bytes}
            page={page}
            imports={imports}
            zoom={zoom}
            highlight={{ matches: highlight.matches, at: highlight.at, page: at }}
            onError={setRenderError}
          />
        )}
      </div>
    </EditorShell>
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
  onError,
}: {
  bytes: Uint8Array | null
  page: PdfPageRef
  imports: ReadonlyMap<string, Uint8Array>
  zoom: number
  highlight: { matches: readonly PdfMatch[]; at: number; page: number }
  onError: (message: string | null) => void
}) {
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
      </div>
    )
  }

  const hits = highlight.matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.page === highlight.page)

  return (
    <div className="mimir-pdf-sheet">
      <PdfCanvas
        bytes={from.bytes}
        pageIndex={from.index}
        rotation={page.rotation}
        width={width}
        onError={onError}
      />
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
}: {
  bytes: Uint8Array
  pageIndex: number
  rotation: number
  width: number
  onError: (message: string | null) => void
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
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const handle = await renderPdfPages({
          bytes,
          pageIndex,
          rotation,
          width,
          canvas: canvasRef.current,
        })
        if (cancelled) {
          handle?.dispose()
          return
        }
        handleRef.current = handle
        onErrorRef.current(null)
      } catch (cause) {
        if (!cancelled) {
          onErrorRef.current(cause instanceof Error ? cause.message : String(cause))
        }
      }
    })()
    return () => {
      cancelled = true
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [bytes, pageIndex, rotation, width])

  return <canvas ref={canvasRef} className="mimir-pdf-page" />
}
