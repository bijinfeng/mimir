/**
 * PDF 的文字层：**查得到、指得准**。
 *
 * ## 它是什么、不是什么
 *
 * | 做 | 不做 |
 * |---|---|
 * | 用 pdf.js 的 `getTextContent()` 取出每页的文字与位置 | **改文字**——那要拆内容流（PDFium 的 7MB WASM，见 TECH §15.12） |
 * | 在整份文档里找一个串，报出共几处、当前第几处 | 正则、通配符 |
 * | 把命中换算成**页面比例矩形**，画在 canvas 上 | 选中文字、复制文字 |
 *
 * ## 为什么矩形是「比例」而不是像素
 *
 * 画布宽度随缩放变（40%–240%），而命中矩形属于**同一次渲染的坐标系**。
 * 存比例（0..1）的话，缩放、换页、换 DPI 都不用重算文字层——四个百分比直接
 * 跟着走。存像素就必须在每次缩放时重算一遍，而漏算一处症状是「放大之后高亮
 * 跑偏」，不报错。
 *
 * ## 旋转：矩形与画面用**同一个 viewport**
 *
 * `rects` 由 `page.getViewport({ scale: 1, rotation })` 换算，`rotation` 就是
 * 画布渲染时传的那个（`PdfPageRef.rotation`，绝对值）。包括原件自带的 /Rotate
 * （它已经并进 `rotation` 里了）。所以文字层与画面**必然**对齐——不自己写
 * 四个角度的变换矩阵，那四份 case 里平时只看得见一份。
 *
 * 代价是旋转变了要重算矩形。为此**原始文字（pdf.js 的 `TextItem`）单独缓存**：
 * 重算只做一次坐标变换，不重新解析 PDF 的文字（那才是慢的那一步）。
 *
 * ## 裁剪与纸型**不在这里算**
 *
 * 它们是「保存后才生效」的改动，而画布画的是**原件**（`source.bytes`，未裁剪
 * 未换纸）。文字层要跟画布对齐，所以它也只认原件。拿待生效的裁剪去缩文字层
 * 会得到「高亮在画面外面」——那是两套坐标系。
 *
 * ## 为什么先建索引、搜索是同步的
 *
 * `FindAdapter.search` 按契约**同步返回匹配数**（`EditorShell.tsx` 的
 * `FindAdapter`），而 `getTextContent()` 是异步的。所以文字在打开查找之前
 * 先扫一遍（异步、可取消），搜索本身在内存里同步做。反过来（在 `search` 里
 * 发起异步扫描）会让匹配数晚一拍到——栏上显示的是上一次的结果，那看起来
 * 就是「搜不到」。
 */

import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { FindOptions } from '../shims/ui.js'

/**
 * 页面比例矩形（0..1，左上角原点）。画布按百分比定位它，缩放不用重算。
 *
 * `insetLeft` / `insetRight` 是**在这一段的盒子里**再切一刀的比例：命中一段
 * 文字里的一截时用它们，而不是改 `x`/`width`。有角度的文字（斜排的页眉）
 * 改 `x` 只能水平切，切出来的位置是错的；`inset` 是相对段自己的盒子切，
 * 与角度无关。
 */
export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
  insetLeft?: number
  insetRight?: number
}

/** 一段文字 + 它在页面上的矩形。一段 = pdf.js 的一个 `TextItem` */
interface TextChunk {
  text: string
  rect: PdfRect
}

/** 一页的文字层：拼好的整页文本 + 每段在里面的下标 + 每段的矩形 */
interface PageText {
  /** 布局里的页号（0 起）。**不是原文档的页号**——倒序之后就不同了 */
  page: number
  chunks: readonly TextChunk[]
  /** 全页文本。段之间按 `hasEOL` 插 `\n` */
  text: string
  /** 每一段在 `text` 里的起始下标（`starts[i]` 对应 `chunks[i]`） */
  starts: readonly number[]
}

/**
 * 整份文档的文字索引。
 *
 * `pages` 的顺序就是**布局顺序**，所以命中里的 `page` 直接可以拿去
 * `setActive`。
 */
export interface PdfTextIndex {
  pages: readonly PageText[]
  /** 有文字的页数（0 表示这份文档是扫描件——没有文字层，查找永远搜不到） */
  pagesWithText: number
}

/** 一处命中：哪一页、几个矩形（跨行/跨段会有多个） */
export interface PdfMatch {
  page: number
  rects: readonly PdfRect[]
  /** 命中处的原文，给状态行显示「找到了什么」 */
  text: string
}

/**
 * 建索引要扫的一页。
 *
 * `bytes` 是这一页**来源**那一份 PDF 的字节（原件，或导入进来的那一份），
 * `index` 是它在那一份里的页号。空白页没有来源，用 `bytes: null` 表示。
 */
export interface PdfTextSource {
  bytes: Uint8Array | null
  index: number
  /** 画布上这一页的旋转（绝对值）。矩形按它换算 */
  rotation: number
}

/**
 * 原始文字缓存：`字节 → (原页号 → 那页的原始文字)`。
 *
 * 存的是 pdf.js 的**用户空间**坐标（还没过 viewport），所以它与旋转无关。
 * 旋转一页时只是重跑坐标变换，不必再碰 PDF。
 *
 * 用 `WeakMap` 而不是普通 `Map`：形状与 `pdf-render.ts` 的按字节缓存一致，
 * 换文档、关编辑器之后这些键自然可以回收，不需要谁记得清理。
 */
const rawCache = new WeakMap<Uint8Array, Map<number, RawPage>>()

interface RawPage {
  chunks: readonly RawChunk[]
}

interface RawChunk {
  text: string
  /** 这一段的四个角（PDF 用户空间，y 向上） */
  corners: readonly { x: number; y: number }[]
}

/**
 * 扫出整份文档的文字层。
 *
 * `documentFor` 由调用方给（`pdf-render.ts` 的 `loadPdfDocument`）——这里不
 * 自己 `getDocument`：那样同一份 PDF 会被解析两遍（画布一份、查找一份），
 * 各持一个 worker 侧的对象树，白费几百毫秒与几倍内存。测试里传一个直接
 * `getDocument` 的实现即可，不需要打包器。
 *
 * **不调 `page.cleanup()`**：它会把这一页**正在进行的渲染任务取消掉**
 * （`pdf.mjs` 的 `#tryCleanup`：`internalRenderTask.cancel()`）。索引与画布
 * 共用同一份文档，所以那次清理会让画面变白——正是 TECH §15.12 记的那类
 * 「全白且无报错」。
 */
export async function buildPdfTextIndex(
  sources: readonly PdfTextSource[],
  documentFor: (bytes: Uint8Array) => Promise<PDFDocumentProxy>,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfTextIndex> {
  const pages: PageText[] = []
  let pagesWithText = 0
  for (const [page, source] of sources.entries()) {
    if (source.bytes === null) {
      // 空白页：一定没有文字。仍然占一个位置（page 下标要能直接当页号用）
      pages.push({ page, chunks: [], text: '', starts: [] })
      onProgress?.(page + 1, sources.length)
      continue
    }
    const doc = await documentFor(source.bytes)
    const raw = await rawPageOf(doc, source.bytes, source.index)
    const chunks = project(raw, viewportOf(await doc.getPage(source.index + 1), source.rotation))
    if (chunks.length > 0) pagesWithText += 1
    pages.push(assemble(page, chunks))
    onProgress?.(page + 1, sources.length)
  }
  return { pages, pagesWithText }
}

/** 取一页的原始文字（用户空间）。命中缓存时完全不碰 PDF */
async function rawPageOf(
  doc: PDFDocumentProxy,
  bytes: Uint8Array,
  index: number,
): Promise<RawPage> {
  let pages = rawCache.get(bytes)
  if (pages === undefined) {
    pages = new Map()
    rawCache.set(bytes, pages)
  }
  const hit = pages.get(index)
  if (hit !== undefined) return hit

  const proxy = await doc.getPage(index + 1)
  const content = await proxy.getTextContent()
  const chunks: RawChunk[] = []
  for (const item of content.items) {
    // `TextMarkedContent` 没有 `str`（只在 includeMarkedContent 时出现，这里没开）
    if (!('str' in item) || item.str === '') continue
    const corners = quadOf(item)
    if (corners === null) continue
    chunks.push({
      // `hasEOL` 的段后面补一个换行：跨行的串不该被当成连在一起
      text: item.hasEOL ? `${item.str}\n` : item.str,
      corners,
    })
  }
  const raw: RawPage = { chunks }
  pages.set(index, raw)
  return raw
}

interface Viewport {
  width: number
  height: number
  convertToViewportPoint: (x: number, y: number) => number[]
}

function viewportOf(
  page: { getViewport: (params: { scale: number; rotation: number }) => unknown },
  rotation: number,
): Viewport {
  return page.getViewport({ scale: 1, rotation }) as Viewport
}

/**
 * 把用户空间的四边形投到页面比例矩形上。
 *
 * ## `transform` 的六个分量怎么读
 *
 * pdf.js 的 `TextItem.transform` 是 `[a, b, c, d, e, f]`：`(e, f)` 是基线起点，
 * `(a, b)` 是文字前进方向（乘 `width` 得到终点），`(c, d)` 是「向上」的方向
 * （乘字高得到上边）。所以这一段的四边形是：
 *
 * ```
 * P0 = (e, f)                基线起点
 * P1 = P0 + û·width          û = (a, b) / |(a, b)|
 * P2 = P1 + v̂·height         v̂ = (c, d) / |(c, d)|
 * P3 = P0 + v̂·height
 * ```
 *
 * 四个角都过一遍 `convertToViewportPoint` 再取**外包矩形**：旋转、翻转、
 * 裁剪偏移全由 viewport 负责。
 *
 * `width` 的单位与用户空间一致（实测：12pt 的 Helvetica "Hello World" 报
 * 62.004），所以不用再乘字号——这也是 pdf.js 自己的文本层用的同一套量
 * （`pdf.mjs` 的 `#appendText`：`canvasWidth = geom.width`）。
 */
function project(raw: RawPage, viewport: Viewport): TextChunk[] {
  const width = viewport.width
  const height = viewport.height
  if (width <= 0 || height <= 0) return []

  const chunks: TextChunk[] = []
  for (const chunk of raw.chunks) {
    const points = chunk.corners.map((corner) =>
      viewport.convertToViewportPoint(corner.x, corner.y),
    )
    const xs = points.map((point) => point[0] as number)
    const ys = points.map((point) => point[1] as number)
    const left = Math.min(...xs)
    const top = Math.min(...ys)
    chunks.push({
      text: chunk.text,
      rect: {
        x: left / width,
        y: top / height,
        width: (Math.max(...xs) - left) / width,
        height: (Math.max(...ys) - top) / height,
      },
    })
  }
  return chunks
}

/** 一段文字的四个角（PDF 用户空间）。取不到方向时返回 null */
function quadOf(item: {
  transform: Array<unknown>
  width: number
  height: number
}): { x: number; y: number }[] | null {
  const values = item.transform.map(Number)
  const [a, b, c, d, e, f] = values
  if (values.length < 6 || ![a, b, c, d, e, f].every((value) => Number.isFinite(value))) {
    return null
  }
  const advance = Math.hypot(a!, b!)
  const rise = Math.hypot(c!, d!)
  // 退化的矩阵（没有方向或没有高度）算不出矩形——跳过这一段，不要瞎猜
  if (advance === 0 || rise === 0) return null
  const ux = (a! / advance) * item.width
  const uy = (b! / advance) * item.width
  const vx = (c! / rise) * item.height
  const vy = (d! / rise) * item.height
  return [
    { x: e!, y: f! },
    { x: e! + ux, y: f! + uy },
    { x: e! + ux + vx, y: f! + uy + vy },
    { x: e! + vx, y: f! + vy },
  ]
}

/** 把一段段拼成整页文本，并记下每段的起始下标 */
function assemble(page: number, chunks: readonly TextChunk[]): PageText {
  let text = ''
  const starts: number[] = []
  for (const chunk of chunks) {
    starts.push(text.length)
    text += chunk.text
  }
  return { page, chunks, text, starts }
}

/* ── 搜索（同步：索引已经建好） ─────────────────────────────────── */

/**
 * 在整份索引里找 `query`，返回每一处命中的页号与矩形。
 *
 * 空串返回空——**不能**把空串当成「全匹配」：那样每敲一下都报出成千上万处，
 * 而栏上显示「1 / 2847」看着像正常工作，实际是噪音。
 *
 * ## 逐字符比较，不用 `toLowerCase()` 整串
 *
 * 整串转小写会**改变长度**（`İ`.toLowerCase() 是两个码元），于是匹配下标与
 * 原文下标错位——而矩形是按下标从段里取的，错位的高亮会框在别的字上。这里
 * 逐字符比：`a === b || (!matchCase && a.toLowerCase() === b.toLowerCase())`，
 * 一一对应，长度不变。
 *
 * ## 全词匹配的边界怎么定（**对中文同样成立**）
 *
 * 边界 = 两侧不是 `[A-Za-z0-9_]`。于是：
 *
 *   - 英文：`cat` 在 `concat` 里不匹配，在 `a cat.` 里匹配
 *   - 中文：汉字不在 ASCII 词字符集里，所以「组件」在「组件性能」里照样匹配
 *     ——**这正是中文该有的语义**（中文没有词边界，硬按空格切会让中文搜不到，
 *     而那种开关比没有开关更坏）
 */
export function searchPdfText(
  index: PdfTextIndex,
  query: string,
  options: FindOptions,
): PdfMatch[] {
  if (query === '') return []
  const matches: PdfMatch[] = []
  for (const page of index.pages) {
    for (const [start, end] of findRanges(page.text, query, options)) {
      const rects = rectsFor(page, start, end)
      if (rects.length === 0) continue
      matches.push({ page: page.page, rects, text: page.text.slice(start, end) })
    }
  }
  return matches
}

/** `text` 里所有命中区间（`[start, end)`） */
function findRanges(text: string, query: string, options: FindOptions): [number, number][] {
  const out: [number, number][] = []
  const last = text.length - query.length
  for (let at = 0; at <= last; at += 1) {
    if (!matchAt(text, at, query, options)) continue
    out.push([at, at + query.length])
    // 不重叠：`aaaaa` 里找 `aa` 报 2 处（与浏览器一致）
    at += query.length - 1
  }
  return out
}

function matchAt(text: string, at: number, query: string, options: FindOptions): boolean {
  for (let offset = 0; offset < query.length; offset += 1) {
    const found = text[at + offset]
    const wanted = query[offset]
    if (found === undefined || wanted === undefined) return false
    if (found === wanted) continue
    if (options.matchCase) return false
    if (found.toLowerCase() !== wanted.toLowerCase()) return false
  }
  if (options.wholeWord) {
    if (isWordChar(text[at - 1])) return false
    if (isWordChar(text[at + query.length])) return false
  }
  return true
}

/** ASCII 词字符。**故意不把汉字算进来**——理由见 `searchPdfText` 的说明 */
function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char)
}

/**
 * 命中区间 → 矩形。
 *
 * 命中通常落在一段里（word 级的 `TextItem`），那就直接取那一段的矩形。跨段
 * （换行、或者 PDF 把一个词拆成几段）时每段各给一个矩形——按**字符数比例**
 * 切出被覆盖的那一截。这个比例是近似：等宽字体与中文准，拉丁字母会有几个
 * 像素的误差（`WWW` 与 `iii` 同宽不同长）。高亮是给人看位置的，不值得为它
 * 去取每个字形的宽度（那要 `getOperatorList` 的逐字形矩阵）。
 */
function rectsFor(page: PageText, start: number, end: number): PdfRect[] {
  const out: PdfRect[] = []
  for (const [position, chunk] of page.chunks.entries()) {
    const chunkStart = page.starts[position]
    if (chunkStart === undefined) continue
    const chunkEnd = chunkStart + chunk.text.length
    // 命中区间与这一段没有交集
    if (end <= chunkStart || start >= chunkEnd) continue
    const total = chunk.text.length
    if (total === 0) continue
    const from = Math.max(start, chunkStart) - chunkStart
    const to = Math.min(end, chunkEnd) - chunkStart
    const rect: PdfRect = { ...chunk.rect }
    // 整数段落（常见）不加 inset：少两个数字，CSS 也少一次计算
    if (from > 0) rect.insetLeft = from / total
    if (to < total) rect.insetRight = (total - to) / total
    out.push(rect)
  }
  return out
}
