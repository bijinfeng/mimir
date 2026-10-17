/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ToolbarColorPicker, ToolbarMenu } from './EditorShell.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((run) => run())
  vi.restoreAllMocks()
})

it.each([
  { viewport: 720, y: 450, top: '', bottom: '274px', offset: 274 },
  { viewport: 720, y: 100, top: '128px', bottom: '', offset: 128 },
  { viewport: 400, y: 180, top: '208px', bottom: '', offset: 208 },
])('bounds the RGB layer in a 420px viewport: %j', ({ viewport, y, top, bottom, offset }) => {
  const { host, trigger, pick, field } = mount()
  click(trigger!)
  vi.spyOn(trigger!, 'getBoundingClientRect').mockReturnValue({
    top: y,
    bottom: y + 24,
    left: 360,
    right: 440,
    width: 80,
    height: 24,
    x: 360,
    y,
    toJSON: () => ({}),
  })
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(viewport)
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(420)
  click(trigger!)
  const panel = host.querySelector<HTMLElement>('[data-toolbar-popup]')!
  expect(panel.style.bottom).toBe(bottom)
  expect(panel.style.top).toBe(top)
  expect(panel.style.left).toBe('152px')
  expect(panel.style.maxHeight).toBe(`calc(100dvh - ${offset}px - 8px)`)
  act(() => panel.dispatchEvent(new Event('scroll')))
  expect(panel.isConnected).toBe(true)
  input(field(), '#13579B')
  click(panel.querySelector('[aria-label="使用测试颜色自定义颜色"]')!)
  expect(pick).toHaveBeenCalledExactlyOnceWith('#13579B')
  expect(panel.isConnected).toBe(false)
  expect(document.activeElement).toBe(trigger)
})

it('retains the legacy color layer height estimate and CSS scroll limit', () => {
  const { host, trigger } = mount({ custom: false })
  click(trigger!)
  vi.spyOn(trigger!, 'getBoundingClientRect').mockReturnValue({
    top: 450,
    bottom: 474,
    left: 100,
    right: 180,
    width: 80,
    height: 24,
    x: 100,
    y: 450,
    toJSON: () => ({}),
  })
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720)
  click(trigger!)
  const panel = host.querySelector<HTMLElement>('.me-color__panel')!
  expect(panel.style.top).toBe('478px')
  expect(panel.style.bottom).toBe('')
  expect(panel.style.maxHeight).toBe('')
})
function click(node: Element) {
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
function key(node: Element, pressedKey: string, shiftKey = false) {
  act(() =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: pressedKey, shiftKey, bubbles: true, cancelable: true }),
    ),
  )
}
function input(node: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function mount({ custom = true, inline = false, nested = false, disabled = false } = {}) {
  const host = document.createElement('div'),
    root = createRoot(host),
    pick = vi.fn<(color: string) => void>()
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const picker = (
    <ToolbarColorPicker
      label="测试颜色"
      allowCustomRgb={custom}
      inline={inline}
      disabled={disabled}
      value="#123abc"
      options={[{ value: '#4472C4', swatch: '#4472C4', label: '蓝色' }]}
      onPick={pick}
    />
  )
  act(() =>
    root.render(nested ? <ToolbarMenu label="父菜单" renderPanel={() => picker} /> : picker),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  if (nested) click(host.querySelector('button')!)
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="测试颜色"]')
  if (trigger) click(trigger)
  return { host, pick, trigger, field: () => host.querySelector<HTMLInputElement>('input')! }
}

it('opts in to a real current RGB swatch while keeping legacy named-color behavior', () => {
  const current = mount(),
    legacy = mount({ custom: false })
  expect(current.trigger?.querySelector('.me-color__swatch--none')).toBeNull()
  expect(current.trigger?.querySelector<HTMLElement>('.me-color__swatch')?.style.background).toBe(
    '#123ABC',
  )
  expect(current.field().value).toBe('#123ABC')
  expect(legacy.trigger?.querySelector('.me-color__swatch--none')).not.toBeNull()
  expect(legacy.field()).toBeNull()
})

it('rejects empty, short, alpha and CSS colors and adopts valid RGB once on Enter', () => {
  const { host, pick, trigger, field } = mount()
  const apply = () =>
    host.querySelector<HTMLButtonElement>('[aria-label="使用测试颜色自定义颜色"]')!
  for (const value of ['', '#123', '#12345678', 'red', 'rgb(1,2,3)', '#12zzff']) {
    input(field(), value)
    expect(apply().disabled).toBe(true)
    key(field(), 'Enter')
    expect(pick).not.toHaveBeenCalled()
  }
  input(field(), '  a1b2c3  ')
  expect(apply().disabled).toBe(false)
  expect(pick).not.toHaveBeenCalled()
  key(field(), 'Enter')
  expect(pick).toHaveBeenCalledExactlyOnceWith('#A1B2C3')
  expect(host.querySelector('input')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('retains the field on Tab, cancels only the nearest popup on Escape, and reopens from current value', () => {
  const { host, pick, trigger, field } = mount({ nested: true })
  act(() => field().focus())
  input(field(), '#abcdef')
  key(field(), 'Tab')
  expect(host.querySelector('input')).not.toBeNull()
  key(field(), 'Escape')
  expect(host.querySelector('input')).toBeNull()
  expect(host.querySelector('[role="menu"][aria-label="父菜单"]')).not.toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(pick).not.toHaveBeenCalled()
  click(trigger!)
  expect(field().value).toBe('#123ABC')
})

it('uses the explicit action for inline RGB and keeps the inline picker mounted', () => {
  const { host, pick, field } = mount({ inline: true })
  input(field(), '#fedcba')
  click(host.querySelector('[aria-label="使用测试颜色自定义颜色"]')!)
  expect(pick).toHaveBeenCalledExactlyOnceWith('#FEDCBA')
  expect(host.querySelector('input')).not.toBeNull()
  const busy = mount({ inline: true, disabled: true })
  expect(busy.field().disabled).toBe(true)
  key(busy.field(), 'Enter')
  expect(busy.pick).not.toHaveBeenCalled()
})
