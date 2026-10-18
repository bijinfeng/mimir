import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SearchHit } from '@mimir/shared'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route } from './_app'
import { api, ApiRequestError } from '../lib/api'
import { useAppShell } from '../lib/app-shell-context'
import { UnsavedProvider, useUnsaved } from '../lib/unsaved'
import { MimirProvider } from '../theme/MimirProvider'
import type { CommandPaletteProps } from '../components/CommandPalette'

const navigation = vi.hoisted(() => ({
  navigate: vi.fn<(options: unknown) => Promise<void>>().mockResolvedValue(),
  search: { scope: 'folder:产品', id: 'origin-note' },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigation.navigate,
  useSearch: () => navigation.search,
  useLocation: () => ({ pathname: '/docs' }),
  Outlet: () => <DocumentHarness />,
}))
vi.mock('../platform', () => ({ useIsDesktop: () => false, useTitleBar: () => null }))
vi.mock('../lib/recent-documents', () => ({ recordRecentDocument: vi.fn<() => void>() }))
vi.mock('../components/CaptureDialog', () => ({ CaptureDialog: () => null }))
vi.mock('../components/NavSidebar', () => ({
  NavSidebar: ({ onOpenPalette }: { onOpenPalette: () => void }) => (
    <button onClick={onOpenPalette}>打开搜索</button>
  ),
}))

const hit = {
  chunkId: 'chunk-2',
  documentId: 'result-note',
  kind: 'note',
  title: '结果笔记',
  snippet: { text: '重复片段', start: 240, end: 244 },
  matchedBy: ['substring'],
} as unknown as SearchHit

// Keep the palette mounted when it closes, just like its real Modal. These
// controls deliberately call the parent even while busy to exercise its locks.
vi.mock('../components/CommandPalette', () => ({
  CommandPalette: (props: CommandPaletteProps) => (
    <section data-palette-open={props.open} hidden={!props.open}>
      <input aria-label="搜索草稿" defaultValue="保留这个输入" />
      <output data-pending>{String(props.creatingNote)}</output>
      <output data-suspended>{String(props.interactionSuspended)}</output>
      <output data-create-retryable>{String(props.createNoteRetryable)}</output>
      <output data-create-error>{props.createNoteError}</output>
      <button onClick={props.onClose}>关闭搜索</button>
      <button onClick={() => void props.onNewNote()}>新建</button>
      <button
        onClick={() => {
          void props.onNewNote()
          void props.onNewNote()
        }}
      >
        快速重复新建
      </button>
      <button onClick={() => props.onAsk('明确的问题')}>带到新对话</button>
      <button onClick={() => props.onOpenSearchHit(hit)}>打开命中</button>
      <button onClick={() => props.onOpenRecent('recent-note', 'folder:研究')}>打开最近</button>
      <button onClick={props.onReturnToLibrary}>返回库</button>
      <button onClick={() => props.onCurrentCommand('rename')}>重命名</button>
    </section>
  ),
}))

function DocumentHarness() {
  const { setDirty, setSave } = useUnsaved()
  const { askDraft, newNoteFocusId, citation } = useAppShell()
  return (
    <>
      <button
        onClick={() => {
          setDirty(true)
          setSave(async () => true)
        }}
      >
        标记未保存
      </button>
      <output data-draft>{JSON.stringify(askDraft)}</output>
      <output data-focus>{newNoteFocusId}</output>
      <output data-citation>{JSON.stringify(citation)}</output>
    </>
  )
}

let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
let client: QueryClient

async function mount() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['session'], {
    user: { id: 'admin', name: 'admin', email: 'admin@example.com' },
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const AppShell = Route.options.component!
  await act(async () =>
    root!.render(
      <MimirProvider>
        <QueryClientProvider client={client}>
          <UnsavedProvider>
            <AppShell />
          </UnsavedProvider>
        </QueryClientProvider>
      </MimirProvider>,
    ),
  )
}

function button(label: string): HTMLButtonElement {
  const node = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (!node) throw new Error(`Missing button: ${label}`)
  return node
}

async function click(label: string) {
  await act(async () => button(label).click())
}

function paletteOpen() {
  return host.querySelector('[data-palette-open]')!.getAttribute('data-palette-open') === 'true'
}

async function shortcut(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  await act(async () => window.dispatchEvent(event))
  return event
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  client?.clear()
  navigation.navigate.mockClear()
  vi.restoreAllMocks()
})

describe('命令面板的应用壳交接', () => {
  it('取消新建确认保留搜索草稿，不创建也不允许其他动作替换确认', async () => {
    const create = vi.spyOn(api.documents, 'createNote')
    await mount()
    await click('打开搜索')
    await click('标记未保存')
    await click('新建')
    expect(create).not.toHaveBeenCalled()
    expect(paletteOpen()).toBe(true)
    expect(host.querySelector('[data-suspended]')?.textContent).toBe('true')
    await shortcut()
    await click('带到新对话')
    await click('继续编辑')
    expect(paletteOpen()).toBe(true)
    expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('保留这个输入')
    expect(host.querySelector('[data-draft]')?.textContent).toBe('null')
    expect(create).not.toHaveBeenCalled()
    expect(navigation.navigate).not.toHaveBeenCalled()
  })

  it('同步单飞守住快速重复；等待不能关闭，失败原处保留输入，成功才交接正文焦点', async () => {
    const request = deferred<Awaited<ReturnType<typeof api.documents.createNote>>>()
    const create = vi.spyOn(api.documents, 'createNote').mockReturnValueOnce(request.promise)
    await mount()
    await click('打开搜索')
    client.setQueryData(['documents', 'all'], { items: [] })
    client.setQueryData(['folders'], { items: [] })
    client.setQueryData(['counts'], { all: 0 })
    await click('快速重复新建')
    expect(create).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-pending]')?.textContent).toBe('true')
    await click('关闭搜索')
    await shortcut()
    expect(paletteOpen()).toBe(true)
    expect(navigation.navigate).not.toHaveBeenCalled()
    await act(async () => request.reject(new TypeError('Network response lost')))
    expect(host.querySelector('[data-pending]')?.textContent).toBe('false')
    expect(host.querySelector('[data-create-error]')?.textContent).toContain('先检查知识库')
    expect(host.querySelector('[data-create-retryable]')?.textContent).toBe('false')
    expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('保留这个输入')
    expect(paletteOpen()).toBe(true)

    create.mockResolvedValueOnce({ id: 'created-note' } as never)
    await click('新建')
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenLastCalledWith({ title: '未命名笔记', body: '', tags: [] })
    expect(paletteOpen()).toBe(false)
    expect(host.querySelector('[data-focus]')?.textContent).toBe('created-note')
    expect(client.getQueryState(['documents', 'all'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['folders'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['counts'])?.isInvalidated).toBe(true)
    expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/docs',
      search: { scope: 'all', id: 'created-note' },
    })
  })

  it('服务端拒绝显示原因；确认保存后才发起新建', async () => {
    const create = vi
      .spyOn(api.documents, 'createNote')
      .mockRejectedValue(new ApiRequestError(403, 'FORBIDDEN', '当前不能新建'))
    await mount()
    await click('打开搜索')
    await click('标记未保存')
    await click('新建')
    expect(create).not.toHaveBeenCalled()
    await click('保存并离开')
    expect(create).toHaveBeenCalledTimes(1)
    expect(paletteOpen()).toBe(true)
    expect(host.querySelector('[data-create-error]')?.textContent).toContain('当前不能新建')
    expect(host.querySelector('[data-create-retryable]')?.textContent).toBe('true')
    expect(navigation.navigate).not.toHaveBeenCalled()
  })

  it('AI取消不写草稿，确认后仅预填文字并保留scope，不附加当前文档或发消息', async () => {
    const conversation = vi.spyOn(api.conversations, 'create')
    await mount()
    await click('打开搜索')
    await click('标记未保存')
    await click('带到新对话')
    expect(host.querySelector('[data-draft]')?.textContent).toBe('null')
    await click('继续编辑')
    expect(host.querySelector('[data-draft]')?.textContent).toBe('null')
    await click('带到新对话')
    await click('丢弃改动')
    expect(JSON.parse(host.querySelector('[data-draft]')!.textContent!)).toEqual({
      text: '明确的问题',
    })
    expect(paletteOpen()).toBe(false)
    expect(conversation).not.toHaveBeenCalled()
    expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/chat',
      search: { scope: 'folder:产品' },
    })
  })

  it.each([
    ['打开命中', { scope: 'all', id: 'result-note' }],
    ['打开最近', { scope: 'folder:研究', id: 'recent-note' }],
    ['返回库', { scope: 'folder:产品' }],
  ])('%s经过确认且取消不丢上下文', async (action, search) => {
    await mount()
    await click('打开搜索')
    await click('标记未保存')
    await click(action)
    await click('继续编辑')
    expect(paletteOpen()).toBe(true)
    expect(navigation.navigate).not.toHaveBeenCalled()
    await click(action)
    await click('丢弃改动')
    expect(paletteOpen()).toBe(false)
    expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith({ to: '/docs', search })
    expect(JSON.parse(host.querySelector('[data-citation]')!.textContent!)).toEqual(
      action === '打开命中'
        ? {
            documentId: 'result-note',
            title: '结果笔记',
            kind: 'note',
            snippet: '重复片段',
            start: 240,
            end: 244,
            matchedBy: ['substring'],
          }
        : null,
    )
  })

  it('组合输入、229、重复与无关快捷键不切换；正常Ctrl/CmdK只切换一次', async () => {
    await mount()
    expect((await shortcut({ isComposing: true })).defaultPrevented).toBe(false)
    expect((await shortcut({ keyCode: 229 })).defaultPrevented).toBe(false)
    expect((await shortcut({ altKey: true })).defaultPrevented).toBe(false)
    expect((await shortcut({ key: 'f' })).defaultPrevented).toBe(false)
    await shortcut({ repeat: true })
    expect(paletteOpen()).toBe(false)
    expect((await shortcut()).defaultPrevented).toBe(true)
    expect(paletteOpen()).toBe(true)
    await shortcut({ repeat: true })
    expect(paletteOpen()).toBe(true)
    await shortcut({ ctrlKey: false, metaKey: true })
    expect(paletteOpen()).toBe(false)
  })

  it('当前命令携带发起文档身份，交接不触发离开确认', async () => {
    const listener = vi.fn<(event: Event) => void>()
    window.addEventListener('mimir:document-command', listener)
    try {
      await mount()
      await click('打开搜索')
      await click('标记未保存')
      await click('重命名')
      expect(paletteOpen()).toBe(false)
      expect(listener).toHaveBeenCalledTimes(1)
      expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
        command: 'rename',
        documentId: 'origin-note',
      })
      expect(document.body.textContent).not.toContain('有改动还没保存')
    } finally {
      window.removeEventListener('mimir:document-command', listener)
    }
  })
})
