/**
 * fnOS 统一网关适配。
 *
 * 这些逻辑以前在 core 的 `app.ts` / `auth.ts` / `lib/fnos-gateway.ts` 里，
 * 现在只在 runtime 包裹 Unix Socket listener 时使用。core 的 `app.ts` 始终
 * 直接 `auth.handler(request)`，没有 `if (fnosSocket)` 分支。
 */

/** fnOS forwards the public prefix unchanged to the private application socket. */
export function stripFnosPrefix(request: Request, basePath: string): Request | null {
  const url = new URL(request.url)
  const prefix = basePath.replace(/\/+$/, '')
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null
  url.pathname = url.pathname.slice(prefix.length) || '/'
  return new Request(url, request)
}

/** 只有认证路由需要改 Origin/协议并补 Secure cookie。 */
export function isAuthPath(pathname: string): boolean {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/')
}

/**
 * Better Auth receives the same-site browser request after the gateway hop.
 * The hop itself is HTTP, so use the browser's Origin (when present) to retain
 * its actual scheme. Never treat a forwarded fnOS user header as Mimir login.
 */
export function adaptAuthRequest(request: Request): Request | null {
  const url = new URL(request.url)
  const source = request.headers.get('origin') ?? request.headers.get('referer')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') return null

  if (source) {
    let browserOrigin: URL
    try {
      browserOrigin = new URL(source)
    } catch {
      return null
    }
    if (!['http:', 'https:'].includes(browserOrigin.protocol) || browserOrigin.host !== url.host) {
      return null
    }
    const forwardedProto = request.headers.get('x-forwarded-proto')
    if (forwardedProto && `${forwardedProto}:` !== browserOrigin.protocol) return null
    url.protocol = browserOrigin.protocol
  } else {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Browser form/fetch writes carry Origin. Missing it must not open the
      // first-login or session-writing auth endpoints to cross-site requests.
      return null
    }
    const forwardedProto = request.headers.get('x-forwarded-proto')
    if (forwardedProto) {
      if (forwardedProto !== 'http' && forwardedProto !== 'https') return null
      url.protocol = `${forwardedProto}:`
    }
  }

  return new Request(url, request)
}

/** The HTTP gateway must get a usable cookie; HTTPS must mark it Secure. */
export function adaptAuthResponse(response: Response, request: Request): Response {
  if (new URL(request.url).protocol !== 'https:') return response
  const cookies = response.headers.getSetCookie()
  if (!cookies.length) return response
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  for (const cookie of cookies) {
    headers.append(
      'set-cookie',
      /(?:^|;)\s*Secure(?:;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`,
    )
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
