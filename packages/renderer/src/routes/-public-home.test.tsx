import { createMemoryHistory, createRoute } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { buildRouter } from '../router'
import { Route as RootRoute } from './__root'
import { Route as IndexRoute } from './index'

const owner = { user: { id: 'admin', name: 'admin', email: 'admin@example.com', image: null } }

afterEach(() => vi.restoreAllMocks())

function setup(path: string, publicHome?: boolean, basepath = '/') {
  // Exercise the production root and index guards with lightweight leaf pages.
  const index = createRoute({
    getParentRoute: () => RootRoute,
    path: '/',
    beforeLoad: IndexRoute.options.beforeLoad,
  })
  const docs = createRoute({ getParentRoute: () => RootRoute, path: '/docs' })
  const chat = createRoute({ getParentRoute: () => RootRoute, path: '/chat' })
  const settings = createRoute({ getParentRoute: () => RootRoute, path: '/settings' })
  const login = createRoute({
    getParentRoute: () => RootRoute,
    path: '/login',
    validateSearch: (search: Record<string, unknown>) => ({ redirect: search.redirect }),
  })
  const router = buildRouter(
    RootRoute.addChildren([index, docs, chat, settings, login]),
    basepath,
    { publicHome },
  )
  router.update({
    history: createMemoryHistory({ initialEntries: [path] }),
    context: router.options.context,
  })
  return router
}

describe('explicit Web public home', () => {
  it.each(['/', '/?campaign=reading'])(
    'renders %s without asking for a session even if auth is unavailable',
    async (path) => {
      const session = vi
        .spyOn(api.auth, 'session')
        .mockRejectedValue(new TypeError('Failed to fetch'))
      const router = setup(path, true)
      await router.load()
      expect(router.state.location.pathname).toBe('/')
      expect(router.state.matches.every((match) => match.status === 'success')).toBe(true)
      expect(session).not.toHaveBeenCalled()
    },
  )

  it.each(['/docs?scope=all&id=example', '/chat?scope=all', '/settings?section=models'])(
    'protects %s and preserves its target',
    async (path) => {
      vi.spyOn(api.auth, 'session').mockResolvedValue(null)
      const router = setup(path, true)
      await router.load()
      expect(router.state.location.pathname).toBe('/login')
      expect(router.state.location.search.redirect).toBe(path)
    },
  )

  it('keeps unavailable authentication as a protected-route error', async () => {
    vi.spyOn(api.auth, 'session').mockRejectedValue(new TypeError('Failed to fetch'))
    const router = setup('/docs?scope=all', true)
    await router.load()
    expect(router.state.location.pathname).toBe('/docs')
    expect(router.state.matches[0]?.status).toBe('error')
  })

  it('lets the owner enter the workspace, and redirects a signed-in login visit', async () => {
    vi.spyOn(api.auth, 'session').mockResolvedValue(owner)
    const router = setup('/docs?scope=all', true)
    await router.load()
    expect(router.state.matches.every((match) => match.status === 'success')).toBe(true)
    await router.navigate({ to: '/login' })
    expect(router.state.location.pathname).toBe('/docs')
  })

  it('keeps the default desktop root redirect to the workspace', async () => {
    const session = vi.spyOn(api.auth, 'session').mockResolvedValue(owner)
    const router = setup('/')
    await router.load()
    expect(session).toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/docs')
    expect(router.state.location.searchStr).toBe('?scope=all')
  })

  it.each(['/app/mimir', '/app/mimir/'])(
    'uses internal root matching and prefixed links under gateway %s',
    async (path) => {
      const session = vi
        .spyOn(api.auth, 'session')
        .mockRejectedValue(new TypeError('Failed to fetch'))
      const router = setup(path, true, '/app/mimir/')
      await router.load()
      expect(router.state.matches.every((match) => match.status === 'success')).toBe(true)
      expect(session).not.toHaveBeenCalled()
      expect(router.buildLocation({ to: '/docs', search: { scope: 'all' } }).publicHref).toBe(
        '/app/mimir/docs?scope=all',
      )
      session.mockResolvedValue(null)
      await router.navigate({ to: '/docs', search: { scope: 'all' } })
      expect(router.state.location.publicHref).toContain('/app/mimir/login')
      expect(router.state.location.search.redirect).toBe('/app/mimir/docs?scope=all')
    },
  )

  it('does not expose an unknown path as the public home', async () => {
    const session = vi
      .spyOn(api.auth, 'session')
      .mockRejectedValue(new TypeError('Failed to fetch'))
    const router = setup('/not-a-page', true)
    await router.load()
    expect(session).toHaveBeenCalled()
    expect(router.state.matches[0]?.status).toBe('error')
  })
})
