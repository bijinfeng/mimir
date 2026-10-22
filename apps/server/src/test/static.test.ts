import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stripFnosPrefix } from '../runtime/gateway/fnos.js'
import { createStaticMiddleware } from '../runtime/static.js'
import type { AppEnv } from '../types.js'

/** fnOS 把公开前缀原样转发到私有 socket；这里只验证 runtime 的剥离规则。 */
function stripFnosPath(path: string): Request | null {
  return stripFnosPrefix(new Request(`http://nas.test${path}`), '/app/mimir')
}

describe('生产静态资源', () => {
  let webDist: string
  let app: Hono<AppEnv>

  beforeAll(async () => {
    webDist = await mkdtemp(join(tmpdir(), 'mimir-static-'))
    await mkdir(join(webDist, 'assets'))
    await writeFile(join(webDist, 'index.html'), '<!doctype html><div id="root"></div>')
    await writeFile(join(webDist, 'assets', 'index-abc12345.js'), 'export const ready = true')
    await writeFile(join(webDist, 'favicon.svg'), '<svg></svg>')
    app = new Hono<AppEnv>()
    // 显式目录取代旧的 WEB_DIST 探测：runtime 从 RuntimeConfig 拿静态位置
    createStaticMiddleware({ dir: webDist, basePath: '/' })(app)
    // Hono 的 router 在第一次请求后冻结；路由必须在任何 request 之前注册
    app.get('/healthz', (c) => c.json({ ok: true }))
  })

  afterAll(async () => {
    await rm(webDist, { recursive: true, force: true })
  })

  it('深路由回退到 HTML，且不会长期缓存', async () => {
    const response = await app.request('/docs')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('id="root"')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('只让存在的哈希产物长期缓存，固定文件重新校验', async () => {
    const asset = await app.request('/assets/index-abc12345.js')
    expect(asset.status).toBe(200)
    expect(asset.headers.get('Cache-Control')).toContain('immutable')

    const favicon = await app.request('/favicon.svg')
    expect(favicon.status).toBe(200)
    expect(favicon.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('缺失的静态资源返回 404，而不是 SPA HTML', async () => {
    const response = await app.request('/assets/index-oldhash1.js')
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('id="root"')
  })

  it('API 与健康检查不被静态中间件接管', async () => {
    const health = await app.request('/healthz')
    expect(await health.json()).toEqual({ ok: true })

    const api = await app.request('/api/does-not-exist')
    expect(api.status).toBe(404)
    expect(await api.text()).not.toContain('id="root"')
  })

  it('fnOS 网关前缀映射静态资源和深路由，拒绝前缀外路径', async () => {
    const asset = stripFnosPath('/app/mimir/assets/index-abc12345.js')
    expect(asset).not.toBeNull()
    expect(await (await app.fetch(asset!)).text()).toContain('ready = true')

    const deepRoute = stripFnosPath('/app/mimir/docs/42')
    expect(deepRoute).not.toBeNull()
    expect(await (await app.fetch(deepRoute!)).text()).toContain('id="root"')

    expect(stripFnosPath('/assets/index-abc12345.js')).toBeNull()
    expect(stripFnosPath('/app/mimir-evil/docs')).toBeNull()
  })
})
