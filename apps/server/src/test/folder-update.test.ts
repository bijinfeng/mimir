import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FolderMoveResponse, FolderNode, FolderUpdateRecovery } from '@mimir/shared'
import { folderMoveResponseSchema, folderMoveSchema } from '@mimir/shared'
import { db } from '../db/client.js'
import { documents, folders } from '../db/schema.js'
import * as uploads from '../lib/uploads.js'
import { readNoteFrontmatter, toStorageKey } from '../lib/vault.js'
import { activeStorage } from '../plugins/host.js'
import { app, getAuthCookie, makeClient } from './helpers.js'

let client: ReturnType<typeof makeClient>
let cookie: string
let sequence = 0
const unique = () => `编辑知识库${Date.now()}${++sequence}`

beforeAll(async () => {
  cookie = await getAuthCookie()
  client = makeClient(cookie)
})
afterEach(() => vi.restoreAllMocks())

async function root(path: string): Promise<FolderNode | undefined> {
  const tree = await client.get<{ items: FolderNode[] }>('/api/folders')
  return tree.body.items.find((node) => node.path === path)
}
async function create(path = unique(), description = '原描述') {
  expect((await client.post('/api/folders', { path, description, icon: 'tech' })).status).toBe(201)
  return path
}
async function note(folder: string) {
  const created = await client.post<{ id: string; path: string }>('/api/documents/notes', {
    title: unique(),
    body: '需要完整保留的正文',
    tags: ['编辑测试'],
    folder,
  })
  expect(created.status).toBe(201)
  return created.body
}
async function documentFolder(id: string) {
  const [row] = await db
    .select({ folder: documents.folder })
    .from(documents)
    .where(eq(documents.id, id))
  return row?.folder
}
type UpdateFailure = { error: { code: string; details: { recovery: FolderUpdateRecovery } } }

// Real API tests cover both the shared request and persistence, including the
// boundary where a file write succeeds but a later file/SQL write fails.
describe('知识库名称与描述更新', () => {
  it('共享契约兼容旧请求与旧响应，描述不可为 null 或超过 2000 字', () => {
    expect(folderMoveSchema.parse({ from: '甲', to: '乙' })).toEqual({ from: '甲', to: '乙' })
    expect(folderMoveResponseSchema.parse({ moved: 0 })).toEqual({ moved: 0 })
    expect(folderMoveSchema.safeParse({ from: '甲', to: '甲', description: '' }).success).toBe(true)
    expect(folderMoveSchema.safeParse({ from: '甲', to: '甲', description: null }).success).toBe(
      false,
    )
    expect(
      folderMoveSchema.safeParse({ from: '甲', to: '甲', description: '字'.repeat(2001) }).success,
    ).toBe(false)
  })

  it('未登录 PATCH 仍被保护', async () => {
    const response = await app.request('/api/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '甲', to: '甲', description: '描述' }),
    })
    expect(response.status).toBe(401)
  })

  it('同路径可以只改描述，显式空串清空，保留图标与短码', async () => {
    const path = await create()
    const before = await root(path)
    const edited = await client.patch<FolderMoveResponse>('/api/folders', {
      from: path,
      to: path,
      description: ' 新描述 ',
    })
    expect(edited.status).toBe(200)
    expect(edited.body).toEqual({ moved: 0, path, description: '新描述' })
    expect(await root(path)).toMatchObject({
      description: '新描述',
      icon: 'tech',
      code: before?.code,
    })
    const cleared = await client.patch<FolderMoveResponse>('/api/folders', {
      from: path,
      to: path,
      description: '',
    })
    expect(cleared.status).toBe(200)
    expect(cleared.body.description).toBeNull()
    expect((await root(path))?.description).toBeNull()
  })

  it('省略描述的旧改名保留历史长描述，两项未变不写文件', async () => {
    const description = '历史描述'.repeat(400)
    const from = await create(undefined, description)
    const to = `${from}改名`
    const moved = await client.patch<FolderMoveResponse>('/api/folders', { from, to })
    expect(moved.status).toBe(200)
    expect((await root(to))?.description).toBe(description)
    const write = vi.spyOn(activeStorage(), 'write')
    const same = await client.patch('/api/folders', { from: to, to })
    expect(same.status).toBe(200)
    expect(write).not.toHaveBeenCalled()
  })

  it('同时改名与描述，子目录与笔记 frontmatter 跟随，重建后仍一致', async () => {
    const from = await create()
    const to = `${from}新名称`
    const child = await note(`${from}/子目录`)
    const storage = activeStorage()
    const key = toStorageKey(child.path)
    const bytes = Buffer.from(await storage.read(key)).toString('utf8')
    await storage.write(key, bytes.replace('---\n', '---\ncustom: 保留自定义字段\n'))
    const before = await root(from)
    const changed = await client.patch<FolderMoveResponse>('/api/folders', {
      from,
      to,
      description: '同时保存的描述',
    })
    expect(changed.status).toBe(200)
    expect(changed.body).toEqual({ moved: 1, path: to, description: '同时保存的描述' })
    expect(await root(from)).toBeUndefined()
    expect(await root(to)).toMatchObject({
      description: '同时保存的描述',
      code: before?.code,
      icon: 'tech',
    })
    expect(await documentFolder(child.id)).toBe(`${to}/子目录`)
    expect(await readNoteFrontmatter(child.path)).toMatchObject({
      folder: `${to}/子目录`,
      custom: '保留自定义字段',
    })
    expect((await client.post('/api/maintenance/reindex', {})).status).toBe(200)
    expect(await documentFolder(child.id)).toBe(`${to}/子目录`)
  })

  it('不存在、冲突与非法描述返回既有错误，不能修改原描述', async () => {
    const from = await create()
    const to = await create()
    expect((await client.patch('/api/folders', { from, to, description: '不能生效' })).status).toBe(
      409,
    )
    expect((await root(from))?.description).toBe('原描述')
    expect(
      (await client.patch('/api/folders', { from: unique(), to: unique(), description: '描述' }))
        .status,
    ).toBe(404)
    expect((await client.patch('/api/folders', { from: unique(), to: unique() })).status).toBe(404)
    expect((await client.patch('/api/folders', { from, to: from, description: null })).status).toBe(
      400,
    )
    expect(
      (await client.patch('/api/folders', { from, to: from, description: '字'.repeat(2001) }))
        .status,
    ).toBe(400)
  })

  it('文件写到一半失败：恢复原始字节与两个字段后可安全重试', async () => {
    const from = await create()
    const to = `${from}重试`
    const a = await note(from)
    const b = await note(`${from}/子目录`)
    const storage = activeStorage()
    const originals = await Promise.all([a, b].map((item) => storage.read(toStorageKey(item.path))))
    const originalWrite = storage.write.bind(storage)
    let calls = 0
    vi.spyOn(storage, 'write').mockImplementation(async (key, data) => {
      if (++calls === 2) throw new Error('受控第二次文件写入失败')
      return originalWrite(key, data)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = await client.patch<UpdateFailure>('/api/folders', {
      from,
      to,
      description: '新描述',
    })
    expect(failed.status).toBe(500)
    expect(failed.body.error.code).toBe('FOLDER_UPDATE_FAILED')
    expect(failed.body.error.details.recovery).toMatchObject({
      path: from,
      description: '原描述',
      retrySafe: true,
      code: (await root(from))?.code,
    })
    for (const [index, item] of [a, b].entries()) {
      expect(await storage.read(toStorageKey(item.path))).toEqual(originals[index])
    }
    expect(await documentFolder(a.id)).toBe(from)
    expect(await documentFolder(b.id)).toBe(`${from}/子目录`)
    expect(await root(to)).toBeUndefined()
    expect((await client.patch('/api/folders', { from, to, description: '新描述' })).status).toBe(
      200,
    )
    expect((await root(to))?.description).toBe('新描述')
  })

  it('文件已写但目录 SQL 失败：恢复文件与索引，不假报保存成功', async () => {
    const from = await create()
    const to = `${from}新名称`
    const a = await note(from)
    const storage = activeStorage()
    const originalBytes = await storage.read(toStorageKey(a.path))
    const originalUpdate = db.update.bind(db)
    let failedOnce = false
    vi.spyOn(db, 'update').mockImplementation((table) => {
      if (table === folders && !failedOnce) {
        failedOnce = true
        throw new Error('受控目录 SQL 失败')
      }
      return originalUpdate(table)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = await client.patch<UpdateFailure>('/api/folders', {
      from,
      to,
      description: '新描述',
    })
    expect(failed.status).toBe(500)
    expect(failed.body.error.details.recovery).toMatchObject({
      path: from,
      description: '原描述',
      retrySafe: true,
    })
    expect(await storage.read(toStorageKey(a.path))).toEqual(originalBytes)
    expect(await documentFolder(a.id)).toBe(from)
    expect(await root(to)).toBeUndefined()
    expect((await root(from))?.description).toBe('原描述')
    expect((await client.patch('/api/folders', { from, to, description: '新描述' })).status).toBe(
      200,
    )
  })

  it('补偿也失败时返回实际路径和禁止盲重试的恢复合同', async () => {
    const from = await create()
    const a = await note(from)
    const b = await note(from)
    const storage = activeStorage()
    const originals = await Promise.all([a, b].map((item) => storage.read(toStorageKey(item.path))))
    const originalWrite = storage.write.bind(storage)
    let calls = 0
    const write = vi.spyOn(storage, 'write').mockImplementation(async (key, data) => {
      if (++calls >= 2) throw new Error('受控写入与恢复均失败')
      return originalWrite(key, data)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const failed = await client.patch<UpdateFailure>('/api/folders', {
        from,
        to: `${from}新名称`,
        description: '新描述',
      })
      expect(failed.status).toBe(500)
      expect(failed.body.error.details.recovery).toMatchObject({
        path: from,
        description: '原描述',
        retrySafe: false,
      })
    } finally {
      write.mockRestore()
      for (const [index, item] of [a, b].entries())
        await originalWrite(toStorageKey(item.path), originals[index]!)
    }
  })

  it('上传件 meta.json 写入失败阻止改名，恢复后可重试且重建不回退', async () => {
    const from = await create()
    const to = `${from}新名称`
    const form = new FormData()
    form.append('file', new Blob(['上传正文'], { type: 'text/plain' }), 'edit.txt')
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    expect(uploaded.status).toBe(201)
    const { document } = (await uploaded.json()) as { document: { id: string } }
    expect((await client.patch(`/api/documents/${document.id}`, { folder: from })).status).toBe(200)
    vi.spyOn(uploads, 'writeUploadMeta').mockRejectedValueOnce(new Error('受控上传元数据失败'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = await client.patch<UpdateFailure>('/api/folders', {
      from,
      to,
      description: '新描述',
    })
    expect(failed.status).toBe(500)
    expect(failed.body.error.details.recovery.retrySafe).toBe(true)
    expect((await uploads.readUploadMeta(document.id))?.folder).toBe(from)
    expect(await documentFolder(document.id)).toBe(from)
    expect((await client.patch('/api/folders', { from, to, description: '新描述' })).status).toBe(
      200,
    )
    expect((await uploads.readUploadMeta(document.id))?.folder).toBe(to)
    expect((await client.post('/api/maintenance/reindex', {})).status).toBe(200)
    expect(await documentFolder(document.id)).toBe(to)
  })
})
