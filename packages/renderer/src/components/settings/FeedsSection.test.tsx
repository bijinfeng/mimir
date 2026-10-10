import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { MimirProvider } from '../../theme/MimirProvider'
import { FeedsSection } from './FeedsSection'

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function renderFeeds() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(MimirProvider, null, createElement(FeedsSection)),
      ),
    )
  })
  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api.feeds, 'list').mockResolvedValue({ items: [] })
})

describe('RSS 地址输入反馈', () => {
  it('无效地址在字段旁说明原因，且不会提交请求', async () => {
    const create = vi.spyOn(api.feeds, 'create')
    const { host, unmount } = await renderFeeds()
    const input = host.querySelector('input[aria-label="RSS 或 Atom 地址"]') as HTMLInputElement
    const submit = () =>
      [...host.querySelectorAll('button')].find(
        (button) => button.textContent?.replace(/\s+/g, '') === '订阅',
      )!

    await act(async () => submit().click())
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(host.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toContain(
      '请输入',
    )

    await act(async () => typeInto(input, 'bad url'))
    await act(async () => submit().click())
    expect(host.textContent).toContain('完整的网址')

    await act(async () => typeInto(input, 'ftp://example.com/feed.xml'))
    await act(async () => submit().click())
    expect(host.textContent).toContain('http:// 或 https://')
    expect(create).not.toHaveBeenCalled()
    await unmount()
  })
})
