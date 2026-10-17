/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { XlsxPivotControls, type XlsxPivotControlsProps } from './XlsxPivotControls.js'
import { xlsxPivotFixture, xlsxCrossSheetPivotFixture } from './xlsx-pivot-test-fixture.js'
import {
  pickSelectOption,
  selectValueText,
  selectRoot,
  openSelect,
} from '../shell/antd-test-dom.js'
import { createXlsxPivotDraft, xlsxPivotOperation } from './xlsx-pivot-controls.js'
import { applyXlsxPivotOperation } from '../../../../apps/server/src/services/xlsx-agent-pivots.js'
import { readXlsx } from '../xlsx.js'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()))
function mount(initialProps: XlsxPivotControlsProps) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (next: XlsxPivotControlsProps) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <XlsxPivotControls {...next} />
        </ConfigProvider>,
      ),
    )
  render(initialProps)
  let live = true
  const dispose = () => {
    if (!live) return
    live = false
    act(() => root.unmount())
    host.remove()
  }
  cleanup.push(dispose)
  return { host, render, dispose }
}
function button(host: HTMLElement, name: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!found) throw new Error(`Missing ${name}`)
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
  if (!input) throw new Error(`Missing input ${name}`)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
async function props(
  onOperation = vi.fn<XlsxPivotControlsProps['onOperation']>().mockResolvedValue(true),
) {
  const fixture = await xlsxPivotFixture()
  return {
    sheet: fixture.sheet,
    range: 'A1:F6',
    sourceKey: fixture.bytes,
    contextKey: 'doc/sheet',
    busy: false,
    onOperation,
  }
}

it('sends advanced field order, multi-values, group parameters, report fields and stable value-filter references in one operation', async () => {
  const base = await props(),
    ui = mount(base),
    host = ui.host
  type(host, '输出左上角', 'I1')
  type(host, '透视名称', '高级透视')
  click(host, '添加行字段')
  pickSelectOption(host, '行字段 2', '日期')
  click(host, '上移行字段 2')
  tab(host, '汇总')
  type(host, '数字格式 1', '#,##0.00')
  click(host, '添加汇总值')
  pickSelectOption(host, '汇总字段 2', '成本')
  pickSelectOption(host, '汇总方式 2', '平均值')
  pickSelectOption(host, '显示方式 2', '占总计百分比')
  tab(host, '筛选')
  click(host, '添加报告筛选字段')
  pickSelectOption(host, '报告筛选字段 1', '渠道')
  click(host, '添加维度分组')
  pickSelectOption(host, '分组方式 1', '按季度')
  click(host, '添加透视筛选')
  pickSelectOption(host, '筛选条件 1', '数值介于')
  pickSelectOption(host, '筛选汇总值 1', '2. 成本 · 平均值')
  type(host, '筛选下限 1', '0')
  type(host, '筛选上限 1', '100')
  click(host, '创建数据透视表')
  await act(async () => {
    await Promise.resolve()
  })
  expect(base.onOperation).toHaveBeenCalledOnce()
  expect(base.onOperation.mock.calls[0]![0]).toMatchObject({
    op: 'add_pivot',
    name: '高级透视',
    rowFields: ['日期', '区域'],
    pageFields: ['渠道'],
    values: [
      { field: '金额', numFmt: '#,##0.00' },
      { field: '成本', agg: 'average', showDataAs: 'percentOfTotal' },
    ],
    groupings: [{ field: '日期', dateUnit: 'quarter' }],
    filters: [{ field: '日期', op: 'between', valueIndex: 1, from: 0, to: 100 }],
  })
  expect(host.querySelectorAll('.mimir-xlsx-pivot__footer')).toHaveLength(1)
  expect(host.querySelector('.mimir-xlsx-pivot__footer button')).toBe(
    button(host, '创建数据透视表'),
  )
})

it('locks composite selects and same-tick duplicate submits, keeps all failed drafts, and does not abort its own busy update', async () => {
  let finish!: (value: boolean) => void
  const execute = vi.fn<XlsxPivotControlsProps['onOperation']>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const base = await props(execute),
    ui = mount(base)
  type(ui.host, '输出左上角', 'I1')
  type(ui.host, '透视名称', '保留配置')
  act(() => {
    button(ui.host, '创建数据透视表').click()
    button(ui.host, '创建数据透视表').click()
  })
  expect(execute).toHaveBeenCalledOnce()
  const signal = execute.mock.calls[0]![1].signal
  ui.render({ ...base, busy: true })
  expect(signal.aborted).toBe(false)
  expect(ui.host.querySelector('.ant-select-disabled')).not.toBeNull()
  expect(button(ui.host, '正在应用透视配置').disabled).toBe(true)
  await act(async () => finish(false))
  ui.render(base)
  expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('配置已保留')
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')?.value).toBe(
    '保留配置',
  )
  click(ui.host, '创建数据透视表')
  expect(execute.mock.calls[1]![0]).toEqual(execute.mock.calls[0]![0])
  await act(async () => finish(true))
})

it.each(['source', 'context', 'unmount'])(
  'aborts on %s invalidation and ignores late responses',
  async (mode) => {
    let finish!: (value: boolean) => void
    const execute = vi.fn<XlsxPivotControlsProps['onOperation']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const base = await props(execute),
      ui = mount(base)
    type(ui.host, '输出左上角', 'I1')
    type(ui.host, '透视名称', '旧配置')
    ui.render({ ...base, sheet: { ...base.sheet } })
    expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')?.value).toBe(
      '旧配置',
    )
    click(ui.host, '创建数据透视表')
    const signal = execute.mock.calls[0]![1].signal
    if (mode === 'unmount') ui.dispose()
    else {
      ui.render({ ...base, ...(mode === 'source' ? { sourceKey: {} } : { contextKey: 'other' }) })
      ui.render(base)
    }
    expect(
      ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')?.value ?? '',
    ).toBe('')
    expect(signal.aborted).toBe(true)
    await act(async () => finish(true))
    expect(ui.host.textContent).not.toContain('已创建，')
  },
)

it('reads actual existing native fields, grouped values and filters without a lossy editable draft and refreshes all pivots', async () => {
  const fixture = await xlsxPivotFixture(),
    draft = createXlsxPivotDraft(fixture.sheet, 'A1:F6')
  Object.assign(draft, {
    targetCell: 'I1',
    name: '原生透视',
    rowFields: ['日期'],
    pageFields: ['渠道'],
    groupings: [{ key: 'g', field: '日期', mode: 'quarter', step: '10', start: '' }],
    filters: [
      {
        key: 'f',
        field: '日期',
        op: 'contains',
        text: 'Q',
        valueKey: 'value-0',
        count: '10',
        from: '',
        to: '',
      },
    ],
  })
  const native = await applyXlsxPivotOperation(
    fixture.bytes,
    xlsxPivotOperation(fixture.sheet, draft).operation,
    0,
  )
  const base = await props(),
    ui = mount({ ...base, sheet: (await readXlsx(native.bytes)).sheets[0]! })
  pickSelectOption(ui.host, '透视表', '原生透视')
  expect(ui.host.textContent).toContain('已有透视表为只读配置')
  expect(ui.host.textContent).toContain('渠道：全部项')
  expect(ui.host.querySelector('input[aria-label="源数据范围"]')).toBeNull()
  tab(ui.host, '汇总')
  expect(ui.host.textContent).toContain('金额')
  tab(ui.host, '筛选')
  expect(ui.host.textContent).toContain('日期 · 按季度')
  expect(ui.host.textContent).toContain('标签包含 · Q')
  expect(selectValueText(ui.host, '透视表')).toBe('原生透视')
  click(ui.host, '刷新当前表全部透视表')
  await act(async () => {
    await Promise.resolve()
  })
  expect(base.onOperation.mock.calls[0]![0]).toEqual({
    op: 'refresh_pivot',
    sheetId: fixture.sheet.id,
  })
})

it('switches sources without writes, resets dependent fields and rules while retaining name, range and output, and freezes the source while pending', async () => {
  const fixture = await xlsxCrossSheetPivotFixture()
  let finish!: (value: boolean) => void
  const execute = vi.fn<XlsxPivotControlsProps['onOperation']>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const base = {
    ...(await props(execute)),
    sheet: fixture.sheet,
    sheets: fixture.workbook.sheets,
    sourceKey: fixture.bytes,
  }
  const { host } = mount(base)
  type(host, '透视名称', '跨表保留名称')
  type(host, '输出左上角', 'A1')
  pickSelectOption(host, '来源工作表', fixture.source.name)
  expect(selectValueText(host, '行字段 1')).toBe('区域')
  tab(host, '筛选')
  click(host, '添加维度分组')
  click(host, '添加透视筛选')
  click(host, '添加报告筛选字段')
  tab(host, '字段')
  pickSelectOption(host, '来源工作表', '隐藏来源（隐藏）')
  expect(host.textContent).toContain('来源已切换，请确认字段')
  expect(selectValueText(host, '行字段 1')).toBe('隐藏区域')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')!.value).toBe(
    '跨表保留名称',
  )
  expect(host.querySelector<HTMLInputElement>('input[aria-label="输出左上角"]')!.value).toBe('A1')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="源数据范围"]')!.value).toBe(
    'A1:F6',
  )
  tab(host, '筛选')
  expect(host.querySelector('[aria-label="分组字段 1"]')).toBeNull()
  expect(host.querySelector('[aria-label="筛选字段 1"]')).toBeNull()
  expect(host.querySelector('[aria-label="报告筛选字段 1"]')).toBeNull()
  tab(host, '字段')
  const options = openSelect(host, '来源工作表')
  expect(
    options
      .find((item) => item.textContent?.includes('受保护来源'))
      ?.classList.contains('ant-select-item-option-disabled'),
  ).toBe(true)
  expect(execute).not.toHaveBeenCalled()
  click(host, '创建数据透视表')
  expect(selectRoot(host, '来源工作表').classList.contains('ant-select-disabled')).toBe(true)
  expect(execute.mock.calls[0]![0]).toMatchObject({
    sheetId: fixture.workbook.sheets[3]!.id,
    targetSheetId: fixture.sheet.id,
    rowFields: ['隐藏区域'],
    values: [{ field: '隐藏金额' }],
  })
  await act(async () => finish(true))
})

it('keeps a successful own publication and shows the real host failure without discarding the draft', async () => {
  const base = await props(
    vi
      .fn<XlsxPivotControlsProps['onOperation']>()
      .mockRejectedValue(new Error('输出区域含数据验证规则')),
  )
  const ui = mount(base)
  type(ui.host, '输出左上角', 'I1')
  type(ui.host, '透视名称', '失败后保留')
  click(ui.host, '创建数据透视表')
  await act(async () => {
    await Promise.resolve()
  })
  expect(ui.host.querySelector('[role="alert"]')?.textContent).toBe('输出区域含数据验证规则')
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')!.value).toBe(
    '失败后保留',
  )
  let finish!: (value: boolean) => void
  const execute = vi.fn<XlsxPivotControlsProps['onOperation']>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  ui.render({ ...base, onOperation: execute })
  click(ui.host, '创建数据透视表')
  const signal = execute.mock.calls[0]![1].signal
  ui.render({ ...base, onOperation: execute, sourceKey: {}, acceptedSignal: signal })
  expect(signal.aborted).toBe(false)
  await act(async () => finish(true))
  expect(ui.host.querySelector('[role="status"]')?.textContent).toContain('已创建')
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="透视名称"]')!.value).toBe(
    '失败后保留',
  )
})

it('clears obsolete fields and displays the real invalid range issue after selecting an empty source', async () => {
  const fixture = await xlsxCrossSheetPivotFixture()
  const base = { ...(await props()), sheet: fixture.sheet, sheets: fixture.workbook.sheets }
  const ui = mount(base)
  pickSelectOption(ui.host, '来源工作表', fixture.source.name)
  expect(selectValueText(ui.host, '行字段 1')).toBe('区域')
  pickSelectOption(ui.host, '来源工作表', fixture.sheet.name)
  expect(ui.host.querySelector('[aria-label="行字段 1"]')).toBeNull()
  expect(ui.host.querySelector('.mimir-xlsx-pivot__source-issue')?.textContent).toContain(
    '字段标题不能为空',
  )
  expect(button(ui.host, '创建数据透视表').disabled).toBe(true)
  expect(base.onOperation).not.toHaveBeenCalled()
})
