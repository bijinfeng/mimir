// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PdfTextInsertPanel, type PdfInsertDraft } from './PdfTextInsertPanel.js'
import { PdfTextMarkupPanel } from './PdfTextMarkupPanel.js'
import { PdfPendingTextOverlay } from './PdfPendingTextOverlay.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((run) => run()))
async function mount(node: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(node))
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return host
}
async function click(node: Element) {
  await act(async () => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
function button(host: Element, label: string) {
  const node = host.querySelector(`button[aria-label="${label}"]`)
  if (!node) throw new Error(label)
  return node
}
const pointer = (target: Element, type: string, x: number, id = 1) =>
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        clientX: x,
        clientY: 100,
        button: 0,
        bubbles: true,
      }),
    )
  })

const draft: PdfInsertDraft = {
  text: '文字',
  fontSize: 14,
  color: '#000000',
  font: '',
  bold: false,
  italic: false,
  align: 'left',
  maxWidth: 100,
  x: 40,
  y: 60,
}

describe('PDF compact text controls', () => {
  it('keeps a single insert primary outside the scroll body and exposes current font/format/position', async () => {
    const apply = vi.fn<() => void>(),
      change = vi.fn<(value: PdfInsertDraft) => void>(),
      close = vi.fn<() => void>()
    const host = await mount(
      <PdfTextInsertPanel
        value={draft}
        page={2}
        onChange={change}
        busy={false}
        onApply={apply}
        onClose={close}
      />,
    )
    expect(
      host.querySelector('.mimir-pdf-inspector__content')?.contains(button(host, '插入到页面')),
    ).toBe(false)
    expect(host.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
    await click(button(host, '插入到页面'))
    expect(apply).toHaveBeenCalledOnce()
    await click(button(host, '插字粗体'))
    expect(change).toHaveBeenLastCalledWith({ ...draft, bold: true })
    expect(host.querySelector('[aria-label="文字 X 坐标"]')).not.toBeNull()
    await click(button(host, '关闭文字面板'))
    expect(close).toHaveBeenCalledOnce()
  })
  it('submits all/color semantic markup once, reports real count and cancels on unmount', async () => {
    let resolve!: (value: { ok: boolean; changed: boolean; data: { count: number } }) => void
    const apply = vi.fn<Parameters<typeof PdfTextMarkupPanel>[0]['onApply']>(
      () =>
        new Promise<{ ok: boolean; changed: boolean; data: { count: number } }>((done) => {
          resolve = done
        }),
    )
    const host = await mount(
      <PdfTextMarkupPanel
        selectedText="part"
        page={1}
        getVersion={() => 8}
        busy={false}
        onApply={apply}
        onClose={() => {}}
      />,
    )
    await click(button(host, '添加标注'))
    await click(button(host, '添加标注'))
    expect(apply).toHaveBeenCalledOnce()
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      text: 'part',
      type: 'highlight',
      color: '#FFE04D',
      all: false,
    })
    await act(async () => resolve({ ok: true, changed: true, data: { count: 3 } }))
    expect(host.textContent).toContain('已添加 3 处标注')
    expect(
      host.querySelector('.mimir-pdf-inspector__content')?.contains(button(host, '添加标注')),
    ).toBe(false)
    await click(button(host, '添加标注'))
    const signal = apply.mock.calls[1]?.[2] as AbortSignal
    cleanup.splice(0).forEach((run) => run())
    expect(signal.aborted).toBe(true)
  })

  it('captures one pointer, cancels Escape and commits a resized wrap width once', async () => {
    const commit = vi.fn<(value: { x: number; y: number; width: number }) => void>(),
      host = await mount(
        <PdfPendingTextOverlay
          insert={{
            id: 'Ttest',
            pageIndex: 0,
            x: 40,
            y: 50,
            width: 100,
            height: 20,
            text: 'test',
            fontSize: 14,
            color: [0, 0, 0],
          }}
          size={{ width: 400, height: 500 }}
          onCommit={commit}
        />,
      )
    const node = host.querySelector<HTMLElement>('[role="group"]')!
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 1000 }),
    })
    Object.assign(node, { setPointerCapture: vi.fn<(id: number) => void>() })
    pointer(node, 'pointerdown', 100)
    pointer(node, 'pointermove', 140)
    pointer(node, 'pointerup', 140, 2)
    expect(commit).not.toHaveBeenCalled()
    await act(async () =>
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    pointer(node, 'pointerup', 140)
    expect(commit).not.toHaveBeenCalled()
    pointer(node.querySelector('[data-resize]')!, 'pointerdown', 100)
    pointer(node, 'pointercancel', 110, 2)
    pointer(node, 'lostpointercapture', 110, 2)
    pointer(node, 'pointermove', 140)
    pointer(node, 'pointerup', 140)
    expect(commit).toHaveBeenCalledExactlyOnceWith({ x: 40, y: 50, width: 120 })
  })
  it('moves the native text outline with keyboard point steps, without publishing a no-op', async () => {
    const commit = vi.fn<(value: { x: number; y: number; width: number }) => void>(),
      host = await mount(
        <PdfPendingTextOverlay
          insert={{
            id: 'Ttest',
            pageIndex: 0,
            x: 40,
            y: 50,
            width: 100,
            height: 20,
            text: 'test',
            fontSize: 14,
            color: [0, 0, 0],
          }}
          size={{ width: 400, height: 500 }}
          onCommit={commit}
        />,
      )
    const node = host.querySelector('[role="group"]')!
    await act(async () =>
      node.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
      ),
    )
    expect(commit).toHaveBeenCalledWith({ x: 50, y: 50, width: 100 })
    const handle = host.querySelector('[role="slider"]')!
    await act(async () =>
      handle.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }),
      ),
    )
    expect(commit).toHaveBeenLastCalledWith({ x: 40, y: 50, width: 90 })
  })
})
