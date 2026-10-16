/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { openPptxForEdit } from '../pptx.js'
import * as output from '../pptx-output.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { PptxOutputControls, type PptxOutputControlsProps } from './PptxOutputControls.js'
const fixture = new Uint8Array(
  readFileSync(
    pathResolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
function mount(props: PptxOutputControlsProps) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (next = props) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <PptxOutputControls {...next} />
        </ConfigProvider>,
      ),
    )
  render()
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render, unmount: () => act(() => root.unmount()) }
}
function button(host: HTMLElement, name: string) {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
}
function click(host: HTMLElement, name: string) {
  act(() => button(host, name).click())
}
function text(host: HTMLElement, name: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
it('downloads the current native copy under the entered name and keeps a single fixed-footer primary label', async () => {
  const session = await openPptxForEdit(fixture)
  const shape = session.slides()[0]!.elements.find((el) => el.type === 'text')!
  session.setText(0, shape.id, [{ runs: [{ text: '最新副本' }] }])
  const download = vi.spyOn(output, 'downloadPptxOutput').mockImplementation(() => {})
  const saveCopy = vi.fn<() => Promise<Uint8Array>>(() => session.save())
  const { host } = mount({
    deck: session.view(),
    active: 0,
    documentId: 'one',
    version: 4,
    saveCopy,
  })
  text(host, '副本文件名', '客户版')
  expect(button(host, '下载 PPTX 副本').textContent).toBe('下载 PPTX 副本')
  expect(button(host, '下载 PPTX 副本').closest('.mimir-pptx-output__footer')).toBeTruthy()
  await act(async () => {
    button(host, '下载 PPTX 副本').click()
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1))
  })
  const file = download.mock.calls[0]![0]
  expect(file.name).toBe('客户版.pptx')
  const reopened = await openPptxForEdit(file.bytes)
  expect(
    reopened
      .slides()[0]!
      .elements.some(
        (el) =>
          el.type === 'text' &&
          el.text?.paragraphs.some((p) => p.runs.some((r) => r.text === '最新副本')),
      ),
  ).toBe(true)
  expect(saveCopy).toHaveBeenCalledTimes(1)
  expect(host.querySelector('[role="status"]')?.textContent).toContain('保存状态不变')
})
it('cancels pending copy and aborts it on version/document changes without any late download', async () => {
  const session = await openPptxForEdit(fixture)
  const pending = deferred<Uint8Array>()
  let signal: AbortSignal | undefined
  const saveCopy = vi.fn<(options: { signal: AbortSignal }) => Promise<Uint8Array>>((options) => {
    signal = options.signal
    return pending.promise
  })
  const download = vi.spyOn(output, 'downloadPptxOutput').mockImplementation(() => {})
  const props = { deck: session.view(), active: 0, documentId: 'one', version: 1, saveCopy }
  const { host, render } = mount(props)
  click(host, '下载 PPTX 副本')
  expect(button(host, '正在准备输出…').disabled).toBe(true)
  expect(button(host, '取消输出').disabled).toBe(false)
  expect(host.querySelector('fieldset')?.disabled).toBe(true)
  await act(async () => {
    button(host, '取消输出').click()
    await Promise.resolve()
  })
  expect(signal?.aborted).toBe(true)
  expect(host.textContent).toContain('输出已取消')
  pending.resolve(new Uint8Array([1]))
  await act(async () => {
    await Promise.resolve()
  })
  expect(download).not.toHaveBeenCalled()
  const second = deferred<Uint8Array>()
  const secondSave = vi.fn<(options: { signal: AbortSignal }) => Promise<Uint8Array>>((options) => {
    signal = options.signal
    return second.promise
  })
  render({ ...props, saveCopy: secondSave })
  click(host, '下载 PPTX 副本')
  await act(async () => {
    render({ ...props, documentId: 'other', version: 2, saveCopy: secondSave })
    await Promise.resolve()
  })
  expect(signal?.aborted).toBe(true)
  second.resolve(new Uint8Array([2]))
  await act(async () => {
    await Promise.resolve()
  })
  expect(download).not.toHaveBeenCalled()
})
it('shows native serialization failure without success and keeps invalid ranges actionable', async () => {
  const session = await openPptxForEdit(fixture)
  const download = vi.spyOn(output, 'downloadPptxOutput').mockImplementation(() => {})
  const { host } = mount({
    deck: session.view(),
    active: 0,
    saveCopy: async () => {
      throw new Error('副本打包失败')
    },
  })
  await act(async () => {
    button(host, '下载 PPTX 副本').click()
    await Promise.resolve()
  })
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('副本打包失败')
  expect(download).not.toHaveBeenCalled()
  pickSelectOption(host, '文件格式', 'SVG 矢量图')
  pickSelectOption(host, '输出页面', '指定页码')

  text(host, '页码范围', '999')
  expect(button(host, '导出文件').disabled).toBe(true)
  expect(host.textContent).toContain('页码须在')
})
it('prints ordered selected notes and exposes all native layouts with a sandboxed actual first-sheet preview', async () => {
  const session = await openPptxForEdit(fixture)
  session.duplicate(0)
  session.duplicate(0)
  const print = vi.spyOn(output, 'printPptx').mockResolvedValue()
  const { host } = mount({
    deck: session.view(),
    active: 1,
    notes: (index) => `备注${index + 1} <script>`,
  })
  pickSelectOption(host, '输出操作', '打印')
  pickSelectOption(host, '输出页面', '指定页码')

  text(host, '页码范围', '3,1')
  pickSelectOption(host, '每页内容', '备注页')
  expect(host.querySelector('iframe')?.style.height).toBe(
    `${Math.ceil((841.68 / 595.44) * 252 + 16)}px`,
  )
  pickSelectOption(host, 'A4 纸张方向', '横向')

  expect(host.textContent).toContain('2 张幻灯片 · 2 张纸')
  const preview = host.querySelector('iframe')!
  expect(preview.getAttribute('sandbox')).toBe('')
  expect(preview.style.height).toBe(`${Math.ceil((595.44 / 841.68) * 252 + 16)}px`)
  expect(preview.srcdoc).toContain('备注1 &lt;script&gt;')
  expect(preview.srcdoc).toContain('841.68pt 595.44pt')
  expect(preview.srcdoc).not.toContain('备注3')
  await act(async () => {
    button(host, '打开打印窗口').click()
    await Promise.resolve()
  })
  expect(print).toHaveBeenCalledWith(
    expect.anything(),
    [0, 2],
    expect.objectContaining({
      layout: 'notes',
      orientation: 'landscape',
      notes: ['备注1 <script>', '备注3 <script>'],
    }),
  )
  for (const label of [
    '讲义 · 每页 2 张',
    '讲义 · 每页 3 张（带横线）',
    '讲义 · 每页 6 张',
    '完整幻灯片',
  ]) {
    pickSelectOption(host, '每页内容', label)
    expect(host.querySelector('iframe')?.srcdoc).toContain('<svg')
  }
})
