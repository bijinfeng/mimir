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
 * 这是最容易静默失效的一处：**没有 cmaps 时中文 PDF 里含 CID 字体的文字
 * 会整段不显示**（不是乱码——是空白）。因为那些 PDF 不内嵌字符到字形的
 * 映射表，pdf.js 得按 CMap（Adobe 的字符集映射）去查。资产在
 * `pdfjs-dist/cmaps`（169 个文件）。
 *
 * 我们把它们交给打包器（`?url` 导入）而不是运行时下载——自托管环境可能没有
 * 外网，而「中文 PDF 打不开」是致命的。见 `pdfjs-assets.ts`。
 *
 * ## worker 与主线程
 *
 * pdf.js 在 worker 里解析（否则大文件会卡住 UI）。worker 的 URL 也必须由
 * 打包器给（`?url`），因为运行时的路径推断在生产构建里不可靠——那个症状是
 * 「开发正常、生产白屏」，与这个仓库里若干次打包教训同类。
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
/**
 * worker 的 URL。
 *
 * ## 这里为什么要绕过 pdfjs 自带的类型声明
 *
 * `?url` 的语义是「给我这个文件的产物 URL（字符串）」。但 pdfjs 的包**自带
 * `.d.ts`**，TypeScript 会优先用那份声明来解释这个导入——它描述的是 worker
 * 入口模块（一个对象），不是字符串。
 *
 * 于是有两种写法都不对：
 *   - `import workerUrl from '...?url'` → lint 报「没有默认导出」（对 pdfjs 的
 *     声明是对的，只是它看不到 `?url` 做的事）
 *   - `import * as x from '...?url'` 然后断言成 string → **运行时才炸**：
 *     打包器给的是命名空间对象 `{ default: '/assets/...mjs' }`，
 *     pdf.js 拿到它报 `Invalid workerSrc type`（实测踩过——断言把真问题
 *     藏到了运行时）
 *
 * 所以这里**按实际形状取值**：命名空间对象上取 `default`。这也是 Vite 对
 * `?url` 的官方形状（`{ default: string }`）。取值处带一次类型收窄，而不是
 * 在整个导入上断言成一个假的类型。
 */
import * as pdfWorkerModule from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

/** `?url` 给的形状是 `{ default: string }`（Vite 的约定） */
const workerUrl: string = (pdfWorkerModule as { default: string }).default

import { PDFJS_ASSETS } from './pdfjs-assets.js'

/**
 * worker 的 URL 只在模块首次加载时设一次。
 *
 * **不能设在组件里**：`GlobalWorkerOptions` 是模块级单例，而重复设置会在
 * 已经启动的 worker 上造成警告并让它退回「假 worker」（在主线程解析）——
 * 那个症状是大文件时 UI 卡住，且没有报错。
 */
let workerConfigured = false

function ensureWorker(): void {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = workerUrl
  workerConfigured = true
}

export interface PdfRenderHandle {
  /** 取消这次渲染（组件卸载、或换页/换缩放时） */
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
 * 把一页画到 canvas 上。
 *
 * ## 同一个 canvas 不能并发渲染（实测踩过两次，两个不同的坑）
 *
 * pdf.js 对同一块 canvas 的并发 `render()` 直接抛
 * `Cannot use the same canvas during multiple render() operations`。而这条
 * 并发**在 React 下必然发生**：StrictMode 挂载两次、快速翻页、连续点放大。
 *
 * **坑一：什么都不做 → 报错。** 后一个渲染在前一个没画完时开始，抛上面那句。
 *
 * **坑二：用「取消上一次」来避免 → 两次都不画**（更隐蔽）。第一版写成
 * 「模块级记一个 `activeCancel`，新的调用先取消旧的」：
 *
 * ```
 * 第一次渲染开始 → 第二次渲染开始（取消了第一次）
 *              → 第二次的 cleanup 跑（又被取消）
 *              → 两次都没画，界面全白，且没有任何报错
 * ```
 *
 * 实测过：同一个 pdf.js 调用单独跑能画出 2566 个非白像素，放到组件里一片空白。
 *
 * 现在用**代次**：每次调用领一个号，await 之间对一次「我还是最新的吗」；
 * 不是就直接收掉自己、返回 null（**不去取消别人**）。于是谁先谁后都不会
 * 误杀最新的那一代，也不需要互相取消。
 *
 * 渲染期间被新一代取代时，pdf.js 内部会用 `RenderingCancelledException`
 * 中断这一笔；那是正常路径（不是错误），这里吞掉并返回 null。
 *
 * ## 缩放用 devicePixelRatio
 *
 * canvas 的**像素尺寸**与 **CSS 尺寸**要分开算：像素尺寸乘 DPR（Retina 上
 * 不发虚），CSS 尺寸保持目标值（版面宽度不变）。不乘 DPR 的症状是文字发虚，
 * 而只改一个的症状是画面被拉伸。
 */

/**
 * 渲染的**代次**（模块级）。
 *
 * 用它取代「保存上一次的取消入口」那种写法，因为后者在 React 下必然出错：
 * StrictMode 会挂载两次，于是
 *
 * ```
 * 第一次渲染开始 → 第二次渲染开始（取消了第一次）
 *              → 第二次的 cleanup 跑（又被取消）
 *              → 两次都没画，界面全白
 * ```
 *
 * 实测就是这样：pdf.js 单独跑能画出 2566 个非白像素，而在组件里一片空白。
 *
 * 代次的语义是「只有最新那一代有权画」：每次调用领一个号，画之前对一次；
 * 过期的那一代**放弃绘制**（而不是去取消别人）。这样谁先谁后都不会让最新
 * 的那一代被误杀，也不需要互相取消。
 */
let renderGeneration = 0

export async function renderPdfPages(options: RenderPdfOptions): Promise<PdfRenderHandle | null> {
  const { bytes, pageIndex, rotation, width, canvas } = options
  if (!canvas) return null

  /** 这一笔的编号。只有它等于当前代次时才有权绘制 */
  renderGeneration += 1
  const generation = renderGeneration

  ensureWorker()

  const task = getDocument({
    /**
     * **传一份拷贝**：pdf.js 会把字节转给 worker（transfer），传原引用会让
     * 调用方手里的 Uint8Array 变成空（`byteLength === 0`）——而我们还要用它
     * 保存。实测症状是「预览一次之后保存出来的文件是 0 字节」。
     */
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

  /**
   * 过期的判据是**代次**，不是「被取消」——见文件顶部 `renderGeneration`
   * 的说明。`stale()` 在每次 await 之后检查一次。
   */
  const stale = () => generation !== renderGeneration

  const dispose = () => {
    // 卸载时把自己的任务收掉（pdf.js 的文档持有 worker，不释放会累积）
    void task.destroy()
  }

  try {
    const doc = await task.promise
    /**
     * **过期的这一代直接返回，但先把自己收掉**。不 `destroy()` 的话每次
     * 翻页都会留下一个 pdf.js 文档与它的 worker——内存里累积，而界面上
     * 看不出来（只是越用越卡）。
     */
    if (stale()) {
      dispose()
      return null
    }

    const page = await doc.getPage(pageIndex + 1)
    if (stale()) {
      dispose()
      return null
    }

    const base = page.getViewport({ scale: 1, rotation })
    const scale = width / base.width
    const viewport = page.getViewport({ scale, rotation })

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
    return { dispose }
  } catch (cause) {
    /**
     * **取消不是失败。** pdf.js 用 `RenderingCancelledException` 表示它，
     * 而它的 `name` 是 `'RenderingCancelledException'`。把它当错误抛出去会让
     * 界面显示「渲染失败：Rendering cancelled」——用户只是翻了一页，却看到
     * 一条报错。返回 null 表示「这一笔没画」，调用方不必知道。
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
