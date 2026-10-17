/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { undoDepth } from '@tiptap/pm/history'
import { afterEach, expect, it, vi } from 'vitest'
import { DocxEditor } from './DocxEditor.js'
import { openDocx } from '../docx.js'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import { outlineFixture } from './docx-outline-test-fixture.js'
import { openSelect, pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let index = 0; index < 200 && !done(); index++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function click(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')].find(
    (candidate) => candidate.getAttribute('aria-label') === label && !candidate.closest('[hidden]'),
  )!
  expect(button).toBeTruthy()
  expect(button.disabled).toBe(false)
  await act(async () => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.click()
  })
}
async function boot(protectedDocument = false, bytesOverride?: Uint8Array) {
  const bytes = bytesOverride ?? (await outlineFixture(protectedDocument)),
    host = document.createElement('div'),
    root = createRoot(host),
    dirty = vi.fn<(value: boolean) => void>(),
    save = vi.fn<(bytes: Uint8Array) => Promise<void>>().mockResolvedValue(undefined)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let handle: DocxAgentHandle | null = null
  await act(async () =>
    root.render(
      <DocxEditor
        documentId="outline"
        io={{ load: async () => bytes, save }}
        onDirtyChange={dirty}
        onAgentHandleChange={(value) => {
          handle = value
        }}
      />,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!handle)
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((tab) => tab.textContent === '视图')!
      .click(),
  )
  return { host, editor, handle: () => handle!, dirty, save }
}
it('applies to the explicitly selected heading after selection moves, preserves rich text, and undo is one step', async () => {
  const app = await boot(),
    { host, editor } = app,
    dom = editor.view.dom,
    before = editor.getJSON(),
    depth = undoDepth(editor.state)
  await click(host, '文档导航')
  const apply = host.querySelector<HTMLButtonElement>('[aria-label="应用标题层级"]')!
  expect(apply.textContent).toBe('应用标题层级')
  expect(apply.disabled).toBe(true)
  expect(apply.title).toBe('请先选择一个标题')
  await click(host, '转到标题：重复  中文 Link')
  expect(apply.textContent).toBe('应用标题层级')
  expect(apply.title).toBe('层级未变化')
  expect(selectValueText(host, '标题层级')).toBe('1 级')
  const version = app.handle().getVersion(),
    inline = editor.state.doc.firstChild!.content.toJSON()
  act(() => editor.commands.setTextSelection(editor.state.doc.content.size - 1))
  expect(app.handle().getVersion()).toBe(version)
  pickSelectOption(host, '标题层级', '9 级')
  await click(host, '应用标题层级')
  expect(editor.state.doc.firstChild!.attrs.level).toBe(9)
  expect(editor.state.doc.firstChild!.content.toJSON()).toEqual(inline)
  expect(undoDepth(editor.state)).toBe(depth + 1)
  expect(editor.view.dom).toBe(dom)
  expect(host.querySelectorAll('.ProseMirror')).toHaveLength(1)
  expect(host.querySelector('[aria-label="当前标题"]')!.textContent).toContain('当前 9 级')
  act(() => editor.commands.undo())
  expect(editor.getJSON()).toEqual(before)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用标题层级"]')!.disabled).toBe(true)
  expect(app.save).not.toHaveBeenCalled()
})
it('invalidates a level draft after edit→undo, keeps numbered levels disabled and supports empty/duplicate targets', async () => {
  const { host, editor, handle } = await boot()
  await click(host, '文档导航')
  await click(host, '转到标题：重复  中文 Link')
  pickSelectOption(host, '标题层级', '7 级')
  act(() => {
    editor.commands.insertContent('人工改动')
    editor.commands.undo()
  })
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用标题层级"]')!.disabled).toBe(true)
  expect(selectValueText(host, '标题层级')).toBe('7 级')
  expect(host.textContent).toContain('文档已修改，请重新选择标题')
  await click(host, '转到标题：编号标题')
  expect(host.querySelector('[aria-label="当前标题"]')!.textContent).toContain(
    '编号标题请通过列表与样式工具调整层级',
  )
  expect(host.querySelector<HTMLButtonElement>('[aria-label="编辑标题"]')!.disabled).toBe(false)
  const version = handle().getVersion()
  await click(host, '转到标题：空标题')
  expect(editor.state.selection.$from.parent.textContent).toBe('')
  expect(host.querySelector('[aria-label="当前标题"]')!.textContent).toContain('当前 9 级')
  await click(host, '转到标题：重复  中文')
  expect(editor.state.selection.$from.parent.textContent).toBe('重复  中文')
  expect(handle().getVersion()).toBe(version)
})
it('leaves reading for explicit in-place editing and keeps focus in the original rich heading when the overlay closes', async () => {
  const { host, editor, handle, dirty } = await boot(),
    dom = editor.view.dom,
    version = handle().getVersion(),
    before = editor.getJSON()
  await click(host, '阅读模式')
  await click(host, '文档导航')
  await click(host, '转到标题：重复  中文 Link')
  await click(host, '编辑标题')
  expect(host.querySelector('[aria-label="文档导航面板"]')).toBeNull()
  expect(editor.isEditable).toBe(true)
  expect(document.activeElement).toBe(dom)
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect(dirty).not.toHaveBeenCalledWith(true)
  act(() => editor.commands.insertContent('新增'))
  expect(editor.state.doc.firstChild!.textContent).toBe('新增重复  中文 Link')
  expect(
    editor.state.doc.firstChild!.lastChild!.marks.some((mark) => mark.type.name === 'link'),
  ).toBe(true)
  expect(editor.view.dom).toBe(dom)
  expect(host.textContent).toContain('Visible body between headings')
})
it('converts a paragraph promoted by a live style definition back to body', async () => {
  const zip = await JSZip.loadAsync(await outlineFixture())
  const styles = await zip.file('word/styles.xml')!.async('string')
  zip.file(
    'word/styles.xml',
    styles.replace('<w:basedOn w:val="Heading3"/>', '<w:basedOn w:val="Normal"/>'),
  )
  const { host, editor, handle, save } = await boot(
    false,
    await zip.generateAsync({ type: 'uint8array' }),
  )
  const index = 11
  expect(editor.state.doc.child(index).type.name).toBe('docParagraph')
  await act(async () => {
    await handle().execute('define_style', { styleId: 'StyledHeading', basedOn: 'Heading3' })
  })
  await click(host, '文档导航')
  await settle(() => !!host.querySelector('[aria-label="转到标题：样式标题"]'))
  await click(host, '转到标题：样式标题')
  pickSelectOption(host, '标题层级', '正文')
  const before = editor.getJSON(),
    depth = undoDepth(editor.state)
  await click(host, '应用标题层级')
  expect(editor.state.doc.child(index).attrs.styleId).toBeNull()
  expect(undoDepth(editor.state)).toBe(depth + 1)
  expect(host.querySelector('[aria-label="转到标题：样式标题"]')).toBeNull()
  await click(host, '保存到库')
  await settle(() => save.mock.calls.length === 1)
  const reopened = await openDocx(save.mock.calls[0]![0])
  expect(reopened.content.content![index]!.type).toBe('docParagraph')
  expect(reopened.content.content![index]!.attrs?.styleId ?? null).toBeNull()
  act(() => editor.commands.undo())
  expect(editor.getJSON()).toEqual(before)
  await click(host, '保存到库')
  await settle(() => save.mock.calls.length === 2)
  const restored = await openDocx(save.mock.calls[1]![0])
  expect(restored.content.content![index]!.type).toBe('docHeading')
  expect(restored.content.content![index]!.attrs?.level).toBe(3)
})
it('closes the actual level popup before the navigation Inspector on Escape', async () => {
  const { host } = await boot()
  await click(host, '文档导航')
  await click(host, '转到标题：重复  中文 Link')
  openSelect(host, '标题层级')
  const input = host.querySelector<HTMLInputElement>('input[aria-label="标题层级"]')!
  expect(input.getAttribute('aria-expanded')).toBe('true')
  await act(async () => {
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  expect(input.getAttribute('aria-expanded')).toBe('false')
  expect(host.querySelector('[aria-label="文档导航面板"]')).not.toBeNull()
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  expect(host.querySelector('[aria-label="文档导航面板"]')).toBeNull()
})
it('retains navigation for protected originals, with the actual restriction visible and no write state', async () => {
  const { host, editor, handle, dirty } = await boot(true),
    version = handle().getVersion(),
    before = editor.getJSON(),
    depth = undoDepth(editor.state)
  await click(host, '文档导航')
  await click(host, '转到标题：重复  中文 Link')
  expect(host.querySelector<HTMLButtonElement>('[aria-label="编辑标题"]')!.disabled).toBe(true)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用标题层级"]')!.disabled).toBe(true)
  expect(host.querySelector('[aria-label="当前标题"]')!.textContent).toContain('只读')
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect(undoDepth(editor.state)).toBe(depth)
  expect(dirty).not.toHaveBeenCalledWith(true)
})
