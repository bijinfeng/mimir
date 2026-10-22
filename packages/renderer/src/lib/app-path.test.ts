import { afterEach, describe, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var __MIMIR_BASE_PATH__: string | undefined
}

afterEach(() => {
  delete globalThis.__MIMIR_BASE_PATH__
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('application paths', () => {
  it.each([
    { runtime: '/', prefix: '', base: './', expected: '/api/documents/1/file' },
    {
      runtime: '/app/mimir',
      prefix: '/app/mimir',
      base: './',
      expected: '/app/mimir/api/documents/1/file',
    },
    {
      runtime: '/app/mimir/',
      prefix: '/app/mimir',
      base: './',
      expected: '/app/mimir/api/documents/1/file',
    },
    { runtime: undefined, prefix: '', base: './', expected: '/api/documents/1/file' },
    { runtime: undefined, prefix: '', base: '/', expected: '/api/documents/1/file' },
  ])(
    'keeps API assets under runtime=$runtime base=$base',
    async ({ runtime, prefix, base, expected }) => {
      if (runtime !== undefined) globalThis.__MIMIR_BASE_PATH__ = runtime
      vi.stubEnv('BASE_URL', base)
      const { appPath, appBasePath } = await import('./app-path')
      expect(appBasePath).toBe(prefix)
      expect(appPath('/api/documents/1/file')).toBe(expected)
    },
  )

  it('prefixes stored avatar URLs once and leaves other URLs alone', async () => {
    globalThis.__MIMIR_BASE_PATH__ = '/app/mimir'
    const { serverAssetPath } = await import('./app-path')
    expect(serverAssetPath('/api/avatar?v=1')).toBe('/app/mimir/api/avatar?v=1')
    expect(serverAssetPath('/app/mimir/api/avatar?v=1')).toBe('/app/mimir/api/avatar?v=1')
    expect(serverAssetPath('https://example.com/avatar.png')).toBe('https://example.com/avatar.png')
  })

  it('treats a relative electron-vite base as the root', async () => {
    vi.stubEnv('BASE_URL', './')
    const { appBasePath } = await import('./app-path')
    expect(appBasePath).toBe('')
  })
})
