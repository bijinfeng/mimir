import { createMiddleware } from 'hono/factory'
import { env } from '../env.js'
import { HttpError } from '../lib/http.js'
import { authenticateMiniapp } from '../services/miniapp-auth.js'
import type { AppEnv } from '../types.js'

export const miniappEnabled = createMiddleware<AppEnv>(async (_c, next) => {
  if (!env.miniappEnabled) throw new HttpError(404, 'NOT_FOUND', '接口不存在')
  await next()
})
export const requireMiniappAuth = createMiddleware<AppEnv>(async (c, next) => {
  c.set('miniappDevice', await authenticateMiniapp(c.req.header('authorization')))
  c.header('Cache-Control', 'no-store')
  await next()
})

// A small bounded limiter complements Better Auth's server-side credential check.
// No identifier, password or token is logged or used as a map key.
const attempts = new Map<string, { count: number; until: number }>()
export const limitMiniappLogin = createMiddleware<AppEnv>(async (c, next) => {
  const now = Date.now()
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key)
  // Do not trust arbitrary forwarded IP headers; a server-wide budget also works
  // behind reverse proxies and cannot be bypassed with a forged header.
  const entry = attempts.get('login') ?? { count: 0, until: now + 60_000 }
  if (entry.count >= 20) throw new HttpError(403, 'LOGIN_RATE_LIMIT', '登录尝试过多，请稍后再试')
  entry.count += 1
  attempts.set('login', entry)
  await next()
})
