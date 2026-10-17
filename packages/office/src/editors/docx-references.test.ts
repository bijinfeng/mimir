// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { afterEach, expect, it } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { buildSourcesXml, SOURCES_NS } from '../../vendor/packages/docx-engine/src/sources.js'
import { generateTocFieldXml } from '../../vendor/packages/docx-engine/src/generate.js'
import { openDocx, type PmDocJson } from '../docx.js'
import { REFERENCE_SOURCES_ATTR } from '../docx-reference-save.js'
import {
  applyReference,
  DocxReferencesExtension,
  nextCaptionNumber,
  referenceSources,
  referenceTarget,
  referenceTerms,
  referenceTocs,
} from './docx-references.js'

const bytes = new Uint8Array(
  readFileSync(
    join(
      import.meta.dirname,
      '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
    ),
  ),
)
const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
async function boot(input: Uint8Array = bytes) {
  const session = await openDocx(input)
  const editor = new Editor({
    extensions: [...editorExtensions, DocxReferencesExtension],
    content: session.content,
  })
  editors.push(editor)
  editor.commands.setTextSelection(2)
  return { editor, session }
}
async function entries(data: Uint8Array) {
  const zip = await JSZip.loadAsync(data)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}
async function xml(data: Uint8Array, path = 'word/document.xml') {
  return (await JSZip.loadAsync(data)).file(path)!.async('string')
}
const source = {
  tag: 'Mimir2026',
  type: 'Book',
  author: '张三',
  title: '原生引文',
  year: '2026',
  publisher: '出版社',
  url: 'https://example.com/ref?a=1&b=2',
}

it('new source + CITATION is one transaction/history step; native source survives two saves, undo and redo', async () => {
  const { editor, session } = await boot()
  const original = editor.state.doc
  const before = editor.state.doc.textContent
  const from = 2,
    to = 4
  editor.commands.setTextSelection({ from, to })
  let changes = 0
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++
  })
  applyReference(editor, session, referenceTarget(editor), {
    kind: 'source',
    source,
    insertCitation: true,
  })
  expect(changes).toBe(1)
  expect(editor.state.doc.textContent).toBe(
    before.slice(0, to - 1) + '(张三, 2026)' + before.slice(to - 1),
  )
  const first = await session.save(editor.getJSON() as PmDocJson)
  expect(await xml(first)).toContain('CITATION Mimir2026 \\l 2052')
  expect(await xml(first)).toContain('w:dirty="true"')
  expect((await openDocx(first)).footnotes.parsed.sources).toEqual([source])
  expect(await entries(await session.save(editor.getJSON() as PmDocJson))).toEqual(
    await entries(first),
  )
  editor.commands.undo()
  expect(editor.state.doc.eq(original)).toBe(true)
  expect(await entries(await session.save(editor.getJSON() as PmDocJson))).toEqual(
    await entries(bytes),
  )
  editor.commands.redo()
  expect(await entries(await session.save(editor.getJSON() as PmDocJson))).toEqual(
    await entries(first),
  )
})

it('edits one modeled source value while retaining unknown XML, multi-authors, root style, untouched entries and all other parts', async () => {
  const zip = await JSZip.loadAsync(bytes)
  const sourceXml = buildSourcesXml([source, { ...source, tag: 'Keep', title: '保留' }])
    .replace('<b:Sources ', '<b:Sources custom="sentinel" ')
    .replace(
      '<b:Title>原生引文</b:Title>',
      '<b:DOI>10.1000/sentinel</b:DOI><b:Volume>17</b:Volume><b:Title>原生引文</b:Title>',
    )
    .replace('</b:Person>', '</b:Person><b:Person><b:Last>王五</b:Last></b:Person>')
  zip.file('customXml/item1.xml', sourceXml)
  const input = await zip.generateAsync({ type: 'uint8array' })
  const { editor, session } = await boot(input)
  applyReference(editor, session, referenceTarget(editor), {
    kind: 'source',
    source: { ...source, title: '改后标题' },
  })
  const first = await session.save(editor.getJSON() as PmDocJson)
  expect(await xml(first, 'customXml/item1.xml')).toBe(
    sourceXml.replace('<b:Title>原生引文</b:Title>', '<b:Title>改后标题</b:Title>'),
  )
  const originalEntries = await entries(input),
    savedEntries = await entries(first)
  for (const [path, value] of Object.entries(originalEntries).filter(
    ([entryPath]) => entryPath !== 'customXml/item1.xml',
  ))
    expect(savedEntries[path]).toEqual(value)
  expect(editor.commands.undo()).toBe(true)
  expect(await entries(await session.save(editor.getJSON() as PmDocJson))).toEqual(originalEntries)
  expect(editor.commands.redo()).toBe(true)
  expect(await entries(await session.save(editor.getJSON() as PmDocJson))).toEqual(savedEntries)
  const reopened = await boot(first)
  const current = referenceSources(reopened.editor.state.doc, reopened.session)[0]!
  applyReference(reopened.editor, reopened.session, referenceTarget(reopened.editor), {
    kind: 'source',
    source: { ...current, year: '2027' },
  })
  const second = await reopened.session.save(reopened.editor.getJSON() as PmDocJson)
  expect(await xml(second, 'customXml/item1.xml')).toContain('<b:DOI>10.1000/sentinel</b:DOI>')
  expect(await xml(second, 'customXml/item1.xml')).toContain('<b:Year>2027</b:Year>')
})

it('caption numbering counts Chinese native SEQ fields after reopen; bibliography/XE/INDEX/general fields save as native OOXML', async () => {
  let { editor, session } = await boot()
  applyReference(editor, session, referenceTarget(editor), {
    kind: 'caption',
    label: '图',
    text: '架构 & 数据',
  })
  const saved = await session.save(editor.getJSON() as PmDocJson)
  ;({ editor, session } = await boot(saved))
  expect(nextCaptionNumber(editor.state.doc, session, '图')).toBe(2)
  expect(nextCaptionNumber(editor.state.doc, session, '表')).toBe(1)
  let target = applyReference(editor, session, referenceTarget(editor), {
    kind: 'caption',
    label: '图',
    text: '第二张图',
  })
  target = applyReference(editor, session, target, { kind: 'source', source })
  target = applyReference(editor, session, target, { kind: 'bibliography' })
  target = applyReference(editor, session, target, { kind: 'mark', term: '数据:检索' })
  expect(referenceTerms(editor.state.doc)).toContain('数据:检索')
  target = applyReference(editor, session, target, { kind: 'index' })
  applyReference(editor, session, target, {
    kind: 'field',
    instruction: 'DATE \\@ "yyyy-MM-dd"',
    result: '2026-10-17',
  })
  const final = await session.save(editor.getJSON() as PmDocJson)
  const native = await xml(final)
  for (const instruction of ['SEQ 图', 'BIBLIOGRAPHY', 'XE "数据:检索"', 'INDEX', 'DATE'])
    expect(native).toContain(instruction)
  expect(native).toContain('架构 &amp; 数据')
  expect(native).toContain('<w:t>2</w:t>')
  expect((await openDocx(final)).footnotes.parsed.sources[0]).toEqual(source)
  for (const block of session.blocks.filter(
    (candidate) =>
      candidate.originalXml && candidate.docxIndex !== editor.state.doc.firstChild?.attrs.docxIndex,
  ))
    expect(native).toContain(block.originalXml)
})

it('TOC update uses current headings, preserves neighboring paragraphs and page break; mixed/malformed fields reject atomically', async () => {
  const { editor, session } = await boot()
  const schema = editor.schema
  const protectedNode = (genXml: string) =>
    schema.nodes.docProtected!.create({ blockType: 'passthrough', genXml, label: '目录' })
  const toc = generateTocFieldXml([{ level: 1, text: '旧标题' }])[0]!
    .replace('</w:p>', '<w:r><w:br w:type="page"/></w:r></w:p>')
    .replace(
      '<w:r><w:rPr><w:noProof/></w:rPr><w:t xml:space="preserve">旧标题</w:t></w:r>',
      '<w:hyperlink w:anchor="_TocHeading"><w:r><w:t>旧标题</w:t></w:r></w:hyperlink>',
    )
  const nodes = [
    schema.nodes.docParagraph!.create(null, schema.text('前文')),
    protectedNode(toc),
    schema.nodes.docHeading!.create({ level: 1 }, schema.text('当前标题')),
    schema.nodes.docParagraph!.create(null, schema.text('后文')),
  ]
  editor.commands.setContent(schema.nodes.doc!.create(null, nodes).toJSON())
  const region = referenceTocs(editor.state.doc, session)[0]!
  expect(region).toMatchObject({ pageBreak: true })
  applyReference(editor, session, referenceTarget(editor), { kind: 'toc', region })
  expect(editor.state.doc.firstChild!.textContent).toBe('前文')
  expect(editor.state.doc.lastChild!.textContent).toBe('后文')
  expect(editor.state.doc.child(1).attrs.genXml).toContain('当前标题')
  expect(editor.state.doc.child(2).attrs.genXml).toContain('w:type="page"')
  for (const invalid of [
    toc.replace('<w:p>', '<w:p><w:r><w:t>不要删除我</w:t></w:r>'),
    toc.replace('<w:p>', '<w:p><w:r><w:tab/></w:r>'),
    toc.replace('<w:r><w:fldChar w:fldCharType="end"/></w:r>', ''),
  ]) {
    editor.commands.setContent(
      schema.nodes.doc!.create(null, [protectedNode(invalid), nodes[2]!]).toJSON(),
    )
    const target = referenceTarget(editor),
      original = editor.state.doc
    expect(referenceTocs(original, session)).toEqual([])
    expect(() => applyReference(editor, session, target, { kind: 'toc', region })).toThrow(
      '无法安全识别',
    )
    expect(editor.state.doc).toBe(original)
  }
})

it('split formatted inline SEQ results count once, and pending source metadata accompanies a native citation', async () => {
  const { editor, session } = await boot()
  const field = editor.schema.marks.instrField!.create({ instr: 'SEQ 图 \\* ARABIC' })
  const bold = editor.schema.marks.bold!.create()
  editor.commands.setContent({
    type: 'doc',
    content: [
      {
        type: 'docParagraph',
        content: [
          editor.schema.text('1', [field]).toJSON(),
          editor.schema.text('0', [field, bold]).toJSON(),
        ],
      },
    ],
  })
  expect(nextCaptionNumber(editor.state.doc, session, '图')).toBe(2)
  editor.commands.setTextSelection(1)
  const original = editor.state.doc
  applyReference(editor, session, referenceTarget(editor), { kind: 'citation', tag: source.tag }, [
    source,
  ])
  expect(referenceSources(editor.state.doc, session)).toEqual([source])
  const saved = await session.save(editor.getJSON() as PmDocJson)
  expect((await openDocx(saved)).footnotes.parsed.sources).toEqual([source])
  expect(await xml(saved)).toContain('CITATION Mimir2026')
  editor.commands.undo()
  expect(editor.state.doc.eq(original)).toBe(true)
})

it('stale targets, invalid fields and sources reject atomically; no-op source has no history entry and no duplicate order changes', async () => {
  const { editor, session } = await boot()
  let target = applyReference(editor, session, referenceTarget(editor), { kind: 'source', source })
  target = applyReference(editor, session, target, {
    kind: 'source',
    source: { ...source, tag: 'second', title: '另一个' },
  })
  const previous = editor.state.doc
  target = applyReference(editor, session, target, {
    kind: 'source',
    source: { ...source, title: '修订' },
  })
  expect(referenceSources(editor.state.doc, session).map((item) => item.tag)).toEqual([
    source.tag,
    'second',
  ])
  const current = editor.state.doc
  target = applyReference(editor, session, target, {
    kind: 'source',
    source: { ...source, title: '修订' },
  })
  expect(editor.state.doc).toBe(current)
  editor.commands.undo()
  expect(editor.state.doc.eq(previous)).toBe(true)
  const frozen = referenceTarget(editor)
  editor.commands.insertContent('人工修改')
  const changed = editor.state.doc
  expect(() => applyReference(editor, session, frozen, { kind: 'mark', term: '词' })).toThrow(
    '文档已变化',
  )
  expect(() =>
    applyReference(editor, session, referenceTarget(editor), {
      kind: 'field',
      instruction: 'INCLUDETEXT "https://example.com"',
      result: 'bad',
    }),
  ).toThrow('请选择支持')
  expect(() =>
    applyReference(editor, session, referenceTarget(editor), {
      kind: 'source',
      source: { ...source, tag: 'bad tag' },
      insertCitation: true,
    }),
  ).toThrow('标签')
  expect(editor.state.doc).toBe(changed)
  expect(editor.state.doc.attrs[REFERENCE_SOURCES_ATTR]).toHaveLength(2)
})

it('imported optional source fields remain valid; source XML namespace remains native', async () => {
  const { editor, session } = await boot()
  const minimal = { ...source, publisher: undefined, url: undefined }
  applyReference(editor, session, referenceTarget(editor), { kind: 'source', source: minimal })
  const output = await session.save(editor.getJSON() as PmDocJson)
  const saved = await JSZip.loadAsync(output)
  expect(await saved.file('customXml/item1.xml')!.async('string')).toContain(SOURCES_NS)
})

it('a selected picture caption inserts directly after that picture, before its following paragraph', async () => {
  const { editor, session } = await boot()
  let picturePos = -1,
    index = -1
  editor.state.doc.forEach((node, pos, childIndex) => {
    if (node.attrs.blockType === 'image') {
      picturePos = pos
      index = childIndex
    }
  })
  expect(picturePos).toBeGreaterThanOrEqual(0)
  const picture = editor.state.doc.child(index),
    following = editor.state.doc.child(index + 1)
  editor.commands.setNodeSelection(picturePos)
  applyReference(editor, session, referenceTarget(editor), {
    kind: 'caption',
    label: '图',
    text: '紧跟选中图片',
  })
  expect(editor.state.doc.child(index)).toBe(picture)
  expect(editor.state.doc.child(index + 1).attrs.genXml).toContain('紧跟选中图片')
  expect(editor.state.doc.child(index + 2)).toBe(following)
})

it('existing native source tags/types are retained, safe punctuation is quoted in CITATION, and an invalid full list is atomic', async () => {
  const zip = await JSZip.loadAsync(bytes)
  const legacy = { ...source, tag: 'legacy.tag 2024', type: 'Patent' }
  zip.file('customXml/item1.xml', buildSourcesXml([legacy]))
  const { editor, session } = await boot(await zip.generateAsync({ type: 'uint8array' }))
  let target = applyReference(editor, session, referenceTarget(editor), {
    kind: 'source',
    source: { ...legacy, title: '更新的专利' },
  })
  target = applyReference(editor, session, target, { kind: 'citation', tag: legacy.tag })
  expect(await xml(await session.save(editor.getJSON() as PmDocJson))).toContain(
    'CITATION "legacy.tag 2024"',
  )
  const original = editor.state.doc
  const duplicate = [source, source]
  editor.commands.undo()
  editor.commands.undo()
  const cleanTarget = referenceTarget(editor)
  expect(() =>
    applyReference(editor, session, cleanTarget, { kind: 'citation', tag: source.tag }, duplicate),
  ).toThrow('重复')
  expect(editor.state.doc).toBe(cleanTarget.doc)
  expect(editor.state.doc).not.toBe(original)
})
