// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { computeSectionedSlices } from '../vendor/apps/docs/src/renderer/pagination-slices.js'
import { makeGapEl } from '../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'
import { setColumnLayout } from '../vendor/apps/docs/src/renderer/editor/column-layout.js'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { sectionGeoms } from '../vendor/apps/docs/src/renderer/pagination-sections.js'
import { sliceWithLineSplit } from '../vendor/apps/docs/src/renderer/pagination-lines.js'
import type { BlockBox } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import type { SectionInfo, SectionSettings } from '../vendor/packages/docx-engine/src/types.js'
import { openDocx } from './docx.js'
import { alignPageGapPaint } from './pagination.js'
import {
  assignLiveBlockSections,
  gapMetricsForSection,
  liveColumnPlacements,
  pageColumnPullUp,
  sectionTextLeftOffset,
  syncSectionPageSheets,
} from './pagination-geometry.js'

function section(lastBlockIndex: number, pageHeight: number, margin: number): SectionInfo {
  return {
    firstBlockIndex: 0,
    lastBlockIndex,
    startType: 'nextPage',
    settings: {
      pageWidth: 9000,
      pageHeight,
      marginTop: margin,
      marginBottom: margin,
      marginLeft: margin,
      marginRight: margin,
    } as SectionSettings,
    sectPrXml: '',
    titlePg: false,
    headerRefs: {},
    footerRefs: {},
  }
}

describe('live DOCX section pagination geometry', () => {
  it('stretches a table page gap across both paper margins', () => {
    const page = document.createElement('div')
    page.className = 'doc-page'
    const pm = document.createElement('div')
    const table = document.createElement('table')
    const body = document.createElement('tbody')
    const gap = makeGapEl(
      { marginTop: 96, marginBottom: 150, marginLeft: 96, marginRight: 96 },
      'table',
      2,
    )
    const cell = gap.querySelector('td')!
    const fill = gap.querySelector<HTMLElement>('.page-gap-table-fill')!
    body.append(gap)
    table.append(body)
    pm.append(table)
    page.append(pm)
    // The content box is inset from the paper, and the table cell starts in
    // its right column. Both offsets must be removed from the gray band.
    page.getBoundingClientRect = () => ({ left: 124, width: 793 }) as DOMRect
    pm.getBoundingClientRect = () => ({ left: 212.5, width: 552.5 }) as DOMRect
    cell.getBoundingClientRect = () => ({ left: 489 }) as DOMRect

    alignPageGapPaint(pm)

    // The gray band is inside this fill; a cell-local 275px width leaves most
    // of the paper looking continuous even though the pagination gap exists.
    expect(fill.style.left).toBe('-365px')
    expect(fill.style.width).toBe('793px')
    expect(fill.style.right).toBe('auto')

    gap.style.setProperty('--gap-page-x', '100px')
    gap.style.setProperty('--gap-page-w', '600px')
    alignPageGapPaint(pm)
    expect(fill.style.left).toBe('-265px')
    expect(fill.style.width).toBe('600px')
  })

  it('maps editor indexes across a section-break chip and uses each page size', () => {
    const pm = document.createElement('div')
    const elements = Array.from({ length: 7 }, (_, index) => {
      const el = document.createElement(index === 2 ? 'div' : 'p')
      if (index === 2) el.className = 'doc-protected-sectbreak'
      pm.append(el)
      return el
    })
    // A pagination decoration is not an editor child index.
    const gap = document.createElement('div')
    gap.className = 'page-gap'
    pm.insertBefore(gap, elements[3]!)
    const blocks: BlockBox[] = [0, 1, 3, 4, 5, 6].map((i, position) => ({
      el: elements[i]!,
      top: position * 100,
      height: 100,
      docxIndex: position + 100,
    }))
    const sections = [section(2, 4500, 450), section(6, 2700, 300)]
    const geoms = sectionGeoms(sections)
    assignLiveBlockSections(pm, blocks, sections)
    expect(blocks.map((block) => block.section)).toEqual([0, 0, 1, 1, 1, 1])

    const slices = computeSectionedSlices(blocks, geoms, 600)
    expect(slices.map((slice) => slice.section)).toEqual([0, 1, 1, 1, 1])
    expect(slices.map((slice) => slice.start)).toEqual([0, 200, 300, 400, 500])

    const metrics = gapMetricsForSection(slices[0]!, slices[1]!, sections, geoms, 12)
    expect(metrics.marginTop).toBeCloseTo(20)
    expect(metrics.marginBottom).toBeCloseTo(30 + 40 + 12)
    expect(metrics.marginLeft).toBeCloseTo(20)
    expect(metrics.pageWidth).toBeCloseTo(600)
    expect(metrics.sectionMarginTop).toBeCloseTo(20)
  })

  it('paints separate centered paper rectangles from section gap geometry', () => {
    const wrap = document.createElement('div')
    document.body.append(wrap)
    const paper = document.createElement('div')
    paper.className = 'doc-page'
    wrap.append(paper)
    const gap = document.createElement('div')
    gap.className = 'page-gap'
    gap.style.setProperty('--gap-mb', '40px')
    gap.style.setProperty('--gap-mt', '20px')
    gap.style.setProperty('--gap-page-x', '0px')
    gap.style.setProperty('--gap-page-w', '600px')
    paper.append(gap)
    wrap.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 600,
        height: 500,
      }) as DOMRect
    paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600 }) as DOMRect
    gap.getBoundingClientRect = () => ({ top: 180, height: 100 }) as DOMRect

    const sections = [section(0, 4500, 450), section(1, 3750, 300)]
    sections[0]!.settings.pageWidth = 6000
    sections[1]!.settings.pageWidth = 9000
    syncSectionPageSheets(
      wrap,
      sections,
      [
        { start: 0, end: 100, section: 0 },
        { start: 100, end: 200, section: 1 },
      ],
      true,
    )
    const sheets = Array.from(wrap.querySelectorAll<HTMLElement>('.page-sheet'))
    expect(sheets).toHaveLength(2)
    expect(sheets.map((sheet) => [sheet.style.left, sheet.style.width])).toEqual([
      ['100px', '400px'],
      ['0px', '600px'],
    ])
    expect(sheets.map((sheet) => [sheet.style.top, sheet.style.height])).toEqual([
      ['0px', '300px'],
      ['260px', '250px'],
    ])
    expect(wrap.style.minHeight).toBe('510px')
    wrap.remove()
  })

  it('uses the real multi-section fixture paper heights, including its short final page', async () => {
    const path = join(
      import.meta.dirname,
      '../vendor/apps/docs/tests/pagination-corpus/docx/08-multi-section-paper.docx',
    )
    const session = await openDocx(new Uint8Array(readFileSync(path)))
    expect(session.sections).toHaveLength(2)
    const wrap = document.createElement('div')
    document.body.append(wrap)
    const paper = document.createElement('div')
    paper.className = 'doc-page'
    wrap.append(paper)
    const gap = document.createElement('div')
    gap.className = 'page-gap'
    gap.style.setProperty('--gap-mb', '509px')
    gap.style.setProperty('--gap-mt', '96px')
    gap.style.setProperty('--gap-page-x', '0px')
    gap.style.setProperty('--gap-page-w', '1056px')
    paper.append(gap)
    wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1056, height: 1718 }) as DOMRect
    paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1056 }) as DOMRect
    gap.getBoundingClientRect = () => ({ top: 613, height: 633 }) as DOMRect
    syncSectionPageSheets(
      wrap,
      session.sections,
      [
        { start: 0, end: 100, section: 0 },
        { start: 100, end: 200, section: 1 },
      ],
      true,
    )
    const sheets = Array.from(wrap.querySelectorAll<HTMLElement>('.page-sheet'))
    expect(Number.parseFloat(sheets[0]!.style.height)).toBeCloseTo(1122.53, 1)
    expect(Number.parseFloat(sheets[1]!.style.height)).toBe(816)
    expect(wrap.style.minHeight).toBe('1966px')
    wrap.remove()
  })

  it('places real two-column fixture content in both column slots', async () => {
    const path = join(
      import.meta.dirname,
      '../vendor/apps/docs/tests/pagination-corpus/docx/22-two-columns.docx',
    )
    const session = await openDocx(new Uint8Array(readFileSync(path)))
    const geoms = sectionGeoms(session.sections)
    expect(geoms[0]!.cols).toBe(2)
    const scroll = document.createElement('div')
    scroll.className = 'mimir-docx-scroll'
    const page = document.createElement('div')
    page.className = 'doc-page'
    const mount = document.createElement('div')
    page.append(mount)
    scroll.append(page)
    document.body.append(scroll)
    const editor = new Editor({
      element: mount,
      extensions: editorExtensions,
      content: session.content as never,
    })
    const paragraphs = Array.from(editor.view.dom.children) as HTMLElement[]
    expect(paragraphs.length).toBeGreaterThan(20)
    // happy-dom has no text layout; fixed block boxes exercise the real fixture's
    // ProseMirror nodes, F2 column ranges and node-decoration paint channel.
    const blocks: BlockBox[] = paragraphs.map((el, index) => ({
      el,
      top: index * 80,
      height: 80,
      section: 0,
    }))
    const slices = sliceWithLineSplit(blocks, geoms, blocks.length * 80, 1)
    expect(slices[0]!.regions?.[0]?.columns).toHaveLength(2)
    const placements = liveColumnPlacements(blocks, slices, session.sections, geoms)
    expect(placements.some((placement) => placement.dx > 100)).toBe(true)
    expect(placements.every((placement) => (placement.widthPx ?? 0) < 310)).toBe(true)
    setColumnLayout(editor.view, placements)
    const decorated = Array.from(
      editor.view.dom.querySelectorAll<HTMLElement>(':scope > .doc-col-block'),
    )
    const xPositions = new Set(
      decorated.map((el) => Number.parseFloat(el.style.getPropertyValue('--col-dx'))),
    )
    expect(xPositions.size).toBeGreaterThanOrEqual(2)
    const css = readFileSync(join(import.meta.dirname, 'editors/editors.css'), 'utf8')
    const rule = css.match(
      /\.mimir-docx-scroll \.doc-page:not\(\.measuring-columns\) \.doc-col-block\s*\{[^}]+\}/,
    )?.[0]
    expect(rule).toContain('transform: translate(')
    const stylesheet = document.createElement('style')
    stylesheet.textContent = rule ?? ''
    document.head.append(stylesheet)
    const rightColumn = decorated.find(
      (el) => Number.parseFloat(el.style.getPropertyValue('--col-dx')) > 100,
    )!
    expect(getComputedStyle(rightColumn).transform).toContain('translate(')
    editor.destroy()
    stylesheet.remove()
    scroll.remove()
  })

  it('places a narrow next section in the middle of the shared paper', () => {
    const sections = [section(0, 4500, 450), section(1, 4500, 300)]
    sections[0]!.settings.pageWidth = 12000
    sections[1]!.settings.pageWidth = 9000
    const geoms = sectionGeoms(sections)
    const metrics = gapMetricsForSection(
      { start: 0, end: 100, section: 0 },
      { start: 100, end: 200, section: 1 },
      sections,
      geoms,
      0,
    )
    expect(metrics.pageWidth).toBe(600)
    expect(metrics.pageLeft).toBe(100)
    expect(metrics.sectionMarginLeft).toBe(20)
    expect(sectionTextLeftOffset(sections, 1)).toBe(90)
    const gap = makeGapEl(metrics, 'block')
    expect(gap.style.getPropertyValue('--gap-page-x')).toBe('100px')
    expect(gap.style.getPropertyValue('--gap-page-w')).toBe('600px')
  })

  it('combines section offset with per-column position and wrap width', () => {
    const sections = [section(0, 4500, 450), section(2, 4500, 300)]
    sections[1]!.settings.columns = 2
    const geoms = sectionGeoms(sections)
    const elements = [document.createElement('p'), document.createElement('p')]
    const blocks: BlockBox[] = elements.map((el, index) => ({
      el,
      top: 100 + index * 100,
      height: 100,
      section: 1,
    }))
    const slices = [
      {
        start: 100,
        end: 300,
        section: 1,
        regions: [
          {
            top: 0,
            height: 100,
            section: 1,
            columns: [
              { start: 100, end: 200 },
              { start: 200, end: 300 },
            ],
          },
        ],
      },
    ]
    const placements = liveColumnPlacements(blocks, slices, sections, geoms)
    expect(placements).toHaveLength(2)
    expect(placements[0]!.widthPx).toBeLessThan(geoms[1]!.contentWidth!)
    expect(placements[1]!.dx).toBeGreaterThan(placements[0]!.dx)
    expect(placements[1]!.dy).toBe(-100)
    expect(pageColumnPullUp({ ...slices[0]!, physHeight: 100 })).toBe(100)
  })
})
