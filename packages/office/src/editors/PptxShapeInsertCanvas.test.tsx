/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxShapeInsertCanvas, type PptxShapeInsertCanvasProps } from './PptxShapeInsertCanvas.js'
import { resolveShapeDraw } from './pptx-shape-insert.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
function mount(patch: Partial<PptxShapeInsertCanvasProps> = {}) {
  const host = document.createElement('div')
  host.className = 'mimir-editor'
  document.body.append(host)
  const root = createRoot(host)
  let props: PptxShapeInsertCanvasProps = {
    documentId: 'doc',
    slideKey: 'slide1.xml',
    slide: 0,
    version: 3,
    kind: 'rect',
    width: 960,
    height: 540,
    slideWidth: 9144000,
    slideHeight: 5143500,
    disabled: false,
    apply: vi.fn<PptxShapeInsertCanvasProps['apply']>(async () => true),
    onExit: vi.fn<() => void>(),
    onBusy: vi.fn<(busy: boolean) => void>(),
    ...patch,
  }
  const render = (next: Partial<PptxShapeInsertCanvasProps> = {}) => {
    props = { ...props, ...next }
    act(() => root.render(<PptxShapeInsertCanvas {...props} />))
    const svg = host.querySelector('svg')
    if (svg) {
      svg.getBoundingClientRect = () => ({
        left: 20,
        top: 10,
        width: 480,
        height: 270,
        x: 20,
        y: 10,
        right: 500,
        bottom: 280,
        toJSON: () => null,
      })
      svg.setPointerCapture = vi.fn<(pointerId: number) => void>()
      svg.releasePointerCapture = vi.fn<(pointerId: number) => void>()
    }
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render, props }
}
function pointer(host: HTMLElement, type: string, x = 70, y = 60, pointerId = 1, shiftKey = false) {
  act(() =>
    host.querySelector('svg')!.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId,
        isPrimary: pointerId === 1,
        button: 0,
        shiftKey,
      }),
    ),
  )
}
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
it('shows a native-shape draft at scaled coordinates without writing and commits exactly once on release', async () => {
  const { host, props } = mount()
  pointer(host, 'pointerdown')
  pointer(host, 'pointermove', 170, 110)
  expect(host.querySelector('.mimir-pptx-shape-insert-preview')).not.toBeNull()
  expect(props.apply).not.toHaveBeenCalled()
  pointer(host, 'pointerup', 170, 110)
  pointer(host, 'pointerup', 170, 110)
  await settle()
  expect(props.apply).toHaveBeenCalledExactlyOnceWith(
    { kind: 'rect', slide: 0, offset: { x: 952500, y: 952500, cx: 1905000, cy: 952500 } },
    3,
    expect.any(AbortSignal),
  )
  expect(props.onExit).toHaveBeenCalledTimes(1)
})
it('uses click defaults, Shift square/45 degrees and exact left/up connector direction', async () => {
  const { host, props } = mount({ kind: 'lineArrow' })
  pointer(host, 'pointerdown')
  pointer(host, 'pointerup', 71, 60)
  await settle()
  expect(vi.mocked(props.apply).mock.calls[0]![0]).toMatchObject({
    offset: { cx: 914400, cy: 0 },
    flipH: false,
    flipV: false,
  })
  expect(resolveShapeDraw('rect', { x: 100, y: 100 }, { x: 80, y: 90 }, true, 30)).toEqual({
    x: 80,
    y: 80,
    w: 20,
    h: 20,
  })
  expect(resolveShapeDraw('lineArrow', { x: 100, y: 100 }, { x: 60, y: 50 }, true, 50)).toEqual({
    x: 55,
    y: 55,
    w: 45,
    h: 45,
    flipH: true,
    flipV: true,
  })
  expect(resolveShapeDraw('rect', { x: 100, y: 100 }, { x: 100, y: 150 }, false, 50)).toMatchObject(
    { w: 2, h: 50 },
  )
})
it('cancels primary pointer on second pointer/cancel/blur and invalidates document/page/version/kind gestures', async () => {
  const { host, props, render } = mount()
  for (const action of [
    'second',
    'pointercancel',
    'blur',
    'version',
    'slideKey',
    'documentId',
    'kind',
  ]) {
    pointer(host, 'pointerdown')
    if (action === 'second') pointer(host, 'pointerdown', 90, 90, 2)
    else if (action === 'pointercancel') pointer(host, 'pointercancel')
    else if (action === 'blur')
      act(() =>
        host.querySelector('svg')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
      )
    else
      render(
        action === 'version'
          ? { version: 4 }
          : action === 'slideKey'
            ? { slideKey: 'slide2.xml', slide: 1 }
            : action === 'documentId'
              ? { documentId: 'other' }
              : { kind: 'ellipse' },
      )
    pointer(host, 'pointerup')
  }
  await settle()
  expect(props.apply).not.toHaveBeenCalled()
})
it('aborts pending on Escape before an Inspector listener, ignores late results and prevents re-entry', async () => {
  let finish!: (value: boolean) => void
  const apply = vi.fn<PptxShapeInsertCanvasProps['apply']>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { host, props, render } = mount({ apply })
  const inspector = vi.fn<(event: Event) => void>()
  host.addEventListener('keydown', inspector)
  pointer(host, 'pointerdown')
  pointer(host, 'pointerup')
  pointer(host, 'pointerdown')
  pointer(host, 'pointerup')
  expect(apply).toHaveBeenCalledTimes(1)
  const signal = apply.mock.calls[0]![2]
  act(() =>
    host
      .querySelector('svg')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
  )
  expect(signal.aborted).toBe(true)
  expect(inspector).not.toHaveBeenCalled()
  expect(props.onExit).toHaveBeenCalledTimes(1)
  await act(async () => finish(false))
  expect(host.textContent).not.toContain('未插入')
  render({ version: 4 })
  pointer(host, 'pointerdown')
  pointer(host, 'pointerup')
  const second = apply.mock.calls[1]![2]
  render({ kind: null })
  expect(second.aborted).toBe(true)
  await act(async () => finish(true))
  expect(props.onExit).toHaveBeenCalledTimes(1)
})
it('retains a retryable failure and aborts requests on window blur or disabled changes', async () => {
  const { host, props, render } = mount({
    apply: vi.fn<PptxShapeInsertCanvasProps['apply']>(async () => false),
  })
  pointer(host, 'pointerdown')
  pointer(host, 'pointerup')
  await settle()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('原有内容已保留')
  let finish!: (value: boolean) => void
  const apply = vi.fn<PptxShapeInsertCanvasProps['apply']>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  render({ apply })
  pointer(host, 'pointerdown')
  pointer(host, 'pointerup')
  act(() => window.dispatchEvent(new Event('blur')))
  expect(apply.mock.calls[0]![2].aborted).toBe(true)
  expect(props.onExit).toHaveBeenCalledTimes(1)
  await act(async () => finish(false))
  pointer(host, 'pointerdown')
  pointer(host, 'pointerup')
  render({ disabled: true })
  expect(apply.mock.calls[1]![2].aborted).toBe(true)
  await act(async () => finish(false))
})
