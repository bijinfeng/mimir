import { existsSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer, type RunningServer } from '../index.js'
import { env } from '../env.js'
import { db } from '../db/client.js'
import { user } from '../db/schema.js'

function gatewayRequest(
  path: string,
  options: {
    method?: string
    origin?: string
    cookie?: string
    body?: unknown
  } = {},
): Promise<{ status: number; body: string; cookies: string[]; allowOrigin?: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        socketPath: env.fnosSocket,
        path,
        method: options.method ?? 'GET',
        headers: {
          Host: 'nas.example.test',
          ...(options.origin ? { Origin: options.origin } : {}),
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            cookies: res.headers['set-cookie'] ?? [],
            allowOrigin: res.headers['access-control-allow-origin'],
          }),
        )
      },
    )
    req.on('error', reject)
    req.end(options.body ? JSON.stringify(options.body) : undefined)
  })
}

describe('fnOS 私有网关', () => {
  let running: RunningServer

  beforeAll(async () => {
    running = await startServer()
  })

  afterAll(async () => {
    if (running.server.listening) {
      await new Promise<void>((resolve) => running.server.close(() => resolve()))
    }
  })

  it('即使方言对齐门传入 Postgres，fnOS 仍使用独立 SQLite 测试库与统一账号', () => {
    expect(env.dbDriver).toBe('sqlite')
    expect(env.databaseFile).toBe(join(env.repoRoot, 'data/.test-fnos/mimir.db'))
    expect(env.dataDir).toBe(join(env.repoRoot, 'data/.test-fnos'))
    expect(env.ownerEmail).toBe('admin@example.com')
    expect(env.ownerPassword).toBe('12345678')
  })

  it('只在网关前缀下提供页面与 API，业务仍要求 Mimir 会话', async () => {
    expect(existsSync(env.fnosSocket)).toBe(true)
    expect((await gatewayRequest('/app/mimir/healthz')).status).toBe(200)
    expect((await gatewayRequest('/healthz')).status).toBe(404)
    expect((await gatewayRequest('/app/mimir/api/documents')).status).toBe(401)
    expect(
      (await gatewayRequest('/app/mimir/api/documents', { origin: 'http://localhost:5173' }))
        .allowOrigin,
    ).toBeUndefined()
  })

  it('拒绝跨源登录，HTTP 登录 Cookie 限于应用路径', async () => {
    const body = { email: env.ownerEmail, password: env.ownerPassword }
    const path = '/app/mimir/api/auth/sign-in/email'
    expect(
      (await gatewayRequest(path, { method: 'POST', origin: 'https://evil.test', body })).status,
    ).toBe(403)
    const login = await gatewayRequest(path, {
      method: 'POST',
      origin: 'http://nas.example.test',
      body,
    })
    expect(login.status).toBe(200)
    expect(login.cookies.some((cookie) => cookie.includes('Path=/app/mimir'))).toBe(true)
    expect(login.cookies.every((cookie) => !cookie.includes('; Secure'))).toBe(true)
    const sessionCookie = login.cookies
      .find((cookie) => cookie.includes('session_token'))
      ?.split(';')[0]
    expect(sessionCookie).toBeTruthy()
    expect(
      (await gatewayRequest('/app/mimir/api/documents', { cookie: sessionCookie })).status,
    ).toBe(200)
  })

  it('HTTPS 登录 Cookie 标为 Secure', async () => {
    const login = await gatewayRequest('/app/mimir/api/auth/sign-in/email', {
      method: 'POST',
      origin: 'https://nas.example.test',
      body: { email: env.ownerEmail, password: env.ownerPassword },
    })
    expect(login.status).toBe(200)
    expect(login.cookies.some((cookie) => cookie.includes('; Secure'))).toBe(true)
  })

  it('数据库账号不匹配时拒绝监听，避免暴露首次注册窗口', async () => {
    await new Promise<void>((resolve) => running.server.close(() => resolve()))
    await db.update(user).set({ email: 'another-owner@example.com' })
    try {
      await expect(startServer()).rejects.toThrow(/OWNER_EMAIL/)
      expect(existsSync(env.fnosSocket)).toBe(false)
    } finally {
      await db.update(user).set({ email: env.ownerEmail })
    }
  })
})
