import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { count } from 'drizzle-orm'
import { db } from './db/client.js'
import * as schema from './db/schema.js'
import { dbDriver, env } from './env.js'

/**
 * 认证配置。
 *
 * 产品规则：**第一个注册的人成为唯一用户，之后注册自动关闭。**
 *
 * 为什么用这条规则而不是一个「允许注册」的开关：自托管服务暴露在公网时，
 * 忘记关开关就等于把自家知识库的注册口敞开。把「首次运行」和「之后」分开，
 * 就不存在需要记得关的开关。想再加用户，直接改数据库。
 *
 * 表结构见 db/auth-schema.ts（PG）与 db/auth-schema.sqlite.ts（SQLite，
 * D-045）；`schema` 是按驱动分发的模块（db/schema.ts），所以适配器拿到的
 * 表对象总与当前连接的方言一致，只有 provider 名字要跟着切换。
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: dbDriver === 'sqlite' ? 'sqlite' : 'pg',
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
    /**
     * 会话缓存**关掉**。看起来是个白送的性能优化，实际会记住用户资料的旧值。
     *
     * ## 症状（实测算出来的）
     *
     * 打开它之后，`get-session` 在 `maxAge` 内直接读 cookie 里那份
     * `{session, user}` 快照、不查库。而头像是**绕开 Better Auth 直接写库**的
     * （`routes/avatar.ts` 用 drizzle 更新 `user.image`，因为要配合文件写入），
     * 于是缓存不会刷新：
     *
     * ```
     * 数据库里 image 已是新值  →  get-session 仍返回 null
     * →  界面上字母头像一动不动，看起来就是「上传没反应」
     * ```
     *
     * **这与浏览器缓存那个坑是两个独立的陈旧源**（`docs/TECH.md` §12.6 的
     * `?v=` 只解决后者），只修一个不够——实测先修了 `?v=`，
     * 界面依然不更新，才定位到这里。
     *
     * ## 为什么不是「用 version 做指纹」而是直接关
     *
     * `cookieCache.version` 看着正好像个解法（它接受 `(session, user) => string`），
     * 但它**读的时候也是拿 cookie 里那份 user 重算**，与写入时算的是同一个对象，
     * 必然自洽——它只用于「我改了 cookie 的结构，把旧缓存全部作废」这类
     * 版本升级，不能用来发现用户资料变了。实测过：加了指纹仍然陈旧。
     *
     * 于是只剩「每次多查一次库」与「用户改了东西看不见」二选一。
     * 取舍很明确：**代价是一次主键查询，而收益是一类会静默存在的
     * 「改了不生效」bug 彻底消失**。单用户自托管，一次请求本来就要查
     * 文档、计数、目录好几张表，省这一次没有任何可测量的收益。
     *
     * 这也与全项目反复出现的同一条判断一致：不要为一个不存在的规模问题，
     * 引入一个会静默出错的东西（`docs/TECH.md` §12.6、D-037）。
     */
    cookieCache: { enabled: false },
  },

  // 前后端分端口开发时，跨源请求需要被信任
  trustedOrigins: [env.webOrigin],

  databaseHooks: {
    user: {
      create: {
        before: async () => {
          const [row] = await db.select({ count: count() }).from(schema.user)

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
