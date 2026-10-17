// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { CellSelection } from '@tiptap/pm/tables'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import JSZip from 'jszip'
import { afterEach, expect, it } from 'vitest'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx, type PmDocJson } from '../docx.js'
import {
  applyDocxCase,
  docxCaseTarget,
  DocxCaseExtension,
  nextCaseMode,
  transformCase,
} from './docx-case.js'
const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
function boot(
  content: PmDocJson = {
    type: 'doc',
    content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'HELLO WORLD' }] }],
  },
) {
  const editor = new Editor({ extensions: [...editorExtensions, DocxCaseExtension], content })
  editors.push(editor)
  let first = -1,
    last = -1
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    if (first === -1) first = pos
    last = pos + node.nodeSize
  })
  if (first !== -1) editor.commands.setTextSelection({ from: first, to: last })
  return editor
}
function range(editor: Editor, anchor: number, head: number) {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, anchor, head)),
  )
}
function apply(editor: Editor, mode: 'lower' | 'upper' | 'title' | 'sentence') {
  return applyDocxCase(editor, docxCaseTarget(editor), mode)
}
function shortcut(editor: Editor) {
  const event = new KeyboardEvent('keydown', {
    key: 'F3',
    code: 'F3',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })
  editor.view.dom.dispatchEvent(event)
  return event
}

it('matches fixed upstream four modes and adds Chinese fullwidth sentence boundaries', () => {
  expect(transformCase('hELLO wORLD. nEXT! yes? okay。nEXT！hello？again', 'sentence')).toBe(
    'Hello world. Next! Yes? Okay。Next！Hello？Again',
  )
  expect(transformCase("O'NEIL FOO-BAR\tÉLAN\nWORD", 'title')).toBe("O'neil Foo-bar\tÉlan\nWord")
  expect(transformCase('Straße İ ΟΣ 😀 e\u0301', 'upper')).toBe('STRASSE İ ΟΣ 😀 E\u0301')
  expect(transformCase('ΟΣ İ', 'lower')).toBe('ος i\u0307')
  expect(nextCaseMode('hello world')).toBe('upper')
  expect(nextCaseMode('HELLO WORLD')).toBe('title')
  expect(nextCaseMode('Hello World')).toBe('lower')
  expect(nextCaseMode('中文123')).toBe('upper')
})

it.each(['title', 'sentence'] as const)(
  'keeps words and sentence starts consistent across marks for %s',
  (mode) => {
    const editor = boot({
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          content: [
            { type: 'text', text: 'HEL', marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: 'LO WO',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
            { type: 'text', text: 'RLD. N', marks: [{ type: 'comment', attrs: { ids: '7' } }] },
            { type: 'text', text: 'EXT', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    })
    const before = editor.state.doc.child(0)
    let changes = 0
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) changes++
    })
    apply(editor, mode)
    expect(editor.state.doc.textContent).toBe(
      mode === 'title' ? 'Hello World. Next' : 'Hello world. Next',
    )
    expect(changes).toBe(1)
    editor.state.doc
      .child(0)
      .forEach((node, _offset, index) => expect(node.marks).toEqual(before.child(index).marks))
    editor.commands.undo()
    expect(editor.state.doc.child(0)).toEqual(before)
    editor.commands.redo()
    expect(editor.state.doc.textContent).toContain('Hello')
  },
)

it('converts a partial run only and preserves reverse selection through Unicode growth', () => {
  const editor = boot({
    type: 'doc',
    content: [
      {
        type: 'docParagraph',
        content: [{ type: 'text', text: 'xxßİ😀e\u0301zz', marks: [{ type: 'bold' }] }],
      },
    ],
  })
  range(editor, 10, 3)
  apply(editor, 'upper')
  expect(editor.state.doc.textContent).toBe('xxSSİ😀E\u0301Zz')
  expect(editor.state.selection).toMatchObject({ anchor: 11, head: 3 })
  expect(editor.state.doc.child(0).childCount).toBe(1)
})

it('uses complete Unicode context across runs, assigning expansions to the source format', () => {
  const editor = boot({
    type: 'doc',
    content: [
      {
        type: 'docParagraph',
        content: [
          { type: 'text', text: 'Ο', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'Σ İ', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' ß', marks: [{ type: 'underline' }] },
        ],
      },
    ],
  })
  apply(editor, 'lower')
  expect(editor.state.doc.textContent).toBe('ος i\u0307 ß')
  expect(editor.state.doc.child(0).child(1).text).toBe('ς i\u0307')
  apply(editor, 'upper')
  expect(editor.state.doc.child(0).child(2).text).toBe(' SS')
  expect(editor.state.doc.child(0).child(2).marks[0]!.type.name).toBe('underline')
})

it('preserves paragraph, list, table and soft-break boundaries with a single undo', () => {
  const editor = boot({
    type: 'doc',
    content: [
      {
        type: 'docListItem',
        attrs: { kind: 'ordered', numId: '17', ilvl: 2 },
        content: [
          { type: 'text', text: 'FIRST' },
          { type: 'hardBreak' },
          { type: 'text', text: 'SECOND' },
        ],
      },
      {
        type: 'docTable',
        content: [
          {
            type: 'docTableRow',
            content: [
              {
                type: 'docTableCell',
                content: [
                  { type: 'docParagraph', content: [{ type: 'text', text: 'THIRD WORD' }] },
                ],
              },
            ],
          },
        ],
      },
      { type: 'docParagraph', content: [{ type: 'text', text: 'FOURTH' }] },
    ],
  })
  const original = editor.state.doc
  expect(docxCaseTarget(editor).text).toBe('FIRST\nSECOND\nTHIRD WORD\nFOURTH')
  apply(editor, 'title')
  expect(editor.state.doc.child(0).attrs).toEqual(original.child(0).attrs)
  expect(editor.state.doc.textContent).toBe('FirstSecondThird WordFourth')
  editor.commands.undo()
  expect(editor.state.doc).toEqual(original)
})

it('no-op leaves document, dirty transaction count and undo stack unchanged', () => {
  const editor = boot({
    type: 'doc',
    content: [{ type: 'docParagraph', content: [{ type: 'text', text: '中文123 😀' }] }],
  })
  const original = editor.state.doc
  let changes = 0
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++
  })
  expect(apply(editor, 'upper').changed).toBe(false)
  expect(editor.state.doc).toBe(original)
  expect(changes).toBe(0)
  expect(editor.can().undo()).toBe(false)
})

it('freezes the original range through selection moves and rejects stale documents', () => {
  const editor = boot()
  range(editor, 1, 6)
  const target = docxCaseTarget(editor)
  range(editor, 7, 12)
  applyDocxCase(editor, target, 'lower')
  expect(editor.state.doc.textContent).toBe('hello WORLD')
  expect(editor.state.selection).toMatchObject({ from: 1, to: 6 })
  const stale = docxCaseTarget(editor)
  editor.commands.insertContent('edit')
  const current = editor.state.doc
  expect(() => applyDocxCase(editor, stale, 'upper')).toThrow('文档已变化')
  expect(editor.state.doc).toBe(current)
})

it.each(['instrField', 'refField', 'ins', 'del', 'rprChange', 'docSym', 'ctrlCheckbox'])(
  'atomically rejects selection containing %s',
  (type) => {
    const editor = boot({
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          content: [
            { type: 'text', text: 'SAFE ' },
            { type: 'text', text: 'PROTECTED', marks: [{ type }] },
            { type: 'text', text: ' SAFE' },
          ],
        },
      ],
    })
    const original = editor.state.doc
    expect(() => apply(editor, 'lower')).toThrow('受保护内容')
    expect(editor.state.doc).toBe(original)
    expect(editor.can().undo()).toBe(false)
  },
)

it.each(['sdtShell', 'blockRevision', 'moveRevision', 'pPrChange', 'paraMarkDel'])(
  'rejects protected ancestor %s even on a partial selection',
  (attr) => {
    const editor = boot({
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          attrs: { [attr]: 'protected' },
          content: [{ type: 'text', text: 'HELLO' }],
        },
      ],
    })
    range(editor, 2, 4)
    expect(() => apply(editor, 'lower')).toThrow('受保护内容')
  },
)

it('rejects hidden text, protected inline atoms, empty/Node/Cell selections and cut surrogate pairs', () => {
  const hidden = boot({
    type: 'doc',
    content: [
      {
        type: 'docParagraph',
        content: [
          {
            type: 'text',
            text: 'HELLO',
            marks: [{ type: 'docTextStyle', attrs: { vanish: true } }],
          },
        ],
      },
    ],
  })
  expect(docxCaseTarget(hidden).reason).toContain('受保护内容')
  const atom = boot({
    type: 'doc',
    content: [
      {
        type: 'docParagraph',
        content: [
          { type: 'text', text: 'HELLO' },
          { type: 'docInlineMath', attrs: { xml: '<m:oMath/>' } },
        ],
      },
    ],
  })
  range(atom, 1, 7)
  expect(docxCaseTarget(atom).reason).toContain('受保护内容')
  atom.view.dispatch(atom.state.tr.setSelection(NodeSelection.create(atom.state.doc, 6)))
  expect(docxCaseTarget(atom).reason).toContain('请先选择')
  const table = boot({
    type: 'doc',
    content: [
      {
        type: 'docTable',
        content: [
          {
            type: 'docTableRow',
            content: [
              {
                type: 'docTableCell',
                content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'HELLO' }] }],
              },
            ],
          },
        ],
      },
    ],
  })
  table.view.dispatch(table.state.tr.setSelection(CellSelection.create(table.state.doc, 2)))
  expect(docxCaseTarget(table).reason).toContain('请先选择')
  const emoji = boot({
    type: 'doc',
    content: [{ type: 'docParagraph', content: [{ type: 'text', text: '😀HELLO' }] }],
  })
  range(emoji, 2, 4)
  expect(docxCaseTarget(emoji).reason).toContain('截断')
  range(emoji, 3, 3)
  expect(docxCaseTarget(emoji).reason).toContain('请先选择')
})

it('Shift+F3 cycles the full expanded selection, keeps each operation separate and does not handle input keys', () => {
  const editor = boot({
    type: 'doc',
    content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'straße welt' }] }],
  })
  expect(shortcut(editor).defaultPrevented).toBe(true)
  expect(editor.state.doc.textContent).toBe('STRASSE WELT')
  expect(editor.state.selection.to).toBe(13)
  shortcut(editor)
  expect(editor.state.doc.textContent).toBe('Strasse Welt')
  shortcut(editor)
  expect(editor.state.doc.textContent).toBe('strasse welt')
  editor.commands.undo()
  expect(editor.state.doc.textContent).toBe('Strasse Welt')
  editor.commands.undo()
  expect(editor.state.doc.textContent).toBe('STRASSE WELT')
  editor.commands.undo()
  expect(editor.state.doc.textContent).toBe('straße welt')
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', shiftKey: true, bubbles: true }))
  expect(editor.state.doc.textContent).toBe('straße welt')
  input.remove()
  const nested = document.createElement('input')
  editor.view.dom.append(nested)
  const nestedKey = new KeyboardEvent('keydown', {
    key: 'F3',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })
  nested.dispatchEvent(nestedKey)
  expect(nestedKey.defaultPrevented).toBe(false)
  expect(editor.state.doc.textContent).toBe('straße welt')
  nested.remove()
})

it('respects manual track changes, preserves real revision XML and undoes the operation once', async () => {
  const input = await fixture()
  const session = await openDocx(input)
  const editor = boot(session.content)
  range(editor, 1, 4)
  const before = editor.state.doc
  ;(editor.storage as unknown as { trackChanges: { enabled: boolean } }).trackChanges.enabled = true
  apply(editor, 'lower')
  const xml = await documentXml(await session.save(editor.getJSON() as PmDocJson))
  expect(xml).toContain('<w:ins')
  expect(xml).toContain('<w:del')
  expect(docxCaseTarget(editor).reason).toContain('受保护内容')
  editor.commands.undo()
  expect(editor.state.doc).toEqual(before)
})

it('keeps a conversion separate from immediately following manual typing', () => {
  const editor = boot()
  apply(editor, 'lower')
  editor.commands.insertContent('manual')
  editor.commands.undo()
  expect(editor.state.doc.textContent).toBe('hello world')
  editor.commands.undo()
  expect(editor.state.doc.textContent).toBe('HELLO WORLD')
})

const corpus = new Uint8Array(
  readFileSync(
    join(
      import.meta.dirname,
      '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
    ),
  ),
)
async function fixture() {
  const zip = await JSZip.loadAsync(corpus)
  const source = await zip.file('word/document.xml')!.async('string')
  const section = source.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? ''
  zip.file(
    'word/document.xml',
    source.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      `<w:body><w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="17"/></w:numPr><w:keepNext/></w:pPr><w:r><w:rPr><w:b/><w:lang w:val="en-US"/><w:color w:val="4472C4"/><w:sz w:val="28"/><w:fitText w:val="300" w:id="42"/></w:rPr><w:t>HEL</w:t></w:r><w:hyperlink r:id="rCaseLink"><w:r><w:rPr><w:i/></w:rPr><w:t>LO WORLD</w:t></w:r></w:hyperlink></w:p><w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/><w:shd w:fill="DDEEFF"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>TABLE WORD</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>UNTOUCHED</w:t></w:r></w:p>${section}</w:body>`,
    ),
  )
  const rels = (await zip.file('word/_rels/document.xml.rels')!.async('string')).replace(
    /<Relationship\b[^>]*Type="[^"]*\/(?:image|hyperlink)"[^>]*\/>/g,
    '',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="rCaseLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/case" TargetMode="External"/></Relationships>',
    ),
  )
  zip.file(
    'word/numbering.xml',
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl></w:abstractNum><w:num w:numId="17"><w:abstractNumId w:val="7"/></w:num></w:numbering>',
  )
  const document = await zip.file('word/document.xml')!.async('string')
  zip.file(
    'word/document.xml',
    document
      .replace(/<w:t>/g, '<w:t xml:space="preserve">')
      .replace('<w:r><w:rPr><w:b/>', '<w:commentRangeStart w:id="7"/><w:r><w:rPr><w:b/>')
      .replace(
        '</w:hyperlink>',
        '</w:hyperlink><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r>',
      ),
  )
  zip.file(
    'word/comments.xml',
    '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="7" w:author="Reviewer"><w:p><w:r><w:t>Keep this comment</w:t></w:r></w:p></w:comment></w:comments>',
  )
  const commentRels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    commentRels.replace(
      '</Relationships>',
      '<Relationship Id="rCaseComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>',
    ),
  )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes('PartName="/word/comments.xml"'))
    zip.file(
      '[Content_Types].xml',
      types.replace(
        '</Types>',
        '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>',
      ),
    )
  return zip.generateAsync({ type: 'uint8array' })
}
async function documentXml(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
}
async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}
it('saves/reopens actual list and table text with raw rPr, link and non-target ZIP parts; two saves and post-save undo/redo', async () => {
  const input = await fixture(),
    session = await openDocx(input),
    editor = boot(session.content)
  const original = editor.state.doc
  const baselineParts = await parts(await session.save(editor.getJSON() as PmDocJson))
  expect(baselineParts).toEqual(await parts(input))
  let tableEnd = 0
  original.descendants((node, pos) => {
    if (node.text === 'TABLE WORD') tableEnd = pos + node.nodeSize
  })
  range(editor, 1, tableEnd)
  apply(editor, 'sentence')
  const first = await session.save(editor.getJSON() as PmDocJson)
  const xml = await documentXml(first)
  expect(xml).toContain('Hel')
  expect(xml).toContain('lo world')
  expect(xml).toContain('table word')
  for (const fragment of [
    '<w:b/>',
    '<w:i/>',
    '<w:lang w:val="en-US"/>',
    '<w:fitText w:val="300" w:id="42"/>',
    '<w:keepNext/>',
    '<w:numId w:val="17"/>',
    '<w:ilvl w:val="1"/>',
    '<w:shd w:fill="DDEEFF"/>',
    'UNTOUCHED',
  ])
    expect(xml).toContain(fragment)
  const reopened = await openDocx(first)
  const read = boot(reopened.content)
  expect(read.state.doc.textContent).toBe('Hello worldtable wordUNTOUCHED')
  expect(
    read.state.doc
      .child(0)
      .child(1)
      .marks.find((mark) => mark.type.name === 'link')!.attrs.href,
  ).toBe('https://example.com/case')
  expect(
    read.state.doc
      .child(0)
      .child(0)
      .marks.find((mark) => mark.type.name === 'comment')!.attrs.ids,
  ).toBe('7')
  expect(xml).toContain('<w:commentRangeStart w:id="7"/>')
  expect(xml).toContain('<w:commentRangeEnd w:id="7"/>')
  expect(read.state.doc.child(0).attrs).toMatchObject({ numId: '17', ilvl: 1 })
  const oldParts = await parts(input),
    newParts = await parts(first)
  expect(
    Object.keys(newParts).filter((key) => Buffer.compare(oldParts[key]!, newParts[key]!) !== 0),
  ).toEqual(['word/document.xml'])
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(newParts)
  editor.commands.undo()
  expect(editor.state.doc).toEqual(original)
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(baselineParts)
  editor.commands.redo()
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(newParts)
})
