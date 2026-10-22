import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadRuntimeConfigFromEnv } from '../runtime/config.js'
import { startRuntime, type RuntimeHandle } from '../runtime/start.js'

/**
 * 真实 TCP 启动路径（AC2 的 TCP/SQLite 那一路）。
 *
 * 其他集成测试用 `createApp().request()` 直接调 Hono，绕过了 listener；
 * 这条用例真的 listen 一个随机端口，覆盖 `startRuntime → boot → TCP`
 * 全链路，并验证关闭是幂等的。
 *
 * 只覆盖 `toServerConfig()` 的相等性：`PORT` 与 `SERVER_URL` 是 runtime 的
 * 监听/公开地址，不进 `ServerConfig` 的业务字段（baseURL 需要保持一致，
 * 所以显式沿用 setup 的 3000）。
 */
describe('runtime TCP 启动', () => {
  let handle: RuntimeHandle

  beforeAll(async () => {
    const config = loadRuntimeConfigFromEnv({
      env: { ...process.env, PORT: '0', SERVER_URL: 'http://localhost:3000' },
      loadEnvFile: false,
    })
    if (config.listener.kind !== 'tcp') throw new Error('测试配置必须是 TCP listener')
    handle = await startRuntime(config)
  }, 30_000)

  afterAll(async () => {
    await handle?.close()
    await handle?.close()
  })

  it('healthz 经真实 HTTP listener 返回版本与协议', async () => {
    const response = await fetch(`${handle.origin}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      protocolVersion: 1,
    })
  })

  it('业务路由仍然要求 Mimir 会话', async () => {
    const response = await fetch(`${handle.origin}/api/documents`)
    expect(response.status).toBe(401)
  })
})
