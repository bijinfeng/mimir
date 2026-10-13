import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('routes JSON, multipart, downloads, and server avatar URLs through the gateway', async () => {
  vi.stubEnv('BASE_URL', '/app/mimir/')
  const { api, configureApiTransport } = await import('./api')
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url.endsWith('/get-session')) {
      return Response.json({
        user: { id: '1', email: 'admin@example.com', name: 'Admin', image: '/api/avatar?v=1' },
      })
    }
    if (url.endsWith('/avatar')) {
      return Response.json({ image: '/api/avatar?v=2', mime: 'image/png', bytes: 1 })
    }
    return Response.json({ total: 0 })
  })
  configureApiTransport({ fetchImpl })

  await api.export.stats()
  await api.avatar.upload(new Blob(['x'], { type: 'image/png' }))
  const session = await api.auth.session()

  expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
    '/app/mimir/api/export/stats',
    '/app/mimir/api/avatar',
    '/app/mimir/api/auth/get-session',
  ])
  expect(session?.user.image).toBe('/app/mimir/api/avatar?v=1')
  expect(api.documents.sourceUrl('a/b', { download: true })).toBe(
    '/app/mimir/api/documents/a%2Fb/file?download=1',
  )
  expect(api.export.url('markdown')).toBe('/app/mimir/api/export/markdown')
})

it('treats a successful null auth response as signed out', async () => {
  const { api, configureApiTransport } = await import('./api')
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(null))
  configureApiTransport({ fetchImpl })

  await expect(api.auth.session()).resolves.toBeNull()
  expect(fetchImpl).toHaveBeenCalledOnce()
})
