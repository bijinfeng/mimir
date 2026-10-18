import type { DocumentDetail, SearchHit, SearchResponse } from '@mimir/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiRequestError } from '../lib/api'
import { recordRecentDocument } from '../lib/recent-documents'
import { MimirProvider } from '../theme/MimirProvider'
import { CommandPalette } from './CommandPalette'
import type { CommandPaletteProps } from './CommandPalette'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
const note = (id: string) =>
  ({ id, title: `笔记${id}`, kind: 'note', folder: '产品/调研' }) as DocumentDetail
const hit = (id: string, start = 0): SearchHit => ({
  documentId: id,
  title: `结果${id}`,
  kind: 'note',
  path: '产品/调研',
  url: null,
  mime: null,
  size: null,
  snippet: { text: `完整片段${id}`, start, end: start + 5 },
  matchedBy: ['keyword'],
  score: 1,
})
const response = (...hits: SearchHit[]): SearchResponse => ({
  mode: 'keyword',
  channels: ['keyword'],
  tookMs: 0,
  total: hits.length,
  hits,
})
const buttons = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
const button = (name: string) =>
  buttons().find(
    (node) =>
      node.textContent?.replace(/\s/g, '') === name || node.getAttribute('aria-label') === name,
  )!
const input = () => document.querySelector<HTMLInputElement>('[aria-label="搜索文档或输入问题"]')!
const row = (key: string) => document.querySelector<HTMLButtonElement>(`[data-item-key="${key}"]`)!
const type = (value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value)
  input().dispatchEvent(new Event('input', { bubbles: true }))
}
const key = (pressed: string, extra: KeyboardEventInit = {}) =>
  input().dispatchEvent(new KeyboardEvent('keydown', { key: pressed, bubbles: true, ...extra }))
const settle = async (assertion: () => void) =>
  act(async () => {
    await vi.waitFor(assertion)
  })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function renderPalette(overrides: Partial<CommandPaletteProps> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  })
  let props: CommandPaletteProps = {
    open: true,
    userId: 'admin',
    onClose: vi.fn<CommandPaletteProps['onClose']>(),
    onNewNote: vi.fn<CommandPaletteProps['onNewNote']>(),
    onOpenCapture: vi.fn<CommandPaletteProps['onOpenCapture']>(),
    onOpenRecent: vi.fn<CommandPaletteProps['onOpenRecent']>(),
    onOpenSearchHit: vi.fn<CommandPaletteProps['onOpenSearchHit']>(),
    onAsk: vi.fn<CommandPaletteProps['onAsk']>(),
    onCurrentCommand: vi.fn<CommandPaletteProps['onCurrentCommand']>(),
    onReturnToLibrary: vi.fn<CommandPaletteProps['onReturnToLibrary']>(),
    ...overrides,
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = async (next: Partial<CommandPaletteProps> = {}) => {
    props = { ...props, ...next }
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MimirProvider>
            <CommandPalette {...props} />
          </MimirProvider>
        </QueryClientProvider>,
      ),
    )
  }
  await render()
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    host.remove()
  })
  return { props, client, render }
}

it('最近12个ID中的笔记不截成6篇；部分失败保留可用项，403不泄露，重试恢复', async () => {
  for (let index = 0; index < 10; index++) recordRecentDocument('admin', `${index}`)
  const read = vi.spyOn(api.documents, 'get').mockImplementation(async (id) => {
    if (id === '9') throw new ApiRequestError(403, 'FORBIDDEN', '秘密标题')
    if (id === '8') throw new Error('offline')
    return note(id)
  })
  const view = await renderPalette()
  await settle(() => expect(document.body.textContent).toContain('部分笔记暂时无法读取'))
  expect(document.querySelectorAll('[data-item-key^="recent:"]')).toHaveLength(8)
  expect(document.body.textContent).not.toContain('秘密标题')
  await act(async () => row('recent:7').click())
  expect(view.props.onOpenRecent).toHaveBeenCalledWith('7', 'folder:产品/调研')
  expect(view.props.onClose).not.toHaveBeenCalled()
  read.mockImplementation(async (id) => note(id))
  button('重试最近笔记').focus()
  await act(async () => button('重试最近笔记').click())
  expect(document.activeElement).toBe(input())
  await settle(() =>
    expect(document.querySelectorAll('[data-item-key^="recent:"]')).toHaveLength(10),
  )
  expect(document.body.textContent).not.toContain('暂时无法读取')
})

it('最近读取等待、真空、全失败与401明确区分，不用旧标题补回', async () => {
  recordRecentDocument('admin', 'a')
  const read = deferred<DocumentDetail>()
  vi.spyOn(api.documents, 'get').mockReturnValue(read.promise)
  const view = await renderPalette()
  expect(document.body.textContent).toContain('正在读取最近笔记')
  expect(document.body.textContent).not.toContain('还没有最近')
  await act(async () => read.reject(new ApiRequestError(401, 'UNAUTHORIZED', 'secret')))
  await settle(() => expect(document.body.textContent).toContain('登录状态已失效'))
  expect(document.body.textContent).not.toContain('还没有最近')
  expect(row('new-note')).not.toBeNull()
  expect(view.props.onClose).not.toHaveBeenCalled()
})

it('组合输入不发临时搜索，不吞选字方向键/Enter/Esc；确认后才检索，500字边界可见', async () => {
  const search = vi.spyOn(api, 'search').mockResolvedValue(response(hit('a')))
  const view = await renderPalette()
  await act(async () => {
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    type('新建')
    key('ArrowDown', { isComposing: true })
    key('Enter', { isComposing: true })
    key('Escape', { isComposing: true })
  })
  expect(search).not.toHaveBeenCalled()
  expect(view.props.onNewNote).not.toHaveBeenCalled()
  expect(view.props.onClose).not.toHaveBeenCalled()
  expect(row('new-note').getAttribute('aria-current')).toBe('true')
  await act(async () =>
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
  )
  await settle(() => expect(search).toHaveBeenCalledWith({ q: '新建', limit: 6 }))
  expect(input().maxLength).toBe(500)
  await act(async () => type('字'.repeat(500)))
  await settle(() => expect(document.body.textContent).toContain('500/500'))
})

it('搜索中键鼠与Tab按钮同样不可执行；缓存刷新等待/失败有真实反馈，恢复可点且原引用不丢', async () => {
  const first = hit('a', 15)
  vi.spyOn(api, 'search').mockResolvedValue(response(first))
  const view = await renderPalette()
  await act(async () => type('结果'))
  await settle(() => expect(row('hit:a:15:20:0')).not.toBeNull())
  const refresh = deferred<SearchResponse>()
  vi.mocked(api.search).mockReturnValue(refresh.promise)
  let refreshPromise!: Promise<void>
  await act(async () => {
    refreshPromise = view.client.refetchQueries({ queryKey: ['palette-search', '结果'] })
  })
  await settle(() => expect(document.body.textContent).toContain('正在更新搜索结果'))
  expect(row('hit:a:15:20:0').disabled).toBe(true)
  await act(async () => {
    key('Enter')
    row('hit:a:15:20:0').click()
  })
  expect(view.props.onOpenSearchHit).not.toHaveBeenCalled()
  await act(async () => {
    refresh.reject(new Error('offline'))
    await refreshPromise
  })
  await settle(() => expect(document.body.textContent).toContain('更新失败，保留上次结果'))
  expect(row('hit:a:15:20:0').disabled).toBe(false)
  await act(async () => row('hit:a:15:20:0').click())
  expect(view.props.onOpenSearchHit).toHaveBeenCalledWith(first)
  expect(view.props.onClose).not.toHaveBeenCalled()
})

it('异步列表插入保留选中身份、删除可恢复；重复文档片段保持顺序，可查看完整信息', async () => {
  const a = hit('same', 0),
    b = hit('same', 20),
    c = hit('other', 0)
  vi.spyOn(api, 'search').mockResolvedValue(response(a, b))
  const view = await renderPalette()
  await act(async () => type('片段'))
  await settle(() => expect(row('hit:same:20:25:0')).not.toBeNull())
  await act(async () => key('ArrowDown'))
  expect(row('hit:same:20:25:0').getAttribute('aria-current')).toBe('true')
  await act(async () => view.client.setQueryData(['palette-search', '片段'], response(c, a, b)))
  await settle(() => expect(row('hit:other:0:5:0')).not.toBeNull())
  expect(row('hit:same:20:25:0').getAttribute('aria-current')).toBe('true')
  await act(async () => key('Enter'))
  expect(view.props.onOpenSearchHit).toHaveBeenLastCalledWith(b)
  expect(
    Array.from(document.querySelectorAll('[data-item-key^="hit:"]')).map((node) =>
      node.getAttribute('data-item-key'),
    ),
  ).toEqual(['hit:other:0:5:0', 'hit:same:0:5:0', 'hit:same:20:25:0'])
  await act(async () => button('查看完整信息：结果same · 命中 2').click())
  expect(
    document.getElementById(
      button('查看完整信息：结果same · 命中 2').getAttribute('aria-controls')!,
    )?.textContent,
  ).toContain('完整片段same')
  await act(async () => view.client.setQueryData(['palette-search', '片段'], response(c)))
  await settle(() => expect(row('hit:other:0:5:0').getAttribute('aria-current')).toBe('true'))
})

it('查询隔离：旧请求迟到不混入新词，清空恢复命令且重开重置', async () => {
  const old = deferred<SearchResponse>(),
    next = deferred<SearchResponse>()
  vi.spyOn(api, 'search').mockImplementation(({ q }) => (q === '旧词' ? old.promise : next.promise))
  const view = await renderPalette()
  await act(async () => type('旧词'))
  await act(async () => type('新词'))
  await act(async () => next.resolve(response(hit('new'))))
  await settle(() => expect(row('hit:new:0:5:0')).not.toBeNull())
  await act(async () => old.resolve(response(hit('old'))))
  expect(row('hit:old:0:5:0')).toBeNull()
  await act(async () => button('清空搜索').click())
  expect(input().value).toBe('')
  expect(row('new-note')).not.toBeNull()
  await act(async () => type('草稿'))
  await view.render({ open: false })
  await view.render({ open: true })
  expect(input().value).toBe('')
})

it('未匹配Enter不发AI；显式AI仅交接问题；宿主guard取消保留输入，新建pending禁用退出/重试', async () => {
  vi.spyOn(api, 'search').mockResolvedValue(response())
  const view = await renderPalette()
  await act(async () => type('无结果问题'))
  await settle(() => expect(document.body.textContent).toContain('没有匹配'))
  await act(async () => key('Enter'))
  expect(view.props.onAsk).not.toHaveBeenCalled()
  await act(async () => button('带到新对话').click())
  expect(view.props.onAsk).toHaveBeenCalledWith('无结果问题')
  expect(view.props.onClose).not.toHaveBeenCalled()
  expect(input().value).toBe('无结果问题')
  await view.render({ interactionSuspended: true })
  await act(async () => {
    button('关闭搜索').click()
    key('Escape')
    key('k', { ctrlKey: true })
  })
  expect(view.props.onClose).not.toHaveBeenCalled()
  await view.render({ interactionSuspended: false })
  expect(document.activeElement).toBe(input())
  await view.render({ interactionSuspended: false, creatingNote: true })
  expect(input().disabled).toBe(true)
  expect(button('带到新对话').disabled).toBe(true)
  await act(async () => {
    button('关闭搜索').click()
    key('Escape')
  })
  expect(view.props.onClose).not.toHaveBeenCalled()
  await view.render({ creatingNote: false, createNoteError: '创建失败，草稿保留' })
  expect(input().value).toBe('无结果问题')
  await act(async () => button('重试新建笔记').click())
  expect(view.props.onNewNote).toHaveBeenCalledOnce()
})

it('上下文加载与错误不展示猜测的note能力，文件只开放真实命令', async () => {
  const read = deferred<DocumentDetail>()
  vi.spyOn(api.documents, 'get').mockReturnValue(read.promise)
  const view = await renderPalette({ currentDocumentId: 'file' })
  expect(row('rename-current')).toBeNull()
  expect(row('move-current')).toBeNull()
  expect(document.body.textContent).toContain('正在读取当前文档操作')
  await act(async () => read.resolve({ ...note('file'), kind: 'file' }))
  await settle(() => expect(row('move-current')).not.toBeNull())
  expect(row('rename-current')).toBeNull()
  expect(row('search-current')).toBeNull()
  vi.mocked(api.documents.get).mockRejectedValue(new Error('offline'))
  await act(async () => {
    await view.client.refetchQueries({ queryKey: ['document', 'file'] })
  })
  await settle(() => expect(document.body.textContent).toContain('当前文档操作暂时无法读取'))
  expect(row('move-current')).toBeNull()
})

it('有同名命令时搜索等待统一阻断，清空后才可执行；CtrlK/重复键不会穿透到宿主', async () => {
  const search = deferred<SearchResponse>()
  vi.spyOn(api, 'search').mockReturnValue(search.promise)
  const view = await renderPalette()
  const globalToggle = vi.fn<(event: KeyboardEvent) => void>()
  window.addEventListener('keydown', globalToggle)
  try {
    await act(async () => type('新建'))
    expect(row('new-note').disabled).toBe(true)
    await act(async () => {
      key('Enter')
      row('new-note').click()
    })
    expect(view.props.onNewNote).not.toHaveBeenCalled()
    await act(async () => button('清空搜索').click())
    await act(async () => key('Enter', { repeat: true }))
    expect(view.props.onNewNote).not.toHaveBeenCalled()
    await act(async () => key('Enter'))
    expect(view.props.onNewNote).toHaveBeenCalledOnce()
    await act(async () => key('k', { ctrlKey: true, repeat: true }))
    expect(view.props.onClose).not.toHaveBeenCalled()
    globalToggle.mockClear()
    await act(async () => key('k', { ctrlKey: true, altKey: true }))
    expect(view.props.onClose).not.toHaveBeenCalled()
    globalToggle.mockClear()
    await act(async () => key('k', { ctrlKey: true }))
    expect(view.props.onClose).toHaveBeenCalledOnce()
    expect(globalToggle).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('keydown', globalToggle)
  }
})

it('搜索重试立即回到输入框，迟到的成功不会抢走用户后来移动的焦点', async () => {
  vi.spyOn(api, 'search').mockRejectedValueOnce(new Error('offline'))
  await renderPalette()
  await act(async () => type('结果'))
  await settle(() => expect(button('重试搜索')).toBeDefined())
  const retry = deferred<SearchResponse>()
  vi.mocked(api.search).mockReturnValueOnce(retry.promise)
  button('重试搜索').focus()
  await act(async () => button('重试搜索').click())
  expect(document.activeElement).toBe(input())
  const clear = button('清空搜索')
  clear.focus()
  await act(async () => retry.resolve(response(hit('a'))))
  await settle(() => expect(row('hit:a:0:5:0')).not.toBeNull())
  expect(document.activeElement).toBe(clear)
})

it('取消回到可见触发器；宿主动作交接不抢新页面焦点', async () => {
  const trigger = document.createElement('button')
  trigger.setAttribute('data-palette-trigger', '')
  document.body.append(trigger)
  vi.spyOn(trigger, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  trigger.focus()
  const view = await renderPalette()
  await act(async () => button('关闭搜索').click())
  await view.render({ open: false })
  expect(document.activeElement).toBe(trigger)
  trigger.focus()
  await view.render({ open: true })
  const destination = document.createElement('input')
  document.body.append(destination)
  await view.render({ onNewNote: () => destination.focus() })
  await act(async () => row('new-note').click())
  await view.render({ open: false })
  expect(document.activeElement).toBe(destination)
  trigger.remove()
  destination.remove()
})
