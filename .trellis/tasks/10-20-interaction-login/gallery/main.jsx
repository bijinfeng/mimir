import { createRoot } from 'react-dom/client'
import { useSyncExternalStore } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { setThemeMode } from '@gallery-repo/packages/renderer/src/theme/appearance'
import { PlatformProvider } from '@gallery-repo/packages/renderer/src/platform'
import { api, ApiRequestError } from '@gallery-repo/packages/renderer/src/lib/api'
import { Route as rootRoute } from '@gallery-repo/packages/renderer/src/routes/__root'
import { Route as loginRoute } from '@gallery-repo/packages/renderer/src/routes/login'
import { LoadError } from '@gallery-repo/packages/renderer/src/components/LoadError'
import './style.css'

// Only IO is simulated. All forms, guards and recovery controls are real source.
const query = new URLSearchParams(location.search)
const scene = query.get('scene') ?? 'login'
setThemeMode(query.get('theme') === 'dark' ? 'dark' : 'light')
let authenticated = false
let recovered = false
let signInCount = 0
let setupCount = 0
let sessionCount = 0
let nativeCount = 0
const pending = []
const listeners = new Set()
let revision = 0
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) }
function snapshot() { return revision }
function changed() {
  revision++
  for (const listener of listeners) listener()
}
function hold() {
  return new Promise((resolve) => pending.push(resolve))
}
function release() {
  recovered = true
  for (const resolve of pending.splice(0)) resolve()
  changed()
}
function fail() {
  for (const resolve of pending.splice(0)) resolve()
  changed()
}
const session = { user: { id: 'demo', name: 'admin', email: 'admin@example.com' } }
Object.assign(api.auth, {
  session: async () => {
    sessionCount++
    changed()
    if (scene.startsWith('root-') && !recovered) {
      if (sessionCount > 1) await hold()
      if (!recovered) {
        if (scene === 'root-http') throw new ApiRequestError(503, 'DEMO', 'demo')
        throw new TypeError('Failed to fetch')
      }
    }
    return authenticated || scene.startsWith('root-') ? session : null
  },
  setupState: async () => {
    setupCount++
    changed()
    if (scene === 'setup-loading' && !recovered) await hold()
    if (scene === 'setup-error' && !recovered) {
      if (setupCount > 1) await hold()
      if (!recovered) throw new TypeError('Failed to fetch')
    }
    return { needsSetup: scene === 'signup', prefill: null, localMode: scene === 'local' }
  },
  signIn: async () => {
    signInCount++
    changed()
    if (scene === 'pending') await hold()
    if (scene === 'auth-error') throw new ApiRequestError(401, 'DEMO', 'Invalid email or password')
    if (scene === 'long-error') throw new Error('连接请求未完成，请稍后重试。' + 'long-diagnostic/'.repeat(18))
    authenticated = true
    return session
  },
  signUp: async () => {
    // Never creates an account. Confirmation/validation belongs to the real form.
    signInCount++
    changed()
    await hold()
    authenticated = true
    return session
  },
})
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Success })
const docsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/docs', component: Success })
loginRoute.update({ id: '/login', path: '/login', getParentRoute: () => rootRoute })
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, docsRoute, loginRoute]),
  history: createMemoryHistory({ initialEntries: [scene.startsWith('root-') ? '/' : '/login'] }),
  context: { queryClient },
  defaultPendingMinMs: 0,
})
function Success() {
  return <main className="fixture-success">模拟 IO 已完成，真实路由跳转成功。</main>
}
function DesktopTitle() {
  return <div className="fixture-titlebar">Mimir · 桌面标题栏插槽模拟</div>
}
const platform = query.get('platform') === 'desktop'
  ? { kind: 'desktop', renderTitleBar: DesktopTitle, bridge: { mode: { openSetup: async () => { nativeCount++; changed() } } } }
  : { kind: 'browser' }
function Harness() {
  useSyncExternalStore(subscribe, snapshot)
  return <div className="fixture-shell">
    <header className="fixture-controls">
      <strong>真实组件 / 模拟 IO</strong>
      <label>场景 <select value={scene} onChange={(event) => { query.set('scene', event.target.value); location.search = query.toString() }}>
        {['login', 'signup', 'setup-loading', 'setup-error', 'local', 'root-offline', 'root-http', 'auth-error', 'long-error', 'pending', 'load-error'].map((item) => <option key={item}>{item}</option>)}
      </select></label>
      <button onClick={release}>完成模拟请求</button>
      {scene.startsWith('root-') || scene === 'setup-error' ? <button onClick={fail}>模拟请求失败</button> : null}
      <output aria-live="polite">登录 {signInCount} / 初始化 {setupCount} / 守卫 {sessionCount} / 原生动作 {nativeCount}</output>
    </header>
    <div className="fixture-surface">
      {scene === 'load-error' ? <div className="fixture-load-errors">
        <LoadError onRetry={release} />
        <LoadError compact detail={'long-diagnostic/'.repeat(18)} onRetry={release} />
      </div> : <RouterProvider router={router} />}
    </div>
  </div>
}
createRoot(document.getElementById('root')).render(<PlatformProvider platform={platform}>
  <QueryClientProvider client={queryClient}><MimirProvider><Harness /></MimirProvider></QueryClientProvider>
</PlatformProvider>)
