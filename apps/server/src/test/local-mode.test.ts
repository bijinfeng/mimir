import { describe, expect, it } from 'vitest'
import { app } from './helpers.js'

/**
 * 本地模式（D-100）的集成测试。
 *
 * **这一整个文件只跑在本地模式下**（`vitest.local.config.ts` 的
 * `LOCAL_MODE_TEST_ENV`）。为什么要单独一个进程、为什么不能与其余测试
 * 共用环境，写在 `test/config.ts` 的注释里；这里只说断言在守什么：
 *
 * | 断言 | 守的是 |
 * |---|---|
 * | 不带令牌 → 401 | 「免登录」不等于「免鉴权」，跨站请求仍然进不来 |
 * | 带令牌 → 200 | 桌面壳里用户什么都不用做就能用 |
 * | 错误令牌 → 401 | 令牌真的在比较，不是一个摆设 |
 * | `get-session` 返回本机用户 | 前端的鉴权守卫、侧栏头像零改动 |
 * | 改名立即生效 | 缓存刷新那一处（只写库不清缓存 = 改了不生效） |
 * | 非回环地址启动即拒绝 | 免登录只能活在「同一台机器」这个前提上 |
 */

const TOKEN = process.env.MIMIR_LOCAL_TOKEN ?? ''
const cookie = `mimir-local=${TOKEN}`

describe('本地模式：鉴权', () => {
  it('不带令牌的业务请求仍然 401', async () => {
    const res = await app.request('/api/documents')
    expect(res.status).toBe(401)
  })

  it('带令牌即可访问业务接口（不需要登录）', async () => {
    const res = await app.request('/api/documents', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
  })

  it('错误的令牌不放行', async () => {
    const res = await app.request('/api/documents', {
      headers: { Cookie: 'mimir-local=not-the-right-token-padding-padding' },
    })
    expect(res.status).toBe(401)
  })

  it('本机用户的会话可以直接读到（前端守卫依赖它）', async () => {
    const res = await app.request('/api/auth/get-session', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { email: string; name: string } }
    expect(body.user.email).toBe('local@mimir.local')
  })

  it('登录页状态如实告知本地模式', async () => {
    const res = await app.request('/api/auth/setup/state')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { localMode: boolean }
    expect(body.localMode).toBe(true)
  })

  it('运行时配置如实告知本地模式（账号分区依赖它）', async () => {
    const res = await app.request('/api/config', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { localMode: boolean }
    expect(body.localMode).toBe(true)
  })
})

describe('本地模式：本机用户资料', () => {
  it('改名立即生效（包括 get-session 读到的值）', async () => {
    const res = await app.request('/api/local/profile', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '这台机器的主人' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()) as { name: string }).toEqual({ name: '这台机器的主人' })

    const session = await app.request('/api/auth/get-session', { headers: { Cookie: cookie } })
    const body = (await session.json()) as { user: { name: string } }
    expect(body.user.name).toBe('这台机器的主人')
  })

  it('空名称被拒绝', async () => {
    const res = await app.request('/api/local/profile', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('没有令牌时同样要鉴权', async () => {
    const res = await app.request('/api/local/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('本地模式：监听地址', () => {
  it('拒绝绑定非回环地址（免登录的前提是同一台机器）', async () => {
    const { startServer } = await import('../index.js')
    await expect(startServer({ hostname: '0.0.0.0' })).rejects.toThrow(/回环/)
  })
})
