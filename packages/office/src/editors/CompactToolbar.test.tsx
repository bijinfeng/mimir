/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { CompactToolbar } from './CompactToolbar.js'

let notifyResize: ResizeObserverCallback | null = null

class TestResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    notifyResize = callback
  }
  observe() {}
  disconnect() {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  notifyResize = null
})

function rect(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    right,
    width: right - left,
    top: 0,
    bottom: 30,
    height: 30,
    toJSON: () => ({}),
  } as DOMRect
}

it('moves one command tree into the named overflow when the editor column narrows', async () => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const action = vi.fn<() => void>()
  act(() => {
    root.render(
      <CompactToolbar
        sections={[
          { key: 'primary', label: '常用', minWidth: 0, content: <button>常用命令</button> },
          {
            key: 'secondary',
            label: '编辑',
            minWidth: 500,
            content: <button onClick={action}>编辑命令</button>,
          },
        ]}
      />,
    )
  })
  expect(host.querySelectorAll('button').length).toBe(2)

  act(() => {
    notifyResize?.([{ contentRect: { width: 320 } } as ResizeObserverEntry], {} as ResizeObserver)
  })
  expect(host.querySelector('button[aria-label="更多工具"]')).not.toBeNull()
  expect(
    [...host.querySelectorAll('button')].filter((button) => button.textContent === '编辑命令'),
  ).toHaveLength(0)

  act(() => {
    host.querySelector<HTMLButtonElement>('button[aria-label="更多工具"]')?.click()
  })
  await act(async () => Promise.resolve())
  expect(host.querySelectorAll('button').length).toBe(3)
  const overflowAction = host.querySelector<HTMLButtonElement>('[aria-label="编辑"] button')
  expect(overflowAction?.textContent).toBe('编辑命令')
  expect(document.activeElement).toBe(overflowAction)
  act(() => {
    overflowAction?.click()
  })
  expect(action).toHaveBeenCalledOnce()

  act(() => {
    overflowAction?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  })
  expect(host.querySelector('[role="menu"]')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('button[aria-label="更多工具"]'))

  act(() => {
    notifyResize?.([{ contentRect: { width: 800 } } as ResizeObserverEntry], {} as ResizeObserver)
  })
  expect(host.querySelectorAll('button[aria-label="更多工具"]')).toHaveLength(0)
  expect(
    [...host.querySelectorAll('button')].filter((button) => button.textContent === '编辑命令'),
  ).toHaveLength(1)

  act(() => root.unmount())
  host.remove()
})

it.each([420, 640, 1000])('keeps the overflow panel inside a %ipx editor column', (width) => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.stubGlobal('innerWidth', 1600)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('mimir-editor')) return rect(100, 100 + width)
    if (this.classList.contains('mimir-compact-toolbar')) return rect(100, 100 + width)
    if (this.getAttribute('aria-label') === '更多工具')
      return rect(100 + width - 70, 100 + width - 8)
    return rect(0, 0)
  })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <div className="mimir-editor">
        <CompactToolbar
          sections={[
            { key: 'main', label: '常用', minWidth: 0, content: <button>常用</button> },
            { key: 'extra', label: '附加', minWidth: 1200, content: <button>附加</button> },
          ]}
        />
      </div>,
    )
  })
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="更多工具"]')?.click())
  const panel = host.querySelector<HTMLElement>('.me-menu__panel')
  expect(panel?.style.width).toBe('320px')
  expect(panel?.style.left).toBe(`${100 + width - 328}px`)
  expect(Number.parseFloat(panel?.style.maxHeight ?? '')).toBeLessThanOrEqual(
    window.innerHeight * 0.6,
  )
  expect(Number.parseFloat(panel?.style.maxHeight ?? '')).toBeLessThanOrEqual(
    window.innerHeight - Number.parseFloat(panel?.style.top ?? '') - 8,
  )
  act(() => root.unmount())
  host.remove()
})
