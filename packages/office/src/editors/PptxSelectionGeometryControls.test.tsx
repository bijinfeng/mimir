/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  PptxSelectionGeometryControls,
  type PptxSelectionGeometryControlsProps,
} from './PptxSelectionGeometryControls.js'
import { pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const shape = {
  type: 'shape',
  id: 'runtime-child',
  nvId: '12',
  name: '组合成员',
  presetGeometry: 'rect',
  anchor: { originalXml: '' },
  transform: {
    offset: { x: 158750, y: 254000, cx: 1270000, cy: 635000 },
    rot: 1800000,
    flipH: false,
    flipV: true,
  },
} as unknown as SlideElement
const group = {
  type: 'group',
  id: 'runtime-group',
  name: '组合',
  anchor: {
    originalXml: '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="组合"/></p:nvGrpSpPr></p:grpSp>',
  },
  transform: {
    offset: { x: 800000, y: 100000, cx: 6000000, cy: 1000000 },
    rot: 2700000,
    flipH: true,
    flipV: false,
  },
  children: [shape],
  childOffset: { x: 100000, y: 50000, cx: 2000000, cy: 1000000 },
} as unknown as SlideElement
function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const apply = vi.fn<PptxSelectionGeometryControlsProps['applyOps']>(async () => true)
  let props: PptxSelectionGeometryControlsProps = {
    elements: [group],
    selectedRefs: ['e_12'],
    slide: 0,
    version: 1,
    sourceKey: 'doc-one',
    applyOps: apply,
  }
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxSelectionGeometryControls {...props} />
      </ConfigProvider>,
    )
  act(render)
  let alive = true
  const unmount = () => {
    if (alive) {
      alive = false
      act(() => root.unmount())
    }
  }
  cleanup.push(() => {
    unmount()
    host.remove()
  })
  return {
    host,
    apply,
    unmount,
    change: (patch: Partial<PptxSelectionGeometryControlsProps>) =>
      act(() => {
        props = { ...props, ...patch }
        render()
      }),
  }
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(label)
  return found
}
function field(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!found) throw new Error(label)
  return found
}
function input(host: HTMLElement, label: string, value: string) {
  act(() => {
    const node = field(host, label)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (node: Element) =>
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))

it('shows real local values, visible labels, current flips and a shape preview; changes stay staged', () => {
  const view = mount()
  expect(view.host.textContent).toContain('父组合局部坐标 · pt')
  expect(view.host.textContent).toContain('数值不是画布绝对位置')
  expect(field(view.host, '水平位置（pt）').value).toBe('12.5')
  expect(field(view.host, '宽度（pt）').value).toBe('100')
  expect(field(view.host, '旋转角度（°）').value).toBe('30')
  expect(view.host.querySelectorAll('.me-property-field__label')).toHaveLength(6)
  expect(button(view.host, '水平翻转').getAttribute('aria-pressed')).toBe('false')
  expect(button(view.host, '垂直翻转').getAttribute('aria-pressed')).toBe('true')
  expect(selectValueText(view.host, '更改形状')).toContain('矩形')
  expect(view.host.querySelector('svg[viewBox="-4 -4 52 40"] path')).not.toBeNull()
  expect(button(view.host, '应用位置与形状').disabled).toBe(true)
  input(view.host, '水平位置（pt）', '33.25')
  pickSelectOption(view.host, '更改形状', '圆角矩形')
  expect(view.apply).not.toHaveBeenCalled()
  expect(view.host.textContent).toContain('草稿未应用')
  click(button(view.host, '取消位置与形状草稿'))
  expect(field(view.host, '水平位置（pt）').value).toBe('12.5')
  expect(selectValueText(view.host, '更改形状')).toContain('矩形')
  expect(button(view.host, '应用位置与形状').disabled).toBe(true)
})
it('submits only requested geometry and preset in a single batch while preserving untouched rotation and flips', async () => {
  const view = mount()
  input(view.host, '宽度（pt）', '144')
  pickSelectOption(view.host, '更改形状', '五角星')
  await act(async () => button(view.host, '应用位置与形状').click())
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.apply.mock.calls[0]![0]).toEqual([
    {
      op: 'setTransform',
      target: { slide: 0, el: 'e_12' },
      group: 'e_10',
      box: { x: 158750, y: 254000, cx: 1828800, cy: 635000 },
      rotDeg: 30,
    },
    { op: 'setShapeGeometry', target: { slide: 0, el: 'e_12' }, group: 'e_10', prst: 'star5' },
  ])
  expect(button(view.host, '应用位置与形状').disabled).toBe(true)
})
it('validates numbers, retains rejected drafts, blocks duplicate submits and explicitly disables Select while pending', async () => {
  const view = mount()
  input(view.host, '高度（pt）', '-8')
  await act(async () => button(view.host, '应用位置与形状').click())
  expect(view.apply).not.toHaveBeenCalled()
  expect(view.host.querySelector('[role="alert"]')!.textContent).toContain('不能为负数')
  input(view.host, '高度（pt）', '88')
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(view.host, '应用位置与形状'))
  click(button(view.host, '正在应用位置与形状'))
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.host.querySelector('fieldset')!.disabled).toBe(true)
  expect(view.host.querySelector('.ant-select-disabled')).not.toBeNull()
  expect(button(view.host, '水平翻转').disabled).toBe(true)
  await act(async () => finish(false))
  expect(field(view.host, '高度（pt）').value).toBe('88')
  expect(view.host.querySelector('[role="alert"]')!.textContent).toContain('已保留草稿')
  expect(button(view.host, '应用位置与形状').disabled).toBe(false)
})
it('permanently discards old drafts on version/source/selection changes and ignores late completion', async () => {
  const view = mount()
  input(view.host, '水平位置（pt）', '32')
  view.change({ version: 2 })
  expect(field(view.host, '水平位置（pt）').value).toBe('12.5')
  view.change({ version: 1 })
  expect(field(view.host, '水平位置（pt）').value).toBe('12.5')
  input(view.host, '水平位置（pt）', '44')
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(view.host, '应用位置与形状'))
  view.change({ sourceKey: 'doc-two' })
  await act(async () => finish(true))
  expect(view.host.textContent).not.toContain('已应用')
  expect(button(view.host, '应用位置与形状').disabled).toBe(true)
  input(view.host, '水平位置（pt）', '55')
  view.change({ selectedRefs: ['e_10'] })
  expect(view.host.textContent).toContain('幻灯片坐标 · pt')
  expect(view.host.textContent).not.toContain('更改形状')
})
it('uses Escape to cancel numeric drafts and provides actionable empty or multi-selection state', () => {
  const view = mount()
  input(view.host, '垂直位置（pt）', '80')
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  act(() => field(view.host, '垂直位置（pt）').dispatchEvent(escape))
  expect(escape.defaultPrevented).toBe(true)
  expect(field(view.host, '垂直位置（pt）').value).toBe('20')
  view.change({ selectedRefs: ['e_10', 'e_12'] })
  expect(view.host.textContent).toContain('单独选择一个对象')
  expect(view.host.querySelector('button')).toBeNull()
  view.change({ selectedRefs: [] })
  expect(view.host.textContent).toContain('选择一个对象以编辑')
})
