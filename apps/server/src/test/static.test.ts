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

function buildApp(webDist: string, basePath: string): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  createStaticMiddleware({ dir: webDist, basePath })(app)
  // Hono 的 router 在第一次请求后冻结；路由必须在任何 request 之前注册
  app.get('/healthz', (c) => c.json({ ok: true }))
  app.get('/api/ping', (c) => c.json({ pong: true }))
  return app
}

describe('生产静态资源', () => {
  let webDist: string
  let rootApp: Hono<AppEnv>
  let subApp: Hono<AppEnv>

  beforeAll(async () => {
    webDist = await mkdtemp(join(tmpdir(), 'mimir-static-'))
    await mkdir(join(webDist, 'assets'))
    await writeFile(
      join(webDist, 'index.html'),
      '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
    )
    await writeFile(join(webDist, 'assets', 'index-abc12345.js'), 'export const ready = true')
    await writeFile(join(webDist, 'favicon.svg'), '<svg></svg>')
    rootApp = buildApp(webDist, '/')
    subApp = buildApp(webDist, '/app/mimir/')
  })

  afterAll(async () => {
    await rm(webDist, { recursive: true, force: true })
  })

  it('根路径深路由回退到 HTML，注入 base 与运行时全局，且不长期缓存', async () => {
    const response = await rootApp.request('/docs')
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('id="root"')
    expect(html).toContain('<base href="/">')
    expect(html).toContain('window.__MIMIR_BASE_PATH__="/"')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('子路径深路由注入 /app/mimir/ 的 base，并支持直接带前缀的资源请求', async () => {
    const page = await subApp.request('/app/mimir/docs/42')
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('<base href="/app/mimir/">')
    expect(html).toContain('window.__MIMIR_BASE_PATH__="/app/mimir"')

    const asset = await subApp.request('/app/mimir/assets/index-abc12345.js')
    expect(asset.status).toBe(200)
    expect(await asset.text()).toContain('ready = true')
    expect(asset.headers.get('Cache-Control')).toContain('immutable')

    // 反代已经剥过前缀时也按产物根找；深路由仍回退 HTML
    const stripped = await subApp.request('/docs')
    expect(stripped.status).toBe(200)
    expect(await stripped.text()).toContain('<base href="/app/mimir/">')
  })

  it('只让存在的哈希产物长期缓存，固定文件重新校验', async () => {
    const favicon = await rootApp.request('/favicon.svg')
    expect(favicon.status).toBe(200)
    expect(favicon.headers.get('Cache-Control')).toBe('no-cache')

    const head = await rootApp.request('/assets/index-abc12345.js', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('缺失的静态资源与目录穿越都返回 404，而不是 SPA HTML', async () => {
    const missing = await rootApp.request('/assets/index-oldhash1.js')
    expect(missing.status).toBe(404)
    expect(await missing.text()).not.toContain('id="root"')

    const traversal = await rootApp.request('/assets/%2e%2e%2f%2e%2e%2fetc%2fpasswd')
    expect(traversal.status).toBe(404)
    expect(await traversal.text()).not.toContain('id="root"')
  })

  it('API 与健康检查不被静态中间件接管（含子路径）', async () => {
    expect(await (await rootApp.request('/healthz')).json()).toEqual({ ok: true })
    expect(await (await rootApp.request('/api/ping')).json()).toEqual({ pong: true })
    const subApi = stripFnosPath('/app/mimir/api/ping')
    expect(await (await subApp.fetch(subApi!)).json()).toEqual({ pong: true })
    const subHealth = stripFnosPath('/app/mimir/healthz')
    expect(await (await subApp.fetch(subHealth!)).json()).toEqual({ ok: true })
  })

  it('fnOS 网关前缀剥离仍只接受 /app/mimir 及其子路径', async () => {
    const asset = stripFnosPath('/app/mimir/assets/index-abc12345.js')
    expect(asset).not.toBeNull()
    expect(await (await subApp.fetch(asset!)).text()).toContain('ready = true')

    expect(stripFnosPath('/assets/index-abc12345.js')).toBeNull()
    expect(stripFnosPath('/app/mimir-evil/docs')).toBeNull()
  })
})
