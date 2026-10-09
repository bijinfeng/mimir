import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Env, Hono } from 'hono'

/**
 * 生产模式下由 API 服务同时提供前端静态资源。
 *
 * 为什么不用两个容器 + 反代：这是单用户自托管应用，一个进程能搞定的事
 * 不该拆成三个（前端容器 + 后端容器 + nginx）。开发时前后端分离是因为要热更新，
 * 生产时没有这个需求。
 *
 * 开发模式下 dist 不存在，这个中间件会整体跳过，Vite 自己服务前端。
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

/**
 * 前端构建产物的位置。
 *
 * 两种布局要同时支持，而它们的相对深度不同：
 *   仓库内：  apps/server/{src,dist}/lib/static.*  →  ../../apps/web/dist
 *   镜像内：  /app/dist/lib/static.js              →  /app/web/dist
 *
 * 所以不能写死一个偏移量。这里按候选顺序探测，并允许用 WEB_DIST 显式指定。
 * 探测而不是判断 NODE_ENV——路径对不对应该由文件是否存在来回答。
 */
function resolveWebDist(): string | null {
  // 本文件所在目录到「server 包根」恒为两级（src/lib 或 dist/lib），这一层是稳定的
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

  const candidates = [
    process.env.WEB_DIST,
    resolve(packageRoot, 'web/dist'), // 生产镜像布局
    resolve(packageRoot, '../../apps/web/dist'), // 仓库布局
  ]

  return candidates.find((dir) => dir && existsSync(join(dir, 'index.html'))) ?? null
}

export function mountStatic<E extends Env>(app: Hono<E>): boolean {
  const webDist = resolveWebDist()
  if (!webDist) return false

  // 收窄成常量，闭包里才能稳定地用非空类型
  const root: string = webDist
  const indexHtml = join(root, 'index.html')

  app.get('*', async (c) => {
    const url = new URL(c.req.url)
    const requested = decodeURIComponent(url.pathname)

    // 先试静态文件。normalize 之后必须仍在 webDist 内，
    // 否则 ../../etc/passwd 这类路径会被读出（目录穿越）。
    const candidate = normalize(join(root, requested))
    if (candidate.startsWith(root + sep) && extname(candidate) && existsSync(candidate)) {
      const body = await readFile(candidate)
      // Vite 的哈希产物可长期缓存；HTML 与 public 目录里的固定文件须重新校验。
      const hashedAsset = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(requested)
      return new Response(body, {
        headers: {
          'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream',
          'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
        },
      })
    }

    // 过期页面引用的哈希资源已经不存在时必须报 404，不能把 HTML 当 JS 返回。
    if (requested.startsWith('/assets/') || extname(requested)) return c.notFound()

    // 没有文件后缀的深路由交给 SPA 处理。
    const html = await readFile(indexHtml, 'utf8')
    return new Response(html, {
      headers: { 'Content-Type': MIME['.html']!, 'Cache-Control': 'no-cache' },
    })
  })

  return true
}
