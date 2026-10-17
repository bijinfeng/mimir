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
const corpus = new Uint8Array(
  readFileSync(
    join(
      import.meta.dirname,
      '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
    ),
  ),
)
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function settle(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function press(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  expect(button).not.toBeNull()
  expect(button.disabled).toBe(false)
  act(() => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  await act(async () => button.click())
}
async function boot() {
  const zip = await JSZip.loadAsync(corpus),
    source = await zip.file('word/document.xml')!.async('string')
  const section = source.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? ''
  zip.file(
    'word/document.xml',
    source.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      `<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">HEL</w:t></w:r><w:r><w:t xml:space="preserve">LO WORLD</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">UNTOUCHED</w:t></w:r></w:p>${section}</w:body>`,
    ),
  )
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    rels.replace(/<Relationship\b[^>]*Type="[^"]*\/(?:image|hyperlink)"[^>]*\/>/g, ''),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
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
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <DocxEditor documentId="case" io={io} />
      </ConfigProvider>,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(
    () =>
      host.querySelector('[aria-label="保存到库"]')?.getAttribute('title') === '没有未保存的改动',
  )
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  const select = (from: number, to: number) =>
    act(() => editor.commands.setTextSelection({ from, to }))
  const open = async () => {
    await press(host, '大小写')
    await settle(() => !!host.querySelector('[role="menu"][aria-label="大小写"]'))
  }
  const choose = async (label: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.startsWith(label),
    )!
    expect(button).not.toBeNull()
    expect(button.disabled).toBe(false)
    act(() =>
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    )
    await act(async () => button.click())
  }
  const save = async () => {
    const count = saves.length + 1
    await press(host, '保存到库')
    await settle(() => saves.length === count)
    await settle(() => host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled)
  }
  return { host, editor, saves, select, open, choose, save }
}

it('real Ribbon has four named actions with examples, freezes the selection, saves/reopens and restores via undo/redo after saving', async () => {
  const { host, editor, saves, select, open, choose, save } = await boot()
  const original = editor.state.doc
  select(1, 12)
  await open()
  expect(host.querySelector('[aria-label="大小写"]')!.textContent).toContain('大小写')
  const items = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '[role="menu"][aria-label="大小写"] [role="menuitem"]',
    ),
  ]
  expect(items).toHaveLength(4)
  expect(items.map((item) => item.textContent)).toEqual([
    '句首大写 · Hello world.',
    '全部小写 · hello world',
    '全部大写 · HELLO WORLD',
    '每词首字母大写 · Hello World',
  ])
  expect(host.querySelector('[role="menu"][aria-label="大小写"]')!.textContent).toContain(
    'Shift+F3',
  )
  select(14, 23)
  let changes = 0
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++
  })
  await choose('句首大写')
  expect(changes).toBe(1)
  expect(editor.state.doc.child(0).textContent).toBe('Hello world')
  expect(editor.state.doc.child(0).child(0).marks[0]!.type.name).toBe('bold')
  expect(editor.state.doc.child(1)).toEqual(original.child(1))
  expect(host.querySelector('[role="menu"][aria-label="大小写"]')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('[aria-label="大小写"]'))
  await save()
  expect(
    (await openDocx(saves[0]!)).content.content?.[0]?.content?.map((node) => node.text).join(''),
  ).toBe('Hello world')
  act(() => editor.commands.undo())
  expect(editor.state.doc).toEqual(original)
  await save()
  expect(
    (await openDocx(saves[1]!)).content.content?.[0]?.content?.map((node) => node.text).join(''),
  ).toBe('HELLO WORLD')
  act(() => editor.commands.redo())
  await save()
  expect(
    (await openDocx(saves[2]!)).content.content?.[0]?.content?.map((node) => node.text).join(''),
  ).toBe('Hello world')
})

it('shows empty/stale disabled reasons, Escape restores the trigger, no-op does not mark dirty', async () => {
  const { host, editor, select, open, choose } = await boot()
  select(1, 1)
  await open()
  expect(host.querySelector('[role="menu"][aria-label="大小写"]')!.textContent).toContain(
    '请先选择',
  )
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].every(
      (button) => button.disabled,
    ),
  ).toBe(true)
  act(() =>
    host
      .querySelector('[role="menu"][aria-label="大小写"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('[role="menu"][aria-label="大小写"]')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('[aria-label="大小写"]'))
  select(1, 12)
  await open()
  await choose('全部大写')
  expect(host.querySelector('[aria-label="保存到库"]')?.getAttribute('title')).toBe(
    '没有未保存的改动',
  )
  await open()
  act(() => editor.commands.insertContent('changed'))
  expect(host.querySelector('[role="menu"][aria-label="大小写"]')!.textContent).toContain(
    '文档已变化',
  )
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].every(
      (button) => button.disabled,
    ),
  ).toBe(true)
})

it('real editor Shift+F3 uses the current range and leaves toolbar input keys alone', async () => {
  const { host, editor, select } = await boot()
  select(1, 12)
  const sendKey = () =>
    act(() =>
      editor.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F3',
          code: 'F3',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
  sendKey()
  expect(editor.state.doc.child(0).textContent).toBe('Hello World')
  sendKey()
  expect(editor.state.doc.child(0).textContent).toBe('hello world')
  sendKey()
  expect(editor.state.doc.child(0).textContent).toBe('HELLO WORLD')
  const input = host.querySelector<HTMLInputElement>('input')!
  expect(input).not.toBeNull()
  act(() => {
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'F3',
        code: 'F3',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  expect(editor.state.doc.child(0).textContent).toBe('HELLO WORLD')
})
