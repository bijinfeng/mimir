import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FolderNode } from '@mimir/shared'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { MimirProvider } from '../../theme/MimirProvider'
import { FolderSection } from './FolderSection'

const folder: FolderNode = {
  path: '技术',
  name: '技术',
  description: '技术资料',
  count: 1,
  icon: null,
  code: 'ABC123',
  children: [],
}
const button = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.textContent?.replace(/\s/g, '') === label,
  )!

it('后台刷新失败仍展示缓存知识库并提供重试', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const retry = vi.fn<() => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MimirProvider>
          <FolderSection
            items={[folder]}
            isLoading={false}
            isError
            onRetry={retry}
            activePath={null}
            parentOnly={false}
            onSelect={vi.fn<(path: string) => void>()}
          />
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
  try {
    expect(document.querySelector('[aria-label="技术，1 篇文档"]')).not.toBeNull()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('已保留上次内容')
    await act(async () => button('重试').click())
    expect(retry).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it.each([false, true])(
  '编辑改名保留子目录位置，可通过专用回调保留打开的笔记：%s',
  async (preserveNote) => {
    const move = vi
      .spyOn(api.folders, 'move')
      .mockResolvedValue({ moved: 1, path: '研发', description: '技术资料' })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const select = vi.fn<(path: string) => void>()
    const pathChanged = vi.fn<(from: string, to: string) => void>()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () =>
      root.render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
        >
          <MimirProvider>
            <FolderSection
              items={[folder]}
              isLoading={false}
              activePath="技术/前端/React"
              parentOnly={false}
              onSelect={select}
              onPathChanged={preserveNote ? pathChanged : undefined}
            />
          </MimirProvider>
        </QueryClientProvider>,
      ),
    )
    try {
      await act(async () =>
        document.querySelector<HTMLButtonElement>('[aria-label="知识库 技术 的操作"]')!.click(),
      )
      await act(async () => {
        await vi.waitFor(() => expect(document.querySelector('[role="menuitem"]')).not.toBeNull())
      })
      const edit = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
        (item) => item.textContent === '编辑',
      )!
      await act(async () => edit.click())
      expect(select).not.toHaveBeenCalled()
      expect(pathChanged).not.toHaveBeenCalled()
      const input = document.querySelector<HTMLInputElement>('[id$="-name"]')!
      expect(document.querySelector<HTMLTextAreaElement>('[id$="-desc"]')!.value).toBe('技术资料')
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          '研发',
        )
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => button('保存').click())
      await act(async () => {
        const callback = preserveNote ? pathChanged : select
        const expectedArgs = preserveNote ? ['技术', '研发'] : ['研发/前端/React']
        await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(...expectedArgs))
      })
      expect(move).toHaveBeenCalledWith('技术', '研发', {})
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.restoreAllMocks()
    }
  },
)
