import { beforeAll, describe, expect, it } from 'vitest'
import { getAuthCookie, makeClient } from './helpers.js'

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

describe('站内笔记标题补全', () => {
  it('只返回标题匹配的现存笔记，并将通配符当普通字符', async () => {
    const suffix = Math.random().toString(36).slice(2, 9)
    const title = `链接目标 ${suffix} 100%`
    const note = await client.post<{ id: string }>('/api/documents/notes', {
      title,
      body: `正文里有 ${suffix}`,
    })
    const other = await client.post<{ id: string }>('/api/documents/notes', {
      title: `其他笔记 ${suffix} 100x`,
      body: title,
    })
    expect(note.status).toBe(201)
    expect(other.status).toBe(201)

    try {
      const matched = await client.get<{ items: { id: string; title: string }[] }>(
        `/api/documents/notes/lookup?q=${encodeURIComponent(`${suffix} 100%`)}`,
      )
      expect(matched.status).toBe(200)
      expect(matched.body.items).toContainEqual({ id: note.body.id, title })
      expect(matched.body.items.some((item) => item.id === other.body.id)).toBe(false)

      const literal = await client.get<{ items: { id: string }[] }>(
        `/api/documents/notes/lookup?q=${encodeURIComponent('100%')}`,
      )
      expect(literal.body.items.some((item) => item.id === note.body.id)).toBe(true)
      expect(literal.body.items.some((item) => item.id === other.body.id)).toBe(false)

      await client.delete(`/api/documents/${note.body.id}`)
      const afterTrash = await client.get<{ items: { id: string }[] }>(
        `/api/documents/notes/lookup?q=${encodeURIComponent(suffix)}`,
      )
      expect(afterTrash.body.items.some((item) => item.id === note.body.id)).toBe(false)
    } finally {
      await client.delete(`/api/documents/${note.body.id}`)
      await client.delete(`/api/documents/${other.body.id}`)
    }
  })
})
