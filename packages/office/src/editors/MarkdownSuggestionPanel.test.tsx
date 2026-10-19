/** @vitest-environment happy-dom */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MarkdownSuggestionPanel } from './MarkdownSuggestionPanel.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('remeasures after scroll and resize, keeping a short viewport menu inside its edges', () => {
  vi.stubGlobal('innerWidth', 320)
  vi.stubGlobal('innerHeight', 250)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>unchanged</p>' })
  let caret = { left: 300, right: 300, top: 190, bottom: 210 }
  vi.spyOn(editor.view, 'coordsAtPos').mockImplementation(() => caret)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() =>
    root.render(
      <MarkdownSuggestionPanel
        editor={editor}
        width={280}
        maxHeight={320}
        selected={0}
        role="menu"
        label="插入内容"
        className="test-menu"
      >
        <button role="menuitem">正文</button>
      </MarkdownSuggestionPanel>,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
    editor.destroy()
  })
  const panel = host.querySelector<HTMLElement>('.test-menu')!
  Object.defineProperty(panel, 'scrollHeight', { configurable: true, get: () => 300 })
  act(() => window.dispatchEvent(new Event('resize')))
  expect(Number.parseFloat(panel.style.top)).toBe(8)
  expect(Number.parseFloat(panel.style.left)).toBe(32)
  expect(Number.parseFloat(panel.style.maxHeight)).toBe(176)

  caret = { left: 20, right: 20, top: 70, bottom: 90 }
  act(() => editor.view.dom.dispatchEvent(new Event('scroll', { bubbles: false })))
  // The unattached editor is outside window's capture tree; use the real scroll host.
  act(() => host.dispatchEvent(new Event('scroll', { bubbles: false })))
  expect(Number.parseFloat(panel.style.top)).toBe(96)
  expect(Number.parseFloat(panel.style.left)).toBe(20)
  expect(Number.parseFloat(panel.style.maxHeight)).toBe(146)

  vi.stubGlobal('innerWidth', 180)
  caret = { left: 170, right: 170, top: 70, bottom: 90 }
  act(() => window.dispatchEvent(new Event('resize')))
  expect(Number.parseFloat(panel.style.left)).toBe(8)
  expect(Number.parseFloat(panel.style.width)).toBe(164)
  vi.stubGlobal('innerWidth', 320)
  caret = { left: 20, right: 20, top: 70, bottom: 90 }
  act(() => window.dispatchEvent(new Event('resize')))
  caret = { left: 30, right: 30, top: 70, bottom: 90 }
  act(() => editor.commands.setTextSelection(2))
  // Moving within the same slash query can keep every candidate DOM node unchanged.
  expect(Number.parseFloat(panel.style.left)).toBe(30)
  caret = { left: 30, right: 30, top: 80, bottom: 100 }
  act(() => editor.commands.insertContent('!'))
  expect(Number.parseFloat(panel.style.top)).toBe(106)
  act(() => editor.commands.undo())
  expect(editor.getText()).toBe('unchanged')
})

it('reveals keyboard candidates by scrolling only the suggestion list', () => {
  const editor = new Editor({ extensions: [StarterKit], content: '<p>unchanged</p>' })
  vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ left: 20, right: 20, top: 40, bottom: 60 })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const draw = (selected: number) =>
    act(() =>
      root.render(
        <MarkdownSuggestionPanel
          editor={editor}
          width={280}
          maxHeight={180}
          selected={selected}
          role="listbox"
          label="链接到笔记"
          className="test-menu"
        >
          {Array.from({ length: 12 }, (_, index) => (
            <button key={index} role="option" aria-selected={index === selected}>
              笔记{index}
            </button>
          ))}
        </MarkdownSuggestionPanel>,
      ),
    )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
    editor.destroy()
  })
  draw(0)
  const panel = host.querySelector<HTMLElement>('.test-menu')!
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 66, 280, 180))
  panel.querySelectorAll<HTMLElement>('[role="option"]').forEach((item, index) => {
    vi.spyOn(item, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(20, 70 + index * 32 - panel.scrollTop, 280, 32),
    )
  })
  const before = editor.state.selection.toJSON()
  draw(11)
  expect(panel.scrollTop).toBe(208)
  draw(0)
  expect(panel.scrollTop).toBe(4)
  expect(host.scrollTop).toBe(0)
  expect(editor.state.selection.toJSON()).toEqual(before)
  expect(editor.getText()).toBe('unchanged')
})
