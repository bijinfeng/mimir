/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { DOCX_AGENT_TOOL_NAMES, type DocxAgentHandle } from '../agent/docx-agent.js'
import { DocxEditor } from './DocxEditor.js'
import { openDocx } from '../docx.js'
import { passwordAttrs } from '../docx-protection-password-fixture.test-helper.js'
import { protectedAnchorsFixture } from '../docx-protected-anchors-fixture.test-helper.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function click(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')].find(
    (el) => el.getAttribute('aria-label') === label && !el.closest('[hidden]'),
  )!
  expect(node).toBeTruthy()
  expect(node.disabled).toBe(false)
  await act(async () => {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    node.click()
  })
  return node
}
async function tab(host: HTMLElement, label: string) {
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((el) => el.textContent === label)!
      .click(),
  )
}
async function fixture(node: string) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(
        import.meta.dirname,
        '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
      ),
    ),
  )
  zip.file(
    'word/settings.xml',
    `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${node}</w:settings>`,
  )
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  if (!rels.includes('/settings"'))
    zip.file(
      'word/_rels/document.xml.rels',
      rels.replace(
        '</Relationships>',
        '<Relationship Id="mimirProtectionSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>',
      ),
    )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes('/word/settings.xml'))
    zip.file(
      '[Content_Types].xml',
      types.replace(
        '</Types>',
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
      ),
    )
  const source = await zip.file('word/document.xml')!.async('string')
  const textbox =
    '<w:p xmlns:v="urn:schemas-microsoft-com:vml"><w:r><w:pict><v:shape id="protected-textbox" style="width:200pt;height:60pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>Protected textbox</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>'
  const boundary = source.lastIndexOf('<w:sectPr')
  zip.file('word/document.xml', source.slice(0, boundary) + textbox + source.slice(boundary))
  return zip.generateAsync({ type: 'uint8array' })
}
async function boot(
  node = '<w:documentProtection w:edit="readOnly" w:enforcement="1"/>',
  suppliedBytes?: Uint8Array,
  rerenderOnSave = false,
) {
  const bytes = suppliedBytes ?? (await fixture(node)),
    host = document.createElement('div'),
    root = createRoot(host),
    dirty = vi.fn<(value: boolean) => void>(),
    saved = vi.fn<(bytes: Uint8Array) => Promise<void>>().mockResolvedValue(undefined)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let handle: DocxAgentHandle | null = null
  const renderHost = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <DocxEditor
          documentId="protected"
          io={{ load: async () => bytes, save: saved }}
          onDirtyChange={dirty}
          onAgentHandleChange={(next) => {
            handle = next
          }}
        />
      </ConfigProvider>,
    )
  if (rerenderOnSave) saved.mockImplementation(async () => renderHost())
  await act(async () => renderHost())
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!handle)
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  return { host, editor, bytes, dirty, saved, handle: () => handle! }
}
it.each(['readOnly', 'comments', 'forms', 'trackedChanges'])(
  'enforces %s at PM/DOM/Agent/save, preserving read/find/view/compare and clean state',
  async (mode) => {
    // Mandatory tracking now permits bounded text revisions. Its independent, unverified
    // modification-password gate must still refuse every PM, DOM and Agent bypass below.
    const passwordGate = mode === 'trackedChanges' ? `<w:writeProtection ${passwordAttrs()}/>` : ''
    const app = await boot(
        `<w:documentProtection w:edit="${mode}" w:enforcement="1"/>${passwordGate}`,
      ),
      { editor, host } = app,
      handle = app.handle()
    const baseline = editor.getJSON(),
      version = handle.getVersion(),
      history = undoDepth(editor.state)
    expect(editor.isEditable).toBe(false)
    await act(async () => {
      editor.commands.insertContent('forbidden')
      editor.view.dispatch(
        editor.state.tr
          .insertText('raw bypass', 1)
          .setMeta('TRACK_IGNORE', true)
          .setMeta('history$', true),
      )
      editor.view.dispatch(editor.state.tr.setDocAttribute('mimirDesign', { pageColor: 'FF0000' }))
      editor.commands.setContent({
        type: 'doc',
        content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'replace all' }] }],
      })
      editor.setEditable(true, false)
    })
    expect(editor.isEditable).toBe(false)
    expect(editor.getJSON()).toEqual(baseline)
    expect(handle.getVersion()).toBe(version)
    expect(undoDepth(editor.state)).toBe(history)
    expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
    const textbox = host.querySelector('.doc-textbox')!
    expect(textbox).toBeTruthy()
    await act(async () =>
      textbox.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })),
    )
    expect(host.querySelector('.doc-content-editing')).toBeNull()
    expect(textbox.querySelector('[contenteditable="true"]')).toBeNull()
    const readTools = new Set([
      'get_document_context',
      'read_blocks',
      'read_revisions',
      'read_comments',
      'read_notes',
      'list_styles',
    ])
    for (const tool of DOCX_AGENT_TOOL_NAMES) {
      if (readTools.has(tool)) continue
      const commentRequest =
        mode === 'comments' &&
        ['reply_comment', 'resolve_comment', 'add_comment', 'delete_comment'].includes(tool)
      await expect(handle.execute(tool, {}, { roundId: 'blocked' })).rejects.toThrow(
        commentRequest ? /必须/ : /原件/,
      )
    }
    expect(() => handle.beginDraft('draft')).toThrow(/原件/)
    expect(() => handle.appendDraft('draft', 'late')).toThrow(/原件/)
    await expect(handle.commitDraft('draft')).rejects.toThrow(/原件/)
    let undoBlocked = false
    try {
      handle.undoRound('blocked')
    } catch {
      undoBlocked = true
    }
    expect(undoBlocked).toBe(mode !== 'comments')
    expect(handle.hasPendingDraft()).toBe(false)
    expect(handle.getContext().text).toContain('第一章 概述')
    expect(
      (await handle.execute('read_blocks', { startBlockIndex: 0, endBlockIndex: 0 })).changed,
    ).toBe(false)
    expect((await handle.execute('read_comments', {})).changed).toBe(false)
    expect((await handle.execute('read_revisions', {})).changed).toBe(false)
    const session = await openDocx(app.bytes)
    expect(await session.save(editor.getJSON())).toEqual(app.bytes)
    await tab(host, '视图')
    await click(host, '查找和替换 (Ctrl+F)')
    expect(host.querySelector('[data-find-input]')).not.toBeNull()
    expect(host.querySelector('button[aria-label="全部替换"]')).toBeNull()
    await click(host, 'Web 布局')
    expect(editor.isEditable).toBe(false)
    await click(host, '拆分视图')
    expect(editor.isEditable).toBe(false)
    await tab(host, '审阅')
    await click(host, '对比文档')
    expect(host.querySelector('[aria-label="对比文档面板"]')).not.toBeNull()
    await click(host, '文档保护')
    expect(host.querySelector('[aria-label="文档保护面板"]')?.textContent).toContain(
      ['comments', 'forms'].includes(mode) ? '正文只读' : '只读保留',
    )
    expect(host.querySelector('[aria-label="文档保护面板"]')?.textContent).toContain(
      mode === 'readOnly'
        ? '只读'
        : mode === 'comments'
          ? '普通单段'
          : mode === 'forms'
            ? '受支持的真实复选框'
            : '已设置，等待验证',
    )
    await act(async () =>
      host
        .querySelector('[aria-label="文档保护面板"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(host.querySelector('[aria-label="文档保护面板"]')).toBeNull()
    expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).toBe('文档保护')
    expect(editor.getJSON()).toEqual(baseline)
    expect(handle.getVersion()).toBe(version)
    expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
  },
)
it('requires explicit recommended-only choice, keeps one handle, advances policy epoch/version, then allows real manual and Agent edits', async () => {
  const app = await boot('<w:writeProtection w:recommended="1"/>'),
    { host, editor } = app,
    handle = app.handle()
  const version = handle.getVersion()
  expect(editor.isEditable).toBe(false)
  const formula = host.querySelector<HTMLButtonElement>('.doc-formula-edit')!
  const textbox = host.querySelector<HTMLElement>('.doc-textbox-editor')!
  expect(formula.disabled).toBe(true)
  expect(textbox.getAttribute('aria-readonly')).toBe('true')
  await tab(host, '审阅')
  await click(host, '文档保护')
  await click(host, '仍然编辑此文档')
  expect(editor.isEditable).toBe(true)
  expect(host.querySelector<HTMLButtonElement>('.doc-formula-edit')!.disabled).toBe(false)
  expect(
    host.querySelector<HTMLElement>('.doc-textbox-editor')!.hasAttribute('aria-readonly'),
  ).toBe(false)
  expect(app.handle()).toBe(handle)
  expect(handle.getVersion()).toBeGreaterThan(version)
  expect(host.querySelector('[aria-label="文档保护面板"]')?.textContent).toContain('可以编辑')
  await expect(
    handle.execute('insert_content', { html: '<p>stale policy</p>' }, { expectedVersion: version }),
  ).rejects.toThrow(/版本/)
  await act(async () => editor.commands.insertContent('manual permitted'))
  await act(async () => {
    await handle.execute(
      'insert_content',
      { html: '<p>agent permitted</p>' },
      { roundId: 'allowed' },
    )
  })
  expect(editor.state.doc.textContent).toContain('manual permitted')
  expect(editor.state.doc.textContent).toContain('agent permitted')
  expect(app.dirty).toHaveBeenCalledWith(true)
})
it('retains unprotected manual edits and native save, without a protection alert', async () => {
  const app = await boot(''),
    { editor, host } = app
  expect(editor.isEditable).toBe(true)
  await act(async () => editor.commands.insertContent('ordinary edit'))
  expect(editor.state.doc.textContent).toContain('ordinary edit')
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length > 0)
  const saved = app.saved.mock.calls[0]![0] as Uint8Array
  expect(JSON.stringify((await openDocx(saved)).content)).toContain('ordinary edit')
})
it('blocks native picture resize and body drag previews while preserving plain text selection', async () => {
  const app = await boot(),
    { editor, host } = app
  const box = host.querySelector<HTMLElement>('.doc-img-wrap')!
  const image = box.querySelector<HTMLElement>('img')!
  const grip = box.querySelector<HTMLElement>('.img-resize-handle-e')!
  expect(grip).toBeTruthy()
  const initial = {
    box: box.getAttribute('style'),
    image: image.getAttribute('style'),
    doc: editor.getJSON(),
    version: app.handle().getVersion(),
  }
  for (const target of [grip, image]) {
    await act(async () => {
      target.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      )
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          buttons: 1,
          clientX: 60,
          clientY: 40,
        }),
      )
    })
    expect(box.getAttribute('style')).toBe(initial.box)
    expect(image.getAttribute('style')).toBe(initial.image)
    await act(async () =>
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 60,
          clientY: 40,
        }),
      ),
    )
    expect(box.getAttribute('style')).toBe(initial.box)
    expect(image.getAttribute('style')).toBe(initial.image)
    expect(editor.getJSON()).toEqual(initial.doc)
    expect(app.handle().getVersion()).toBe(initial.version)
  }
  const text = host.querySelector<HTMLElement>('.ProseMirror p')!
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
  await act(async () => text.dispatchEvent(press))
  expect(press.defaultPrevented).toBe(false)
  expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
})
it('disables native formula edit buttons and marks nested text read-only without blocking copy', async () => {
  const app = await boot(),
    { host } = app
  const button = host.querySelector<HTMLButtonElement>('.doc-formula-edit')!
  expect(button).toBeTruthy()
  const edit = vi.fn<(event: Event) => void>()
  window.addEventListener('ai-docs-edit-inline-math', edit)
  cleanup.push(() => window.removeEventListener('ai-docs-edit-inline-math', edit))
  await act(async () =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
  )
  expect(edit).not.toHaveBeenCalled()
  expect(button.disabled).toBe(true)
  expect(button.title).toContain('原件')
  const textbox = host.querySelector<HTMLElement>('.doc-textbox-editor')!
  expect(textbox.getAttribute('aria-readonly')).toBe('true')
  const copy = new Event('copy', { bubbles: true, cancelable: true })
  const double = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
  await act(async () => {
    textbox.dispatchEvent(copy)
    textbox.dispatchEvent(double)
  })
  expect(copy.defaultPrevented).toBe(false)
  expect(double.defaultPrevented).toBe(false)
  expect(host.querySelector('.doc-content-editing')).toBeNull()
})

it('edits existing protected discussion through real Inspector and restores comments-only history without replacing body', async () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const zip = await JSZip.loadAsync(
    await fixture('<w:documentProtection w:edit="comments" w:enforcement="1"/>'),
  )
  zip.file(
    'word/comments.xml',
    `<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="用户"><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>已有讨论</w:t></w:r></w:p></w:comment><w:comment w:id="1" w:author="另一作者"><w:p><w:r><w:t>另一讨论</w:t></w:r></w:p></w:comment></w:comments>`,
  )
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="protectedComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>',
    ),
  )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    types.replace(
      '</Types>',
      '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>',
    ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const app = await boot(undefined, bytes),
    { host, editor } = app
  const body = editor.getJSON(),
    dom = host.querySelector('.ProseMirror')
  const setContent = vi.spyOn(editor.commands, 'setContent')
  const type = async (label: string, value: string) =>
    act(async () => {
      const input = host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        value,
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  await tab(host, '审阅')
  await click(host, '管理批注')
  expect(host.querySelector('.mimir-docx-comments__actions')).not.toBeNull()
  const version = app.handle().getVersion()
  await type('批注回复', '仅属于第一条的草稿')
  pickSelectOption(host, '选择批注', '另一作者：另一讨论')
  expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="批注回复"]')!.value).toBe('')
  expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="批注正文"]')!.value).toBe(
    '另一讨论',
  )
  pickSelectOption(host, '选择批注', '用户：已有讨论')
  expect(app.handle().getVersion()).toBe(version)
  const primary = host.querySelector<HTMLButtonElement>('button[aria-label="保存批注修改"]')!
  expect(primary.classList.contains('ant-btn-primary')).toBe(true)
  expect(primary.textContent).toBe('保存批注修改')
  expect(host.querySelectorAll('.mimir-docx-comments__actions .ant-btn-primary')).toHaveLength(1)
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="删除当前批注"]')!.disabled).toBe(
    true,
  )
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="添加批注"]')!.disabled).toBe(
    false,
  )
  expect(
    host.querySelector<HTMLButtonElement>('button[aria-label="管理脚注与尾注"]')!.disabled,
  ).toBe(true)
  await type('批注正文', '修改已有讨论')
  await click(host, '保存批注修改')
  expect(editor.isEditable).toBe(false)
  expect(editor.getJSON()).toEqual(body)
  expect(host.querySelector('.ProseMirror')).toBe(dom)
  expect((await app.handle().execute('read_comments', {})).data).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: '0', text: '修改已有讨论' })]),
  )
  await click(host, '撤销上次结构操作')
  expect(setContent).not.toHaveBeenCalled()
  expect((await app.handle().execute('read_comments', {})).data).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: '0', text: '已有讨论' })]),
  )
  await click(host, '管理批注')
  await type('批注回复', '界面新增回复')
  await click(host, '回复当前批注')
  await click(host, '解决当前批注')
  await click(host, '重新打开批注讨论')
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  expect(app.saved).toHaveBeenCalledTimes(1)
  const saved = app.saved.mock.calls[0]![0]
  const reopened = await openDocx(saved)
  expect(reopened.protection.readComments()).toEqual(
    expect.arrayContaining([expect.objectContaining({ text: '界面新增回复', parentId: '0' })]),
  )
  expect(reopened.protection.readComments()!.find((c) => c.id === '0')?.done).toBeUndefined()
  expect(editor.getJSON()).toEqual(body)
  const before = await JSZip.loadAsync(bytes),
    after = await JSZip.loadAsync(saved)
  expect(await after.file('word/document.xml')!.async('string')).toBe(
    await before.file('word/document.xml')!.async('string'),
  )
  expect(await after.file('word/settings.xml')!.async('string')).toBe(
    await before.file('word/settings.xml')!.async('string'),
  )
})

it('adds a protected comment through the frozen-selection Inspector and restores exact bytes with structure Undo', async () => {
  const app = await boot(undefined, await protectedAnchorsFixture()),
    { host, editor } = app
  await act(async () => editor.commands.setTextSelection({ from: 3, to: 7 }))
  await tab(host, '审阅')
  await click(host, '添加批注')
  const panel = host.querySelector<HTMLElement>('[aria-label="添加批注面板"]')!
  expect(panel).toBeTruthy()
  expect(panel.textContent).toContain('单段可以')
  expect(panel.querySelector('.mimir-docx-comments__body')).not.toBeNull()
  expect(panel.querySelector('.mimir-docx-comments__actions')).not.toBeNull()
  expect(panel.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  const input = panel.querySelector<HTMLTextAreaElement>('textarea[aria-label="批注内容"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '界面原生锚点批注',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click(host, '添加批注到文档')
  expect(editor.isEditable).toBe(false)
  expect(panel.textContent).toContain('批注已添加')
  expect((await app.handle().execute('read_comments', {})).data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        text: '界面原生锚点批注',
        anchor: expect.objectContaining({ text: '单段可以' }),
      }),
    ]),
  )
  await click(host, '撤销上次结构操作')
  const copied = await openDocx(app.bytes)
  expect(await copied.save(editor.getJSON())).toEqual(app.bytes)
  expect(host.querySelector('[aria-label="添加批注面板"]')).toBeNull()
  await act(async () => editor.commands.setTextSelection(1))
  await click(host, '添加批注')
  await act(async () =>
    host
      .querySelector('[aria-label="添加批注面板"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('[aria-label="添加批注面板"]')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('添加批注')
})

it.each([
  {
    selection: '原作者：可删除的原生讨论',
    title: '删除这条批注及其回复？',
    action: '删除批注',
    removed: 2,
  },
  {
    selection: '回复 · 回复者：单独可删除的回复',
    title: '删除这条回复？',
    action: '删除回复',
    removed: 1,
  },
])(
  'confirms the selected $action and replaces stale deletion notice after structure Undo',
  async ({ selection, title, action, removed }) => {
    const app = await boot(undefined, await protectedAnchorsFixture())
    await tab(app.host, '审阅')
    await click(app.host, '管理批注')
    pickSelectOption(app.host, '选择批注', selection)
    await click(app.host, '删除当前批注')
    const popup = document.querySelector<HTMLElement>('.ant-popconfirm')!
    expect(popup.textContent).toContain(title)
    const confirm = Array.from(popup.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === action,
    )!
    expect(confirm).toBeTruthy()
    await act(async () => confirm.click())
    const staleNotice = `已删除 ${removed} 条批注，尚未保存到库`
    expect(app.host.textContent).toContain(staleNotice)
    await act(async () =>
      app.host
        .querySelector('[aria-label="管理批注面板"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    await click(app.host, '撤销上次结构操作')
    expect(app.host.textContent).not.toContain(staleNotice)
    expect(app.host.textContent).toContain('已撤销上次结构操作')
    expect(app.dirty).toHaveBeenLastCalledWith(false)
    expect((await app.handle().execute('read_comments', {})).data).toEqual(
      expect.arrayContaining(['0', '1', '2'].map((id) => expect.objectContaining({ id }))),
    )
  },
)

it('saves Inspector additions and deletes the newly saved discussion through the same protected UI', async () => {
  const app = await boot(undefined, await protectedAnchorsFixture(), true),
    { host, editor } = app
  const handle = app.handle()
  await act(async () => editor.commands.setTextSelection({ from: 3, to: 7 }))
  await tab(host, '审阅')
  await click(host, '添加批注')
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="批注内容"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '保存后删除的新增讨论',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click(host, '添加批注到文档')
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  expect(app.handle()).toBe(handle)
  expect(handle.getVersion()).toBe(1)
  const reopened = await openDocx(app.saved.mock.calls[0]![0])
  expect(reopened.protection.readComments()!.some((c) => c.text === '保存后删除的新增讨论')).toBe(
    true,
  )
  await click(host, '管理批注')
  pickSelectOption(host, '选择批注', '用户：保存后删除的新增讨论')
  await click(host, '删除当前批注')
  const confirm = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm-buttons button'),
  ).find((b) => b.textContent === '删除批注')!
  expect(confirm).toBeTruthy()
  await act(async () => confirm.click())
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 2)
  expect(app.saved.mock.calls[1]![0]).toEqual(app.bytes)
  expect(editor.isEditable).toBe(false)
})

it('fills real protected form controls through the fixed Inspector action and preserves PM undo/redo after saves', async () => {
  const { protectedFormsFixture } = await import('../docx-protected-forms-fixture.test-helper.js')
  const app = await boot('', await protectedFormsFixture(), true)
  const { host, editor } = app
  await tab(host, '审阅')
  await click(host, '文档保护')
  const panel = host.querySelector<HTMLElement>('[aria-label="文档保护面板"]')!
  expect(panel.textContent).toContain('仅填写表单 · 正文只读')
  expect(editor.isEditable).toBe(false)
  expect(panel.querySelector('.mimir-docx-protection__body')).toBeTruthy()
  const footer = panel.querySelector('.mimir-docx-protection__actions')!
  expect(footer.querySelectorAll('button')).toHaveLength(1)
  expect(footer.querySelector('.ant-btn-primary')).toBeTruthy()
  await click(host, '勾选此复选框')
  expect(editor.state.doc.textContent).toContain('相邻旧式复选框：☒☐')
  expect(app.dirty).toHaveBeenLastCalledWith(true)
  expect(app.handle().getVersion()).toBe(1)
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  const one = await openDocx(app.saved.mock.calls[0]![0])
  expect(
    one.protection
      .readFormControls(one.content)
      .slice(0, 3)
      .map((c) => c.checked),
  ).toEqual([true, false, false])
  pickSelectOption(host, '选择复选框', '复选框 3 · 未勾选')
  await click(host, '勾选此复选框')
  expect(editor.state.doc.textContent).toContain('内容控件：☒')
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 2)
  const two = await openDocx(app.saved.mock.calls[1]![0])
  expect(
    two.protection
      .readFormControls(two.content)
      .slice(0, 3)
      .map((c) => c.checked),
  ).toEqual([true, false, true])
  await act(async () => {
    editor.commands.undo()
  })
  expect(editor.state.doc.textContent).toContain('内容控件：☐')
  expect(app.dirty).toHaveBeenLastCalledWith(true)
  await act(async () => {
    editor.commands.redo()
  })
  expect(editor.state.doc.textContent).toContain('内容控件：☒')
  expect(app.dirty).toHaveBeenLastCalledWith(false)
  pickSelectOption(host, '选择复选框', '禁用控件（复选框 4） · 未勾选')
  expect(panel.textContent).toContain('此旧式表单控件已禁用')
  expect(footer.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
  await act(async () => {
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(host.querySelector('[aria-label="文档保护面板"]')).toBeNull()
  expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).toBe('文档保护')
})

it('clicks only a genuine protected checkbox glyph, rejects paste and has clean rollback', async () => {
  const { protectedFormsFixture } = await import('../docx-protected-forms-fixture.test-helper.js')
  const app = await boot('', await protectedFormsFixture())
  const { editor, host } = app
  const session = await openDocx(app.bytes)
  const [control] = session.protection.readFormControls(editor.getJSON())
  const coords = vi.spyOn(editor.view, 'coordsAtPos').mockImplementation((pos, side) => ({
    // Forward resolution at the glyph end returns a wrapped next-line start.
    left: pos === control!.from || side !== -1 ? 10 : 24,
    right: 24,
    top: 10,
    bottom: 28,
  }))
  const glyph = host.querySelector<HTMLElement>('[data-instr-field="FORMCHECKBOX"]')!
  expect(glyph.dataset.mimirNativeForm).toBe('editable')
  expect(glyph.title).toContain('键盘填写')
  await act(async () =>
    glyph.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 15, clientY: 15 }),
    ),
  )
  expect(editor.state.doc.textContent).toContain('相邻旧式复选框：☒☐')
  expect(coords).toHaveBeenCalledWith(control!.to, -1)
  const current = editor.getJSON()
  await act(async () =>
    editor.view.dom.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true })),
  )
  expect(editor.getJSON()).toEqual(current)
  await act(async () => editor.commands.undo())
  expect(app.dirty).toHaveBeenLastCalledWith(false)
  expect(await session.save(editor.getJSON())).toEqual(app.bytes)
})

it('advances only the forms persisted fingerprint when a save finishes after another fill and Undo', async () => {
  const { protectedFormsFixture } = await import('../docx-protected-forms-fixture.test-helper.js')
  const app = await boot('', await protectedFormsFixture())
  const { host, editor } = app
  let finishSave!: () => void
  app.saved.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve
      }),
  )
  await tab(host, '审阅')
  await click(host, '文档保护')
  await click(host, '勾选此复选框')
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  pickSelectOption(host, '选择复选框', '复选框 3 · 未勾选')
  await click(host, '勾选此复选框')
  await act(async () => {
    editor.commands.undo()
  })
  expect(editor.state.doc.textContent).toContain('内容控件：☐')
  await act(async () => finishSave())
  expect(app.dirty).toHaveBeenLastCalledWith(false)
  await act(async () => {
    editor.commands.undo()
  })
  expect(app.dirty).toHaveBeenLastCalledWith(true)
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 2)
  expect(app.saved.mock.calls[1]![0]).toEqual(app.bytes)
})
