import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { count } from 'drizzle-orm'
import { db } from './db/client.js'
import * as schema from './db/schema.js'
import type { ServerConfig } from './config.js'

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
export function createAuth(config: ServerConfig) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: config.database.kind === 'sqlite' ? 'sqlite' : 'pg',
      schema,
    }),

    secret: config.auth.secret,
    // fnOS 的 gateway 没有单一公开 host：用户可能用 IP、主机名或 HTTPS 域名打开。
    // runtime 已把它翻译成 `baseURL: undefined`，由请求 Host 决定。
    baseURL: config.auth.baseURL,
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
       * **这与浏览器缓存那个坑是两个独立的陈旧源**（`.trellis/spec/project/architecture.md` §12.6 的
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
       * 引入一个会静默出错的东西（`.trellis/spec/project/architecture.md` §12.6、D-037）。
       */
      cookieCache: { enabled: false },
    },

    // 前后端分端口开发时，跨源请求需要被信任
    trustedOrigins: config.auth.trustedOrigins,

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
          /**
           * 建号之后播种默认内容（一个知识库 + 一份产品说明，见 `services/seed.ts`）。
           *
           * ## 为什么这个入口在这里
           *
           * 它覆盖**两条建号路径**：`OWNER_EMAIL` 环境变量建号
           * （`ensureOwnerAccount` 调 `auth.api.signUpEmail`）与首次注册。
           * 两者走的是同一个 user 创建流程，播种因此只写一份。
           *
           * 另一个入口是 `boot.ts`——那是给**本次改动之前就建过号的实例**用的
           * （它们不会再经过这个钩子）。两个入口都查同一个持久标记
           * （`seed.defaultContent`），所以谁先跑都只会播一次；
           * 「用户删掉了默认内容」也由那个标记挡住，不会重新长出来。
           *
           * ## 失败不阻断建号
           *
           * 账号是核心，默认内容是附赠：播种失败只留日志，注册照常成功。
           * 与 `ensureOwnerAccount` 的失败处理同一条规矩。
           */
          after: async () => {
            // 测试环境跳过：集成测试有自己的账号与库准备流程，而它们到处是
            // 「库里有几篇文档」这类断言——自动多出两行会让它们以难以定位的方式失败
            if (config.nodeEnv === 'test') return

            try {
              // 动态 import：auth.ts 在启动最早期就被加载（app / bootstrap 都引它），
              // 而 seed 走的是完整写入链路（vault、插件装配）。让这条依赖在**用到时才加载**，
              // 既避开模块初始化顺序上的环，也不拖慢每次启动
              const { seedDefaultLibrary } = await import('./services/seed.js')
              const result = await seedDefaultLibrary()
              if (result.libraryCreated || result.documentCreated) {
                console.log(
                  `[seed] 已创建默认知识库与产品说明（库：${result.libraryCreated}，说明：${result.documentCreated}）`,
                )
              }
            } catch (error) {
              console.warn('[seed] 默认内容播种失败（不影响账号与使用）：', error)
            }
          },
        },
      },
    },

    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        httpOnly: true,
        // 既有生产部署保持 Secure；fnOS 由 runtime 在网关响应里按浏览器协议补 Secure
        secure: config.auth.secureCookies ?? config.nodeEnv === 'production',
        ...(config.auth.cookiePath ? { path: config.auth.cookiePath } : {}),
      },
      ...(config.auth.secureCookies !== undefined
        ? { useSecureCookies: config.auth.secureCookies }
        : {}),
    },
  })
}

let current: Auth | null = null

/** 由 `ensureServerRuntime()` 在 configureDb 之后调用一次。 */
export function setAuth(value: Auth): void {
  current = value
  auth = value
}

export function isAuthConfigured(): boolean {
  return current !== null
}

export function getAuth(): Auth {
  if (!current) throw new Error('auth 尚未初始化：先 configureServer + ensureServerRuntime')
  return current
}

/** live binding：现有 `import { auth }` 的调用点不用改成函数调用。 */
export let auth: Auth

export type Auth = ReturnType<typeof createAuth>
