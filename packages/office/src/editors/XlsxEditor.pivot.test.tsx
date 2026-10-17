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
import { xlsxPivotFixture, xlsxCrossSheetPivotFixture } from './xlsx-pivot-test-fixture.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'
import { applyXlsxPivotOperation } from '../../../../apps/server/src/services/xlsx-agent-pivots.js'
import { workbookOperationSchema } from '../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { readXlsx } from '../xlsx.js'
import type { EditorIo } from './types.js'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()))
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
async function wait(ready: () => boolean) {
  await vi.waitFor(
    async () => {
      await tick()
      expect(ready()).toBe(true)
    },
    { timeout: 3000, interval: 10 },
  )
}
function button(host: HTMLElement, name: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!found) throw new Error(`Missing ${name}: ${host.textContent}`)
  return found
}
const click = (host: HTMLElement, name: string) => act(() => button(host, name).click())
function tab(host: HTMLElement, name: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === name,
  )
  if (!found) throw new Error(`Missing tab ${name}`)
  act(() => found.click())
}
function type(host: HTMLElement, name: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
async function mount(hostApply: XlsxHostApply, crossSheet = false) {
  const fixture = crossSheet ? await xlsxCrossSheetPivotFixture() : await xlsxPivotFixture(),
    saved: Uint8Array[] = []
  const io: EditorIo = {
    load: async () => fixture.bytes,
    save: async (bytes) => {
      saved.push(bytes.slice())
    },
  }
  let handle: XlsxAgentHandle | null = null
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = (documentId = 'pivot-test') =>
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
  tab(host, '插入')
  click(host, '图表、形状与结构化表')
  tab(host, '透视')
  type(host, '源数据范围', 'A1:F6')
  if (crossSheet) {
    pickSelectOption(host, '来源工作表', fixture.workbook.sheets[0]!.name)
  }
  // Defaults follow the initial selection, so explicitly select actual source fields.
  pickSelectOption(host, '行字段 1', '区域')
  type(host, '输出左上角', crossSheet ? 'A1' : 'I1')
  tab(host, '汇总')
  pickSelectOption(host, '汇总字段 1', '金额')
  tab(host, '字段')
  return { host, saved, fixture, render, handle: () => handle! }
}
const realApply: XlsxHostApply = async ({ bytes, ops, expectedVersion }) => {
  expect(ops).toHaveLength(1)
  return applyXlsxPivotOperation(bytes, workbookOperationSchema.parse(ops[0]), expectedVersion)
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    result: Record<string, Uint8Array> = {}
  for (const [path, entry] of Object.entries(zip.files))
    if (!entry.dir) result[path] = await entry.async('uint8array')
  return result
}

it('creates advanced native pivots through the mounted editor with one history action, saves twice and restores complete bytes through undo/save/redo/save', async () => {
  const execute = vi.fn<XlsxHostApply>(realApply),
    ui = await mount(execute),
    host = ui.host
  click(host, '添加行字段')
  pickSelectOption(host, '行字段 2', '日期')
  tab(host, '汇总')
  click(host, '添加汇总值')
  pickSelectOption(host, '汇总字段 2', '成本')
  pickSelectOption(host, '汇总方式 2', '平均值')
  tab(host, '筛选')
  click(host, '添加维度分组')
  pickSelectOption(host, '分组字段 1', '日期')
  pickSelectOption(host, '分组方式 1', '按季度')
  click(host, '添加透视筛选')
  type(host, '筛选文字 1', '华')
  click(host, '创建数据透视表')
  await wait(() => ui.handle().history().undo === 1 && !host.querySelector('[aria-busy="true"]'))
  expect(execute).toHaveBeenCalledOnce()
  expect(execute.mock.calls[0]![0]).toMatchObject({ expectedVersion: 0, documentId: 'pivot-test' })
  expect(execute.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal)
  expect(ui.handle().getVersion()).toBe(1)
  const native = (await readXlsx(ui.handle().currentBytes())).sheets[0]!
  expect(native.pivots![0]!.definition.dataFields).toHaveLength(2)
  expect(native.pivots![0]!.definition.fields[2]!.grouping).toEqual({
    kind: 'date',
    dateUnit: 'quarter',
  })
  expect(host.textContent).toContain('Q2')
  click(host, '保存到库')
  await wait(() => ui.saved.length === 1 && !ui.handle().isDirty())
  const accepted = await entries(ui.saved[0]!)
  expect(accepted['customXml/mimir-pivot-preservation.xml']).toEqual(
    (await entries(ui.fixture.bytes))['customXml/mimir-pivot-preservation.xml'],
  )
  const xml = new TextDecoder().decode(accepted[ui.fixture.sheet.entry])
  expect(xml).toContain('<c r="Z1" s="0" t="inlineStr"><is><t>保留原件属性</t></is></c>')
  expect(xml).toContain('<c r="Z2"><f>1+2</f><v>3</v></c>')
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
  pickSelectOption(host, '透视表', native.pivots![0]!.name)
  click(host, '刷新当前表全部透视表')
  await wait(() => execute.mock.calls.length === 2 && ui.handle().getVersion() === 4)
  expect(execute.mock.calls[1]![0].expectedVersion).toBe(3)
  click(host, '保存到库')
  await wait(() => ui.saved.length === 4 && !ui.handle().isDirty())
  expect((await readXlsx(ui.saved[3]!)).sheets[0]!.pivots![0]!.definition.dataFields).toHaveLength(
    2,
  )
})

it.each(['close', 'document', 'mode'])(
  'does not publish late host bytes after pending %s changes',
  async (mode) => {
    let finish!: (value: Awaited<ReturnType<XlsxHostApply>>) => void
    const delayed = vi.fn<XlsxHostApply>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const ui = await mount(delayed),
      old = ui.handle()
    click(ui.host, '创建数据透视表')
    await wait(() => delayed.mock.calls.length === 1)
    const request = delayed.mock.calls[0]![0],
      result = await realApply(request)
    if (mode === 'close') click(ui.host, '关闭工作表对象面板')
    else if (mode === 'mode') tab(ui.host, '图表')
    else {
      ui.render('other-document')
      await wait(() => ui.handle()?.documentId === 'other-document')
    }
    expect(request.signal?.aborted).toBe(true)
    await act(async () => finish(result))
    await tick()
    expect(old.getVersion()).toBe(0)
    expect(old.history()).toEqual({ undo: 0, redo: 0 })
    expect(await entries(old.currentBytes())).toEqual(await entries(ui.fixture.bytes))
    expect(ui.handle().isDirty()).toBe(false)
    expect(ui.saved).toHaveLength(0)
  },
)

it('creates from the selected different sheet at the same A1 coordinates, keeps success and current output, and saves native complete-byte history', async () => {
  const execute = vi.fn<XlsxHostApply>(applyXlsxOpsOnHost)
  const ui = await mount(execute, true)
  const original = await entries(ui.fixture.bytes)
  type(ui.host, '透视名称', '跨表汇总')
  click(ui.host, '创建数据透视表')
  await wait(() => ui.handle().getVersion() === 1 && !ui.host.querySelector('[aria-busy="true"]'))
  expect(ui.host.querySelector('[role="status"]')?.textContent ?? ui.host.textContent).toContain(
    '已创建',
  )
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')!.value).toBe(
    '跨表汇总',
  )
  expect(ui.handle().history()).toEqual({ undo: 1, redo: 0 })
  expect(execute.mock.calls[0]![0].ops[0]).toMatchObject({
    sheetId: ui.fixture.workbook.sheets[0]!.id,
    targetSheetId: ui.fixture.sheet.id,
    targetCell: 'A1',
  })
  const current = await readXlsx(ui.handle().currentBytes())
  expect(current.sheets[0]!.pivots).toHaveLength(0)
  expect(current.sheets[1]!.pivots).toHaveLength(1)
  expect(current.sheets[1]!.pivots![0]!.definition.sourceSheet).toBe(
    ui.fixture.workbook.sheets[0]!.name,
  )
  expect(
    current.sheets[1]!.rows.flatMap((row) => row.cells).some((cell) => cell.text === '150'),
  ).toBe(true)
  const accepted = await entries(ui.handle().currentBytes())
  for (const path of [
    ui.fixture.workbook.sheets[0]!.entry,
    ui.fixture.workbook.sheets[2]!.entry,
    'customXml/mimir-pivot-preservation.xml',
    'xl/sharedStrings.xml',
  ])
    expect(accepted[path]).toEqual(original[path])
  const target = new TextDecoder().decode(accepted[ui.fixture.sheet.entry])
  expect(target).toContain('汇总说明保留')
  expect(new TextDecoder().decode(accepted[current.sheets[1]!.pivots![0]!.cachePath])).toContain(
    ui.fixture.workbook.sheets[0]!.name,
  )
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 1 && !ui.handle().isDirty())
  expect(await entries(ui.saved[0]!)).toEqual(accepted)
  await act(async () => {
    await ui.handle().undo()
  })
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 2 && !ui.handle().isDirty())
  expect(await entries(ui.saved[1]!)).toEqual(original)
  await act(async () => {
    await ui.handle().redo()
  })
  click(ui.host, '保存到库')
  await wait(() => ui.saved.length === 3 && !ui.handle().isDirty())
  expect(await entries(ui.saved[2]!)).toEqual(accepted)
})

it('leaves bytes/version/history/dirty unchanged and preserves draft with a concrete full-host target conflict', async () => {
  const execute = vi.fn<XlsxHostApply>(applyXlsxOpsOnHost)
  const ui = await mount(execute, true)
  type(ui.host, '输出左上角', 'Z1')
  type(ui.host, '透视名称', '保留失败草稿')
  click(ui.host, '创建数据透视表')
  await wait(() => !!ui.host.querySelector('.mimir-xlsx-pivot__footer [role="alert"]'))
  expect(ui.host.querySelector('.mimir-xlsx-pivot__footer [role="alert"]')!.textContent).toContain(
    '覆盖现有内容',
  )
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')!.value).toBe(
    '保留失败草稿',
  )
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
  expect(ui.handle().isDirty()).toBe(false)
  expect(await entries(ui.handle().currentBytes())).toEqual(await entries(ui.fixture.bytes))
})

it('cancels a cross-sheet request on current output change, including an A to B to A roundtrip', async () => {
  let finish!: (value: Awaited<ReturnType<XlsxHostApply>>) => void
  const execute = vi.fn<XlsxHostApply>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const ui = await mount(execute, true)
  click(ui.host, '创建数据透视表')
  await wait(() => execute.mock.calls.length === 1)
  const request = execute.mock.calls[0]![0]
  const native = await realApply(request)
  tab(ui.host, '开始')
  tab(ui.host, ui.fixture.workbook.sheets[0]!.name)
  tab(ui.host, ui.fixture.sheet.name)
  expect(request.signal?.aborted).toBe(true)
  await act(async () => finish(native))
  await tick()
  expect(ui.handle().getVersion()).toBe(0)
  expect(ui.handle().history()).toEqual({ undo: 0, redo: 0 })
  expect(ui.handle().isDirty()).toBe(false)
})

it('keeps the open cross-sheet pivot draft at a narrower width with all configuration in one scroll body and a separate primary footer', async () => {
  let width = 1000
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('mimir-compact-toolbar__commands'))
        return DOMRect.fromRect({ width, height: 56 })
      if (this.dataset.sectionKey)
        return DOMRect.fromRect({
          width: this.hasAttribute('data-collapsed')
            ? 72
            : this.dataset.sectionKey === 'objects'
              ? 90
              : 600,
          height: 56,
        })
      return DOMRect.fromRect({ width: 100, height: 32 })
    })
  try {
    const ui = await mount(vi.fn<XlsxHostApply>(applyXlsxOpsOnHost), true)
    type(ui.host, '透视名称', '缩窄后保留')
    const inspector = ui.host.querySelector('.mimir-xlsx-inspector')
    expect(inspector).not.toBeNull()
    width = 420
    ui.render()
    await tick()
    expect(ui.host.querySelector('.mimir-xlsx-inspector')).toBe(inspector)
    expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')?.value).toBe(
      '缩窄后保留',
    )
    const pivot = ui.host.querySelector('.mimir-xlsx-pivot')!,
      body = pivot.querySelector('.mimir-xlsx-pivot__body')!,
      footer = pivot.querySelector('.mimir-xlsx-pivot__footer')!
    expect(body.parentElement).toBe(pivot)
    expect(footer.parentElement).toBe(pivot)
    expect(body.contains(pivot.querySelector('.mimir-xlsx-pivot__navigation'))).toBe(true)
    expect(body.contains(pivot.querySelector('.mimir-xlsx-pivot__configuration'))).toBe(true)
    expect(body.contains(footer)).toBe(false)
    expect(footer.querySelectorAll('button')).toHaveLength(1)
    expect(footer.querySelector('button')).toBe(button(ui.host, '创建数据透视表'))
  } finally {
    bounds.mockRestore()
  }
})
