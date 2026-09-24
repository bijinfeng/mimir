import { describe, expect, it, beforeAll } from 'vitest'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { env } from '../env.js'
import { toStorageKey } from '../lib/vault.js'
import { activeStorage } from '../plugins/host.js'
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
 * ## 断言分两层，缺一不可
 *
 *  1. **通过存储接缝读**（`activeStorage().read`）——后端无关的那一层，
 *     验证的是「写进去的东西真的落到了接缝的另一头」
 *  2. **直接读磁盘路径**——这是**本地后端特有**的性质，也是整个项目
 *     头条主张的一半：「文件可以直接用 Typora / Obsidian 打开」。
 *     只做第 1 层的话，本地后端把文件存进某个数据库大字段也能骗过测试
 *
 * 见 docs/DECISIONS.md 与根目录 AGENTS.md 铁律 2。
 */

/** key → 磁盘上的绝对路径。**只对本地后端成立**，测试环境固定用它 */
function onDiskPath(vaultPath: string): string {
  return resolve(env.dataDir, toStorageKey(vaultPath))
}

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

    // 文件确实落到了存储层，且内容在里面
    const stored = await activeStorage().read(toStorageKey(path))
    expect(Buffer.from(stored).toString('utf8')).toContain('memo 只解决 props 稳定时的重渲染')

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

  /**
   * 本地后端仍然是**普通文件**，而且落在 `DATA_DIR` 下可预期的位置。
   *
   * 这一条守的是「可以直接用 Typora / Obsidian 打开、可以 git 版本管理」
   * 这句主张（`lib/vault.ts` 的文件头）。文件跑到 `data/vault/` 之外的
   * 任何布局都会让它失败——而那正是需要被拦住的改动
   * （`docs/RESEARCH.md` §10.8 记了换成 S3 之后这部分性质的真实损失）。
   */
  it('本地后端把笔记写成 DATA_DIR 下的普通 md 文件', async () => {
    const created = await client.post<{ id: string; path: string }>('/api/documents/notes', {
      title: '磁盘布局验证券',
      body: '这条只验证它躺在磁盘上的位置。',
      tags: [],
    })
    expect(created.status).toBe(201)

    // path（vault 相对）→ key → 磁盘绝对路径
    const abs = onDiskPath(created.body.path)
    expect(abs.startsWith(resolve(env.dataDir, 'vault'))).toBe(true)
    expect(abs.endsWith('.md')).toBe(true)
    expect(created.body.path).toMatch(/^\d{4}\/\d{2}\/.+\.md$/)

    // 磁盘上真的读得到，且带 frontmatter（外部工具才认得出元数据）
    const raw = await activeStorage().read(toStorageKey(created.body.path))
    const text = Buffer.from(raw).toString('utf8')
    expect(text.startsWith('---')).toBe(true)
    expect(text).toContain('title: 磁盘布局验证券')
  })

  it('文件被外部删除后，重建索引把记录标记为已删除', async () => {
    const created = await client.post<{ id: string; path: string }>('/api/documents/notes', {
      title: '外部删除验证券',
      body: '这条的 md 文件会被手工删掉。',
      tags: [],
    })
    const { id, path } = created.body

    await rm(onDiskPath(path))
    await reindexVault()

    const after = await client.get(`/api/documents/${id}`)
    expect(after.status).toBe(404)
  })
})
