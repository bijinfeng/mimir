import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { DocumentCommandRefreshError } from './DocumentCommandModal'
import { DocumentTitle } from './DocumentTitle'

async function mount(
  rename = vi.fn<(_: string) => Promise<unknown>>().mockResolvedValue(undefined),
) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const refresh = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
  await act(async () =>
    root.render(
      <MimirProvider>
        <ConfigProvider theme={{ token: { motion: false } }}>
          <DocumentTitle
            title="原标题"
            updatedAt="2026-10-18T01:00:00Z"
            onRename={rename}
            onRefresh={refresh}
          />
        </ConfigProvider>
      </MimirProvider>,
    ),
  )
  const click = async (label: string) =>
    act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find(
          (b) =>
            b.textContent?.replace(/\s/g, '') === label ||
            b.getAttribute('aria-label')?.startsWith(label),
        )!
        .click(),
    )
  await click('修改笔记标题')
  const input = host.querySelector<HTMLInputElement>('input')!
  const type = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  const dispose = async () => {
    await act(async () => root.unmount())
    host.remove()
  }
  return { host, input, click, type, rename, refresh, dispose }
}

it('retains blur draft, excludes IME Enter, and cancels without writing', async () => {
  const t = await mount()
  try {
    await t.type('知识/页面')
    await act(async () => t.input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(t.input.isConnected).toBe(true)
    expect(t.rename).not.toHaveBeenCalled()
    await act(async () =>
      t.input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      ),
    )
    expect(t.rename).not.toHaveBeenCalled()
    await t.click('取消')
    expect(t.host.querySelector('input')).toBeNull()
    expect(t.rename).not.toHaveBeenCalled()
  } finally {
    await t.dispose()
  }
})

it('singleflights title writes and retains failure draft, then permits explicit retry', async () => {
  let reject!: (error: Error) => void
  const pending = new Promise((_, fail) => {
    reject = fail
  })
  const t = await mount(
    vi
      .fn<(_: string) => Promise<unknown>>()
      .mockReturnValueOnce(pending)
      .mockResolvedValue(undefined),
  )
  try {
    await t.type('新标题')
    await act(async () => {
      const save = [...t.host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('保存标题'),
      )!
      save.click()
      save.click()
    })
    expect(t.rename).toHaveBeenCalledTimes(1)
    expect(t.input.disabled).toBe(true)
    await act(async () => reject(new Error('网络不可用')))
    expect(t.input.value).toBe('新标题')
    expect(t.host.textContent).toContain('网络不可用')
    await t.click('保存标题')
    expect(t.rename).toHaveBeenCalledTimes(2)
    expect(t.host.querySelector('input')).toBeNull()
  } finally {
    await t.dispose()
  }
})

it('saved-but-read-failed retries only GET and keeps the saved draft locked', async () => {
  const t = await mount(
    vi
      .fn<(_: string) => Promise<unknown>>()
      .mockRejectedValue(
        new DocumentCommandRefreshError('标题已保存，但暂时无法读取最新内容。请重试刷新。'),
      ),
  )
  try {
    await t.type('已写入标题')
    await t.click('保存标题')
    expect(t.input.value).toBe('已写入标题')
    expect(t.input.disabled).toBe(true)
    await t.click('重试刷新')
    expect(t.rename).toHaveBeenCalledTimes(1)
    expect(t.refresh).toHaveBeenCalledTimes(1)
    expect(t.host.querySelector('input')).toBeNull()
  } finally {
    await t.dispose()
  }
})
