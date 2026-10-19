import { QueryClient } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { api, ApiRequestError } from '../lib/api'
import { PlatformProvider } from '../platform'
import { MimirProvider } from '../theme/MimirProvider'
import { Route } from './__root'

function RecoveredPage() {
  return <main>已恢复工作区</main>
}

it('real route guard can fail again and then recover through repeated invalidation', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let resolveSession!: (value: Awaited<ReturnType<typeof api.auth.session>>) => void
  const pendingSession = new Promise<Awaited<ReturnType<typeof api.auth.session>>>((resolve) => {
    resolveSession = resolve
  })
  const recoveredSession = {
    user: { id: 'admin', name: 'admin', email: 'admin@example.com', image: null },
  }
  const session = vi
    .spyOn(api.auth, 'session')
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockRejectedValueOnce(new ApiRequestError(503, 'UNAVAILABLE', 'Unavailable'))
    .mockReturnValueOnce(pendingSession)
    .mockResolvedValue(recoveredSession)
  // The router error boundary logs the two intentionally rejected guard runs.
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const client = new QueryClient()
  const index = createRoute({ getParentRoute: () => Route, path: '/', component: RecoveredPage })
  const router = createRouter({
    routeTree: Route.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient: client },
    defaultPendingMinMs: 0,
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => {
      root.render(
        <PlatformProvider platform={{ kind: 'browser' }}>
          <MimirProvider>
            <RouterProvider router={router} />
          </MimirProvider>
        </PlatformProvider>,
      )
      await router.load()
    })
    await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toBe('暂时无法连接服务'))
    const retry = () => host.querySelector('button')!
    await act(async () => retry().click())
    await vi.waitFor(() => {
      expect(host.querySelector('h1')?.textContent).toBe('服务暂时不可用')
      expect(retry().disabled).toBe(false)
      expect(router.state.isLoading).toBe(false)
    })
    expect(session).toHaveBeenCalledTimes(2)
    await act(async () => retry().click())
    expect(session).toHaveBeenCalledTimes(3)
    expect(retry().disabled).toBe(true)
    expect(retry().getAttribute('aria-busy')).toBe('true')
    await act(async () => retry().click())
    expect(session).toHaveBeenCalledTimes(3)
    await act(async () => {
      resolveSession(recoveredSession)
    })
    await vi.waitFor(() => expect(host.textContent).toContain('已恢复工作区'))
    expect(host.querySelector('button')).toBeNull()
    expect(router.state.matches.every((match) => match.status === 'success')).toBe(true)
  } finally {
    await act(async () => {
      resolveSession(recoveredSession)
      await pendingSession
      await router.load()
    })
    await act(async () => root.unmount())
    host.remove()
    client.clear()
    session.mockRestore()
    consoleError.mockRestore()
    consoleWarn.mockRestore()
  }
})
