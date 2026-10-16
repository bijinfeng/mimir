import {
  columnLayoutSpecs,
  effectiveBottomPx,
  effectiveTopPx,
  pageLeftPx,
  paperWidthPx,
  sectionPageBox,
  sectionWidthSpecs,
} from '../vendor/apps/docs/src/renderer/pagination-sections.js'
import type {
  BlockBox,
  ColumnBlockPlacement,
  PageSlice,
  SectionGeom,
} from '../vendor/apps/docs/src/renderer/pagination-types.js'
import type { SectionInfo } from '../vendor/packages/docx-engine/src/types.js'
import {
  pageFramesFromGaps,
  syncPageSheets,
} from '../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'

/** Live agent sections use editor child indexes; measured docxIndex values are source indexes. */
export function assignLiveBlockSections(
  pm: HTMLElement,
  blocks: BlockBox[],
  sections: SectionInfo[],
): void {
  const indexes = new Map<Element, number>()
  let index = 0
  for (const child of Array.from(pm.children)) {
    if (
      child.classList.contains('page-gap') ||
      child.classList.contains('page-float-host') ||
      child.classList.contains('page-float-carry') ||
      child.classList.contains('mimir-docx-endnotes')
    )
      continue
    indexes.set(child, index++)
  }
  let previous = 0
  for (const block of blocks) {
    const endnoteSection = block.el?.dataset.endnoteSection
    if (endnoteSection !== undefined) {
      block.section = Math.max(0, Math.min(sections.length - 1, Number(endnoteSection)))
      block.isEndnotes = true
      block.widowControl = false
      continue
    }
    const editorIndex = block.el ? indexes.get(block.el) : undefined
    if (editorIndex !== undefined) {
      const found = sections.findIndex((section) => editorIndex <= section.lastBlockIndex)
      previous = found < 0 ? sections.length - 1 : found
    }
    block.section = Math.max(0, previous)
  }
}

export function gapMetricsForSection(
  previous: PageSlice,
  next: PageSlice,
  sections: SectionInfo[],
  geoms: SectionGeom[],
  notesHeight: number,
): {
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  sectionMarginLeft: number
  sectionMarginRight: number
  sectionMarginTop: number
  pageLeft: number
  pageWidth: number
} {
  const prevIndex = Math.max(0, Math.min(previous.section, sections.length - 1))
  const nextIndex = Math.max(0, Math.min(next.section, sections.length - 1))
  const prevSettings = sections[prevIndex]!.settings
  const nextSettings = sections[nextIndex]!.settings
  const remaining = pageUnusedHeight(previous, geoms)
  const marginLeft = (nextSettings.marginLeft / 1440) * 96
  const marginRight = (nextSettings.marginRight / 1440) * 96
  const top = effectiveTopPx(nextSettings, 0)
  return {
    marginTop: top,
    marginBottom: effectiveBottomPx(prevSettings, 0) + Math.max(remaining, notesHeight),
    marginLeft,
    marginRight,
    sectionMarginLeft: marginLeft,
    sectionMarginRight: marginRight,
    sectionMarginTop: top,
    pageLeft: pageLeftPx(nextSettings, paperWidthPx(sections)),
    pageWidth: sectionPageBox(nextSettings).width,
  }
}

export function pageUnusedHeight(slice: PageSlice, geoms: SectionGeom[]): number {
  return Math.max(
    0,
    (geoms[slice.section]?.contentHeight ?? 0) - (slice.physHeight ?? slice.end - slice.start),
  )
}

export function sectionContentWidth(section: SectionInfo): number {
  const box = sectionPageBox(section.settings)
  return box.contentWidth
}

/** Text column x relative to the canvas' first-section content origin. */
export function sectionTextLeftOffset(sections: SectionInfo[], sectionIndex: number): number {
  const settings = sections[sectionIndex]!.settings
  const canvasLeft = (sections[0]!.settings.marginLeft / 1440) * 96
  return (
    pageLeftPx(settings, paperWidthPx(sections)) + (settings.marginLeft / 1440) * 96 - canvasLeft
  )
}

/** Compress the unused single-flow slot after columns have been painted side by side. */
export function pageColumnPullUp(slice: PageSlice): number {
  const virtualHeight = slice.end - slice.start
  return Math.max(0, virtualHeight - (slice.physHeight ?? virtualHeight))
}

/** Paint each mixed-width paper at its physical section height, including the final page. */
export function syncSectionPageSheets(
  wrap: HTMLElement,
  sections: SectionInfo[],
  slices: PageSlice[],
  mixedPaper: boolean,
): void {
  if (!mixedPaper || slices.length === 0) {
    wrap.style.removeProperty('min-height')
    syncPageSheets(wrap, 1, null)
    return
  }
  const paperW = paperWidthPx(sections)
  const firstSettings = sections[slices[0]!.section]!.settings
  const first = {
    left: pageLeftPx(firstSettings, paperW),
    width: sectionPageBox(firstSettings).width,
  }
  // Old min-height must not feed the new last-page frame after a page setup edit.
  wrap.style.removeProperty('min-height')
  const frames = pageFramesFromGaps(wrap, 1, first)
  const heightOf = (index: number) =>
    sectionPageBox(sections[slices[Math.min(index, slices.length - 1)]!.section]!.settings).height
  const bottom = Math.max(0, ...frames.map((frame, index) => frame.top + heightOf(index)))
  wrap.style.minHeight = `${bottom}px`
  syncPageSheets(wrap, 1, first)
  const sheets = wrap.querySelectorAll<HTMLElement>(':scope > .page-sheets > .page-sheet')
  sheets.forEach((sheet, index) => {
    sheet.style.height = `${heightOf(index)}px`
  })
}

/** Horizontal section offset and column placement share the same decoration channel. */
export function liveColumnPlacements(
  blocks: BlockBox[],
  slices: PageSlice[],
  sections: SectionInfo[],
  geoms: SectionGeom[],
): ColumnBlockPlacement[] {
  const placements = new Map<HTMLElement, ColumnBlockPlacement>()
  for (const spec of sectionWidthSpecs(blocks, sections, geoms)) placements.set(spec.el, spec)
  for (const column of columnLayoutSpecs(blocks, slices, sections)) {
    const section = placements.get(column.el)
    placements.set(
      column.el,
      section
        ? {
            ...section,
            ...column,
            widthPx: column.widthPx ?? section.widthPx,
            dx: section.dx + column.dx,
            dy: section.dy + column.dy,
          }
        : column,
    )
  }
  return [...placements.values()]
}
