import { createMemoryHistory, createRootRoute, createRoute } from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { buildRouter } from './router'

it('maps deep gateway URLs to internal routes and keeps public links prefixed', () => {
  const root = createRootRoute()
  const docs = createRoute({ getParentRoute: () => root, path: '/docs' })
  const login = createRoute({ getParentRoute: () => root, path: '/login' })
  const router = buildRouter(root.addChildren([docs, login]), '/app/mimir/')
  router.update({ history: createMemoryHistory({ initialEntries: ['/app/mimir/docs?scope=all'] }) })

  const location = router.parseLocation(router.history.location)
  expect(location.pathname).toBe('/docs')
  expect(location.publicHref).toBe('/app/mimir/docs?scope=all')
  expect(router.buildLocation({ to: '/login' }).publicHref).toBe('/app/mimir/login')
})
