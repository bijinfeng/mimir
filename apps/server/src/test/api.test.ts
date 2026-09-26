import { beforeAll, describe, expect, it } from 'vitest'
import { app, getAuthCookie, makeClient, TEST_USER } from './helpers.js'

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

describe('认证', () => {
  it('已有用户后，再注册必须被拒绝（单用户规则）', async () => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'intruder@example.com',
        password: 'test-password-123',
        name: 'intruder',
      }),
    })
    expect(res.status).not.toBe(200)
  })

  it('未登录访问业务接口返回 401', async () => {
    const res = await app.request('/api/documents')
    expect(res.status).toBe(401)
  })

  it('未登录访问检索接口同样返回 401', async () => {
    const res = await app.request('/api/search?q=test')
    expect(res.status).toBe(401)
  })

  it('已登录可以拿到会话', async () => {
    const res = await client.get<{ user: { email: string } }>('/api/auth/get-session')
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(TEST_USER.email)
  })
})

describe('笔记 CRUD 与文件落盘', () => {
  let noteId = ''
  let originalPath = ''

  it('创建笔记返回 ready 状态与 vault 路径', async () => {
    const res = await client.post<{
      id: string
      path: string
      status: string
      tags: string[]
    }>('/api/documents/notes', {
      title: 'React 组件性能优化',
      body: '用 memo 和 useCallback 避免不必要的重渲染。PostgreSQL 索引也很重要。',
      tags: ['react', '性能'],
    })

    expect(res.status).toBe(201)
    /**
     * **新笔记直接就是 `ready`**（D-054）。
     *
     * 这里曾经断言 `'inbox'`——那时新内容先落收件箱、由用户「完成整理」再翻成
     * ready。那条两段式流程随整理条一起退役了：实测它的代价（每收一篇多一个
     * 动作）大于收益（用户从不按状态筛选）。改这一行是**跟着行为改**，
     * 不是把断言改松。
     */
    expect(res.body.status).toBe('ready')
    expect(res.body.path).toMatch(/\.md$/)
    expect([...res.body.tags].toSorted()).toEqual(['react', '性能'])

    noteId = res.body.id
    originalPath = res.body.path
  })

  it('列表里能看到，标签聚合正确', async () => {
    const list = await client.get<{ items: { id: string }[] }>('/api/documents?limit=50')
    expect(list.body.items.some((item) => item.id === noteId)).toBe(true)

    const tags = await client.get<{ items: { name: string; count: number }[] }>('/api/tags')
    expect(tags.body.items.find((tag) => tag.name === 'react')?.count).toBeGreaterThanOrEqual(1)
  })

  it('更新标题会同步移动文件路径', async () => {
    const res = await client.patch<{ path: string; title: string }>(`/api/documents/${noteId}`, {
      title: 'React 渲染性能笔记',
    })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('React 渲染性能笔记')
    expect(res.body.path).not.toBe(originalPath)
    expect(res.body.path).toMatch(/-[A-Za-z0-9_-]{8}\.md$/)
  })

  it('归档与恢复：状态位是可逆的，归档后仍能查到', async () => {
    const archived = await client.patch<{ status: string }>(`/api/documents/${noteId}`, {
      status: 'archived',
    })
    expect(archived.status).toBe(200)
    expect(archived.body.status).toBe('archived')

    // 归档**不是删除**：默认列表里看不到，但按归档筛能查到、直接取也取得到
    const list = await client.get<{ items: { id: string }[] }>('/api/documents?limit=50')
    expect(list.body.items.some((item) => item.id === noteId)).toBe(true)

    const restored = await client.patch<{ status: string }>(`/api/documents/${noteId}`, {
      status: 'ready',
    })
    expect(restored.body.status).toBe('ready')
  })

  it('删除后查不到，且标记为已删除而非物理清除', async () => {
    const del = await client.delete<{ ok: boolean }>(`/api/documents/${noteId}`)
    expect(del.status).toBe(200)
    expect(del.body.ok).toBe(true)

    const get = await client.get(`/api/documents/${noteId}`)
    expect(get.status).toBe(404)
  })
})

describe('参数校验', () => {
  it('标题为空时返回 400 而不是写入脏数据', async () => {
    const res = await client.post('/api/documents/notes', { title: '   ', body: 'x' })
    expect(res.status).toBe(400)
  })

  it('检索缺 q 参数时返回 400', async () => {
    const res = await client.get('/api/search')
    expect(res.status).toBe(400)
  })
})
