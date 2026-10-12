import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assemble } from '../plugins/host.js'
import { SettingsTableStore } from '../plugins/settings-store.js'
import { app, getAuthCookie, makeClient } from './helpers.js'

let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await assemble().settings.update({
    'search.web.brave.apiKey': null,
    'model.image.apiKey': null,
    'model.image.baseUrl': null,
    'model.image.model': null,
    'model.vision.enabled': null,
    'model.transcription.apiKey': null,
    'model.transcription.baseUrl': null,
    'model.transcription.model': null,
  })
  await new SettingsTableStore().remove([
    'docx.brave.apiKey',
    'docx.image.apiKey',
    'docx.image.baseUrl',
    'docx.image.model',
    'docx.media.visionEnabled',
    'docx.media.apiKey',
    'docx.media.baseUrl',
    'docx.media.transcriptionModel',
  ])
  assemble().settings.invalidate()
})

describe('network search connection test', () => {
  it('requires authentication and uses the saved key for one bounded real request', async () => {
    const unauthorized = await app.request('/api/config/network-search/test', { method: 'POST' })
    expect(unauthorized.status).toBe(401)
    await assemble().settings.update({ 'search.web.brave.apiKey': 'brave-test-secret' })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: { results: [{ title: 'Mimir', url: 'https://example.com', description: 'Found' }] },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetcher)
    const result = await makeClient(cookie).request<{ ok: boolean; results: number }>(
      '/api/config/network-search/test',
      { method: 'POST' },
    )
    expect(result).toEqual({ status: 200, body: { ok: true, results: 1 } })
    const [url, options] = fetcher.mock.calls[0]!
    expect(String(url)).toContain('count=1')
    expect((options!.headers as Record<string, string>)['X-Subscription-Token']).toBe(
      'brave-test-secret',
    )
  })

  it('returns a regular API error on provider authentication failure', async () => {
    await assemble().settings.update({ 'search.web.brave.apiKey': 'bad-key' })
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 })),
    )
    const result = await makeClient(cookie).request<{ error: { code: string; message: string } }>(
      '/api/config/network-search/test',
      { method: 'POST' },
    )
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('NETWORK_SEARCH_TEST_FAILED')
    expect(result.body.error.message).toContain('密钥无效')
  })

  it('migrates a saved encrypted legacy key before the settings page is opened', async () => {
    const settings = assemble().settings
    const store = new SettingsTableStore()
    await settings.update({ 'search.web.brave.apiKey': 'legacy-secret' })
    const encrypted = (await store.loadAll()).get('search.web.brave.apiKey')!
    await store.remove(['search.web.brave.apiKey'])
    await store.upsert([{ key: 'docx.brave.apiKey', value: encrypted }])
    settings.invalidate()

    const response = await makeClient(cookie).get<{
      settings: Array<{ key: string; configured: boolean; value: unknown }>
    }>('/api/config')
    expect(response.status).toBe(200)
    expect(response.body.settings.some((entry) => entry.key === 'docx.brave.apiKey')).toBe(false)
    expect(
      response.body.settings.find((entry) => entry.key === 'search.web.brave.apiKey'),
    ).toMatchObject({
      configured: true,
      value: null,
    })
    expect(JSON.stringify(response.body)).not.toContain('legacy-secret')
    expect(await settings.getSecret('search.web.brave.apiKey')).toEqual({
      ok: true,
      value: 'legacy-secret',
    })
    const rows = await store.loadAll()
    expect(rows.has('docx.brave.apiKey')).toBe(false)
    expect(rows.get('search.web.brave.apiKey')).toBe(encrypted)
  })

  it('migrates every legacy service setting without changing stored ciphertext', async () => {
    const settings = assemble().settings
    const store = new SettingsTableStore()
    const pairs = [
      ['docx.brave.apiKey', 'search.web.brave.apiKey', 'brave-secret'],
      ['docx.image.apiKey', 'model.image.apiKey', 'image-secret'],
      ['docx.image.baseUrl', 'model.image.baseUrl', 'https://images.example.com/v1'],
      ['docx.image.model', 'model.image.model', 'gpt-image-1'],
      ['docx.media.visionEnabled', 'model.vision.enabled', true],
      ['docx.media.apiKey', 'model.transcription.apiKey', 'audio-secret'],
      ['docx.media.baseUrl', 'model.transcription.baseUrl', 'https://audio.example.com/v1'],
      ['docx.media.transcriptionModel', 'model.transcription.model', 'whisper-1'],
    ] as const
    await settings.update(Object.fromEntries(pairs.map(([, to, value]) => [to, value])))
    const before = await store.loadAll()
    await store.remove(pairs.map(([, to]) => to))
    await store.upsert(pairs.map(([from, to]) => ({ key: from, value: before.get(to)! })))
    settings.invalidate()

    const response = await makeClient(cookie).get<{
      settings: Array<{ key: string; value: unknown; configured: boolean }>
    }>('/api/config')
    expect(response.status).toBe(200)
    const body = JSON.stringify(response.body)
    for (const [from, to, value] of pairs) {
      const rows = await store.loadAll()
      expect(rows.has(from)).toBe(false)
      expect(rows.get(to)).toBe(before.get(to))
      const entry = response.body.settings.find((item) => item.key === to)
      expect(entry?.configured).toBe(true)
      expect(entry?.value).toBe(to.endsWith('.apiKey') ? null : value)
    }
    for (const secret of ['brave-secret', 'image-secret', 'audio-secret']) {
      expect(body).not.toContain(secret)
    }
  })
})
