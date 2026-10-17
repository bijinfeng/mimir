/**
 * PDF 渲染：pdf.js → canvas。
 *
 * ## 为什么是 pdf.js 而不是 `<iframe>` 指向下载端点
 *
 * 改之前 PDF 走浏览器内置阅读器（`<iframe src=下载端点>`）。那在「只能看」
 * 的时候是对的——零依赖零体积。但它有两个硬限制：
 *
 *   1. **我们控制不了那个阅读器**：没有自己的工具条、拿不到当前页号、
 *      没法在页上叠层（PDF 的编辑要能指着某一页说「就是这页」）
 *   2. **它与编辑无法共存**：内置阅读器的工具栏与我们的工具条会长成两层
 *
 * pdf.js（Apache-2.0）用的是同一套渲染代码，只是我们把 canvas 拿回自己手里。
 *
 * ## 中文 PDF 必须要 cmaps
 *
 * 最容易静默失效的一处：**没有 cmaps 时中文 PDF 里含 CID 字体的文字会整段
 * 不显示**（不是乱码——是空白）。那些 PDF 不内嵌字符到字形的映射表，pdf.js
 * 得按 Adobe 的 CMap 去查（169 个文件）。它们由宿主的 `pdfjs-assets.ts`
 * 从 `pdfjs-dist` 依赖拷到 `public/pdfjs/`——**不进 git**（理由在那个文件里）。
 */

import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
/**
 * worker 的 URL。
 *
 * ## `?worker&url` 而不是 `?url`（这一处调试了很久）
 *
 * `?url` 在开发模式下给的是**源文件路径**（`/@fs/…/pdf.worker.min.mjs`），
 * 而 Vite 会把它当**待转换的模块**服务——实测那段响应里第一行是
 * `import { injectQuery } from "/@vite/client"`（HMR 注入）。`new Worker()`
 * 里没有 `/@vite/client` 那个环境，于是**worker 起不来，而
 * `getDocument()` 永远挂着**——界面一片空白、没有报错、也没有超时。
 *
 * `?worker&url` 让 Vite 把那个文件当**独立 worker 入口**走一遍构建（含生产
 * 的打包与依赖处理），给回一个自包含的 URL。这正是它存在的用途。
 *
 * ## 为什么按 `{ default: string }` 取值
 *
 * pdfjs 的包**自带 `.d.ts`**，TypeScript 会优先用它解释这个导入（它描述的是
 * worker 入口模块，不是字符串）。所以按**实际形状**取值，而不是把整个导入
 * 断言成假类型——后者会让 `Invalid workerSrc type` 这种真问题藏到运行时。
 */
import * as pdfWorkerModule from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url'
import { PDFJS_ASSETS } from './pdfjs-assets.js'

const workerUrl: string = (pdfWorkerModule as { default: string }).default

/**
 * worker 的 URL 只在模块首次加载时设一次。
 *
 * **不能设在组件里**：`GlobalWorkerOptions` 是模块级单例，重复设置会在已经
 * 启动的 worker 上造成警告并让它退回「假 worker」（在主线程解析）——那个
 * 症状是大文件时 UI 卡住，且没有报错。
 */
let workerConfigured = false

function ensureWorker(): void {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = workerUrl
  workerConfigured = true
}

/* ── 文档缓存：按字节缓存，渲染与文字层共用 ──────────────────────── */

interface CachedDoc {
  /** 哪一份字节的文档（同一引用 → 同一份） */
  bytes: Uint8Array
  doc: PDFDocumentProxy
  /**
   * 加载任务。**收尾要用它而不是 `doc`**：pdf.js 6.x 把 `destroy()` 从
   * `PDFDocumentProxy` 挪到了 loading task 上（上游的注释也记了这一点）。
   * 用错对象的症状是「解析出的文档永远不释放」，越开越多、越用越卡。
   */
  task: { destroy: () => Promise<void> }
}

/**
 * 已解析的文档，按**字节的身份**索引（同一 `Uint8Array` 引用 → 同一份文档）。
 *
 * ## 为什么是 `Map` 而不是上一版的单条缓存
 *
 * 上一版只留一份（「界面上同时只有一份 PDF 在编辑」）。加了「导入页面」与
 * 「查找」之后这句话不再成立：
 *
 *   - 画布要画某一页，它的来源可能是原件，也可能是**导入的那一份**
 *   - 查找要把每一页的来源都读一遍（导入的页也要能搜到）
 *
 * 单条缓存下这两件事会互相把对方的文档挤掉，症状是翻到导入的页时重新解析
 * 整份文件（慢，但没有报错）——**每一次翻页都重来一遍**。
 */
const cached = new Map<Uint8Array, CachedDoc>()
/** 多个缩略图会同时要同一份字节；解析进行中也要共用一笔 loading task。 */
const loading = new Map<Uint8Array, Promise<PDFDocumentProxy>>()
let retainedBytes: Set<Uint8Array> | null = null
const imageExportUsers = new Map<Uint8Array, number>()

/**
 * 还有多少笔渲染在用这些文档。
 *
 * 销毁一份**正在被渲染的**文档会让 pdf.js 的渲染任务直接失败（报的是一句
 * 与用户操作毫无关系的 `Worker was destroyed`）。所以淘汰不立即执行：先记在
 * `pending` 里，等这一轮渲染结束了再收。
 */
let activeRenders = 0
const pending: CachedDoc[] = []

/** 除了这些字节之外的文档可以收了。编辑器在 bytes / 导入列表变化时调它 */
export function retainPdfDocuments(keep: readonly (Uint8Array | null)[]): void {
  const alive = new Set(keep.filter((bytes): bytes is Uint8Array => bytes !== null))
  retainedBytes = alive
  for (const [bytes, entry] of cached) {
    if (alive.has(bytes) || imageExportUsers.has(bytes)) continue
    cached.delete(bytes)
    pending.push(entry)
  }
  collect()
}

/** 收掉待销毁的（渲染中就不动它——见 `activeRenders`） */
function collect(): void {
  if (activeRenders > 0) return
  while (pending.length > 0) {
    const entry = pending.pop()
    if (entry !== undefined) void entry.task.destroy()
  }
}

/**
 * 取（或建）这一份字节的文档。
 *
 * ## 为什么必须缓存
 *
 * 不缓存的话每次换页、每次改缩放都要重新 `getDocument` —— 那是**解析整份
 * PDF**（解压、解析对象树、重建字体）。对一个几十 MB 的 PDF，翻一页要等
 * 好几秒，而用户只是点了一下「下一页」。
 *
 * ## `bytes.slice()` 不是可选的
 *
 * pdf.js 把字节 **transfer** 给 worker（零拷贝），传原引用会让调用方手里
 * 那个 `Uint8Array` 变成空（`byteLength === 0`）——而我们还要用它保存。
 * 实测症状：**预览一次之后保存出来的文件是 0 字节**。
 *
 * ## 导出它是为了让文字层复用同一份文档
 *
 * `pdf-text.ts` 需要一个「字节 → 文档」的加载器。让它自己 `getDocument` 就会
 * 同一份 PDF 被解析两遍（一份给画布、一份给查找），而两份文档各持一个
 * worker 侧的对象树——那是白白的几百毫秒与几倍内存。
 */
export async function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const hit = cached.get(bytes)
  if (hit !== undefined) return hit.doc
  const inFlight = loading.get(bytes)
  if (inFlight !== undefined) return inFlight

  ensureWorker()
  const task = getDocument({
    data: bytes.slice(),
    cMapUrl: PDFJS_ASSETS.cmaps,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_ASSETS.standardFonts,
    wasmUrl: PDFJS_ASSETS.wasm,
    /**
     * **不用 `eval`**：pdf.js 默认在某些字体解析路径上用 `new Function` 做
     * 性能优化。我们打开的 PDF 来自互联网，那是它最容易被利用的一处；
     * 关掉只影响少量字体的解析速度。
     *
     * 它不在 `DocumentInitParameters` 的公开类型里（pdf.js 标成内部选项），
     * 但运行时确实读它——所以断言形状而不是删掉这个安全设置。
     */
    isEvalSupported: false,
  } as Parameters<typeof getDocument>[0])

  const promise = task.promise.then(
    (doc) => {
      loading.delete(bytes)
      const entry: CachedDoc = { bytes, doc, task }
      if (retainedBytes !== null && !retainedBytes.has(bytes) && !imageExportUsers.has(bytes)) {
        pending.push(entry)
        collect()
      } else {
        cached.set(bytes, entry)
      }
      return doc
    },
    (cause: unknown) => {
      loading.delete(bytes)
      throw cause
    },
  )
  loading.set(bytes, promise)
  return promise
}

export interface PdfRenderHandle {
  /** 放弃这一笔（组件卸载或换页时） */
  dispose: () => void
}

interface CanvasRenderState {
  generation: number
  task: { cancel: () => void } | null
  settled: Promise<void> | null
}

/** 主画布与每个缩略图各有自己的代次和 pdf.js 渲染任务。 */
const canvasRenders = new WeakMap<HTMLCanvasElement, CanvasRenderState>()

function renderState(canvas: HTMLCanvasElement): CanvasRenderState {
  let state = canvasRenders.get(canvas)
  if (state === undefined) {
    state = { generation: 0, task: null, settled: null }
    canvasRenders.set(canvas, state)
  }
  return state
}

/** 换页或卸载时连尚在加载文档、未拿到 handle 的绘制一起废弃。 */
export function cancelPdfRender(canvas: HTMLCanvasElement | null): void {
  if (canvas === null) return
  const state = canvasRenders.get(canvas)
  if (state === undefined) return
  state.generation += 1
  state.task?.cancel()
}

export interface RenderPdfOptions {
  bytes: Uint8Array
  /** **原文档**里的页号（0 开始） */
  pageIndex: number
  /** 目标旋转角度（绝对值） */
  rotation: number
  /** 目标绘制宽度（CSS 像素） */
  width: number
  canvas: HTMLCanvasElement | null
}

/**
 * 渲染的**代次**按 canvas 隔离。
 *
 * pdf.js 对同一块 canvas 的并发 `render()` 直接抛
 * `Cannot use the same canvas during multiple render() operations`，而这
 * 条并发**在 React 下必然发生**（StrictMode 挂载两次、快速翻页、连续点放大）。
 * 早期实现用「模块级记一个取消入口，新调用先取消旧的」，结果是
 * **两次都不画、界面全白且无报错**：第二次取消了第一次，第二次自己又被
 * cleanup 取消。
 *
 * 代次的语义是「同一块 canvas 只有最新那一代有权画」：每次调用领一个号，
 * await 之间对一次；过期绘制先取消并等其 promise 结束，再让下一笔碰 canvas。
 * 每个缩略图与主画布各有状态，不能因别的 canvas 开始绘制而放弃本页。
 */

/**
 * 把一页画到 canvas 上。
 *
 * ## 渲染参数用 `{ canvas, canvasContext, viewport, transform }`（实测换来的）
 *
 * pdf.js 6.x 的类型声明推荐「只传 `canvas`，不要传 `canvasContext`」。但**实测
 * 在浏览器里只有带上 context 与 transform 才真的画出内容**：
 *
 * | 写法 | 结果 |
 * |---|---|
 * | `{ canvas, viewport }`（viewport 的 scale 乘 dpr） | canvas 尺寸正确、`render()` 正常 resolve、**零像素**、无报错 |
 * | `{ canvas, canvasContext, viewport, transform: [dpr,0,0,dpr,0,0] }` | 画出内容（实测蓝框 31345 像素、文字 48740 像素） |
 *
 * 所以这里按**能工作的那一组**写，并在注释里留下这条对照——不写的话下一个人
 * 会照着类型声明「简化」成上面那一种，然后对着全白的画布查半天（我就查了
 * 很久）。viewport 用 **1 倍缩放**，放大的部分交给 `transform`。
 *
 * ## 缩放：canvas 的像素尺寸与 CSS 尺寸分开算
 *
 * 像素尺寸乘 DPR（Retina 上不发虚），CSS 尺寸保持目标宽度（版面不变）。
 * 只改一个的症状分别是画面被拉伸与文字发虚。
 */
export async function renderPdfPages(options: RenderPdfOptions): Promise<PdfRenderHandle | null> {
  const { bytes, pageIndex, rotation, width, canvas } = options
  if (!canvas) return null

  const state = renderState(canvas)
  state.generation += 1
  const generation = state.generation
  state.task?.cancel()
  const previous = state.settled
  const stale = (): boolean => generation !== state.generation

  activeRenders += 1
  let startedTask: { cancel: () => void } | null = null
  try {
    const doc = await loadPdfDocument(bytes)
    if (stale()) {
      return null
    }

    const page = await doc.getPage(pageIndex + 1)
    if (stale()) {
      return null
    }

    const base = page.getViewport({ scale: 1, rotation })
    const viewport = page.getViewport({ scale: width / base.width, rotation })

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // pdf.js 不允许同一块 canvas 同时有两笔绘制；取消后等旧任务确实结束。
    if (previous !== null) await previous
    if (stale()) return null

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const renderTask = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
    })

    state.task = renderTask
    startedTask = renderTask
    state.settled = renderTask.promise.then(
      () => {},
      () => {},
    )
    await renderTask.promise
    return {
      dispose: () => {
        if (state.generation === generation) cancelPdfRender(canvas)
      },
    }
  } catch (cause) {
    /**
     * **取消不是失败。** pdf.js 用 `RenderingCancelledException` 表示它——
     * 把它当错误抛出去会让界面显示「渲染失败：Rendering cancelled」，而用户
     * 只是翻了一页。返回 null 表示「这一笔没画」，调用方不必知道。
     */
    if (isCancellation(cause)) return null
    throw cause
  } finally {
    if (state.task === startedTask) state.task = null
    activeRenders -= 1
    // 这一笔结束了，被淘汰的文档现在可以收了（见 `retainPdfDocuments`）
    collect()
  }
}

/** Keep one parsed workcopy for a whole image batch without changing the live viewer's sources. */
export function retainPdfImageExport(bytes: Uint8Array): () => void {
  imageExportUsers.set(bytes, (imageExportUsers.get(bytes) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const users = (imageExportUsers.get(bytes) ?? 1) - 1
    if (users > 0) {
      imageExportUsers.set(bytes, users)
      return
    }
    imageExportUsers.delete(bytes)
    if (retainedBytes?.has(bytes)) return
    const entry = cached.get(bytes)
    if (entry) {
      cached.delete(bytes)
      pending.push(entry)
      collect()
    }
  }
}

/** Raster output has a fixed DPI, independent of the screen's zoom and DPR. */
export async function renderPdfPageImage({
  bytes,
  pageIndex,
  dpi,
  signal,
}: {
  bytes: Uint8Array
  pageIndex: number
  dpi: number
  signal?: AbortSignal
}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (![72, 150, 300].includes(dpi)) throw new Error('请选择 72、150 或 300 dpi')
  signal?.throwIfAborted()
  activeRenders += 1
  const canvas = document.createElement('canvas')
  let task: { cancel(): void } | null = null
  const abort = () => task?.cancel()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const doc = await loadPdfDocument(bytes)
    signal?.throwIfAborted()
    const page = await doc.getPage(pageIndex + 1)
    signal?.throwIfAborted()
    const viewport = page.getViewport({ scale: dpi / 72 })
    const width = Math.floor(viewport.width)
    const height = Math.floor(viewport.height)
    if (width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 32_000_000)
      throw new Error(`第 ${pageIndex + 1} 页图像过大，请降低分辨率后重试`)
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法生成页面图像')
    const rendered = page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: '#ffffff',
    })
    task = rendered
    await rendered.promise
    signal?.throwIfAborted()
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('页面图像编码失败，请重试'))),
        'image/png',
      ),
    )
    const output = new Uint8Array(await blob.arrayBuffer())
    signal?.throwIfAborted()
    return { bytes: output, width, height }
  } finally {
    signal?.removeEventListener('abort', abort)
    canvas.width = 0
    canvas.height = 0
    activeRenders -= 1
    collect()
  }
}

/** pdf.js 的取消（换页、卸载时会发生，不是错误） */
function isCancellation(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    (cause as { name?: unknown }).name === 'RenderingCancelledException'
  )
}
