import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import type { Hono } from 'hono'
import type { AppEnv } from '../types.js'

/**
 * 生产模式下由 runtime 提供前端静态资源。
 *
 * core 不再 import 这个文件：`createApp({ staticMiddleware })` 接收它，
 * 因此 core 不知道部署在根路径还是 /app/mimir，也不知道 WEB_DIST。
 *
 * 子任务 4 会在这里加 `<base>` / 运行时 base path 注入；本任务先保持旧行为，
 * 只是把候选目录探测换成显式 `dir`。
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  /*
    pdf.js 的资产（D-056）。三个都在它按**原始文件名**取的目录里，
    所以扩展名不能漏——漏了会被当成没有 MIME 的文件，而 pdf.js 那边
    表现为「cmap 加载失败」（中文 PDF 变空白，不报错）。
  */
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.wasm': 'application/wasm',
}

export interface StaticOptions {
  dir: string
  /** 子任务 4 使用；本任务只做路径前缀校验的占位 */
  basePath: string
}

export function createStaticMiddleware(options: StaticOptions): (app: Hono<AppEnv>) => void {
  const root = normalize(options.dir)
  const indexHtml = join(root, 'index.html')

  return (app) => {
    app.use('*', async (c, next) => {
      const pathname = new URL(c.req.url).pathname
      if (pathname.startsWith('/api') || pathname === '/healthz') return next()
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next()

      // 先试静态文件。normalize 之后必须仍在 root 内，否则目录穿越会读出去。
      const candidate = normalize(join(root, decodeURIComponent(pathname)))
      if (candidate.startsWith(root + sep) && extname(candidate) && existsSync(candidate)) {
        const body = await readFile(candidate)
        const hashedAsset = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(pathname)
        return new Response(body, {
          headers: {
            'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream',
            'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
          },
        })
      }

      // 过期页面引用的哈希资源已经不存在时必须报 404，不能把 HTML 当 JS 返回。
      if (pathname.startsWith('/assets/') || extname(pathname)) return c.notFound()

      // 没有文件后缀的深路由交给 SPA 处理。
      const html = await readFile(indexHtml, 'utf8')
      return new Response(html, {
        headers: { 'Content-Type': MIME['.html']!, 'Cache-Control': 'no-cache' },
      })
    })
  }
}
