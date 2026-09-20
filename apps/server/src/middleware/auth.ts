import { createMiddleware } from 'hono/factory'
import { auth } from '../auth.js'
import { HttpError } from '../lib/http.js'
import type { AppEnv } from '../types.js'

/**
 * 鉴权中间件。整个 API（除 /api/auth 和健康检查）都挂在它后面。
 *
 * 自托管服务一旦暴露到公网，漏一个未鉴权接口就等于把整个知识库
 * 连同里面存的 API key 一起交出去。所以默认全关，只放行明确列出的路径。
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', '请先登录')
  }

  c.set('session', session.session)
  c.set('user', session.user)
  await next()
})
