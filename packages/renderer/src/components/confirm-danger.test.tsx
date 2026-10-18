import { App } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MimirProvider } from '../theme/MimirProvider'
import { confirmDanger } from './confirm-danger'

function Harness({
  remove,
  onClosed,
}: {
  remove: () => Promise<void>
  onClosed: (confirmed: boolean) => void
}) {
  const { modal } = App.useApp()
  return (
    <button
      onClick={() =>
        confirmDanger(modal, {
          title: '删除《项目资料》？',
          content: '记录与原件都会删除。',
          onConfirm: remove,
        }).then(onClosed, () => undefined)
      }
    >
      打开删除确认
    </button>
  )
}

const dialogButton = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    (item) => item.textContent?.replace(/\s/g, '') === text,
  )!

it('危险确认聚焦取消；pending 禁止退出，失败保留对象并可重试', async () => {
  let reject!: (reason: Error) => void
  const remove = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail
        }),
    )
    .mockResolvedValueOnce(undefined)
  const onClosed = vi.fn<(confirmed: boolean) => void>()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <MimirProvider>
        <Harness remove={remove} onClosed={onClosed} />
      </MimirProvider>,
    ),
  )
  await act(async () => host.querySelector('button')!.click())
  await act(async () => {
    await vi.waitFor(() => expect(document.activeElement).toBe(dialogButton('取消')))
  })
  await act(async () => {
    dialogButton('删除').click()
    dialogButton('删除').click()
  })
  expect(remove).toHaveBeenCalledOnce()
  expect(dialogButton('取消').disabled).toBe(true)
  await act(async () => {
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    dialogButton('取消').click()
  })
  expect(onClosed).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('项目资料')
  await act(async () => reject(new Error('连接断开')))
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('连接断开'),
    )
  })
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('记录与原件都会删除')
  expect(dialogButton('取消').disabled).toBe(false)
  expect(onClosed).not.toHaveBeenCalled()
  await act(async () => dialogButton('重试删除').click())
  expect(onClosed).toHaveBeenCalledExactlyOnceWith(true)
  expect(remove).toHaveBeenCalledTimes(2)
  await act(async () => root.unmount())
  host.remove()
})
