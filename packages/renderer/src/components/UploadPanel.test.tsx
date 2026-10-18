import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiRequestError } from '../lib/api'
import { FILE_MAX_BYTES } from '@mimir/shared'
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

it('目录首段及子路径保留；Markdown空正文和原件无正文均成功，完成刷新一次', async () => {
  const upload = vi
    .spyOn(api.documents, 'upload')
    .mockResolvedValueOnce({ document: { id: 'note', kind: 'note' }, charCount: 0 } as Awaited<
      ReturnType<typeof api.documents.upload>
    >)
    .mockResolvedValueOnce({ document: { id: 'original', kind: 'file' }, charCount: 0 } as Awaited<
      ReturnType<typeof api.documents.upload>
    >)
  const complete = vi.fn<() => void>()
  const release = vi.fn<() => void>()
  const first = new File(['---\ntitle: A\n---'], '空正文.md')
  Object.defineProperty(first, 'webkitRelativePath', { value: '论文集/2024/空正文.md' })
  const second = new File(['a'], '设计.fig')
  Object.defineProperty(second, 'webkitRelativePath', { value: '论文集/附件/设计.fig' })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <MimirProvider>
        <UploadPanel
          onUploaded={vi.fn<(id: string) => void>()}
          folder="研究/资料"
          initialFiles={[first, second]}
          onComplete={complete}
          releaseBatch={release}
        />
      </MimirProvider>,
    ),
  )
  expect(upload.mock.calls.map((call) => call[1])).toEqual([
    '研究/资料/论文集/2024',
    '研究/资料/论文集/附件',
  ])
  expect(host.textContent).toContain('笔记已导入，正文为空')
  expect(host.textContent).toContain('原件已保存；可搜索状态见详情')
  expect(host.textContent).toContain('2 个成功')
  expect(complete).toHaveBeenCalledOnce()
  expect(release).toHaveBeenCalledOnce()
  expect(host.querySelectorAll('details')).toHaveLength(2)
  await act(async () => root.unmount())
  host.remove()
})

it('50MiB边界允许，超限不请求，0字节继续由服务端判定；失败不阻止下一个文件', async () => {
  const upload = vi
    .spyOn(api.documents, 'upload')
    .mockRejectedValueOnce(new ApiRequestError(400, 'EMPTY', '文件是空的'))
    .mockResolvedValue({ document: { id: 'saved', kind: 'file' }, charCount: 0 } as Awaited<
      ReturnType<typeof api.documents.upload>
    >)
  const large = new File(['a'], 'too-large.bin')
  Object.defineProperty(large, 'size', { value: FILE_MAX_BYTES + 1 })
  const exact = new File(['a'], 'exact.bin')
  Object.defineProperty(exact, 'size', { value: FILE_MAX_BYTES })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <MimirProvider>
        <UploadPanel
          onUploaded={vi.fn<(id: string) => void>()}
          initialFiles={[large, new File([], 'empty.txt'), exact]}
        />
      </MimirProvider>,
    ),
  )
  expect(upload).toHaveBeenCalledTimes(2)
  expect(upload.mock.calls[1]![0]).toBe(exact)
  expect(host.textContent).toContain('文件太大')
  expect(host.textContent).toContain('文件是空的')
  expect(host.textContent).toContain('1 个成功，2 个失败')
  expect(host.textContent).not.toContain('未收到响应不代表未保存')
  await act(async () => root.unmount())
  host.remove()
})

it('inline复用结果没有首个打开，响应丢失先核对知识库；清结果回库且不自动重传', async () => {
  vi.spyOn(api.documents, 'upload').mockRejectedValue(new TypeError('连接中断，未收到响应'))
  const complete = vi.fn<() => void>()
  const cleared = vi.fn<() => void>()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <MimirProvider>
        <UploadPanel
          inline
          onUploaded={vi.fn<(id: string) => void>()}
          initialFiles={[new File(['a'], '报告.docx')]}
          onComplete={complete}
          onCleared={cleared}
        />
      </MimirProvider>,
    ),
  )
  expect(host.textContent).toContain('未收到响应不代表未保存')
  expect(host.textContent).not.toContain('处理后可重新选择失败文件上传')
  expect(host.querySelector('input[type="file"]')).toBeNull()
  expect(host.querySelector('[data-capture-result-open]')).toBeNull()
  expect(complete).toHaveBeenCalledOnce()
  const next = Array.from(host.querySelectorAll('button')).find(
    (item) => item.textContent === '继续上传',
  )!
  await act(async () => next.click())
  expect(cleared).toHaveBeenCalledOnce()
  expect(api.documents.upload).toHaveBeenCalledOnce()
  await act(async () => root.unmount())
  host.remove()
})
