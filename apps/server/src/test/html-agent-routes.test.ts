import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app, getAuthCookie, makeClient } from './helpers.js'

const writer = vi.hoisted(() => ({
  plan: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  write: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('../services/html-agent-writing.js', () => ({
  planHtmlPage: writer.plan,
  writeHtmlDocument: writer.write,
}))

const brief = {
  title: 'Guide',
  tone: 'quiet',
  audience: 'readers',
  sections: [{ title: 'Intro', purpose: 'explain' }],
}

describe('HTML planning and writing routes', () => {
  beforeEach(() => {
    writer.plan.mockReset().mockResolvedValue(brief)
    writer.write
      .mockReset()
      .mockResolvedValue({ html: '<!doctype html><html><body>Done</body></html>', complete: true })
  })

  it('requires authentication and validates the planner input', async () => {
    const unauthenticated = await app.request('/api/conversations/html-agent/plan-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'html-1', mode: 'new', instruction: 'Guide' }),
    })
    expect(unauthenticated.status).toBe(401)
    const client = makeClient(await getAuthCookie())
    expect(
      (
        await client.post('/api/conversations/html-agent/plan-page', {
          documentId: 'html-1',
          mode: 'wrong',
          instruction: 'Guide',
        })
      ).status,
    ).toBe(400)
    expect(writer.plan).not.toHaveBeenCalled()
    const response = await client.post('/api/conversations/html-agent/plan-page', {
      documentId: 'html-1',
      mode: 'new',
      instruction: 'Guide',
    })
    expect(response).toMatchObject({ status: 200, body: brief })
    expect(writer.plan.mock.calls[0]?.[0]).toMatchObject({
      documentId: 'html-1',
      mode: 'new',
      instruction: 'Guide',
    })
  })

  it('validates a confirmed brief before writing and preserves service errors', async () => {
    const client = makeClient(await getAuthCookie())
    expect(
      (
        await client.post('/api/conversations/html-agent/write-document', {
          documentId: 'html-1',
          kind: 'design',
          instruction: 'Build',
          brief: { title: 'Bad' },
        })
      ).status,
    ).toBe(400)
    expect(writer.write).not.toHaveBeenCalled()
    const response = await client.post('/api/conversations/html-agent/write-document', {
      documentId: 'html-1',
      kind: 'design',
      instruction: 'Build',
      brief,
    })
    expect(response).toMatchObject({ status: 200, body: { complete: true } })
    writer.write.mockRejectedValue(new Error('页面生成未完成'))
    const failed = await client.post<{ error: { code: string; message: string } }>(
      '/api/conversations/html-agent/write-document',
      { documentId: 'html-1', kind: 'content', instruction: 'Build', plan: 'Plan' },
    )
    expect(failed).toMatchObject({
      status: 400,
      body: { error: { code: 'HTML_WRITE_FAILED', message: '页面生成未完成' } },
    })
  })
})
