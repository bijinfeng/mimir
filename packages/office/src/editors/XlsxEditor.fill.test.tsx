/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async (id: string) => ({
    id,
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
import { applyXlsxOpsOnHost } from '../../../../apps/server/src/services/xlsx-agent-host.js'
import { XlsxEditor } from './XlsxEditor.js'
import { xlsxFillFixture } from './xlsx-fill-test-fixture.js'
import { readXlsx } from '../xlsx.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'
import type { EditorIo } from './types.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
async function wait(ready: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (ready()) return
    await tick()
  }
  expect(ready()).toBe(true)
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
const click = (host: HTMLElement, label: string) => act(() => button(host, label).click())
function type(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
function tab(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (node) => node.textContent?.trim() === label,
  )!
  act(() => found.click())
}
async function mount(hostApply: XlsxHostApply) {
  const fixture = await xlsxFillFixture(),
    saved: Uint8Array[] = []
  let handle: XlsxAgentHandle | null = null
  const io: EditorIo = {
    load: async () => fixture.bytes,
    save: async (bytes) => {
      saved.push(bytes.slice())
    },
  }
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() =>
    root.render(
      <XlsxEditor
        documentId="xlsx-fill"
        io={io}
        hostApply={hostApply}
        onAgentHandleChange={(next) => {
          handle = next
        }}
      />,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await wait(() => !!handle && !!host.querySelector('.mimir-xlsx'))
  type(host, '操作范围（A1 或 A1:B5）', 'A1:B1')
  return { host, saved, fixture, handle: () => handle! }
}
const real: XlsxHostApply = async (request) => applyXlsxOpsOnHost({ ...request, ops: request.ops })
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    result: Record<string, Uint8Array> = {}
  for (const [name, entry] of Object.entries(zip.files))
    if (!entry.dir) result[name] = await entry.async('uint8array')
  return result
}
it('paints native range fill, applies one history action, saves twice and preserves complete bytes through undo/save/redo/save', async () => {
  const execute = vi.fn<XlsxHostApply>(real),
    ui = await mount(execute),
    host = ui.host
  click(host, '范围填充')
  pickSelectOption(host, '填充类型', '图案')
  pickSelectOption(host, '填充图案', '浅色下斜线')
  click(host, '应用填充')
  await wait(() => ui.handle().history().undo === 1 && !host.querySelector('[aria-busy="true"]'))
  expect(execute).toHaveBeenCalledOnce()
  expect(execute.mock.calls[0]![0]).toMatchObject({ documentId: 'xlsx-fill', expectedVersion: 0 })
  expect(ui.handle().getVersion()).toBe(1)
  expect(
    host.querySelector<HTMLTableCellElement>('td[title*="A1"]')?.style.background ||
      [...host.querySelectorAll<HTMLTableCellElement>('td')].find((td) => td.textContent === '区域')
        ?.style.background,
  ).toContain('data:image/svg+xml')
  const native = (await readXlsx(ui.handle().currentBytes())).sheets[0]!.rows[0]!.cells[0]!.format!
    .fill
  expect(native?.spec).toEqual({ pattern: 'lightDown', fg: { theme: 4 }, bg: { theme: 0 } })
  click(host, '保存到库')
  await wait(() => ui.saved.length === 1 && !ui.handle().isDirty())
  const accepted = await entries(ui.saved[0]!)
  expect(accepted['customXml/mimir-pivot-preservation.xml']).toEqual(
    (await entries(ui.fixture.bytes))['customXml/mimir-pivot-preservation.xml'],
  )
  await act(async () => {
    expect(await ui.handle().undo()).toBe(true)
  })
  click(host, '保存到库')
  await wait(() => ui.saved.length === 2 && !ui.handle().isDirty())
  expect(await entries(ui.saved[1]!)).toEqual(await entries(ui.fixture.bytes))
  await act(async () => {
    expect(await ui.handle().redo()).toBe(true)
  })
  click(host, '保存到库')
  await wait(() => ui.saved.length === 3 && !ui.handle().isDirty())
  expect(await entries(ui.saved[2]!)).toEqual(accepted)
  click(host, '范围填充')
  pickSelectOption(host, '填充类型', '路径渐变')
  click(host, '应用填充')
  await wait(() => execute.mock.calls.length === 2 && ui.handle().getVersion() === 4)
  click(host, '保存到库')
  await wait(() => ui.saved.length === 4 && !ui.handle().isDirty())
  const twice = (await readXlsx(ui.saved[3]!)).sheets[0]!.rows[0]!.cells[0]!.format!.fill?.spec
  expect(twice).toMatchObject({
    gradient: { type: 'path', left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 },
  })
  expect(execute.mock.calls[1]![0].expectedVersion).toBe(3)
})
it('cancels a pending fill when the object Inspector takes over without publishing late bytes', async () => {
  let finish!: (result: Awaited<ReturnType<XlsxHostApply>>) => void
  const execute = vi.fn<XlsxHostApply>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    ui = await mount(execute)
  click(ui.host, '范围填充')
  pickSelectOption(ui.host, '填充类型', '线性渐变')
  click(ui.host, '应用填充')
  await wait(() => execute.mock.calls.length === 1)
  const request = execute.mock.calls[0]![0],
    signal = request.signal!
  tab(ui.host, '插入')
  click(ui.host, '图表、形状与结构化表')
  expect(ui.host.querySelector('[aria-label="范围填充设置"]')).toBeNull()
  expect(ui.host.querySelectorAll('.mimir-xlsx-inspector')).toHaveLength(1)
  expect(signal.aborted).toBe(true)
  const completed = await real({ ...request, signal: undefined })
  await act(async () => finish(completed))
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.handle().history().undo).toBe(0)
  expect(ui.handle().isDirty()).toBe(false)
  expect(await entries(ui.handle().currentBytes())).toEqual(await entries(ui.fixture.bytes))
})
it('retains its draft and pending transaction across 1280→420→1280 Ribbon remounts, returning Escape to the collapsed group', async () => {
  let width = 1280
  const observers = new Set<ResizeObserverCallback>()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {
        observers.add(callback)
      }
      observe() {}
      disconnect() {
        observers.delete(this.callback)
      }
    },
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return DOMRect.fromRect({
      width: this.classList.contains('mimir-compact-toolbar__commands')
        ? width
        : this.dataset.sectionKey
          ? this.hasAttribute('data-collapsed')
            ? 72
            : 150
          : 100,
      height: 56,
    })
  })
  const resize = (next: number) => {
    width = next
    act(() => {
      window.dispatchEvent(new Event('resize'))
      for (const callback of observers) callback([], {} as ResizeObserver)
    })
  }
  let finish!: (result: Awaited<ReturnType<XlsxHostApply>>) => void
  const execute = vi.fn<XlsxHostApply>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    ui = await mount(execute),
    host = ui.host
  click(host, '范围填充')
  pickSelectOption(host, '填充类型', '线性渐变')
  const panel = host.querySelector('[aria-label="范围填充设置"]')
  const angle = host.querySelector<HTMLInputElement>('input[aria-label="渐变角度（°）"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(angle, '237')
  act(() => angle.dispatchEvent(new Event('input', { bubbles: true })))
  act(() => angle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  resize(420)
  expect(host.querySelector('[data-section-key="formats"]')?.hasAttribute('data-collapsed')).toBe(
    true,
  )
  expect(host.querySelector('[aria-label="范围填充设置"]')).toBe(panel)
  expect(angle.value).toBe('237')
  resize(1280)
  expect(host.querySelector('[aria-label="范围填充设置"]')).toBe(panel)
  expect(angle.value).toBe('237')
  resize(420)
  act(() => panel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  const group = host.querySelector('[data-section-key="formats"]')!
  expect(document.activeElement).toBe(group.querySelector('button[aria-haspopup="menu"]'))
  expect(host.querySelector('[aria-label="范围填充设置"]')).toBeNull()
  act(() => group.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click())
  await tick()
  click(host, '范围填充')
  pickSelectOption(host, '填充类型', '路径渐变')
  click(host, '应用填充')
  await wait(() => execute.mock.calls.length === 1)
  const request = execute.mock.calls[0]![0],
    pendingPanel = host.querySelector('[aria-label="范围填充设置"]')
  resize(1280)
  expect(host.querySelector('[aria-label="范围填充设置"]')).toBe(pendingPanel)
  expect(request.signal?.aborted).toBe(false)
  await act(async () => finish(await real({ ...request, signal: undefined })))
  await wait(() => ui.handle().getVersion() === 1)
  expect(ui.handle().getVersion()).toBe(1)
  expect(ui.handle().history().undo).toBe(1)
  expect(ui.handle().isDirty()).toBe(true)
})
