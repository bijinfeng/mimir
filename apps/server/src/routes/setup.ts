import { Hono } from 'hono'
import { config } from '../config.js'
import { hasAnyUser, prefillCredentials } from '../services/bootstrap.js'
import type { AppEnv } from '../types.js'

/**
 * 登录页的公开状态。
 *
 * 独立成一个路由而不是塞进 documents/search 那些（它们都在鉴权中间件后面）——
 * 这个端点必须在**登录之前**就能访问，否则登录页没法知道该显示哪种形态。
 *
 * 因此它只能暴露「库里有没有账号」与「这是不是本地模式」两个布尔值。
 */
export const setupRoute = new Hono<AppEnv>()

setupRoute.get('/state', async (c) =>
  c.json({
    needsSetup: !(await hasAnyUser()),
    prefill: prefillCredentials(),
    /**
     * 本地模式（D-100）。登录页据此说清「凭据由客户端持有，
     * 在这里填密码登录不会成功」——否则用户看到的只是一个永远不对的密码框。
     */
    localMode: config.localMode,
  }),
)
