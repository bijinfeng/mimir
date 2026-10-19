/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { readXlsx } from '../xlsx.js'
import { findXlsxCells, type XlsxFindOptions, type XlsxFindMatch } from '../xlsx-find.js'
import { selectRoot, pickSelectOption, pressMouseDown } from '../shell/antd-test-dom.js'
import { XlsxFindControls } from './XlsxFindControls.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
async function click(host: ParentNode, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
  expect(button).not.toBeNull()
  await act(async () => button.click())
}
function query(host: ParentNode) {
  return host.querySelector<HTMLInputElement>('[aria-label="搜索文字或正则表达式"]')!
}
function type(host: ParentNode, value: string) {
  const input = query(host)
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function mount() {
  const source = new Uint8Array(
    readFileSync(
      join(import.meta.dirname, '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx'),
    ),
  )
  const workbook = await readXlsx(source),
    sheet = workbook.sheets[0]!,
    host = document.createElement('div'),
    root = createRoot(host),
    onSelect = vi.fn<(match: XlsxFindMatch) => void>()
  const find = (args: Record<string, unknown>) => ({
    data: findXlsxCells(workbook, {
      query: args.query as string,
      sheetId: args.sheetId as string | undefined,
      regex: args.regex as boolean,
      errorsOnly: args.errors_only as boolean,
      lookIn: args.look_in as XlsxFindOptions['lookIn'],
      maxResults: args.max_results as number,
    }),
  })
  const inspect = vi.fn<(args: Record<string, unknown>) => Promise<ReturnType<typeof find>>>(
    async (args) => find(args),
  )
  let props = { documentId: 'find-a', sourceKey: source, sheetId: sheet.id, version: 0 }
  document.body.append(host)
  const render = (patch: Partial<typeof props> = {}) => {
    props = { ...props, ...patch }
    act(() => root.render(<XlsxFindControls {...props} inspect={inspect} onSelect={onSelect} />))
  }
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await click(host, '高级查找')
  return { host, render, source, sheet, inspect, find, onSelect }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

it('uses the real workbook search options and exposes address/value navigation without truncating accessible content', async () => {
  const app = await mount()
  type(app.host, '1001')
  pickSelectOption(app.host, '查找内容', '显示值')
  await click(app.host, '搜索工作簿')
  await vi.waitFor(() => expect(app.host.textContent).toContain('找到1项'))
  expect(app.inspect).toHaveBeenCalledWith({
    query: '1001',
    regex: false,
    errors_only: false,
    look_in: 'values',
    sheetId: app.sheet.id,
    max_results: 200,
  })
  const result = app.host.querySelector<HTMLButtonElement>(
    `[aria-label="转到${app.sheet.name}!C3"]`,
  )!
  expect(result.textContent).toContain(`${app.sheet.name}!C3`)
  expect(result.textContent).toContain('1001')
  act(() => result.click())
  expect(app.onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ address: 'C3', text: '1001' }),
  )
  type(app.host, 'not-present')
  expect(app.host.querySelector('ul[aria-label="匹配结果"]')).toBeNull()
  await click(app.host, '搜索工作簿')
  await vi.waitFor(() => expect(app.host.textContent).toContain('找到0项'))
  type(app.host, '[')
  await click(app.host, '使用正则表达式')
  await click(app.host, '搜索工作簿')
  await vi.waitFor(() => expect(app.host.querySelector('[role="alert"]')?.textContent).toBeTruthy())
  expect(app.host.querySelector('ul[aria-label="匹配结果"]')).toBeNull()
})

it('synchronously locks repeated Enter and all pending conditions including Select popups and result navigation', async () => {
  const app = await mount()
  type(app.host, '1001')
  await click(app.host, '搜索工作簿')
  await vi.waitFor(() => expect(app.host.textContent).toContain('找到1项'))
  const result = app.host.querySelector<HTMLButtonElement>(
    `[aria-label="转到${app.sheet.name}!C3"]`,
  )!
  const pending = deferred<ReturnType<typeof app.find>>()
  app.inspect.mockImplementationOnce(() => pending.promise)
  const input = query(app.host)
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(app.inspect).toHaveBeenCalledTimes(2)
  expect(input.closest('fieldset')!.disabled).toBe(true)
  expect(result.disabled).toBe(true)
  act(() => result.click())
  expect(app.onSelect).not.toHaveBeenCalled()
  for (const label of ['查找范围', '查找内容']) {
    const select = selectRoot(app.host, label)
    pressMouseDown(select.querySelector('.ant-select-content') ?? select)
    expect(select.querySelector('[role="combobox"]')?.getAttribute('aria-expanded')).toBe('false')
  }
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="使用正则表达式"]')!.disabled).toBe(
    true,
  )
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="只找公式错误"]')!.disabled).toBe(
    true,
  )
  await act(async () => pending.resolve(app.find({ query: '1001', sheetId: app.sheet.id })))
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="搜索工作簿"]')!.disabled).toBe(
    false,
  )
})

it.each(['source', 'document', 'sheet', 'version'] as const)(
  'invalidates published and pending results on %s change, including A→B→A',
  async (change) => {
    const app = await mount()
    type(app.host, '1001')
    await click(app.host, '搜索工作簿')
    await vi.waitFor(() => expect(app.host.textContent).toContain('找到1项'))
    const pending = deferred<ReturnType<typeof app.find>>()
    app.inspect.mockImplementationOnce(() => pending.promise)
    await click(app.host, '搜索工作簿')
    const next =
      change === 'source'
        ? { sourceKey: app.source.slice() }
        : change === 'document'
          ? { documentId: 'find-b' }
          : change === 'sheet'
            ? { sheetId: 'another-sheet' }
            : { version: 1 }
    app.render(next)
    expect(app.host.querySelector('ul[aria-label="匹配结果"]')).toBeNull()
    expect(query(app.host).value).toBe('1001')
    app.render({ sourceKey: app.source, documentId: 'find-a', sheetId: app.sheet.id, version: 0 })
    await click(app.host, '搜索工作簿')
    await vi.waitFor(() => expect(app.host.textContent).toContain('找到1项'))
    // Even a late failure from the old request cannot clear the successor result.
    await act(async () => pending.reject(new Error('old failure')))
    expect(app.host.textContent).toContain('找到1项')
    expect(app.host.textContent).not.toContain('old failure')
    expect(app.onSelect).not.toHaveBeenCalled()
  },
)

it('keeps the condition draft across close/reopen while a late result cannot revive results or overwrite a new request', async () => {
  const app = await mount()
  type(app.host, '1001')
  const old = deferred<ReturnType<typeof app.find>>(),
    next = deferred<ReturnType<typeof app.find>>()
  app.inspect.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => next.promise)
  await click(app.host, '搜索工作簿')
  act(() =>
    app.host
      .querySelector('[role="menu"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
  )
  expect(query(app.host)).toBeNull()
  await click(app.host, '高级查找')
  expect(query(app.host).value).toBe('1001')
  await click(app.host, '搜索工作簿')
  await act(async () => old.resolve(app.find({ query: '1001' })))
  expect(app.host.textContent).toContain('正在搜索…')
  expect(app.host.querySelector('ul[aria-label="匹配结果"]')).toBeNull()
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="搜索工作簿"]')!.disabled).toBe(
    true,
  )
  await act(async () => next.resolve(app.find({ query: '1001' })))
  expect(app.host.textContent).toContain('找到1项')
})

it('retains full long addresses and cached values while reporting the actual 200-result limit', async () => {
  const app = await mount()
  app.sheet.name = "长中文工作表名称与空格 apostrophe' 的来源"
  const row = app.sheet.rows[0]!,
    text = '长缓存值'.repeat(50)
  app.sheet.rows = Array.from({ length: 201 }, (_, index) => ({
    ...row,
    number: index + 1,
    cells: [{ ...row.cells[0]!, col: 0, text }],
  }))
  type(app.host, '长缓存值')
  pickSelectOption(app.host, '查找范围', '整个工作簿')
  await click(app.host, '搜索工作簿')
  expect(app.inspect.mock.calls.at(-1)?.[0]).not.toHaveProperty('sheetId')
  expect(app.host.textContent).toContain('已显示前200项，请缩小搜索范围')
  expect(app.host.querySelectorAll('ul[aria-label="匹配结果"] li')).toHaveLength(200)
  const first = app.host.querySelector(`[aria-label="转到${app.sheet.name}!A1"]`)!
  expect(first.textContent).toContain(text)
  expect(first.querySelector('[title]')?.getAttribute('title')).toBe(text)
})
