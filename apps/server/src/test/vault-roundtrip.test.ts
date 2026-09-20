import { describe, expect, it, beforeAll } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { resolveInVault } from '../lib/vault.js'
import { reindexVault } from '../services/vault-index.js'
import { getAuthCookie, makeClient } from './helpers.js'

/**
 * 「文件是真相，数据库是可重建的索引」——这条规则的**可执行断言**。
 *
 * 为什么要有这个测试：这条规则写在文档和注释里，但文档会腐烂、注释会被忽略。
 * 真正的验证方式是：把数据库里那条记录删掉，重建索引，看内容是否一字不差地回来。
 *
 * 如果有人把数据库变成真相（比如把正文只存在数据库里、文件变成导出产物），
 * 这个测试会失败——那正是我们希望被拦住的改动。
 *
 * 见 docs/DECISIONS.md 与根目录 AGENTS.md 铁律 2。
 */

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

describe('文件是真相，数据库可重建', () => {
  it('删掉数据库记录后，重建索引能还原内容', async () => {
    const body = '第一条：memo 只解决 props 稳定时的重渲染。\n\n第二条：key 一定要用稳定值。'
    const created = await client.post<{ id: string; path: string }>('/api/documents/notes', {
      title: '重建索引验证券',
      body,
      tags: ['验证', '索引'],
    })
    expect(created.status).toBe(201)

    const { id, path } = created.body

    // 文件确实落盘了，且内容在里面
    const onDisk = await readFile(resolveInVault(path), 'utf8')
    expect(onDisk).toContain('memo 只解决 props 稳定时的重渲染')

    // 模拟「数据库丢了」：直接删掉这条记录
    await db.delete(documents).where(sql`${documents.id} = ${id}`)
    const afterDelete = await client.get(`/api/documents/${id}`)
    expect(afterDelete.status).toBe(404)

    // 重建索引，内容应当一字不差地回来
    const result = await reindexVault()
    expect(result.scanned).toBeGreaterThan(0)

    const restored = await client.get<{
      id: string
      title: string
      body: string
      tags: string[]
    }>(`/api/documents/${id}`)

    expect(restored.status).toBe(200)
    expect(restored.body.title).toBe('重建索引验证券')
    expect(restored.body.body.trim()).toBe(body.trim())
    // 标签也在 frontmatter 里，所以一起回来
    expect([...restored.body.tags].toSorted()).toEqual(['索引', '验证'])
  })

  it('文件被外部删除后，重建索引把记录标记为已删除', async () => {
    const created = await client.post<{ id: string; path: string }>('/api/documents/notes', {
      title: '外部删除验证券',
      body: '这条的 md 文件会被手工删掉。',
      tags: [],
    })
    const { id, path } = created.body

    await rm(resolveInVault(path))
    await reindexVault()

    const after = await client.get(`/api/documents/${id}`)
    expect(after.status).toBe(404)
  })
})
