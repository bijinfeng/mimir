// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { afterEach, expect, it } from 'vitest'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx, type PmDocJson } from '../docx.js'
import { liveDocxStyleState } from '../docx-styles.js'
import { createDocxAgentHandle, docxAgentLiveSections } from '../agent/docx-agent.js'
import {
  DESIGN_ATTR,
  PAGE_BORDER_ATTR,
  docxDesignSaveOptions,
  liveDocxTheme,
  patchPageBorder,
} from '../docx-design-save.js'
import {
  applyDocxDesign,
  docxDesignTarget,
  docxDesignSections,
  DocxDesignExtension,
  DESIGN_THEMES,
} from './docx-design.js'
import { docxThemeDecorations, DocxThemePreviewExtension } from './DocxDesignPreview.js'

import { designFixture, DESIGN_TEST_SECTION as SECTION } from './docx-design-test-fixture.js'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
async function boot(theme = true) {
  const session = await openDocx(await designFixture(theme))
  const editor = new Editor({
    extensions: [...editorExtensions, DocxDesignExtension, DocxThemePreviewExtension],
    content: session.content,
  })
  editors.push(editor)
  const sections = () =>
    docxDesignSections(editor.state.doc, docxAgentLiveSections(editor, session, {}))
  return {
    editor,
    session,
    sections,
    target: () => docxDesignTarget(editor, sections()),
    save: () => session.save(editor.getJSON() as PmDocJson),
  }
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.keys(zip.files).map(async (key) => [
        key,
        (await zip.file(key)?.async('string')) ?? 'directory',
      ]),
    ),
  )
}
it('patches only pgBorders, including a self-closing section, and rejects ambiguous sections', () => {
  const cleared = patchPageBorder(SECTION, false)
  expect(cleared).toBe(SECTION.replace(/<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/, ''))
  const boxed = patchPageBorder(SECTION, true)
  expect(boxed).toContain('w:sz="4" w:space="24"')
  expect(boxed.replace(/<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/, '')).toBe(cleared)
  expect(patchPageBorder('<w:sectPr/>', true)).toContain('</w:pgBorders></w:sectPr>')
  expect(() => patchPageBorder(SECTION + SECTION, false)).toThrow('可靠定位')
})
it('changes current internal section only, keeps unrelated XML and native undo/redo on repeated saves', async () => {
  const { editor, session, sections, target, save } = await boot()
  expect(sections()).toHaveLength(2)
  const baseline = await entries(await save())
  applyDocxDesign(editor, target(), {}, { enabled: false, scope: 'section' })
  expect(sections().map((s) => s.settings.pageBorder)).toEqual([false, true])
  const changed = await entries(await save())
  expect(changed['word/document.xml'].match(/<w:pgBorders\b/g)).toHaveLength(1)
  for (const key of Object.keys(baseline).filter((name) => name !== 'word/document.xml'))
    expect(changed[key]).toBe(baseline[key])
  expect(await entries(await save())).toEqual(changed)
  editor.commands.undo()
  expect(await entries(await save())).toEqual(baseline)
  editor.commands.redo()
  expect(await entries(await save())).toEqual(changed)
  const reopened = await openDocx(await save())
  expect(reopened.sections.map((s) => s.settings.pageBorder)).toEqual([false, true])
  expect(session.sections[0]!.sectPrXml).toBe(SECTION)
})
it('applies all-section box plus page background atomically, keeps typed text, and isolates later typing', async () => {
  const { editor, target, save, sections } = await boot()
  editor.commands.setTextSelection(2)
  editor.commands.insertContent('manual ')
  applyDocxDesign(editor, target(), { pageColor: 'FFF9E6' }, { enabled: true, scope: 'document' })
  const applied = await entries(await save())
  expect(applied['word/document.xml']).toContain('manual ')
  expect(applied['word/document.xml'].match(/w:offsetFrom="page"/g)).toHaveLength(2)
  expect(sections().every((s) => s.settings.pageBorderProps?.widthPt === 0.5)).toBe(true)
  editor.commands.insertContent('later ')
  editor.commands.undo()
  expect(await entries(await save())).toEqual(applied)
  editor.commands.undo()
  const undone = await entries(await save())
  expect(undone['word/document.xml']).toContain('manual ')
  expect(undone['word/document.xml']).not.toContain('w:color="FFF9E6"')
  expect(undone['word/document.xml'].match(/w:offsetFrom="text"/g)).toHaveLength(2)
})
it('changes theme part and background without materializing theme runs or changing custom borders', async () => {
  const { editor, session, target, save } = await boot()
  const baseline = await entries(await save())
  const theme = DESIGN_THEMES[1]!
  applyDocxDesign(editor, target(), {
    fonts: theme.fonts,
    colors: theme.colors,
    pageColor: 'E8F1FB',
  })
  const options = docxDesignSaveOptions(editor.state.doc, {}, session)
  const preview = await liveDocxStyleState(session, options)
  expect(preview.docDefaults?.asciiFont).toBe('Trebuchet MS')
  expect(preview.docDefaults?.color).toBe('90C226')
  const changed = await entries(await save())
  expect(changed['word/document.xml']).toContain('w:themeColor="accent1" w:themeTint="80"')
  expect(changed['word/document.xml']).toContain('w:ascii="Courier New"')
  expect(changed['word/document.xml'].match(/<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/g)).toEqual(
    baseline['word/document.xml'].match(/<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/g),
  )
  expect(changed['word/styles.xml']).toBe(baseline['word/styles.xml'])
  const reopened = await openDocx(await save())
  expect(reopened.footnotes.parsed.themeFonts?.minor).toBe('Trebuchet MS')
  expect(reopened.footnotes.parsed.themeColors?.accent1).toBe('90C226')
  editor.commands.undo()
  expect(await entries(await save())).toEqual(baseline)
  editor.commands.redo()
  expect(await entries(await save())).toEqual(changed)
})
it('creates missing theme natively, restores original theme and explicitly clears background', async () => {
  const { editor, session, target, save } = await boot(false)
  applyDocxDesign(editor, target(), {
    fonts: DESIGN_THEMES[2]!.fonts,
    colors: DESIGN_THEMES[2]!.colors,
    pageColor: 'FFF9E6',
  })
  expect((await openDocx(await save())).footnotes.parsed.themeFonts?.minor).toBe('Century Gothic')
  applyDocxDesign(editor, target(), { fonts: null, colors: null, pageColor: null })
  const restored = await entries(await save())
  expect(restored['word/theme/theme1.xml']).toBeUndefined()
  expect(restored['word/document.xml']).not.toContain('<w:background')
  expect(
    (await liveDocxTheme(session, docxDesignSaveOptions(editor.state.doc, {}, session))).fonts,
  ).toBeNull()
})
it('theme preview changes only original theme refs, honors tint, and leaves explicit manual edits', async () => {
  const { editor } = await boot()
  const theme = DESIGN_THEMES[1]!
  const decorations = docxThemeDecorations(editor.state.doc, theme).find()
  expect(decorations).toHaveLength(1)
  expect(
    (decorations[0] as unknown as { type: { attrs: { style: string } } }).type.attrs.style,
  ).toContain('Trebuchet MS')
  expect(
    (decorations[0] as unknown as { type: { attrs: { style: string } } }).type.attrs.style,
  ).toContain('color:#')
  expect(
    (decorations[0] as unknown as { type: { attrs: { style: string } } }).type.attrs.style,
  ).toContain('--dk-c:')
  expect(
    (decorations[0] as unknown as { type: { attrs: { style: string } } }).type.attrs.style,
  ).not.toContain('#90C226 !important')
  const node = editor.state.doc.child(1).firstChild!
  const mark = node.marks.find((m) => m.type.name === 'docTextStyle')!
  const from = editor.state.doc.child(0).nodeSize + 1
  editor.view.dispatch(
    editor.state.tr.addMark(
      from,
      from + node.nodeSize,
      mark.type.create({ ...mark.attrs, font: 'Arial', fontAscii: 'Arial', color: 'FF0000' }),
    ),
  )
  expect(docxThemeDecorations(editor.state.doc, theme).find()).toHaveLength(0)
})
it('rejects stale targets, does not dirty on no-op, and binds border metadata to the ending paragraph', async () => {
  const { editor, target } = await boot()
  const original = target()
  applyDocxDesign(editor, original, {})
  expect(editor.state.doc).toBe(original.doc)
  applyDocxDesign(editor, original, {}, { enabled: false, scope: 'section' })
  expect(editor.state.doc.child(0).attrs[PAGE_BORDER_ATTR]).toBe(false)
  expect(editor.state.doc.attrs[DESIGN_ATTR]).toBeNull()
  expect(() => applyDocxDesign(editor, original, { pageColor: 'FFFFFF' })).toThrow('文档已变化')
})

it('keeps custom theme targets and graphic backgrounds readable and refuses unsafe replacements', async () => {
  const zip = await JSZip.loadAsync(await designFixture())
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    rels.replace('Target="theme/theme1.xml"', 'Target="theme/custom.xml"'),
  )
  const custom = await openDocx(await zip.generateAsync({ type: 'uint8array' }))
  const doc = structuredClone(custom.content)
  doc.attrs = { [DESIGN_ATTR]: { fonts: DESIGN_THEMES[1]!.fonts } }
  expect((await liveDocxTheme(custom, {})).themeSupported).toBe(false)
  await expect(custom.save(doc)).rejects.toThrow('自定义主题路径')
  // Upstream only replaces self-closing backgrounds; reject rather than duplicate it.
  const normal = await JSZip.loadAsync(await designFixture())
  const xml = await normal.file('word/document.xml')!.async('string')
  normal.file(
    'word/document.xml',
    xml.replace(
      '<w:body>',
      '<w:background w:color="F2F2F2"><v:background xmlns:v="urn:schemas-microsoft-com:vml"/></w:background><w:body>',
    ),
  )
  const graphic = await openDocx(await normal.generateAsync({ type: 'uint8array' }))
  expect((await liveDocxTheme(graphic, {})).pageColorSupported).toBe(false)
  const edit = structuredClone(graphic.content)
  edit.attrs = { [DESIGN_ATTR]: { pageColor: 'FFFFFF' } }
  await expect(graphic.save(edit)).rejects.toThrow('图形页面背景')
  expect((await entries(await graphic.save(graphic.content)))['word/document.xml']).toContain(
    '<v:background',
  )
})

it.each(['single-quoted custom', 'paired custom', 'dangling default', 'external default'])(
  'refuses the %s theme relationship before native save can add or patch an unrelated theme',
  async (variant) => {
    const zip = await JSZip.loadAsync(await designFixture())
    let rel =
      '<Relationship Id="rTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'
    if (variant.endsWith('custom')) {
      rel = rel.replace('theme/theme1.xml', 'theme/custom.xml')
      zip.file('word/theme/custom.xml', await zip.file('word/theme/theme1.xml')!.async('string'))
      zip.remove('word/theme/theme1.xml')
    }
    if (variant === 'single-quoted custom') rel = rel.replaceAll('"', "'")
    if (variant === 'paired custom') rel = rel.replace('/>', '></Relationship>')
    if (variant === 'dangling default') zip.remove('word/theme/theme1.xml')
    if (variant === 'external default') rel = rel.replace('/>', ' TargetMode="External"/>')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    zip.file(
      'word/_rels/document.xml.rels',
      rels.replace(/<Relationship\b[^>]*Type="[^"]*\/theme"[^>]*\/>/, rel),
    )
    const session = await openDocx(await zip.generateAsync({ type: 'uint8array' }))
    expect((await liveDocxTheme(session, {})).themeSupported).toBe(false)
    const edited = structuredClone(session.content)
    edited.attrs = { [DESIGN_ATTR]: { fonts: DESIGN_THEMES[1]!.fonts } }
    await expect(session.save(edited)).rejects.toThrow('自定义主题路径')
  },
)

it.each(['single-quoted', 'paired'])(
  'patches the canonical internal theme with a %s relationship and preserves that relationship source',
  async (variant) => {
    const zip = await JSZip.loadAsync(await designFixture())
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    const source = rels.replace(/<Relationship\b[^>]*Type="[^"]*\/theme"[^>]*\/>/, (rel) =>
      variant === 'single-quoted'
        ? rel.replaceAll('"', "'")
        : rel.replace('/>', '></Relationship>'),
    )
    zip.file('word/_rels/document.xml.rels', source)
    const session = await openDocx(await zip.generateAsync({ type: 'uint8array' }))
    expect((await liveDocxTheme(session, {})).themeSupported).toBe(true)
    const edited = structuredClone(session.content)
    edited.attrs = { [DESIGN_ATTR]: { colors: DESIGN_THEMES[1]!.colors } }
    const saved = await session.save(edited)
    expect((await openDocx(saved)).footnotes.parsed.themeColors?.accent1).toBe('90C226')
    expect((await entries(saved))['word/_rels/document.xml.rels']).toBe(source)
  },
)

it('refuses tracked section properties before changing the canvas or historical border XML', async () => {
  const previous =
    '<w:sectPrChange w:id="7"><w:sectPr><w:pgBorders><w:top w:val="double"/></w:pgBorders></w:sectPr></w:sectPrChange>'
  const tracked = `<w:sectPr><w:cols/>${previous}</w:sectPr>`
  expect(() => patchPageBorder(tracked, false)).toThrow('修订')
  const { editor, sections } = await boot()
  const original = editor.state.doc
  const currentSections = sections()
  currentSections[0] = { ...currentSections[0]!, sectPrXml: tracked }
  const target = docxDesignTarget(editor, currentSections)
  expect(() =>
    applyDocxDesign(editor, target, { pageColor: 'FFFFFF' }, { enabled: false, scope: 'section' }),
  ).toThrow('修订')
  expect(editor.state.doc).toBe(original)
})

it('keeps manual design attributes in the Agent round snapshot and protects later manual design edits', async () => {
  const { editor, session, target, save } = await boot()
  applyDocxDesign(
    editor,
    target(),
    { colors: DESIGN_THEMES[1]!.colors, pageColor: 'FFF9E6' },
    { enabled: false, scope: 'section' },
  )
  const baseline = await entries(await save())
  const handle = createDocxAgentHandle(editor, 'design-snapshot', {
    session,
    isDirty: () => true,
    onDirtyChange: () => {},
  })
  try {
    await handle.execute(
      'apply_ops',
      {
        ops: [
          {
            op: 'findReplace',
            target: { blockIndexes: [1] },
            find: 'Theme run',
            replace: 'Agent run',
          },
        ],
      },
      { roundId: 'design' },
    )
    expect(editor.state.doc.textContent).toContain('Agent run')
    expect(handle.undoRound('design')).toBe(true)
    expect(await entries(await save())).toEqual(baseline)
    await handle.execute(
      'apply_ops',
      {
        ops: [
          {
            op: 'findReplace',
            target: { blockIndexes: [1] },
            find: 'Theme run',
            replace: 'Agent again',
          },
        ],
      },
      { roundId: 'manual-after' },
    )
    applyDocxDesign(editor, target(), { pageColor: 'E8F1FB' })
    expect(handle.undoRound('manual-after')).toBe(false)
    expect(editor.state.doc.textContent).toContain('Agent again')
    expect(editor.state.doc.attrs[DESIGN_ATTR].pageColor).toBe('E8F1FB')
  } finally {
    handle.dispose()
  }
})
