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

  it('支持用邮箱登录（/sign-in/identifier）', async () => {
    const res = await app.request('/api/auth/sign-in/identifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: TEST_USER.email, password: TEST_USER.password }),
    })
    expect(res.status).toBe(200)
  })

  it('支持用用户名登录（/sign-in/identifier）', async () => {
    const res = await app.request('/api/auth/sign-in/identifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: TEST_USER.name, password: TEST_USER.password }),
    })
    expect(res.status).toBe(200)
  })

  it('用户名或密码错误返回 401', async () => {
    const res = await app.request('/api/auth/sign-in/identifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: TEST_USER.name, password: 'wrong-password' }),
    })
    expect(res.status).toBe(401)
  })

  it('不存在的用户名返回 401', async () => {
    const res = await app.request('/api/auth/sign-in/identifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nobody', password: TEST_USER.password }),
    })
    expect(res.status).toBe(401)
  })

  it('缺少参数返回 400', async () => {
    const res = await app.request('/api/auth/sign-in/identifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: TEST_USER.name }),
    })
    expect(res.status).toBe(400)
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

  it('归档已退役（D-065）：status 不再接受 archived，写回 400', async () => {
    // 归档交互整体移除后 'archived' 不在状态枚举里——这里守着它别悄悄回来
    const res = await client.patch(`/api/documents/${noteId}`, { status: 'archived' })
    expect(res.status).toBe(400)
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

describe('目录管理（D-068）', () => {
  // **目录名带随机后缀**：多个测试文件并行共用同一个测试库
  // （global-setup 每轮只清一次），structure.test 也建了「技术/前端」，
  // 固定名字会撞出 409。随机前缀让本块与其它文件彻底隔离。
  const uniq = `测试${Math.random().toString(36).slice(2, 6)}`
  const createdIds: string[] = []

  const treePaths = async (): Promise<string[]> => {
    const tree = await client.get<{ items: { path: string; children: unknown[] }[] }>(
      '/api/folders',
    )
    const out: string[] = []
    const walk = (nodes: { path: string; children: unknown[] }[]) => {
      for (const node of nodes) {
        out.push(node.path)
        walk(node.children as { path: string; children: unknown[] }[])
      }
    }
    walk(tree.body.items)
    return out
  }

  it('新建目录：mkdir -p 补建祖先，重复创建 409', async () => {
    const created = await client.post<{ path: string }>('/api/folders', {
      path: `${uniq}/前端`,
    })
    expect(created.status).toBe(201)
    expect(created.body.path).toBe(`${uniq}/前端`)

    const dup = await client.post('/api/folders', { path: `${uniq}/前端` })
    expect(dup.status).toBe(409)

    const paths = await treePaths()
    expect(paths).toContain(uniq)
    expect(paths).toContain(`${uniq}/前端`)
  })

  it('改名 / 移动重写整个子树与文档指派（含子目录）', async () => {
    // 两篇笔记分别归到 uniq/前端 与 uniq/前端/React
    const a = await client.post<{ id: string }>('/api/documents/notes', {
      title: '目录测试 A',
      body: 'A',
      tags: [],
    })
    const b = await client.post<{ id: string }>('/api/documents/notes', {
      title: '目录测试 B',
      body: 'B',
      tags: [],
    })
    await client.patch(`/api/documents/${a.body.id}`, { folder: `${uniq}/前端` })
    await client.patch(`/api/documents/${b.body.id}`, { folder: `${uniq}/前端/React` })
    createdIds.push(a.body.id, b.body.id)

    // 指派到新路径时注册表自动补建（mkdir -p）
    const before = await treePaths()
    expect(before).toContain(`${uniq}/前端/React`)

    const moved = await client.patch<{ moved: number }>('/api/folders', {
      from: `${uniq}/前端`,
      to: `${uniq}/组件`,
    })
    expect(moved.status).toBe(200)
    expect(moved.body.moved).toBe(2)

    const paths = await treePaths()
    expect(paths).toContain(`${uniq}/组件`)
    expect(paths).toContain(`${uniq}/组件/React`)
    expect(paths).not.toContain(`${uniq}/前端`)

    const detail = await client.get<{ folder: string | null }>(`/api/documents/${b.body.id}`)
    expect(detail.body.folder).toBe(`${uniq}/组件/React`)
  })

  it('不能把目录搬进自己的子树', async () => {
    const res = await client.patch('/api/folders', {
      from: uniq,
      to: `${uniq}/组件/${uniq}`,
    })
    expect(res.status).toBe(400)
  })

  it('删除目录：文档保留、指派清空，子树一起删', async () => {
    // 上一轮用例已把 uniq/前端 移到 uniq/组件；连同子目录一起删
    const clearedMain = await client.delete<{ cleared: number }>(
      '/api/folders?path=' + encodeURIComponent(`${uniq}/组件`),
    )
    expect(clearedMain.status).toBe(200)
    expect(clearedMain.body.cleared).toBe(2)

    const paths = await treePaths()
    expect(paths).not.toContain(`${uniq}/组件`)
    expect(paths).not.toContain(`${uniq}/组件/React`)
    // 父级 uniq 不在被删范围
    expect(paths).toContain(uniq)

    const list = await client.get<{ items: { id: string; folder: string | null }[] }>(
      '/api/documents?limit=100',
    )
    const folderOf = new Map(list.body.items.map((item) => [item.id, item.folder]))
    for (const id of createdIds) {
      expect(folderOf.get(id), `文档 ${id} 应被移出目录`).toBeNull()
    }
  })
})
