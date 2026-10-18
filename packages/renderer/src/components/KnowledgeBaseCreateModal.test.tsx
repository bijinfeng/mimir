import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiRequestError } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import type { FolderNode } from '@mimir/shared'
import { KnowledgeBaseCreateModal, KnowledgeBaseModal } from './KnowledgeBaseCreateModal'

afterEach(() => vi.restoreAllMocks())

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    'value',
  )!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    (item) => item.textContent?.replace(/\s/g, '') === text,
  )!

async function renderModal(folder?: FolderNode) {
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
          {folder ? (
            <KnowledgeBaseModal open folder={folder} onCancel={onCancel} onSaved={onCreated} />
          ) : (
            <KnowledgeBaseCreateModal open onCancel={onCancel} onCreated={onCreated} />
          )}
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
  const input = document.querySelector<HTMLInputElement>('[id$="-name"]')!
  return {
    input,
    description: document.querySelector<HTMLTextAreaElement>('[id$="-desc"]')!,
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

const existing: FolderNode = {
  path: '项目',
  name: '项目',
  description: '原有说明',
  code: 'ABC123',
  icon: 'science',
  count: 2,
  children: [],
}

it('创建不提供图标，名称与描述一同提交；描述草稿失败后保留', async () => {
  const create = vi.spyOn(api.folders, 'create').mockRejectedValue(new Error('网络不可用'))
  const view = await renderModal()
  expect(document.querySelector('[aria-pressed]')).toBeNull()
  expect(view.description.maxLength).toBe(500)
  await act(async () => {
    type(view.input, '技术')
    type(view.description, '接口与文档')
  })
  await act(async () => view.button('创建').click())
  await act(async () => {
    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith('技术', { description: '接口与文档' }),
    )
  })
  expect(view.description.value).toBe('接口与文档')
  await view.unmount()
})

it.each(['新的说明', ''])('编辑仅修改或清空描述时提交，名称不变：%s', async (description) => {
  const move = vi
    .spyOn(api.folders, 'move')
    .mockResolvedValue({ moved: 0, path: '项目', description })
  const view = await renderModal(existing)
  expect(view.input.value).toBe('项目')
  expect(view.description.value).toBe('原有说明')
  await act(async () => type(view.description, description))
  await act(async () => view.button('保存').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.onCreated).toHaveBeenCalledWith('项目', '项目'))
  })
  expect(move).toHaveBeenCalledWith('项目', '项目', { description })
  await view.unmount()
})

it('名称和描述均未变时直接关闭，不发请求', async () => {
  const move = vi.spyOn(api.folders, 'move')
  const view = await renderModal(existing)
  await act(async () => view.button('保存').click())
  expect(move).not.toHaveBeenCalled()
  expect(view.onCancel).toHaveBeenCalledOnce()
  await view.unmount()
})

it('失败保留两项草稿，按稳定短码读取新路径后重试，不向旧路径盲重试', async () => {
  const move = vi
    .spyOn(api.folders, 'move')
    .mockRejectedValueOnce(new Error('保存失败'))
    .mockResolvedValueOnce({ moved: 0, path: '新项目', description: '新说明' })
  vi.spyOn(api.folders, 'list').mockResolvedValue({
    items: [{ ...existing, name: '新项目', path: '新项目' }],
  })
  const view = await renderModal(existing)
  await act(async () => {
    type(view.input, '新项目')
    type(view.description, '新说明')
  })
  await act(async () => view.button('保存').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.button('重试保存').disabled).toBe(false))
  })
  expect(view.input.value).toBe('新项目')
  expect(view.description.value).toBe('新说明')
  await act(async () => view.button('重试保存').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.onCreated).toHaveBeenCalledWith('新项目', '新项目'))
  })
  expect(move.mock.calls).toEqual([
    ['项目', '新项目', { description: '新说明' }],
    ['新项目', '新项目', { description: '新说明' }],
  ])
  await view.unmount()
})

it('无法读取失败后的权威状态时阻止提交，草稿保留且提供读取重试', async () => {
  const move = vi.spyOn(api.folders, 'move').mockRejectedValue(new Error('响应丢失'))
  const list = vi
    .spyOn(api.folders, 'list')
    .mockRejectedValueOnce(new Error('离线'))
    .mockResolvedValueOnce({ items: [existing] })
  const view = await renderModal(existing)
  await act(async () => type(view.description, '草稿'))
  await act(async () => view.button('保存').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.button('重新读取状态')).toBeDefined())
  })
  expect(view.button('重试保存').disabled).toBe(true)
  expect(view.description.value).toBe('草稿')
  await act(async () => view.button('重新读取状态').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.button('重试保存').disabled).toBe(false))
  })
  expect(move).toHaveBeenCalledOnce()
  expect(list).toHaveBeenCalledTimes(2)
  await view.unmount()
})

it('历史长描述改名时完整保留且不发送描述，修改后需要缩短到500字', async () => {
  const legacy = '旧'.repeat(800)
  const move = vi.spyOn(api.folders, 'move').mockResolvedValue({ moved: 1, path: '新项目' })
  const view = await renderModal({ ...existing, description: legacy })
  expect(view.description.value).toBe(legacy)
  await act(async () => {
    type(view.input, '新项目')
    type(view.description, legacy + '改')
  })
  await act(async () => view.button('保存').click())
  expect(move).not.toHaveBeenCalled()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('描述最多 500 字')
  await act(async () => type(view.description, legacy))
  await act(async () => view.button('保存').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.onCreated).toHaveBeenCalledOnce())
  })
  expect(move).toHaveBeenCalledWith('项目', '新项目', {})
  await view.unmount()
})

it('服务端明确恢复不完整时，即使目录树能读取也不会解锁盲目重试', async () => {
  vi.spyOn(api.folders, 'move').mockRejectedValue(
    new ApiRequestError(500, 'FOLDER_UPDATE_FAILED', '保存状态需检查', {
      recovery: { code: 'ABC123', path: '项目', description: '原有说明', retrySafe: false },
    }),
  )
  vi.spyOn(api.folders, 'list').mockResolvedValue({ items: [existing] })
  const view = await renderModal(existing)
  await act(async () => type(view.description, '草稿'))
  await act(async () => view.button('保存').click())
  await act(async () => {
    await vi.waitFor(() => expect(view.button('重新读取状态')).toBeDefined())
  })
  expect(view.button('重试保存').disabled).toBe(true)
  await act(async () => view.button('重新读取状态').click())
  expect(view.button('重试保存').disabled).toBe(true)
  expect(view.description.value).toBe('草稿')
  await view.unmount()
})

it('取消创建清空两个草稿；取消编辑恢复初始名称与描述', async () => {
  const createView = await renderModal()
  await act(async () => {
    type(createView.input, '临时草稿')
    type(createView.description, '未保存')
  })
  await act(async () => createView.button('取消').click())
  expect(createView.onCancel).toHaveBeenCalledOnce()
  expect(createView.input.value).toBe('')
  expect(createView.description.value).toBe('')
  await createView.unmount()
  const editView = await renderModal(existing)
  await act(async () => {
    type(editView.input, '临时改名')
    type(editView.description, '未保存')
  })
  await act(async () => editView.button('取消').click())
  expect(editView.onCancel).toHaveBeenCalledOnce()
  expect(editView.input.value).toBe(existing.name)
  expect(editView.description.value).toBe(existing.description)
  await editView.unmount()
})
