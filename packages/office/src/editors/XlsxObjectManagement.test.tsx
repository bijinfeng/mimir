// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { readXlsx } from '../xlsx.js'
import type { XlsxSheet } from '../xlsx.js'
import type { XlsxVisual } from '../xlsx-visuals.js'
import { xlsxShapePreviewFixture } from '../xlsx-shape-preview-fixture.test-helper.js'
import { ToolbarPropertyForm } from '../shell/EditorShell.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { XlsxObjectManagement } from './XlsxObjectManagement.js'
import { XlsxObjectControls } from './XlsxObjectControls.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function nativeSheet() {
  return (await readXlsx((await xlsxShapePreviewFixture()).bytes)).sheets[0]!
}
function mount(sheet: XlsxSheet, controls = false) {
  const host = document.createElement('div')
  host.className = 'mimir-editor'
  document.body.append(host)
  const root = createRoot(host),
    onOperation = vi.fn<
      (op: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<boolean>
    >(async () => true),
    onSelect = vi.fn<(id: string) => void>()
  const render = (
    selectedId = sheet.visuals?.[0]?.id ?? '',
    sourceKey: unknown = sheet,
    busy = false,
    contextKey = 'doc:sheet',
  ) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small" theme={{ token: { motion: false } }}>
          {controls ? (
            <>
              <div className="mimir-editor__body" />
              <XlsxObjectControls
                sheet={sheet}
                sourceKey={sourceKey}
                contextKey={contextKey}
                range="A1:B3"
                busy={busy}
                selectedId={selectedId}
                onSelect={onSelect}
                onOperation={async () => true}
                onPivotOperation={onOperation}
              />
            </>
          ) : (
            <ToolbarPropertyForm columns={1}>
              <XlsxObjectManagement
                sheet={sheet}
                sourceKey={sourceKey}
                contextKey={contextKey}
                busy={busy}
                selectedId={selectedId}
                onSelect={onSelect}
                onOperation={onOperation}
              />
            </ToolbarPropertyForm>
          )}
        </ConfigProvider>,
      ),
    )
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render, onOperation, onSelect }
}
const wait = async (ready: () => boolean) => {
  for (let i = 0; i < 100 && !ready(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
  expect(ready()).toBe(true)
}

function button(host: HTMLElement, name: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!node) throw new Error(`找不到 ${name}`)
  return node
}
async function click(node: HTMLElement) {
  await act(async () => node.click())
}
async function tab(host: HTMLElement, name: string) {
  const node = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent === name,
  )
  if (!node) throw new Error(`找不到任务 ${name}`)
  await click(node)
}
function tableSheet(sheet: XlsxSheet): XlsxSheet {
  return {
    ...sheet,
    tables: [
      {
        path: 'xl/tables/table1.xml',
        relationshipId: 'rIdTable',
        name: 'Sales',
        range: 'A1:B3',
        columns: ['产品', '收入'],
        style: 'TableStyleMedium2',
        bandedRows: true,
      },
    ],
  }
}
async function confirmAction(name: string) {
  const node = [...document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm button')].find(
    (item) => item.textContent === name,
  )
  if (!node) throw new Error(`找不到确认动作 ${name}`)
  await click(node)
}
function type(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!
  act(() => {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('separates native object and empty table tasks with one footer action outside scroll content', async () => {
  const ui = mount(await nativeSheet())
  expect(ui.host.querySelector('[aria-label="结构化表名称"]')).toBeNull()
  expect(ui.host.querySelector('[aria-label="行列数量"]')).toBeNull()
  const primary = button(ui.host, '应用形状属性')
  expect(primary.closest('.mimir-xlsx-management__footer')).not.toBeNull()
  expect(primary.closest('.mimir-xlsx-management__body')).toBeNull()
  expect(primary.disabled).toBe(true)
  await tab(ui.host, '结构化表')
  expect(ui.host.textContent).toContain('当前工作表没有结构化表')
  expect(ui.host.querySelector('[aria-label="行列数量"]')).toBeNull()
  expect(ui.host.querySelector('[aria-label="应用形状属性"]')).toBeNull()
  expect(ui.onOperation).not.toHaveBeenCalled()
})

it('scrolls task navigation, object selection and properties together above the fixed action', async () => {
  const ui = mount(tableSheet(await nativeSheet()), true)
  await click(button(ui.host, '图表、形状与结构化表'))
  const body = ui.host.querySelector<HTMLElement>('.mimir-xlsx-management__body')!,
    configuration = body.querySelector<HTMLFieldSetElement>(
      '.mimir-xlsx-management__configuration',
    )!,
    navigation = body.querySelector<HTMLElement>('.mimir-xlsx-management__navigation')!,
    footer = ui.host.querySelector<HTMLElement>('.mimir-xlsx-management__footer')!
  expect(body.tagName).toBe('DIV')
  expect(navigation.querySelector('[aria-label="管理任务"]')).not.toBeNull()
  expect(navigation.querySelector('[aria-label="当前对象"]')).not.toBeNull()
  expect(configuration.querySelector('[aria-label="形状文字"]')).not.toBeNull()
  expect(configuration.contains(navigation)).toBe(false)
  expect(body.nextElementSibling).toBe(footer)
  expect(footer.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  await tab(ui.host, '结构化表')
  expect(body.contains(ui.host.querySelector('[aria-label="结构化表名称"]'))).toBe(true)
  expect(configuration.querySelector('[aria-label="行列数量"]')).not.toBeNull()
  expect(button(ui.host, '应用表格结构调整').closest('footer')).toBe(footer)
  expect(footer.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  expect(ui.onOperation).not.toHaveBeenCalled()
})

it('locks pending object fields and Select while keeping task navigation available to cancel', async () => {
  const ui = mount(tableSheet(await nativeSheet()))
  let resolve!: (ok: boolean) => void
  ui.onOperation.mockImplementationOnce(
    () =>
      new Promise((finish) => {
        resolve = finish
      }),
  )
  type(ui.host, '形状文字', '待提交')
  await click(button(ui.host, '应用形状属性'))
  const signal = ui.onOperation.mock.calls[0]![1].signal,
    configuration = ui.host.querySelector<HTMLFieldSetElement>(
      '.mimir-xlsx-management__configuration',
    )!,
    navigation = ui.host.querySelector<HTMLElement>('.mimir-xlsx-management__navigation')!,
    selector = navigation.querySelector<HTMLInputElement>('[aria-label="当前对象"]')!
  expect(configuration.disabled).toBe(true)
  expect(navigation.closest('fieldset')).toBeNull()
  expect(selector.disabled).toBe(true)
  act(() => {
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  })
  expect(selector.getAttribute('aria-expanded')).toBe('false')
  expect(ui.onSelect).not.toHaveBeenCalled()
  expect(signal.aborted).toBe(false)
  await tab(ui.host, '结构化表')
  expect(signal.aborted).toBe(true)
  expect(configuration.disabled).toBe(false)
  expect(ui.host.querySelector('[aria-label="形状文字"]')).toBeNull()
  await act(async () => resolve(true))
  expect(ui.host.textContent).not.toContain('已应用')
  expect(ui.onOperation).toHaveBeenCalledOnce()
})

it.each([
  [0, '原生渐变'],
  [2, '无填充'],
  [4, '未支持的原生填充'],
] as const)('does not select a fake white solid for native fill %i', async (index, label) => {
  const sheet = await nativeSheet(),
    ui = mount(sheet)
  ui.render(sheet.visuals![index]!.id)
  expect(ui.host.textContent).toContain(`当前填充：${label}`)
  await click(button(ui.host, '形状填充'))
  expect(ui.host.querySelector('.me-color__cell[aria-pressed="true"]')).toBeNull()
  expect(button(ui.host, '应用形状属性').disabled).toBe(true)
  type(ui.host, '形状文字', '只改文字')
  await click(button(ui.host, '应用形状属性'))
  expect(ui.onOperation).toHaveBeenLastCalledWith(
    { op: 'edit_shape', visualId: sheet.visuals![index]!.id, text: '只改文字' },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
})

it('shows resolved native solid and explicitly selected solid overrides without writing untouched fill', async () => {
  const sheet = await nativeSheet(),
    ui = mount(sheet)
  ui.render(sheet.visuals![3]!.id)
  expect(ui.host.textContent).toContain('纯色 #E4A24A')
  type(ui.host, '形状文字', '草稿')
  type(ui.host, '形状文字', sheet.visuals![3]!.text ?? '')
  expect(button(ui.host, '应用形状属性').disabled).toBe(true)
  await click(button(ui.host, '形状填充'))
  const color =
    ui.host.querySelector<HTMLElement>('.me-color__cell[aria-label="蓝"]') ??
    [...ui.host.querySelectorAll<HTMLElement>('.me-color__cell')].find((item) =>
      item.getAttribute('aria-label')?.includes('蓝'),
    )!
  expect(color).toBeDefined()
  await click(color)
  await click(button(ui.host, '应用形状属性'))
  expect(ui.onOperation.mock.calls[0]![0]).toMatchObject({
    op: 'edit_shape',
    visualId: sheet.visuals![3]!.id,
    fillColor: expect.stringMatching(/^#[\da-f]{6}$/i),
  })
})

it.each(['source', 'target', 'context', 'task', 'close'] as const)(
  'cancels pending management on %s and rejects late feedback',
  async (change) => {
    const sheet = await nativeSheet(),
      ui = mount(sheet)
    let resolve!: (ok: boolean) => void
    ui.onOperation.mockImplementationOnce(
      () =>
        new Promise((finish) => {
          resolve = finish
        }),
    )
    type(ui.host, '形状文字', '待提交')
    await click(button(ui.host, '应用形状属性'))
    expect(button(ui.host, '应用形状属性').disabled).toBe(true)
    const signal = ui.onOperation.mock.calls[0]![1].signal
    if (change === 'source') ui.render(sheet.visuals![0]!.id, {})
    else if (change === 'target') ui.render(sheet.visuals![1]!.id)
    else if (change === 'context') ui.render(sheet.visuals![0]!.id, sheet, false, 'new:sheet')
    else if (change === 'task') await tab(ui.host, '结构化表')
    else cleanups.pop()!()
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(true))
    expect(ui.host.textContent).not.toContain('已应用')
    expect(
      [...ui.host.querySelectorAll<HTMLButtonElement>('[aria-label="应用形状属性"]')].every(
        (item) => item.disabled,
      ),
    ).toBe(true)
  },
)

it('keeps a refused draft for retry and prevents duplicate submission', async () => {
  const ui = mount(await nativeSheet())
  ui.onOperation.mockResolvedValueOnce(false)
  type(ui.host, '形状文字', '重试文字')
  await click(button(ui.host, '应用形状属性'))
  expect(ui.host.textContent).toContain('设置已保留')
  expect(button(ui.host, '应用形状属性').disabled).toBe(false)
  let resolve!: (ok: boolean) => void
  ui.onOperation.mockImplementationOnce(
    () =>
      new Promise((finish) => {
        resolve = finish
      }),
  )
  await click(button(ui.host, '应用形状属性'))
  await click(button(ui.host, '应用形状属性'))
  expect(ui.onOperation).toHaveBeenCalledTimes(2)
  await act(async () => resolve(true))
  expect(ui.host.textContent).toContain('已应用')
})

it('retains chart properties, series data and colors as separate current footer actions', async () => {
  const sheet = await nativeSheet(),
    base = sheet.visuals![0]!
  const chart: XlsxVisual = {
    ...base,
    kind: 'chart',
    name: '收入',
    chartPath: 'xl/charts/chart1.xml',
    chart: {
      type: 'column',
      legend: 'right',
      dataLabels: 'none',
      grouping: 'clustered',
      series: ['一季度'],
    },
  }
  const ui = mount({ ...sheet, visuals: [chart] })
  expect(button(ui.host, '应用图表属性').closest('footer')).not.toBeNull()
  type(ui.host, '图表标题', '新标题')
  await click(button(ui.host, '应用图表属性'))
  expect(ui.onOperation.mock.calls[0]![0]).toEqual({
    op: 'edit_chart',
    chartPath: chart.chartPath,
    title: '新标题',
  })
  await tab(ui.host, '系列数据')
  expect(ui.host.querySelector('[aria-label="应用图表属性"]')).toBeNull()
  type(ui.host, '数值范围（当前表，留空保留）', 'C2:C3')
  await click(button(ui.host, '更新图表系列数据'))
  expect(ui.onOperation.mock.calls[1]![0]).toEqual({
    op: 'edit_chart',
    chartPath: chart.chartPath,
    seriesData: [{ index: 0, valuesRange: 'C2:C3' }],
  })
  await tab(ui.host, '系列颜色')
  expect(button(ui.host, '应用系列颜色').closest('footer')).not.toBeNull()
  expect(ui.host.querySelector('[aria-label="更新图表系列数据"]')).toBeNull()
})

it('closes the real object inspector with Escape and restores its live trigger', async () => {
  const ui = mount(await nativeSheet(), true)
  const trigger = button(ui.host, '图表、形状与结构化表')
  await click(trigger)
  const panel = ui.host.querySelector<HTMLElement>('[aria-label="工作表对象与表格"]')!
  expect(panel).not.toBeNull()
  expect(button(ui.host, '应用形状属性').closest('footer')).not.toBeNull()
  act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(ui.host.querySelector('[aria-label="工作表对象与表格"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(ui.onOperation).not.toHaveBeenCalled()
})

it('edits the native gradient through the real Editor once and preserves all ZIP entries on save/undo/redo', async () => {
  const { XlsxEditor } = await import('./XlsxEditor.js'),
    { applyXlsxObjectOperation } =
      await import('../../../../apps/server/src/services/xlsx-agent-objects.js'),
    { workbookOperationSchema } =
      await import('../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'),
    { default: JSZip } = await import('jszip'),
    fixture = await xlsxShapePreviewFixture(),
    host = document.createElement('div'),
    root = createRoot(host),
    saved: Uint8Array[] = []
  let handle: import('../agent/xlsx-agent.js').XlsxAgentHandle | null = null
  const execute = vi.fn<import('../agent/xlsx-agent.js').XlsxHostApply>(
    async ({ bytes, ops, expectedVersion }) =>
      applyXlsxObjectOperation(bytes, workbookOperationSchema.parse(ops[0]), expectedVersion),
  )
  document.body.append(host)
  act(() =>
    root.render(
      <XlsxEditor
        documentId="management-native"
        io={{
          load: async () => fixture.bytes,
          save: async (bytes) => {
            saved.push(bytes.slice())
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
  await wait(() => !!handle && !!host.querySelector('.mimir-xlsx-object'))
  const current = () => {
    if (!handle) throw new Error('missing handle')
    return handle
  }
  await click(host.querySelector<HTMLElement>('.mimir-xlsx-object')!)
  await tab(host, '插入')
  await click(button(host, '图表、形状与结构化表'))
  expect(host.textContent).toContain('当前填充：原生渐变')
  expect(button(host, '应用形状属性').disabled).toBe(true)
  expect(current().getVersion()).toBe(0)
  expect(current().history().undo).toBe(0)
  type(host, '形状文字', '保留渐变，仅改文字')
  await click(button(host, '应用形状属性'))
  await wait(() => current().getVersion() === 1)
  expect(execute).toHaveBeenCalledOnce()
  expect(execute.mock.calls[0]![0].ops[0]).not.toHaveProperty('fillColor')
  expect(current().history().undo).toBe(1)
  await click(button(host, '保存到库'))
  await wait(() => saved.length === 1 && !current().isDirty())
  const read = async (bytes: Uint8Array) => {
    const zip = await JSZip.loadAsync(bytes),
      result: Record<string, Uint8Array> = {}
    for (const [path, entry] of Object.entries(zip.files))
      if (!entry.dir) result[path] = await entry.async('uint8array')
    return result
  }
  const before = await read(fixture.bytes),
    first = await read(saved[0]!)
  expect((await readXlsx(saved[0]!)).sheets[0]!.visuals![0]!.shapePreview!.element!.fill).toEqual(
    (await readXlsx(fixture.bytes)).sheets[0]!.visuals![0]!.shapePreview!.element!.fill,
  )
  await act(async () => {
    expect(await current().undo()).toBe(true)
  })
  await click(button(host, '保存到库'))
  await wait(() => saved.length === 2 && !current().isDirty())
  expect(await read(saved[1]!)).toEqual(before)
  await act(async () => {
    expect(await current().redo()).toBe(true)
  })
  await click(button(host, '保存到库'))
  await wait(() => saved.length === 3 && !current().isDirty())
  expect(await read(saved[2]!)).toEqual(first)
})

it('keeps table adjustment in the fixed footer and requires confirmation before invoking the same operation', async () => {
  const sheet = await nativeSheet()
  sheet.tables = [
    {
      path: 'xl/tables/table1.xml',
      relationshipId: 'rIdTable',
      name: 'Sales',
      range: 'A1:B3',
      columns: ['产品', '收入'],
      style: 'TableStyleMedium2',
      bandedRows: true,
    },
  ]
  const ui = mount(sheet)
  await tab(ui.host, '结构化表')
  expect(ui.host.querySelector('[aria-label="形状文字"]')).toBeNull()
  const primary = button(ui.host, '应用表格结构调整')
  expect(primary.closest('footer')).not.toBeNull()
  await click(primary)
  expect(ui.onOperation).not.toHaveBeenCalled()
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm button')].find(
    (item) => item.textContent === '应用调整',
  )!
  expect(confirm).toBeDefined()
  await click(confirm)
  expect(ui.onOperation).toHaveBeenCalledWith(
    { op: 'add_table_row', tableName: 'Sales', count: 1, row: 1 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
})

it('Escape dismisses the color layer before closing the management inspector', async () => {
  const ui = mount(await nativeSheet(), true)
  await click(button(ui.host, '图表、形状与结构化表'))
  await click(button(ui.host, '形状填充'))
  const picker = ui.host.querySelector<HTMLElement>('.me-color__panel')!
  expect(picker).not.toBeNull()
  act(() => picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(ui.host.querySelector('[aria-label="工作表对象与表格"]')).not.toBeNull()
  expect(ui.host.querySelector('.me-picker-grid')).toBeNull()
  expect(document.activeElement).toBe(button(ui.host, '形状填充'))
  expect(ui.onOperation).not.toHaveBeenCalled()
})

it('Escape cancels the object confirmation without closing the inspector or mutating', async () => {
  const ui = mount(await nativeSheet(), true)
  await click(button(ui.host, '图表、形状与结构化表'))
  const remove = button(ui.host, '删除工作表对象')
  await click(remove)
  act(() => remove.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(ui.host.querySelector('[aria-label="工作表对象与表格"]')).not.toBeNull()
  expect(document.querySelector('.ant-popconfirm:not(.ant-popover-hidden)')).toBeNull()
  expect(document.activeElement).toBe(remove)
  expect(ui.onOperation).not.toHaveBeenCalled()
})

it.each([
  ['插入数据行', 'add_table_row', { row: 1 }],
  ['删除数据行', 'delete_table_row', { row: 1 }],
  ['插入表格列', 'add_table_column', { column: 1, columnName: '新增收入' }],
  ['删除表格列', 'delete_table_column', { column: 1 }],
] as const)(
  'keeps %s reachable with its native operation and confirmation',
  async (label, op, at) => {
    const ui = mount(tableSheet(await nativeSheet()))
    await tab(ui.host, '结构化表')
    pickSelectOption(ui.host, '表格结构操作', label)
    if (op === 'add_table_column') type(ui.host, '新增列名称', '新增收入')
    await click(button(ui.host, '应用表格结构调整'))
    expect(ui.onOperation).not.toHaveBeenCalled()
    await confirmAction('应用调整')
    expect(ui.onOperation).toHaveBeenCalledExactlyOnceWith(
      { op, tableName: 'Sales', count: 1, ...at },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  },
)

it('retains image removal and table conversion without applying on cancel or stale confirmation', async () => {
  const sheet = tableSheet(await nativeSheet()),
    base = sheet.visuals![0]!
  sheet.visuals = [{ ...base, kind: 'image', name: '产品照片' }]
  const ui = mount(sheet)
  expect(ui.host.textContent).toContain('当前图片：产品照片')
  expect(ui.host.querySelector('[aria-label="应用形状属性"]')).toBeNull()
  await click(button(ui.host, '删除工作表对象'))
  await confirmAction('算了')
  expect(ui.onOperation).not.toHaveBeenCalled()
  await click(button(ui.host, '删除工作表对象'))
  ui.render(base.id, {})
  expect(document.querySelector('.ant-popconfirm:not(.ant-popover-hidden)')).toBeNull()
  expect(ui.onOperation).not.toHaveBeenCalled()
  await click(button(ui.host, '删除工作表对象'))
  await confirmAction('删除对象')
  expect(ui.onOperation.mock.calls[0]![0]).toEqual({ op: 'delete_visual', visualId: base.id })
  await tab(ui.host, '结构化表')
  await click(button(ui.host, '转换结构化表为区域'))
  expect(ui.onOperation).toHaveBeenCalledTimes(1)
  await confirmAction('转换为区域')
  expect(ui.onOperation.mock.calls[1]![0]).toEqual({ op: 'delete_table', tableName: 'Sales' })
})

it('Escape closes an Antd Select before closing the management inspector', async () => {
  const ui = mount(await nativeSheet(), true)
  await click(button(ui.host, '图表、形状与结构化表'))
  const input = ui.host.querySelector<HTMLInputElement>('[aria-label="当前对象"]')!
  act(() => {
    input.focus()
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  })
  expect(input.getAttribute('aria-expanded')).toBe('true')
  await act(async () => {
    const escape = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })
    // happy-dom leaves legacy `which` at zero; rc-select uses the real browser's value.
    Object.defineProperty(escape, 'which', { value: 27 })
    input.dispatchEvent(escape)
  })
  expect(ui.host.querySelector('[aria-label="工作表对象与表格"]')).not.toBeNull()
  expect(input.getAttribute('aria-expanded')).toBe('false')
  expect(ui.host.querySelector('[aria-label="工作表对象与表格"]')).not.toBeNull()
  expect(ui.onOperation).not.toHaveBeenCalled()
})
