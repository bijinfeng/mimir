/** @vitest-environment happy-dom */
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { pickSelectOption, openSelect } from '../shell/antd-test-dom.js'
import { XlsxDataControls } from './XlsxDataControls.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((fn) => fn()))
function mount(
  onOperation = vi.fn<(op: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>>(
    async (_op: Record<string, unknown>, _signal: AbortSignal) => true,
  ),
  range = 'B1:E8',
) {
  const host = document.createElement('div'),
    trigger = document.createElement('button')
  host.className = 'mimir-editor'
  trigger.setAttribute('aria-label', '范围数据操作')
  host.append(trigger)
  document.body.append(host)
  // Root has a separate body so the trigger remains genuinely connected on cleanup.
  const body = document.createElement('div')
  host.append(body)
  const panelRoot = createRoot(body)
  const onClose = vi.fn<() => void>()
  const render = (sourceKey: unknown = 'source', contextKey = 'doc:sheet:0') =>
    act(() =>
      panelRoot.render(
        <ConfigProvider componentSize="small" theme={{ token: { motion: false } }}>
          <XlsxDataControls
            range={range}
            column="B"
            sourceKey={sourceKey}
            contextKey={contextKey}
            busy={false}
            trigger={trigger}
            filterRange="B1:E8"
            onClose={onClose}
            onOperation={onOperation}
          />
        </ConfigProvider>,
      ),
    )
  render()
  cleanups.push(() => {
    act(() => panelRoot.unmount())
    host.remove()
  })
  return {
    host,
    trigger,
    render,
    onClose,
    onOperation,
    unmount: () => act(() => panelRoot.render(null)),
  }
}
function click(host: ParentNode, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) throw new Error(label)
  act(() => button.click())
}
function tab(host: ParentNode, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (b) => b.textContent === label,
  )!
  act(() => button.click())
}
it('offers only selected columns, enforces uniqueness and edits ordered levels with one fixed primary action', async () => {
  const ui = mount()
  expect(ui.host.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  expect(openSelect(ui.host, '第 1 级排序列').map((n) => n.textContent)).toEqual([
    '列 B',
    '列 C',
    '列 D',
    '列 E',
  ])
  pickSelectOption(ui.host, '第 1 级排序顺序', '降序')
  click(ui.host, '添加排序级别')
  const options = openSelect(ui.host, '第 2 级排序列')
  expect(options.find((n) => n.textContent === '列 B')?.className).toContain('disabled')
  pickSelectOption(ui.host, '第 2 级排序列', '列 E')
  click(ui.host, '上移排序级别 2')
  click(ui.host, '应用排序')
  await act(async () => {})
  expect(ui.onOperation).toHaveBeenCalledWith(
    {
      op: 'sort_range_multi',
      range: 'B1:E8',
      rules: [
        { column: 'E', order: 'asc' },
        { column: 'B', order: 'desc' },
      ],
      hasHeader: true,
    },
    expect.any(AbortSignal),
  )
  click(ui.host, '删除排序级别 1')
  click(ui.host, '排序包含标题行')
  click(ui.host, '应用排序')
  await act(async () => {})
  expect(ui.onOperation.mock.calls.at(-1)?.[0]).toMatchObject({
    rules: [{ column: 'B', order: 'desc' }],
    hasHeader: false,
  })
})
it('exposes only current mode fields and cancels pending work when switching tasks', async () => {
  let finish!: (value: boolean) => void
  const onOperation = vi.fn<(op: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>>(
    (_op: Record<string, unknown>, _signal: AbortSignal) =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const ui = mount(onOperation)
  click(ui.host, '应用排序')
  expect(onOperation).toHaveBeenCalledOnce()
  expect(ui.host.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  tab(ui.host, '筛选')
  expect(onOperation.mock.calls[0]![1].aborted).toBe(true)
  expect(ui.host.querySelector('[aria-label="第 1 级排序列"]')).toBeNull()
  pickSelectOption(ui.host, '筛选操作', '设置列保留值')
  expect(ui.host.querySelector('[aria-label="筛选列"]')).not.toBeNull()
  expect(ui.host.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  await act(async () => finish(true))
  expect(ui.host.textContent).not.toContain('已应用')
  tab(ui.host, '替换')
  expect(ui.host.querySelector('[aria-label="筛选列"]')).toBeNull()
  expect(ui.host.querySelector('[aria-label="范围查找文字"]')).not.toBeNull()
})
for (const kind of ['source', 'context', 'close'] as const)
  it(`invalidates ${kind}, aborts work and returns focus to live trigger`, async () => {
    let finish!: (value: boolean) => void
    const onOperation = vi.fn<
      (op: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>
    >(
      (_op: Record<string, unknown>, _signal: AbortSignal) =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        }),
    )
    const ui = mount(onOperation)
    click(ui.host, '应用排序')
    if (kind === 'source') ui.render(new Uint8Array())
    else if (kind === 'context') ui.render('source', 'doc:other:1')
    else ui.unmount()
    if (kind !== 'close') {
      ui.unmount()
    }
    expect(ui.onClose.mock.calls.length).toBe(kind === 'close' ? 0 : 1)
    expect(onOperation.mock.calls[0]![1].aborted).toBe(true)
    expect(document.activeElement).toBe(ui.trigger)
    await act(async () => finish(true))
  })
it('rejects a one-data-row or oversized range before submitting', () => {
  const ui = mount(undefined, 'A1:B2')
  click(ui.host, '应用排序')
  expect(ui.onOperation).not.toHaveBeenCalled()
  expect(ui.host.textContent).toContain('至少包含两行数据')
})

it('keeps a concrete native error in the current Inspector and can retry the same draft', async () => {
  const apply = vi
    .fn<(op: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>>()
    .mockRejectedValueOnce(new Error('排序范围与合并单元格相交'))
    .mockResolvedValue(true)
  const ui = mount(apply)
  click(ui.host, '添加排序级别')
  click(ui.host, '应用排序')
  await act(async () => {})
  expect(ui.host.textContent).toContain('排序范围与合并单元格相交')
  expect(ui.host.querySelectorAll('[aria-label^="排序级别 "]')).toHaveLength(2)
  click(ui.host, '应用排序')
  await act(async () => {})
  expect(apply).toHaveBeenCalledTimes(2)
})

it('independent keyboard check: Escape dismisses the current Select before the Inspector', async () => {
  const ui = mount()
  openSelect(ui.host, '第 1 级排序列')
  const input = ui.host.querySelector<HTMLInputElement>('[aria-label="第 1 级排序列"]')!
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  expect(ui.onClose).not.toHaveBeenCalled()
  // rc-select deliberately closes through a MessageChannel macro task.
  for (let i = 0; i < 30 && input.getAttribute('aria-expanded') !== 'false'; i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  expect(input.getAttribute('aria-expanded')).toBe('false')
  act(() =>
    ui.host.querySelector('aside')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  expect(ui.onClose).toHaveBeenCalledOnce()
})

it('independent bounded draft check: eight levels disable add and every composite input while pending', async () => {
  let finish!: (value: boolean) => void
  const onOperation = vi.fn<(op: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>>(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const ui = mount(onOperation, 'A1:J8')
  for (let i = 1; i < 8; i++) click(ui.host, '添加排序级别')
  expect(ui.host.querySelectorAll('[aria-label^="排序级别 "]')).toHaveLength(8)
  expect(ui.host.querySelector<HTMLButtonElement>('[aria-label="添加排序级别"]')!.disabled).toBe(
    true,
  )
  click(ui.host, '应用排序')
  expect(onOperation).toHaveBeenCalledOnce()
  expect(ui.host.querySelectorAll('.ant-select-disabled')).toHaveLength(16)
  expect(ui.host.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  await act(async () => finish(true))
})
