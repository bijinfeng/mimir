/** Real components; only routing/data/desktop IPC are fixtures for reproducible screenshots. */
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router'
import { BrandMark } from '../../../packages/renderer/src/components/BrandMark'
import { NavSidebar } from '../../../packages/renderer/src/components/NavSidebar'
import { OfficialSite } from '../../../packages/renderer/src/components/marketing/OfficialSite'
import { Route as LoginRoute } from '../../../packages/renderer/src/routes/login'
import { MimirProvider } from '../../../packages/renderer/src/theme/MimirProvider'
import { PlatformProvider } from '../../../packages/renderer/src/platform'
import { UnsavedProvider } from '../../../packages/renderer/src/lib/unsaved'
import { TitleBar } from '../../../apps/desktop/src/renderer/components/TitleBar'
import { SetupPage } from '../../../apps/desktop/src/renderer/setup/SetupPage'

const noop = () => undefined
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
})
for (const [key, data] of [
  ['folders', { items: [] }],
  ['conversations', { items: [] }],
  ['session', { user: { id: 'admin', name: 'admin', email: 'admin@example.com' } }],
  ['config', { localMode: false }],
])
  client.setQueryData([key], data)
function Samples() {
  return (
    <>
      <TitleBar collapsed={false} onToggleCollapsed={noop} showToggle />
      <div style={{ display: 'flex', height: 620 }}>
        <NavSidebar
          selection={{ page: 'docs', scope: 'all' }}
          collapsed={false}
          overlayOpen={false}
          narrowViewport={false}
          onToggleOverlay={noop}
          onCloseOverlay={noop}
          onToggleCollapsed={noop}
          onOpenCapture={noop}
          onOpenPalette={noop}
          onOpenDocument={noop}
        />
        <main style={{ padding: 40, flex: 1 }}>
          <h1>真实品牌组件 · 尺寸检查</h1>
          <p>相同组件、尺寸、主题与内容；桌面桥为展示夹具。</p>
          <div
            style={{ display: 'flex', alignItems: 'end', gap: 30, color: 'var(--ant-color-link)' }}
          >
            {[16, 20, 24, 28, 32, 48, 64].map((size) => (
              <div key={size}>
                <BrandMark size={size} />
                <p>{size}px</p>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 30,
              background: '#00834d',
              color: '#fff',
              padding: 20,
              display: 'flex',
              gap: 24,
            }}
          >
            {[16, 20, 24, 32].map((size) => (
              <BrandMark key={size} size={size} title={null} />
            ))}
          </div>
        </main>
      </div>
    </>
  )
}
const view = new URLSearchParams(location.search).get('view')
const root = createRootRoute({
  component:
    view === 'login'
      ? Outlet
      : view === 'home'
        ? OfficialSite
        : view === 'setup'
          ? SetupPage
          : Samples,
})
const login = LoginRoute.update({ id: '/login', path: '/login', getParentRoute: () => root })
const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null })
const router = createRouter({
  routeTree: root.addChildren([login, index]),
  context: { queryClient: client },
})
createRoot(document.getElementById('root')!).render(
  <MimirProvider>
    <QueryClientProvider client={client}>
      <PlatformProvider platform={{ kind: 'browser' }}>
        <UnsavedProvider>
          <RouterProvider router={router} />
        </UnsavedProvider>
      </PlatformProvider>
    </QueryClientProvider>
  </MimirProvider>,
)
