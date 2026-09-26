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

/* ── 文档缓存：按字节缓存，渲染只取页 ────────────────────────────── */

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

let cached: CachedDoc | null = null

/**
 * 取（或建）这一份字节的文档。
 *
 * ## 为什么必须缓存
 *
 * 不缓存的话每次换页、每次改缩放都要重新 `getDocument` —— 那是**解析整份
 * PDF**（解压、解析对象树、重建字体）。对一个几十 MB 的 PDF，翻一页要等
 * 好几秒，而用户只是点了一下「下一页」。
 *
 * 缓存以**字节的身份**为键（同一份 `Uint8Array` 引用 → 同一份文档），所以
 * 换文档时旧缓存自然作废，不需要显式清理。单条而不是 Map：界面上同时只有
 * 一份 PDF 在编辑，而 Map 的淘汰策略在没有真实压力时只是个猜测。
 *
 * ## `bytes.slice()` 不是可选的
 *
 * pdf.js 把字节 **transfer** 给 worker（零拷贝），传原引用会让调用方手里
 * 那个 `Uint8Array` 变成空（`byteLength === 0`）——而我们还要用它保存。
 * 实测症状：**预览一次之后保存出来的文件是 0 字节**。
 */
async function documentFor(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  if (cached !== null && cached.bytes === bytes) {
    return cached.doc
  }

  // 换文档：先把上一份收掉（它持有 worker 与已解析的对象树）
  if (cached !== null) {
    void cached.task.destroy()
    cached = null
  }

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

  const doc = await task.promise
  cached = { bytes, doc, task }
  return doc
}

export interface PdfRenderHandle {
  /** 放弃这一笔（组件卸载或换页时） */
  dispose: () => void
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
 * 渲染的**代次**。
 *
 * pdf.js 对同一块 canvas 的并发 `render()` 直接抛
 * `Cannot use the same canvas during multiple render() operations`，而这
 * 条并发**在 React 下必然发生**（StrictMode 挂载两次、快速翻页、连续点放大）。
 * 第一次的实现用「模块级记一个取消入口，新调用先取消旧的」，结果是
 * **两次都不画、界面全白且无报错**：第二次取消了第一次，第二次自己又被
 * cleanup 取消。
 *
 * 代次的语义是「只有最新那一代有权画」：每次调用领一个号，await 之间对一次；
 * 过期的那一代**放弃绘制**（而不是去取消别人）。于是谁先谁后都不会误杀最新
 * 的那一代。被取代时由 pdf.js 自己中断（`RenderingCancelledException`），
 * 那是正常路径。
 */
let renderGeneration = 0

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

  renderGeneration += 1
  const generation = renderGeneration
  const stale = (): boolean => generation !== renderGeneration

  try {
    const doc = await documentFor(bytes)
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

    await renderTask.promise
    return { dispose: () => renderTask.cancel() }
  } catch (cause) {
    /**
     * **取消不是失败。** pdf.js 用 `RenderingCancelledException` 表示它——
     * 把它当错误抛出去会让界面显示「渲染失败：Rendering cancelled」，而用户
     * 只是翻了一页。返回 null 表示「这一笔没画」，调用方不必知道。
     */
    if (isCancellation(cause)) return null
    throw cause
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
