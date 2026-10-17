/** @vitest-environment happy-dom */
import { Plugin } from '@tiptap/pm/state'
import { Editor } from '@tiptap/core'
import { undo, redo, undoDepth } from '@tiptap/pm/history'
import { afterEach, expect, it } from 'vitest'
import JSZip from 'jszip'
import { writeFileSync } from 'node:fs'
import type { PmDocJson } from './docx.js'
import { openDocx } from './docx.js'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { DocxInkExtension } from './editors/docx-ink.js'
import { DocxProtectionExtension } from './editors/docx-protection.js'
import { toggleProtectedForm } from './editors/docx-form-controls.js'
import {
  protectedFormsFixture,
  legacyCheckbox,
  sdtCheckbox,
} from './docx-protected-forms-fixture.test-helper.js'
const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))
async function boot(body?: string) {
  const bytes = await protectedFormsFixture(body),
    session = await openDocx(bytes)
  const editor = new Editor({
    extensions: [
      ...editorExtensions,
      DocxInkExtension,
      DocxProtectionExtension.configure({ controller: session.protection }),
    ],
    content: session.content,
    editable: false,
  })
  editors.push(editor)
  return {
    bytes,
    session,
    editor,
    controls: () => session.protection.readFormControls(editor.getJSON()),
  }
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('string')]),
    ),
  )
}
it('maps real adjacent legacy/SDT controls, preserves native identity, history and two saves', async () => {
  const { bytes, session, editor, controls } = await boot()
  expect(session.protection.getAccess()).toMatchObject({
    writable: false,
    formsOnly: true,
    commentsOnly: false,
  })
  expect(controls()).toHaveLength(5)
  expect(
    controls()
      .slice(0, 3)
      .map((c) => c.reason),
  ).toEqual([null, null, null])
  expect(controls()[3]!.reason).toContain('禁用')
  expect(controls()[4]!.reason).toContain('锁定')
  toggleProtectedForm(editor.view, session.protection, 'form-2')
  expect(undoDepth(editor.state)).toBe(1)
  expect(controls().map((c) => c.checked)).toEqual([false, true, false, false, false])
  const saved = await session.save(editor.getJSON()),
    before = await entries(bytes),
    after = await entries(saved)
  for (const key of Object.keys(before).filter((partName) => partName !== 'word/document.xml'))
    expect(after[key]).toBe(before[key])
  const needle = '<w:checkBox x:keep="box"><w:sizeAuto/><w:default w:val="0"/></w:checkBox>'
  const first = before['word/document.xml']!.indexOf(needle),
    secondIndex = before['word/document.xml']!.indexOf(needle, first + needle.length)
  expect(after['word/document.xml']).toBe(
    before['word/document.xml']!.slice(0, secondIndex) +
      needle.replace('</w:checkBox>', '<w:checked w:val="1"/></w:checkBox>') +
      before['word/document.xml']!.slice(secondIndex + needle.length),
  )
  const reopened = await openDocx(saved)
  expect(reopened.protection.readFormControls(reopened.content)[1]!.checked).toBe(true)
  toggleProtectedForm(editor.view, session.protection, 'form-3')
  expect(undoDepth(editor.state)).toBe(2)
  const second = await session.save(editor.getJSON())
  const again = await openDocx(second)
  expect(
    again.protection
      .readFormControls(again.content)
      .slice(0, 3)
      .map((c) => c.checked),
  ).toEqual([false, true, true])
  expect(undo(editor.state, editor.view.dispatch)).toBe(true)
  expect(controls()[2]!.checked).toBe(false)
  expect(undo(editor.state, editor.view.dispatch)).toBe(true)
  expect(await session.save(editor.getJSON())).toEqual(bytes)
  expect(redo(editor.state, editor.view.dispatch)).toBe(true)
  expect(controls()[1]!.checked).toBe(true)
  toggleProtectedForm(editor.view, session.protection, 'form-2')
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('rejects body/marks/options/ordinary glyph/pasted controls and forbidden native controls atomically', async () => {
  const { bytes, session, editor, controls } = await boot()
  const original = editor.getJSON() as PmDocJson
  editor.commands.insertContentAt(1, '写入')
  expect(editor.getJSON()).toEqual(original)
  for (const id of ['form-4', 'form-5'])
    expect(() => toggleProtectedForm(editor.view, session.protection, id)).toThrow(
      /只读|表单|复选框|保护|原件/,
    )
  const forged = structuredClone(original)
  forged.content![2]!.content![0]!.text = '普通文字方框 ☒ 保持只读'
  await expect(session.save(forged)).rejects.toThrow(/只读|表单|复选框|保护|原件/)
  const attributes = structuredClone(original)
  attributes.content![0]!.attrs!.align = 'center'
  await expect(session.save(attributes)).rejects.toThrow(/只读|表单|复选框|保护|原件/)
  const mark = structuredClone(original)
  ;(
    mark.content![0]!.content!.find((n) => n.text?.includes('☐'))!.marks as {
      type: string
      attrs: Record<string, unknown>
    }[]
  ).find((m) => m.type === 'instrField')!.attrs.instr = 'FORMTEXT'
  await expect(session.save(mark)).rejects.toThrow(/只读|表单|复选框|保护|原件/)
  await expect(session.save(original, { comments: [] })).rejects.toThrow(
    /只读|表单|复选框|保护|原件/,
  )
  await expect(session.save(original, { partXml: { 'word/document.xml': 'bad' } })).rejects.toThrow(
    /只读|表单|复选框|保护|原件/,
  )
  expect(controls()[0]!.checked).toBe(false)
  expect(await session.save(original)).toEqual(bytes)
})
it('handles custom supplementary glyphs with different UTF16 lengths and exact rollback', async () => {
  const custom = sdtCheckbox(
    '',
    false,
    '<w14:checkedState w14:val="1F7E2"/><w14:uncheckedState w14:val="2610"/>',
  )
  const { session, editor, bytes, controls } = await boot(
    `<w:p>${custom}${legacyCheckbox('后方控件')}</w:p>`,
  )
  expect(controls().map((c) => c.reason)).toEqual([null, null])
  toggleProtectedForm(editor.view, session.protection, 'form-1')
  expect(editor.state.doc.textContent).toBe('🟢☐')
  toggleProtectedForm(editor.view, session.protection, 'form-2')
  expect(editor.state.doc.textContent).toBe('🟢☒')
  const out = await session.save(editor.getJSON())
  const read = await openDocx(out)
  expect(read.protection.readFormControls(read.content).map((c) => c.checked)).toEqual([true, true])
  toggleProtectedForm(editor.view, session.protection, 'form-1')
  toggleProtectedForm(editor.view, session.protection, 'form-2')
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('keeps originally checked supplementary controls distinct with duplicate and missing SDT IDs', async () => {
  const checked = sdtCheckbox(
    '',
    true,
    '<w14:checkedState w14:val="1F7E2"/><w14:uncheckedState w14:val="2610"/>',
  ).replace('>☒</w:t>', '>🟢</w:t>')
  const { session, editor, bytes, controls } = await boot(
    `<w:p>${checked}${checked}${checked.replace('<w:id w:val="7"/>', '')}${legacyCheckbox()}</w:p>`,
  )
  expect(controls().map((c) => [c.checked, c.reason])).toEqual([
    [true, null],
    [true, null],
    [true, null],
    [false, null],
  ])
  toggleProtectedForm(editor.view, session.protection, 'form-2')
  toggleProtectedForm(editor.view, session.protection, 'form-3')
  toggleProtectedForm(editor.view, session.protection, 'form-4')
  expect(editor.state.doc.textContent).toBe('🟢☐☐☒')
  const saved = await session.save(editor.getJSON())
  const reopened = await openDocx(saved)
  expect(reopened.protection.readFormControls(reopened.content).map((c) => c.checked)).toEqual([
    true,
    false,
    false,
    true,
  ])
  expect(undo(editor.state, editor.view.dispatch)).toBe(true)
  expect(undo(editor.state, editor.view.dispatch)).toBe(true)
  expect(undo(editor.state, editor.view.dispatch)).toBe(true)
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it.each([
  `<w:p><w:permStart w:id="1"/>${legacyCheckbox()}<w:permEnd w:id="1"/></w:p>`,
  `<w:p><w:pPr><w:sectPr><w:formProt w:val="1"/></w:sectPr></w:pPr>${legacyCheckbox()}</w:p>`,
  `<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>相同</w:t></w:r></w:p><w:p><w:r><w:t>相同</w:t></w:r></w:p></w:sdtContent></w:sdt><w:p>${legacyCheckbox()}</w:p>`,
  `<w:p>${sdtCheckbox('', false, '<w14:checkedState w14:val="2610"/>')}</w:p>`,
  `<w:p>${legacyCheckbox().replace(' FORMCHECKBOX ', ' FORMTEXT ')}</w:p>`,
  `<w:p>${sdtCheckbox('<w:dataBinding w:xpath="/form/accepted" w:storeItemID="{00000000-0000-0000-0000-000000000001}"/>')}</w:p>`,
  `<w:p>${sdtCheckbox('<w:text/>')}</w:p>`,
])('keeps unsupported native permissions/ambiguous mappings readonly: %s', async (body) => {
  const { session, editor, controls, bytes } = await boot(body)
  expect(controls().every((c) => c.reason !== null)).toBe(true)
  expect(() => toggleProtectedForm(editor.view, session.protection, 'form-1')).toThrow(
    /只读|表单|复选框|保护|原件/,
  )
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('writes a stable valid browser fixture when requested', async () => {
  expect((await openDocx(await protectedFormsFixture())).protection.getAccess().formsOnly).toBe(
    true,
  )
  if (process.env.MIMIR_FORMS_FIXTURES === '1')
    writeFileSync('/tmp/mimir-docx-protected-forms-20261017.docx', await protectedFormsFixture())
})

it('rejects a mixed legal flip plus body write as one transaction and does not trust pasted native-looking marks', async () => {
  const { session, editor, bytes } = await boot()
  const initial = editor.state.doc
  const first = session.protection.readFormControls(editor.getJSON())[0]!
  let tr = editor.state.tr.replaceWith(
    first.from!,
    first.to!,
    editor.schema.text('☒', editor.state.doc.resolve(first.from!).nodeAfter!.marks),
  )
  tr = tr.insertText('非法正文', 1)
  editor.view.dispatch(tr)
  expect(editor.state.doc).toBe(initial)
  expect(undoDepth(editor.state)).toBe(0)
  const forged = structuredClone(editor.getJSON()) as PmDocJson
  const source = forged.content![0]!.content!.find((n) => n.text?.includes('☐'))!
  forged.content![2]!.content![0]!.marks = structuredClone(source.marks)
  await expect(session.save(forged)).rejects.toThrow('原生表单结构')
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('publishes nothing if another PM filter rejects a valid form transaction', async () => {
  const { session, editor, bytes } = await boot()
  editor.registerPlugin(new Plugin({ filterTransaction: (tr) => !tr.docChanged }))
  expect(() => toggleProtectedForm(editor.view, session.protection, 'form-1')).toThrow('拒绝')
  expect(undoDepth(editor.state)).toBe(0)
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('preserves checked defaults and empty native checked elements, returns exact original after restoring', async () => {
  const { session, editor, bytes, controls } = await boot(
    `<w:p>${legacyCheckbox('默认勾选', '', '<w:default w:val="TRUE"/>')}${legacyCheckbox('显式勾选', '', '<w:checked x:keep="empty"/>')}</w:p>`,
  )
  expect(controls().map((c) => c.checked)).toEqual([true, true])
  toggleProtectedForm(editor.view, session.protection, 'form-1')
  toggleProtectedForm(editor.view, session.protection, 'form-2')
  const saved = await session.save(editor.getJSON()),
    read = await openDocx(saved)
  expect(read.protection.readFormControls(read.content).map((c) => c.checked)).toEqual([
    false,
    false,
  ])
  const xml = (await entries(saved))['word/document.xml']!
  expect(xml).toContain('<w:checked x:keep="empty" w:val="0"/>')
  toggleProtectedForm(editor.view, session.protection, 'form-1')
  toggleProtectedForm(editor.view, session.protection, 'form-2')
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('uses private original bytes and PM state despite public session mutations', async () => {
  const { session, editor, bytes } = await boot()
  const original = bytes.slice()
  session.originalBytes.fill(0)
  session.content.content!.splice(0)
  toggleProtectedForm(editor.view, session.protection, 'form-3')
  const saved = await session.save(editor.getJSON()),
    read = await openDocx(saved)
  expect(read.protection.readFormControls(read.content)[2]!.checked).toBe(true)
  toggleProtectedForm(editor.view, session.protection, 'form-3')
  expect(await session.save(editor.getJSON())).toEqual(original)
})
it('escapes custom native glyph text and keeps unknown attributes when reopening', async () => {
  const { session, editor } = await boot(
    `<w:p>${sdtCheckbox('', false, '<w14:checkedState w14:val="26"/>')}</w:p>`,
  )
  toggleProtectedForm(editor.view, session.protection, 'form-1')
  const saved = await session.save(editor.getJSON())
  expect((await entries(saved))['word/document.xml']).toContain('<w:t x:keep="text">&amp;</w:t>')
  const read = await openDocx(saved)
  expect(read.protection.readFormControls(read.content)[0]!.checked).toBe(true)
})

it('uses real schema node sizes after an atomic native page break', async () => {
  const field = '<w:br w:type="page"/>'
  const { session, editor, bytes, controls } = await boot(`${field}<w:p>${legacyCheckbox()}</w:p>`)
  expect(editor.state.doc.firstChild!.type.name).toBe('docProtected')
  expect(controls()[0]!.reason).toBeNull()
  toggleProtectedForm(editor.view, session.protection, 'form-1')
  expect(editor.state.doc.lastChild!.textContent).toBe('☒')
  const saved = await session.save(editor.getJSON()),
    xml = (await entries(saved))['word/document.xml']!
  expect(xml).toContain(field)
  expect(undo(editor.state, editor.view.dispatch)).toBe(true)
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('reports readonly native checked state without guessing malformed state', async () => {
  const { controls } = await boot(
    `<w:tbl><w:tr><w:tc><w:p>${legacyCheckbox('表格内', '', '<w:checked w:val="1"/>')}</w:p></w:tc></w:tr></w:tbl><w:p>${legacyCheckbox('状态损坏', '', '<w:checked w:val="unknown"/>')}</w:p>`,
  )
  expect(controls()[0]).toMatchObject({ checked: true, from: null })
  expect(controls()[0]!.reason).toContain('原生结构')
  expect(controls()[1]!.checked).toBeNull()
  expect(controls()[1]!.reason).toContain('复杂')
})
