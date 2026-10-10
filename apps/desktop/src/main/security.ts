import { createHash } from 'node:crypto'

export type WindowSurface = 'setup' | 'local' | 'cloud'

/**
 * Electron 的 cookie 不按端口隔离。云端地址若是另一个 127.0.0.1 端口，
 * 不能与本地宿主共用 defaultSession；云端不同服务器也各有自己的登录态。
 */
export function partitionFor(surface: WindowSurface, url: string): string {
  if (surface === 'setup') return 'mimir-setup'
  if (surface === 'local') return 'persist:mimir-local'
  const identity = createHash('sha256').update(url).digest('hex').slice(0, 20)
  return `persist:mimir-cloud-${identity}`
}

export type NavigationDecision = 'allow' | 'external' | 'block'

/** 只让页面留在当前应用源内；跨源 web 链接在系统浏览器打开。 */
export function navigationDecision(currentUrl: string, targetUrl: string): NavigationDecision {
  let current: URL
  let target: URL
  try {
    current = new URL(currentUrl)
    target = new URL(targetUrl)
  } catch {
    return 'block'
  }

  if (current.protocol === 'file:') {
    return target.protocol === 'file:' &&
      target.host === current.host &&
      target.pathname === current.pathname
      ? 'allow'
      : 'block'
  }
  if (current.protocol !== 'http:' && current.protocol !== 'https:') return 'block'
  if (target.origin === current.origin) return 'allow'
  return target.protocol === 'http:' || target.protocol === 'https:' ? 'external' : 'block'
}
