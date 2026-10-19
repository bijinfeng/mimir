import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiRequestError } from '../lib/api'
import { PlatformProvider, type Platform } from '../platform'
import { MimirProvider } from '../theme/MimirProvider'
import { Route as RootRoute } from './__root'
import { Route as LoginRoute } from './login'

const navigation = vi.hoisted(() => ({
  invalidate: vi.fn<() => Promise<void>>(),
  navigate: vi.fn<() => Promise<void>>(),
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useRouter: () => navigation,
  useRouterState: () => false,
}))

const ErrorPage = RootRoute.options.errorComponent as ComponentType<{
  error: Error
  reset: () => void
}>
const LoginPage = LoginRoute.options.component!
let dispose: (() => void) | undefined
let client: QueryClient | undefined
let host: HTMLDivElement

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function mount(content: React.ReactNode, platform: Platform = { kind: 'browser' }) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  dispose = () => {
    act(() => root.unmount())
    host.remove()
  }
  await act(async () => {
    root.render(
      <PlatformProvider platform={platform}>
        <QueryClientProvider client={client!}>
          <MimirProvider>{content}</MimirProvider>
        </QueryClientProvider>
      </PlatformProvider>,
    )
  })
}

function button(text: string) {
  const target = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.replaceAll(' ', '') === text,
  )
  if (!target) throw new Error(`Missing button: ${text}`)
  return target
}

afterEach(() => {
  dispose?.()
  dispose = undefined
  client?.clear()
  vi.restoreAllMocks()
  navigation.invalidate.mockReset()
  navigation.navigate.mockReset()
})

it('root recovery waits for invalidation, prevents duplicate retries and only then resets', async () => {
  const request = deferred<void>()
  navigation.invalidate.mockReturnValue(request.promise)
  const reset = vi.fn<() => void>()
  await mount(<ErrorPage error={new TypeError('Failed to fetch')} reset={reset} />)
  expect(host.querySelector('h1')?.textContent).toBe('暂时无法连接服务')
  expect(host.textContent).toContain('请检查网络连接后重试')
  expect(host.textContent).not.toContain('Failed to fetch')
  expect(host.textContent).not.toContain('docker compose')
  expect(host.textContent).not.toContain('更换使用方式')
  const trigger = button('重试')
  // Two synchronous events occur before React can commit the disabled state.
  await act(async () => {
    trigger.click()
    trigger.click()
  })
  expect(navigation.invalidate).toHaveBeenCalledTimes(1)
  expect(reset).not.toHaveBeenCalled()
  expect(button('正在重试').disabled).toBe(true)
  expect(button('正在重试').getAttribute('aria-busy')).toBe('true')
  await act(async () => request.resolve())
  expect(reset).toHaveBeenCalledTimes(1)
  expect(button('重试').disabled).toBe(false)
  expect(button('重试').getAttribute('aria-busy')).toBe('false')
})

it('a rejected refresh releases recovery and permits another attempt', async () => {
  const first = deferred<void>()
  const second = deferred<void>()
  navigation.invalidate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const reset = vi.fn<() => void>()
  await mount(<ErrorPage error={new ApiRequestError(503, 'UNAVAILABLE', 'raw')} reset={reset} />)
  expect(host.querySelector('h1')?.textContent).toBe('服务暂时不可用')
  expect(host.textContent).toContain('服务暂时无法完成请求，请稍后重试。')
  await act(async () => button('重试').click())
  await act(async () => first.reject(new Error('refresh failed')))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(button('重试').disabled).toBe(false)
  await act(async () => button('重试').click())
  expect(navigation.invalidate).toHaveBeenCalledTimes(2)
  expect(reset).toHaveBeenCalledTimes(1)
  await act(async () => second.resolve())
  expect(reset).toHaveBeenCalledTimes(2)
})

function DesktopTitleBar() {
  return <header>桌面窗口控件</header>
}

it('Desktop keeps its titlebar and independent native recovery while retry is pending', async () => {
  const request = deferred<void>()
  navigation.invalidate.mockReturnValue(request.promise)
  const openSetup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  await mount(<ErrorPage error={new Error('offline')} reset={vi.fn<() => void>()} />, {
    kind: 'desktop',
    renderTitleBar: DesktopTitleBar,
    bridge: { mode: { openSetup } } as unknown as Extract<Platform, { kind: 'desktop' }>['bridge'],
  })
  expect(host.querySelector('header')?.textContent).toBe('桌面窗口控件')
  await act(async () => button('重试').click())
  await act(async () => button('更换使用方式…').click())
  expect(openSetup).toHaveBeenCalledTimes(1)
  expect(button('正在重试').disabled).toBe(true)
  await act(async () => request.resolve())
})

it('setup error offers plain recovery guidance and retries into the real login form', async () => {
  const recovery = deferred<Awaited<ReturnType<typeof api.auth.setupState>>>()
  const setupState = vi
    .spyOn(api.auth, 'setupState')
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockReturnValueOnce(recovery.promise)
  await mount(<LoginPage />)
  await vi.waitFor(() => expect(host.textContent).toContain('无法连接服务'))
  expect(host.textContent).toContain('请检查网络连接后重试')
  expect(host.textContent).not.toContain('Failed to fetch')
  await act(async () => button('重试').click())
  expect(setupState).toHaveBeenCalledTimes(2)
  expect(host.querySelector('form')).toBeNull()
  await act(async () => recovery.resolve({ needsSetup: false, prefill: null, localMode: false }))
  await vi.waitFor(() => expect(host.querySelector('form')).not.toBeNull())
  expect(host.textContent).toContain('用户名或邮箱')
  expect(host.querySelector('h1')?.textContent).toBe('登录')
})
