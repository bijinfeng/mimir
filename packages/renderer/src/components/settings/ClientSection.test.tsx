import type { MimirDesktopBridge } from '@mimir/shared/desktop'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { PlatformProvider, type Platform } from '../../platform'
import { MimirProvider } from '../../theme/MimirProvider'
import { ClientSection } from './ClientSection'

const noop = () => {}

function bridge(mode: 'local' | 'cloud'): MimirDesktopBridge {
  return {
    boot: async () => ({
      version: '0.1.8',
      mode,
      origin: mode === 'cloud' ? 'https://notes.example.com' : 'http://127.0.0.1:3000',
      dataDir: null,
    }),
    quit: noop,
    mode: {
      get: async () => null,
      choose: async () => ({ ok: true as const }),
      activate: noop,
      openSetup: noop,
    },
    update: {
      getState: async () => ({
        status: 'disabled',
        currentVersion: '0.1.8',
        releaseUrl: '',
        platform: 'darwin',
        arch: 'arm64',
        capability: 'disabled',
        autoDownload: false,
      }),
      open: noop,
      setAppearance: noop,
      onState: () => noop,
      onPrepare: () => noop,
      respondPrepare: noop,
      onPrepareCancelled: () => noop,
    },
    window: {
      platform: 'darwin',
      minimize: noop,
      toggleMaximize: noop,
      close: noop,
      isMaximized: async () => false,
      onMaximizeChange: () => noop,
    },
  }
}

async function render(platform: Platform) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <PlatformProvider platform={platform}>
          <MimirProvider>
            <ClientSection />
          </MimirProvider>
        </PlatformProvider>
      </QueryClientProvider>,
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

describe('客户端设置', () => {
  it('显示真实版本和当前使用方式，关于入口交给桌面路由', async () => {
    const openAbout = vi.fn<() => void>()
    const desktop: Platform = {
      kind: 'desktop',
      bridge: bridge('local'),
      renderTitleBar: () => null,
      openAbout,
    }
    const { host, unmount } = await render(desktop)
    await vi.waitFor(() => expect(host.textContent).toContain('0.1.8'))
    expect(host.textContent).toContain('本地使用')
    expect(host.textContent).toContain('关于客户端')
    const about = [...host.querySelectorAll('button')].find(
      (button) => button.textContent?.replace(/\s+/g, '') === '关于mimir',
    )
    expect(about).toBeTruthy()
    await act(async () => about?.click())
    expect(openAbout).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('云端使用方式显示服务器来源', async () => {
    const desktop: Platform = {
      kind: 'desktop',
      bridge: bridge('cloud'),
      renderTitleBar: () => null,
      openAbout: noop,
    }
    const { host, unmount } = await render(desktop)
    await vi.waitFor(() => expect(host.textContent).toContain('https://notes.example.com'))
    expect(host.textContent).toContain('连接服务器')
    await unmount()
  })

  it('浏览器部署不渲染客户端分区', async () => {
    const { host, unmount } = await render({ kind: 'browser' })
    expect(host.textContent).toBe('')
    await unmount()
  })
})
