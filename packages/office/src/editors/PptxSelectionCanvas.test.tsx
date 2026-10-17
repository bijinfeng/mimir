/** @vitest-environment happy-dom */
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxSelectionCanvas } from './PptxSelectionCanvas.js'
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((close) => close()))
const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
  width,
  height,
  toJSON: () => ({}),
})

async function mount() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div'),
    canvas = document.createElement('div'),
    overlay = document.createElement('div')
  canvas.tabIndex = 0
  canvas.innerHTML =
    '<svg><g data-element-id="a"></g><g data-element-id="b"></g><g data-element-id="group"><g data-element-id="child"></g></g></svg>'
  host.append(canvas, overlay)
  document.body.append(host)
  canvas.getBoundingClientRect = () => rect(10, 20, 300, 200)
  for (const [i, node] of [...canvas.querySelectorAll('[data-element-id]')].entries())
    node.getBoundingClientRect = () => rect(30 + i * 50, 40, 30, 30)
  const onSelect = vi.fn<(ids: string[]) => void>(),
    ref = createRef<HTMLDivElement>()
  ref.current = canvas
  const root = createRoot(overlay)
  const render = async (binding = 'v1', disabled = false) =>
    act(async () =>
      root.render(
        <PptxSelectionCanvas
          host={ref}
          binding={binding}
          ids={['a', 'b', 'group']}
          selectedIds={['b']}
          disabled={disabled}
          onSelect={onSelect}
        />,
      ),
    )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render()
  const pointer = (type: string, x: number, y: number, options: Partial<PointerEventInit> = {}) =>
    act(() =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: y,
          ...options,
        }),
      ),
    )
  return { host, canvas, overlay, onSelect, render, pointer }
}
it('marquee intersects top-level objects, suppresses the follow-up click, and supports additive selection', async () => {
  const { canvas, overlay, onSelect, pointer } = await mount()
  const click = vi.fn<() => void>()
  canvas.addEventListener('click', click)
  pointer('pointerdown', 15, 25, { shiftKey: true })
  pointer('pointermove', 65, 85)
  expect(overlay.querySelector('.mimir-pptx-marquee')).not.toBeNull()
  pointer('pointerup', 65, 85)
  expect(onSelect).toHaveBeenLastCalledWith(['b', 'a'])
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  expect(click).not.toHaveBeenCalled()
  expect(overlay.querySelector('.mimir-pptx-marquee')).toBeNull()
  pointer('pointerdown', 15, 25)
  pointer('pointermove', 230, 85)
  pointer('pointerup', 230, 85)
  expect(onSelect).toHaveBeenLastCalledWith(['a', 'b', 'group'])
})
it('cancel, foreign pointers, context switch, and disabled state never publish a selection', async () => {
  const { canvas, overlay, onSelect, render, pointer } = await mount()
  pointer('pointerdown', 15, 25)
  pointer('pointermove', 100, 80, { pointerId: 2 })
  pointer('pointerup', 100, 80, { pointerId: 2 })
  expect(onSelect).not.toHaveBeenCalled()
  pointer('pointermove', 100, 80)
  pointer('pointercancel', 100, 80)
  pointer('pointerup', 100, 80)
  expect(onSelect).not.toHaveBeenCalled()
  pointer('pointerdown', 15, 25)
  pointer('pointermove', 100, 80)
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })),
  )
  expect(overlay.querySelector('.mimir-pptx-marquee')).toBeNull()
  pointer('pointerdown', 15, 25)
  pointer('pointermove', 100, 80)
  await render('v2')
  pointer('pointerup', 100, 80)
  expect(onSelect).not.toHaveBeenCalled()
  await render('v3', true)
  pointer('pointerdown', 15, 25)
  pointer('pointermove', 100, 80)
  pointer('pointerup', 100, 80)
  expect(onSelect).not.toHaveBeenCalled()
  // Object hits leave click-based selection to the editor.
  canvas.querySelector('[data-element-id="a"]')!.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 40,
      clientY: 50,
    }),
  )
  expect(overlay.querySelector('.mimir-pptx-marquee')).toBeNull()
})

it('captures Escape before editor shortcuts, preserves prior selection and cancels lost pointer capture', async () => {
  const { canvas, overlay, onSelect, pointer } = await mount()
  const editorShortcut = vi.fn<() => void>()
  canvas.addEventListener('keydown', editorShortcut)
  const canvasClick = vi.fn<() => void>()
  canvas.addEventListener('click', canvasClick)
  pointer('pointerdown', 15, 25)
  pointer('pointermove', 100, 80)
  await act(async () =>
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  expect(editorShortcut).not.toHaveBeenCalled()
  expect(overlay.querySelector('.mimir-pptx-marquee')).toBeNull()
  pointer('pointerup', 100, 80)
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  expect(canvasClick).not.toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
  pointer('pointerdown', 15, 25)
  pointer('pointermove', 100, 80)
  pointer('lostpointercapture', 100, 80)
  pointer('pointerup', 100, 80)
  expect(onSelect).not.toHaveBeenCalled()
  expect(overlay.querySelector('.mimir-pptx-marquee')).toBeNull()
})
