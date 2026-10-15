import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import { UploadPanel } from './UploadPanel'

afterEach(() => vi.restoreAllMocks())

it('批量上传完成前不允许打开已上传的文件或开始下一批', async () => {
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
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
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
