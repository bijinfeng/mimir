import type { DocumentDetail } from '@mimir/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiRequestError } from '../../lib/api'
import { recordRecentDocument } from '../../lib/recent-documents'
import { MimirProvider } from '../../theme/MimirProvider'
import { RecentNotes } from './RecentNotes'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('有ID加载不显示空态；暂时失败显示恢复，权限项不泄露，重试后导航仍正常', async () => {
  recordRecentDocument('admin', 'permitted')
  recordRecentDocument('admin', 'forbidden')
  let resolve!: (doc: DocumentDetail) => void
  const note = {
    id: 'permitted',
    title: '研究笔记',
    kind: 'note',
    folder: '产品/调研',
  } as DocumentDetail
  const get = vi.spyOn(api.documents, 'get').mockImplementation((id) =>
    id === 'forbidden'
      ? Promise.reject(new ApiRequestError(403, 'FORBIDDEN', '秘密笔记不能出现在界面'))
      : new Promise((done) => {
          resolve = done
        }),
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const open = vi.fn<(id: string, scope: string) => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MimirProvider>
          <RecentNotes userId="admin" onOpenDocument={open} />
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
  expect(host.textContent).toContain('正在读取最近笔记')
  expect(host.textContent).not.toContain('还没有')
  await act(async () => resolve(note))
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain('研究笔记'))
  })
  expect(host.textContent).not.toContain('秘密笔记')
  get.mockImplementation(async (id) => {
    if (id === 'forbidden') throw new ApiRequestError(403, 'FORBIDDEN', '秘密笔记')
    throw new Error('offline')
  })
  await act(async () => {
    await client.refetchQueries({ queryKey: ['recent-documents'] })
  })
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain('暂时无法读取'))
  })
  expect(host.textContent).not.toContain('研究笔记')
  expect(host.textContent).not.toContain('还没有')
  get.mockImplementation(async (id) => {
    if (id === 'forbidden') throw new ApiRequestError(403, 'FORBIDDEN', '秘密笔记')
    return note
  })
  const retry = Array.from(host.querySelectorAll('button')).find(
    (b) => b.textContent?.replace(/\s/g, '') === '重试',
  )!
  await act(async () => retry.click())
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain('研究笔记'))
  })
  expect(host.textContent).not.toContain('暂时无法读取')
  await act(async () =>
    Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent === '研究笔记')!
      .click(),
  )
  expect(open).toHaveBeenCalledWith('permitted', 'folder:产品/调研')
  await act(async () => root.unmount())
  client.clear()
  host.remove()
})
