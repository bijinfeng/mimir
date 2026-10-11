import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('application paths', () => {
  it.each([
    { base: '/', expected: '/api/documents/1/file' },
    { base: './', expected: '/api/documents/1/file' },
    { base: '/app/mimir/', expected: '/app/mimir/api/documents/1/file' },
  ])('keeps API assets under $base', async ({ base, expected }) => {
    vi.stubEnv('BASE_URL', base)
    const { appPath } = await import('./app-path')
    expect(appPath('/api/documents/1/file')).toBe(expected)
  })

  it('prefixes stored avatar URLs once and leaves other URLs alone', async () => {
    vi.stubEnv('BASE_URL', '/app/mimir/')
    const { serverAssetPath } = await import('./app-path')
    expect(serverAssetPath('/api/avatar?v=1')).toBe('/app/mimir/api/avatar?v=1')
    expect(serverAssetPath('/app/mimir/api/avatar?v=1')).toBe('/app/mimir/api/avatar?v=1')
    expect(serverAssetPath('https://example.com/avatar.png')).toBe('https://example.com/avatar.png')
  })
})
