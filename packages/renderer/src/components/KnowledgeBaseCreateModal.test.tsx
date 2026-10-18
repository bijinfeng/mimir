import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import { KnowledgeBaseCreateModal } from './KnowledgeBaseCreateModal'

afterEach(() => vi.restoreAllMocks())

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    (item) => item.textContent?.replace(/\s/g, '') === text,
  )!

async function renderModal() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onCancel = vi.fn<() => void>()
  const onCreated = vi.fn<(path: string) => void>()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MimirProvider>
          <KnowledgeBaseCreateModal open onCancel={onCancel} onCreated={onCreated} />
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
  const input = document.querySelector<HTMLInputElement>('[id$="-name"]')!
  return {
    input,
    button,
    onCancel,
    onCreated,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}
it('非法名称就地关联错误并聚焦，组合输入不提交；请求失败保留草稿可重试', async () => {
  const create = vi
    .spyOn(api.folders, 'create')
    .mockRejectedValueOnce(new Error('名称已存在'))
    .mockResolvedValueOnce({} as Awaited<ReturnType<typeof api.folders.create>>)
  const view = await renderModal()
  await act(async () => {
    type(view.input, '项目/资料')
    view.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(create).not.toHaveBeenCalled()
  expect(view.input.getAttribute('aria-invalid')).toBe('true')
  expect(
    document.getElementById(view.input.getAttribute('aria-describedby')!)?.textContent,
  ).toContain('名称不能包含 /')
  expect(document.activeElement).toBe(view.input)
  await act(async () => {
    type(view.input, '项目资料')
    view.input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    view.input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    )
  })
  expect(create).not.toHaveBeenCalled()
  await act(async () => view.button('创建').click())
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('名称已存在'),
    )
  })
  expect(view.input.value).toBe('项目资料')
  expect(view.onCreated).not.toHaveBeenCalled()
  await act(async () => view.button('重试创建').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.onCreated).toHaveBeenCalledWith('项目资料'))
  })
  expect(create).toHaveBeenCalledTimes(2)
  await view.unmount()
})
it('提交未返回时不重复创建，也不能取消或 Escape 退出', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof api.folders.create>>) => void
  const create = vi.spyOn(api.folders, 'create').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const view = await renderModal()
  await act(async () => {
    type(view.input, '项目资料')
    view.button('创建').click()
    view.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await act(async () => {
    await vi.waitFor(() => expect(view.button('取消').disabled).toBe(true))
  })
  expect(create).toHaveBeenCalledOnce()
  await act(async () => {
    view.button('取消').click()
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(view.onCancel).not.toHaveBeenCalled()
  expect(view.input.disabled).toBe(true)
  await act(async () => resolve({} as Awaited<ReturnType<typeof api.folders.create>>))
  await act(async () => {
    await vi.waitFor(() => expect(view.onCreated).toHaveBeenCalledOnce())
  })
  await view.unmount()
})
