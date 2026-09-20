import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sql } from 'drizzle-orm'
import { db } from './db/client.js'
import * as schema from './db/schema.js'
import { env } from './env.js'

/**
 * 认证配置。
 *
 * 产品规则：**第一个注册的人成为唯一用户，之后注册自动关闭。**
 *
 * 为什么用这条规则而不是一个「允许注册」的开关：自托管服务暴露在公网时，
 * 忘记关开关就等于把自家知识库的注册口敞开。把「首次运行」和「之后」分开，
 * 就不存在需要记得关的开关。想再加用户，直接改数据库。
 *
 * 表结构见 db/auth-schema.ts；schema 必须显式传进去，否则适配器解析不到表名。
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),

  secret: env.authSecret,
  baseURL: env.serverUrl,
  basePath: '/api/auth',

  emailAndPassword: {
    enabled: true,
    // 单用户自托管，不做邮箱验证：没有邮件服务，也不该强迫用户配一个
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  // 前后端分端口开发时，跨源请求需要被信任
  trustedOrigins: [env.webOrigin],

  databaseHooks: {
    user: {
      create: {
        before: async () => {
          const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.user)

          if ((row?.count ?? 0) > 0) {
            throw new APIError('FORBIDDEN', {
              message:
                '该系统为单用户自托管，已存在账号，注册已关闭。如需新增用户请直接操作数据库。',
            })
          }
        },
      },
    },
  },

  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      httpOnly: true,
      // 通过 HTTPS 反代部署时自动升级为 secure
      secure: env.nodeEnv === 'production',
    },
  },
})

export type Auth = typeof auth
