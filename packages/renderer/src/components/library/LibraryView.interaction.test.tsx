import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { DocumentSummary, FolderNode } from '@mimir/shared'
import { AppShellContext, type AppShellContextValue } from '../../lib/app-shell-context'
import { UnsavedProvider } from '../../lib/unsaved'
import { api, ApiRequestError } from '../../lib/api'
import { MimirProvider } from '../../theme/MimirProvider'
import { LibraryView } from './LibraryView'
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn<(options: unknown) => void>(),
}))
const child: FolderNode = {
  path: '研究/参考',
  name: '参考',
  code: null,
  description: null,
  icon: 'science',
  count: 2,
  children: [],
}
const folder: FolderNode = {
  ...child,
  path: '研究',
  name: '研究',
  code: 'ROOT123',
  description: '知识库说明',
  children: [child],
}
const doc: DocumentSummary = {
  id: 'note-1',
  kind: 'note',
  status: 'ready',
  title: '旧范围笔记',
  excerpt: '摘要',
  tags: [],
  path: null,
  url: null,
  mime: null,
  fileExtension: null,
  size: null,
  folder: '研究',
  createdAt: '2026-10-18T00:00:00Z',
  updatedAt: '2026-10-18T00:00:00Z',
}
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
let client: QueryClient
let scopeValue: string
const shell = {
  openDocument: vi.fn<(id: string) => void>(),
  openCapture: vi.fn<() => void>(),
  requestNewNoteFocus: vi.fn<(id: string | null) => void>(),
} as unknown as AppShellContextValue
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.replace(/\s/g, '') === text,
  )!
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function renderScope(scope: string) {
  scopeValue = scope
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <MimirProvider>
          <UnsavedProvider>
            <AppShellContext.Provider value={shell}>
              <LibraryView scope={scopeValue} />
            </AppShellContext.Provider>
          </UnsavedProvider>
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
}
async function mount(scope = 'folder:研究', items: DocumentSummary[] = [doc], roots = [folder]) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(api.folders, 'list').mockResolvedValue({ items: roots })
  vi.spyOn(api.documents, 'list').mockResolvedValue({ items })
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['folders'], { items: roots })
  client.setQueryData(['documents', scope], { items, sourceScope: scope })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await renderScope(scope)
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  client?.clear()
  vi.restoreAllMocks()
})
it('缺失子目录保留根知识库身份并显示准确返回入口，不误显示空目录', async () => {
  await mount('folder:研究/已删除', [])
  expect(host.querySelector('h1')?.textContent).toBe('研究')
  expect(host.textContent).toContain('这个目录不存在')
  expect(button('返回知识库根目录')).toBeDefined()
  expect(host.textContent).not.toContain('这里还是空的')
})
it('最后知识库已删除的旧scope显示创建恢复，不误显示空目录', async () => {
  await mount('folder:研究', [], [])
  expect(host.textContent).toContain('这个知识库不存在')
  await act(async () => button('创建知识库').click())
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('名称')
})
it('空标签说明如何添加标签，不提供不存在的上传目标', async () => {
  await mount('tag:设计', [])
  expect(host.textContent).toContain('还没有带「设计」标签的文档')
  expect(host.textContent).toContain('可在文档中添加这个标签')
  expect(button('上传文件')).toBeUndefined()
})
it('scope切换保留旧列表时明确旧来源，失败不会把旧结果说成新目录结果', async () => {
  await mount()
  let fail!: (reason: unknown) => void
  vi.mocked(api.documents.list).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      }),
  )
  await renderScope('folder:研究/参考')
  expect(host.textContent).toContain('以下内容仍来自「研究」')
  expect(host.textContent).toContain('旧范围笔记')
  await act(async () => fail(new Error('离线')))
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain('文档列表读取失败'))
  })
  expect(host.textContent).not.toContain('旧范围笔记')
})
it('同scope刷新失败保留上次内容并提供重读入口', async () => {
  await mount()
  vi.mocked(api.documents.list).mockRejectedValue(new Error('离线'))
  await act(async () => {
    await client.refetchQueries({ queryKey: ['documents', 'folder:研究'] })
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  expect(host.textContent).toContain('刷新失败，保留上一次读取的内容')
  expect(host.textContent).toContain('旧范围笔记')
  expect(button('重新读取')).toBeDefined()
})
it('目录重命名沿目标父级；不安全补偿阻断旧路径重试并保留名称', async () => {
  const move = vi.spyOn(api.folders, 'move').mockRejectedValue(
    new ApiRequestError(500, 'FOLDER_UPDATE_FAILED', '补偿失败', {
      recovery: { code: null, path: '研究/参考', description: null, retrySafe: false },
    }),
  )
  await mount()
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="文件夹 参考 的操作"]')!.click()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((node) => node.textContent === '重命名')!
      .click(),
  )
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
  await act(async () => {
    type(input, '归档')
    button('重命名').click()
  })
  expect(move).toHaveBeenCalledExactlyOnceWith('研究/参考', '研究/归档')
  expect(input.value).toBe('归档')
  expect(button('重试').disabled).toBe(true)
})
it('删除目录说明实际清空归属并准确绑定被操作对象与数量', async () => {
  const remove = vi.spyOn(api.folders, 'remove').mockResolvedValue({ cleared: 2 })
  await mount()
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="文件夹 参考 的操作"]')!.click()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((node) => node.textContent === '删除')!
      .click(),
  )
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('删除文件夹「参考」')
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    '2 篇文档会保留，但目录归属将被清空，不再显示在当前知识库中',
  )
  expect(remove).not.toHaveBeenCalled()
  await act(async () => button('取消').click())
  expect(remove).not.toHaveBeenCalled()
})

it('缓存目录刷新失败保留列表，标签结果不被无关目录错误遮挡', async () => {
  await mount()
  vi.mocked(api.folders.list).mockRejectedValue(new Error('目录服务离线'))
  await act(async () => {
    await client.refetchQueries({ queryKey: ['folders'] })
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  expect(host.textContent).toContain('目录刷新失败，保留上一次读取的目录')
  expect(host.textContent).toContain('旧范围笔记')
  expect(button('重新读取目录')).toBeDefined()
  client.setQueryData(['documents', 'tag:设计'], { items: [doc], sourceScope: 'tag:设计' })
  await renderScope('tag:设计')
  expect(host.textContent).toContain('旧范围笔记')
  expect(host.textContent).not.toContain('文档列表读取失败')
  expect(host.textContent).not.toContain('目录刷新失败')
})
it('标签切到目录等待时不混入新目录子项，也不重写旧资料的来源', async () => {
  await mount('tag:设计')
  vi.mocked(api.documents.list).mockImplementationOnce(() => new Promise(() => {}))
  await renderScope('folder:研究')
  expect(host.textContent).toContain('以下内容仍来自「设计」')
  expect(host.textContent).toContain('旧范围笔记')
  expect(host.querySelector('[aria-label="文件夹 参考 的操作"]')).toBeNull()
  expect(host.textContent).not.toContain('当前目录 · 摘要')
})

it('新建笔记同帧单飞，成功后才聚焦打开并刷新浏览数据', async () => {
  let finish!: (value: Awaited<ReturnType<typeof api.documents.createNote>>) => void
  const create = vi.spyOn(api.documents, 'createNote').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  await act(async () => {
    button('新建文件').click()
    button('新建文件').click()
  })
  expect(create).toHaveBeenCalledOnce()
  await act(async () =>
    finish({ ...doc, id: 'created-note' } as Awaited<ReturnType<typeof api.documents.createNote>>),
  )
  expect(shell.requestNewNoteFocus).toHaveBeenCalledWith('created-note')
  expect(shell.openDocument).toHaveBeenCalledWith('created-note')
  expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toContainEqual(['documents'])
})
it.each([
  ['note', '文件保留在回收站'],
  ['file', '记录与原件都会删除'],
  ['web', '这条资料记录及正文将被删除'],
] as const)('删除%s使用实际类型后果，不混淆原件/回收站/资料记录', async (kind, consequence) => {
  await mount('folder:研究', [{ ...doc, kind }])
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="旧范围笔记 的更多操作"]')!.click()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((node) => node.textContent === '删除')!
      .click(),
  )
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(consequence)
})
