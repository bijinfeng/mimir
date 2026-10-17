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
import { xlsxValidationFixture } from './xlsx-validation-test-fixture.js'
import { readXlsx } from '../xlsx.js'
import { pickSelectOption, selectRoot } from '../shell/antd-test-dom.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
async function wait(ready: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (ready()) return
    await tick()
  }
  expect(ready()).toBe(true)
}
function button(host: ParentNode, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
const click = (host: ParentNode, label: string) => act(() => button(host, label).click())
function type(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
function select(host: HTMLElement, row: number, col: number) {
  const td = host.querySelector<HTMLTableCellElement>(
    `[data-grid-row="${row}"][data-grid-column="${col}"]`,
  )!
  act(() => td.click())
  return td
}
function ribbon(host: HTMLElement, label: string) {
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (node) => node.textContent === label,
  )!
  act(() => tab.click())
}
const real: XlsxHostApply = (request) =>
  applyXlsxOpsOnHost({ ...request, principal: 'admin@example.com' })
async function mount(hostApply: XlsxHostApply = real) {
  const fixture = await xlsxValidationFixture(),
    saved: Uint8Array[] = []
  const io = {
    load: async () => fixture.bytes,
    save: async (bytes: Uint8Array) => {
      saved.push(bytes.slice())
    },
  }
  let handle: XlsxAgentHandle | null = null
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() =>
    root.render(
      <XlsxEditor
        documentId="xlsx-validation"
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
  return { host, saved, fixture, handle: () => handle! }
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map(async (entry) => [entry.name, await entry.async('uint8array')]),
    ),
  )
}

it('opens the actual current cell list with Alt+Down and writes a literal formula-looking value once; save and history retain native ZIP', async () => {
  const execute = vi.fn<XlsxHostApply>(real),
    ui = await mount(execute),
    td = select(ui.host, 1, 0)
  expect(ui.host.textContent).toContain('填写提示')
  const before = ui.handle().currentBytes()
  act(() =>
    td.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    ),
  )
  expect(document.querySelector('[role="listbox"][aria-label="当前单元格验证列表"]')).not.toBeNull()
  expect(execute).not.toHaveBeenCalled()
  expect(ui.handle().currentBytes()).toEqual(before)
  const list = document.querySelector<HTMLElement>(
    '[role="listbox"][aria-label="当前单元格验证列表"]',
  )!
  act(() => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  act(() => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  await wait(() => ui.handle().getVersion() === 1)
  expect(execute).toHaveBeenCalledOnce()
  expect(execute.mock.calls[0]![0].ops).toEqual([
    { op: 'set_cell', sheetId: ui.fixture.sheet.id, address: 'A1', value: '=A1' },
  ])
  const cell = (await readXlsx(ui.handle().currentBytes())).sheets[1]!.rows[0]!.cells[0]!
  expect(cell.text).toBe('=A1')
  expect(cell.formula).toBeFalsy()
  expect(ui.handle().history().undo).toBe(1)
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 1 && !ui.handle().isDirty())
  const accepted = await entries(ui.saved[0]!)
  await act(async () => {
    await ui.handle().undo()
  })
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 2 && !ui.handle().isDirty())
  expect(ui.saved[1]).toEqual(ui.fixture.bytes)
  await act(async () => {
    await ui.handle().redo()
  })
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 3 && !ui.handle().isDirty())
  expect(await entries(ui.saved[2]!)).toEqual(accepted)
})
it('hides suppressed dropdown, resolves scoped names and cancels list Escape without publishing', async () => {
  const execute = vi.fn<XlsxHostApply>(real),
    ui = await mount(execute)
  select(ui.host, 5, 0)
  expect(ui.host.querySelector('button[aria-label="选择验证列表值"]')).toBeNull()
  select(ui.host, 4, 0)
  click(ui.host, '选择验证列表值')
  const list = document.querySelector<HTMLElement>('[aria-label="当前单元格验证列表"]')!
  expect(list.textContent).toBe('线下线上')
  act(() => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.querySelector('[aria-label="当前单元格验证列表"]')).toBeNull()
  expect(document.activeElement).toBe(button(ui.host, '选择验证列表值'))
  expect(execute).not.toHaveBeenCalled()
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
})
it('dismisses the fixed list when its grid scrolls while allowing the list itself to scroll', async () => {
  const execute = vi.fn<XlsxHostApply>(real),
    ui = await mount(execute),
    td = select(ui.host, 1, 0)
  click(ui.host, '选择验证列表值')
  const list = document.querySelector<HTMLElement>('[aria-label="当前单元格验证列表"]')!
  act(() => list.dispatchEvent(new Event('scroll')))
  expect(document.querySelector('[aria-label="当前单元格验证列表"]')).not.toBeNull()
  act(() => td.closest('table')!.parentElement!.dispatchEvent(new Event('scroll')))
  expect(document.querySelector('[aria-label="当前单元格验证列表"]')).toBeNull()
  expect(execute).not.toHaveBeenCalled()
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
})
it('rejects actual grid paste and Agent-forged warning consent without publishing', async () => {
  const execute = vi.fn<XlsxHostApply>(real),
    ui = await mount(execute),
    td = select(ui.host, 2, 1)
  const paste = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', {
    value: { getData: (mime: string) => (mime === 'text/plain' ? '9\tchanged' : '') },
  })
  act(() => td.dispatchEvent(paste))
  expect(paste.defaultPrevented).toBe(true)
  await wait(() => ui.host.textContent!.includes('批量和Agent操作未修改'))
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  expect(ui.handle().getVersion()).toBe(0)
  await expect(
    ui.handle().execute(
      'propose_operations',
      {
        operations: [{ op: 'set_cell', sheetId: 'sheet-2', address: 'B2', value: 9 }],
        validationConsent: { intent: 'manual_cell' },
      },
      {},
    ),
  ).rejects.toThrow('Agent')
  expect(execute.mock.calls.at(-1)![0].validationConsent).toBeUndefined()
  expect(ui.handle().currentBytes()).toEqual(ui.fixture.bytes)
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
})
it('requires explicit warning confirmation, invalidates on draft and A-B-A selection and publishes one action', async () => {
  const execute = vi.fn<XlsxHostApply>(real),
    ui = await mount(execute)
  select(ui.host, 2, 1)
  type(ui.host, '单元格 B2', '9')
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  expect(ui.handle().currentBytes()).toEqual(ui.fixture.bytes)
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
  type(ui.host, '单元格 B2', '10')
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  select(ui.host, 1, 2)
  select(ui.host, 2, 1)
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  type(ui.host, '单元格 B2', '10')
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  type(ui.host, '单元格 B2', '9')
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  click(ui.host, '仍然使用此值')
  click(ui.host, '仍然使用此值')
  await wait(() => ui.handle().getVersion() === 1)
  expect(execute).toHaveBeenCalledTimes(4)
  expect(ui.handle().history().undo).toBe(1)
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="单元格 B2"]')!.value).toBe('9')
})
it('discards a late host success after selection changes', async () => {
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const ui = await mount(async (input) => {
    const result = await real(input)
    started = true
    await gate
    return result
  })
  select(ui.host, 4, 1)
  type(ui.host, '单元格 B4', '9')
  click(ui.host, '应用')
  await wait(() => started)
  select(ui.host, 1, 2)
  await act(async () => {
    release()
    await gate
  })
  await tick()
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.handle().currentBytes()).toEqual(ui.fixture.bytes)
})
it('shows native stop title, cancels information without publishing and accepts an error-disabled invalid value', async () => {
  const ui = await mount()
  select(ui.host, 1, 1)
  type(ui.host, '单元格 B1', '9')
  click(ui.host, '应用')
  await wait(() => ui.host.textContent!.includes('输入检查：'))
  expect(ui.handle().getVersion()).toBe(0)
  select(ui.host, 3, 1)
  type(ui.host, '单元格 B3', '9')
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="取消此次输入"]'))
  click(ui.host, '取消此次输入')
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="单元格 B3"]')!.value).toBe(
    '原值',
  )
  select(ui.host, 4, 1)
  type(ui.host, '单元格 B4', '9')
  click(ui.host, '应用')
  await wait(() => ui.handle().getVersion() === 1)
  expect(ui.handle().history().undo).toBe(1)
})
it('edits existing rule message options through the fixed Inspector action and preserves original constraint', async () => {
  const ui = await mount()
  const tab = [...ui.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (node) => node.textContent === '数据',
  )!
  act(() => tab.click())
  click(ui.host, '数据验证提示设置')
  pickSelectOption(ui.host, '原件验证规则', 'B2 · whole')
  expect(
    ui.host.querySelector('.mimir-xlsx-inspector__footer button[aria-label="应用验证提示"]'),
  ).not.toBeNull()
  type(ui.host, '提示标题（最多32字）', '新的提示')
  pickSelectOption(ui.host, '错误行为', '信息：确认后继续')
  click(ui.host, '应用验证提示')
  await wait(() => ui.handle().getVersion() === 1)
  const rule = (await readXlsx(ui.handle().currentBytes())).sheets[1]!.extras!.validations![6]!
  expect(rule).toMatchObject({
    promptTitle: '新的提示',
    errorStyle: 'information',
    formula1: ui.fixture.sheet.extras!.validations![6]!.formula1,
  })
  expect(ui.handle().history().undo).toBe(1)
  expect(ui.host.querySelector('.mimir-xlsx-inspector')).not.toBeNull()
  expect(selectRoot(ui.host, '原件验证规则').textContent).toContain('B2 · whole')
})
it('cancels a late native rule-options result when the Inspector closes', async () => {
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const ui = await mount(async (input) => {
    const result = await real(input)
    started = true
    await gate
    return result
  })
  const tab = [...ui.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (node) => node.textContent === '数据',
  )!
  act(() => tab.click())
  click(ui.host, '数据验证提示设置')
  type(ui.host, '提示标题（最多32字）', '旧请求不可发布')
  click(ui.host, '应用验证提示')
  await wait(() => started)
  click(ui.host, '关闭数据验证提示设置')
  await act(async () => {
    release()
    await gate
  })
  await tick()
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.handle().currentBytes()).toEqual(ui.fixture.bytes)
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
})

it('discards a late warning after leaving and returning to its tool context', async () => {
  let started = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const ui = await mount(async (request) => {
    try {
      return await real(request)
    } catch (error) {
      started = true
      await gate
      throw error
    }
  })
  select(ui.host, 2, 1)
  type(ui.host, '单元格 B2', '9')
  click(ui.host, '应用')
  await wait(() => started)
  ribbon(ui.host, '数据')
  ribbon(ui.host, '开始')
  await act(async () => release())
  await wait(() => !button(ui.host, '应用').disabled)
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  expect(ui.handle().currentBytes()).toEqual(ui.fixture.bytes)
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
})

it('invalidates an issued warning and a delayed confirmed write when the tool context changes', async () => {
  let started = false
  let release!: () => void
  let signal: AbortSignal | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const ui = await mount(async (request) => {
    const result = await real(request)
    if (request.validationConsent?.token) {
      started = true
      signal = request.signal
      await gate
    }
    return result
  })
  select(ui.host, 2, 1)
  type(ui.host, '单元格 B2', '9')
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  ribbon(ui.host, '数据')
  ribbon(ui.host, '开始')
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  click(ui.host, '仍然使用此值')
  await wait(() => started)
  ribbon(ui.host, '数据')
  expect(signal?.aborted).toBe(true)
  await act(async () => release())
  await wait(() => !button(ui.host, '应用').disabled)
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.handle().currentBytes()).toEqual(ui.fixture.bytes)
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
})

it('returns warning cancel, Escape and accepted confirmation to the live cell input', async () => {
  const ui = await mount()
  select(ui.host, 2, 1)
  const input = () => ui.host.querySelector<HTMLInputElement>('input[aria-label="单元格 B2"]')!
  type(ui.host, '单元格 B2', '9')
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="取消此次输入"]'))
  act(() => button(ui.host, '取消此次输入').focus())
  click(ui.host, '取消此次输入')
  expect(document.activeElement).toBe(input())
  expect(input().value).toBe('原值')
  expect(ui.handle().getVersion()).toBe(0)
  type(ui.host, '单元格 B2', '9')
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  act(() => {
    const confirm = button(ui.host, '仍然使用此值')
    confirm.focus()
    confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(document.activeElement).toBe(input())
  expect(input().value).toBe('原值')
  expect(ui.handle().getVersion()).toBe(0)
  type(ui.host, '单元格 B2', '9')
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  act(() => button(ui.host, '仍然使用此值').focus())
  click(ui.host, '仍然使用此值')
  await wait(() => ui.handle().getVersion() === 1 && document.activeElement === input())
  expect(input().value).toBe('9')
  expect(ui.handle().history()).toEqual({ undo: 1, redo: 0 })
})

it('invalidates an issued warning on save while preserving its unsubmitted draft', async () => {
  const ui = await mount()
  select(ui.host, 1, 2)
  type(ui.host, '单元格 C1', 'saved change')
  click(ui.host, '应用')
  await wait(() => ui.handle().getVersion() === 1 && !button(ui.host, '保存到库').disabled)
  select(ui.host, 2, 1)
  type(ui.host, '单元格 B2', '9')
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  const before = ui.handle().currentBytes()
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 1 && !ui.handle().isDirty())
  expect(ui.host.querySelector('button[aria-label="仍然使用此值"]')).toBeNull()
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="单元格 B2"]')!.value).toBe('9')
  expect(ui.handle().currentBytes()).toEqual(before)
  expect(ui.handle().getVersion()).toBe(1)
  expect(ui.handle().history()).toEqual({ undo: 1, redo: 0 })
  expect(ui.saved[0]).toEqual(before)
})

it('does not steal external focus when a confirmed write finishes', async () => {
  let started = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const ui = await mount(async (request) => {
    const result = await real(request)
    if (request.validationConsent?.token) {
      started = true
      await gate
    }
    return result
  })
  select(ui.host, 2, 1)
  type(ui.host, '单元格 B2', '9')
  click(ui.host, '应用')
  await wait(() => !!ui.host.querySelector('button[aria-label="仍然使用此值"]'))
  act(() => button(ui.host, '仍然使用此值').focus())
  click(ui.host, '仍然使用此值')
  await wait(() => started)
  const external = document.createElement('input')
  document.body.append(external)
  cleanups.push(() => external.remove())
  act(() => external.focus())
  await act(async () => release())
  await wait(() => ui.handle().getVersion() === 1)
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  expect(document.activeElement).toBe(external)
  expect(ui.handle().history()).toEqual({ undo: 1, redo: 0 })
})
