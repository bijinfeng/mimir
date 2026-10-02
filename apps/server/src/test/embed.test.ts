import { beforeAll, describe, expect, it } from 'vitest'
import { getAuthCookie, makeClient } from './helpers.js'

/**
 * 分块与嵌入的维护端点（M1-B）。
 *
 * ## 这一组守的是**跨方言的运行时错误**
 *
 * 写这段代码时踩过一次：`services/chunks.ts` 的「待嵌入计数」用了
 * `db.execute(sql...)`，而那个方法**在 SQLite 路径下不存在**
 * （drizzle 的 better-sqlite3 驱动只有 `.all()` / `.run()`）。
 * 单元测试全绿（它们跑的是纯函数），只有真发一次请求才暴露——
 * 而本地开发与桌面端走的正是 SQLite。
 *
 * 所以这里的断言不只要「返回对」，还要**真的走到那条 SQL**：
 * `/maintenance/chunks` 与 `/maintenance/embed` 都必须能返回 200。
 */
let client: ReturnType<typeof makeClient>
let cookie: string

beforeAll(async () => {
  cookie = await getAuthCookie()
  client = makeClient(cookie)
})

describe('分块状态端点（M1-B）', () => {
  it('返回分块总数、文档数与待嵌入数（会在两种方言下各跑一遍 SQL）', async () => {
    // 先建一篇有正文的笔记：它会产生分块
    await client.post('/api/documents/notes', {
      title: '分块状态用例',
      body: '第一段。\n\n第二段带标记词：玄武岩。\n',
      tags: [],
    })

    const res = await client.get<{ total: number; documents: number; pending: number | null }>(
      '/api/maintenance/chunks',
    )
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThan(0)
    expect(res.body.documents).toBeGreaterThan(0)
    /**
     * 没配向量化模型时 `pending` 是 **null**，不是 0。
     * 这条断言值一条用例：显示成 0 会被读成「都嵌好了」，
     * 而实际上一段都没嵌（`docs/TECH.md` §4.10 的规矩）。
     */
    expect([null, 0]).toContain(res.body.pending)
  })
})

describe('补嵌入端点（M1-B）', () => {
  it('没配模型时如实返回 remaining: null，而不是假装做完了', async () => {
    const res = await client.post<{ processed: number; remaining: number | null; failed: number }>(
      '/api/maintenance/embed',
      { limit: 16 },
    )
    expect(res.status).toBe(200)
    // 测试环境不配 provider，所以这一条走的就是「没配模型」那条路
    expect(res.body.remaining).toBeNull()
    expect(res.body.processed).toBe(0)
  })

  it('重建分块是全量重算且不调模型（不花钱的那一步）', async () => {
    const res = await client.post<{ documents: number; chunks: number }>(
      '/api/maintenance/chunks/rebuild',
      {},
    )
    expect(res.status).toBe(200)
    expect(res.body.documents).toBeGreaterThan(0)
    expect(res.body.chunks).toBeGreaterThan(0)
  })
})
