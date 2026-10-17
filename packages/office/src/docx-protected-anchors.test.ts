// @vitest-environment happy-dom
import JSZip from 'jszip'
import { Editor, Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { describe, expect, it, vi } from 'vitest'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import { createDocxAgentHandle } from './agent/docx-agent.js'
import { openDocx } from './docx.js'
import { DocxInkExtension } from './editors/docx-ink.js'
import { DocxProtectionExtension } from './editors/docx-protection.js'
import { protectedAnchorsFixture } from './docx-protected-anchors-fixture.test-helper.js'

async function setup(empty = false, reject = false, suppliedBytes?: Uint8Array) {
  const bytes = suppliedBytes ?? (await protectedAnchorsFixture(empty))
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      ...editorExtensions,
      DocxInkExtension,
      DocxProtectionExtension.configure({ controller: session.protection }),
      ...(reject
        ? [
            Extension.create({
              name: 'rejectCommentTransaction',
              addProseMirrorPlugins: () => [
                new Plugin({ filterTransaction: (tr) => !tr.docChanged }),
              ],
            }),
          ]
        : []),
    ],
    content: session.content,
    editable: false,
  })
  const saveOptions: { current: SaveOptions } = { current: {} }
  const dirty = vi.fn<(value: boolean) => void>()
  const handle = createDocxAgentHandle(editor, 'anchors', {
    session,
    saveOptions,
    isDirty: () => false,
    onDirtyChange: dirty,
  })
  const save = () => session.save(editor.getJSON(), saveOptions.current)
  return {
    bytes,
    session,
    editor,
    saveOptions,
    handle,
    dirty,
    save,
    close: () => {
      handle.dispose()
      editor.destroy()
    },
  }
}
async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.keys(zip.files)
        .filter((p) => !zip.files[p]!.dir)
        .map(async (p) => [p, await zip.file(p)!.async('string')]),
    ),
  )
}
function unchanged(a: Record<string, string>, b: Record<string, string>, allow: string[]) {
  for (const [path, value] of Object.entries(a).filter(([entryPath]) => !allow.includes(entryPath)))
    expect(b[path]).toBe(value)
}

describe('protected comment anchors', () => {
  it('does not infer raw paragraph identity from text when an earlier SDT expands DOCX indices', async () => {
    const zip = await JSZip.loadAsync(await protectedAnchorsFixture())
    const xml = await zip.file('word/document.xml')!.async('string')
    const firstParagraph = xml.slice(xml.indexOf('<w:p '), xml.indexOf('</w:p>') + 6)
    zip.file(
      'word/document.xml',
      xml.replace(
        '<w:body>',
        '<w:body><w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>前置控件一</w:t></w:r></w:p><w:p><w:r><w:t>前置控件二</w:t></w:r></w:p></w:sdtContent></w:sdt>' +
          firstParagraph,
      ),
    )
    const app = await setup(false, false, await zip.generateAsync({ type: 'uint8array' }))
    expect(app.editor.state.doc.child(2).textContent).toBe('普通单段可以添加批注')
    expect(app.session.protection.getCommentTargetReason(2)).toMatch(/原生|单段/)
    await expect(
      app.handle.execute('add_comment', {
        blockIndex: 2,
        text: '单段',
        comment: '不得落入同文另一段',
      }),
    ).rejects.toThrow(/原生|单段|结构/)
    expect(await app.save()).toEqual(app.bytes)
    expect(app.handle.getVersion()).toBe(0)
    app.close()
  })
  it('does not reuse original comment identities after deleting the highest root or reply', async () => {
    const zip = await JSZip.loadAsync(await protectedAnchorsFixture())
    const documentXml = await zip.file('word/document.xml')!.async('string')
    zip.file(
      'word/document.xml',
      documentXml.replace('<w:hyperlink r:id="link">', '').replace('</w:hyperlink>', ''),
    )
    const app = await setup(false, false, await zip.generateAsync({ type: 'uint8array' }))
    await app.handle.execute('delete_comment', { id: '2' })
    const added = await app.handle.execute('add_comment', {
      blockIndex: 0,
      text: '单段',
      comment: '新身份',
    })
    expect((added.data as { id: string }).id).toBe('3')
    await app.handle.execute('delete_comment', { id: '1' })
    await app.handle.execute('delete_comment', { id: '3' })
    await app.handle.execute('reply_comment', { parentId: '0', text: '新回复身份' })
    const saved = await app.save()
    expect((await openDocx(saved)).protection.readComments()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '0' }),
        expect.objectContaining({ id: '3', parentId: '0', text: '新回复身份' }),
      ]),
    )
    app.close()
  })
  it('adds inside a rich native run, preserves opaque data, saves twice and reopens; Undo gives entire original bytes', async () => {
    const app = await setup()
    expect(app.session.protection.getAccess()).toMatchObject({
      writable: false,
      commentsOnly: true,
    })
    expect(app.session.protection.getCommentTargetReason(0)).toBeNull()
    const result = await app.handle.execute(
      'add_comment',
      { blockIndex: 0, text: '单段可以', comment: '新增批注', author: '用户' },
      { roundId: 'add' },
    )
    expect(result).toMatchObject({ changed: true, version: 1 })
    const id = (result.data as { id: string }).id
    const saved = await app.save(),
      a = await parts(app.bytes),
      b = await parts(saved)
    unchanged(a, b, ['word/document.xml', 'word/comments.xml', 'word/commentsExtended.xml'])
    expect(
      b['word/commentsExtended.xml']!.startsWith(
        a['word/commentsExtended.xml']!.replace('</w15:commentsEx>', ''),
      ),
    ).toBe(true)
    expect(b['word/document.xml']).toContain('<w:commentRangeStart')
    expect(b['word/document.xml']).toContain('x:keep="rich-run"')
    expect(b['word/document.xml']!.match(/<x:format value="keep"\/>/g)).toHaveLength(3)
    expect(b['word/document.xml']).toContain('<x:opaque value="untouched"/>')
    const reopened = await openDocx(saved)
    expect(reopened.protection.readComments()!.find((c) => c.id === id)?.text).toBe('新增批注')
    expect(
      reopened.content.content?.[0]?.content?.some((c) =>
        (c.marks as { type: string }[] | undefined)?.some((m) => m.type === 'comment'),
      ),
    ).toBe(true)
    await app.handle.execute('edit_comment', { id, text: '再次编辑批注' })
    const second = await app.save()
    expect((await openDocx(second)).protection.readComments()!.find((c) => c.id === id)?.text).toBe(
      '再次编辑批注',
    )
    expect((await parts(second))['word/document.xml']).toBe(b['word/document.xml'])
    app.close()
    const undo = await setup()
    await undo.handle.execute(
      'add_comment',
      { blockIndex: 0, text: '单段可以', comment: '撤销' },
      { roundId: 'a' },
    )
    expect(undo.handle.undoRound('a')).toBe(true)
    expect(await undo.save()).toEqual(undo.bytes)
    undo.close()
  })
  it('deletes a reply independently, then the complete root discussion with exact native anchor removal', async () => {
    const app = await setup()
    await app.handle.execute('delete_comment', { id: '1' }, { roundId: 'reply' })
    const replySaved = await app.save(),
      before = await parts(app.bytes),
      afterReply = await parts(replySaved)
    unchanged(before, afterReply, ['word/comments.xml', 'word/commentsExtended.xml'])
    expect(afterReply['word/document.xml']).toBe(before['word/document.xml'])
    expect((await openDocx(replySaved)).protection.readComments()!.map((c) => c.id)).toEqual([
      '0',
      '2',
    ])
    expect(app.handle.undoRound('reply')).toBe(true)
    expect(await app.save()).toEqual(app.bytes)
    await expect(app.handle.execute('delete_comment', { id: '0' })).rejects.toThrow(/回复/)
    await app.handle.execute('delete_comment', { id: '0', withReplies: true }, { roundId: 'root' })
    const deleted = await app.save(),
      after = await parts(deleted)
    unchanged(before, after, [
      'word/document.xml',
      'word/comments.xml',
      'word/commentsExtended.xml',
    ])
    expect(after['word/document.xml']).toBe(
      before['word/document.xml']!.replace('<w:commentRangeStart w:id="0"/>', '')
        .replace('<w:commentRangeEnd w:id="0"/>', '')
        .replace('<w:commentReference w:id="0"/>', ''),
    )
    expect((await openDocx(deleted)).protection.readComments()!.map((c) => c.id)).toEqual(['2'])
    expect(app.handle.undoRound('root')).toBe(true)
    expect(await app.save()).toEqual(app.bytes)
    app.close()
  })
  it('adds first comments in an empty package and publishes both necessary relationships atomically', async () => {
    const app = await setup(true)
    const result = await app.handle.execute(
      'add_comment',
      { blockIndex: 3, text: '式 中文🙂', comment: '首条' },
      { roundId: 'first' },
    )
    const id = (result.data as { id: string }).id
    await app.handle.execute('reply_comment', { parentId: id, text: '新根回复' })
    await app.handle.execute('resolve_comment', { id })
    const saved = await app.save(),
      reopened = await openDocx(saved)
    expect(reopened.protection.getAccess().commentsOnly).toBe(true)
    expect(reopened.protection.readComments()!).toHaveLength(2)
    expect(reopened.protection.readComments()!.find((c) => c.id === id)).toMatchObject({
      done: true,
      text: '首条',
    })
    unchanged(await parts(app.bytes), await parts(saved), [
      'word/document.xml',
      'word/_rels/document.xml.rels',
      '[Content_Types].xml',
    ])
    app.close()
  })
  it('refuses complex anchors, body/format/forged mark changes, overlap and stale writes without publishing options or dirty', async () => {
    const app = await setup(),
      before = app.editor.getJSON()
    expect(app.session.protection.getCommentTargetReason(2)).toMatch(/单段|原生/)
    expect(app.session.protection.getCommentAccess('2').delete).toMatch(/单段|原生/)
    for (const [tool, args] of [
      ['add_comment', { blockIndex: 2, text: '目标', comment: 'bad' }],
      ['add_comment', { blockIndex: 1, text: '已有讨论', comment: 'bad' }],
      ['delete_comment', { id: '2' }],
    ] as const)
      await expect(app.handle.execute(tool, args, { roundId: 'bad' })).rejects.toThrow(
        /批注|原生|正文|锚点|结构/,
      )
    const mark = app.editor.schema.marks.comment!.create({ ids: '3' })
    app.editor.view.dispatch(app.editor.state.tr.addMark(1, 3, mark))
    expect(app.editor.getJSON()).toEqual(before)
    app.editor.commands.insertContent('不得修改正文')
    expect(app.editor.getJSON()).toEqual(before)
    const forged = structuredClone(before)
    forged.content![0]!.attrs = { ...forged.content![0]!.attrs, alignment: 'center' }
    await expect(app.session.save(forged, {})).rejects.toThrow(/正文/)
    await expect(
      app.handle.execute('add_comment', { blockIndex: 0, comment: 'bad' }, { expectedVersion: 99 }),
    ).rejects.toThrow(/版本/)
    expect(app.handle.getVersion()).toBe(0)
    expect(app.saveOptions.current).toEqual({})
    expect(app.dirty).not.toHaveBeenCalled()
    expect(app.handle.undoRound('bad')).toBe(false)
    expect(await app.save()).toEqual(app.bytes)
    app.close()
  })
  it('supports two disjoint additions in the same raw run, deletion before save and code point boundaries', async () => {
    const app = await setup()
    const a = await app.handle.execute('add_comment', {
      blockIndex: 0,
      text: '单段',
      comment: '左侧',
      initials: 'QA',
    })
    const b = await app.handle.execute('add_comment', {
      blockIndex: 0,
      text: '添加',
      comment: '右侧',
    })
    const saved = await app.save(),
      reopened = await openDocx(saved)
    expect(
      reopened.protection.readComments()!.find((c) => c.id === (a.data as { id: string }).id),
    ).toMatchObject({ text: '左侧', initials: 'QA' })
    expect(
      reopened.protection.readComments()!.find((c) => c.id === (b.data as { id: string }).id)?.text,
    ).toBe('右侧')
    await app.handle.execute('reply_comment', {
      parentId: (a.data as { id: string }).id,
      text: '待移除回复',
    })
    await app.handle.execute('delete_comment', {
      id: (a.data as { id: string }).id,
      withReplies: true,
    })
    await app.handle.execute('delete_comment', { id: (b.data as { id: string }).id })
    expect(await app.save()).toEqual(app.bytes)
    const version = app.handle.getVersion()
    await expect(
      app.handle.execute('add_comment', {
        blockIndex: 3,
        text: '\ud83d',
        comment: '不得拆分emoji',
      }),
    ).rejects.toThrow(/批注|原生|正文|锚点|结构/)
    expect(app.handle.getVersion()).toBe(version)
    app.close()
  })
  it('refuses direct orphan metadata/marks, moving existing ranges or dropping noncomment marks', async () => {
    const app = await setup(),
      doc = app.editor.getJSON(),
      comments = app.session.protection.readComments()!
    const extra = { id: '9', text: '伪造', author: '用户', date: '2026-10-17T08:00:00.000Z' }
    await expect(app.session.save(doc, { comments: [...comments, extra] })).rejects.toThrow(
      /批注|原生|正文|锚点|结构/,
    )
    const tr = app.editor.state.tr.addMark(
      1,
      3,
      app.editor.schema.marks.comment!.create({ ids: '9' }),
    )
    await expect(app.session.save(tr.doc.toJSON(), { comments })).rejects.toThrow(
      /批注|原生|正文|锚点|结构/,
    )
    const bold = app.editor.schema.marks.bold!
    const changedFormat = tr.removeMark(1, 3, bold)
    await expect(
      app.session.save(changedFormat.doc.toJSON(), { comments: [...comments, extra] }),
    ).rejects.toThrow(/正文/)
    const moved = app.editor.state.tr
      .removeMark(14, 18, app.editor.schema.marks.comment!)
      .addMark(1, 3, app.editor.schema.marks.comment!.create({ ids: '0' }))
    await expect(app.session.save(moved.doc.toJSON(), { comments })).rejects.toThrow(
      /批注|原生|正文|锚点|结构/,
    )
    expect(app.handle.getVersion()).toBe(0)
    expect(app.saveOptions.current).toEqual({})
    expect(await app.save()).toEqual(app.bytes)
    app.close()
  })
  it('keeps metadata, dirty and history untouched when another PM filter rejects an otherwise valid comment transaction', async () => {
    const app = await setup(false, true)
    await expect(
      app.handle.execute(
        'add_comment',
        { blockIndex: 0, comment: 'reject' },
        { roundId: 'reject' },
      ),
    ).rejects.toThrow(/事务/)
    expect(app.saveOptions.current).toEqual({})
    expect(app.handle.getVersion()).toBe(0)
    expect(app.dirty).not.toHaveBeenCalled()
    expect(app.handle.undoRound('reject')).toBe(false)
    expect(await app.save()).toEqual(app.bytes)
    app.close()
  })
})
