import { Extension, type Editor } from '@tiptap/core'
import { MarkdownEditor } from '@mimir/office'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { createExtensions } from './extensions.js'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

it('returns find and replace Escape/close focus to the live Markdown editor without changing content', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let editor!: Editor
  const capture = Extension.create({
    name: 'captureFindFocusEditor',
    onCreate() {
      editor = this.editor
    },
  })
  const save = vi.fn<() => Promise<void>>(async () => {})
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <MarkdownEditor
        documentId="find-focus"
        initialContent="查找正文"
        extensions={[...createExtensions(), capture]}
        onSave={save}
      />,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await vi.waitFor(() => expect(editor).toBeDefined())
  for (const exit of ['Escape', 'button']) {
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }),
      ),
    )
    const query = host.querySelector<HTMLInputElement>('[data-find-input]')!
    await vi.waitFor(() => expect(document.activeElement).toBe(query))
    act(() => {
      if (exit === 'Escape')
        query.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      else host.querySelector<HTMLButtonElement>('[aria-label="关闭查找"]')!.click()
    })
    await vi.waitFor(() => expect(document.activeElement).toBe(editor.view.dom))
    expect(host.querySelector('[data-find-input]')).toBeNull()
    expect(editor.getMarkdown()).toBe('查找正文')
  }
  expect(save).not.toHaveBeenCalled()
})
