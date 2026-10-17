// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor, type JSONContent } from '@tiptap/core'
import { CellSelection, TableMap, columnResizingPluginKey } from '@tiptap/pm/tables'
import { afterEach, expect, it } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { splitXmlChildren } from '../../vendor/packages/docx-engine/src/generate.js'
import { openDocx } from '../docx.js'
import {
  applyDocxTableDesign,
  DocxTableDesignExtension,
  selectedDocxTable,
  tableDesignDraft,
} from './docx-table-design.js'
import { docxTableConditionCss } from './DocxTableDesignPreview.js'
import { docxTableColumnBands } from '../docx-table-bands.js'
import { resolveThemeColor } from '../../vendor/packages/docx-engine/src/theme.js'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)
export async function tableFixture(merged = false) {
  const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
  const style =
    '<w:style w:type="table" w:styleId="MimirConditional"><w:name w:val="条件样式"/><w:tblStylePr w:type="firstRow"><w:tcPr><w:shd w:fill="112233"/></w:tcPr><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr></w:tblStylePr><w:tblStylePr w:type="lastRow"><w:tcPr><w:shd w:fill="DDDDDD"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="firstCol"><w:tcPr><w:shd w:fill="FFFFAA"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="lastCol"><w:tcPr><w:shd w:fill="AAFFFF"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:fill="DDEEFF"/></w:tcPr></w:tblStylePr></w:style>'
  zip.file(
    'word/styles.xml',
    (await zip.file('word/styles.xml')!.async('string')).replace(
      '</w:styles>',
      `${style.replace('<w:name w:val="条件样式"/>', '<w:name w:val="条件样式"/><w:basedOn w:val="MimirBandBase"/>')}<w:style w:type="table" w:styleId="MimirBandBase"><w:tblPr><w:tblStyleColBandSize w:val="2"/></w:tblPr><w:tblStylePr w:type="band1Vert"><w:tcPr><w:shd w:themeFill="accent1" w:themeFillTint="99" w:fill="BADBAD"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="band2Vert"><w:tcPr><w:shd w:fill="88AA66"/></w:tcPr></w:tblStylePr></w:style></w:styles>`,
    ),
  )
  const table =
    '<w:tbl><w:tblPr><w:tblStyle w:val="MimirConditional"/><w:tblW w:w="6000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/><w:tblCaption w:val="KEEP-CAPTION"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>' +
    [0, 1, 2]
      .map(
        (ri) =>
          '<w:tr>' +
          [0, 1, 2]
            .map(
              (ci) =>
                `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>${merged && ci === 0 && ri < 2 ? (ri === 0 ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : ''}${ri === 1 && ci === 1 ? '<w:shd w:val="clear" w:fill="CC00CC"/>' : ''}<w:tcBorders><w:top w:val="single" w:sz="4" w:color="123456" w:space="2" w:shadow="1"/><w:tl2br w:val="dotted" w:sz="4" w:color="998877"/></w:tcBorders><w:noWrap/></w:tcPr><w:p w:rsidR="00ABCDEF"><w:r><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t>${ri},${ci}</w:t></w:r></w:p></w:tc>`,
            )
            .join('') +
          '</w:tr>',
      )
      .join('') +
    '</w:tbl>'
  const xml = await zip.file('word/document.xml')!.async('string')
  zip.file('word/document.xml', xml.replace(/(<w:body[^>]*>)/, `$1${table}`))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
async function boot(merged = false) {
  const bytes = await tableFixture(merged)
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [...editorExtensions, DocxTableDesignExtension],
    content: session.content as never,
  })
  editors.push(editor)
  editor.commands.setTextSelection(3)
  const target = selectedDocxTable(editor)!
  expect(target).not.toBeNull()
  return { bytes, session, editor, target }
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((item) => !item.dir)
        .map(async (entry) => [entry.name, await entry.async('uint8array')]),
    ),
  )
}
async function documentXml(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
}
function firstTable(xml: string) {
  const body = xml.slice(
    xml.indexOf('<w:body') + xml.slice(xml.indexOf('<w:body')).indexOf('>') + 1,
    xml.lastIndexOf('</w:body>'),
  )
  return splitXmlChildren(body).find((child) => child.name === 'w:tbl')!.xml
}
const cells = (tableXml: string) => tableXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!

it('look and margins remain native properties, preserve all cells and other ZIP entries, two saves and undo/redo', async () => {
  const { bytes, session, editor, target } = await boot()
  const draft = tableDesignDraft(target)
  draft.look = {
    firstRow: false,
    lastRow: true,
    firstColumn: false,
    lastColumn: true,
    bandedRows: false,
    bandedColumns: true,
  }
  draft.margins = { top: 40, bottom: 60, left: 80, right: 100 }
  draft.align = 'center'
  applyDocxTableDesign(editor, target, draft, null, null)
  const first = await session.save(editor.getJSON() as never)
  const originalXml = firstTable(await documentXml(bytes)),
    savedXml = firstTable(await documentXml(first))
  expect(savedXml.slice(savedXml.indexOf('</w:tblPr>') + 10)).toBe(
    originalXml.slice(originalXml.indexOf('</w:tblPr>') + 10),
  )
  expect(savedXml).toContain('KEEP-CAPTION')
  const parsed = await openDocx(first)
  expect(parsed.blocks.find((block) => block.type === 'table')?.table).toMatchObject({
    tableLook: draft.look,
    cellMarTwips: draft.margins,
    align: 'center',
  })
  const originalEntries = await entries(bytes),
    savedEntries = await entries(first)
  for (const name of Object.keys(originalEntries).filter((key) => key !== 'word/document.xml'))
    expect(savedEntries[name]).toEqual(originalEntries[name])
  expect(await entries(await session.save(editor.getJSON() as never))).toEqual(savedEntries)
  editor.commands.undo()
  expect(await entries(await session.save(editor.getJSON() as never))).toEqual(originalEntries)
  editor.commands.redo()
  expect(await entries(await session.save(editor.getJSON() as never))).toEqual(savedEntries)
})
it('preset modifies only cell formatting and retains paragraph XML, raw cell properties and merged continuations', async () => {
  const { session, editor, target, bytes } = await boot(true)
  applyDocxTableDesign(editor, target, tableDesignDraft(target), 'blue-banded', null)
  const saved = await session.save(editor.getJSON() as never)
  const source = firstTable(await documentXml(bytes)),
    result = firstTable(await documentXml(saved))
  expect(result.match(/<w:p\b[\s\S]*?<\/w:p>/g)).toEqual(source.match(/<w:p\b[\s\S]*?<\/w:p>/g))
  expect(result.match(/<w:noWrap\/>/g)).toHaveLength(9)
  expect(result).toContain('<w:vMerge/>')
  const opened = await openDocx(saved)
  const model = opened.blocks.find((block) => block.type === 'table')!.table!
  expect(model.tblStyleId).toBeUndefined()
  expect(model.rows[0]![0]!.fill).toBe('BDD7EE')
  expect(model.rows[1]![1]!.fill).toBe('DDEBF7')
  expect(await entries(await session.save(editor.getJSON() as never))).toEqual(await entries(saved))
})
it('targets selected cells for inside/outer border operations and preserves untouched cell XML', async () => {
  const { session, editor, bytes } = await boot()
  const table = editor.state.doc.firstChild!
  const map = TableMap.get(table)
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(editor.state.doc, 1 + map.map[0]!, 1 + map.map[4]!),
    ),
  )
  const target = selectedDocxTable(editor)!
  applyDocxTableDesign(editor, target, tableDesignDraft(target), null, {
    scope: 'selection',
    mode: 'inside',
    line: { style: 'double', szEighths: 12, color: '008800' },
  })
  const result = firstTable(await documentXml(await session.save(editor.getJSON() as never)))
  const source = firstTable(await documentXml(bytes))
  expect(result).toContain('w:val="double" w:sz="12" w:color="008800"')
  expect(cells(result)[2]).toBe(cells(source)[2])
  expect(cells(result)[8]).toBe(cells(source)[8])
  expect(cells(result)[0]).toContain(
    '<w:top w:val="single" w:sz="4" w:color="123456" w:space="2" w:shadow="1"/>',
  )
  expect(result.match(/<w:tl2br[^>]*\/>/g)).toEqual(source.match(/<w:tl2br[^>]*\/>/g))
  expect(result.slice(0, result.indexOf('</w:tblPr>') + 10)).toBe(
    source.slice(0, source.indexOf('</w:tblPr>') + 10),
  )
})
it('rejects stale targets atomically and no-op adds no history', async () => {
  const { editor, target } = await boot()
  const doc = editor.state.doc
  expect(applyDocxTableDesign(editor, target, tableDesignDraft(target), null, null)).toBe(target)
  expect(editor.state.doc).toBe(doc)
  editor.commands.insertContent('changed')
  const current = editor.state.doc
  expect(() =>
    applyDocxTableDesign(editor, target, tableDesignDraft(target), 'grid', null),
  ).toThrow('文档已变化')
  expect(editor.state.doc).toBe(current)
})
it('condition preview honors row/column switches, keeps direct shading, and is view-only', async () => {
  const { session, editor, target } = await boot()
  const before = JSON.stringify(editor.getJSON())
  const css = docxTableConditionCss(
    editor.getJSON() as never,
    session,
    session.footnotes.parsed.styles,
  )
  expect(css).toContain('background:#112233')
  expect(css).toContain('background:#CC00CC')
  const draft = tableDesignDraft(target)
  draft.look.firstRow = false
  draft.look.firstColumn = false
  draft.look.bandedRows = false
  applyDocxTableDesign(editor, target, draft, null, null)
  const next = docxTableConditionCss(
    editor.getJSON() as never,
    session,
    session.footnotes.parsed.styles,
  )
  expect(next).not.toContain('background:#112233')
  expect(next).not.toContain('background:#DDEEFF')
  expect(next).toContain('background:#CC00CC')
  editor.commands.undo()
  expect(JSON.stringify(editor.getJSON())).toBe(before)
})

it('inherits native vertical bands with theme tint and honors merged columns and repeated header rows', async () => {
  const { session, editor, target } = await boot(true)
  const bands = await docxTableColumnBands(session)
  const expected = resolveThemeColor('accent1', session.footnotes.parsed.themeColors ?? {}, '99')!
  expect(bands.get('MimirConditional')).toEqual({ first: expected, second: '88AA66', size: 2 })
  const draft = tableDesignDraft(target)
  draft.look = {
    firstRow: false,
    lastRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: false,
    bandedColumns: true,
  }
  applyDocxTableDesign(editor, target, draft, null, null)
  const doc = editor.getJSON() as JSONContent
  const css = docxTableConditionCss(doc as never, session, session.footnotes.parsed.styles, bands)
  // Row 2's omitted vMerge continuation occupies column 1; its second PM cell is column 3.
  expect(css).toContain(`tr:nth-child(2) > :is(td, th):nth-child(2) { background:#88AA66`)
  expect(css).toContain(`tr:nth-child(3) > :is(td, th):nth-child(1) { background:#${expected}`)
  const reopened = await openDocx(await session.save(doc as never))
  expect(reopened.blocks.find((b) => b.type === 'table')!.table!.tableLook).toEqual(draft.look)
  const readCss = docxTableConditionCss(
    reopened.content,
    reopened,
    reopened.footnotes.parsed.styles,
    await docxTableColumnBands(reopened),
  )
  expect(readCss).toContain(`tr:nth-child(2) > :is(td, th):nth-child(2) { background:#88AA66`)
  const table = doc.content![0]!
  table.attrs!.tblLook.firstRow = true
  table.content![0]!.attrs!.repeatHeader = true
  table.content![1]!.attrs!.repeatHeader = true
  expect(
    docxTableConditionCss(doc as never, session, session.footnotes.parsed.styles, bands),
  ).toContain('tr:nth-child(2) > :is(td, th):nth-child(2) { background:#112233')
})

it('AutoFit contents/window/fixed remains native across two saves without rewriting cell paragraphs', async () => {
  const { session, editor, bytes } = await boot()
  const originalParagraphs = firstTable(await documentXml(bytes)).match(/<w:p\b[\s\S]*?<\/w:p>/g)
  for (const mode of ['contents', 'window', 'fixed'] as const) {
    const target = selectedDocxTable(editor)!
    const draft = { ...tableDesignDraft(target), autoFit: mode }
    // Browsers provide layout measurements; use a deterministic actual table width in happy-dom.
    if (mode === 'fixed') {
      const table = editor.view.nodeDOM(target.pos) as HTMLElement
      table.getBoundingClientRect = () => ({ width: 400 }) as DOMRect
    }
    applyDocxTableDesign(editor, target, draft, null, null)
    const saved = await session.save(editor.getJSON() as never)
    const result = firstTable(await documentXml(saved))
    expect(result.match(/<w:p\b[\s\S]*?<\/w:p>/g)).toEqual(originalParagraphs)
    expect(result).toContain(`<w:tblLayout w:type="${mode === 'fixed' ? 'fixed' : 'autofit'}"/>`)
    const expectedWidth = {
      contents: '<w:tblW w:w="0" w:type="auto"/>',
      window: '<w:tblW w:w="5000" w:type="pct"/>',
      fixed: '<w:tblW w:w="6000" w:type="dxa"/>',
    }
    expect(result).toContain(expectedWidth[mode])
    // Window mode uses the native default printable grid after contents cleared widths.
    expect(result).toContain(`<w:gridCol w:w="${mode === 'window' ? 3120 : 2000}"/>`)
    const opened = await openDocx(saved)
    expect(
      tableDesignDraft({ ...target, node: editor.schema.nodeFromJSON(opened.content.content![0]!) })
        .autoFit,
    ).toBe(mode)
    expect(await entries(await session.save(editor.getJSON() as never))).toEqual(
      await entries(saved),
    )
  }
})

it('saves the live drag grid and fixed total width while retaining native table XML and exact undo/redo', async () => {
  const { bytes, session, editor, target } = await boot()
  const beforeXml = firstTable(await documentXml(bytes))
  editor.view.dispatch(
    editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: target.pos + 2 }),
  )
  editor.view.dom
    .querySelector('td')!
    .dispatchEvent(
      new MouseEvent('mousedown', { clientX: 200, buttons: 1, bubbles: true, cancelable: true }),
    )
  const move = new MouseEvent('mousemove', { clientX: 240, buttons: 1, bubbles: true })
  Object.defineProperty(move, 'which', { value: 1 })
  window.dispatchEvent(move)
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 240, bubbles: true }))
  const table = editor.state.doc.nodeAt(target.pos)!,
    widths = Array.from({ length: table.firstChild!.childCount }, (_, i) =>
      Math.round(Number(table.firstChild!.child(i).attrs.colwidth[0]) * 15),
    )
  const saved = await session.save(editor.getJSON() as never),
    afterXml = firstTable(await documentXml(saved))
  expect(afterXml).toContain(
    `<w:tblW w:w="${widths.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/>`,
  )
  for (const width of widths) expect(afterXml).toContain(`<w:gridCol w:w="${width}"/>`)
  expect(afterXml.match(/<w:p\b[\s\S]*?<\/w:p>/g)).toEqual(
    beforeXml.match(/<w:p\b[\s\S]*?<\/w:p>/g),
  )
  expect(afterXml).toContain('<w:tblCaption w:val="KEEP-CAPTION"/>')
  expect(afterXml).toContain('<w:tblLayout w:type="fixed"/>')
  expect(afterXml.match(/<w:tl2br\b[^>]*\/>/g)).toEqual(beforeXml.match(/<w:tl2br\b[^>]*\/>/g))
  const originalEntries = await entries(bytes),
    savedEntries = await entries(saved)
  for (const name of Object.keys(originalEntries).filter((entry) => entry !== 'word/document.xml'))
    expect(savedEntries[name]).toEqual(originalEntries[name])
  expect(await entries(await session.save(editor.getJSON() as never))).toEqual(savedEntries)
  editor.commands.undo()
  expect(await entries(await session.save(editor.getJSON() as never))).toEqual(originalEntries)
  editor.commands.redo()
  expect(await entries(await session.save(editor.getJSON() as never))).toEqual(savedEntries)
})
