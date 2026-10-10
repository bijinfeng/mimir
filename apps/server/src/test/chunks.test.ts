import { beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chunks } from '../db/schema.js'
import { chunkText } from '../lib/chunk.js'
import { assembleCitations, searchChunks } from '../search/index.js'
import { createNote, updateNote } from '../services/documents.js'
import { getAuthCookie, makeClient } from './helpers.js'

/**
 * M1-C 的检索单元回归（`.trellis/spec/project/architecture.md` §9.5 的另一半）。
 *
 * M0 的检索单元是文档，M1 是分块。这一组的价值在于**守住那几个
 * 「界面看不出来」的性质**：
 *
 * | 断言 | 它防的静默错误 |
 * |---|---|
 * | 通道返回分块 id | 返回文档 id 时引用组装取不到分块正文，退回窗口片段——引用位置变成猜的 |
 * | 引用偏移可跳回原文 | `body.slice(start, end)` 不等于引用文本 → 高亮偏了，不报错 |
 * | 相邻分块合并 | 同一段话被切成三块重复进上下文，白占模型的 token 预算 |
 * | 每篇上限 | 一篇长文霸屏（上限本身是必需的，默认 3） |
 */

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

describe('检索单元下沉到分块（M1-C）', () => {
  it('通道返回的是分块 id，不是文档 id', async () => {
    const created = await client.post<{ id: string }>('/api/documents/notes', {
      title: '分块单元用例',
      body: '这一段的唯一标记词是「灯塔水母」，它只出现在这里。',
      tags: [],
    })

    const result = await searchChunks({ q: '灯塔水母', limit: 5 })
    expect(result.hits.length).toBeGreaterThan(0)

    const hit = result.hits.find((item) => item.documentId === created.body.id)
    expect(hit).toBeDefined()
    // 分块 id 的形状是 `文档 id:序号`
    expect(hit!.chunkId).toBe(`${created.body.id}:${hit!.idx}`)
    expect(hit!.chunkId).not.toBe(created.body.id)
  })

  it('引用的偏移能逐字节跳回原文', async () => {
    const body = `${'铺垫内容。'.repeat(60)}\n\n# 关键一节\n\n灯塔水母是这里唯一要记住的东西。\n`
    const created = await client.post<{ id: string }>('/api/documents/notes', {
      title: '偏移跳回用例',
      body,
      tags: [],
    })

    const result = await searchChunks({ q: '灯塔水母', limit: 5 })
    const assembled = await assembleCitations(result.hits, { limit: 8, maxPerDoc: 3 })
    const citation = assembled.find((item) => item.documentId === created.body.id)
    expect(citation).toBeDefined()

    // 引用的文字能在原文的 [start, end) 区间里找到（这是「跳回原文」的全部依据）
    expect(body.slice(citation!.start, citation!.end)).toBe(citation!.text)
  })

  it('等长正文修改后不会沿用旧分块和旧检索词', async () => {
    const before = 'alpha unique-red omega'
    const after = 'alpha unique-new omega'
    const created = await createNote({ title: '等长更新', body: before, tags: [] })

    await updateNote(created.id, { body: after })

    const rows = await db
      .select({ content: chunks.content, searchText: chunks.searchText })
      .from(chunks)
      .where(eq(chunks.documentId, created.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.content).toBe(after)
    expect(rows[0]!.searchText).toContain('new')
    expect(rows[0]!.searchText).not.toContain('red')

    const hits = await searchChunks({ q: 'unique-new', limit: 20 })
    expect(hits.hits.some((hit) => hit.documentId === created.id)).toBe(true)
  })

  it('仅改标题会更新分块检索词，而不重建正文分块', async () => {
    const created = await createNote({ title: '红色标题', body: 'body stays', tags: [] })
    const [before] = await db
      .select({ id: chunks.id, createdAt: chunks.createdAt })
      .from(chunks)
      .where(eq(chunks.documentId, created.id))

    await updateNote(created.id, { title: '蓝色标题' })

    const [after] = await db
      .select({ id: chunks.id, createdAt: chunks.createdAt, searchText: chunks.searchText })
      .from(chunks)
      .where(eq(chunks.documentId, created.id))
    expect(after!.id).toBe(before!.id)
    expect(after!.createdAt).toEqual(before!.createdAt)
    expect(after!.searchText).toContain('蓝色')
    expect(after!.searchText).not.toContain('红色')

    const hits = await searchChunks({ q: '蓝色', limit: 20 })
    expect(hits.hits.some((hit) => hit.documentId === created.id)).toBe(true)
  })

  it('手动重建能修复升级前留下的旧正文与检索词，同时保留健康分块', async () => {
    const current = 'repair-marker new-value'
    const stale = 'repair-marker old-value'
    expect(current.length).toBe(stale.length)
    const damaged = await createNote({ title: '索引修复用例', body: current, tags: [] })
    const healthy = await createNote({ title: '健康分块用例', body: '无需改动的正文', tags: [] })
    const [healthyBefore] = await db
      .select({ createdAt: chunks.createdAt })
      .from(chunks)
      .where(eq(chunks.documentId, healthy.id))

    // 模拟旧版仅按 id/偏移比较时遗留的分块；文档正文仍是新内容。
    await db
      .update(chunks)
      .set({ content: stale, searchText: stale })
      .where(eq(chunks.documentId, damaged.id))

    const rebuilt = await client.post<{ documents: number; chunks: number }>(
      '/api/maintenance/chunks/rebuild',
      {},
    )
    expect(rebuilt.status).toBe(200)
    expect(rebuilt.body.documents).toBeGreaterThanOrEqual(2)

    const [repaired] = await db
      .select({ content: chunks.content, searchText: chunks.searchText })
      .from(chunks)
      .where(eq(chunks.documentId, damaged.id))
    expect(repaired!.content).toBe(current)
    expect(repaired!.searchText).toContain('new')
    expect(repaired!.searchText).not.toContain('old')

    const [healthyAfter] = await db
      .select({ createdAt: chunks.createdAt })
      .from(chunks)
      .where(eq(chunks.documentId, healthy.id))
    expect(healthyAfter!.createdAt).toEqual(healthyBefore!.createdAt)
  })

  it('手动重建能原位修复旧标题检索词，不重建正文分块', async () => {
    const created = await createNote({ title: '现行标题词', body: 'stable body', tags: [] })
    const [before] = await db
      .select({ createdAt: chunks.createdAt })
      .from(chunks)
      .where(eq(chunks.documentId, created.id))
    await db
      .update(chunks)
      .set({ searchText: '旧版标题词 stable body' })
      .where(eq(chunks.documentId, created.id))

    const rebuilt = await client.post('/api/maintenance/chunks/rebuild', {})
    expect(rebuilt.status).toBe(200)

    const [after] = await db
      .select({ createdAt: chunks.createdAt, searchText: chunks.searchText })
      .from(chunks)
      .where(eq(chunks.documentId, created.id))
    expect(after!.createdAt).toEqual(before!.createdAt)
    expect(after!.searchText).toContain('现行')
    expect(after!.searchText).not.toContain('旧版')
  })

  it('同一篇的相邻分块被合并成一段（而不是重复进上下文）', async () => {
    // 长正文 + 小分块：同一个主题连续跨多块
    const paragraph = '关于潮汐锁定的连续叙述，每一段都相关。'
    const body = Array.from({ length: 60 }, () => paragraph).join('\n\n')

    const created = await client.post<{ id: string }>('/api/documents/notes', {
      title: '相邻合并用例',
      body,
      tags: [],
    })

    const result = await searchChunks({ q: '潮汐锁定', limit: 8 })
    const own = result.hits.filter((item) => item.documentId === created.body.id)
    // 前置条件：这一篇确实贡献了多条命中（否则合并无从谈起）
    expect(own.length).toBeGreaterThan(1)

    const assembled = await assembleCitations(result.hits, { limit: 8, maxPerDoc: 3 })
    const mine = assembled.filter((item) => item.documentId === created.body.id)

    // 合并之后**条数一定少于命中的分块数**（相邻的那些被并成了一段）
    expect(mine.length).toBeLessThan(own.length)
    // 且合并出来的每段都比单个分块长（那正是合并的意义）
    const maxChunkLength = Math.max(...own.map((item) => item.snippet.end - item.snippet.start))
    expect(mine.some((item) => item.end - item.start > maxChunkLength)).toBe(true)
    for (const citation of mine) {
      expect(citation.text).toBe(body.slice(citation.start, citation.end))
    }
  })

  it('每篇文档最多贡献 maxPerDoc 条', async () => {
    const body = Array.from({ length: 80 }, () => '独立段落，各自讲一件事，都提到信风带。').join(
      '\n\n',
    )
    await client.post('/api/documents/notes', { title: '每篇上限用例', body, tags: [] })

    const result = await searchChunks({ q: '信风带', limit: 8 })
    const assembled = await assembleCitations(result.hits, { limit: 8, maxPerDoc: 2 })

    const byDocument = new Map<string, number>()
    for (const item of assembled) {
      byDocument.set(item.documentId, (byDocument.get(item.documentId) ?? 0) + 1)
    }
    for (const count of byDocument.values()) {
      expect(count).toBeLessThanOrEqual(2)
    }
  })

  it('分块行随笔记保存一起产生，且可被重建', async () => {
    const created = await createNote({
      title: '分块重建用例',
      body: '第一段。\n\n第二段，带一个标记词：玄武岩。\n',
      tags: [],
    })

    const rows = await db
      .select({ id: chunks.id, idx: chunks.idx, content: chunks.content })
      .from(chunks)
      .where(sql`${chunks.documentId} = ${created.id}`)
      .orderBy(chunks.idx)

    expect(rows.length).toBeGreaterThan(0)
    // id 是确定性的（`文档 id:序号`），重建索引后仍是同一批 id
    expect(rows.map((row) => row.id)).toEqual(rows.map((_, i) => `${created.id}:${i}`))

    // 分块内容与正文的偏移一致（这是「引用可跳回」的底层保证）
    const full = created.body
    for (const row of rows) {
      const chunk = chunkText(full, { size: 500, overlap: 80, title: created.title }, created.id)
      const same = chunk.find((item) => item.id === row.id)
      expect(same?.content).toBe(row.content)
    }
  })
})
