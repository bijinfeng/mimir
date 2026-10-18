import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { FileUploadResponse, FolderNode } from '@mimir/shared'
import { AppShellContext, type AppShellContextValue } from '../../lib/app-shell-context'
import { UnsavedProvider } from '../../lib/unsaved'
import { api } from '../../lib/api'
import { MimirProvider } from '../../theme/MimirProvider'
import { LibraryView } from './LibraryView'
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn<(options: unknown) => void>(),
}))
const folder: FolderNode = {
  path: '研究',
  name: '研究',
  code: 'LIB123',
  description: '',
  icon: 'science',
  count: 0,
  children: [],
}
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
let client: QueryClient
let batchLocked = false
const claim = vi.fn<() => boolean>(() => {
  if (batchLocked) return false
  batchLocked = true
  return true
})
const release = vi.fn<() => void>(() => {
  batchLocked = false
})
const shell = {
  openDocument: vi.fn<(id: string) => void>(),
  openCapture: vi.fn<() => void>(),
  requestNewNoteFocus: vi.fn<(id: string | null) => void>(),
  claimUploadBatch: claim,
  releaseUploadBatch: release,
} as unknown as AppShellContextValue
async function mount(scope = 'folder:研究') {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(api.folders, 'list').mockResolvedValue({ items: [folder] })
  vi.spyOn(api.documents, 'list').mockResolvedValue({ items: [], total: 0 } as Awaited<
    ReturnType<typeof api.documents.list>
  >)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['folders'], { items: [folder] })
  client.setQueryData(['documents', scope], { items: [], total: 0 })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <MimirProvider>
          <UnsavedProvider>
            <AppShellContext.Provider value={shell}>
              <LibraryView scope={scope} />
            </AppShellContext.Provider>
          </UnsavedProvider>
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
}
function drop(files: File[], types = ['Files']) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files, types, dropEffect: 'none' } })
  ;(host.querySelector('[aria-label="知识库位置"]')?.parentElement ??
    host.querySelector('[aria-label="文档列表"]')?.parentElement ??
    host.querySelector('[data-capture-trigger]')?.closest('div') ??
    host.lastElementChild)!.dispatchEvent(event)
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  client?.clear()
  batchLocked = false
  vi.restoreAllMocks()
  claim.mockClear()
  release.mockClear()
})
it('页面drop同帧只启动一批并显示逐文件结果；完成刷新库/目录/计数，无首个打开', async () => {
  let finish!: (response: FileUploadResponse) => void
  const upload = vi.spyOn(api.documents, 'upload').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const files = [new File(['a'], '报告.pdf')]
  await act(async () => {
    drop(files)
    drop(files)
  })
  expect(upload).toHaveBeenCalledExactlyOnceWith(files[0], '研究')
  expect(host.querySelector('[aria-label="文件导入"]')).not.toBeNull()
  expect(host.textContent).toContain('已结束 0 / 1 项')
  expect(host.textContent).not.toContain('打开《')
  await act(async () =>
    finish({ document: { id: 'saved', kind: 'file' }, charCount: 0 } as FileUploadResponse),
  )
  expect(host.textContent).toContain('1 个成功')
  expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
    expect.arrayContaining([['documents'], ['folders'], ['counts']]),
  )
  expect(release).toHaveBeenCalledOnce()
})
it.each(['folder:研究', 'tag:设计'])('非Files/空列表和非目录范围均不导入：%s', async (scope) => {
  const upload = vi.spyOn(api.documents, 'upload')
  await mount(scope)
  await act(async () => {
    drop([new File(['a'], '报告.pdf')], ['text/plain'])
    drop([])
  })
  if (scope.startsWith('tag:')) await act(async () => drop([new File(['a'], '报告.pdf')]))
  expect(upload).not.toHaveBeenCalled()
  expect(claim).not.toHaveBeenCalled()
})
