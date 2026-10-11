import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mountStatic } from '../lib/static'
import { stripFnosPrefix } from '../lib/fnos-gateway'

describe('生产静态资源', () => {
  let webDist: string
  let previousWebDist: string | undefined
  let app: Hono

  beforeAll(async () => {
    webDist = await mkdtemp(join(tmpdir(), 'mimir-static-'))
    await mkdir(join(webDist, 'assets'))
    await writeFile(join(webDist, 'index.html'), '<!doctype html><div id="root"></div>')
    await writeFile(join(webDist, 'assets', 'index-abc12345.js'), 'export const ready = true')
    await writeFile(join(webDist, 'favicon.svg'), '<svg></svg>')
    previousWebDist = process.env.WEB_DIST
    process.env.WEB_DIST = webDist
    app = new Hono()
    if (!mountStatic(app)) throw new Error('静态目录未挂载')
  })

  afterAll(async () => {
    if (previousWebDist === undefined) delete process.env.WEB_DIST
    else process.env.WEB_DIST = previousWebDist
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

  it('fnOS 网关前缀映射静态资源和深路由，拒绝前缀外路径', async () => {
    const asset = stripFnosPrefix(new Request('http://nas.test/app/mimir/assets/index-abc12345.js'))
    expect(asset).not.toBeNull()
    expect(await (await app.fetch(asset!)).text()).toContain('ready = true')

    const deepRoute = stripFnosPrefix(new Request('http://nas.test/app/mimir/docs/42'))
    expect(deepRoute).not.toBeNull()
    expect(await (await app.fetch(deepRoute!)).text()).toContain('id="root"')

    expect(stripFnosPrefix(new Request('http://nas.test/assets/index-abc12345.js'))).toBeNull()
    expect(stripFnosPrefix(new Request('http://nas.test/app/mimir-evil/docs'))).toBeNull()
  })
})
