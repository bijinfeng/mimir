/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PptxTextRangeEditor, type PptxTextRangeEditorProps } from './PptxTextRangeEditor.js'
import type { Paragraph } from '../../vendor/packages/pptx-engine/src/types.js'

const paragraphs: Paragraph[] = [
  { runs: [{ text: 'Label: ', bold: true }, { text: 'body' }] },
  { runs: [{ text: '第二段🚀' }] },
]
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
})
function mount(overrides: Partial<PptxTextRangeEditorProps> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let props: PptxTextRangeEditorProps = {
    paragraphs,
    targetKey: 'doc/slide/shape',
    version: 4,
    selection: null,
    onSelectionChange: vi.fn<PptxTextRangeEditorProps['onSelectionChange']>(),
    onEdit: vi.fn<PptxTextRangeEditorProps['onEdit']>(),
    ...overrides,
  }
  const render = (update: Partial<PptxTextRangeEditorProps> = {}) => {
    props = { ...props, ...update }
    act(() => root.render(<PptxTextRangeEditor {...props} />))
  }
  render()
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render, props, area: host.querySelector('textarea')! }
}
function input(area: HTMLTextAreaElement, value: string, start = value.length) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value)
    area.setSelectionRange(start, start)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
describe('PPTX native text selection surface', () => {
  it('captures real cross-paragraph selection with identity and retains it when toolbar takes focus', () => {
    const change = vi.fn<PptxTextRangeEditorProps['onSelectionChange']>()
    const { area, render } = mount({ onSelectionChange: change })
    act(() => {
      area.focus()
      area.setSelectionRange(8, 15, 'backward')
      area.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    })
    expect(change).toHaveBeenLastCalledWith({
      targetKey: 'doc/slide/shape',
      version: 4,
      selection: { start: 8, end: 15, direction: 'backward' },
    })
    const toolbar = document.createElement('button')
    document.body.append(toolbar)
    cleanup.push(() => toolbar.remove())
    act(() => toolbar.focus())
    render({ version: 5, selection: { start: 8, end: 15, direction: 'backward' } })
    expect(document.activeElement).toBe(toolbar)
    expect([area.selectionStart, area.selectionEnd, area.selectionDirection]).toEqual([
      8,
      15,
      'backward',
    ])
  })
  it('publishes typing immediately with caret marks and the new selection', () => {
    const edit = vi.fn<PptxTextRangeEditorProps['onEdit']>()
    const { area } = mount({ onEdit: edit, pendingFormat: { italic: true } })
    input(area, 'Label: body!\n第二段🚀', 12)
    expect(edit).toHaveBeenCalledTimes(1)
    const [edits, event] = edit.mock.calls[0]!
    expect(
      edits[0]!.runs.some(
        (run: { text: string; italic?: boolean }) => run.text === '!' && run.italic,
      ),
    ).toBe(true)
    expect(edits[1]!.runs.map((r: { text: string }) => r.text).join('')).toBe('第二段🚀')
    expect(event).toMatchObject({
      targetKey: 'doc/slide/shape',
      version: 4,
      selection: { start: 12, end: 12 },
    })
  })
  it('buffers IME composition and discards a composition whose document/version changed', () => {
    const edit = vi.fn<PptxTextRangeEditorProps['onEdit']>()
    const { area, render } = mount({ onEdit: edit })
    act(() => area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    input(area, 'Label: 中文\n第二段🚀')
    expect(edit).not.toHaveBeenCalled()
    render({ targetKey: 'other-document', version: 5 })
    act(() => area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    expect(edit).not.toHaveBeenCalled()
    expect(area.value).toBe('Label: body\n第二段🚀')
  })
  it('commits valid IME at compositionend and Escape clears scope without propagating', () => {
    const edit = vi.fn<PptxTextRangeEditorProps['onEdit']>()
    const selection = vi.fn<PptxTextRangeEditorProps['onSelectionChange']>()
    const outer = vi.fn<(event: KeyboardEvent) => void>()
    const { area } = mount({ onEdit: edit, onSelectionChange: selection })
    act(() => area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    input(area, 'Label: 中文\n第二段🚀')
    act(() => area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    expect(edit).toHaveBeenCalledTimes(1)
    document.addEventListener('keydown', outer)
    cleanup.push(() => document.removeEventListener('keydown', outer))
    act(() =>
      area.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    )
    expect(selection).toHaveBeenLastCalledWith({
      targetKey: 'doc/slide/shape',
      version: 4,
      selection: null,
    })
    expect(outer).not.toHaveBeenCalled()
  })
  it('disabled editing cannot publish a delayed input', () => {
    const edit = vi.fn<PptxTextRangeEditorProps['onEdit']>()
    const { area } = mount({ disabled: true, onEdit: edit })
    input(area, 'stale')
    expect(edit).not.toHaveBeenCalled()
  })
})
