import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { auth } from '../auth.js'
import { db } from '../db/client.js'
import { user } from '../db/schema.js'
import type { AppEnv } from '../types.js'

/**
 * 自定义认证端点。
 *
 * 目前只有一个：`/sign-in/identifier`——接受「用户名或邮箱」登录。
 *
 * ## 为什么不直接用 better-auth 的 `/sign-in/email`
 *
 * better-auth 的邮箱密码登录只认 email。单人工具里用户不一定记得住邮箱，
 * 用注册时填的名字（`user.name`）登录更顺手。
 *
 * 这里**不重新实现密码校验与会话**——那一套（哈希算法、session cookie、
 * CSRF、rememberMe）全在 better-auth 里，自己抄一份升级时会静默失配。
 * 做法是：
 *
 * 1. 把 `identifier` 解析成 email（是邮箱就直接用，否则按 `name` 查库）；
 * 2. 把解析出的 email 交给 `auth.api.signInEmail`，连 cookie 一起返回。
 *
 * 这样密码错误、用户不存在、requireEmailVerification 这些分支的行为
 * 与原生 `/sign-in/email` 完全一致，错误文案也统一。
 */
export const authRoute = new Hono<AppEnv>()

authRoute.post('/sign-in/identifier', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    identifier?: unknown
    password?: unknown
  } | null

  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!identifier || !password) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '请输入用户名/邮箱和密码' } }, 400)
  }

  // 含 @ 当邮箱；否则当用户名去查 user.name，取它的 email。
  // 两种情况最终都走 signInEmail——密码校验、session、cookie 全复用。
  let email = identifier
  if (!identifier.includes('@')) {
    const [found] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.name, identifier))
      .limit(1)
    if (!found) {
      // 用户名不存在：不区分「用户名错」还是「密码错」，与邮箱登录统一返回
      // 同一条认证错误——否则攻击者可以靠响应差异枚举用户名。
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }, 401)
    }
    email = found.email
  }

  // asResponse 让 signInEmail 直接返回带 Set-Cookie 的 Response，
  // Hono 原样转发即可，不用手工拆 cookie。
  return auth.api.signInEmail({
    body: { email, password },
    headers: c.req.raw.headers,
    asResponse: true,
  }) as unknown as Response
})
