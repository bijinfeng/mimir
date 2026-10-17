/** @vitest-environment happy-dom */
import JSZip from 'jszip'
import { Editor } from '@tiptap/core'
import { closeHistory, undoDepth } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, expect, it, vi } from 'vitest'
import { openDocx, type PmDocJson } from './docx.js'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import {
  applyRevisions,
  collectRevisions,
  TRACK_IGNORE,
} from '../vendor/apps/docs/src/renderer/editor/revisions.js'
import { forcedTrackingFixture } from './docx-forced-tracking-fixture.test-helper.js'
import * as engine from '../vendor/packages/docx-engine/src/index.js'
import { DocxInkExtension } from './editors/docx-ink.js'
import { DocxProtectionExtension } from './editors/docx-protection.js'
import { createDocxAgentHandle } from './agent/docx-agent.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import { passwordAttrs } from './docx-protection-password-fixture.test-helper.js'
import { RealDocxPasswordWorker } from './docx-protection-password-test-helper.js'
import { nativeTrackedTextParagraph } from './docx-forced-tracking.js'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  RealDocxPasswordWorker.instances.splice(0).forEach((worker) => worker.terminate())
})

async function boot(mode?: string, guard = true, source?: Uint8Array) {
  const bytes = source ?? (await forcedTrackingFixture(mode)),
    session = await openDocx(bytes),
    blocked = vi.fn<(reason: string) => void>()
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      ...editorExtensions,
      DocxInkExtension,
      ...(guard
        ? [
            DocxProtectionExtension.configure({
              controller: session.protection,
              onBlocked: blocked,
            }),
          ]
        : []),
    ],
    content: session.content,
  })
  const saveOptions: { current: SaveOptions } = { current: {} }
  let dirty = false
  const handle = createDocxAgentHandle(editor, 'tracked-document', {
    session,
    saveOptions,
    isDirty: () => dirty,
    onDirtyChange: (next) => {
      dirty = next
    },
  })
  cleanup.push(() => {
    handle.dispose()
    editor.destroy()
  })
  return { bytes, session, editor, blocked, handle, saveOptions, dirty: () => dirty }
}
async function xml(bytes: Uint8Array, path = 'word/document.xml') {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}
async function untouched(before: Uint8Array, after: Uint8Array) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  expect(Object.keys(a.files).toSorted()).toEqual(Object.keys(b.files).toSorted())
  for (const [name, part] of Object.entries(a.files).filter(
    ([entryName, entry]) => !entry.dir && entryName !== 'word/document.xml',
  ))
    expect(await b.file(name)!.async('uint8array')).toEqual(await part.async('uint8array'))
}
it('refuses native formatting values and nesting that the text revision model cannot preserve', () => {
  expect(
    nativeTrackedTextParagraph(
      '<w:p><w:r><w:rPr><w:b/><w:u w:val="single"/></w:rPr><w:t>supported</w:t></w:r></w:p>',
    ),
  ).toBe(true)
  for (const body of [
    '<w:r><w:rPr><w:u w:val="double"/></w:rPr><w:t>x</w:t></w:r>',
    '<w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>x</w:t></w:r>',
    '<w:r><w:rPr><w:b w:val="unknown"/></w:rPr><w:t>x</w:t></w:r>',
    '<w:ins><w:del><w:r><w:t>x</w:t></w:r></w:del></w:ins>',
    '<w:r><w:rPr><w:b/><w:b w:val="0"/></w:rPr><w:t>x</w:t></w:r>',
    '<w:r><w:t>x</w:t><w:rPr><w:i/></w:rPr></w:r>',
    '<w:r><w:rPr><w:b/><w:bCs w:val="0"/></w:rPr><w:t>x</w:t></w:r>',
    '<w:r><w:rPr><w:iCs/></w:rPr><w:t>x</w:t></w:r>',
    '<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="24"/></w:rPr><w:t>x</w:t></w:r>',
  ])
    expect(nativeTrackedTextParagraph(`<w:p>${body}</w:p>`)).toBe(false)
})
it('forces manual insertion/deletion/replacement despite mutable storage, saves native metadata and preserves old revisions/non-target parts', async () => {
  const app = await boot(),
    { editor, session } = app
  expect(session.protection.getAccess()).toMatchObject({ writable: true, mandatoryTracking: true })
  expect(await session.save(editor.getJSON())).toEqual(app.bytes)
  editor.storage.trackChanges.enabled = false
  editor.view.dispatch(editor.state.tr.insertText('Added ', 1))
  editor.storage.trackChanges.enabled = false
  editor.view.dispatch(closeHistory(editor.state.tr).insertText('replacement', 7, 12))
  expect(editor.storage.trackChanges.enabled).toBe(true)
  expect(collectRevisions(editor.state.doc).map((r) => r.kind)).toEqual(
    expect.arrayContaining(['ins', 'del']),
  )
  const saved = await session.save(editor.getJSON()),
    native = await xml(saved)
  expect(native).toContain('<w:ins')
  expect(native).toContain('<w:del')
  expect(native).toContain('w:author="Original"')
  expect(native).toContain('existing insertion')
  expect(native).toContain('existing deletion')
  expect(native).toContain('<w:delText')
  expect(native).toContain('x:keep="opaque"')
  await untouched(app.bytes, saved)
  const reopened = await openDocx(saved)
  expect(reopened.protection.getAccess().mandatoryTracking).toBe(true)
  expect(await reopened.save(reopened.content)).toEqual(saved)
})
it('records composition transactions synchronously and deleting own new text returns exact original bytes', async () => {
  const { editor, session, bytes } = await boot()
  editor.view.dispatch(editor.state.tr.insertText('临时🙂', 1).setMeta('composition', 7))
  expect(editor.state.doc.firstChild!.firstChild!.marks.some((m) => m.type.name === 'ins')).toBe(
    true,
  )
  editor.view.dispatch(editor.state.tr.delete(1, 5).setMeta('composition', 7))
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('handles overlapping inline steps atomically without throwing from the recorder', async () => {
  const { editor, session, bytes } = await boot()
  const tr = editor.state.tr.insertText('abc', 1).delete(2, 3)
  expect(() => editor.view.dispatch(tr)).not.toThrow()
  // The bounded recorder may safely refuse the complete transaction or publish
  // tracked text. Either outcome must remain savable with the original intact.
  const saved = await session.save(editor.getJSON())
  await untouched(bytes, saved)
})
it('refuses overlapping steps before publishing history/version and still tracks disjoint steps', async () => {
  const { editor, session, handle, blocked } = await boot()
  const before = editor.state.doc,
    version = handle.getVersion(),
    depth = undoDepth(editor.state)
  editor.view.dispatch(editor.state.tr.insertText('abc', 1).delete(2, 3))
  expect(editor.state.doc).toBe(before)
  expect(handle.getVersion()).toBe(version)
  expect(undoDepth(editor.state)).toBe(depth)
  expect(blocked).toHaveBeenCalledWith(expect.stringMatching(/强制修订.*重叠/))
  editor.view.dispatch(editor.state.tr.insertText('one', 1).insertText('two', 9))
  const native = await xml(await session.save(editor.getJSON()))
  expect(native).toContain('one')
  expect(native).toContain('two')
})
it('does not publish history/version when deleting text that is already retained as a deletion', async () => {
  const { editor, session, handle } = await boot()
  editor.view.dispatch(editor.state.tr.delete(1, 2))
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)))
  const before = editor.state.doc,
    version = handle.getVersion(),
    depth = undoDepth(editor.state)
  editor.view.dispatch(editor.state.tr.delete(1, 2))
  expect(editor.state.doc).toBe(before)
  expect(handle.getVersion()).toBe(version)
  expect(undoDepth(editor.state)).toBe(depth)
  await session.save(editor.getJSON())
})
it('tracks adjacent non-overlapping replacements in a single transaction', async () => {
  const { editor, session, blocked } = await boot()
  editor.view.dispatch(editor.state.tr.insertText('X', 1, 2).insertText('L', 2, 3))
  expect(blocked).not.toHaveBeenCalled()
  const native = await xml(await session.save(editor.getJSON()))
  expect(native).toContain('L')
  expect(
    collectRevisions(editor.state.doc).filter((revision) => revision.kind === 'ins'),
  ).toHaveLength(3)
})
it('saves adjacent variable-length replacements without changing the protected original projection', async () => {
  const { editor, session, blocked, bytes } = await boot()
  editor.view.dispatch(editor.state.tr.insertText('ABC', 1, 2).insertText('XYZW', 4, 5))
  expect(blocked).not.toHaveBeenCalled()
  const saved = await session.save(editor.getJSON()),
    native = await xml(saved)
  expect(native).toContain('ABC')
  expect(native).toContain('XYZW')
  await untouched(bytes, saved)
})
it('continues to accept ordinary Agent paragraphs with supported inline text styles', async () => {
  const { editor, session, handle } = await boot()
  expect(
    await handle.execute('replace_blocks', {
      startBlockIndex: 0,
      endBlockIndex: 0,
      html: '<p><strong>Bold</strong><em>Italic</em> text</p>',
    }),
  ).toMatchObject({ changed: true })
  expect(
    editor.state.doc.firstChild!.firstChild!.marks.some((mark) => mark.type.name === 'bold'),
  ).toBe(true)
  const saved = await session.save(editor.getJSON()),
    native = await xml(saved)
  expect(native).toContain('<w:b')
  expect(native).toContain('Bold')
  expect(native).toContain('<w:iCs')
  const reopened = await boot(undefined, true, saved)
  reopened.editor.view.dispatch(reopened.editor.state.tr.insertText('next', 1))
  expect(reopened.blocked).not.toHaveBeenCalled()
  expect(await xml(await reopened.session.save(reopened.editor.getJSON()))).toContain('next')
})
it.each([
  '<p><span style="color:#335599;font-size:12pt">Color and size</span></p>',
  '<p><u>Underline</u><s>Strike</s></p>',
])('saves accepted inline Agent styles without native readback drift: %s', async (html) => {
  const { editor, session, handle, bytes } = await boot()
  expect(
    await handle.execute('replace_blocks', { startBlockIndex: 0, endBlockIndex: 0, html }),
  ).toMatchObject({ changed: true })
  const saved = await session.save(editor.getJSON())
  await untouched(bytes, saved)
  const reopened = await boot(undefined, true, saved)
  reopened.editor.view.dispatch(reopened.editor.state.tr.insertText('next', 1))
  expect(reopened.blocked).not.toHaveBeenCalled()
  expect(await xml(await reopened.session.save(reopened.editor.getJSON()))).toContain('next')
})
it('makes consecutive forward deletions advance over retained deleted text', async () => {
  const { editor, session } = await boot()
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)))
  for (let i = 0; i < 3; i++) {
    const from = editor.state.selection.from
    editor.view.dispatch(editor.state.tr.delete(from, from + 1))
  }
  const revisions = collectRevisions(editor.state.doc).filter((revision) => revision.kind === 'del')
  expect(
    revisions.map((revision) => editor.state.doc.textBetween(revision.from, revision.to)).join(''),
  ).toContain('Alp')
  await session.save(editor.getJSON())
})
it('saves edits inside an original insertion with all old revision identities intact', async () => {
  const { editor, session, bytes } = await boot()
  const at = editor.state.doc.firstChild!.nodeSize + 1 + 'Before '.length
  editor.view.dispatch(editor.state.tr.insertText('X', at, at + 1))
  const saved = await session.save(editor.getJSON())
  expect(await xml(saved)).toContain('X')
  await untouched(bytes, saved)
})
it.each(['<w:u w:val="none"/>', '<w:strike w:val="0"/>'])(
  'preserves an explicit disabled run format %s or refuses its native paragraph before editing',
  async (property) => {
    const zip = await JSZip.loadAsync(await forcedTrackingFixture())
    zip.file(
      'word/document.xml',
      (await zip.file('word/document.xml')!.async('string')).replace(
        '<w:t>Alpha',
        `<w:rPr>${property}</w:rPr><w:t>Alpha`,
      ),
    )
    const { editor, session } = await boot(
      undefined,
      true,
      await zip.generateAsync({ type: 'uint8array' }),
    )
    editor.view.dispatch(editor.state.tr.insertText('new', 1))
    const native = await xml(await session.save(editor.getJSON()))
    expect(native).toContain(property)
  },
)
it('rejects same-content manual and Agent edits without dirty, history or revision changes', async () => {
  const { editor, handle, session, bytes, dirty } = await boot()
  const before = editor.state.doc,
    depth = undoDepth(editor.state),
    version = handle.getVersion()
  editor.view.dispatch(editor.state.tr.insertText('Alpha', 1, 6))
  expect(editor.state.doc).toBe(before)
  expect(undoDepth(editor.state)).toBe(depth)
  expect(handle.getVersion()).toBe(version)
  expect(
    await handle.execute('replace_blocks', {
      startBlockIndex: 0,
      endBlockIndex: 0,
      html: '<p>Alpha beta 中文🙂</p>',
    }),
  ).toMatchObject({ changed: false })
  expect(dirty()).toBe(false)
  expect(await session.save(editor.getJSON())).toEqual(bytes)
})
it('keeps the caret before retained deleted text during consecutive Backspace edits', async () => {
  const { editor, session } = await boot()
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)))
  for (let i = 0; i < 3; i++) {
    const from = editor.state.selection.from
    editor.view.dispatch(editor.state.tr.delete(from - 1, from))
    expect(editor.state.selection.from).toBe(from - 1)
  }
  expect(editor.state.doc.firstChild!.textContent).toBe('Alpha beta 中文🙂')
  const native = await xml(await session.save(editor.getJSON()))
  expect(native).toContain('<w:del')
  expect(native).toContain('<w:delText')
})
it('allocates explicit distinct native revision identities across paragraphs without colliding with original ids', async () => {
  const zip = await JSZip.loadAsync(await forcedTrackingFixture())
  zip.file(
    'word/document.xml',
    (await zip.file('word/document.xml')!.async('string'))
      .replace('w:id="11"', 'w:id="9001"')
      .replace('w:id="12"', 'w:id="1"'),
  )
  const { editor, session } = await boot(
    undefined,
    true,
    await zip.generateAsync({ type: 'uint8array' }),
  )
  editor.view.dispatch(editor.state.tr.insertText('first', 1))
  editor.view.dispatch(
    closeHistory(editor.state.tr).insertText('second', editor.state.doc.firstChild!.nodeSize + 1),
  )
  const native = await xml(await session.save(editor.getJSON()))
  const ids = [...native.matchAll(/<w:(?:ins|del)\b[^>]*\bw:id="(\d+)"/g)].map((match) => match[1])
  expect(ids).toContain('9001')
  expect(ids).toContain('1')
  expect(new Set(ids).size).toBe(ids.length)
})
it('real modification-password verification unlocks only tracked editing and preserves credentials on native save/reopen', async () => {
  vi.stubGlobal('Worker', RealDocxPasswordWorker)
  const zip = await JSZip.loadAsync(await forcedTrackingFixture())
  zip.file(
    'word/settings.xml',
    (await zip.file('word/settings.xml')!.async('string')).replace(
      '</w:settings>',
      `<w:writeProtection ${passwordAttrs()}/></w:settings>`,
    ),
  )
  const app = await boot(undefined, true, await zip.generateAsync({ type: 'uint8array' })),
    { editor, session } = app
  const initial = editor.state.doc
  editor.view.dispatch(editor.state.tr.insertText('blocked', 1))
  expect(editor.state.doc).toBe(initial)
  await session.protection.verifyModificationPassword('editor')
  expect(session.protection.getAccess()).toMatchObject({
    writable: true,
    mandatoryTracking: true,
    modificationUnlocked: true,
  })
  expect(await session.save(editor.getJSON())).toEqual(app.bytes)
  editor.storage.trackChanges.enabled = false
  editor.view.dispatch(editor.state.tr.insertText('verified edit', 1))
  expect(editor.storage.trackChanges.enabled).toBe(true)
  const saved = await session.save(editor.getJSON())
  expect(await xml(saved)).toContain('verified edit')
  await untouched(app.bytes, saved)
  const reopened = await openDocx(saved)
  expect(reopened.protection.getAccess()).toMatchObject({
    writable: false,
    modificationPasswordRequired: true,
  })
  await reopened.protection.verifyModificationPassword('editor')
  expect(reopened.protection.getAccess()).toMatchObject({ writable: true, mandatoryTracking: true })
})
it('blocks raw accept/reject, trackIgnore, structure, marks, cross-paragraph edits without history or changes', async () => {
  const { editor, blocked } = await boot(),
    before = editor.state.doc,
    depth = undoDepth(editor.state)
  for (const mode of ['accept', 'reject'] as const)
    applyRevisions(editor, collectRevisions(editor.state.doc), mode)
  editor.view.dispatch(editor.state.tr.insertText('bypass', 1).setMeta(TRACK_IGNORE, true))
  editor.view.dispatch(editor.state.tr.addMark(1, 3, editor.schema.marks.bold!.create()))
  editor.view.dispatch(editor.state.tr.delete(2, editor.state.doc.firstChild!.nodeSize + 2))
  editor.view.dispatch(editor.state.tr.setNodeAttribute(0, 'align', 'right'))
  expect(editor.state.doc.eq(before)).toBe(true)
  expect(undoDepth(editor.state)).toBe(depth)
  expect(blocked).toHaveBeenCalled()
})
it('final save rejects plain text, forged revisions, original revision changes, and auxiliary overrides independently of UI', async () => {
  const { session, editor } = await boot()
  const plain: PmDocJson = structuredClone(editor.getJSON())
  plain.content![0]!.content![0]!.text = 'plain forged'
  await expect(session.save(plain)).rejects.toThrow(/强制修订/)
  plain.content![0]!.content![0]!.marks = [
    { type: 'ins', attrs: { author: 'forged', date: '2026-10-17T00:00:00Z' } },
  ]
  await expect(session.save(plain)).rejects.toThrow(/强制修订/)
  const revision = structuredClone(editor.getJSON())
  revision.content![1]!.content!.find((n) =>
    (n.marks as PmDocJson[] | undefined)?.some((m) => m.type === 'ins'),
  )!.marks = []
  await expect(session.save(revision)).rejects.toThrow(/强制修订/)
  await expect(session.save(editor.getJSON(), { comments: [] })).rejects.toThrow(/附加结构/)
})
it('keeps native Undo/Redo after save and round restore mandatory, with exact no-op restoration', async () => {
  const app = await boot(),
    { editor, session, handle } = app
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)))
  const outcome = await handle.execute(
    'insert_content',
    { html: '<p>Agent</p>' },
    { roundId: 'round' },
  )
  expect(outcome).toMatchObject({ changed: true })
  expect(editor.storage.trackChanges.enabled).toBe(true)
  const saved = await session.save(editor.getJSON())
  expect(await xml(saved)).toContain('Agent')
  expect(handle.undoRound('round')).toBe(true)
  expect(editor.storage.trackChanges.enabled).toBe(true)
  expect(await session.save(editor.getJSON())).toEqual(app.bytes)
  editor.view.dispatch(closeHistory(editor.state.tr).insertText('Manual', 1))
  await session.save(editor.getJSON())
  expect(editor.commands.undo()).toBe(true)
  expect(await session.save(editor.getJSON())).toEqual(app.bytes)
  expect(editor.commands.redo()).toBe(true)
  expect(await xml(await session.save(editor.getJSON()))).toContain('Manual')
})
it('Agent rejects unsupported commands/no guard/cancel/stale and preserves dirty/version/history on refusal', async () => {
  const app = await boot(),
    { handle, editor } = app
  const version = handle.getVersion(),
    depth = undoDepth(editor.state)
  for (const tool of ['accept_changes', 'reject_changes', 'set_page_setup', 'insert_image'])
    await expect(handle.execute(tool, {})).rejects.toThrow(/强制修订/)
  await expect(handle.execute('apply_ops', { ops: [{ op: 'setFont' }] })).rejects.toThrow(
    /强制修订/,
  )
  await expect(
    handle.execute('insert_content', { html: '<p>new block</p>', afterBlockIndex: 0 }),
  ).rejects.toThrow(/强制修订/)
  await expect(
    handle.execute('replace_blocks', {
      startBlockIndex: 0,
      endBlockIndex: 1,
      html: '<p>cross</p>',
    }),
  ).rejects.toThrow(/强制修订/)
  expect(() => handle.beginDraft('draft')).toThrow(/强制修订/)
  expect(() => handle.setRevisionMode(false)).toThrow(/强制修订/)
  const abort = new AbortController()
  abort.abort()
  await expect(
    handle.execute('insert_content', { html: 'late' }, { signal: abort.signal }),
  ).rejects.toThrow(/停止/)
  await expect(
    handle.execute('insert_content', { html: 'late' }, { expectedVersion: version - 1 }),
  ).rejects.toThrow(/版本/)
  expect(handle.getVersion()).toBe(version)
  expect(app.dirty()).toBe(false)
  expect(undoDepth(editor.state)).toBe(depth)
  const missing = await boot(undefined, false)
  await expect(missing.handle.execute('insert_content', { html: 'x' })).rejects.toThrow(/守卫/)
})
it('Agent single-block replacement and batched findReplace use native tracked deltas', async () => {
  const { handle, editor, session } = await boot()
  expect(
    await handle.execute('replace_blocks', {
      startBlockIndex: 0,
      endBlockIndex: 0,
      html: '<p>New text</p>',
    }),
  ).toMatchObject({ changed: true })
  expect(
    await handle.execute('apply_ops', {
      ops: [{ op: 'findReplace', find: 'New', replace: 'Edited', matchCase: true }],
    }),
  ).toMatchObject({ changed: true })
  const native = await xml(await session.save(editor.getJSON()))
  expect(native).toContain('Edited')
  expect(native).toContain('Alpha beta')
  expect(native).toContain('<w:del')
})
it.each(['<h1>Heading intent</h1>', '<p style="text-align:right">Aligned intent</p>'])(
  'rejects unsupported Agent block formatting rather than silently discarding it: %s',
  async (html) => {
    const { handle, editor, dirty } = await boot()
    const before = editor.state.doc,
      version = handle.getVersion(),
      depth = undoDepth(editor.state)
    await expect(
      handle.execute('replace_blocks', { startBlockIndex: 0, endBlockIndex: 0, html }),
    ).rejects.toThrow(/强制修订/)
    expect(editor.state.doc).toBe(before)
    expect(handle.getVersion()).toBe(version)
    expect(undoDepth(editor.state)).toBe(depth)
    expect(dirty()).toBe(false)
  },
)
it('authorized stop restores ordinary writes; protection history returns the mandatory policy and invalidates old rounds', async () => {
  const { session, editor, handle } = await boot()
  const epoch = session.protection.getAccess().epoch
  expect(
    await session.protection.applySettings(
      {
        enabled: false,
        mode: 'trackedChanges',
        recommended: false,
        restrictionPassword: { action: 'preserve' },
        modificationPassword: { action: 'preserve' },
      },
      editor.getJSON(),
      {},
      (token) => {
        editor.view.dispatch(
          closeHistory(editor.state.tr).setDocAttribute('mimirProtectionState', token),
        )
        return editor.state.doc.attrs.mimirProtectionState === token
      },
      new AbortController().signal,
    ),
  ).toBe(true)
  expect(session.protection.getAccess()).toMatchObject({ writable: true, mandatoryTracking: false })
  editor.view.dispatch(closeHistory(editor.state.tr).setNodeAttribute(0, 'align', 'right'))
  expect(editor.state.doc.firstChild!.attrs.align).toBe('right')
  editor.commands.undo()
  editor.commands.undo()
  expect(session.protection.getAccess().mandatoryTracking).toBe(true)
  expect(session.protection.getAccess().epoch).toBeGreaterThan(epoch)
  expect(editor.storage.trackChanges.enabled).toBe(true)
  expect(handle.undoRound('missing')).toBe(false)
  await session.save(editor.getJSON())
})
it('rejects unsupported native paragraph extensions before dispatch and detects a writer that loses revisions on final native readback', async () => {
  const { session, editor, bytes, blocked } = await boot()
  const last = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 1
  const before = editor.state.doc
  editor.view.dispatch(editor.state.tr.insertText('no', last))
  expect(editor.state.doc.eq(before)).toBe(true)
  expect(blocked).toHaveBeenCalledWith(expect.stringMatching(/原生段落.*只读/))
  editor.view.dispatch(editor.state.tr.insertText('tracked', 1))
  vi.spyOn(engine, 'saveDocx').mockResolvedValue(bytes)
  await expect(session.save(editor.getJSON())).rejects.toThrow(/原生修订保存读回/)
})
it('keeps existing insertion/deletion identities when editing their paragraph and rejects a late protection transition during native save', async () => {
  const { session, editor } = await boot()
  const at = editor.state.doc.firstChild!.nodeSize + 1
  editor.view.dispatch(editor.state.tr.insertText('prefix', at))
  let resolve!: (value: Uint8Array) => void
  let entered!: () => void
  const started = new Promise<void>((done) => {
    entered = done
  })
  const saveDocx = engine.saveDocx
  vi.spyOn(engine, 'saveDocx').mockImplementation(async (...args) => {
    const result = await saveDocx(...args)
    return new Promise<Uint8Array>((done) => {
      resolve = () => done(result)
      entered()
    })
  })
  const pending = session.save(editor.getJSON())
  const outcome = pending.catch((cause: unknown) => cause)
  await started
  expect(resolve).toBeTypeOf('function')
  await session.protection.applySettings(
    {
      enabled: false,
      mode: 'trackedChanges',
      recommended: false,
      restrictionPassword: { action: 'preserve' },
      modificationPassword: { action: 'preserve' },
    },
    editor.getJSON(),
    {},
    (token) => {
      editor.view.dispatch(
        closeHistory(editor.state.tr).setDocAttribute('mimirProtectionState', token),
      )
      return editor.state.doc.attrs.mimirProtectionState === token
    },
    new AbortController().signal,
  )
  resolve(new Uint8Array())
  expect(await outcome).toBeInstanceOf(Error)
  expect(String(await outcome)).toMatch(/保护状态已变化/)
})
