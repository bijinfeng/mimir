import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  braveImageSearch,
  braveSearchReady,
  braveWebSearch,
} from '../services/docx-brave-search.js'

const settings = vi.hoisted(() => ({
  secret: vi.fn<() => Promise<{ ok: true; value: string } | { ok: false; reason: string }>>(),
}))

vi.mock('../services/ai-service-settings.js', () => ({ migrateAiServiceSettings: async () => [] }))
vi.mock('../plugins/host.js', () => ({
  assemble: () => ({ settings: { getSecret: settings.secret } }),
}))

describe('Brave DOCX search adapter', () => {
  beforeEach(() => {
    settings.secret.mockResolvedValue({ ok: true, value: 'test-key' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not advertise search without an encrypted setting', async () => {
    settings.secret.mockResolvedValue({ ok: false, reason: 'missing' })
    expect(await braveSearchReady()).toBe(false)
    await expect(braveWebSearch({ query: 'test' })).rejects.toThrow('尚未配置')
  })

  it('calls the fixed Brave web endpoint and normalizes real response fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              { title: 'One', url: 'https://example.com/a', description: 'A result' },
              { title: 'Bad', url: 'file:///etc/passwd', description: 'not public' },
            ],
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetcher)
    expect(await braveWebSearch({ query: 'Mimir', maxResults: 2 })).toEqual({
      results: [{ title: 'One', url: 'https://example.com/a', description: 'A result' }],
    })
    const [url, options] = fetcher.mock.calls[0]!
    expect(String(url)).toContain('/res/v1/web/search?q=Mimir&count=2')
    expect(options?.headers).toBeDefined()
    expect((options!.headers as Record<string, string>)['X-Subscription-Token']).toBe('test-key')
  })

  it('returns image URLs and reports quota failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                title: 'Photo',
                url: 'https://example.com/page',
                properties: { url: 'https://cdn.example.com/photo.png' },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('', { status: 429 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await braveImageSearch({ query: 'office' })).toEqual({
      results: [
        {
          title: 'Photo',
          url: 'https://example.com/page',
          imageUrl: 'https://cdn.example.com/photo.png',
          description: '',
        },
      ],
    })
    await expect(braveImageSearch({ query: 'office' })).rejects.toThrow('额度或速率')
  })
})
