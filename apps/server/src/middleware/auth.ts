import { createMiddleware } from 'hono/factory'
import { auth } from '../auth.js'
import { HttpError } from '../lib/http.js'
import { ensureLocalOwner, localSession, localTokenMatches } from '../services/local-mode.js'
import type { AppEnv } from '../types.js'

/**
 * 鉴权中间件。整个 API（除 /api/auth 和健康检查）都挂在它后面。
 *
 * 自托管服务一旦暴露到公网，漏一个未鉴权接口就等于把整个知识库
 * 连同里面存的 API key 一起交出去。所以默认全关，只放行明确列出的路径。
 *
 * ## 两条路径，顺序不能反（D-100）
 *
 * 1. **真实会话**（better-auth cookie）——自部署的老路径，一行没变
 * 2. **本地模式的令牌**（`mimir-local` cookie）——桌面私有宿主注入的
 *
 * 先试会话再验令牌，是为了让「本地模式 + 浏览器里用密码登录」也成立：
 * 那种情况下第二种根本用不上，而反过来写会让浏览器用户莫名其妙地
 * 落到本机用户身份上（同一个库里的同一行，但调试时会看得一头雾水）。
 *
 * 令牌那一支的细节（为什么不是免鉴权、为什么要一个本机用户）见
 * `services/local-mode.ts`。
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session) {
    c.set('session', session.session)
    c.set('user', session.user)
    await next()
    return
  }

  if (localTokenMatches(c.req.header('cookie'))) {
    const owner = await ensureLocalOwner()
    if (owner) {
      c.set('session', localSession(owner))
      c.set('user', owner)
      await next()
      return
    }
  }

  throw new HttpError(401, 'UNAUTHORIZED', '请先登录')
})
