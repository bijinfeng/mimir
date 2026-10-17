// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import type { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { afterEach, expect, it } from 'vitest'
import { DocxEditor } from './DocxEditor.js'
import { openDocx } from '../docx.js'
import { listDefinitionEdits } from '../docx-list-save.js'
import { openSelect } from '../shell/antd-test-dom.js'
const bytes = new Uint8Array(
  readFileSync(
    join(
      import.meta.dirname,
      '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
    ),
  ),
)
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function settle(done: () => boolean, diagnostic?: () => string | undefined) {
  for (let i = 0; i < 100 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  if (!done() && diagnostic) throw new Error(diagnostic() ?? '未收到保存结果')
  expect(done()).toBe(true)
}
async function press(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  expect(button).not.toBeNull()
  expect(button.disabled).toBe(false)
  act(() => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  await act(async () => button.click())
}
function pick(host: HTMLElement, label: string, text: string) {
  openSelect(host, label)
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (node) => node.textContent === text,
  )!
  expect(option).not.toBeNull()
  act(() => {
    option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    option.click()
  })
}
function type(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  expect(input).not.toBeNull()
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function parts(input: Uint8Array) {
  const zip = await JSZip.loadAsync(input)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}
async function boot() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const saves: Uint8Array[] = []
  const io = {
    load: async () => bytes,
    save: async (data: Uint8Array) => {
      saves.push(data.slice())
    },
  }
  const render = async (documentId = 'lists') =>
    act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <DocxEditor documentId={documentId} io={io} />
        </ConfigProvider>,
      ),
    )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render()
  await settle(
    () =>
      host.querySelector('[aria-label="保存到库"]')?.getAttribute('title') === '没有未保存的改动',
  )
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  const end = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize - 1
  act(() => editor.commands.setTextSelection({ from: 1, to: end }))
  const save = async (count: number) => {
    await press(host, '保存到库')
    await settle(
      () => saves.length === count,
      () => host.querySelector('.me-notice')?.textContent ?? undefined,
    )
    await settle(
      () => host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === true,
    )
  }
  return { host, editor, saves, render, save }
}
it('real Ribbon opens compact Inspector, applies final text to frozen actual selection once, saves twice and undo/redo exact ZIP entries', async () => {
  const { host, editor, saves, save } = await boot()
  const original = editor.state.doc
  await press(host, '列表设置')
  expect(host.querySelector('[aria-label="列表设置面板"]')).not.toBeNull()
  expect(host.querySelector('.mimir-docx-lists__current')?.textContent).toContain('2 段')
  expect(host.querySelector('[aria-label="重置列表草稿"]')?.textContent).toBe('重置')
  expect(host.querySelector('[aria-label="重置列表草稿"] svg')).not.toBeNull()
  const footer = host.querySelector('.mimir-docx-lists__actions')!
  expect(footer.contains(host.querySelector('[aria-label="应用列表"]'))).toBe(true)
  expect(host.querySelector('.mimir-docx-lists__scroll')!.contains(footer)).toBe(false)
  pick(host, '样式库', '多级列表')
  await press(host, '分级数字')
  type(host, '编号格式文字', '第%1项')
  expect(editor.state.doc).toBe(original)
  let changes = 0
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++
  })
  await press(host, '应用列表')
  expect(changes).toBe(1)
  expect(editor.state.doc.child(0).attrs.numId).toBe(editor.state.doc.child(1).attrs.numId)
  expect(editor.state.doc.child(2).toJSON()).toEqual(original.child(2).toJSON())
  expect(host.querySelector('[aria-label="应用列表"]')?.textContent).toBe('应用列表')
  const id = editor.state.doc.child(0).attrs.numId as string
  await save(1)
  const reopened = await openDocx(saves[0]!)
  expect(reopened.footnotes.parsed.numbering.get(id)?.levels[0]?.lvlText).toBe('第%1项')
  for (const index of [0, 1]) {
    const node = reopened.content.content![index]!
    expect(node.type).toBe('docListItem')
    expect(node.attrs?.numId).toBe(id)
    expect(node.attrs?.styleId ?? null).toBe(original.child(index).attrs.styleId ?? null)
  }
  type(host, '编号格式文字', '章节%1：')
  await press(host, '应用列表')
  await save(2)
  await press(host, '撤销 (Ctrl+Z)')
  await save(3)
  expect(await parts(saves[2]!)).toEqual(await parts(saves[0]!))
  await press(host, '重做 (Ctrl+Shift+Z)')
  await save(4)
  expect(await parts(saves[3]!)).toEqual(await parts(saves[1]!))
  expect(listDefinitionEdits(editor.state.doc)).toHaveLength(2)
})
it('selection moves keep the original target; content edit locks stale draft; Escape restores actual list entry focus and source switch closes it', async () => {
  const { host, editor, render } = await boot()
  await press(host, '列表设置')
  await press(host, '圆点')
  act(() => editor.commands.setTextSelection(editor.state.doc.content.size - 1))
  await press(host, '应用列表')
  expect(editor.state.doc.child(0).type.name).toBe('docListItem')
  expect(editor.state.doc.child(1).type.name).toBe('docListItem')
  expect(editor.state.doc.lastChild!.type.name).not.toBe('docListItem')
  type(host, '编号格式文字', '%1)')
  act(() => editor.commands.insertContent('人工编辑'))
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用列表"]')?.disabled).toBe(true)
  expect(host.querySelector('.mimir-docx-lists__actions [role="alert"]')?.textContent).toContain(
    '文档或附加结构已变化',
  )
  const inspector = host.querySelector<HTMLElement>('[aria-label="列表设置面板"]')!
  act(() => inspector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(host.querySelector('[aria-label="列表设置面板"]')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('列表设置')
  await press(host, '列表设置')
  await render('new-document')
  await settle(() => host.querySelector('[aria-label="列表设置面板"]') === null)
})
it('mixed list and non-list selection can explicitly clear formatting', async () => {
  const { host, editor } = await boot()
  act(() => editor.commands.setTextSelection(2))
  await press(host, '项目符号列表')
  act(() =>
    editor.commands.setTextSelection({
      from: 1,
      to: editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize - 1,
    }),
  )
  await press(host, '列表设置')
  expect(host.querySelector('.mimir-docx-lists__current')?.textContent).toContain('混合列表格式')
  pick(host, '文档列表', '无列表')
  await press(host, '应用列表')
  expect(editor.state.doc.child(0).type.name).toBe('docParagraph')
  expect(editor.state.doc.child(1).type.name).toBe('docParagraph')
})

it('commits a number-only draft on the first Apply mousedown for an existing list, then saves its native start and indent', async () => {
  const { host, editor, saves, save } = await boot()
  await press(host, '编号列表')
  await press(host, '列表设置')
  const before = editor.state.doc
  type(host, '起始编号', '11')
  expect(editor.state.doc).toBe(before)
  await press(host, '应用列表')
  await save(1)
  const firstId = editor.state.doc.child(0).attrs.numId as string
  expect(
    (await openDocx(saves[0]!)).footnotes.parsed.numbering.get(firstId)?.levels[0]?.start,
  ).toBe(11)
  type(host, '文字缩进', '63.5')
  await press(host, '应用列表')
  await save(2)
  const secondId = editor.state.doc.child(0).attrs.numId as string
  expect(
    (await openDocx(saves[1]!)).footnotes.parsed.numbering.get(secondId)?.levels[0]?.indentLeft,
  ).toBe(1270)
})
