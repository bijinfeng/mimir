import { afterEach, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var __MIMIR_BASE_PATH__: string | undefined
}

afterEach(() => {
  delete globalThis.__MIMIR_BASE_PATH__
  vi.resetModules()
})

it.each([
  { runtime: '/app/mimir', expected: '/app/mimir/api/chat' },
  { runtime: '/app/mimir/', expected: '/app/mimir/api/chat' },
  { runtime: '/', expected: '/api/chat' },
  { runtime: undefined, expected: '/api/chat' },
])(
  'defaults the chat stream to the deployment prefix ($runtime)',
  async ({ runtime, expected }) => {
    if (runtime !== undefined) globalThis.__MIMIR_BASE_PATH__ = runtime
    const { DEFAULT_CHAT_URL } = await import('./io')
    expect(DEFAULT_CHAT_URL).toBe(expected)
  },
)
