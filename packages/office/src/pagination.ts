import { useEffect, type RefObject } from 'react'
import type { Editor } from '@tiptap/core'
import {
  sectionGeoms,
  effectiveTopPx,
  sectionPageBox,
} from '../vendor/apps/docs/src/renderer/pagination-sections.js'
import { setColumnLayout } from '../vendor/apps/docs/src/renderer/editor/column-layout.js'
import {
  measureBlocks,
  noteRefOffsets,
} from '../vendor/apps/docs/src/renderer/pagination-measure.js'
import {
  anchorElement,
  lineStartAnchor,
  nextLineAnchor,
  sliceWithLineSplit,
  applyRowNotes,
  fillLineBoxes,
  type LineAnchor,
} from '../vendor/apps/docs/src/renderer/pagination-lines.js'
import {
  hfHasVisibleContent,
  hfStripGeom,
  makeHfFloatImgEl,
  hfReservedHeightPx,
  makeGapHfEl,
} from '../vendor/apps/docs/src/renderer/editor/hf-dom.js'
import { pageNumbers } from '../vendor/apps/docs/src/renderer/pagination-hf.js'
import {
  makeGapNotesEl,
  notesAreaHeight,
  pageFootnotesOf,
  FOOTNOTE_SEPARATOR_H,
  type FootnoteContext,
} from './footnotes.js'
import {
  orderedContinuationGaps,
  clearContinuationGaps,
  insertOrderedEndnoteGap,
} from './docx-footnote-gaps.js'
import { paintNoteNumbers } from './docx-note-numbering.js'
import { paginateFootnoteContinuations } from './docx-footnote-flow.js'
import {
  clearEndnoteDecorations,
  clearEndnoteGaps,
  liveEndnoteGroups,
  syncEndnoteDecorations,
} from './docx-endnotes.js'
import type { HeaderFooter, HfImage } from '../vendor/packages/docx-engine/src/types.js'
import { BlockIndex } from '../vendor/apps/docs/src/renderer/pagination-index.js'
import {
  makeGapEl,
  alignGapHfStrips,
  alignTableGapFills,
  pageFramesFromGaps,
  setPageGaps,
  type PageGapSpec,
  type PageFrame,
} from '../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'
import type { BlockBox, PageSlice } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import type { SectionInfo } from '../vendor/packages/docx-engine/src/types.js'
import type { Block } from '../vendor/packages/docx-engine/src/types.js'
import type { DocxSession } from './docx.js'
import {
  assignLiveBlockSections,
  gapMetricsForSection,
  liveColumnPlacements,
  pageColumnPullUp,
  pageUnusedHeight,
  sectionContentWidth,
  sectionTextLeftOffset,
  syncSectionPageSheets,
} from './pagination-geometry.js'

/** Clip only floating header/footer paint; the editable paper keeps its overflow. */
export function makePageImageClip(frame: PageFrame): HTMLDivElement {
  const clip = document.createElement('div')
  clip.className = 'mimir-page-image-clip'
  Object.assign(clip.style, {
    position: 'absolute',
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${Math.max(0, frame.bottom - frame.top)}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  return clip
}

/**
 * 把连续流切成「纸张页面」（分页视图）。
 *
 * ## 机制
 *
 * 上游的分页不是「多个滚动容器」，而是**在分页点插入装饰器节点**：
 *
 * ```
 * 测量每块的几何（measureBlocks）
 *   → 按可用高度和分栏切页（sliceWithLineSplit）
 *     → 每个分页点生成一个「页间隙」元素（setPageGaps 注入 ProseMirror 装饰器）
 * ```
 *
 * 页间隙是一个高元素，撑出上一页的剩余空间 + 下一页的上边距，中间画一条灰带
 * ——于是连续流看起来就是一页一页的纸。**它不改文档内容**（装饰器不落库、
 * 不进历史），所以保存路径完全不受影响。
 *
 * ## 当前边界
 *
 * 段落、表格、分栏和页眉页脚沿用上游切片与画布几何；脚注根据当前画布引用
 * 分配到页底，并在切片前把实测高度交给引用行的容量模型。正文据此按固定
 * 纸高回流。分页仅影响显示，不改 DOCX 保存字节。
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
  /**
   * 页眉页脚数据（来自 `DocxSession.headerFooter`）。
   *
   * 传 null / 不传表示这份文档没有页眉脚——那就不生成条带。有的话按
   * `titlePg` / `evenAndOdd` 逐页选变体；页码由 `pageNumbers()` 算，
   * 它处理分节的重新编号与格式（如罗马数字）。
   */
  headerFooter?: DocxSession['headerFooter'] | null | undefined
  /**
   * 脚注数据源。**不传就没有页底脚注区**（正文里的上标引用仍然渲染）。
   *
   * 三项都来自 `DocxSession`：`parsed` 提供脚注定义与编号规则，
   * `blocks` 是原始块树（拿 run 里的 `noteRef`），`blockByDocxIndex`
   * 把分页块盒映回原始块。
   */
  footnotes?: DocxSession['footnotes'] | null | undefined
  /** 总页数回传（界面可以显示「第 x / 共 y 页」） */
  onPaged?: (pageCount: number) => void
}

/** Reflect the current ProseMirror references, including unsaved insertions and undo. */
export function liveFootnoteBlocks(
  editor: Editor,
  original: DocxSession['footnotes']['blockByDocxIndex'],
): { blocks: Map<number, Block>; referenced: Set<string> } {
  const blocks = new Map<number, Block>()
  const referenced = new Set<string>()
  editor.state.doc.forEach((node) => {
    const runs: NonNullable<Block['runs']> = []
    node.descendants((child) => {
      if (child.type.name !== 'docNoteRef') return
      const kind = child.attrs.kind
      const id = String(child.attrs.id)
      if (kind !== 'footnote' && kind !== 'endnote') return
      runs.push({ text: '', noteRef: { kind, id } })
      referenced.add(`${kind}:${id}`)
    })
    const index = node.attrs.docxIndex
    if (!Number.isSafeInteger(index)) return
    const source = original.get(index as number)
    if (!source) return
    blocks.set(index as number, { ...source, runs, table: undefined })
  })
  return { blocks, referenced }
}

/** Match each visible footnote reference to its live line, including new paragraphs. */
export function assignLiveNoteBands(blocks: BlockBox[]): void {
  for (const block of blocks) {
    if (!block.el) continue
    const offsets = noteRefOffsets(block.el, 1)
    if (offsets.length > 0) block.noteBands = offsets.map((offset) => ({ offset, height: 0 }))
  }
}

/** Charge the measured note to its actual reference line before the fixed-paper slicer runs. */
export function reserveLiveFootnotes(
  context: FootnoteContext,
  geoms: ReturnType<typeof sectionGeoms>,
): void {
  const blocks = context.blocks as BlockBox[]
  const items = pageFootnotesOf(context, [{ start: 0, end: Infinity, section: 0 }]).flat()
  const heights = new Map(items.map((item) => [item.id, item.height]))
  const bandsByBlock = new Map<BlockBox, { heightPx: number }[]>()
  for (const block of blocks) {
    const refs = block.el
      ? Array.from(
          block.el.querySelectorAll<HTMLElement>('sup.doc-note-ref[data-note-kind="footnote"]'),
        ).filter((ref) => !ref.closest('.page-gap, .page-float-host, .page-repeat-header'))
      : []
    const offsets = block.el ? noteRefOffsets(block.el, 1) : []
    if (!refs.length || offsets.length !== refs.length) continue
    const capacity = Math.max(
      16,
      (geoms[block.section ?? 0]?.contentHeight ?? 800) - FOOTNOTE_SEPARATOR_H - 48,
    )
    const charged = new Map<number, number>()
    const bands = refs.map((ref, index) => {
      const offset = offsets[index]!,
        line = Math.round(offset)
      const used = charged.get(line) ?? 0
      const height = Math.min(
        heights.get(ref.dataset.noteRef ?? '') ?? 0,
        Math.max(0, capacity - used),
      )
      charged.set(line, used + height)
      return { offset, height }
    })
    const extra = bands.reduce((sum, band) => sum + band.height, 0)
    if (!extra) continue
    block.noteBands = bands
    block.footnoteExtraPx = extra
    block.height += extra
    bandsByBlock.set(
      block,
      bands.map((band) => ({ heightPx: band.height })),
    )
  }
  // Tables need row-level charges too. Fill once before slicing so unsaved
  // tables without a source docxIndex use the same per-row mechanism.
  for (const [block, bands] of bandsByBlock) {
    fillLineBoxes([block], geoms, 1, [
      { start: -1, end: block.top, section: block.section ?? 0 },
      { start: block.top, end: Infinity, section: block.section ?? 0 },
    ])
    if (block.el && block.tableRows) applyRowNotes(block.el, block.tableRows, bands)
  }
}

/**
 * 条带的文字内容（做 `hfKey` 的内容签名用）。
 *
 * 页码变了而元素没重建的话，第二页会显示第一页的页码——所以 key 必须
 * 覆盖条带里的全部文字，这个函数就是取那份文字。
 */
function hfText(v: HeaderFooter | null): string {
  return v?.text ?? ''
}

/**
 * `HfPartInfo` → 渲染用的 `HeaderFooter`。
 *
 * 判据与上游 `hfFromPart` 一致：文字、页码域、段落、图片全空才算「没有」。
 */
function contentKey(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return `${text.length}:${hash >>> 0}`
}

function toHeaderFooter(part: {
  text: string
  hasPageNumber: boolean
  paras: unknown[]
  images?: HfImage[]
}): HeaderFooter & { images?: HfImage[] } {
  return {
    text: part.text,
    pageNumber: part.hasPageNumber,
    images: part.images,
    ...(part.paras.length > 0 ? { paras: part.paras as HeaderFooter['paras'] } : {}),
  }
}

/**
 * 行锚点 → 文档位置。
 *
 * **这个函数原本在 GenOffice 的 App 壳里**（`App.tsx:375`），没随编辑器一起
 * vendored——因为它是「锚点怎么落到文档坐标」的接线，属于宿主职责。
 * 逻辑很短但有两个要点，抄在这里并保留原注释：
 *
 *  - 文本行用 `posAtDOM(textNode, charOffset)`
 *  - **纯图片行不能用文本偏移**（原子叶子里没有偏移语义），改走父节点的
 *    子索引——上游注释原话：「offset semantics inside an atom leaf's own DOM
 *    are undefined」
 */
function posFromAnchor(
  // 签名与 `EditorView.posAtDOM` 一致（offset 必填）；这里只用到这一个方法，
  // 所以按结构收窄，不 import 整个 EditorView 类型
  view: { posAtDOM: (node: Node, offset: number) => number },
  anchor: LineAnchor,
): number | undefined {
  try {
    const pos =
      anchor.node instanceof Element
        ? anchor.node.parentNode
          ? view.posAtDOM(
              anchor.node.parentNode,
              Array.prototype.indexOf.call(anchor.node.parentNode.childNodes, anchor.node),
            )
          : -1
        : view.posAtDOM(anchor.node, anchor.charOffset)
    return pos >= 0 ? pos : undefined
  } catch {
    return undefined
  }
}

/** Table gaps paint through a cell-local fill. Align it to the page box, not
 * the ProseMirror content box, so the gray band also crosses both page margins. */
export function alignPageGapPaint(pm: HTMLElement): void {
  alignTableGapFills(pm.closest<HTMLElement>('.doc-page') ?? pm, 1)
  alignGapHfStrips(pm, 0, 1)
}

export function usePagination({
  editor,
  scrollRef,
  containerRef,
  sections,
  headerFooter,
  footnotes,
  onPaged,
}: PaginationOptions): void {
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    let frame = 0
    let disposed = false
    let lastWrap: HTMLElement | null = null

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
      orderedContinuationGaps(ctx.editor, [])
      clearEndnoteGaps(pm)
      if (footnotes)
        syncEndnoteDecorations(
          ctx.editor,
          liveEndnoteGroups(ctx.editor, footnotes.parsed, sections),
          sections,
        )

      const geoms = sectionGeoms(sections)
      const pageEl = pm.closest<HTMLElement>('.doc-page')
      const wrap = pm.closest<HTMLElement>('.page-wrap')
      lastWrap = wrap
      pageEl?.style.removeProperty('min-height')

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

      const liveNotes = footnotes
        ? liveFootnoteBlocks(ctx.editor, footnotes.blockByDocxIndex)
        : null
      const noteDefinitions = footnotes?.parsed.footnotes.filter((note) =>
        liveNotes?.referenced.has(`footnote:${note.id}`),
      )
      const reserveNotes = (measuredBlocks: BlockBox[]) => {
        if (!footnotes || !liveNotes || !noteDefinitions?.length) return
        reserveLiveFootnotes(
          {
            parsed: footnotes.parsed,
            footnotes: noteDefinitions,
            blocks: measuredBlocks,
            blockByDocxIndex: liveNotes.blocks,
            sections,
          },
          geoms,
        )
      }

      pageEl?.classList.add('measuring-columns')
      let measured = measureBlocks(pm, origin, 1)
      let blocks = measured.blocks as BlockBox[]
      assignLiveBlockSections(pm, blocks, sections)
      assignLiveNoteBands(blocks)
      // Width decorations rewrap later sections before their vertical positions are measured.
      setColumnLayout(ctx.editor.view, liveColumnPlacements(blocks, [], sections, geoms))
      measured = measureBlocks(pm, origin, 1)
      blocks = measured.blocks as BlockBox[]
      assignLiveBlockSections(pm, blocks, sections)
      assignLiveNoteBands(blocks)
      if (blocks.length === 0) {
        pageEl?.classList.remove('measuring-columns')
        onPaged?.(1)
        return
      }

      reserveNotes(blocks)

      // The F2 slicer emits column regions and fills line boundaries to a fixed point.
      let slices: PageSlice[] = sliceWithLineSplit(blocks, geoms, measured.totalHeight, 1)

      // Column positions depend on slices, while wrapping depends on column widths.
      // Re-measure after applying the placements until page/column boundaries settle.
      if (geoms.some((geom) => (geom.cols ?? 1) > 1)) {
        for (let pass = 0; pass < 6; pass += 1) {
          const placements = liveColumnPlacements(blocks, slices, sections, geoms)
          setColumnLayout(ctx.editor.view, placements)
          measured = measureBlocks(pm, origin, 1)
          blocks = measured.blocks as BlockBox[]
          assignLiveBlockSections(pm, blocks, sections)
          assignLiveNoteBands(blocks)
          reserveNotes(blocks)
          const refined = sliceWithLineSplit(blocks, geoms, measured.totalHeight, 1)
          const stable =
            refined.length === slices.length &&
            refined.every(
              (slice, index) =>
                Math.abs(slice.start - slices[index]!.start) < 0.5 &&
                slice.section === slices[index]!.section,
            )
          const nextPlacements = liveColumnPlacements(blocks, refined, sections, geoms)
          const widthsStable =
            nextPlacements.length === placements.length &&
            nextPlacements.every((placement, index) => {
              const previous = placements[index]
              return (
                previous?.el === placement.el &&
                Math.abs((previous.widthPx ?? -1) - (placement.widthPx ?? -1)) < 0.5 &&
                Math.abs(previous.dx - placement.dx) < 0.5 &&
                Math.abs(previous.dy - placement.dy) < 0.5
              )
            })
          slices = refined
          if (stable && widthsStable) break
        }
        setColumnLayout(ctx.editor.view, liveColumnPlacements(blocks, slices, sections, geoms))
      }
      pageEl?.classList.remove('measuring-columns')

      const initialNoteItems =
        footnotes && liveNotes && noteDefinitions && noteDefinitions.length > 0
          ? pageFootnotesOf(
              {
                parsed: footnotes.parsed,
                footnotes: noteDefinitions,
                blocks,
                blockByDocxIndex: liveNotes.blocks,
                sections,
              },
              slices,
            )
          : []

      const markers = new Map<string, string>()
      for (const item of initialNoteItems.flat())
        if (item.markText) markers.set(`footnote:${item.id}`, item.markText)
      if (footnotes)
        for (const group of liveEndnoteGroups(ctx.editor, footnotes.parsed, sections))
          for (const item of group.items)
            if (item.markText) markers.set(`endnote:${item.id}`, item.markText)
      paintNoteNumbers(ctx.editor, markers)
      const continuedNotes = paginateFootnoteContinuations(slices, initialNoteItems, geoms)
      slices = continuedNotes.slices
      const noteItems = continuedNotes.notes

      // 按 slice 起点找锚定块，为每个分页点插一个页间隙
      const blockIndex = new BlockIndex(blocks)
      const pmRect = pm.getBoundingClientRect()
      const pageLeft = 0 // 单列：纸左边缘就是内容坐标系的原点
      /**
       * 每页的页码（1 起）与页眉脚变体选择。
       *
       * `pageNumbers()` 处理分节的重新编号与格式（罗马数字等），所以**不要
       * 用下标 +1 代替**——多节文档的第二节可能从 1 重新开始。
       */
      const pageNos = pageNumbers(slices, sections)
      const hfLeftFor = (pageIndex: number): number => {
        return sectionTextLeftOffset(sections, slices[pageIndex]?.section ?? 0)
      }
      const hf = headerFooter ?? null
      const imageKeys = new WeakMap<HfImage[], string>()
      const imageKey = (images: HfImage[] | undefined) => {
        if (!images) return ''
        const previous = imageKeys.get(images)
        if (previous) return previous
        const next = contentKey(images)
        imageKeys.set(images, next)
        return next
      }
      const hfFor = (
        pageIdx: number,
        kind: 'header' | 'footer',
      ): (HeaderFooter & { images?: HfImage[] }) | null => {
        if (!hf) return null
        // 首页不同（w:titlePg）优先；其次奇偶页（w:evenAndOddHeaders）
        if (hf.titlePg && pageIdx === 0) {
          const first = kind === 'header' ? hf.headerFirst : hf.footerFirst
          // titlePg 下首页没有该部件时**空白**（Word 语义），不回落到默认
          return first ? toHeaderFooter(first) : null
        }
        if (hf.evenAndOdd && (pageNos[pageIdx] ?? 1) % 2 === 0) {
          const even = kind === 'header' ? hf.headerEven : hf.footerEven
          if (even) return toHeaderFooter(even)
        }
        const def = kind === 'header' ? hf.header : hf.footer
        return def ? toHeaderFooter(def) : null
      }

      /**
       * 逐页脚注。分配**必须在切片之后**：它把「引用所在的内容流坐标」
       * 换算成页号，段落跨页时每条脚注跟着自己的引用走（Word 语义）。
       */

      /** 某页脚注区的高度（没有脚注为 0）：分页点要把它从正文里让出来 */
      const notesHeightFor = (pageIdx: number): number => notesAreaHeight(noteItems[pageIdx] ?? [])

      /** 该页的脚注区元素（没有脚注返回 undefined） */
      const notesElFor = (pageIdx: number): HTMLElement | undefined => {
        const items = noteItems[pageIdx]
        if (!items || items.length === 0) return undefined
        const el = makeGapNotesEl(
          items,
          sectionContentWidth(sections[slices[pageIdx]?.section ?? 0]!),
        )
        // The gap bleeds to the paper edge. Its note column retains this page's text inset.
        el.dataset.paperX = String(sectionTextLeftOffset(sections, slices[pageIdx]?.section ?? 0))
        const settings = sections[slices[pageIdx]?.section ?? 0]!.settings
        const beneath =
          (settings.footnotePr?.pos ?? footnotes?.parsed.footnoteProps?.pos) === 'beneathText' &&
          !slices[pageIdx]?.regions
        el.style.top = `${beneath ? 0 : Math.max(0, pageUnusedHeight(slices[pageIdx]!, geoms) - notesHeightFor(pageIdx))}px`
        return el
      }
      /**
       * 生成某个分页点的页眉脚条带元素。
       *
       * 一个分页点要画**两条**：上一页的页脚（间隙上沿）与下一页的页眉
       * （间隙下沿）——这正是纸与纸之间那两条边的来源。
       *
       * `hfKey` 覆盖条带里嵌进去的全部内容（两页的页码文字与总页数）：
       * 页码变了而元素没重建的话，第二页会显示第一页的页码（上游同样
       * 用内容签名做 key，注释里记着这个坑）。
       */
      function hfPropsFor(page: number): {
        hfEls?: HTMLElement[]
        hfKey?: string
        notes?: HTMLElement
        notesKey?: string
      } {
        /**
         * 脚注区属于**上一页**：分页点画的是「上一页的页底」，而脚注正在
         * 那里（Word 也是这个位置）。所以取 `page - 1` 的分配。
         */
        const notes = notesElFor(page - 1)
        const prevGeom = hfStripGeom(sections[slices[page - 1]?.section ?? 0]!.settings)
        const nextGeom = hfStripGeom(sections[slices[page]?.section ?? 0]!.settings)
        const els: HTMLElement[] = []
        const total = slices.length

        const prevFooter = hfFor(page - 1, 'footer')
        if (prevFooter && hfHasVisibleContent(prevFooter, prevFooter.images)) {
          const el = makeGapHfEl({
            kind: 'footer',
            value: prevFooter,
            images: prevFooter.images?.filter((image) => !image.floating),
            pageNo: pageNos[page - 1] ?? page,
            pageTotal: total,
            geom: prevGeom,
          })
          el.style.setProperty('--hf-ml', `${hfLeftFor(page - 1)}px`)
          els.push(el)
        }
        const nextHeader = hfFor(page, 'header')
        if (nextHeader && hfHasVisibleContent(nextHeader, nextHeader.images)) {
          const el = makeGapHfEl({
            kind: 'header',
            value: nextHeader,
            images: nextHeader.images?.filter((image) => !image.floating),
            pageNo: pageNos[page] ?? page + 1,
            pageTotal: total,
            geom: nextGeom,
          })
          el.style.setProperty('--hf-ml', `${hfLeftFor(page)}px`)
          els.push(el)
        }
        const notesItems = noteItems[page - 1] ?? []
        /**
         * **脚注区的高度要从正文里预留出来**（加到间隙的下边距上）。
         *
         * 不预留的话脚注画在页底、正文照旧排到页底，两者**重叠**——
         * 实测症状是「脚注文字压在正文上」。
         */
        const notesProps =
          notes && notesItems.length > 0
            ? {
                notes,
                // key 覆盖条数、内容与总高度：脚注文字改了而元素没重建会显示旧内容
                notesKey: contentKey(notesItems),
              }
            : {}
        if (els.length === 0) return notesProps
        const key = [
          pageNos[page - 1] ?? page,
          pageNos[page] ?? page + 1,
          total,
          hfText(prevFooter),
          hfText(nextHeader),
          imageKey(prevFooter?.images),
          imageKey(nextHeader?.images),
        ].join('·')
        return { hfEls: els, hfKey: key, ...notesProps }
      }

      const gaps: PageGapSpec[] = []
      const endnoteGapTails = new Map<HTMLElement, Map<number, HTMLElement>>()
      for (let page = 1; page < slices.length; page += 1) {
        const slice = slices[page]!
        const prev = slices[page - 1]!
        // 未用完的正文高度属于上一张纸，必须落在灰带之前。
        const metrics = gapMetricsForSection(prev, slice, sections, geoms, notesHeightFor(page - 1))
        const pullUp = pageColumnPullUp(prev)
        if (slice.start === slice.end && slice.start >= measured.totalHeight - 0.5) {
          gaps.push({
            pos: ctx.editor.state.doc.content.size,
            kind: 'inline',
            boundaryY: slice.start,
            metrics,
            ...hfPropsFor(page),
          })
          continue
        }

        // Endnote widget DOM is read-only and has no PM positions inside it.
        // Insert its visual gaps directly at the measured line anchor; the
        // widget ignores DOM mutations and the serialized document is intact.
        const noteOwner = blockIndex.containing(slice.start)
        const noteBlock = blockIndex.firstAtTop(slice.start)
        const noteEl = (noteBlock >= 0 ? blocks[noteBlock] : noteOwner)?.el
        if (noteEl?.classList.contains('mimir-docx-endnotes')) {
          const offset = slice.start - (noteBlock >= 0 ? blocks[noteBlock]!.top : noteOwner!.top)
          const rect = noteEl.getBoundingClientRect()
          const gap = makeGapEl(
            {
              ...metrics,
              marginLeft: rect.left - pmRect.left + metrics.sectionMarginLeft,
              marginRight: pmRect.right - rect.right + metrics.sectionMarginRight,
            },
            'inline',
          )
          gap.classList.add('mimir-endnote-gap')
          const props = hfPropsFor(page)
          for (const el of props.hfEls ?? []) gap.append(el)
          if (props.notes) gap.append(props.notes)
          insertOrderedEndnoteGap(
            noteEl,
            offset,
            gap,
            () =>
              offset < 0.5
                ? null
                : (lineStartAnchor(noteEl, offset, 1) ?? nextLineAnchor(noteEl, offset, 1)),
            endnoteGapTails,
          )
          continue
        }

        /**
         * 先看这个分页点是不是**块内**的（长段落在中间被切开）。
         *
         * 判据：切片起点落在某个块内部，而不是某个块的上边缘。
         * 是的话要在**行边界**插一个行内间隙（`kind: 'inline'`），
         * 这样段落会像 Word 那样从中间断开，而不是整块推到下一页
         * ——后者会在长文档里留下大片空白。
         */
        const atBlockTop = blockIndex.firstAtTop(slice.start)

        /**
         * **表格内部的分页点**：走 `kind: 'table'`——它会渲染成一个
         * `display: table-row` 的间隙行，于是表格的列网格不断（用行内
         * 间隙会把表格撑坏）。同时把表头行克隆下来重复到下一页顶部。
         *
         * 判据：切片起点所在的块里有 `<tr>`。
         */
        if (atBlockTop < 0) {
          const ownerForTable = blockIndex.containing(slice.start)
          const tableEl = ownerForTable?.el?.querySelector('tr')
            ? (ownerForTable.el.closest('table') ?? null)
            : null
          if (ownerForTable?.el && tableEl) {
            const cutOff = slice.start - ownerForTable.top - (ownerForTable.spaceBeforePx ?? 0)
            const elTop = ownerForTable.el.getBoundingClientRect().top
            // 已插入的间隙行会让后续行的 DOM 偏移整体下移，比较前要扣掉
            const gapRects = Array.from(ownerForTable.el.querySelectorAll('.page-gap-inline')).map(
              (g) => g.getBoundingClientRect(),
            )
            let cutRow: Element | null = null
            for (const tr of Array.from(tableEl.querySelectorAll('tr')).filter(
              (r) => !r.classList.contains('page-repeat-header'),
            )) {
              if (tr.classList.contains('page-gap')) continue
              const trTop = tr.getBoundingClientRect().top
              const gapsAbove = gapRects.reduce(
                (acc, g) => (g.top <= trTop ? acc + g.height : acc),
                0,
              )
              const off = trTop - elTop - gapsAbove
              if (off <= cutOff + 0.5) cutRow = tr
            }
            if (cutRow) {
              let pos: number | undefined
              try {
                const $pos = ctx.editor.view.state.doc.resolve(ctx.editor.view.posAtDOM(cutRow, 0))
                for (let depth = $pos.depth; depth > 0; depth -= 1) {
                  if ($pos.node(depth).type.name === 'docTableRow') {
                    pos = $pos.before(depth)
                    break
                  }
                }
              } catch {
                pos = undefined
              }
              if (pos !== undefined) {
                /**
                 * 表头重复：克隆源表头行到下一页顶部。
                 *
                 * **优先用引擎给的 `slice.repeatHeader`**（它算准了预留高度），
                 * 引擎没给时**从块数据自己补**：`tableRows[i].isHeader` 就是
                 * `w:tblHeader` 的标记，而「有表头标记 + 表格跨页」按 Word 的
                 * 语义就该重复。
                 *
                 * 为什么需要这个兜底：引擎只在 `turnBeforeRow` 真正换页时把
                 * `repeatH` 传给新页，而分页点落在**行内**（长表格的常见形态）
                 * 时它走的是 `placeSegments` 分支——那一轮 `placedHeader` 还是
                 * false，于是 `repeatHeader` 为空。实测症状：46 行的表格跨页了，
                 * 第二页却从第 24 行直接开始，表头不见了。
                 */
                const headerRowsInBlock = (ownerForTable.tableRows ?? []).filter(
                  (r) => r.isHeader && !r.vMergeContinue,
                )
                const headerHeightFromBlock = headerRowsInBlock.reduce(
                  (acc, r) => acc + r.height,
                  0,
                )
                const repeatSpec =
                  slice.start === slice.end
                    ? null
                    : (slice.repeatHeader ??
                      (headerRowsInBlock.length > 0 &&
                      headerHeightFromBlock < (geoms[slice.section]?.contentHeight ?? 0)
                        ? { top: ownerForTable.top, height: headerHeightFromBlock }
                        : null))

                let repeatHeaderEls: HTMLElement[] | undefined
                let repeatHeaderKey: string | undefined
                if (repeatSpec) {
                  const srcRows = Array.from(
                    tableEl.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr'),
                  ).filter(
                    (r) =>
                      !r.classList.contains('page-gap') &&
                      !r.classList.contains('page-repeat-header'),
                  )
                  const clones: HTMLElement[] = []
                  let acc = 0
                  for (const row of srcRows) {
                    if (acc >= repeatSpec.height - 1.5) break
                    const clone = row.cloneNode(true) as HTMLElement
                    clone.classList.add('page-gap-inline', 'page-repeat-header')
                    clone.setAttribute('contenteditable', 'false')
                    clones.push(clone)
                    acc += row.getBoundingClientRect().height
                  }
                  if (clones.length > 0) {
                    repeatHeaderEls = clones
                    // key 要覆盖克隆的内容：表头文字改了但高度没变时也得重建
                    repeatHeaderKey = `${clones.length}-${Math.round(repeatSpec.height)}-${clones.map((e) => e.innerHTML).join('§').length}`
                  }
                }
                // 表格列数：跨页间隙行的 colSpan 必须正好覆盖列网格，
                // 多一列会把无 colgroup 的固定布局表格压成 1px 宽（上游注释）
                const gridCols = Math.max(
                  1,
                  ...Array.from(
                    tableEl.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr'),
                  )
                    .filter(
                      (r) =>
                        !r.classList.contains('page-gap') &&
                        !r.classList.contains('page-repeat-header'),
                    )
                    .map((r) => Array.from(r.cells).reduce((acc, c) => acc + c.colSpan, 0)),
                )
                gaps.push({
                  pos,
                  kind: 'table',
                  pullUp,
                  cols: gridCols,
                  boundaryY: slice.start,
                  ...hfPropsFor(page),
                  metrics,
                  ...(repeatHeaderEls ? { repeatHeaderEls, repeatHeaderKey } : {}),
                })
                continue
              }
            }
          }
        }

        if (atBlockTop < 0) {
          const owner = blockIndex.containing(slice.start)
          if (owner?.el) {
            // 块内相对 Y（要减掉块自身的 space-before，否则锚点会偏一行）
            const cutOff = slice.start - owner.top - (owner.spaceBeforePx ?? 0)
            // 先试精确命中的行，再退到「切口之后的第一行」——
            // 字体加载导致的重排会让精确匹配差一点点（上游同样有这个回退）
            const exact = lineStartAnchor(owner.el, cutOff, 1)
            const anchor: LineAnchor | null = exact ?? nextLineAnchor(owner.el, cutOff, 1)
            const pos: number | undefined =
              anchor === null ? undefined : posFromAnchor(ctx.editor.view, anchor)
            if (pos !== undefined && anchor !== null) {
              /**
               * 行内间隙的左右边距要「出血到纸边」：段落有自己的缩进，
               * 靠 `rect.left - pmRect.left - pageLeft` 折算出它相对纸边的
               * 偏移，再作为负外边距补上——这样灰带横跨整张纸，而不是
               * 只盖住段落那一段。
               */
              const elRect = anchorElement(anchor)?.getBoundingClientRect()
              gaps.push({
                pos,
                kind: 'inline',
                pullUp,
                boundaryY: slice.start,
                ...hfPropsFor(page),
                metrics:
                  elRect && pmRect
                    ? {
                        ...metrics,
                        marginLeft: elRect.left - pmRect.left - pageLeft,
                        marginRight: pmRect.right - elRect.right - pageLeft,
                      }
                    : metrics,
              })
              continue
            }
          }
        }

        // 块边界上的分页点：整块推到下一页
        const anchor = atBlockTop >= 0 ? blocks[atBlockTop] : blockIndex.containing(slice.start)
        if (!anchor?.el) continue
        gaps.push({
          el: anchor.el,
          pullUp,
          boundaryY: slice.start,
          metrics,
          ...hfPropsFor(page),
        })
      }

      /**
       * 诊断出口：分页是大量几何计算的产物，「页数对但切断位置不对」
       * 或「页数对但没有页间隙」都不会报错。把中间量挂到 window 上，
       * 排查时一眼能看到，而不用往 vendor 里加日志。
       */
      ;(globalThis as unknown as { __mimirPagination?: unknown }).__mimirPagination = {
        pageCount: slices.length,
        repeatHeaders: slices.slice(1).map((sl) => sl.repeatHeader ?? null),
        tableRowCounts: blocks.map((b) => b.tableRows?.length ?? 0).filter((n) => n > 0),
        // 表头行标记：拆表时引擎靠它决定「下一页要不要重复表头」。
        // 为 0 说明 measure/fill 阶段没识别出 w:tblHeader
        headerRowFlags: blocks.flatMap((b) => b.tableRows ?? []).filter((r) => r.isHeader).length,
        // 表头高度与首行高度：引擎在「表头比整页还高」时会放弃重复
        headerHeights: blocks
          .filter((b) => b.tableRows?.length)
          .map((b) =>
            (b.tableRows ?? []).filter((r) => r.isHeader).reduce((a, r) => a + r.height, 0),
          ),
        contentHeight: geoms.map((geom) => Math.round(geom.contentHeight)),
        totalHeight: Math.round(measured.totalHeight),
        blockCount: blocks.length,
        blockTops: blocks.slice(0, 6).map((b) => Math.round(b.top)),
        sliceStarts: slices.map((sl) => Math.round(sl.start)),
        anchored: gaps.length + pm.querySelectorAll('.mimir-endnote-gap').length,
      }

      setPageGaps(ctx.editor.view, orderedContinuationGaps(ctx.editor, gaps))
      alignPageGapPaint(pm)
      if (wrap) {
        const firstBox = sectionPageBox(sections[0]!.settings)
        const mixedPaper = sections.some((section) => {
          const box = sectionPageBox(section.settings)
          return (
            Math.abs(box.width - firstBox.width) > 0.5 ||
            Math.abs(box.height - firstBox.height) > 0.5
          )
        })
        // The last paper has the same physical height as every preceding one.
        // Its body is often short after a note-driven break; natural content
        // height must not collapse the page or move its note/footer upwards.
        if (pageEl) {
          const frames = pageFramesFromGaps(wrap, 1)
          const lastFrame = frames[slices.length - 1]
          const settings = sections[slices[slices.length - 1]?.section ?? 0]?.settings
          if (lastFrame && settings) {
            const offset = pageEl.getBoundingClientRect().top - wrap.getBoundingClientRect().top
            const fixed = lastFrame.top + sectionPageBox(settings).height - offset
            pageEl.style.minHeight = `${Math.max(fixed, parseFloat(pageEl.style.minHeight) || 0)}px`
          }
        }
        wrap.classList.toggle('paper-mixed', mixedPaper)
        syncSectionPageSheets(wrap, sections, slices, mixedPaper)
        // Page-gap widgets can paint only boundaries between pages. Paint the
        // first header, final footer, and final-page notes on the paper itself.
        const previous = wrap.querySelector(':scope > .mimir-edge-hf')
        previous?.remove()
        pageEl?.querySelector(':scope > .mimir-page-images')?.remove()
        const frames = pageFramesFromGaps(wrap, 1)
        const firstHeader = hfFor(0, 'header')
        const lastIndex = slices.length - 1
        const lastFooter = hfFor(lastIndex, 'footer')
        const lastNotes = noteItems[lastIndex] ?? []
        if (
          (firstHeader && hfHasVisibleContent(firstHeader, firstHeader.images)) ||
          (lastFooter && hfHasVisibleContent(lastFooter, lastFooter.images)) ||
          lastNotes.length > 0 ||
          slices.some(
            (_, index) =>
              hfFor(index, 'header')?.images?.some((image) => image.floating) ||
              hfFor(index, 'footer')?.images?.some((image) => image.floating),
          )
        ) {
          const layer = document.createElement('div')
          layer.className = 'mimir-edge-hf'
          layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2'
          const add = (
            kind: 'header' | 'footer',
            value: HeaderFooter & { images?: HfImage[] },
            index: number,
          ) => {
            const pageFrame = frames[index]
            const section = sections[slices[index]?.section ?? 0]
            if (!pageFrame || !section) return
            const geom = hfStripGeom(section.settings)
            const el = makeGapHfEl({
              kind,
              value,
              images: value.images?.filter((image) => !image.floating),
              pageNo: pageNos[index] ?? index + 1,
              pageTotal: slices.length,
              geom,
            })
            el.style.left = `${pageFrame.left + geom.marginLeft}px`
            el.style.transform = 'none'
            el.style.width = `${geom.pageW - geom.marginLeft - geom.marginRight}px`
            if (kind === 'header') {
              el.style.top = `${pageFrame.top + geom.headerStripTop}px`
            } else {
              // The final paper can grow beyond the nominal page height while
              // layout settles; pin its footer to the actual paper edge.
              el.style.bottom = `${geom.footerDist}px`
            }
            layer.append(el)
          }
          if (firstHeader && hfHasVisibleContent(firstHeader, firstHeader.images))
            add('header', firstHeader, 0)
          if (lastFooter && hfHasVisibleContent(lastFooter, lastFooter.images))
            add('footer', lastFooter, lastIndex)
          if (lastNotes.length > 0) {
            const pageFrame = frames[lastIndex]
            const section = sections[slices[lastIndex]?.section ?? 0]
            if (pageFrame && section) {
              const geom = hfStripGeom(section.settings)
              const notes = makeGapNotesEl(lastNotes, sectionContentWidth(section))
              notes.style.left = `${pageFrame.left + geom.marginLeft}px`
              const beneath =
                (section.settings.footnotePr?.pos ?? footnotes?.parsed.footnoteProps?.pos) ===
                  'beneathText' && !slices[lastIndex]?.regions
              const bottom = pageFrame.bottom - geom.marginBottom - notesAreaHeight(lastNotes)
              const textEnd =
                pageFrame.top +
                effectiveTopPx(section.settings, 0) +
                (slices[lastIndex]!.physHeight ?? slices[lastIndex]!.end - slices[lastIndex]!.start)
              notes.style.top = `${beneath ? Math.min(textEnd, bottom) : bottom}px`
              layer.append(notes)
            }
          }
          const imageLayer = document.createElement('div')
          imageLayer.className = 'mimir-page-images'
          imageLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none'
          slices.forEach((slice, index) => {
            const imageFrame = frames[index]
            const settings = sections[slice.section ?? 0]?.settings
            if (!imageFrame || !settings) return
            const geom = hfStripGeom(settings)
            const pageClip = makePageImageClip(imageFrame)
            for (const kind of ['header', 'footer'] as const) {
              const part = hfFor(index, kind)
              const paraOriginY =
                kind === 'header'
                  ? geom.headerStripTop
                  : geom.pageH -
                    geom.footerDist -
                    hfReservedHeightPx(
                      'footer',
                      part,
                      geom.pageW - geom.marginLeft - geom.marginRight,
                      part?.images,
                    )
              for (const image of part?.images?.filter((item) => item.floating) ?? []) {
                const el = makeHfFloatImgEl(
                  image,
                  {
                    ...geom,
                    headerDist: (settings.headerDist ?? 720) / 15,
                    sectMarginTop: geom.marginTop,
                    paraOriginY,
                  },
                  'lead',
                )
                el.style.left = `${parseFloat(el.style.left) + geom.marginLeft}px`
                el.style.top = `${parseFloat(el.style.top) + geom.marginTop}px`
                el.dataset.page = String(index + 1)
                pageClip.append(el)
              }
            }
            if (pageClip.childElementCount) imageLayer.append(pageClip)
          })
          if (imageLayer.childElementCount) pageEl?.append(imageLayer)
          wrap.append(layer)
        }
      }
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
          containerRef.current?.querySelector('.doc-page')?.classList.remove('measuring-columns')
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
      if (!editor?.isDestroyed && editor?.view?.dom) {
        setPageGaps(editor.view, [])
        clearEndnoteDecorations(editor)
        clearContinuationGaps(editor)
      }
      if (lastWrap) {
        lastWrap.querySelector(':scope > .mimir-edge-hf')?.remove()
        lastWrap.querySelector('.mimir-page-images')?.remove()
        syncSectionPageSheets(lastWrap, sections, [], false)
        lastWrap.classList.remove('paper-mixed')
      }
    }
  }, [editor, scrollRef, containerRef, sections, headerFooter, footnotes, onPaged])
}
