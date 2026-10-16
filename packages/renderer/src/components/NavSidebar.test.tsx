import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavSidebar } from './NavSidebar'
import { MimirProvider } from '../theme/MimirProvider'
import { UnsavedProvider } from '../lib/unsaved'

const navigate = vi.fn<(options: unknown) => void>()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('../lib/recent-documents', () => ({ useRecentDocuments: () => ({ data: [] }) }))

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
  navigate.mockReset()
})

describe('统一工作区导航', () => {
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
})
