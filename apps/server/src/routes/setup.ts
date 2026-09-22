import { Hono } from 'hono'
import { hasAnyUser, prefillCredentials } from '../services/bootstrap.js'
import type { AppEnv } from '../types.js'

/**
 * 登录页的公开状态。
 *
 * 独立成一个路由而不是塞进 documents/search 那些（它们都在鉴权中间件后面）——
 * 这个端点必须在**登录之前**就能访问，否则登录页没法知道该显示哪种形态。
 *
 * 因此它只能暴露「库里有没有账号」这一个布尔值。
 */
export const setupRoute = new Hono<AppEnv>()

setupRoute.get('/state', async (c) =>
  c.json({
    needsSetup: !(await hasAnyUser()),
    prefill: prefillCredentials(),
  }),
)
