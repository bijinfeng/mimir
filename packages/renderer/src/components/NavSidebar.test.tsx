import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavSidebar } from './NavSidebar'
import type { NavSelection } from './NavSidebar'
import { api } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import { UnsavedProvider, useUnsaved } from '../lib/unsaved'
import { UnsavedGuard } from './UnsavedGuard'
import { getThemeMode, setThemeMode, THEME_MODE_LABELS } from '../theme/appearance'

const navigate = vi.fn<(options: unknown) => void>()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('../lib/recent-documents', () => ({
  useRecentDocuments: () => ({
    data: [{ id: 'recent-1', kind: 'note', title: '最近草稿', folder: '产品' }],
  }),
}))

let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
let client: QueryClient

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (check()) return
    await settle()
  }
  expect(check()).toBe(true)
}

function DirtyControl() {
  const { setDirty, setSave } = useUnsaved()
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDirty(true)
          setSave(async () => false)
        }}
      >
        标记保存失败
      </button>
      <button
        type="button"
        onClick={() => {
          setDirty(true)
          setSave(async () => false, 'auto')
        }}
      >
        标记自动保存中
      </button>
      <button
        type="button"
        onClick={() => {
          setDirty(true)
          setSave(async () => true)
        }}
      >
        标记未保存
      </button>
    </>
  )
}

async function mount(
  narrow = false,
  customize?: (queryClient: QueryClient) => void,
  selection: NavSelection = { page: 'docs', scope: 'folder:产品' },
) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['folders'], {
    items: [{ path: '产品', name: '产品', count: 2, children: [] }],
  })
  client.setQueryData(['conversations'], {
    items: [{ id: 'conversation-1', title: '设计讨论', updatedAt: '2026-10-17T00:00:00Z' }],
  })
  client.setQueryData(['session'], {
    user: { id: 'admin', name: 'admin', email: 'admin@example.com' },
  })
  client.setQueryData(['config'], { localMode: true })
  customize?.(client)

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <MimirProvider>
        <QueryClientProvider client={client}>
          <UnsavedProvider>
            <NavSidebar
              selection={selection}
              collapsed={narrow}
              narrowViewport={narrow}
              overlayOpen={open}
              onToggleOverlay={() => setOpen((value) => !value)}
              onCloseOverlay={() => setOpen(false)}
              onToggleCollapsed={vi.fn<() => void>()}
              onOpenCapture={vi.fn<() => void>()}
              onOpenPalette={vi.fn<() => void>()}
              onOpenDocument={vi.fn<() => void>()}
            />
            <button type="button">内容区</button>
            <DirtyControl />
            <UnsavedGuard />
          </UnsavedProvider>
        </QueryClientProvider>
      </MimirProvider>
    )
  }
  await act(async () => root!.render(<Harness />))
  await settle()
}

function button(label: string, container: ParentNode = document): HTMLButtonElement {
  const result = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) =>
      node.getAttribute('aria-label') === label ||
      node.textContent?.replace(/\s/g, '') === label.replace(/\s/g, ''),
  )
  if (!result) throw new Error(`找不到按钮：${label}`)
  return result
}

async function click(node: HTMLElement) {
  await act(async () => node.click())
  await settle()
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  client?.clear()
  setThemeMode('auto')
  navigate.mockReset()
  vi.restoreAllMocks()
})

describe('统一工作区导航', () => {
  it('级联主题选择关闭全部弹层，重新打开显示当前勾选', async () => {
    setThemeMode('light')
    await mount()
    for (const mode of ['dark', 'light', 'auto', 'auto'] as const) {
      await click(button('admin，账号菜单'))
      const title = document.querySelector<HTMLElement>('.ant-dropdown-menu-submenu-title')!
      expect(title).not.toBeNull()
      await act(async () => title.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
      await waitFor(() => title.getAttribute('aria-expanded') === 'true')
      const selected = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (node) => node.textContent === THEME_MODE_LABELS[getThemeMode()],
      )!
      expect(selected.querySelector('.lucide-check')).not.toBeNull()
      const target = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (node) => node.textContent === THEME_MODE_LABELS[mode],
      )!
      await click(target)
      expect(getThemeMode()).toBe(mode)
      expect(title.getAttribute('aria-expanded')).toBe('false')
      // happy-dom 不执行 CSS 动画，补发浏览器的离场完成事件。
      await act(async () => {
        for (const popup of document.querySelectorAll(
          '.ant-dropdown, .ant-dropdown-menu-submenu-popup',
        )) {
          popup.dispatchEvent(new Event('animationend', { bubbles: true }))
        }
      })
      await settle()
      await waitFor(() => document.querySelector('.ant-dropdown-menu-submenu-popup') === null)
      expect(document.querySelector('.ant-dropdown')).toBeNull()
    }
  })

  it('展开态每个主入口只有一份，目录与会话同时可达', async () => {
    await mount()
    expect(document.querySelectorAll('[aria-label="主导航"]')).toHaveLength(1)
    expect(
      [...host.querySelectorAll('button')].filter((node) => node.textContent === '新建对话'),
    ).toHaveLength(1)
    expect(button('知识库').getAttribute('aria-current')).toBe('page')
    expect(host.textContent).toContain('产品')
    expect(host.textContent).toContain('设计讨论')
    expect(host.textContent).toContain('最近笔记')
    await click(button('新建对话'))
    expect(navigate).toHaveBeenCalledWith({ to: '/chat', search: { scope: 'all' } })
  })

  it('窄屏覆盖进入焦点，X关闭并恢复触发点，释放滚动锁', async () => {
    await mount(true)
    const trigger = button('展开侧边栏')
    await click(trigger)
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    await waitFor(() => document.activeElement === button('关闭侧边栏', dialog))
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(getComputedStyle(document.body).overflowY).toBe('hidden')

    expect(document.querySelector('[aria-label="主导航"] [inert]')).not.toBeNull()
    await click(button('关闭侧边栏', dialog))
    await waitFor(() => document.activeElement === trigger)
    expect(document.activeElement).toBe(trigger)
    expect(document.querySelector('[aria-label="主导航"] [inert]')).toBeNull()
    expect(getComputedStyle(document.body).overflowY).not.toBe('hidden')
  })

  it('窄屏 Escape 与遮罩均可关闭', async () => {
    await mount(true)
    const trigger = button('展开侧边栏')
    await click(trigger)
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
      ),
    )
    await waitFor(() => document.activeElement === trigger)
    expect(document.activeElement).toBe(trigger)
    await click(trigger)
    const mask = document.querySelector<HTMLElement>('.ant-drawer-mask')!
    expect(mask).not.toBeNull()
    await click(mask)
    await waitFor(() => document.activeElement === trigger)
    expect(document.activeElement).toBe(trigger)
  })
  it('窄屏抽屉首尾 Tab 循环，阻止焦点进入浏览器外部', async () => {
    await mount(true)
    await click(button('展开侧边栏'))
    const drawer = document.querySelector<HTMLElement>('.ant-drawer')!
    const first = button('关闭侧边栏', drawer)
    const last = button('设置', drawer)
    const rect = new DOMRect(0, 0, 44, 44)
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
      0: rect,
      length: 1,
      item: () => rect,
      [Symbol.iterator]: () => [rect].values(),
    })
    await waitFor(() => document.activeElement === first)
    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => first.dispatchEvent(backward))
    expect(backward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    const forward = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    await act(async () => last.dispatchEvent(forward))
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('未保存导航取消后保留抽屉，并把焦点还给原导航项', async () => {
    await mount(true)
    await click(button('标记未保存'))
    await click(button('展开侧边栏'))
    const drawer = document.querySelector<HTMLElement>('.ant-drawer')!
    const entry = button('新建对话', drawer)
    await click(entry)
    expect(drawer.classList.contains('ant-drawer-open')).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    await click(button('继续编辑', document.querySelector('.ant-modal')!))
    await waitFor(() => document.activeElement === entry)
    expect(drawer.classList.contains('ant-drawer-open')).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each(['丢弃改动', '保存并离开'])('未保存导航仅在%s获准后关闭抽屉并导航', async (choice) => {
    await mount(true)
    await click(button('标记未保存'))
    await click(button('展开侧边栏'))
    const drawer = document.querySelector<HTMLElement>('.ant-drawer')!
    await click(button('新建对话', drawer))
    expect(drawer.classList.contains('ant-drawer-open')).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    await click(button(choice, document.querySelector('.ant-modal')!))
    await waitFor(() => !drawer.classList.contains('ant-drawer-open'))
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/chat', search: { scope: 'all' } })
  })

  it('最近笔记同样遵守未保存取消，保持导航上下文', async () => {
    await mount(true)
    await click(button('标记未保存'))
    await click(button('展开侧边栏'))
    const drawer = document.querySelector<HTMLElement>('.ant-drawer')!
    const recent = button('最近草稿', drawer)
    await click(recent)
    expect(drawer.classList.contains('ant-drawer-open')).toBe(true)
    await click(button('继续编辑', document.querySelector('.ant-modal')!))
    await waitFor(() => document.activeElement === recent)
    expect(drawer.classList.contains('ant-drawer-open')).toBe(true)
  })
})

function menuItem(label: string): HTMLElement {
  const result = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (node) => node.textContent === label,
  )
  if (!result) throw new Error(`找不到菜单项：${label}`)
  return result
}

describe('工作区读取恢复与账户保护', () => {
  it('对话首次读取有加载状态，失败可原处重试', async () => {
    let reject!: (reason: Error) => void
    const list = vi
      .spyOn(api.conversations, 'list')
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail
          }),
      )
      .mockResolvedValue({ items: [] })
    await mount(false, (queryClient) => queryClient.removeQueries({ queryKey: ['conversations'] }))
    expect(host.textContent).toContain('正在读取对话…')
    expect(host.textContent).not.toContain('暂无对话')
    await act(async () => reject(new Error('offline')))
    await waitFor(() => host.textContent!.includes('对话读取失败'))
    const feedback = [...host.querySelectorAll('div')].find(
      (node) => node.textContent === '对话读取失败重试',
    )!
    await click(button('重试', feedback))
    await waitFor(() => host.textContent!.includes('暂无对话'))
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('对话后台刷新失败保留已有会话和当前位置', async () => {
    vi.spyOn(api.conversations, 'list').mockRejectedValue(new Error('offline'))
    await mount()
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['conversations'] })
    })
    await waitFor(() => host.textContent!.includes('对话刷新失败'))
    expect(host.textContent).toContain('设计讨论')
    expect(host.textContent).not.toContain('暂无对话')
  })

  it('独立session加载/失败均保留设置，重试后恢复账号', async () => {
    let reject!: (reason: Error) => void
    const session = vi
      .spyOn(api.auth, 'session')
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail
          }),
      )
      .mockResolvedValue({
        user: { id: 'admin', name: 'admin', email: 'admin@example.com' },
      } as never)
    await mount(false, (queryClient) => queryClient.removeQueries({ queryKey: ['session'] }))
    expect(button('正在读取账号…')).toBeTruthy()
    expect(button('设置')).toBeTruthy()
    await act(async () => reject(new Error('offline')))
    await waitFor(() => host.textContent!.includes('账号读取失败，重试'))
    expect(button('设置')).toBeTruthy()
    await click(button('账号读取失败，重试'))
    await waitFor(() => Boolean(host.querySelector('[aria-label="admin，账号菜单"]')))
    expect(session).toHaveBeenCalledTimes(2)
  })

  it('config未知时不猜云端，失败重试后云端才显示邮箱和登出', async () => {
    const config = vi
      .spyOn(api, 'config')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ localMode: false } as never)
    await mount(false, (queryClient) => queryClient.removeQueries({ queryKey: ['config'] }))
    await click(button('admin，账号菜单'))
    expect(document.body.textContent).not.toContain('admin@example.com')
    expect(
      [...document.querySelectorAll('[role="menuitem"]')].some(
        (node) => node.textContent === '登出',
      ),
    ).toBe(false)
    await click(menuItem('连接信息读取失败，重试'))
    await waitFor(() => document.body.textContent!.includes('admin@example.com'))
    expect(menuItem('登出')).toBeTruthy()
    expect(config).toHaveBeenCalledTimes(2)
  })

  it('本地模式不出现邮箱和登出', async () => {
    await mount()
    await click(button('admin，账号菜单'))
    expect(document.body.textContent).toContain('本地用户')
    expect(document.body.textContent).not.toContain('admin@example.com')
    expect(
      [...document.querySelectorAll('[role="menuitem"]')].some(
        (node) => node.textContent === '登出',
      ),
    ).toBe(false)
  })

  it('登出通过未保存保护，取消与保存失败均不发请求', async () => {
    const signout = vi.spyOn(api.auth, 'signOutAndLeave').mockResolvedValue()
    await mount(false, (queryClient) => queryClient.setQueryData(['config'], { localMode: false }))
    await click(button('标记未保存'))
    await click(button('admin，账号菜单'))
    await click(menuItem('登出'))
    expect(signout).not.toHaveBeenCalled()
    await click(button('继续编辑', document.querySelector('.ant-modal')!))
    expect(signout).not.toHaveBeenCalled()
    await click(button('标记保存失败'))
    await click(button('admin，账号菜单'))
    await click(menuItem('登出'))
    await click(button('保存并离开', document.querySelector('.ant-modal')!))
    expect(document.body.textContent).toContain('保存未完成')
    expect(signout).not.toHaveBeenCalled()
  })

  it('自动保存登出不提供丢弃，保存未完成时保留当前内容', async () => {
    const signout = vi.spyOn(api.auth, 'signOutAndLeave').mockResolvedValue()
    await mount(false, (queryClient) => queryClient.setQueryData(['config'], { localMode: false }))
    await click(button('标记自动保存中'))
    await click(button('admin，账号菜单'))
    await click(menuItem('登出'))
    const modal = document.querySelector('.ant-modal')!
    expect(modal.textContent).not.toContain('丢弃改动')
    await click(button('保存并离开', modal))
    expect(signout).not.toHaveBeenCalled()
  })

  it('登出pending只发一次，失败原处重试，独立设置仍可用', async () => {
    let reject!: (reason: Error) => void
    const signout = vi
      .spyOn(api.auth, 'signOutAndLeave')
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail
          }),
      )
      .mockResolvedValue()
    await mount(false, (queryClient) => queryClient.setQueryData(['config'], { localMode: false }))
    await click(button('admin，账号菜单'))
    await click(menuItem('登出'))
    expect(menuItem('正在登出…').getAttribute('aria-disabled')).toBe('true')
    await click(menuItem('正在登出…'))
    expect(signout).toHaveBeenCalledTimes(1)
    expect(button('设置').disabled).toBe(false)
    await act(async () => reject(new Error('offline')))
    await waitFor(() => document.body.textContent!.includes('登出失败，请重试。当前内容已保留。'))
    await click(menuItem('重试登出'))
    expect(signout).toHaveBeenCalledTimes(2)
  })

  it.each(['丢弃改动', '保存并离开'])('登出仅在%s获准后请求', async (choice) => {
    const signout = vi.spyOn(api.auth, 'signOutAndLeave').mockResolvedValue()
    await mount(false, (queryClient) => queryClient.setQueryData(['config'], { localMode: false }))
    await click(button('标记未保存'))
    await click(button('admin，账号菜单'))
    await click(menuItem('登出'))
    expect(signout).not.toHaveBeenCalled()
    await click(button(choice, document.querySelector('.ant-modal')!))
    expect(signout).toHaveBeenCalledTimes(1)
  })

  it('主题Escape逐层关闭并回焦，外点关闭不抢新目标焦点', async () => {
    await mount()
    const trigger = button('admin，账号菜单')
    await click(trigger)
    const title = document.querySelector<HTMLElement>('.ant-dropdown-menu-submenu-title')!
    await act(async () => title.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    await waitFor(() => title.getAttribute('aria-expanded') === 'true')
    const child = menuItem('浅色')
    await act(async () => {
      child.focus()
      child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(title.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(title)
    await act(async () =>
      title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    await waitFor(() => document.activeElement === trigger)
    expect(document.activeElement).toBe(trigger)
    const destination = button('内容区')
    await click(trigger)
    await act(async () => {
      destination.focus()
      destination.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      destination.click()
    })
    await settle()
    expect(document.activeElement).toBe(destination)
  })

  it('对话完整标题可通过键盘聚焦获取', async () => {
    await mount()
    const row = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) =>
      node.textContent?.startsWith('设计讨论'),
    )!
    await act(async () => row.focus())
    await waitFor(() => Boolean(document.querySelector('[role="tooltip"]')))
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('设计讨论')
  })

  it('已保存的知识库改名保留脏笔记id与子路径，不触发离开确认', async () => {
    const move = vi.spyOn(api.folders, 'move').mockResolvedValue({ path: '新产品' } as never)
    vi.spyOn(api.folders, 'list').mockResolvedValue({
      items: [{ path: '新产品', name: '新产品', count: 2, children: [] }],
    } as never)
    await mount(false, undefined, { page: 'docs', scope: 'folder:产品/研究', id: 'open-note' })
    await click(button('标记未保存'))
    await click(button('知识库 产品 的操作'))
    await click(menuItem('编辑'))
    expect(document.body.textContent).not.toContain('有改动还没保存')
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[id$="-name"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '新产品',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('保存', document.querySelector('[role="dialog"]')!))
    await waitFor(() => navigate.mock.calls.length > 0)
    expect(move).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({
      to: '/docs',
      search: { scope: 'folder:新产品/研究', id: 'open-note' },
    })
    expect(document.body.textContent).not.toContain('有改动还没保存')
  })

  it('独立session返回空值时仍能重试并使用设置', async () => {
    await mount(false, (queryClient) => queryClient.setQueryData(['session'], null))
    expect(button('账号读取失败，重试').disabled).toBe(false)
    expect(button('设置').disabled).toBe(false)
  })

  it('登出请求跨rail与Drawer重挂载保持单飞状态', async () => {
    let reject!: (reason: Error) => void
    const signout = vi.spyOn(api.auth, 'signOutAndLeave').mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    await mount(true, (queryClient) => queryClient.setQueryData(['config'], { localMode: false }))
    await click(button('admin，账号菜单'))
    await click(menuItem('登出'))
    await click(button('展开侧边栏'))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(button('admin，账号菜单', dialog).classList.contains('ant-btn-loading')).toBe(true)
    expect(signout).toHaveBeenCalledTimes(1)
    await act(async () => reject(new Error('offline')))
    await click(button('admin，账号菜单', dialog))
    expect(menuItem('重试登出')).toBeTruthy()
  })

  it('窄屏抽屉展开后只有一份账号查询菜单触发器', async () => {
    await mount(true)
    await click(button('展开侧边栏'))
    expect(document.querySelectorAll('[aria-label="admin，账号菜单"]')).toHaveLength(1)
  })
})
