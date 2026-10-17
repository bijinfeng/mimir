/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import {
  PptxClipboardControls,
  publishPptxClipboardResult,
  type PptxClipboardControlsProps,
} from './PptxClipboardControls.js'
import { selectionFixture } from './pptx-selection-test-fixture.js'
import { elementDurableId } from '../../vendor/packages/pptx-engine/src/identity.js'

const KEY = 'mimir.pptx.internal-clipboard'
const previous = {
  ref: 'd724172f-c513-4e5c-90d2-f511b2344de9',
  kind: 'elements',
  count: 2,
  itemCount: 1,
  groupWrapperCount: 1,
}
const next = { ...previous, ref: 'a32b6995-acf5-4d06-a8cf-5717955fde66', count: 3 }
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  sessionStorage.clear()
  vi.restoreAllMocks()
})
function mount(props: PptxClipboardControlsProps) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (value: PptxClipboardControlsProps) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <PptxClipboardControls {...value} />
        </ConfigProvider>,
      ),
    )
  render(props)
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    act(() => root.unmount())
    host.remove()
  }
  cleanup.push(dispose)
  return { host, render, dispose }
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
const click = (host: HTMLElement, label: string) => act(() => button(host, label).click())
const base = { slide: 0, slideCount: 2, contextKey: 'doc/slide/refs/0', selectedRefs: ['selected'] }

it('shows actual mixed selection counts, sends explicit parents and keeps one paste footer', async () => {
  const { elements } = await selectionFixture()
  const group = elements.find((item) => item.type === 'group')!
  const top = elements.find((item) => item !== group)!
  const execute = vi.fn<PptxClipboardControlsProps['execute']>().mockResolvedValue(next)
  const ui = mount({ ...base, elements, selectedRefs: [group.children[0]!.id, top.id], execute })
  expect(ui.host.textContent).toContain('当前选择 2 个对象')
  expect(ui.host.textContent).toContain('来自 1 个组合的成员以独立组合粘贴')
  expect(button(ui.host, '复制对象').textContent).toContain('复制')
  expect(button(ui.host, '剪切对象').textContent).toContain('剪切')
  click(ui.host, '复制对象')
  await act(async () => {
    await Promise.resolve()
  })
  expect(execute.mock.calls[0]![0]).toEqual({
    kind: 'copy_elements',
    slide: 0,
    targets: [
      { elementId: group.children[0]!.id, group: elementDurableId(group) },
      { elementId: top.id },
    ],
  })
  expect(ui.host.textContent).toContain('3 个所选对象，将作为 1 个顶层对象')
  expect(ui.host.querySelectorAll('.mimir-pptx-clipboard__actions')).toHaveLength(1)
  expect(ui.host.querySelector('.mimir-pptx-clipboard__actions button')).toBe(
    button(ui.host, '粘贴对象'),
  )
  ui.render({ ...base, elements, selectedRefs: [group.id], contextKey: 'group', execute })
  click(ui.host, '复制对象')
  await act(async () => {
    await Promise.resolve()
  })
  expect(execute.mock.calls[1]![0]).toEqual({
    kind: 'copy_elements',
    slide: 0,
    targets: [{ elementId: group.id }],
  })
})

it('locks composite selects and duplicate submissions while preserving a failed copy for retry', async () => {
  publishPptxClipboardResult(previous)
  let finish!: (value: Record<string, unknown> | null) => void
  const execute = vi.fn<PptxClipboardControlsProps['execute']>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const ui = mount({ ...base, execute })
  act(() => {
    button(ui.host, '复制对象').click()
    button(ui.host, '复制对象').click()
  })
  expect(execute).toHaveBeenCalledOnce()
  expect(ui.host.querySelector('.ant-select-disabled')).not.toBeNull()
  const combo = ui.host.querySelector('[role="combobox"]')!
  act(() => combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  expect(document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toBeNull()
  expect(button(ui.host, '正在处理剪贴板').disabled).toBe(true)
  await act(async () => finish(null))
  expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('原有复制内容已保留')
  expect(JSON.parse(sessionStorage.getItem(KEY)!)).toMatchObject(previous)
  expect(button(ui.host, '粘贴对象').disabled).toBe(false)
  click(ui.host, '复制对象')
  expect(execute).toHaveBeenCalledTimes(2)
  await act(async () => finish(next))
  expect(JSON.parse(sessionStorage.getItem(KEY)!)).toMatchObject(next)
})

it.each(['selection', 'page', 'document', 'published-version'])(
  'aborts on %s context changes and ignores a late old copy after a newer copy',
  async (change) => {
    publishPptxClipboardResult(previous)
    const finishes: ((value: Record<string, unknown>) => void)[] = []
    const execute = vi.fn<PptxClipboardControlsProps['execute']>(
      () =>
        new Promise((resolve) => {
          finishes.push(resolve)
        }),
    )
    const ui = mount({ ...base, execute })
    click(ui.host, '复制对象')
    const oldSignal = execute.mock.calls[0]![1].signal
    ui.render({ ...base, contextKey: change, execute })
    expect(oldSignal.aborted).toBe(true)
    click(ui.host, '复制对象')
    await act(async () => finishes[1]!(next))
    await act(async () => finishes[0]!(previous))
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toMatchObject(next)
    expect(ui.host.textContent).toContain('3 个所选对象')
  },
)

it('preserves a host-accepted cut published before version invalidation and aborts on unmount', async () => {
  const finishes: ((value: Record<string, unknown>) => void)[] = []
  const execute = vi.fn<PptxClipboardControlsProps['execute']>(
    () => new Promise((resolve) => finishes.push(resolve)),
  )
  const ui = mount({ ...base, execute })
  click(ui.host, '剪切对象')
  act(() => publishPptxClipboardResult(next))
  ui.render({ ...base, selectedRefs: [], contextKey: 'accepted-version/1', execute })
  await act(async () => finishes[0]!(next))
  expect(button(ui.host, '粘贴对象').disabled).toBe(false)
  click(ui.host, '粘贴对象')
  expect(execute.mock.calls[1]![0]).toMatchObject({ kind: 'paste_elements', ref: next.ref })
  const signal = execute.mock.calls[1]![1].signal
  ui.dispose()
  expect(signal.aborted).toBe(true)
})

it('keeps stale selections and externally disabled panels read-only', async () => {
  const { elements } = await selectionFixture()
  const execute = vi.fn<PptxClipboardControlsProps['execute']>()
  const ui = mount({ ...base, elements, selectedRefs: ['gone'], execute })
  expect(button(ui.host, '复制对象').disabled).toBe(true)
  expect(ui.host.textContent).toContain('已失效')
  ui.render({ ...base, execute, disabled: true })
  expect(button(ui.host, '复制对象').disabled).toBe(true)
  expect(ui.host.querySelector('.ant-select-disabled')).not.toBeNull()
  expect(execute).not.toHaveBeenCalled()
})

it.each(['cancel', 'context'] as const)(
  'explicit system image read is canceled on %s before an old blob can insert',
  async (reason) => {
    let release!: (value: { types: string[]; getType: () => Promise<Blob> }[]) => void
    const read = vi.fn<() => Promise<{ types: string[]; getType: () => Promise<Blob> }[]>>(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } })
    cleanup.push(() => {
      if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
      else Reflect.deleteProperty(navigator, 'clipboard')
    })
    const insertSystemImage = vi
      .fn<NonNullable<PptxClipboardControlsProps['insertSystemImage']>>()
      .mockResolvedValue(true)
    const execute = vi.fn<PptxClipboardControlsProps['execute']>()
    const props = { ...base, execute, insertSystemImage }
    const ui = mount(props)
    expect(read).not.toHaveBeenCalled()
    click(ui.host, '粘贴系统图片')
    expect(read).toHaveBeenCalledOnce()
    expect(button(ui.host, '粘贴系统图片').disabled).toBe(true)
    if (reason === 'cancel') click(ui.host, '取消图片读取')
    else ui.render({ ...props, contextKey: 'new-target' })
    const getType = vi
      .fn<() => Promise<Blob>>()
      .mockResolvedValue(
        new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
      )
    await act(async () => release([{ types: ['image/png'], getType }]))
    expect(getType).not.toHaveBeenCalled()
    expect(insertSystemImage).not.toHaveBeenCalled()
    expect(button(ui.host, '粘贴系统图片').disabled).toBe(false)
  },
)
