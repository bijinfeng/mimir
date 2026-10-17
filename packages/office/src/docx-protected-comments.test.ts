// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { DocxInkExtension } from './editors/docx-ink.js'
import { DocxProtectionExtension } from './editors/docx-protection.js'
import { openDocx } from './docx.js'
import { createDocxAgentHandle } from './agent/docx-agent.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { CommentInfo } from '../vendor/packages/docx-engine/src/types.js'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const commentsXml = `<w:comments xmlns:w="${W}" xmlns:w14="${W14}" xmlns:x="urn:preserve"><w:comment w:id="0" w:author="原作者" w:date="2026-10-17T08:00:00.000Z" x:keep="unchanged"><w:p w14:paraId="00110001"><w:r x:keep="run"><w:rPr><w:b/><w:color w:val="345678"/></w:rPr><w:t xml:space="preserve" x:keep="text">富格式  中文</w:t></w:r><w:hyperlink r:id="link" xmlns:r="${R}"><w:r><w:t> Link</w:t></w:r></w:hyperlink></w:p></w:comment><w:comment w:id="1" w:author="回复者"><w:p w14:paraId="00110002"><w:r><w:t>已有回复</w:t></w:r></w:p></w:comment><w:comment w:id="2" w:author="复杂内容"><w:p w14:paraId="00110003"><w:r><w:fldChar w:fldCharType="begin"/><w:t>复杂域</w:t></w:r></w:p></w:comment></w:comments>`
const extXml = `<w15:commentsEx xmlns:w15="${W15}"><w15:commentEx w15:paraId="00110001" w15:done = '0'/><w15:commentEx w15:paraId="00110002" w15:paraIdParent="00110001" w15:done="0"/><w15:commentEx w15:paraId="00110003" w15:done="0"/></w15:commentsEx>`
async function fixture({
  extended = true,
  mutation,
  mode = 'comments',
  password = false,
  hash = false,
  alternate = false,
}: {
  extended?: boolean
  mutation?: (zip: JSZip) => Promise<void> | void
  mode?: string
  password?: boolean
  hash?: boolean
  alternate?: boolean
} = {}) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(
        import.meta.dirname,
        '../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
      ),
    ),
  )
  const credential = hash
    ? ` w:hash="${btoa('h'.repeat(64))}" w:salt="${btoa('s'.repeat(16))}" w:cryptAlgorithmSid="14" w:cryptSpinCount="100000"`
    : ''
  zip.file(
    'word/settings.xml',
    `<w:settings xmlns:w="${W}"><w:documentProtection w:edit="${mode}" w:enforcement="1"${credential}/>${password ? '<w:writeProtection w:password="ABCD"/>' : ''}</w:settings>`,
  )
  const path = alternate ? 'review/comments-custom.xml' : 'comments.xml'
  zip.file(`word/${path}`, commentsXml)
  if (extended) zip.file('word/commentsExtended.xml', extXml)
  zip.file(
    'word/_rels/document.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="settings" Type="${R}/settings" Target="settings.xml"/><Relationship Id="comments" Type="${R}/comments" Target="${path}"/>${extended ? '<Relationship Id="ext" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>' : ''}</Relationships>`,
  )
  zip.file(
    'word/_rels/comments.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link" Type="${R}/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>`,
  )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    types.replace(
      '</Types>',
      `<Override PartName="/word/${path}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>${extended ? '<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>' : ''}</Types>`,
    ),
  )
  await mutation?.(zip)
  return zip.generateAsync({ type: 'uint8array' })
}
async function expectParts(before: Uint8Array, after: Uint8Array, changed: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  for (const path of Object.keys(a.files).filter((p) => !a.files[p]!.dir && !changed.includes(p)))
    expect(await b.file(path)!.async('uint8array')).toEqual(await a.file(path)!.async('uint8array'))
}
const state = (session: Awaited<ReturnType<typeof openDocx>>) => session.protection.readComments()!
describe('protected comments native narrow save', () => {
  it('keeps saved discussion counts within the supported reopening budget', async () => {
    const bytes = await fixture({
      extended: false,
      mutation(zip) {
        zip.file(
          'word/comments.xml',
          `<w:comments xmlns:w="${W}">${Array.from(
            { length: 1000 },
            (_, id) =>
              `<w:comment w:id="${id}" w:author="作者"><w:p><w:r><w:t>讨论${id}</w:t></w:r></w:p></w:comment>`,
          ).join('')}</w:comments>`,
        )
      },
    })
    const session = await openDocx(bytes)
    expect(session.protection.getAccess().commentsOnly).toBe(true)
    expect(session.protection.getCommentAccess('0').reply).toMatch(/上限/)
    const comments = state(session)
    comments.push({
      id: '1000',
      parentId: '0',
      author: '用户',
      date: '2026-10-17T09:00:00.000Z',
      text: '超限回复',
    })
    await expect(session.save(session.content, { comments })).rejects.toThrow(/原生讨论/)
    comments.pop()
    comments[0]!.text = '现有讨论仍可编辑'
    const reopened = await openDocx(await session.save(session.content, { comments }))
    expect(reopened.protection.getAccess().commentsOnly).toBe(true)
    expect(state(reopened)[0]!.text).toBe('现有讨论仍可编辑')
  })
  it('keeps body readonly with recognized restriction hash, no-op exact and private baseline', async () => {
    const bytes = await fixture({ hash: true }),
      session = await openDocx(bytes),
      pm = structuredClone(session.content),
      expected = bytes.slice()
    expect(session.protection.getAccess()).toMatchObject({ commentsOnly: true, writable: false })
    expect(() => session.protection.assertWrite()).toThrow(/原件|批注|保护/)
    expect(await session.save(pm, { comments: state(session) })).toEqual(bytes)
    session.originalBytes.fill(0)
    session.footnotes.parsed.comments = []
    ;(session.comments as CommentInfo[])[0]!.text = 'forged'
    expect(state(session)[0]!.text).toBe('富格式  中文 Link')
    expect(await session.save(pm)).toEqual(expected)
  })
  it('patches only target text preserving rich runs, unknown attrs and every other entry; second save and undo exact', async () => {
    const bytes = await fixture(),
      session = await openDocx(bytes),
      comments = state(session)
    comments[0]!.text = '富格式  中文改字 Link'
    const saved = await session.save(session.content, { comments })
    await expectParts(bytes, saved, ['word/comments.xml'])
    const xml = await (await JSZip.loadAsync(saved)).file('word/comments.xml')!.async('string')
    expect(xml).toContain('x:keep="text"')
    expect(xml).toContain('<w:b/>')
    expect(xml).toContain('<w:color w:val="345678"/>')
    expect(xml).toContain('w:id="1" w:author="回复者"')
    expect(state(await openDocx(saved))[0]!.text).toBe(comments[0]!.text)
    comments[0]!.text += ' 再次'
    expect(state(await openDocx(await session.save(session.content, { comments })))[0]!.text).toBe(
      comments[0]!.text,
    )
    expect(await session.save(session.content, { comments: state(session) })).toEqual(bytes)
  })
  it('replies and resolves/reopens existing threads using exact ext attribute patch and no body changes', async () => {
    const bytes = await fixture(),
      session = await openDocx(bytes),
      comments = state(session)
    comments[0]!.done = true
    const resolved = await session.save(session.content, { comments })
    await expectParts(bytes, resolved, ['word/commentsExtended.xml'])
    expect(
      await (await JSZip.loadAsync(resolved)).file('word/commentsExtended.xml')!.async('string'),
    ).toBe(extXml.replace("done = '0'", "done = '1'"))
    comments.push({
      id: '3',
      author: '用户',
      date: '2026-10-17T09:00:00.000Z',
      parentId: '0',
      text: '新回复\n第二行',
    })
    const saved = await session.save(session.content, { comments })
    await expectParts(bytes, saved, ['word/comments.xml', 'word/commentsExtended.xml'])
    const reopened = await openDocx(saved)
    expect(state(reopened)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '3', parentId: '0', text: '新回复\n第二行' }),
        expect.objectContaining({ id: '0', done: true }),
      ]),
    )
    const later = state(reopened)
    later[0]!.done = false
    expect(
      state(await openDocx(await reopened.save(reopened.content, { comments: later })))[0]!.done,
    ).toBeUndefined()
  })
  it('creates only required extension/relations/content type when absent; alternate comments path works', async () => {
    const bytes = await fixture({ extended: false, alternate: true }),
      session = await openDocx(bytes),
      comments = state(session)
    comments.push({
      id: '3',
      parentId: '0',
      author: '用户',
      date: '2026-10-17T09:00:00.000Z',
      text: '回复',
    })
    const saved = await session.save(session.content, { comments })
    await expectParts(bytes, saved, [
      'word/review/comments-custom.xml',
      'word/_rels/document.xml.rels',
      '[Content_Types].xml',
    ])
    expect(state(await openDocx(saved)).find((c) => c.id === '3')?.parentId).toBe('0')
  })
  it('keeps alternate prefixes/BOM/quoted attributes and creates thread identity only where required', async () => {
    const bytes = await fixture({
      extended: false,
      mutation: (zip) => {
        const raw = commentsXml
          .replaceAll('w:', 'q:')
          .replace('xmlns:w=', 'xmlns:q=')
          .replace(/ w14:paraId="[^"]*"/g, '')
          .replace('<q:t> Link</q:t>', '<q:t x:keep="greater > shell"> Link</q:t>')
        zip.file('word/comments.xml', '\uFEFF' + raw)
      },
    })
    const session = await openDocx(bytes),
      comments = state(session)
    comments[0]!.text += ' more '
    comments[0]!.done = true
    comments.push({
      id: '3',
      parentId: '0',
      author: '用户',
      date: '2026-10-17T09:00:00.000Z',
      text: '新线程回复',
    })
    const saved = await session.save(session.content, { comments })
    await expectParts(bytes, saved, [
      'word/comments.xml',
      'word/_rels/document.xml.rels',
      '[Content_Types].xml',
    ])
    const zip = await JSZip.loadAsync(saved),
      xml = await zip.file('word/comments.xml')!.async('uint8array')
    expect(xml.slice(0, 3)).toEqual(new Uint8Array([239, 187, 191]))
    expect(new TextDecoder().decode(xml)).toContain('x:keep="greater > shell"')
    const reopened = state(await openDocx(saved))
    expect(reopened.find((c) => c.id === '0')).toMatchObject({
      text: comments[0]!.text,
      done: true,
    })
    expect(reopened.find((c) => c.id === '3')).toMatchObject({ parentId: '0', text: '新线程回复' })
  })
  it('adds paragraph identity without rebinding an existing unknown namespace prefix', async () => {
    const bytes = await fixture({
      extended: false,
      mutation: (zip) => {
        zip.file(
          'word/comments.xml',
          commentsXml
            .replace(`xmlns:w14="${W14}"`, 'xmlns:w14="urn:keep"')
            .replace(/ w14:paraId="[^"]*"/g, '')
            .replace('<w:p>', '<w:p w14:keep="original">'),
        )
      },
    })
    const session = await openDocx(bytes),
      comments = state(session)
    comments[0]!.done = true
    const saved = await session.save(session.content, { comments })
    const xml = await (await JSZip.loadAsync(saved)).file('word/comments.xml')!.async('string')
    expect(xml).toContain('xmlns:w14="urn:keep"')
    expect(xml).toContain('w14:keep="original"')
    expect(xml).not.toContain(`xmlns:w14="${W14}"`)
    expect(state(await openDocx(saved))[0]!.done).toBe(true)
  })
  it('rejects PM, options, identity, roots, duplicate ids, paragraph-count changes and unsupported targets atomically', async () => {
    const bytes = await fixture(),
      session = await openDocx(bytes),
      baseline = state(session),
      pm = structuredClone(session.content)
    pm.content!.push({ type: 'docParagraph', content: [{ type: 'text', text: 'bad' }] })
    await expect(session.save(pm, { comments: baseline })).rejects.toThrow(/原件|批注|保护/)
    for (const options of [
      { comments: baseline, inks: [] },
      { comments: baseline, footnotes: [] },
      { comments: baseline, partXml: {} },
      { comments: null },
    ])
      await expect(session.save(session.content, options as SaveOptions)).rejects.toThrow(
        /原件|批注|保护/,
      )
    for (const mutate of [
      (c: CommentInfo[]) => c.pop(),
      (c: CommentInfo[]) => {
        c[0]!.author = 'forged'
      },
      (c: CommentInfo[]) => {
        c[0]!.parentId = '1'
      },
      (c: CommentInfo[]) => {
        c[0]!.text += '\nextra'
      },
      (c: CommentInfo[]) => c.push({ ...c[0]! }),
      (c: CommentInfo[]) => c.push({ id: '3', author: 'new', text: 'new root' }),
      (c: CommentInfo[]) => {
        c[2]!.text = 'unsafe'
      },
      (c: CommentInfo[]) => {
        c[2]!.done = true
      },
    ]) {
      const c = structuredClone(baseline)
      mutate(c)
      await expect(session.save(session.content, { comments: c })).rejects.toThrow(/原件|批注|保护/)
    }
    expect(session.protection.getCommentAccess('2').editText).toBeTruthy()
    expect(session.protection.getCommentAccess('2').reply).toBeTruthy()
    expect(await session.save(session.content)).toEqual(bytes)
  })
  it.each(['readOnly', 'forms', 'trackedChanges'])(
    'does not grant comment writes in %s',
    async (mode) => {
      const session = await openDocx(await fixture({ mode }))
      expect(session.protection.getAccess().commentsOnly).toBe(false)
      await expect(
        session.save(session.content, { comments: session.comments as CommentInfo[] }),
      ).rejects.toThrow(/原件|批注|保护/)
    },
  )
  it('rejects modification password, modern comment extensions, malformed and duplicate namespace ids', async () => {
    for (const options of [
      { password: true },
      {
        mutation: (zip: JSZip) => {
          zip.file('word/people.xml', '<people/>')
        },
      },
      {
        mutation: async (zip: JSZip) => {
          zip.file(
            'word/comments.xml',
            commentsXml.replace('w:id="0"', 'xmlns:a="' + W + '" a:id="1" w:id="0"'),
          )
        },
      },
      {
        mutation: async (zip: JSZip) => {
          zip.file(
            'word/commentsExtended.xml',
            extXml.replace('w15:paraIdParent="00110001"', 'w15:paraIdParent="missing"'),
          )
        },
      },
    ]) {
      const session = await openDocx(await fixture(options))
      expect(session.protection.getAccess().commentsOnly).toBe(false)
    }
  })
})
describe('protected comment eligibility boundaries', () => {
  it.each([
    'ambiguous modification protection',
    'shared comments target',
    'duplicate paragraph identity',
  ])('does not open C1 for %s', async (kind) => {
    const bytes = await fixture({
      mutation: async (zip) => {
        if (kind === 'ambiguous modification protection') {
          const settings = await zip.file('word/settings.xml')!.async('string')
          zip.file(
            'word/settings.xml',
            settings.replace('</w:settings>', '<w:writeProtection/></w:settings>'),
          )
        } else if (kind === 'shared comments target') {
          const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string')
          zip.file(
            'word/_rels/document.xml.rels',
            relationships.replace(
              '</Relationships>',
              `<Relationship Id="sharedStyles" Type="${R}/styles" Target="comments.xml"/></Relationships>`,
            ),
          )
        } else {
          zip.file(
            'word/comments.xml',
            commentsXml.replace(
              '<w:p w14:paraId="00110001">',
              '<w:p w14:paraId="00110002"><w:r><w:t>另一段</w:t></w:r></w:p><w:p w14:paraId="00110001">',
            ),
          )
        }
      },
    })
    const session = await openDocx(bytes)
    expect(session.protection.getAccess().commentsOnly).toBe(false)
    expect(session.protection.getCommentAccess('0').reply).toBeTruthy()
    expect(await session.save(session.content)).toEqual(bytes)
  })
})
describe('protected comments live handle', () => {
  it('uses options-only history, meaningful versions, stale refusal, no setContent and readonly PM guard', async () => {
    const bytes = await fixture(),
      session = await openDocx(bytes),
      saveOptions: { current: SaveOptions } = { current: {} },
      dirty = vi.fn<(value: boolean) => void>()
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        ...editorExtensions,
        DocxInkExtension,
        DocxProtectionExtension.configure({ controller: session.protection }),
      ],
      content: session.content,
      editable: false,
    })
    const handle = createDocxAgentHandle(editor, 'protected', {
      session,
      saveOptions,
      isDirty: () => false,
      onDirtyChange: dirty,
    })
    const baseline = editor.getJSON(),
      setContent = vi.spyOn(editor.commands, 'setContent')
    await expect(handle.execute('add_comment', { blockIndex: 0, comment: 'bad' })).rejects.toThrow(
      /原件|批注|保护/,
    )
    await expect(handle.execute('delete_comment', { id: '0' })).rejects.toThrow(/原件|批注|保护/)
    await expect(handle.execute('set_page_setup', { pageWidth: 700 })).rejects.toThrow(
      /原件|批注|保护/,
    )
    expect(handle.getVersion()).toBe(0)
    expect(dirty).not.toHaveBeenCalled()
    const noOp = await handle.execute(
      'edit_comment',
      { id: '0', text: '富格式  中文 Link' },
      { roundId: 'noop' },
    )
    expect(noOp.changed).toBe(false)
    expect(handle.undoRound('noop')).toBe(false)
    const result = await handle.execute(
      'edit_comment',
      { id: '0', text: '富格式  中文更新 Link' },
      { roundId: 'edit', expectedVersion: 0 },
    )
    expect(result).toMatchObject({ changed: true, version: 1 })
    expect(editor.getJSON()).toEqual(baseline)
    editor.commands.insertContent('blocked')
    expect(editor.getJSON()).toEqual(baseline)
    expect(handle.undoRound('edit')).toBe(true)
    expect(setContent).not.toHaveBeenCalled()
    expect(handle.getVersion()).toBe(2)
    expect(await session.save(editor.getJSON(), saveOptions.current)).toEqual(bytes)
    await expect(
      handle.execute('reply_comment', { parentId: '0', text: 'late' }, { expectedVersion: 1 }),
    ).rejects.toThrow(/版本/)
    const reply = await handle.execute(
      'reply_comment',
      { parentId: '1', text: '新回复', author: '用户' },
      { roundId: 'reply' },
    )
    expect(reply.changed).toBe(true)
    await handle.execute('resolve_comment', { id: '1' }, { roundId: 'resolve' })
    expect(handle.undoRound('reply')).toBe(false)
    expect(handle.undoRound('resolve')).toBe(true)
    expect(editor.getJSON()).toEqual(baseline)
    expect(
      state(await openDocx(await session.save(editor.getJSON(), saveOptions.current))).some(
        (c) => c.text === '新回复' && c.parentId === '0',
      ),
    ).toBe(true)
    handle.dispose()
    editor.destroy()
  })
})
