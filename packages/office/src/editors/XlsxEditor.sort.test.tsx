/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
import { readXlsx } from '../xlsx.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'
import type { EditorIo } from './types.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
async function wait(ready: () => boolean) {
  for (let i = 0; i < 120; i++) {
    if (ready()) return
    await tick()
  }
  expect(ready()).toBe(true)
}
function button(host: ParentNode, label: string) {
  const b = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!b) throw new Error(label)
  return b
}
const click = (host: ParentNode, label: string) => act(() => button(host, label).click())
function type(host: ParentNode, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
function tab(host: ParentNode, label: string) {
  const t = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (n) => n.textContent?.trim() === label,
  )!
  act(() => t.click())
}
async function fixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(import.meta.dirname, '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx'),
    ),
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C4"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>类别</t></is></c><c r="B1" t="inlineStr"><is><t>数量</t></is></c></row><row r="2"><c r="A2"><v>2</v></c><c r="B2"><v>1</v></c></row><row r="3"><c r="A3"><v>1</v></c><c r="B3"><v>2</v></c></row><row r="4"><c r="A4"><v>1</v></c><c r="B4"><v>3</v></c></row></sheetData></worksheet>',
  )
  zip.file('customXml/keep.bin', new Uint8Array([0, 255, 8]))
  return zip.generateAsync({ type: 'uint8array' })
}
const real: XlsxHostApply = async (request) => applyXlsxOpsOnHost({ ...request, ops: request.ops })
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    result: Record<string, Uint8Array> = {}
  for (const [path, part] of Object.entries(zip.files))
    if (!part.dir) result[path] = await part.async('uint8array')
  return result
}
async function mount(hostApply: XlsxHostApply) {
  const bytes = await fixture(),
    saved: Uint8Array[] = [],
    host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  let handle: XlsxAgentHandle | null = null
  const io: EditorIo = {
    load: async () => bytes,
    save: async (savedBytes) => {
      saved.push(savedBytes.slice())
    },
  }
  const render = (documentId = 'xlsx-sort') =>
    act(() =>
      root.render(
        <XlsxEditor
          documentId={documentId}
          io={io}
          hostApply={hostApply}
          onAgentHandleChange={(next) => {
            handle = next
          }}
        />,
      ),
    )
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await wait(() => !!handle && !!host.querySelector('.mimir-xlsx'))
  type(host, '操作范围（A1 或 A1:B5）', 'A1:B4')
  tab(host, '数据')
  click(host, '范围数据操作')
  return { host, bytes, saved, handle: () => handle!, render }
}
it('applies ordered native sort once, saves/reopens and restores all ZIP entries by undo/save/redo/save; repeat is exact no-op', async () => {
  const apply = vi.fn<XlsxHostApply>(real),
    ui = await mount(apply)
  click(ui.host, '添加排序级别')
  pickSelectOption(ui.host, '第 2 级排序顺序', '降序')
  click(ui.host, '应用排序')
  await wait(() => ui.handle().history().undo === 1)
  expect(apply).toHaveBeenCalledOnce()
  expect(ui.handle().getVersion()).toBe(1)
  const rows = (await readXlsx(ui.handle().currentBytes())).sheets[0]!.rows.slice(1)
  expect(rows.map((r) => r.cells[1]!.text)).toEqual(['3', '2', '1'])
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 1 && !ui.handle().isDirty())
  const accepted = await entries(ui.saved[0]!)
  await act(async () => {
    expect(await ui.handle().undo()).toBe(true)
  })
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 2 && !ui.handle().isDirty())
  expect(await entries(ui.saved[1]!)).toEqual(await entries(ui.bytes))
  await act(async () => {
    expect(await ui.handle().redo()).toBe(true)
  })
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 3 && !ui.handle().isDirty())
  expect(await entries(ui.saved[2]!)).toEqual(accepted)
  click(ui.host, '添加排序级别')
  pickSelectOption(ui.host, '第 2 级排序顺序', '降序')
  click(ui.host, '应用排序')
  await wait(
    () => apply.mock.calls.length === 2 && !ui.host.querySelector('fieldset[aria-busy="true"]'),
  )
  expect(ui.handle().getVersion()).toBe(3)
  expect(ui.handle().history().undo).toBe(1)
  expect(ui.handle().isDirty()).toBe(false)
})
for (const change of ['range', 'source', 'close', 'inspector'] as const)
  it(`cancels pending native sort on ${change} without late publish or history`, async () => {
    let finish!: (result: Awaited<ReturnType<XlsxHostApply>>) => void
    const apply = vi.fn<XlsxHostApply>(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      ),
      ui = await mount(apply)
    click(ui.host, '应用排序')
    await wait(() => apply.mock.calls.length === 1)
    const request = apply.mock.calls[0]![0]
    if (change === 'range') type(ui.host, '操作范围（A1 或 A1:B5）', 'A1:B3')
    else if (change === 'source') {
      ui.render('xlsx-other')
      await wait(() => ui.handle()?.documentId === 'xlsx-other')
    } else if (change === 'close') click(ui.host, '关闭范围数据设置')
    else {
      tab(ui.host, '插入')
      click(ui.host, '图表、形状与结构化表')
    }
    expect(request.signal!.aborted).toBe(true)
    const result = await real({ ...request, signal: undefined })
    await act(async () => finish(result))
    expect(ui.handle().getVersion()).toBe(0)
    expect(ui.handle().history().undo).toBe(0)
    expect(ui.handle().isDirty()).toBe(false)
    expect(ui.handle().currentBytes()).toEqual(ui.bytes)
  })
