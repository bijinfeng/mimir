import { useEffect, type RefObject } from 'react'
import type { Editor } from '@tiptap/core'
import {
  effectiveBottomPx,
  effectiveTopPx,
  sectionPageBox,
} from '../vendor/apps/docs/src/renderer/pagination-sections.js'
import { measureBlocks } from '../vendor/apps/docs/src/renderer/pagination-measure.js'
import { computeSectionedSlices } from '../vendor/apps/docs/src/renderer/pagination-slices.js'
import { BlockIndex } from '../vendor/apps/docs/src/renderer/pagination-index.js'
import {
  setPageGaps,
  type PageGapSpec,
} from '../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'
import type { BlockBox, PageSlice } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import type { SectionInfo } from '../vendor/packages/docx-engine/src/types.js'

/**
 * 把连续流切成「纸张页面」（分页视图）。
 *
 * ## 机制
 *
 * 上游的分页不是「多个滚动容器」，而是**在分页点插入装饰器节点**：
 *
 * ```
 * 测量每块的几何（measureBlocks）
 *   → 按可用高度切页（computeSectionedSlices）
 *     → 每个分页点生成一个「页间隙」元素（setPageGaps 注入 ProseMirror 装饰器）
 * ```
 *
 * 页间隙是一个高元素，撑出上一页的剩余空间 + 下一页的上边距，中间画一条灰带
 * ——于是连续流看起来就是一页一页的纸。**它不改文档内容**（装饰器不落库、
 * 不进历史），所以保存路径完全不受影响。
 *
 * ## 这一版做到哪里
 *
 * 只做**块级分页**（Word 里最常见的形态）：一个块（段落/标题/表格）放不下就
 * 整块推到下一页，并插入页间隙。
 *
 * 上游的完整实现还有四类特例，这里都没有：
 *   - **块内断行**：段落太长时在行边界切开（要 `lineOffsets` 与孤行控制）
 *   - **拆表**：表格跨页时按行切、重复表头
 *   - **页眉页脚 / 脚注**：每页渲染页眉、页脚、脚注区
 *   - **分栏**：页内多栏的容量按「栏数 × 栏高」算
 *
 * 少这四类的后果是**视觉**上的：长段落会整块下移而不是从中间断开的自然
 * 效果；带页眉脚与脚注的文档在页面边界上看不到它们。不影响编辑与保存。
 *
 * ## 什么时候重算
 *
 * 文档变化、容器尺寸变化、以及编辑结束后。测量是同步重活（读
 * getBoundingClientRect），所以用 rAF 合并连续触发，避免每次按键都全量测量。
 */
export interface PaginationOptions {
  editor: Editor | null
  /** 滚动容器（`measureBlocks` 要它的顶部作原点） */
  scrollRef: RefObject<HTMLElement | null>
  /**
   * 包住编辑器的容器（分页会从它里面找 `.ProseMirror`）。
   *
   * **不要传 `.ProseMirror` 自己的 ref**：Tiptap 有时把 `.ProseMirror`
   * 建在 ref 容器之内（`EditorContent` 外面还有一层），传错的话
   * `measureBlocks` 会把整块内容当成**一个块**量——症状是页数看着差不多
   * 但页边界全错，而且不报错（实测：51 个块被量成 1 个）。
   */
  containerRef: RefObject<HTMLElement | null>
  /**
   * 文档的分段信息（纸张与页边距）。
   *
   * **调用方必须传一个稳定引用的数组**（如 `session?.sections`），
   * 不要写成 `session?.sections ?? []`——那个表达式每次渲染都产生新数组，
   * effect 依赖它就会**每次渲染都重跑并 cleanup**，而 cleanup 会把
   * `disposed` 置真、取消进行中的 rAF。竞态的结果是分页永远不生效，
   * 且不报任何错（实测踩过：诊断出口一直是 null）。
   */
  sections: SectionInfo[]
  /** 总页数回传（界面可以显示「第 x / 共 y 页」） */
  onPaged?: (pageCount: number) => void
}

export function usePagination({
  editor,
  scrollRef,
  containerRef,
  sections,
  onPaged,
}: PaginationOptions): void {
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    let frame = 0
    let disposed = false

    /**
     * 就绪检查放在**每次调度时**做，而不是 effect 开头 early return。
     *
     * 三个前置条件的到齐时间不同：DOM ref 挂载时就有、`sections` 要等文档
     * 下载并解析完、`editor.view` 要等 Tiptap 建好视图。在 effect 开头一次性
     * 检查并 return —— 而依赖数组里没有「它们就绪」这个信号，effect 不会再跑，
     * **分页永远不生效且不报错**。实测踩过：诊断出口 `__mimirPagination`
     * 一直是 null，而界面上只显示「共 1 页」。
     */
    function ready(): { editor: Editor; pm: HTMLElement } | null {
      const pm = containerRef.current?.querySelector<HTMLElement>('.ProseMirror') ?? null
      if (!editor || editor.isDestroyed || !editor.view?.dom || !pm) return null
      if (sections.length === 0) return null
      return { editor, pm }
    }

    /** 一次完整的分页 pass。所有前置条件在 ready() 里统一把关 */
    function paginateOnce(): void {
      const ctx = ready()
      if (!ctx) return
      const { pm } = ctx

      /**
       * 先清掉旧的页间隙再量（顺序不能反）。
       *
       * 页间隙是**装饰器节点**，会被 `measureBlocks` 跳过并累加进
       * `gapAccum`——但只在它认得出来时。先清一次保证测量的起点干净；
       * 不清的症状是「页数越编辑越多」。
       */
      setPageGaps(ctx.editor.view, [])

      const settings = sections[0]!.settings
      const box = sectionPageBox(settings)
      const contentTop = effectiveTopPx(settings, 0)
      const contentHeight = box.height - contentTop - effectiveBottomPx(settings, 0)

      /**
       * origin = **内容区顶部**的屏幕 Y。
       *
       * `measureBlocks` 拿每个元素的 `rect.top` 减掉它，得到「相对内容流的
       * 偏移」。所以 origin 必须是内容第一块的上边缘在屏幕上的位置。
       *
       * **不要用滚动容器的 `rect.top`**：容器一滚动内容跟着动，而容器自己的
       * 位置不变，于是所有块坐标整体偏移一个 scrollTop、出现负值、总高度算小、
       * 页数变成 1、页间隙一个都不插。实测踩过（blockTops 从 -905 开始）。
       * 用 ProseMirror 元素自己的 `rect.top` —— 它就在内容区顶部。
       */
      const origin = pm.getBoundingClientRect().top

      const measured = measureBlocks(pm, origin, 1)
      const blocks = measured.blocks as BlockBox[]
      if (blocks.length === 0) {
        onPaged?.(1)
        return
      }

      const slices: PageSlice[] = computeSectionedSlices(
        blocks,
        [{ contentHeight, forceBreak: false, cols: 1 }],
        measured.totalHeight,
      )

      // 按 slice 起点找锚定块，为每个分页点插一个页间隙
      const blockIndex = new BlockIndex(blocks)
      const gaps: PageGapSpec[] = []
      for (let page = 1; page < slices.length; page += 1) {
        const slice = slices[page]!
        const i = blockIndex.firstAtTop(slice.start)
        const anchor = i >= 0 ? blocks[i] : blockIndex.containing(slice.start)
        if (!anchor?.el) continue

        // 上一页没用完的空间 + 下一页的上边距 = 间隙高度
        const prev = slices[page - 1]!
        const remaining = Math.max(0, contentHeight - (prev.end - prev.start))
        gaps.push({
          el: anchor.el,
          boundaryY: slice.start,
          metrics: {
            marginTop: contentTop + remaining,
            marginBottom: effectiveBottomPx(settings, 0),
            // 左右边距从 section 读（Word 文档各不相同）。
            // twips → px 与上游一致：1440 twips = 1 英寸 = 96 px
            marginLeft: (settings.marginLeft / 1440) * 96,
            marginRight: (settings.marginRight / 1440) * 96,
          },
        })
      }

      /**
       * 诊断出口：分页是大量几何计算的产物，「页数对但切断位置不对」
       * 或「页数对但没有页间隙」都不会报错。把中间量挂到 window 上，
       * 排查时一眼能看到，而不用往 vendor 里加日志。
       */
      ;(globalThis as unknown as { __mimirPagination?: unknown }).__mimirPagination = {
        pageCount: slices.length,
        contentHeight: Math.round(contentHeight),
        totalHeight: Math.round(measured.totalHeight),
        blockCount: blocks.length,
        blockTops: blocks.slice(0, 6).map((b) => Math.round(b.top)),
        sliceStarts: slices.map((sl) => Math.round(sl.start)),
        anchored: gaps.length,
      }

      setPageGaps(ctx.editor.view, gaps)
      onPaged?.(slices.length)
    }

    /**
     * rAF 合并：连续触发（打字、尺寸变化、重试）只跑最后一次。
     *
     * 包一层 try/catch：分页是**增强**，测量失败（元素被卸载、编辑器正在
     * 重建）不该让整个文档视图崩成一句报错。
     */
    function schedule(): void {
      if (frame !== 0 || disposed) return
      /**
       * **用 setTimeout 而不是 requestAnimationFrame。**
       *
       * rAF 的语义是「下一个渲染帧之前」，而**不可见（后台标签页、
       * display:none 的容器）时浏览器根本不派发帧**——回调永远不执行，
       * 而 `frame` 已经被赋成那个永远不会跑的 id，于是后续 schedule 全被
       * `frame !== 0` 挡掉。症状是**分页永久静默失效**（诊断出口一直是
       * null，控制台也没有任何报错）。
       *
       * 实测踩过：桌面端与后台标签页都会命中；同一个文档在前台标签页里
       * 分页正常，切到后台再打开就再也不分页。
       *
       * 分页本来也不需要「帧同步」（量的是布局不是绘制），setTimeout(0)
       * 的合并效果与 rAF 等价，且不受可见性影响。
       */
      frame = window.setTimeout(() => {
        frame = 0
        try {
          paginateOnce()
        } catch (error) {
          // 分页失败是**静默**的（界面只显示「共 1 页」，不报错），
          // 所以除了打日志还挂到诊断出口上，便于在浏览器里一眼看到原因
          ;(globalThis as unknown as { __mimirPagError?: unknown }).__mimirPagError = {
            message: error instanceof Error ? error.message : String(error),
          }
          console.warn('[office] 分页计算失败（下次编辑会重试）：', error)
        }
      }, 0)
    }

    schedule()
    /**
     * 定时重试直到就绪：视图与文档的到齐顺序不确定，而依赖数组里没有
     * 「它们就绪」这个信号。最多重试 ~10 秒，之后交给 update / 尺寸变化触发。
     */
    let retries = 0
    const retry = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(retry)
        schedule()
        return
      }
      retries += 1
      if (retries > 40) window.clearInterval(retry)
    }, 250)

    // 内容变化
    const onUpdate = () => schedule()
    editor?.on('update', onUpdate)

    /**
     * 容器尺寸变化。它会同时改变「每行能放多少字」（断行位置）与可用高度
     * ——侧栏折叠、窗口缩放都会走到这里。观察容器而不是 PM：PM 的尺寸由
     * 内容决定，容器才是被外部改变的那个。
     */
    const observer = new ResizeObserver(schedule)
    observer.observe(scroll)

    return () => {
      disposed = true
      if (frame !== 0) window.clearTimeout(frame)
      window.clearInterval(retry)
      observer.disconnect()
      if (editor) editor.off('update', onUpdate)
      if (!editor?.isDestroyed && editor?.view?.dom) setPageGaps(editor.view, [])
    }
  }, [editor, scrollRef, containerRef, sections, onPaged])
}
