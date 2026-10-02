import { beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chunks } from '../db/schema.js'
import { chunkText } from '../lib/chunk.js'
import { assembleCitations, searchChunks } from '../search/index.js'
import { createNote } from '../services/documents.js'
import { getAuthCookie, makeClient } from './helpers.js'

/**
 * M1-C 的检索单元回归（`docs/TECH.md` §9.5 的另一半）。
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
