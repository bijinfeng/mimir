import { MimirProvider } from '@mimir/renderer/titlebar-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { makeUpdateBridge } from '@/update/test-bridge'

const update = makeUpdateBridge({ status: 'downloaded', version: '0.2.0' })
vi.mock('@/lib/desktop-bridge', () => ({
  desktopBridge: {
    boot: async () => ({ version: '0.1.0', mode: 'local' }),
    get update() {
      return update.api
    },
  },
}))

it('关于页显示主进程更新状态，点击复用详情窗口入口', async () => {
  const { AboutPage } = await import('./about')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const client = new QueryClient()
  client.setQueryData(['desktop-boot'], { version: '0.1.0', mode: 'local' })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <MimirProvider>
        <QueryClientProvider client={client}>
          <AboutPage />
        </QueryClientProvider>
      </MimirProvider>,
    ),
  )
  expect(host.textContent).toContain('0.1.0')
  expect(host.textContent).toContain('可重启更新')
  await act(async () => host.querySelector('button')?.click())
  expect(update.calls).toEqual(['open'])
  await act(async () => update.emit({ status: 'downloading' }))
  expect(host.textContent).toContain('更新下载中')
  await act(async () => root.unmount())
  host.remove()
  client.clear()
})
