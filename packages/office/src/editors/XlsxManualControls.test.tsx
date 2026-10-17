// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { XlsxSheet } from '../xlsx.js'
import { XlsxManualControls } from './XlsxManualControls.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
const sheet: XlsxSheet = {
  id: 'sheet-1',
  name: '数据',
  entry: 'xl/worksheets/sheet1.xml',
  columns: [],
  rows: [],
}
const workbook = { sheets: [sheet] }
function mount(group: 'home' | 'data') {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onOperation = vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(async () => true)
  const render = (range: string, currentWorkbook = workbook) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <XlsxManualControls
            group={group}
            workbook={currentWorkbook}
            sheet={sheet}
            range={range}
            busy={false}
            onOperation={onOperation}
          />
        </ConfigProvider>,
      ),
    )
  render('A1:A3')
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render, onOperation }
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`找不到 ${label}`)
  return node
}
async function click(node: HTMLElement) {
  await act(async () => {
    node.click()
  })
}
it('keeps format capture independent from the Editor clipboard', async () => {
  const app = mount('home')
  await click(button(app.host, '格式刷与清除格式'))
  app.render('C2')
  await click(button(app.host, '拾取所选范围格式'))
  app.render('D2:D4')
  const paint = button(app.host, '应用格式刷到所选范围')
  expect(paint.textContent).toBe('应用格式刷到所选范围')
  await click(paint)
  expect(app.onOperation).toHaveBeenLastCalledWith({
    op: 'copy_format',
    sourceSheetId: 'sheet-1',
    source: 'C2',
    range: 'D2:D4',
  })
})
it('shows a visible fill action that submits the directional operation', async () => {
  const app = mount('data')
  await click(button(app.host, '填充与闪填'))
  const fill = button(app.host, '应用范围填充')
  expect(fill.textContent).toBe('应用范围填充')
  await click(fill)
  expect(app.onOperation).toHaveBeenCalledWith({
    op: 'fill_range',
    source: 'A1:A1',
    target: 'A2:A3',
  })
})
it('previews the actual expanded format target and disables an overflowing target', async () => {
  const app = mount('home')
  app.render('A1:B3')
  await click(button(app.host, '格式刷与清除格式'))
  await click(button(app.host, '拾取所选范围格式'))
  app.render('D5')
  expect(app.host.textContent).toContain('应用到：数据!D5:E7')
  expect(button(app.host, '应用格式刷到所选范围').disabled).toBe(false)
  app.render('XFD1048576')
  expect(app.host.textContent).toContain('格式刷目标超出工作表边界')
  expect(button(app.host, '应用格式刷到所选范围').disabled).toBe(true)
  expect(app.onOperation).not.toHaveBeenCalled()
})
it('rejects invalid selections and describes a changed workbook without claiming the source was edited', async () => {
  const app = mount('home')
  await click(button(app.host, '格式刷与清除格式'))
  await click(button(app.host, '拾取所选范围格式'))
  app.render('not-a-range')
  expect(app.host.textContent).toContain('先选择有效范围')
  expect(button(app.host, '应用格式刷到所选范围').disabled).toBe(true)
  app.render('D5', { ...workbook })
  expect(app.host.textContent).toContain('文档已更新，请重新拾取格式')
  expect(app.host.textContent).not.toContain('源已更改')
  expect(button(app.host, '应用格式刷到所选范围').disabled).toBe(true)
  expect(app.onOperation).not.toHaveBeenCalled()
})
it('keeps the format capture available for retry after the host refuses an operation', async () => {
  const app = mount('home')
  app.onOperation.mockResolvedValueOnce(false)
  await click(button(app.host, '格式刷与清除格式'))
  await click(button(app.host, '拾取所选范围格式'))
  app.render('D5')
  await click(button(app.host, '应用格式刷到所选范围'))
  expect(app.host.textContent).toContain('未应用，请查看编辑器错误说明')
  expect(app.host.textContent).toContain('格式源：数据!A1:A3')
  expect(button(app.host, '应用格式刷到所选范围').disabled).toBe(false)
  await click(button(app.host, '应用格式刷到所选范围'))
  expect(app.host.textContent).toContain('已应用')
  expect(app.onOperation).toHaveBeenCalledTimes(2)
})
