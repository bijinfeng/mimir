/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxInkControls, usePptxInkSettings } from './PptxInkControls.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  localStorage.clear()
  vi.restoreAllMocks()
})
function mount(disabled = false) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    clear = vi.fn<() => Promise<boolean>>(async () => true)
  function Example() {
    const ink = usePptxInkSettings()
    return (
      <ConfigProvider componentSize="small">
        <PptxInkControls {...ink} disabled={disabled} count={2} clear={clear} />
      </ConfigProvider>
    )
  }
  act(() => root.render(<Example />))
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, clear }
}
function click(button: Element) {
  act(() => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}
it('keeps five editable pen presets with ten colors/real widths, selection, current values and persisted preferences', async () => {
  const { host, clear } = mount()
  const presets = () => [...host.querySelectorAll('button[aria-label*="预设"]')]
  expect(presets()).toHaveLength(5)
  click(presets()[3]!)
  expect(presets()[3]!.getAttribute('aria-pressed')).toBe('true')
  click(host.querySelector('[aria-label="笔迹设置"]')!)
  const colors = host.querySelectorAll('.me-color__swatch')
  expect(colors.length).toBe(10)
  const purple = host.querySelector('button[aria-label="#7030A0"]')!
  click(purple)
  pickSelectOption(host, '笔迹粗细（px）', '16 px')
  expect(host.textContent).toContain('45% 不透明度')
  expect(host.textContent).toContain('#7030A0 · 16 px')
  expect(presets()[3]!.getAttribute('aria-label')).toContain('#7030A0，16px')
  expect(presets()[3]!.textContent).toContain('荧光笔4')
  const saved = JSON.parse(localStorage.getItem('mimir.pptx.ink-presets.v1')!)
  expect(saved[3]).toEqual({ tool: 'highlighter', color: '7030A0', width: 16 })
  click(host.querySelector('[aria-label="清除本页全部笔迹"]')!)
  expect(clear).toHaveBeenCalledTimes(1)
})
it('disables drawing, erasing, clearing and setting changes while a native operation is pending', () => {
  const { host, clear } = mount(true)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="橡皮擦（整笔擦除）"]')!.disabled).toBe(
    true,
  )
  expect(host.querySelector<HTMLButtonElement>('[aria-label="清除本页全部笔迹"]')!.disabled).toBe(
    true,
  )
  click(host.querySelector('[aria-label="笔迹设置"]')!)
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('.me-color__cell')].every(
      (button) => button.disabled,
    ),
  ).toBe(true)
  expect(clear).not.toHaveBeenCalled()
})
