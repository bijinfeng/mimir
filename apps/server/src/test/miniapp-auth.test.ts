import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { MiniappLoginResponse } from '@mimir/shared/miniapp'
import { db } from '../db/client.js'
import { miniappDevices, session } from '../db/schema.js'
import { app, getAuthCookie, TEST_USER } from './helpers.js'

// Isolated to this test module; other suites keep the production default disabled.
vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>()
  return { ...actual, env: { ...actual.env, miniappEnabled: true } }
})

beforeAll(async () => {
  await getAuthCookie()
})
async function login(identifier = TEST_USER.email) {
  const response = await app.request('/api/miniapp/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password: TEST_USER.password, deviceName: 'test-device' }),
  })
  expect(response.status).toBe(200)
  return { response, body: (await response.json()) as MiniappLoginResponse }
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

describe('小程序有限权限设备凭证', () => {
  it('邮箱和用户名登录复用既有账号，数据库只存 token 哈希', async () => {
    const { response, body } = await login(TEST_USER.name)
    expect(body.user.email).toBe(TEST_USER.email)
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(response.headers.get('set-cookie')).toBeNull()
    const [device] = await db
      .select()
      .from(miniappDevices)
      .where(eq(miniappDevices.id, body.deviceId))
    expect(device?.tokenHash).toBe(createHash('sha256').update(body.token).digest('hex'))
    expect(device?.tokenHash).not.toBe(body.token)
    const sessionResponse = await app.request('/api/miniapp/auth/session', {
      headers: bearer(body.token),
    })
    expect(sessionResponse.status).toBe(200)
    const sessionBody = (await sessionResponse.json()) as Record<string, unknown>
    expect(sessionBody.deviceId).toBe(body.deviceId)
    expect(sessionBody).not.toHaveProperty('token')
    expect(sessionResponse.headers.get('cache-control')).toContain('no-store')
  })

  it('设备 bearer 不能访问普通配置 API，cookie 不能代替设备凭证', async () => {
    const { body } = await login()
    const response = await app.request('/api/config', { headers: bearer(body.token) })
    expect(response.status).toBe(401)
    const cookieOnly = await app.request('/api/miniapp/folders', {
      headers: { Cookie: await getAuthCookie() },
    })
    expect(cookieOnly.status).toBe(401)
    const forbiddenPath = await app.request('/api/miniapp/config', { headers: bearer(body.token) })
    expect(forbiddenPath.status).toBe(404)
  })

  it('登出撤销设备和对应 backing session，不能重放 token', async () => {
    const { body } = await login()
    const [device] = await db
      .select()
      .from(miniappDevices)
      .where(eq(miniappDevices.id, body.deviceId))
    expect(device).toBeDefined()
    const loggedOut = await app.request('/api/miniapp/auth/logout', {
      method: 'POST',
      headers: bearer(body.token),
    })
    expect(loggedOut.status).toBe(200)
    expect((await db.select().from(session).where(eq(session.id, device!.sessionId))).length).toBe(
      0,
    )
    const rejected = await app.request('/api/miniapp/auth/session', { headers: bearer(body.token) })
    expect(rejected.status).toBe(401)
  })

  it('过期设备与被撤销的 backing session 均不能继续使用', async () => {
    const expired = await login()
    await db
      .update(miniappDevices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(miniappDevices.id, expired.body.deviceId))
    expect(
      (await app.request('/api/miniapp/folders', { headers: bearer(expired.body.token) })).status,
    ).toBe(401)
    const revoked = await login()
    const [device] = await db
      .select()
      .from(miniappDevices)
      .where(eq(miniappDevices.id, revoked.body.deviceId))
    await db.delete(session).where(eq(session.id, device!.sessionId))
    expect(
      (await app.request('/api/miniapp/folders', { headers: bearer(revoked.body.token) })).status,
    ).toBe(401)
  })

  it('缺失或畸形凭证不能读取私有文档', async () => {
    expect((await app.request('/api/miniapp/documents')).status).toBe(401)
    expect(
      (await app.request('/api/miniapp/documents', { headers: bearer('invalid') })).status,
    ).toBe(401)
  })
})
