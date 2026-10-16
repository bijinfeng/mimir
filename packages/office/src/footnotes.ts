import {
  createLineRectsCache,
  lineBreakBoundaries,
} from '../vendor/apps/docs/src/renderer/pagination-lines.js'
import { noteNumbering } from './docx-note-numbering.js'
import type { PageNoteItem } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import type { NoteKind } from '../vendor/packages/docx-engine/src/notes.js'
import type { NoteInfo, NoteRun } from '../vendor/packages/docx-engine/src/types.js'
import {
  cssFontFamily,
  noteLineHeightPx,
  FOOTNOTE_SEPARATOR_H,
  noteRunStyle,
  resolveNoteStyle,
} from '../vendor/apps/docs/src/renderer/line-metrics.js'
import { noteMarkText } from '../vendor/apps/docs/src/renderer/note-format.js'
import { textColorValue } from '../vendor/apps/docs/src/renderer/editor/text-color.js'
import { setDkColor } from '../vendor/apps/docs/src/renderer/editor/dark-page.js'
import { textOutlineCssValue } from '../vendor/apps/docs/src/renderer/editor/text-outline.js'
import { estimateFootnoteHeight } from '../vendor/apps/docs/src/renderer/line-metrics.js'
import type { Block, ParsedDoc, SectionSettings } from '../vendor/packages/docx-engine/src/types.js'
import type { BlockBox, PageSlice } from '../vendor/apps/docs/src/renderer/pagination-types.js'

/**
 * 脚注的**页面分配与渲染**（宿主侧）。
 *
 * ## 为什么这层在 mimir 而不在 vendor
 *
 * vendored 的编辑器已经能渲染正文里的**脚注引用**（`DocNoteRef`，上标数字），
 * 但「把脚注正文放到它引用所在页的页底」这一步在上游属于 App 壳——它要读
 * App 状态（当前文档、分页结果、动过的脚注）。上游为此写了五个 helper：
 * `pageFootnotesOf` / `noteStyleOf` / `measureNoteHeightDom` / `appendNoteRuns`
 * / `blockNoteScanRuns`。这里把它们按同样的语义实现一遍。
 *
 * 依赖的底层工具（`resolveNoteStyle` / `noteLineHeightPx` / `noteRunStyle` /
 * `noteMarkText` / `cssFontFamily` / `textColorValue` / `estimateFootnoteHeight`）
 * **都在 vendor 里**，所以这是「把零件拼起来」而不是「重写渲染」。
 *
 * ## Word 的脚注语义（三条，都按它实现）
 *
 *  1. 脚注落在**引用所在的那一页**的页底。段落被分页切开时，同一个段落里的
 *     多个脚注会各自跟着自己的引用行走（`noteBands` 给了每个引用的行偏移）
 *  2. 页底脚注区**从正文里预留高度**（由分页引擎算，见 `noteBands`），
 *     所以正文不会压到脚注上
 *  3. 条目以**上标编号**开头（`noRefMark` 为真时不画——那是 Word 里
 *     「脚注正文没有自引用标记」的情形）
 */

/** `SectionSettings` 的 twips → px（与上游一致：1440 twips = 1 英寸 = 96 px） */
const twipsToPx = (twips: number): number => (twips / 1440) * 96

/**
 * 块内的全部 run（含表格单元格里与嵌套表格里的）。
 *
 * 脚注引用可能出现在表格里，所以不能只看 `block.runs`。
 */
function blockNoteScanRuns(block: Block): NonNullable<Block['runs']> {
  const out: NonNullable<Block['runs']> = []
  if (block.runs) out.push(...block.runs)
  const walkTable = (table: NonNullable<Block['table']> | undefined): void => {
    for (const row of table?.rows ?? []) {
      for (const cell of row) {
        for (const para of cell.richParas ?? []) out.push(...para.runs)
        for (const nested of cell.nestedTables ?? []) walkTable(nested)
      }
    }
  }
  if (block.table) walkTable(block.table)
  return out
}

/** 脚注样式的解析（上游是带缓存的 `noteStyleOf`，这里同样缓存） */
function makeNoteStyleOf(parsed: ParsedDoc) {
  const cache = new Map<string, ReturnType<typeof resolveNoteStyle>>()
  return (note?: Pick<NoteInfo, 'styleId' | 'spacing' | 'richParas'>) => {
    const runStyle = noteRunStyle(note?.richParas)
    const key = `${note?.styleId ?? ''}|${JSON.stringify(note?.spacing ?? null)}|${runStyle.fontFamily ?? ''}|${runStyle.sizeHalfPoints ?? ''}`
    const hit = cache.get(key)
    if (hit) return hit
    const value = { ...resolveNoteStyle(parsed, note?.styleId, note?.spacing), ...runStyle }
    cache.set(key, value)
    return value
  }
}

/**
 * 离屏测量一条脚注的高度。
 *
 * 为什么不能只靠字符宽度估算：复杂文种（阿拉伯语等）会低估换行数，
 * 于是预留高度小于实际渲染高度、条目互相覆盖（上游注释记了这个真实案例）。
 * 所以「预留」与「绘制」必须用同一份 DOM 换行事实。
 *
 * 测量宿主是**模块级单例**并复用：每次新建一个 div 会让长文档的分页
 * 多出几百次布局计算。
 */
let noteMeasureHost: HTMLDivElement | null = null

function measureNoteHeightDom(
  entry: Pick<PageNoteItem, 'no' | 'text' | 'richParas' | 'noRefMark'>,
  kind: NoteKind,
  widthPx: number,
  lineHeightPx: number,
  fontSizePt: number,
  fontFamily?: string,
): { height: number; breakOffsets: number[] } | null {
  if (typeof document === 'undefined' || !document.body || widthPx <= 0) return null
  if (!noteMeasureHost || !noteMeasureHost.isConnected) {
    noteMeasureHost = document.createElement('div')
    noteMeasureHost.style.cssText =
      'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;text-align:left;text-indent:0;'
    document.body.append(noteMeasureHost)
  }
  const host = noteMeasureHost
  host.style.width = `${widthPx}px`
  host.style.lineHeight = `${lineHeightPx}px`
  host.style.fontSize = `${fontSizePt}pt`
  host.style.fontFamily = fontFamily ?? ''
  host.replaceChildren()
  const row = document.createElement('div')
  row.style.minHeight = '0'
  appendNoteRuns(row, entry, kind)
  host.append(row)
  const height = row.getBoundingClientRect().height
  return height > 0
    ? { height, breakOffsets: lineBreakBoundaries(createLineRectsCache()(row, 1)) }
    : null
}

/**
 * 把一条脚注的内容画进元素：上标编号 + 富文本 run。
 *
 * `richParas` 是 run 的二维数组（段落 → run），段落之间用 `<br>` 分隔。
 * 没有 `richParas` 时退回纯文本——老文档的脚注可能没有结构化 run。
 */
function appendNoteRuns(
  row: HTMLElement,
  entry: Omit<PageNoteItem, 'height' | 'id'> & { markText?: string },
  kind: NoteKind,
): void {
  // `noRefMark` 为真时不画编号：Word 里脚注正文可以没有自引用标记
  if (!entry.noRefMark) {
    const sup = document.createElement('sup')
    sup.textContent = entry.markText ?? noteMarkText(kind, entry.no)
    row.append(sup)
  }
  if (entry.richParas) {
    entry.richParas.forEach((para, index) => {
      if (index > 0) row.append(document.createElement('br'))
      for (const run of para as NoteRun[]) {
        const span = document.createElement('span')
        span.textContent = run.text
        if (run.bold) span.style.fontWeight = '600'
        if (run.italic) span.style.fontStyle = 'italic'
        const deco = [run.underline && 'underline', run.strike && 'line-through'].filter(Boolean)
        if (deco.length > 0) span.style.textDecoration = deco.join(' ')
        if (run.color) {
          span.style.color = textColorValue(run.color)
          // 深色页的孪生值：作者色仍是那份声明，深色下切到 --dk-*
          if (run.color !== 'auto') setDkColor(span, run.color)
        }
        if (run.sizeHalfPoints) span.style.fontSize = `${run.sizeHalfPoints / 2}pt`
        if (run.fontAscii) span.style.fontFamily = cssFontFamily(run.fontAscii)
        if (run.textOutline) span.style.webkitTextStroke = textOutlineCssValue(run.textOutline)
        if (run.caps === 'all') span.style.textTransform = 'uppercase'
        else if (run.caps === 'small') span.style.fontVariantCaps = 'small-caps'
        row.append(span)
      }
    })
  } else {
    const span = document.createElement('span')
    span.textContent = entry.text
    span.style.whiteSpace = 'pre-wrap'
    row.append(span)
  }
}

export interface FootnoteContext {
  parsed: ParsedDoc
  /** 文档里的脚注（`parsed.footnotes`），按 body 引用顺序编号 */
  footnotes: NoteInfo[]
  /**
   * 分页用的块盒（`measureBlocks` 的产物）——**不是**原始块树。
   *
   * 它带 `top` / `height` / `noteBands`（引用行的偏移），脚注分配靠这些。
   */
  blocks: readonly BlockBox[]
  /** `blocks[i].docxIndex` → 原始块。上游用 Map 做这个查找 */
  blockByDocxIndex: Map<number, Block>
  sections: { settings: SectionSettings; firstBlockIndex: number; lastBlockIndex: number }[]
}

/**
 * 逐页分配脚注：返回「每一页有哪些脚注」。
 *
 * 分配依据是**引用所在的位置**（不是块的位置）：段落被分页切开时，
 * 同一个段落里的多个脚注各自跟着自己的引用行走——`noteBands` 给了每个
 * 引用的行偏移，用它在切片里定位页号。
 */
export function pageFootnotesOf(ctx: FootnoteContext, slices: PageSlice[]): NoteFragment[][] {
  const out: NoteFragment[][] = slices.map(() => [])
  if (ctx.footnotes.length === 0) return out

  const noteStyleOf = makeNoteStyleOf(ctx.parsed)
  const numbering = noteNumbering('footnote', ctx.parsed.footnoteProps)
  const seen = new Set<string>()

  /** 某个内容流坐标落在第几页（1 起） */
  const pageAt = (y: number): number => {
    let page = 1
    for (let i = 0; i < slices.length; i += 1) {
      if (slices[i]!.start <= y + 0.5) page = i + 1
      else break
    }
    return page
  }

  for (const box of ctx.blocks) {
    const block = box.docxIndex === undefined ? undefined : ctx.blockByDocxIndex.get(box.docxIndex)
    // The live canvas is authoritative for an unsaved new paragraph (it has no
    // docxIndex) and for refs added/undone in an existing paragraph. The parsed
    // runs remain a fallback for geometry-only callers without an element.
    const ids = box.el
      ? Array.from(
          box.el.querySelectorAll<HTMLElement>('sup.doc-note-ref[data-note-kind="footnote"]'),
        )
          .filter((element) => !element.closest('.page-gap, .page-float-host, .page-repeat-header'))
          .map((element) => element.dataset.noteRef)
          .filter((id): id is string => !!id)
      : block
        ? blockNoteScanRuns(block)
            .filter((run) => run.noteRef?.kind === 'footnote')
            .map((run) => run.noteRef!.id)
        : []
    if (ids.length === 0) continue

    const section =
      (box.section === undefined ? undefined : ctx.sections[box.section]?.settings) ??
      ctx.sections.find((s) => box.docxIndex !== undefined && box.docxIndex <= s.lastBlockIndex)
        ?.settings ??
      ctx.sections[0]?.settings
    if (!section) continue

    for (let ri = 0; ri < ids.length; ri += 1) {
      const id = ids[ri]!
      const note = ctx.footnotes.find((f) => f.id === id)
      if (!note || seen.has(id)) continue
      seen.add(id)

      /**
       * 这一条脚注落在哪一页。
       *
       * 优先用 `noteBands`（引擎按引用行算出的位置）：段落跨页时它才准。
       * 没有 band（老数据或未测量）时退回「块所在页」——那正是
       * 「段落被切开时脚注全挤在最后」的旧行为，但比丢失好。
       */
      const band = box.noteBands?.length === ids.length ? box.noteBands[ri] : undefined
      const page = band
        ? pageAt(box.top + (box.spaceBeforePx ?? 0) + band.offset)
        : pageAt(box.top + 0.5)

      const sectionIndex = Math.max(
        0,
        ctx.sections.findIndex((item) => item.settings === section),
      )
      const number = numbering(id, sectionIndex, page - 1, section.footnotePr)
      const style = noteStyleOf(note)
      const contentW = twipsToPx(section.pageWidth - section.marginLeft - section.marginRight)
      const lineHeightPx = noteLineHeightPx(section.docGrid, style)
      const fontSizePt = style.sizeHalfPoints ? style.sizeHalfPoints / 2 : 10
      const fontFamily = style.fontFamily ? cssFontFamily(style.fontFamily) : undefined

      const entry = {
        ...number,
        text: note.text,
        ...(note.richParas ? { richParas: note.richParas } : {}),
        ...(note.noRefMark ? { noRefMark: true as const } : {}),
      }
      /**
       * 高度：**优先离屏实量**（DOM 换行事实），量不到才退回字符宽度估算。
       *
       * 顺序不能反：估算在复杂文种上会低估换行数（上游记过阿拉伯语脚注
       * 互相覆盖的案例），而预留高度小于实际渲染高度时会叠在一起。
       * 离屏测量要求有 document（SSR/测试环境没有），所以保留估算作为退路。
       */
      const measured = measureNoteHeightDom(
        entry,
        'footnote',
        contentW,
        lineHeightPx,
        fontSizePt,
        fontFamily,
      )
      const height =
        measured?.height ??
        estimateFootnoteHeight(
          note.text,
          contentW,
          section.docGrid,
          undefined,
          style,
          note.richParas,
        )

      out[page - 1]?.push({
        ...entry,
        id,
        height,
        ...(measured?.breakOffsets.length ? { breakOffsets: measured.breakOffsets } : {}),
        lineHeightPx,
        fontSizePt,
        ...(fontFamily ? { fontFamily } : {}),
      })
    }
  }
  return out
}

export interface NoteFragment extends PageNoteItem {
  markText?: string
  breakOffsets?: number[]
  clipTop?: number
  fullHeight?: number
}

/**
 * 把一页的脚注画成页底区块。
 *
 * 返回的元素挂到页间隙上（`PageGapSpec.notes`）——间隙的高度已经按
 * `noteBands` 预留过，所以这里画进去的内容正好填满那块空间。
 */
export function makeGapNotesEl(
  items: (NoteFragment & { kind?: NoteKind })[],
  widthPx: number,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'page-gap-notes'
  wrap.style.width = `${widthPx}px`
  // 与预留模型同一行高；min-height 让行保持预留尺寸，长条目溢出而不是被裁
  wrap.style.lineHeight = `${items[0]?.lineHeightPx ?? 16}px`

  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'page-gap-note'
    row.style.minHeight = `${item.height}px`
    if (item.lineHeightPx) row.style.lineHeight = `${item.lineHeightPx}px`
    if (item.fontSizePt) row.style.fontSize = `${item.fontSizePt}pt`
    if (item.fontFamily) row.style.fontFamily = item.fontFamily
    row.dataset.noteKind = item.kind ?? 'footnote'
    row.dataset.noteId = item.id
    if (item.fullHeight !== undefined) {
      row.style.height = `${item.height}px`
      row.style.overflow = 'hidden'
      const content = document.createElement('div')
      content.style.transform = `translateY(-${item.clipTop ?? 0}px)`
      appendNoteRuns(content, item, item.kind ?? 'footnote')
      if (item.clipTop) {
        content.setAttribute('aria-hidden', 'true')
        row.setAttribute('aria-label', `脚注 ${item.no} 续`)
        row.dataset.noteContinuation = 'true'
      }
      row.append(content)
    } else appendNoteRuns(row, item, item.kind ?? 'footnote')
    wrap.append(row)
  }
  return wrap
}

/** 页底脚注区的高度（含与正文之间的分隔线） */
export { FOOTNOTE_SEPARATOR_H }

export function notesAreaHeight(items: PageNoteItem[]): number {
  if (items.length === 0) return 0
  return items.reduce((sum, item) => sum + item.height, 0) + FOOTNOTE_SEPARATOR_H
}

/** Endnote rows are displayed in an in-flow decoration at their section/document end. */
export function endnoteItems(
  parsed: ParsedDoc,
  notes: NoteInfo[],
  settings: SectionSettings,
): (PageNoteItem & { kind: 'endnote' })[] {
  const styleOf = makeNoteStyleOf(parsed)
  const width = twipsToPx(settings.pageWidth - settings.marginLeft - settings.marginRight)
  return notes.map((note, index) => {
    const style = styleOf(note)
    const lineHeightPx = noteLineHeightPx(settings.docGrid, style)
    const fontSizePt = style.sizeHalfPoints ? style.sizeHalfPoints / 2 : 10
    const fontFamily = style.fontFamily ? cssFontFamily(style.fontFamily) : undefined
    const entry = {
      no: index + 1,
      text: note.text,
      ...(note.richParas ? { richParas: note.richParas } : {}),
      ...(note.noRefMark ? { noRefMark: true as const } : {}),
    }
    const height =
      measureNoteHeightDom(entry, 'endnote', width, lineHeightPx, fontSizePt, fontFamily)?.height ??
      estimateFootnoteHeight(note.text, width, settings.docGrid, undefined, style, note.richParas)
    return { ...entry, kind: 'endnote', id: note.id, height, lineHeightPx, fontSizePt, fontFamily }
  })
}
