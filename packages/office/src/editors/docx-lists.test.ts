// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { afterEach, expect, it } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx, type PmDocJson } from '../docx.js'
import { listDefinitionEdits } from '../docx-list-save.js'
import { splitXmlChildren } from '../../vendor/packages/docx-engine/src/generate.js'
import {
  applyDocxList,
  docxListDefinitions,
  docxListTarget,
  DocxListsExtension,
  LIST_PRESETS,
  listTargetCurrent,
  syncDocxListDefinitions,
  toggleDocxList,
} from './docx-lists.js'
const corpus = new Uint8Array(
  readFileSync(
    join(
      import.meta.dirname,
      '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
    ),
  ),
)
const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
const abs =
  '<w:abstractNum w:abstractNumId="7" custom="abstract-sentinel"><w:nsid w:val="DEADBEEF"/><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0" custom="level-sentinel"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="right"/><w:pPr custom="ppr-sentinel"><w:tabs><w:tab w:val="num" w:pos="900"/></w:tabs><w:ind w:left="900" w:hanging="300" custom="indent-sentinel"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial"/><w:color w:val="4472C4"/><w:sz w:val="24"/></w:rPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>'
const num =
  '<w:num w:numId="17" custom="num-sentinel"><w:abstractNumId w:val="7"/><w:lvlOverride w:ilvl="0" custom="override-sentinel"><w:startOverride w:val="5"/></w:lvlOverride><w:lvlOverride w:ilvl="1"><w:lvl w:ilvl="1" custom="override-level-sentinel"><w:start w:val="2"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr><w:rPr><w:i/></w:rPr></w:lvl></w:lvlOverride></w:num>'
async function fixture(withNumbering = true) {
  const zip = await JSZip.loadAsync(corpus)
  const original = await zip.file('word/document.xml')!.async('string')
  const section = original.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? ''
  const relsClean = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    relsClean.replace(/<Relationship\b[^>]*Type="[^"]*\/(?:image|hyperlink)"[^>]*\/>/g, ''),
  )
  const paragraphs = ['选区第一段', '选区第二段', '未选第三段', '普通末段']
    .map(
      (text, i) =>
        `<w:p w:rsidR="sentinel${i}"><w:pPr><w:keepNext/>${withNumbering && i < 3 ? `<w:numPr><w:ilvl w:val="${i === 1 ? 1 : 0}"/><w:numId w:val="17"/></w:numPr>` : ''}<w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:lang w:val="zh-CN"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`,
    )
    .join('')
  zip.file(
    'word/document.xml',
    original.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${paragraphs}${section}</w:body>`),
  )
  if (withNumbering)
    zip.file(
      'word/numbering.xml',
      `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" custom="root-sentinel">${abs}${num}</w:numbering>`,
    )
  else {
    zip.remove('word/numbering.xml')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    zip.file(
      'word/_rels/document.xml.rels',
      rels.replace(/<Relationship\b[^>]*Type="[^"]*\/numbering"[^>]*\/>/g, ''),
    )
  }
  return zip.generateAsync({ type: 'uint8array' })
}
async function boot(input: Uint8Array = corpus) {
  const session = await openDocx(input)
  const editor = new Editor({
    extensions: [...editorExtensions, DocxListsExtension],
    content: session.content,
  })
  editors.push(editor)
  syncDocxListDefinitions(editor, session.footnotes.parsed.numbering)
  editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize - 1,
  })
  return { editor, session }
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
async function xml(bytes: Uint8Array, path = 'word/numbering.xml') {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}

it('selects actual paragraphs, reports mixed levels, preserves numId/ilvl when adopting an existing definition, and excludes end boundary', async () => {
  const { editor, session } = await boot(await fixture())
  const target = docxListTarget(editor)
  expect(target.paragraphs.map((p) => p.node.textContent)).toEqual(['选区第一段', '选区第二段'])
  expect(listTargetCurrent(target)).toMatchObject({ numId: '17', level: null, mixed: true })
  const original = editor.state.doc
  applyDocxList(editor, target, { kind: 'existing', numId: '17', level: null })
  expect(editor.state.doc).toBe(original)
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(
    await parts(await fixture()),
  )
  editor.commands.setTextSelection({ from: 1, to: editor.state.doc.child(0).nodeSize })
  expect(docxListTarget(editor).paragraphs).toHaveLength(1)
})

it('clones a native definition with unknown XML and overrides, only changes selected paragraphs, and two saves/undo/redo recover exact entries', async () => {
  const input = await fixture()
  const { editor, session } = await boot(input)
  const outside = editor.state.doc.child(2).toJSON()
  const defs = docxListDefinitions(editor)
  const levels = Array.from({ length: 9 }, (_, i) => ({
    ...LIST_PRESETS[6]!.levels[i]!,
    ...defs.get('17')!.levels[i],
  }))
  const baseline = editor.state.doc
  let changes = 0
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++
  })
  applyDocxList(editor, docxListTarget(editor), {
    kind: 'definition',
    baseNumId: '17',
    levels,
    level: null,
    patches: {
      0: { lvlText: '第%1项', start: 7, indentLeft: 1080, suff: 'space' },
      1: { lvlText: '(%2)', start: 4, lvlJc: 'center' },
    },
  })
  expect(changes).toBe(1)
  expect(editor.state.doc.child(0).attrs).toMatchObject({ numId: '18', ilvl: 0, kind: 'ordered' })
  expect(editor.state.doc.child(1).attrs).toMatchObject({ numId: '18', ilvl: 1 })
  expect(editor.state.doc.child(2).toJSON()).toEqual(outside)
  const first = await session.save(editor.getJSON() as PmDocJson)
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(await parts(first))
  const numbering = await xml(first)
  expect(numbering).toContain(abs)
  expect(numbering).toContain(num)
  for (const sentinel of [
    'abstract-sentinel',
    'level-sentinel',
    'ppr-sentinel',
    'indent-sentinel',
    'num-sentinel',
    'override-sentinel',
    'override-level-sentinel',
  ])
    expect(numbering.split(`custom="${sentinel}"`)).toHaveLength(3)
  expect(numbering).toContain('<w:startOverride w:val="7"/>')
  expect(numbering).toContain('<w:sz w:val="24"/>')
  expect(numbering).toContain('<w:tabs><w:tab w:val="num" w:pos="900"/></w:tabs>')
  const read = await openDocx(first)
  expect(read.footnotes.parsed.numbering.get('18')).toMatchObject({
    levels: {
      0: { lvlText: '第%1项', indentLeft: 1080, color: '4472C4', suff: 'space' },
      1: { lvlText: '(%2)', lvlJc: 'center', start: 4 },
    },
    startOverrides: { 0: 7 },
  })
  const beforeParts = await parts(input),
    firstParts = await parts(first)
  expect(
    Object.keys(firstParts)
      .filter((key) => Buffer.compare(beforeParts[key]!, firstParts[key]!) !== 0)
      .toSorted(),
  ).toEqual(['word/document.xml', 'word/numbering.xml'])
  expect(await xml(first, 'word/document.xml')).toContain('w:keepNext')
  expect(await xml(first, 'word/document.xml')).toContain('w:rsidR="sentinel0"')
  expect(editor.view.dom.querySelector('[data-marker]')?.getAttribute('data-marker')).toBe('第7项')
  const secondTarget = docxListTarget(editor)
  applyDocxList(editor, secondTarget, { kind: 'existing', numId: '18', level: 2 })
  const second = await session.save(editor.getJSON() as PmDocJson)
  editor.commands.undo()
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(firstParts)
  editor.commands.undo()
  expect(editor.state.doc.eq(baseline)).toBe(true)
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(beforeParts)
  expect(docxListDefinitions(editor).has('18')).toBe(false)
  editor.commands.redo()
  editor.commands.redo()
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(
    await parts(second),
  )
})

it.each(LIST_PRESETS)(
  'writes $name as native nine-level definitions, with live markers and missing numbering part creation',
  async (preset) => {
    const input = await fixture(false)
    const { editor, session } = await boot(input)
    applyDocxList(editor, docxListTarget(editor), {
      kind: 'definition',
      baseNumId: null,
      levels: preset.levels,
      patches: {},
      level: 0,
    })
    const id = editor.state.doc.child(0).attrs.numId as string
    expect(docxListDefinitions(editor).get(id)?.levels[0]?.lvlText).toBe(preset.levels[0]!.lvlText)
    expect(
      editor.view.dom.querySelector('[data-marker]') ??
        editor.view.dom.querySelector('[style*="--li-marker"]'),
    ).not.toBeNull()
    const output = await session.save(editor.getJSON() as PmDocJson)
    const read = await openDocx(output)
    expect(read.footnotes.parsed.numbering.get(id)?.levels[8]?.lvlText).toBe(
      preset.levels[8]!.lvlText,
    )
    expect(await xml(output, 'word/_rels/document.xml.rels')).toContain('/numbering')
  },
)

it('quick list toggle creates a real definition in plain documents, changes actual selection once and undo removes metadata', async () => {
  const input = await fixture(false)
  const { editor, session } = await boot(input)
  toggleDocxList(editor, 'bullet')
  expect(listDefinitionEdits(editor.state.doc)).toHaveLength(1)
  expect(editor.state.doc.child(0).attrs.kind).toBe('bullet')
  const output = await session.save(editor.getJSON() as PmDocJson)
  expect((await openDocx(output)).blocks[0]?.list?.kind).toBe('bullet')
  editor.commands.undo()
  expect(listDefinitionEdits(editor.state.doc)).toHaveLength(0)
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(await parts(input))
})

it('rejects stale targets and invalid level definitions before any transaction', async () => {
  const { editor } = await boot(await fixture())
  const target = docxListTarget(editor)
  editor.commands.insertContent('手动改动')
  const changed = editor.state.doc
  expect(() => applyDocxList(editor, target, { kind: 'none' })).toThrow('文档已变化')
  expect(editor.state.doc).toBe(changed)
  for (const patch of [
    { lvlText: '%9.' },
    { start: 0 },
    { indentLeft: -1 },
    { lvlText: '\u0001' },
    { numFmt: 'unknown' },
  ])
    expect(() =>
      applyDocxList(editor, docxListTarget(editor), {
        kind: 'definition',
        baseNumId: '17',
        levels: LIST_PRESETS[6]!.levels,
        patches: { 0: patch },
        level: null,
      }),
    ).toThrow(/编号|缩进|格式/)
  expect(editor.state.doc).toBe(changed)
})

it('clear list affects only actual selection and keeps original definitions and outside paragraphs', async () => {
  const input = await fixture()
  const { editor, session } = await boot(input)
  const target = docxListTarget(editor)
  const outside = editor.state.doc.child(2).toJSON()
  applyDocxList(editor, target, { kind: 'none' })
  const output = await session.save(editor.getJSON() as PmDocJson)
  const reopened = await openDocx(output)
  expect(reopened.blocks[0]?.list).toBeUndefined()
  expect(reopened.blocks[1]?.list).toBeUndefined()
  expect(reopened.blocks[2]?.list?.numId).toBe('17')
  expect(editor.state.doc.child(2).toJSON()).toEqual(outside)
  expect(await xml(output)).toBe(await xml(input))
  editor.commands.undo()
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(await parts(input))
})

it('clearing a mixed selection preserves non-list headings and plain paragraphs exactly', async () => {
  const { editor } = await boot(await fixture())
  const secondPos = editor.state.doc.child(0).nodeSize
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(secondPos, editor.schema.nodes.docHeading, {
      ...editor.state.doc.child(1).attrs,
      level: 2,
    }),
  )
  const heading = editor.state.doc.child(1)
  const paragraph = editor.state.doc.child(3)
  editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 })
  applyDocxList(editor, docxListTarget(editor), { kind: 'none' })
  expect(editor.state.doc.child(0).type.name).toBe('docParagraph')
  expect(editor.state.doc.child(1)).toBe(heading)
  expect(editor.state.doc.child(3)).toBe(paragraph)
})

it('numbering storage keeps reference for selection/text changes and drops appended definitions on undo', async () => {
  const { editor } = await boot(await fixture())
  const original = editor.storage.listNumbering.defs
  editor.commands.setTextSelection(2)
  expect(editor.storage.listNumbering.defs).toBe(original)
  editor.commands.insertContent('文本')
  expect(editor.storage.listNumbering.defs).toBe(original)
  applyDocxList(editor, docxListTarget(editor), {
    kind: 'definition',
    baseNumId: null,
    levels: LIST_PRESETS[0]!.levels,
    patches: {},
    level: 0,
  })
  const id = editor.state.doc.child(0).attrs.numId
  expect(editor.storage.listNumbering.defs.has(id)).toBe(true)
  editor.commands.undo()
  expect(editor.storage.listNumbering.defs.has(id)).toBe(false)
})

it('inserts missing native level fields in schema order while retaining unknown numbering properties', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file(
    'word/numbering.xml',
    (await zip.file('word/numbering.xml')!.async('string'))
      .replace('<w:start w:val="1"/>', '')
      .replace('<w:lvlJc w:val="right"/>', ''),
  )
  const { editor, session } = await boot(await zip.generateAsync({ type: 'uint8array' }))
  editor.commands.setTextSelection(2)
  applyDocxList(editor, docxListTarget(editor), {
    kind: 'definition',
    baseNumId: '17',
    levels: LIST_PRESETS[6]!.levels,
    patches: { 0: { start: 9, suff: 'space', lvlJc: 'center' } },
    level: 0,
  })
  const output = await session.save(editor.getJSON() as PmDocJson)
  const reopened = await openDocx(output)
  const absId = reopened.footnotes.parsed.numbering.get('18')!.abstractNumId
  const numbering = await xml(output)
  const definition = numbering.match(
    new RegExp(`<w:abstractNum w:abstractNumId="${absId}"[^>]*>[\\s\\S]*?</w:abstractNum>`),
  )![0]
  const level = definition.match(/<w:lvl w:ilvl="0"[^>]*>([\s\S]*?)<\/w:lvl>/)![1]!
  expect(splitXmlChildren(level).map((item) => item.name)).toEqual([
    'w:start',
    'w:numFmt',
    'w:suff',
    'w:lvlText',
    'w:lvlJc',
    'w:pPr',
    'w:rPr',
  ])
  expect(definition).toContain('custom="indent-sentinel"')
})

it('maps only the first duplicate anchor after splitting a list paragraph, retaining both list levels and every text fragment', async () => {
  const { editor, session } = await boot(await fixture())
  editor.commands.setTextSelection(3)
  editor.commands.splitBlock()
  expect(editor.state.doc.child(0).attrs.docxIndex).toBe(editor.state.doc.child(1).attrs.docxIndex)
  editor.commands.setTextSelection(1)
  applyDocxList(editor, docxListTarget(editor), { kind: 'existing', numId: '17', level: 2 })
  const output = await session.save(editor.getJSON() as PmDocJson)
  const reopened = await openDocx(output)
  expect(reopened.blocks.slice(0, 3).map((block) => block.list?.ilvl)).toEqual([2, 0, 1])
  expect(
    reopened.content.content
      ?.slice(0, 3)
      .map((node) => node.content?.map((part) => part.text).join('')),
  ).toEqual(['选区', '第一段', '选区第二段'])
})

it('preserves table and selected cell paragraph XML for list-only changes without touching other cells', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  const document = await zip.file('word/document.xml')!.async('string')
  const paragraphs = document.match(/<w:p(?=[\s/>])[^>]*>[\s\S]*?<\/w:p>/g)!
  const table = `<w:tbl custom="table-sentinel"><w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc custom="cell-sentinel"><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${paragraphs[0]}</w:tc><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${paragraphs[1]}</w:tc></w:tr></w:tbl>`
  zip.file('word/document.xml', document.replace(paragraphs.slice(0, 3).join(''), table))
  const input = await zip.generateAsync({ type: 'uint8array' })
  const { editor, session } = await boot(input)
  let firstPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (firstPos < 0 && node.type.name === 'docListItem') firstPos = pos
  })
  editor.commands.setTextSelection(firstPos + 1)
  expect(docxListTarget(editor).paragraphs).toHaveLength(1)
  applyDocxList(editor, docxListTarget(editor), {
    kind: 'definition',
    baseNumId: null,
    levels: LIST_PRESETS[0]!.levels,
    patches: {},
    level: null,
  })
  const output = await session.save(editor.getJSON() as PmDocJson)
  const after = await xml(output, 'word/document.xml')
  expect(after).toBe(
    document.replace(
      paragraphs.slice(0, 3).join(''),
      table.replace(
        paragraphs[0]!,
        paragraphs[0]!.replace('w:numId w:val="17"', 'w:numId w:val="18"'),
      ),
    ),
  )
  editor.commands.undo()
  expect(await parts(await session.save(editor.getJSON() as PmDocJson))).toEqual(await parts(input))
})

it('list plus later text/format edit preserves unknown pPr; list removal cancels style-inherited numbering', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  let document = await zip.file('word/document.xml')!.async('string')
  document = document
    .replace('<w:keepNext/>', '<w:pStyle w:val="InheritedList"/><w:keepNext/><w:suppressOverlap/>')
    .replace('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="17"/></w:numPr>', '')
  zip.file('word/document.xml', document)
  const styles = await zip.file('word/styles.xml')!.async('string')
  zip.file(
    'word/styles.xml',
    styles.replace(
      '</w:styles>',
      '<w:style w:type="paragraph" w:styleId="InheritedList"><w:name w:val="Inherited List"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="17"/></w:numPr></w:pPr></w:style></w:styles>',
    ),
  )
  const input = await zip.generateAsync({ type: 'uint8array' })
  const { editor, session } = await boot(input)
  editor.commands.setTextSelection(2)
  expect(editor.state.doc.child(0).type.name).toBe('docListItem')
  applyDocxList(editor, docxListTarget(editor), { kind: 'none' })
  editor.commands.insertContent('改字')
  const output = await session.save(editor.getJSON() as PmDocJson)
  const after = await xml(output, 'word/document.xml')
  const first = after.match(/<w:p(?=[\s/>])[^>]*>[\s\S]*?<\/w:p>/)![0]
  expect(first).toContain('<w:keepNext/>')
  expect(first).toContain('<w:suppressOverlap/>')
  expect(first).toContain('<w:numId w:val="0"/>')
  expect((await openDocx(output)).blocks[0]?.type).toBe('paragraph')
})
