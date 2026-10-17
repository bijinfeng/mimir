/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { XlsxFillControls, type XlsxFillControlsProps } from './XlsxFillControls.js'
import { pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'
import { xlsxFillFixture } from './xlsx-fill-test-fixture.js'
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
function mount(base: XlsxFillControlsProps) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  const render = (nextProps: XlsxFillControlsProps) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <div className="mimir-editor">
            <XlsxFillControls {...nextProps} />
            <div className="mimir-editor__body">
              <div className="me-scroll">表格画布</div>
            </div>
          </div>
        </ConfigProvider>,
      ),
    )
  render(base)
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
function button(host: HTMLElement, label: string) {
  const b = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!b) throw new Error(`Missing ${label}`)
  return b
}
const click = (host: HTMLElement, label: string) => act(() => button(host, label).click())
function number(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
}
async function props(onApply = vi.fn<XlsxFillControlsProps['onApply']>().mockResolvedValue(true)) {
  const fixture = await xlsxFillFixture()
  return {
    cells: fixture.sheet.rows[0]!.cells.slice(0, 2),
    range: 'A1:B1',
    sourceKey: fixture.bytes,
    contextKey: 'doc/sheet/A1:B1',
    palette: fixture.workbook.themePalette,
    onApply,
  }
}
it('shows inherited current values, all patterns, theme/tint, rectangular path and 2–10 stable stops in a fixed-action Inspector', async () => {
  const base = await props(),
    ui = mount(base),
    host = ui.host
  click(host, '范围填充')
  expect(host.querySelector('.mimir-xlsx-fill')).not.toBeNull()
  expect(button(host, '应用填充').textContent).toBe('应用填充')
  expect(host.textContent).toContain('纯色 · 继承样式')
  expect(selectValueText(host, '填充来源')).toBe('文档主题色')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="填充明暗（%）"]')?.value).toBe(
    '40',
  )
  pickSelectOption(host, '填充类型', '图案')
  pickSelectOption(host, '填充图案', '深色斜网格')
  pickSelectOption(host, '前景主题色', '强调 3')
  number(host, '前景明暗（%）', '-25')
  click(host, '应用填充')
  await act(async () => {
    await Promise.resolve()
  })
  expect(base.onApply.mock.calls[0]![0]).toEqual({
    pattern: 'darkTrellis',
    fg: { theme: 6, tint: -0.25 },
    bg: { theme: 0 },
  })
  pickSelectOption(host, '填充类型', '路径渐变')
  number(host, '距左边（%）', '20')
  number(host, '距右边（%）', '70')
  for (let i = 0; i < 8; i++) click(host, '添加渐变色标')
  expect(button(host, '添加渐变色标').disabled).toBe(true)
  expect(host.querySelectorAll('.mimir-xlsx-fill__stop')).toHaveLength(10)
  click(host, '删除色标 2')
  click(host, '添加渐变色标')
  number(host, '色标 10 位置（%）', '65')
  click(host, '应用填充')
  await act(async () => {
    await Promise.resolve()
  })
  expect(base.onApply.mock.calls[1]![0]).toMatchObject({
    gradient: { type: 'path', left: 0.2, right: 0.7, stops: expect.any(Array) },
  })
  expect(
    (
      base.onApply.mock.calls[1]![0] as { gradient: { stops: { position: number }[] } }
    ).gradient.stops.at(-1)?.position,
  ).toBe(0.65)
  expect(
    host.querySelector('.mimir-xlsx-fill__footer button[aria-label="应用填充"]'),
  ).not.toBeNull()
})
it('locks all inputs and duplicate clicks during apply, retains failed drafts, and sends explicit null for clear', async () => {
  let finish!: (ok: boolean) => void
  const execute = vi.fn<XlsxFillControlsProps['onApply']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    base = await props(execute),
    ui = mount(base)
  click(ui.host, '范围填充')
  pickSelectOption(ui.host, '填充类型', '线性渐变')
  number(ui.host, '渐变角度（°）', '237')
  act(() => {
    button(ui.host, '应用填充').click()
    button(ui.host, '应用填充').click()
  })
  expect(execute).toHaveBeenCalledOnce()
  expect(button(ui.host, '正在应用填充').textContent).toBe('正在应用填充')
  expect(ui.host.querySelectorAll('.ant-select-disabled').length).toBeGreaterThan(0)
  ui.render({ ...base, busy: true })
  expect(execute.mock.calls[0]![1].signal.aborted).toBe(false)
  await act(async () => finish(false))
  ui.render(base)
  expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('配置已保留')
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="渐变角度（°）"]')?.value).toBe(
    '237',
  )
  pickSelectOption(ui.host, '填充类型', '无填充')
  click(ui.host, '应用填充')
  expect(execute.mock.calls[1]![0]).toBeNull()
  await act(async () => finish(true))
})
it.each(['source', 'context', 'unmount', 'close', 'objects'])(
  'cancels %s invalidation and never revives old drafts on A→B→A',
  async (mode) => {
    let finish!: (ok: boolean) => void
    const execute = vi.fn<XlsxFillControlsProps['onApply']>(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      ),
      base = await props(execute),
      ui = mount(base)
    click(ui.host, '范围填充')
    pickSelectOption(ui.host, '填充类型', '线性渐变')
    click(ui.host, '应用填充')
    const signal = execute.mock.calls[0]![1].signal
    if (mode === 'unmount') ui.dispose()
    else if (mode === 'close') click(ui.host, '关闭填充设置')
    else
      ui.render({
        ...base,
        ...(mode === 'source'
          ? { sourceKey: {} }
          : mode === 'context'
            ? { contextKey: 'other' }
            : { inspector: 'objects' }),
      })
    expect(signal.aborted).toBe(true)
    await act(async () => finish(true))
    expect(ui.host.querySelector('[aria-label="范围填充设置"]')).toBeNull()
    let reopened: string | null = null
    if (mode !== 'unmount') {
      ui.render(base)
      click(ui.host, '范围填充')
      reopened = selectValueText(ui.host, '填充类型')
    }
    expect(reopened).toBe(mode === 'unmount' ? null : '纯色')
  },
)
it('makes mixed and unsupported current states readable and restores keyboard focus on Escape', async () => {
  const base = await props(),
    ui = mount({
      ...base,
      cells: [
        base.cells[0]!,
        { ...base.cells[1]!, format: { fill: { spec: null, source: 'direct' } } },
      ],
    })
  click(ui.host, '范围填充')
  expect(ui.host.textContent).toContain('当前：混合填充')
  const panel = ui.host.querySelector<HTMLElement>('[aria-label="范围填充设置"]')!
  act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.activeElement).toBe(button(ui.host, '范围填充'))
  ui.render({
    ...base,
    contextKey: 'unsupported',
    cells: [
      {
        ...base.cells[0]!,
        format: {
          fill: { spec: null, source: 'direct', unsupported: '原件使用索引色，应用会替换' },
        },
      },
    ],
  })
  click(ui.host, '范围填充')
  expect(ui.host.textContent).toContain('原件使用索引色')
})

it('accepts arbitrary HEX and prevents invalid RGB drafts from applying', async () => {
  const base = await props(),
    ui = mount(base)
  click(ui.host, '范围填充')
  pickSelectOption(ui.host, '填充来源', '自定义颜色')
  const input = ui.host.querySelector<HTMLInputElement>('input[aria-label="填充色值（#RRGGBB）"]')!
  const type = (value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
  }
  type('#12')
  expect(button(ui.host, '应用填充').disabled).toBe(true)
  expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('#RRGGBB')
  click(ui.host, '应用填充')
  expect(base.onApply).not.toHaveBeenCalled()
  type('#1a2b3c')
  expect(button(ui.host, '应用填充').disabled).toBe(false)
  click(ui.host, '应用填充')
  await act(async () => {
    await Promise.resolve()
  })
  expect(base.onApply.mock.calls[0]![0]).toMatchObject({ pattern: 'solid', fg: '#1A2B3C' })
})
