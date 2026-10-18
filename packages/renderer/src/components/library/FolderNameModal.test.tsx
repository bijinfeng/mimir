import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { FolderNameModal } from './FolderNameModal'

let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (node) => node.textContent?.replace(/\s/g, '') === text,
  )!
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function mount(onSubmit: (name: string) => Promise<void>, initialName?: string) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const close = vi.fn<() => void>()
  await act(async () =>
    root!.render(
      <MimirProvider>
        <FolderNameModal
          parent="研究/参考资料"
          initialName={initialName}
          onSubmit={onSubmit}
          onClose={close}
          afterClose={() => {}}
        />
      </MimirProvider>,
    ),
  )
  return { input: document.querySelector<HTMLInputElement>('[role="dialog"] input')!, close }
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  vi.restoreAllMocks()
})
it('就地关联非法名称；组合Enter和229不提交；失败保留完整草稿后重试', async () => {
  const submit = vi
    .fn<(name: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error('名称已存在'))
    .mockResolvedValueOnce()
  const { input, close } = await mount(submit)
  await act(async () => {
    type(input, '资料/原件')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(submit).not.toHaveBeenCalled()
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe(
    '名称不能包含 /',
  )
  await act(async () => {
    type(input, '资料原件')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }))
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    )
  })
  expect(submit).not.toHaveBeenCalled()
  await act(async () => button('创建').click())
  expect(input.value).toBe('资料原件')
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('名称已存在')
  expect(close).not.toHaveBeenCalled()
  await act(async () => button('重试').click())
  expect(submit).toHaveBeenNthCalledWith(2, '资料原件')
  expect(close).toHaveBeenCalledOnce()
})
it('同帧重复保存只发送一次，等待中禁输入/取消/Escape/关闭', async () => {
  let finish!: () => void
  const submit = vi.fn<(name: string) => Promise<void>>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { input, close } = await mount(submit, '旧资料')
  await act(async () => {
    type(input, '新资料')
    button('重命名').click()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(submit).toHaveBeenCalledExactlyOnceWith('新资料')
  expect(input.disabled).toBe(true)
  expect(button('取消').disabled).toBe(true)
  expect(document.querySelector('.ant-modal-close')).toBeNull()
  await act(async () => {
    button('取消').click()
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(close).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(close).toHaveBeenCalledOnce()
})
it('无法安全校准的目录更新保留草稿但阻止使用旧路径再写入', async () => {
  const submit = vi
    .fn<(name: string) => Promise<void>>()
    .mockRejectedValue(Object.assign(new Error('需要重新读取目录'), { retryBlocked: true }))
  const { input, close } = await mount(submit, '旧资料')
  await act(async () => {
    type(input, '新资料')
    button('重命名').click()
  })
  expect(input.value).toBe('新资料')
  expect(button('重试').disabled).toBe(true)
  await act(async () => type(input, '另一份草稿'))
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('需要重新读取目录')
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  )
  expect(submit).toHaveBeenCalledOnce()
  await act(async () => button('取消').click())
  expect(close).toHaveBeenCalledOnce()
})
