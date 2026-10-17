import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavSidebar } from './NavSidebar'
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
    <button
      type="button"
      onClick={() => {
        setDirty(true)
        setSave(async () => true)
      }}
    >
      标记未保存
    </button>
  )
}

async function mount(narrow = false) {
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

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <MimirProvider>
        <QueryClientProvider client={client}>
          <UnsavedProvider>
            <NavSidebar
              selection={{ page: 'docs', scope: 'folder:产品' }}
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
    (node) => node.getAttribute('aria-label') === label || node.textContent === label,
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
