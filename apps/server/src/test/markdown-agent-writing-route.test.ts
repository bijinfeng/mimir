import { describe, expect, it, vi } from 'vitest'
import { createNote } from '../services/documents.js'
import { app, getAuthCookie } from './helpers.js'
const writer = vi.hoisted(() => ({
  stream: vi.fn<(...args: unknown[]) => AsyncGenerator<unknown>>(),
  write: vi.fn<(...args: unknown[]) => Promise<string>>(),
}))
vi.mock('../services/markdown-agent-writing.js', () => ({
  streamMarkdownDocument: writer.stream,
  writeMarkdownDocument: writer.write,
}))
const request = (documentId: string) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ documentId, plan: '写指南' }),
})
describe('Markdown writing route', () => {
  it('streams before completion, keeps late errors and enforces auth and note identity', async () => {
    const url = '/api/conversations/markdown-agent/write-document?stream=1'
    expect((await app.request(url, request('unknown'))).status).toBe(401)
    const cookie = await getAuthCookie()
    const note = await createNote({ title: '流式验收', body: '原文', tags: [] })
    const missing = await app.request(url, {
      ...request('unknown'),
      headers: { ...request('unknown').headers, Cookie: cookie },
    })
    expect(missing.status).toBe(404)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    writer.stream.mockImplementation(async function* () {
      yield { type: 'delta', text: '第一段' }
      await gate
      throw new Error('模型连接中断')
    })
    const response = await app.request(url, {
      ...request(note.id),
      headers: { ...request(note.id).headers, Cookie: cookie },
    })
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('第一段')
    release()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('模型连接中断')
    expect((await reader.read()).done).toBe(true)
    expect(writer.write).not.toHaveBeenCalled()
  })
})
