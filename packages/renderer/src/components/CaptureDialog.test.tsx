import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { CaptureResponse } from '@mimir/shared'
import { api, ApiRequestError } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import { CaptureDialog, type CaptureDialogProps } from './CaptureDialog'

const success: CaptureResponse = {
  kind: 'web',
  label: '网页',
  note: '',
  documentId: 'captured-id',
  preview: null,
  stages: [
    { stage: 'fetch', status: 'done', meta: '320 KB' },
    { stage: 'extract', status: 'done', meta: '2,140 字' },
    { stage: 'assets', status: 'done', meta: '无图片' },
    { stage: 'convert', status: 'done' },
  ],
}
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
let client: QueryClient
let props: CaptureDialogProps
function type(value: string) {
  const input = document.querySelector<HTMLInputElement>('#capture-url')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    (item) => item.textContent?.replace(/\s/g, '') === name,
  )!
async function render(next: Partial<CaptureDialogProps> = {}) {
  props = { ...props, ...next }
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <MimirProvider>
          <CaptureDialog {...props} />
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
}
async function mount(next: Partial<CaptureDialogProps> = {}) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  client = new QueryClient()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  props = { open: true, onClose: vi.fn<() => void>(), onCaptured: vi.fn<(id: string) => void>() }
  await render(next)
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  client?.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('完整URL、长度、清除及共享来源规则；组合输入与同帧多次Enter/点击只请求一次', async () => {
  let finish!: (value: CaptureResponse) => void
  const run = vi.spyOn(api.capture, 'run').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount({ folder: '研究/资料' })
  for (const invalid of [
    '  ',
    'example.com',
    'https://',
    `https://example.com/${'a'.repeat(2000)}`,
  ]) {
    await act(async () => type(invalid))
    expect(button('抓取').disabled).toBe(true)
  }
  await act(async () => type('  https://example.com/?next=github.com  '))
  expect(document.getElementById('capture-url-hint')?.textContent).toContain('GitHub 仓库')
  const input = document.querySelector<HTMLInputElement>('#capture-url')!
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    )
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  })
  expect(run).not.toHaveBeenCalled()
  await act(async () => {
    button('抓取').click()
    button('抓取').click()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(run).toHaveBeenCalledExactlyOnceWith('https://example.com/?next=github.com', '研究/资料')
  expect(button('上传文件').disabled).toBe(true)
  expect(button('取消').disabled).toBe(true)
  expect(document.body.textContent).toContain('正在抓取，等待服务器返回')
  expect(document.querySelector('[aria-label="服务器返回的阶段结果"]')).toBeNull()
  await act(async () => finish({ ...success, documentId: null }))
  expect(props.onCaptured).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('未返回文档 ID')
})
it('错误仅标记返回的失败阶段，不伪造前序成功；保留草稿、原请求来源与完整原因', async () => {
  const run = vi
    .spyOn(api.capture, 'run')
    .mockRejectedValueOnce(
      new ApiRequestError(400, 'CAPTURE_FAILED', '正文解析失败', { stage: 'extract' }),
    )
  await mount()
  await act(async () => type('https://example.com/article'))
  await act(async () => button('抓取').click())
  const stages = document.querySelector('[aria-label="服务器返回的阶段结果"]')!
  expect(stages.querySelectorAll('[data-state="done"]')).toHaveLength(0)
  expect(stages.querySelectorAll('[data-state="failed"]')).toHaveLength(1)
  expect(stages.textContent).toContain('未返回状态')
  await act(async () => type('https://mp.weixin.qq.com/s/other'))
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('未能提取正文')
  expect(document.querySelector('[role="alert"]')?.textContent).not.toContain('公众号可能')
  expect(run).toHaveBeenCalledOnce()
})
it('260ms交接锁禁止重复提交/关闭；卸载后清理timer，迟到响应不能打开文档', async () => {
  vi.useFakeTimers()
  let finish!: (value: CaptureResponse) => void
  const run = vi.spyOn(api.capture, 'run').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  await act(async () => type('https://example.com/article'))
  await act(async () => button('抓取').click())
  await act(async () => finish(success))
  expect(button('正在打开…').disabled).toBe(true)
  expect(button('取消').disabled).toBe(true)
  await act(async () => {
    button('正在打开…').click()
    button('取消').click()
    vi.advanceTimersByTime(259)
  })
  expect(props.onCaptured).not.toHaveBeenCalled()
  expect(props.onClose).not.toHaveBeenCalled()
  await act(async () => root!.unmount())
  root = undefined
  await act(async () => vi.advanceTimersByTime(1000))
  expect(props.onCaptured).not.toHaveBeenCalled()
  expect(run).toHaveBeenCalledOnce()
})
it('成功按实际stage/status展示并260ms交接，守卫暂时隐藏再恢复不重传', async () => {
  vi.useFakeTimers()
  const run = vi.spyOn(api.capture, 'run').mockResolvedValue({
    ...success,
    stages: [
      ...success.stages.slice(0, 2),
      { stage: 'assets', status: 'failed', error: '图片不可访问' },
      success.stages[3]!,
    ],
  })
  const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
  await mount()
  await act(async () => type('https://example.com/article'))
  await act(async () => button('抓取').click())
  expect(document.querySelectorAll('[data-state="failed"]')).toHaveLength(1)
  await act(async () => vi.advanceTimersByTime(260))
  expect(props.onCaptured).toHaveBeenCalledExactlyOnceWith('captured-id')
  expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
    expect.arrayContaining([['documents'], ['counts'], ['folders']]),
  )
  await render({ interactionSuspended: true })
  await render({ interactionSuspended: false })
  expect(document.body.textContent).toContain('正文已保存，部分阶段失败')
  await act(async () => button('打开收集的文档').click())
  expect(run).toHaveBeenCalledOnce()
  expect(props.onCaptured).toHaveBeenCalledTimes(2)
})
it('响应丢失提示先核对知识库，清除保持输入焦点', async () => {
  vi.spyOn(api.capture, 'run').mockRejectedValue(new TypeError('Failed to fetch'))
  await mount()
  await act(async () => type('https://example.com/article'))
  await act(async () => button('抓取').click())
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    '未收到响应不代表没有保存',
  )
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="清除链接"]')!.click(),
  )
  expect(document.querySelector<HTMLInputElement>('#capture-url')!.value).toBe('')
  expect(document.activeElement?.id).toBe('capture-url')
})

it('卸载后返回的抓取结果仍刷新库，但不启动交接timer或导航', async () => {
  vi.useFakeTimers()
  let finish!: (value: CaptureResponse) => void
  vi.spyOn(api.capture, 'run').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  await act(async () => type('https://example.com/article'))
  await act(async () => button('抓取').click())
  await act(async () => root!.unmount())
  root = undefined
  await act(async () => finish(success))
  expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
    expect.arrayContaining([['documents'], ['counts'], ['folders']]),
  )
  await act(async () => vi.advanceTimersByTime(260))
  expect(props.onCaptured).not.toHaveBeenCalled()
})
