import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import type { Hono } from 'hono'
import type { AppEnv } from '../types.js'

/**
 * 生产模式的静态资源中间件（属于 runtime，不属于 core）。
 *
 * 同一份 `apps/web/dist` 要同时服务根路径与 `/app/mimir/`（fnOS 网关）：
 *   - 构建产物用相对 URL（`./assets/...`）
 *   - 这里在 `index.html` 的 `<head>` 注入 `<base href>` 与
 *     `window.__MIMIR_BASE_PATH__`，前端据此算路由 basepath、API 前缀、
 *     pdf.js/OCR 的资产路径
 *
 * 路径映射顺序：先剥掉部署前缀（如果请求带着），再按产物根找文件；这样
 * 反向代理已经剥过前缀的请求也能工作。API/健康检查永远放行。
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
  // pdf.js 按原始文件名取这些资产；扩展名漏了会变成 octet-stream，
  // 表现为中文 PDF 的 cmap 加载失败（空白，不报错）
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.wasm': 'application/wasm',
}

export interface StaticOptions {
  dir: string
  /** `/` 或 `/app/mimir`（尾斜杠可有可无） */
  basePath: string
}

function normalizeBasePath(raw: string): string {
  if (raw === '/') return ''
  return raw.replace(/\/+$/, '')
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function injectBase(html: string, base: string): string {
  const baseHref = base === '' ? '/' : `${base}/`
  const tags = [
    `<base href="${escapeAttribute(baseHref)}">`,
    `<script>window.__MIMIR_BASE_PATH__=${JSON.stringify(base === '' ? '/' : base)}</script>`,
  ].join('\n    ')
  // 去掉已有的注入（包括旧版本/重复构建写进去的），保证幂等
  const withoutOld = html
    .replace(/<base\b[^>]*>\s*/gi, '')
    .replace(/<script>\s*window\.__MIMIR_BASE_PATH__\s*=[\s\S]*?<\/script>\s*/gi, '')
  if (/<head\b[^>]*>/i.test(withoutOld)) {
    return withoutOld.replace(/(<head\b[^>]*>)/i, `$1\n    ${tags}`)
  }
  return `${tags}\n${withoutOld}`
}

export function createStaticMiddleware(options: StaticOptions): (app: Hono<AppEnv>) => void {
  const root = normalize(options.dir)
  const indexHtml = join(root, 'index.html')
  const base = normalizeBasePath(options.basePath)
  let injectedIndex: string | null = null

  function stripBase(pathname: string): string {
    if (base === '') return pathname
    if (pathname === base) return '/'
    if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length)
    // 反代已经剥过前缀；按原路径继续找，前缀外的 `/app/mimir-evil` 不会命中
    return pathname
  }

  function isApi(pathname: string): boolean {
    return pathname.startsWith('/api') || pathname === '/healthz'
  }

  return (app) => {
    app.use('*', async (c, next) => {
      const rawPath = new URL(c.req.url).pathname
      const pathname = stripBase(rawPath)
      if (isApi(rawPath) || isApi(pathname)) return next()
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next()

      let decoded: string
      try {
        decoded = decodeURIComponent(pathname)
      } catch {
        return c.notFound()
      }

      // 编码的 `..` 在 URL 解析后仍可能留在 pathname 里；先拒绝再 normalize。
      if (decoded.split('/').some((part) => part === '..')) return c.notFound()

      // 先试静态文件。normalize 之后必须仍在 root 内，否则目录穿越会读出去。
      const candidate = normalize(join(root, decoded))
      if (candidate.startsWith(root + sep) && extname(candidate) && existsSync(candidate)) {
        const body = await readFile(candidate)
        const hashedAsset = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(pathname)
        return new Response(c.req.method === 'HEAD' ? null : body, {
          headers: {
            'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream',
            'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
          },
        })
      }

      // 过期页面引用的哈希资源已经不存在时必须报 404，不能把 HTML 当 JS 返回。
      if (pathname.startsWith('/assets/') || extname(pathname)) return c.notFound()

      // 没有文件后缀的深路由交给 SPA；注入只做一次（产物在运行时不会变）
      injectedIndex ??= injectBase(await readFile(indexHtml, 'utf8'), base)
      return new Response(c.req.method === 'HEAD' ? null : injectedIndex, {
        headers: { 'Content-Type': MIME['.html']!, 'Cache-Control': 'no-cache' },
      })
    })
  }
}
