// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, expect, it } from 'vitest'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { sectionGeoms } from '../vendor/apps/docs/src/renderer/pagination-sections.js'
import type { BlockBox } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import type { SectionInfo } from '../vendor/packages/docx-engine/src/types.js'
import { liveColumnPlacements } from './pagination-geometry.js'
import { setLiveColumnLayout } from './docx-floating-table-layout.js'
import { openDocx } from './docx.js'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

function sectionXml(width: number): string {
  return `<w:sectPr><w:pgSz w:w="${width}" w:h="15840"/><w:pgMar w:left="1440" w:right="1440" w:top="1440" w:bottom="1440"/></w:sectPr>`
}

function sections(): SectionInfo[] {
  return [12240, 15840].map((pageWidth, index) => ({
    firstBlockIndex: index * 2,
    lastBlockIndex: index * 2 + 1,
    startType: 'nextPage',
    settings: {
      pageWidth,
      pageHeight: 15840,
      marginLeft: 1440,
      marginRight: 1440,
      marginTop: 1440,
      marginBottom: 1440,
    },
    sectPrXml: '',
    titlePg: false,
    headerRefs: {},
    footerRefs: {},
  })) as SectionInfo[]
}

function boot(side: 'left' | 'right' = 'left', attrs: Record<string, unknown> = {}) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [0, 1].flatMap((index) => [
        {
          type: 'docTable',
          attrs: { widthPx: 399, tblFloat: side, tblFloatXTwips: 0, ...attrs },
          content: [
            {
              type: 'docTableRow',
              content: [
                {
                  type: 'docTableCell',
                  content: [
                    { type: 'docParagraph', content: [{ type: 'text', text: `table${index}` }] },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'docParagraph', content: [{ type: 'text', text: `wrapping paragraph${index}` }] },
      ]),
    },
  })
  editors.push(editor)
  const blocks: BlockBox[] = Array.from(editor.view.dom.children).map((el, index) => ({
    el: el as HTMLElement,
    section: Math.floor(index / 2),
    top: Math.floor(index / 2) * 200,
    height: 100,
    floated: index % 2 === 0,
    floatTable: index % 2 === 0 ? true : undefined,
  }))
  return { editor, blocks }
}

it('gives floating tables the same section content origin as their wrapping paragraphs', () => {
  const { blocks } = boot()
  const sourceSections = sections()
  const placements = liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections))
  const narrowTable = placements.find((spec) => spec.el === blocks[0]!.el)
  const narrowParagraph = placements.find((spec) => spec.el === blocks[1]!.el)!
  expect(narrowTable).toMatchObject({
    pageDx: 120,
    dx: 0,
    contentWPx: 624,
    marginLeftPx: 96,
    marginRightPx: 96,
  })
  expect(narrowTable?.pageDx).toBe(narrowParagraph.pageDx)
  expect(placements.find((spec) => spec.el === blocks[2]!.el)).toMatchObject({
    pageDx: 0,
    contentWPx: 864,
  })
  expect(narrowTable?.widthPx).toBeUndefined()
})

it.each(['page', 'margin', 'text'])(
  'preserves %s anchors, signed coordinates, asymmetric gaps and paginator Y while decorating both sections',
  (anchor) => {
    const { editor, blocks } = boot('right', {
      tblFloatXTwips: -345,
      tblFloatYTwips: -765,
      tblFloatHorzAnchor: anchor,
      tblFloatVertAnchor: anchor,
      tblFloatDistance: { top: 31, right: 57, bottom: 113, left: 229 },
    })
    const before = editor.getJSON()
    const doc = editor.state.doc
    const sourceSections = sections()
    const table = blocks[0]!.el!
    const originalMargin = table.style.marginRight
    table.style.setProperty('--tblp-dy', '72px')
    setLiveColumnLayout(
      editor.view,
      liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections)),
    )
    expect(table.classList.contains('doc-col-block')).toBe(true)
    expect(table.style.getPropertyValue('--page-cx')).toBe('120px')
    expect(table.style.getPropertyValue('--doc-content-w')).toBe('624px')
    expect(table.style.getPropertyValue('--doc-margin-left')).toBe('96px')
    expect(table.classList.contains('mimir-docx-section-float-right')).toBe(true)
    expect(table.style.getPropertyValue('--mimir-tbl-margin-right')).toBe(originalMargin || '0px')
    expect(table.style.marginRight).toBe(originalMargin)
    expect(table.style.getPropertyValue('--tblp-dy')).toBe('72px')
    expect(editor.state.doc).toBe(doc)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.can().undo()).toBe(false)
    expect(blocks[0]!.floated).toBe(true)
    // Repeated pagination must not compound the section margin.
    setLiveColumnLayout(
      editor.view,
      liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections)),
    )
    expect(table.style.getPropertyValue('--mimir-tbl-margin-right')).toBe(originalMargin || '0px')
    setLiveColumnLayout(editor.view, [])
    expect(table.classList.contains('mimir-docx-section-float-right')).toBe(false)
    expect(table.classList.contains('doc-col-block')).toBe(false)
    expect(table.style.getPropertyValue('--mimir-tbl-margin-right')).toBe('')
    expect(table.style.getPropertyValue('--tblp-dy')).toBe('72px')
  },
)

it.each(['center', 'right', 'outside', 'left', 'inside'])(
  'keeps the original %s keyword positioning expression and table width',
  (keyword) => {
    const { editor, blocks } = boot(
      keyword === 'right' || keyword === 'outside' ? 'right' : 'left',
      {
        tblFloatXSpec: keyword,
        tblFloatYSpec: 'bottom',
        tblFloatHorzAnchor: 'page',
        tblFloatVertAnchor: 'margin',
      },
    )
    const sourceSections = sections()
    const table = blocks[0]!.el!
    const original = {
      left: table.style.marginLeft,
      right: table.style.marginRight,
      width: table.style.width,
    }
    setLiveColumnLayout(
      editor.view,
      liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections)),
    )
    expect({
      left: table.style.marginLeft,
      right: table.style.marginRight,
      width: table.style.width,
    }).toEqual(original)
    expect(table.style.getPropertyValue('--col-w')).toBe('')
    expect(editor.state.doc.firstChild!.attrs).toMatchObject({
      tblFloatXSpec: keyword,
      tblFloatYSpec: 'bottom',
    })
  },
)

it('retains a real right gap and removes compensation when a floated table returns to inline', () => {
  const { editor, blocks } = boot('right')
  const sourceSections = sections()
  const table = blocks[0]!.el!
  table.style.marginRight = '17.5px'
  setLiveColumnLayout(
    editor.view,
    liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections)),
  )
  expect(table.style.getPropertyValue('--mimir-tbl-margin-right')).toBe('17.5px')
  table.classList.remove('doc-table-float-right')
  blocks[0]!.floated = false
  delete blocks[0]!.floatTable
  setLiveColumnLayout(
    editor.view,
    liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections)),
  )
  expect(table.style.getPropertyValue('--mimir-tbl-margin-right')).toBe('')
  expect(table.classList.contains('mimir-docx-section-float-right')).toBe(false)
  expect(table.classList.contains('doc-col-block')).toBe(true)
  expect(table.style.marginRight).toBe('17.5px')
})

it('uses independent margin offsets and each physical page width for three sections', () => {
  const { blocks } = boot()
  const sourceSections = sections()
  sourceSections[1]!.settings.marginLeft = 1080
  sourceSections[1]!.settings.marginRight = 1800
  sourceSections.push({
    ...sourceSections[1]!,
    settings: {
      ...sourceSections[1]!.settings,
      pageWidth: 18000,
      marginLeft: 1800,
      marginRight: 1800,
    },
  })
  const third = document.createElement('table')
  third.className = 'doc-table doc-table-float-left'
  blocks.push({ el: third, section: 2, top: 400, height: 100, floated: true, floatTable: true })
  const placements = liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections))
  expect(placements.find(({ el }) => el === blocks[0]!.el)).toMatchObject({
    pageDx: 192,
    dx: 0,
    contentWPx: 624,
  })
  expect(placements.find(({ el }) => el === blocks[2]!.el)).toMatchObject({
    pageDx: 72,
    dx: -24,
    contentWPx: 864,
    marginLeftPx: 72,
    marginRightPx: 120,
  })
  expect(placements.find(({ el }) => el === third)).toMatchObject({
    pageDx: 0,
    dx: 24,
    contentWPx: 960,
  })
})

it('keeps suppressed and paginator-flowed tall tables in normal section layout', () => {
  const { editor, blocks } = boot('right', { tblFloatSuppressed: true })
  const sourceSections = sections()
  blocks[0]!.floated = false
  delete blocks[0]!.floatTable
  const placements = liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections))
  setLiveColumnLayout(editor.view, placements)
  const suppressed = blocks[0]!.el!
  expect(suppressed.classList.contains('doc-col-block')).toBe(true)
  expect(suppressed.classList.contains('mimir-docx-section-float-right')).toBe(false)
  expect(suppressed.style.getPropertyValue('--page-cx')).toBe('120px')
  // Engine-flowed floats keep their own explicit marker; our CSS excludes it.
  const { editor: flowedEditor, blocks: flowedBlocks } = boot('right')
  flowedBlocks[0]!.floated = false
  flowedBlocks[0]!.floatFlowed = true
  flowedBlocks[0]!.el!.classList.add('doc-table-float-flow')
  setLiveColumnLayout(
    flowedEditor.view,
    liveColumnPlacements(flowedBlocks, [], sourceSections, sectionGeoms(sourceSections)),
  )
  expect(flowedBlocks[0]!.el!.classList.contains('doc-table-float-flow')).toBe(true)
  const css = readFileSync(join(import.meta.dirname, 'editors/editors.css'), 'utf8')
  expect(css).toContain('.mimir-docx-section-float-right:not(.doc-table-float-flow)')
  expect(css).toContain(
    'max(0px, 100% - var(--doc-content-w, 100%)) + var(--mimir-tbl-margin-right, 0px)',
  )
})

it('does not persist layout decorations into native positioning or dirty/history', async () => {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(
        import.meta.dirname,
        '../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
      ),
    ),
  )
  const xml = await zip.file('word/document.xml')!.async('string')
  const properties =
    '<w:tblpPr w:horzAnchor="page" w:vertAnchor="text" w:tblpX="-345" w:tblpY="-765" w:leftFromText="31" w:rightFromText="57" w:topFromText="113" w:bottomFromText="229"/><w:tblOverlap w:val="never"/>'
  const table = `<w:tbl><w:tblPr>${properties}<w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>native table</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
  zip.file(
    'word/document.xml',
    xml.replace(
      /<w:body[\s\S]*<\/w:body>/,
      `<w:body>${table}<w:p><w:pPr>${sectionXml(12240)}</w:pPr><w:r><w:t>narrow</w:t></w:r></w:p>${table}${sectionXml(15840)}</w:body>`,
    ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
  editors.push(editor)
  const before = editor.getJSON()
  const blocks: BlockBox[] = Array.from(editor.view.dom.children).map((el, index) => ({
    el: el as HTMLElement,
    top: index * 100,
    height: 100,
    section: index < 2 ? 0 : 1,
    floated: el.classList.contains('doc-table-float-left'),
    floatTable: el.classList.contains('doc-table-float-left') ? true : undefined,
  }))
  setLiveColumnLayout(
    editor.view,
    liveColumnPlacements(blocks, [], session.sections, sectionGeoms(session.sections)),
  )
  expect(blocks[0]!.el!.style.getPropertyValue('--page-cx')).toBe('120px')
  expect(editor.getJSON()).toEqual(before)
  expect(await session.save(editor.getJSON() as never)).toEqual(bytes)
  expect(editor.can().undo()).toBe(false)
})

it('keeps read-only documents unchanged after the DOM observer consumes layout mutations', async () => {
  const { editor, blocks } = boot('right')
  editor.setEditable(false)
  const sourceSections = sections()
  const originalDoc = editor.state.doc
  const originalJson = editor.getJSON()
  const changes: boolean[] = []
  editor.on('transaction', ({ transaction }) => changes.push(transaction.docChanged))
  const placements = liveColumnPlacements(blocks, [], sourceSections, sectionGeoms(sourceSections))
  setLiveColumnLayout(editor.view, placements)
  expect(blocks[0]!.el!.classList.contains('mimir-docx-section-float-right')).toBe(true)
  // Layout dispatches metadata transactions; its direct DOM patches must not
  // become delayed editable-document transactions when the observer resumes.
  await new Promise((resolve) => setTimeout(resolve, 0))
  ;(editor.view as unknown as { domObserver: { flush(): void } }).domObserver.flush()
  expect(editor.state.doc).toBe(originalDoc)
  expect(editor.getJSON()).toEqual(originalJson)
  expect(changes).not.toContain(true)
  expect(editor.can().undo()).toBe(false)

  setLiveColumnLayout(editor.view, [])
  await new Promise((resolve) => setTimeout(resolve, 0))
  ;(editor.view as unknown as { domObserver: { flush(): void } }).domObserver.flush()
  expect(blocks[0]!.el!.classList.contains('mimir-docx-section-float-right')).toBe(false)
  expect(blocks[0]!.el!.style.getPropertyValue('--mimir-tbl-margin-right')).toBe('')
  expect(editor.state.doc).toBe(originalDoc)
  expect(changes).not.toContain(true)
  expect(editor.isEditable).toBe(false)
})
