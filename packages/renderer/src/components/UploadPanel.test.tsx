import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import { UploadPanel } from './UploadPanel'

afterEach(() => vi.restoreAllMocks())

it('同一轮连续选择不会并发启动两批，完成前不允许打开文件或开始下一批', async () => {
  let finishSecond: ((value: Awaited<ReturnType<typeof api.documents.upload>>) => void) | undefined
  const first = { document: { id: 'first' }, charCount: 10 } as Awaited<
    ReturnType<typeof api.documents.upload>
  >
  const second = { document: { id: 'second' }, charCount: 10 } as Awaited<
    ReturnType<typeof api.documents.upload>
  >
  vi.spyOn(api.documents, 'upload')
    .mockResolvedValueOnce(first)
    .mockImplementationOnce(() => new Promise((resolve) => (finishSecond = resolve)))

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onUploaded = vi.fn<(documentId: string) => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <MimirProvider>
        <UploadPanel onUploaded={onUploaded} />
      </MimirProvider>,
    ),
  )

  const input = host.querySelector('input[type="file"]') as HTMLInputElement
  const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(api.documents.upload).toHaveBeenCalledTimes(2)
  expect(host.textContent).not.toContain('打开《')
  expect(host.textContent).not.toContain('继续上传')
  expect(onUploaded).not.toHaveBeenCalled()

  await act(async () => finishSecond?.(second))
  expect(host.textContent).toContain('打开《')
  expect(host.textContent).toContain('继续上传')
  await act(async () => root.unmount())
  host.remove()
})

it('逐文件失败原因可见，统计成功和失败；全部失败也可继续上传', async () => {
  vi.spyOn(api.documents, 'upload').mockRejectedValue(
    new Error('网络连接中断，请稍后重新选择此文件上传'),
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <MimirProvider>
        <UploadPanel onUploaded={vi.fn<(documentId: string) => void>()} />
      </MimirProvider>,
    ),
  )
  const input = host.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['a'], '很长的文件名称用于检查后缀保留.xlsx')],
  })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain('0 个成功，1 个失败'))
  })
  expect(host.textContent).toContain('网络连接中断，请稍后重新选择此文件上传')
  expect(
    Array.from(host.querySelectorAll('span')).some((span) => span.textContent === '.xlsx'),
  ).toBe(true)
  expect(host.textContent).not.toContain('打开《')
  const next = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === '继续上传',
  )!
  await act(async () => next.click())
  expect(host.querySelector('[aria-label="逐文件上传结果"]')).toBeNull()
  await act(async () => root.unmount())
  host.remove()
})
