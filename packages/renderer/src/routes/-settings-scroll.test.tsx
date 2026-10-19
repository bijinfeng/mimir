import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MimirProvider } from '../theme/MimirProvider'
import { Route } from './_app.settings'

const navigation = vi.hoisted(() => ({
  search: { scope: 'all', section: 'models' },
  navigate: vi.fn<(options: unknown) => Promise<void>>().mockResolvedValue(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => navigation.search,
  }),
  useNavigate: () => navigation.navigate,
}))
vi.mock('../platform', () => ({ useIsDesktop: () => false }))
vi.mock('../lib/nav-collapse', () => ({ useNarrowViewport: () => false }))
vi.mock('../components/settings/ModelsSection', () => ({
  ModelsSection: () => <div>模型配置</div>,
}))
vi.mock('../components/settings/PluginsSection', () => ({
  PluginsSection: () => <div>能力列表</div>,
}))

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  navigation.search = { scope: 'all', section: 'models' }
  navigation.navigate.mockClear()
})

it('设置分区使用独立滚动恢复目标，同分区重渲染保留位置而换分区回到顶部', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const SettingsPage = Route.options.component!
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = () =>
    act(async () =>
      root.render(
        <MimirProvider>
          <SettingsPage />
        </MimirProvider>,
      ),
    )
  dispose = () => {
    act(() => root.unmount())
    host.remove()
  }
  await render()
  const models = host.querySelector('main')!
  models.scrollTop = 1181
  const fromSelector = `[data-scroll-restoration-id="${models.getAttribute('data-scroll-restoration-id')}"]`
  expect(host.querySelector(fromSelector)).toBe(models)
  await render()
  expect(host.querySelector('main')).toBe(models)
  expect(models.scrollTop).toBe(1181)

  const trigger = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === '支持能力',
  )!
  trigger.focus()
  await act(async () => trigger.click())
  expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith({
    to: '/settings',
    search: { scope: 'all', section: 'plugins' },
    replace: true,
    resetScroll: false,
  })
  navigation.search = { scope: 'all', section: 'plugins' }
  await render()
  const plugins = host.querySelector('main')!
  expect(plugins).not.toBe(models)
  expect(plugins.scrollTop).toBe(0)
  // Router copies element scroll caches by selector after navigation. The old
  // section's selector must not target the newly mounted section's scroller.
  expect(host.querySelector(fromSelector)).toBeNull()
  expect(plugins.getAttribute('data-scroll-restoration-id')).toBe('settings-plugins')
  expect(plugins.querySelector('h2')?.textContent).toBe('支持能力')
  expect(document.activeElement).toBe(trigger)
})
