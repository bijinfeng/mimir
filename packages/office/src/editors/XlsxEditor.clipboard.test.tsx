import { pickSelectOption } from '../shell/antd-test-dom.js'
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
import { xlsxPivotFixture } from './xlsx-pivot-test-fixture.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'
import { readXlsx } from '../xlsx.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing ${label}`)
  return node
}
function type(host: HTMLElement, label: string, value: string) {
  const node = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
  act(() => node.dispatchEvent(new Event('input', { bubbles: true })))
}
function cell(host: HTMLElement, row: number, col: number) {
  return host.querySelector<HTMLTableCellElement>(
    `[data-grid-row="${row}"][data-grid-column="${col}"]`,
  )!
}
function transfer() {
  const values = new Map<string, string>()
  return {
    getData: (mime: string) => values.get(mime) ?? '',
    setData: (mime: string, value: string) => {
      values.set(mime, value)
    },
  }
}
function clipboardEvent(
  target: HTMLElement,
  kind: 'copy' | 'cut' | 'paste',
  data: ReturnType<typeof transfer>,
) {
  const event = new Event(kind, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: data })
  act(() => target.dispatchEvent(event))
  return event
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    result: Record<string, string> = {}
  for (const [name, item] of Object.entries(zip.files))
    if (!item.dir) result[name] = await item.async('base64')
  return result
}
async function mount(hostApply?: XlsxHostApply, secondSheet = false) {
  const fixture = await xlsxPivotFixture(),
    zip = await JSZip.loadAsync(fixture.bytes)
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  zip.file(
    'xl/worksheets/sheet1.xml',
    xml
      .replace('<c r="A2" t="inlineStr"><is><t>华东</t></is></c>', '<c r="A2"><v>7</v></c>')
      .replace(
        '<c r="B2" t="inlineStr"><is><t>销售</t></is></c>',
        '<c r="B2"><f>A2+$A$2</f><v>14</v></c>',
      ),
  )
  if (secondSheet) {
    zip.file(
      'xl/worksheets/sheet2.xml',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>99</v></c></row></sheetData></worksheet>',
    )
    zip.file(
      'xl/_rels/workbook.xml.rels',
      (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
        '</Relationships>',
        '<Relationship Id="clipboardSheet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
      ),
    )
    zip.file(
      'xl/workbook.xml',
      (await zip.file('xl/workbook.xml')!.async('string')).replace(
        '</sheets>',
        '<sheet name="目标表" sheetId="2" r:id="clipboardSheet" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>',
      ),
    )
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    saved: Uint8Array[] = []
  const execute = vi.fn<XlsxHostApply>(hostApply ?? ((request) => applyXlsxOpsOnHost(request)))
  let handle: XlsxAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <XlsxEditor
        documentId="clipboard"
        io={{
          load: async () => bytes,
          save: async (data) => {
            saved.push(data.slice())
          },
        }}
        hostApply={execute}
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
  await wait(() => !!handle && !!host.querySelector('table'))
  return { host, execute, saved, bytes, handle: () => handle! }
}
it('native grid copy/paste writes dual MIME, preserves formulas, one history action and complete save/undo/redo bytes', async () => {
  const app = await mount(),
    host = app.host,
    data = transfer()
  type(host, '操作范围（A1 或 A1:B5）', 'A2:B2')
  cell(host, 2, 0).focus()
  expect(clipboardEvent(cell(host, 2, 0), 'copy', data).defaultPrevented).toBe(true)
  expect(data.getData('text/html')).toContain('data-mimir-xlsx-copy-id')
  expect(app.execute).not.toHaveBeenCalled()
  expect(app.handle().history().undo).toBe(0)
  type(host, '操作范围（A1 或 A1:B5）', 'G3')
  clipboardEvent(cell(host, 3, 0), 'paste', data)
  await wait(() => app.handle().history().undo === 1)
  expect(app.execute).toHaveBeenCalledOnce()
  const result = app.handle().currentBytes(),
    native = await JSZip.loadAsync(result),
    xml = await native.file('xl/worksheets/sheet1.xml')!.async('string')
  expect(xml).toMatch(/<c r="H3"[^>]*>[\s\S]*?<f>G3\+\$A\$2<\/f>/)
  expect(xml).toContain('<f>A2+$A$2</f>')
  act(() => button(host, '保存到库').click())
  await wait(() => app.saved.length === 1)
  await act(async () => {
    await app.handle().undo()
  })
  act(() => button(host, '保存到库').click())
  await wait(() => app.saved.length === 2)
  expect(await entries(app.saved[1]!)).toEqual(await entries(app.bytes))
  await act(async () => {
    await app.handle().redo()
  })
  act(() => button(host, '保存到库').click())
  await wait(() => app.saved.length === 3)
  expect(await entries(app.saved[2]!)).toEqual(await entries(result))
  clipboardEvent(cell(host, 3, 0), 'paste', data)
  await tick()
  expect(app.execute).toHaveBeenCalledOnce()
  expect(host.textContent).toContain('内部复制范围已失效')
})
it('external HTML applies real bold/color/size in one host batch and preserves literal formula-like text; unsupported HTML requires active values-only choice', async () => {
  const app = await mount(),
    host = app.host,
    data = transfer()
  type(host, '操作范围（A1 或 A1:B5）', 'A3')
  data.setData(
    'text/html',
    '<table><tr><td style="font-weight:bold;color:#123456;font-size:14pt">=1+2</td><td>001</td></tr></table>',
  )
  clipboardEvent(cell(host, 3, 0), 'paste', data)
  await wait(() => app.handle().history().undo === 1)
  const workbook = await readXlsx(app.handle().currentBytes()),
    first = workbook.sheets[0]!.rows.find((row) => row.number === 3)!.cells[0]!
  expect(first.text).toBe('=1+2')
  expect(first.formula).toBeFalsy()
  expect(first.format).toMatchObject({ bold: true, fontColor: '#123456', fontSize: 14 })
  expect(app.execute.mock.calls[0]![0].ops).toHaveLength(3)
  data.setData('text/html', '<table><tr><td style="border:1px solid red">0009</td></tr></table>')
  clipboardEvent(cell(host, 3, 0), 'paste', data)
  await wait(() => host.textContent?.includes('仅粘贴显示值') === true)
  expect(app.execute).toHaveBeenCalledOnce()
  pickSelectOption(host, '粘贴方式', '仅显示值')
  act(() => button(host, '粘贴').click())
  await wait(() => app.handle().history().undo === 2)
  expect(
    (await readXlsx(app.handle().currentBytes())).sheets[0]!.rows.find((row) => row.number === 3)!
      .cells[0]!.text,
  ).toBe('0009')
})
it('does not steal text/formula input clipboard events and cancels late host paste when target changes', async () => {
  let finish!: (value: Awaited<ReturnType<XlsxHostApply>>) => void
  const execute: XlsxHostApply = () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    app = await mount(execute),
    host = app.host,
    data = transfer()
  type(host, '操作范围（A1 或 A1:B5）', 'A2')
  const input = host.querySelector<HTMLInputElement>('input[aria-label="操作范围（A1 或 A1:B5）"]')!
  expect(clipboardEvent(input, 'copy', data).defaultPrevented).toBe(false)
  clipboardEvent(cell(host, 2, 0), 'cut', data)
  type(host, '操作范围（A1 或 A1:B5）', 'G3')
  clipboardEvent(cell(host, 3, 0), 'paste', data)
  await wait(() => app.execute.mock.calls.length === 1)
  const request = app.execute.mock.calls[0]![0]
  type(host, '操作范围（A1 或 A1:B5）', 'H3')
  expect(request.signal?.aborted).toBe(true)
  const result = await applyXlsxOpsOnHost({ ...request, signal: undefined })
  await act(async () => finish(result))
  await tick()
  expect(app.handle().history().undo).toBe(0)
  expect(await entries(app.handle().currentBytes())).toEqual(await entries(app.bytes))
})

it('cuts across real sheets atomically, migrates absolute references and consumes the source only after success', async () => {
  const app = await mount(undefined, true),
    host = app.host,
    data = transfer()
  type(host, '操作范围（A1 或 A1:B5）', 'A2:B2')
  clipboardEvent(cell(host, 2, 0), 'cut', data)
  expect(app.execute).not.toHaveBeenCalled()
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((node) => node.textContent === '目标表')!
      .click(),
  )
  type(host, '操作范围（A1 或 A1:B5）', 'C3')
  clipboardEvent(cell(host, 1, 0), 'paste', data)
  await wait(() => app.handle().history().undo === 1)
  expect(app.execute.mock.calls[0]![0].ops).toEqual([
    {
      op: 'paste_range',
      kind: 'cut',
      mode: 'all',
      sheetId: 'sheet-2',
      sourceSheetId: 'sheet-1',
      source: 'A2:B2',
      target: 'C3',
    },
  ])
  const zip = await JSZip.loadAsync(app.handle().currentBytes()),
    target = await zip.file('xl/worksheets/sheet2.xml')!.async('string'),
    source = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  expect(source).not.toContain('<f>A2+$A$2</f>')
  expect(target).toContain("<f>'目标表'!C3+'目标表'!$C$3</f>")
  expect(host.textContent).toContain('重新复制')
  expect(host.querySelector('[data-clipboard-source]')).toBeNull()
})

it('keeps the Inspector on the stable Editor body and cancels a late system read when another Inspector opens', async () => {
  const app = await mount(),
    host = app.host
  let finish!: (value: string) => void
  const readText = vi.fn<() => Promise<string>>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } })
  type(host, '操作范围（A1 或 A1:B5）', 'A2')
  act(() => button(host, '范围剪贴板').click())
  const panel = host.querySelector<HTMLElement>('aside[aria-label="范围剪贴板"]')!
  expect(panel.parentElement?.classList.contains('mimir-editor__body')).toBe(true)
  expect(panel.querySelector('footer button[aria-label="粘贴"]')).not.toBeNull()
  act(() => button(host, '读取系统剪贴板').click())
  expect(readText).toHaveBeenCalledOnce()
  act(() => button(host, '范围填充').click())
  expect(host.querySelector('aside[aria-label="范围剪贴板"]')).toBeNull()
  await act(async () => finish('late-system-content'))
  act(() => button(host, '范围剪贴板').click())
  expect(
    host.querySelector<HTMLTextAreaElement>('textarea[aria-label="待写入的表格内容"]')?.value,
  ).toBe('')
  expect(app.execute).not.toHaveBeenCalled()
})

it('keeps manual text entered during a pending system read and renders the primary action label once', async () => {
  const app = await mount(),
    host = app.host
  let finish!: (value: string) => void
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    },
  })
  type(host, '操作范围（A1 或 A1:B5）', 'A2')
  act(() => button(host, '范围剪贴板').click())
  expect(button(host, '粘贴').textContent).toBe('粘贴')
  act(() => button(host, '读取系统剪贴板').click())
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="待写入的表格内容"]')!
  expect(input.disabled).toBe(false)
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
    input,
    'user-new-draft',
  )
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
  await act(async () => finish('old-system-read'))
  expect(input.value).toBe('user-new-draft')
  expect(button(host, '粘贴').disabled).toBe(false)
  expect(app.execute).not.toHaveBeenCalled()
  expect(app.handle().history().undo).toBe(0)
})

it('keeps cache and Inspector through Ribbon collapse and returns Escape to a live group or current tab', async () => {
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
  const app = await mount(),
    host = app.host,
    data = transfer()
  type(host, '操作范围（A1 或 A1:B5）', 'A2:B2')
  clipboardEvent(cell(host, 2, 0), 'copy', data)
  act(() => button(host, '范围剪贴板').click())
  const panel = host.querySelector<HTMLElement>('aside[aria-label="范围剪贴板"]')!
  expect(button(host, '粘贴').textContent).toBe('粘贴')
  expect([...panel.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
    '内部范围',
    '外部内容',
  ])
  const importButton = button(panel, '选择CSV或TSV文件')
  expect(importButton.textContent).toBe('导入 CSV / TSV')
  expect(importButton.querySelector('svg')).not.toBeNull()
  expect(button(panel, '取消复制或剪切').parentElement).toBe(
    panel.querySelector('.mimir-xlsx-clipboard__source')?.parentElement,
  )
  width = 420
  act(() => {
    window.dispatchEvent(new Event('resize'))
    for (const callback of observers) callback([], {} as ResizeObserver)
  })
  expect(host.querySelector('aside[aria-label="范围剪贴板"]')).toBe(panel)
  expect(panel.textContent).toContain('复制源：数据!A2:B2')
  expect(host.querySelector('[data-clipboard-source]')).not.toBeNull()
  act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  const group = host.querySelector('[data-section-key="clipboard"]')!
  expect(document.activeElement).toBe(group.querySelector('button[aria-haspopup="menu"]'))
  act(() => group.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click())
  act(() => button(host, '范围剪贴板').click())
  const current = host.querySelector<HTMLElement>('aside[aria-label="范围剪贴板"]')!
  const dataTab = [
    ...host.querySelectorAll<HTMLButtonElement>('.mimir-compact-toolbar__tabs [role="tab"]'),
  ].find((node) => node.textContent === '数据')!
  act(() => dataTab.click())
  current.focus()
  act(() => current.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(host.querySelector('aside[aria-label="范围剪贴板"]')).toBeNull()
  expect(document.activeElement).toBe(dataTab)
  expect(app.execute).not.toHaveBeenCalled()
  expect(app.handle().history().undo).toBe(0)
})

it('prepares a special mode without writing and commits tiled native values with one history entry', async () => {
  const app = await mount(),
    host = app.host,
    data = transfer()
  type(host, '操作范围（A1 或 A1:B5）', 'A2:B2')
  clipboardEvent(cell(host, 2, 0), 'copy', data)
  act(() => button(host, '范围剪贴板').click())
  pickSelectOption(host, '粘贴方式', '仅值')
  expect(app.execute).not.toHaveBeenCalled()
  expect(app.handle().isDirty()).toBe(false)
  expect(app.handle().history()).toEqual({ undo: 0, redo: 0 })
  type(host, '操作范围（A1 或 A1:B5）', 'G3:J4')
  act(() => button(host, '粘贴').click())
  await wait(() => app.handle().history().undo === 1)
  expect(app.execute).toHaveBeenCalledOnce()
  expect(app.execute.mock.calls[0]![0].ops).toEqual([
    {
      op: 'paste_range',
      kind: 'copy',
      mode: 'value',
      sheetId: 'sheet-1',
      sourceSheetId: 'sheet-1',
      source: 'A2:B2',
      target: 'G3:J4',
    },
  ])
  const output = app.handle().currentBytes()
  const native = await (
    await JSZip.loadAsync(output)
  )
    .file('xl/worksheets/sheet1.xml')!
    .async('string')
  for (const address of ['H3', 'J3', 'H4', 'J4'])
    expect(native).toMatch(new RegExp(`<c r="${address}"[^>]*><v>14</v></c>`))
  await act(async () => {
    await app.handle().undo()
  })
  expect(app.handle().currentBytes()).toEqual(app.bytes)
  await act(async () => {
    await app.handle().redo()
  })
  expect(app.handle().currentBytes()).toEqual(output)
  act(() => button(host, '保存到库').click())
  await wait(() => app.saved.length === 1)
  expect(await entries(app.saved[0]!)).toEqual(await entries(output))
})
