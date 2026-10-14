import { beforeAll, describe, expect, it } from 'vitest'
import { app, getAuthCookie, makeClient } from './helpers.js'
import { readNote, readNoteFrontmatter } from '../lib/vault.js'

let client: ReturnType<typeof makeClient>
beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

describe('Markdown Agent note services', () => {
  it('keeps YAML metadata in vault frontmatter and preserves the note body', async () => {
    const created = await client.post<{ id: string; path: string }>('/api/documents/notes', {
      title: 'Agent YAML before',
      body: 'Original **body**',
      tags: ['old'],
    })
    expect(created.status).toBe(201)
    const id = created.body.id
    const before = await client.get<{ yaml: string }>(
      `/api/conversations/markdown-agent/frontmatter?documentId=${encodeURIComponent(id)}`,
    )
    expect(before.body.yaml).toContain('title:')
    const updated = await client.request<{
      title: string
      tags: string[]
      body: string
      path: string
    }>('/api/conversations/markdown-agent/frontmatter', {
      method: 'PUT',
      body: JSON.stringify({
        documentId: id,
        yaml: 'title: "Agent YAML after"\ntags: ["one", "二"]\nstatus: ready\nproject:\n  phase: draft',
        expectedYaml: before.body.yaml,
      }),
    })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({
      title: 'Agent YAML after',
      tags: ['one', '二'],
      body: 'Original **body**',
    })
    const file = await readNote(updated.body.path)
    expect(file).toMatchObject({
      title: 'Agent YAML after',
      tags: ['one', '二'],
      body: 'Original **body**',
    })
    expect(await readNoteFrontmatter(updated.body.path)).toMatchObject({
      project: { phase: 'draft' },
    })
    const bodySave = await client.patch(`/api/documents/${id}`, { body: 'Saved again' })
    expect(bodySave.status).toBe(200)
    expect(await readNoteFrontmatter(updated.body.path)).toMatchObject({
      project: { phase: 'draft' },
    })
    const reopened = await client.get<{ yaml: string }>(
      `/api/conversations/markdown-agent/frontmatter?documentId=${encodeURIComponent(id)}`,
    )
    expect(reopened.body.yaml).toContain('phase: draft')
    const invalid = await client.request('/api/conversations/markdown-agent/frontmatter', {
      method: 'PUT',
      body: JSON.stringify({ documentId: id, yaml: 'id: forged', expectedYaml: before.body.yaml }),
    })
    expect(invalid.status).toBe(400)
  })

  it('rejects stale metadata after a manual rename and preserves concurrent body saves', async () => {
    const created = await client.post<{ id: string }>('/api/documents/notes', {
      title: 'Concurrent before',
      body: 'Before body',
      tags: [],
    })
    const id = created.body.id
    const before = await client.get<{ yaml: string }>(
      `/api/conversations/markdown-agent/frontmatter?documentId=${encodeURIComponent(id)}`,
    )
    const renamed = await client.patch(`/api/documents/${id}`, { title: 'Manual rename' })
    expect(renamed.status).toBe(200)
    const stale = await client.request('/api/conversations/markdown-agent/frontmatter', {
      method: 'PUT',
      body: JSON.stringify({
        documentId: id,
        yaml: 'title: "Agent rename"',
        expectedYaml: before.body.yaml,
      }),
    })
    expect(stale.status).toBe(409)
    const current = await client.get<{ yaml: string }>(
      `/api/conversations/markdown-agent/frontmatter?documentId=${encodeURIComponent(id)}`,
    )
    const [bodyWrite, metadataWrite] = await Promise.all([
      client.patch(`/api/documents/${id}`, { body: 'After **body**' }),
      client.request<{ path: string }>('/api/conversations/markdown-agent/frontmatter', {
        method: 'PUT',
        body: JSON.stringify({
          documentId: id,
          yaml: 'title: "Agent rename"',
          expectedYaml: current.body.yaml,
        }),
      }),
    ])
    expect(bodyWrite.status).toBe(200)
    expect(metadataWrite.status).toBe(200)
    const final = await client.get<{ title: string; body: string; path: string }>(
      `/api/documents/${id}`,
    )
    expect(final.body).toMatchObject({ title: 'Agent rename', body: 'After **body**' })
    expect(await readNote(final.body.path)).toMatchObject({
      title: 'Agent rename',
      body: 'After **body**',
    })
  })

  it('requires auth for image fetch and rejects a non-note target', async () => {
    const anonymous = await app.request('/api/conversations/markdown-agent/fetch-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'missing', url: 'https://example.com/image.png' }),
    })
    expect(anonymous.status).toBe(401)
    const missing = await client.post('/api/conversations/markdown-agent/fetch-image', {
      documentId: 'missing',
      url: 'https://example.com/image.png',
    })
    expect(missing.status).toBe(404)
  })
})
