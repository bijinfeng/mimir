/** @vitest-environment happy-dom */
import { writeFileSync } from 'node:fs'
import { Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDocx, type DocxSession, type PmDocJson } from './docx.js'
import { saveDocx } from '../vendor/packages/docx-engine/src/patch.js'
import { findInkRuns } from '../vendor/packages/docx-engine/src/ink.js'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { moveBlocks } from '../vendor/apps/docs/src/renderer/editor/move-block.js'
import { docxListSavePlan } from './docx-list-plan.js'
import { designFixture } from './editors/docx-design-test-fixture.js'
import { DocxInkExtension, addDocxInk, removeDocxInk } from './editors/docx-ink.js'
import { docxInkSaveOptions, docxInkUnavailable } from './docx-ink-save.js'
import {
  decodeInkPayload,
  encodeInkPayload,
  INK_ANCHOR,
  inkAnnotations,
  inkBounds,
  inkHit,
  rasterizeInk,
  type InkStroke,
} from './docx-ink-model.js'
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='
const stroke: InkStroke = {
  tool: 'pen',
  color: 'C00000',
  width: 3,
  points: [
    { x: 10, y: 8 },
    { x: 40, y: 16 },
  ],
}
const editors: Editor[] = []
function fixture(name: string, bytes: Uint8Array) {
  if (process.env.MIMIR_DOCX_INK_FIXTURES === '1')
    writeFileSync(`/tmp/mimir-docx-ink-${name}-20261017.docx`, bytes)
}
let ctx: Record<string, unknown>
beforeEach(() => {
  ctx = {
    scale: vi.fn<(...args: number[]) => void>(),
    translate: vi.fn<(...args: number[]) => void>(),
    beginPath: vi.fn<(...args: number[]) => void>(),
    moveTo: vi.fn<(...args: number[]) => void>(),
    lineTo: vi.fn<(...args: number[]) => void>(),
    stroke: vi.fn<(...args: number[]) => void>(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(`data:image/png;base64,${PNG}`)
})
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function mount(session: DocxSession) {
  const editor = new Editor({
    extensions: [...editorExtensions, DocxInkExtension],
    content: session.content,
  })
  editors.push(editor)
  return editor
}
async function sourceInk(payload = encodeInkPayload(stroke)) {
  const original = await openDocx(await designFixture()),
    plan = docxListSavePlan(original.content, original.content, original.blocks)
  fixture('plain', original.originalBytes)
  const result = await saveDocx(
    { ...original.footnotes.parsed, extras: original.extras },
    plan.saveBlocks,
    {
      inks: [
        {
          blockIndex: 0,
          base64: PNG,
          widthPx: inkBounds(stroke).width,
          heightPx: inkBounds(stroke).height,
          offsetXPx: inkBounds(stroke).x,
          offsetYPx: inkBounds(stroke).y,
          payload,
        },
      ],
    },
  )
  fixture(payload === encodeInkPayload(stroke) ? 'original' : 'opaque', result)
  return result
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((p) => !p.dir)
        .map(async (p) => [p.name, await p.async('uint8array')]),
    ),
  )
}
async function xml(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
}
async function save(session: DocxSession, editor: Editor) {
  return session.save(editor.getJSON() as PmDocJson)
}
describe('native DOCX ink persistence', () => {
  it('keeps untouched ink options undefined and every ZIP entry unchanged', async () => {
    const bytes = await sourceInk(),
      session = await openDocx(bytes),
      editor = mount(session)
    const plan = docxListSavePlan(editor.getJSON() as PmDocJson, session.content, session.blocks)
    expect(
      docxInkSaveOptions(
        editor.getJSON() as PmDocJson,
        session.content,
        session.footnotes.parsed,
        plan,
        {},
      ).inks,
    ).toBeUndefined()
    expect(await entries(await save(session, editor))).toEqual(await entries(bytes))
  })
  it('preserves exact original ink runs/media/relationships during ordinary text regeneration', async () => {
    const bytes = await sourceInk(),
      session = await openDocx(bytes),
      editor = mount(session)
    editor.commands.insertContentAt(2, 'changed ')
    const output = await save(session, editor),
      before = await entries(bytes),
      after = await entries(output)
    const runs = findInkRuns(await xml(bytes))
    expect(runs.length).toBe(1)
    expect(await xml(output)).toContain(runs[0]!.xml)
    for (const path of Object.keys(before).filter((candidate) => candidate !== 'word/document.xml'))
      expect(after[path]).toEqual(before[path])
    expect((await openDocx(output)).footnotes.parsed.inks).toHaveLength(1)
  })
  it('writes transparent PNG/vector payload on new paragraphs and reopens as erasable strokes twice', async () => {
    const session = await openDocx(await designFixture()),
      editor = mount(session)
    const pos = editor.state.doc.content.size
    editor.commands.insertContentAt(pos, {
      type: 'docParagraph',
      content: [{ type: 'text', text: 'New anchor' }],
    })
    addDocxInk(editor, editor.state.doc, pos, stroke)
    const first = await save(session, editor),
      reopened = await openDocx(first)
    expect(reopened.footnotes.parsed.inks).toHaveLength(1)
    expect(reopened.footnotes.parsed.inks[0]!.payload).toBe(encodeInkPayload(stroke))
    const native = await xml(first)
    expect(native).toContain('relativeFrom="column"')
    expect(native).toContain('relativeFrom="paragraph"')
    expect(native.indexOf('New anchor')).toBeLessThan(native.indexOf('name="aidocs-ink'))
    const secondEditor = mount(reopened),
      annotations = inkAnnotations(secondEditor.state.doc)
    expect(annotations[0]!.stroke).toEqual(stroke)
    expect(await entries(await save(reopened, secondEditor))).toEqual(await entries(first))
    removeDocxInk(secondEditor, secondEditor.state.doc, [annotations[0]!.id])
    const removed = await save(reopened, secondEditor)
    expect((await openDocx(removed)).footnotes.parsed.inks).toHaveLength(0)
    expect(Object.keys(await entries(removed)).some((path) => path.includes('aidocsink'))).toBe(
      false,
    )
  })
  it('preserves an original PNG content-type override while regenerating its opaque ink paragraph', async () => {
    const zip = await JSZip.loadAsync(await sourceInk('{"v":99,"opaque":"KEEP"}'))
    const path = Object.keys(zip.files).find((name) =>
      /^word\/media\/aidocsink\d+\.png$/.test(name),
    )!
    const types = await zip.file('[Content_Types].xml')!.async('string')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    zip.file('word/_rels/document.xml.rels', rels.replaceAll('><', '>\n<'))
    zip.file(
      '[Content_Types].xml',
      types
        .replace(/<Default\b[^>]*Extension="png"[^>]*\/>/g, '')
        .replace('</Types>', `<Override PartName="/${path}" ContentType="image/png"/></Types>`)
        .replaceAll('><', '>\n<'),
    )
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      session = await openDocx(bytes),
      editor = mount(session)
    editor.commands.insertContentAt(2, 'changed ')
    const output = await save(session, editor),
      before = await entries(bytes),
      after = await entries(output)
    expect(await xml(output)).toContain(findInkRuns(await xml(bytes))[0]!.xml)
    for (const part of Object.keys(before).filter((candidate) => candidate !== 'word/document.xml'))
      expect(after[part]).toEqual(before[part])
    expect((await openDocx(output)).footnotes.parsed.inks[0]!.payload).toBe(
      '{"v":99,"opaque":"KEEP"}',
    )
  })
  it('makes one native undo for anchor + stroke and preserves non-target parts', async () => {
    const bytes = await designFixture(),
      session = await openDocx(bytes),
      editor = mount(session)
    const baseline = editor.state.doc
    addDocxInk(editor, baseline, 0, stroke)
    expect(undoDepth(editor.state)).toBe(1)
    const drawn = await save(session, editor),
      before = await entries(bytes),
      after = await entries(drawn)
    expect(after['custom/untouched.xml']).toEqual(before['custom/untouched.xml'])
    expect(after['word/styles.xml']).toEqual(before['word/styles.xml'])
    editor.commands.undo()
    expect(editor.state.doc.eq(baseline)).toBe(true)
    expect(await entries(await save(session, editor))).toEqual(before)
    editor.commands.redo()
    expect(await entries(await save(session, editor))).toEqual(after)
  })
  it('moves with its original paragraph, disappears on deletion and returns on undo', async () => {
    const session = await openDocx(await sourceInk()),
      editor = mount(session),
      id = inkAnnotations(editor.state.doc)[0]!.anchor
    editor.commands.setTextSelection(1)
    moveBlocks(editor, 1)
    expect(editor.state.doc.child(1).attrs[INK_ANCHOR]).toBe(id)
    const moved = await save(session, editor),
      reopened = await openDocx(moved)
    expect(reopened.footnotes.parsed.inks[0]!.anchorIndex).toBe(
      reopened.blocks.filter((b) => !b.hidden)[1]!.docxIndex,
    )
    const pos = editor.state.doc.child(0).nodeSize,
      node = editor.state.doc.child(1)
    editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize })
    expect((await openDocx(await save(session, editor))).footnotes.parsed.inks).toHaveLength(0)
    editor.commands.undo()
    expect(inkAnnotations(editor.state.doc)[0]!.anchor).toBe(id)
    expect((await openDocx(await save(session, editor))).footnotes.parsed.inks).toHaveLength(1)
  })
  it('does not copy ink anchors when pasting before the original or splitting a paragraph', async () => {
    const session = await openDocx(await sourceInk()),
      editor = mount(session),
      original = editor.state.doc.child(0)
    const id = original.attrs[INK_ANCHOR]
    editor.view.dispatch(editor.state.tr.insert(0, original))
    expect(editor.state.doc.child(0).attrs[INK_ANCHOR]).toBeNull()
    expect(editor.state.doc.child(1).attrs[INK_ANCHOR]).toBe(id)
    const pos = editor.state.doc.child(0).nodeSize
    editor.commands.setTextSelection(pos + 3)
    editor.commands.splitBlock()
    const anchors: string[] = []
    editor.state.doc.forEach((n) => {
      if (n.attrs[INK_ANCHOR] === id) anchors.push(id)
    })
    expect(anchors).toHaveLength(1)
    const preserved = await openDocx(await save(session, editor))
    expect(preserved.footnotes.parsed.inks).toHaveLength(1)
    expect(preserved.footnotes.parsed.inks[0]!.anchorIndex).toBe(
      preserved.blocks.filter((b) => !b.hidden)[1]!.docxIndex,
    )
    const latest = inkAnnotations(editor.state.doc)[0]!
    removeDocxInk(editor, editor.state.doc, [latest.id])
    expect((await openDocx(await save(session, editor))).footnotes.parsed.inks).toHaveLength(0)
  })
  it('keeps table-owned ink read-only and does not strip it when Tiptap serializes the document', async () => {
    const zip = await JSZip.loadAsync(await sourceInk()),
      document = await zip.file('word/document.xml')!.async('string')
    const paragraph = /<w:body><w:p[\s>][\s\S]*?<\/w:p>/.exec(document)![0].slice('<w:body>'.length)
    const table = `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr/>${paragraph}</w:tc></w:tr></w:tbl>`
    zip.file(
      'word/document.xml',
      document.replace(paragraph, () => table),
    )
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      session = await openDocx(bytes),
      editor = mount(session)
    fixture('table', bytes)
    expect(docxInkUnavailable(session.content, session.footnotes.parsed)).toContain('未显示')
    expect(await entries(await save(session, editor))).toEqual(await entries(bytes))
    expect((await openDocx(await save(session, editor))).footnotes.parsed.inks).toHaveLength(1)
  })
  it('rejects ink resources shared with ordinary images and reserved-name collisions', async () => {
    const bytes = await sourceInk(),
      zip = await JSZip.loadAsync(bytes),
      document = await xml(bytes)
    const run = findInkRuns(document)[0]!
    const picture = run.xml.replace(/name="aidocs-ink[^"]*"/g, 'name="Ordinary image"')
    zip.file('word/document.xml', document.replace('</w:body>', `<w:p>${picture}</w:p></w:body>`))
    const shared = await zip.generateAsync({ type: 'uint8array' }),
      session = await openDocx(shared)
    expect(docxInkUnavailable(session.content, session.footnotes.parsed)).toContain('共享资源')
    expect(await entries(await session.save(session.content))).toEqual(await entries(shared))
    const editor = mount(session)
    addDocxInk(editor, editor.state.doc, 0, stroke)
    await expect(save(session, editor)).rejects.toThrow('共享资源')
    const bare = await JSZip.loadAsync(await designFixture())
    bare.file('word/media/aidocsink1.png', PNG, { base64: true })
    const collision = await openDocx(await bare.generateAsync({ type: 'uint8array' }))
    expect(docxInkUnavailable(collision.content, collision.footnotes.parsed)).toContain('归属')
  })
  it('keeps extra vector fields, unknown native attributes and external picture geometry read-only', async () => {
    const original = await sourceInk()
    for (const change of [
      (value: string) => value.replace('name="aidocs-ink', 'custom="KEEP" name="aidocs-ink'),
      (value: string) =>
        value.replace('<wp:posOffset>71438</wp:posOffset>', '<wp:posOffset>999999</wp:posOffset>'),
    ]) {
      const zip = await JSZip.loadAsync(original)
      zip.file('word/document.xml', change(await xml(original)))
      const bytes = await zip.generateAsync({ type: 'uint8array' }),
        session = await openDocx(bytes)
      expect(docxInkUnavailable(session.content, session.footnotes.parsed)).toContain('无法识别')
      expect(inkAnnotations(session.content)[0]!.stroke).toBeNull()
      expect(await entries(await session.save(session.content))).toEqual(await entries(bytes))
    }
    const extra = JSON.parse(encodeInkPayload(stroke))
    extra.pressure = [1, 2]
    const session = await openDocx(await sourceInk(JSON.stringify(extra)))
    expect(docxInkUnavailable(session.content, session.footnotes.parsed)).toContain('无法识别')
  })
  it('preserves unknown payload byte-for-byte and rejects all ink mutations', async () => {
    const bytes = await sourceInk('{"v":99,"opaque":"KEEP"}'),
      session = await openDocx(bytes),
      editor = mount(session)
    expect(docxInkUnavailable(session.content, session.footnotes.parsed)).toContain('无法识别')
    expect(await entries(await save(session, editor))).toEqual(await entries(bytes))
    addDocxInk(editor, editor.state.doc, 0, stroke)
    await expect(save(session, editor)).rejects.toThrow('无法识别')
  })
})
describe('ink payload and raster geometry', () => {
  it('rejects malformed, unbounded and unknown vectors', () => {
    for (const value of [
      null,
      '{}',
      '[]',
      JSON.stringify({ v: 1, ...stroke, points: [[NaN, 2]] }),
      JSON.stringify({ v: 1, ...stroke, color: 'red', points: [[0, 0]] }),
      JSON.stringify({ v: 1, ...stroke, width: 0, points: [[0, 0]] }),
      JSON.stringify({ v: 1, ...stroke, points: [[Infinity, 2]] }),
    ])
      expect(decodeInkPayload(value)).toBeNull()
    expect(decodeInkPayload(encodeInkPayload(stroke))).toEqual(stroke)
  })
  it('hit-tests actual segments/dots and rasterizes with transparent margin and highlighter opacity', () => {
    expect(inkHit(stroke, { x: 25, y: 12 })).toBe(true)
    expect(inkHit(stroke, { x: 25, y: 50 })).toBe(false)
    expect(inkHit({ ...stroke, points: [{ x: 1, y: 1 }] }, { x: 2, y: 1 })).toBe(true)
    const bounds = inkBounds(stroke)
    expect(bounds.x).toBe(7.5)
    rasterizeInk({ ...stroke, tool: 'highlighter' })
    expect(ctx.globalAlpha).toBe(0.45)
    expect(ctx.scale).toHaveBeenCalledWith(2, 2)
    expect(ctx.translate).toHaveBeenCalledWith(-bounds.x, -bounds.y)
    expect(() =>
      rasterizeInk({
        ...stroke,
        points: [
          { x: 0, y: 0 },
          { x: 99999, y: 99999 },
        ],
      }),
    ).toThrow('范围过大')
  })
})
