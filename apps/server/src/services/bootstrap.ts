import { count, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { auth } from '../auth.js'
import { db } from '../db/client.js'
import { account, user } from '../db/schema.js'
import { config, isOwnerConfigured } from '../config.js'

/**
 * 所有者账号的引导。
 *
 * ## 它解决什么
 *
 * 默认路径是「第一个注册的人成为唯一用户，之后注册自动关闭」。这条规则本身
 * 是对的（不需要记得关的开关），但它有一个时间窗问题和一个运维问题：
 *
 * | 问题 | 后果 |
 * |---|---|
 * | **先注册先得** | 部署完到你自己注册之间，服务如果已经暴露在公网，谁先访问谁就成为那个唯一用户——他拿到的是你整个知识库 |
 * | **账号在数据库里** | 清库重建（换分支、改 schema）会把账号一起删掉；忘记密码也没有找回路径 |
 *
 * 把账号写进环境变量，「所有者是谁」就由部署配置决定，而不是由谁先到达决定。
 *
 * ## 语义：环境变量是所有者账号的真相来源
 *
 * | 库里的状态 | 行为 |
 * |---|---|
 * | 没有账号 | 按环境变量创建（**跳过首次注册**） |
 * | 有账号，邮箱与 OWNER_EMAIL 一致 | 密码不一致时同步（**这是忘记密码的找回方式**） |
 * | 有账号，邮箱不同 | 只警告，**不动它**——静默替换掉别人的账号是破坏性的 |
 *
 * 第二条意味着**改了 OWNER_PASSWORD 重启即生效**。这是刻意的：self-hosted
 * 单用户产品需要一个不依赖 UI 的找回路径，而能改 `.env` 的人本来就有服务器
 * 的完全控制权（他能读 AUTH_SECRET、能直连数据库）。
 *
 * ## 密码怎么改
 *
 * 走 `auth.$context.password.hash` —— Better Auth 自己的哈希实现。
 * 直接写库要复刻这套逻辑（算法、盐、参数），升级时会**静默失配**：
 * 密码看着存进去了，登录永远失败。这是刻意避免的第 22 条坑。
 *
 * `setPassword` 那个端点在服务端用不了——它要求一个已登录的 session。
 */

export interface OwnerBootstrapResult {
  /** 没配 OWNER_EMAIL / OWNER_PASSWORD —— 走默认的首次注册路径 */
  skipped?: 'not-configured' | 'test' | 'email-mismatch'
  created?: boolean
  passwordUpdated?: boolean
  email?: string
}

/**
 * 该对所有者账号做什么。
 *
 * **抽成纯函数是为了让它可测。** 这段判断有四条分支，而其中两条是
 * 破坏性的（建号会占掉「唯一用户」的名额、改密码会踢掉当前会话），
 * 靠手工跑一遍来验证太不可靠——尤其「邮箱不一致时不动别人的账号」这条，
 * 手工测很容易因为环境恰好匹配而走过另一条分支。
 *
 * 纯函数不碰数据库也不读环境变量，四条分支可以逐个断言。
 */
export type OwnerAction =
  /** 库里一个账号都没有 → 按环境变量创建 */
  | { kind: 'create' }
  /** 库里那个账号不是环境变量指定的 → 不动它 */
  | { kind: 'skip'; reason: 'email-mismatch'; existingEmail: string }
  /** 已经配置一致，什么都不用做 */
  | { kind: 'noop' }
  /** 邮箱一致但密码不同 → 同步（这是「忘记密码」的找回路径） */
  | { kind: 'update-password' }

export function decideOwnerAction(input: {
  /** 库里那个账号的邮箱；null 表示库里没有账号 */
  existingEmail: string | null
  ownerEmail: string
  /**
   * 库里的密码是否已经等于 OWNER_PASSWORD。
   * `null` 表示没有 credential 记录（账号存在但没有密码，属于异常状态）。
   */
  passwordMatches: boolean | null
}): OwnerAction {
  if (input.existingEmail === null) return { kind: 'create' }

  if (input.existingEmail !== input.ownerEmail) {
    return { kind: 'skip', reason: 'email-mismatch', existingEmail: input.existingEmail }
  }

  // 密码不匹配（或压根没有凭据记录）都要写一次，让环境变量成为真相来源
  if (input.passwordMatches === true) return { kind: 'noop' }
  return { kind: 'update-password' }
}

/**
 * 确保所有者账号存在并与环境变量一致。启动时调用一次。
 *
 * 常规部署失败不阻断启动：账号没准备好时用户仍可走首次注册。
 * fnOS 由安装向导指定唯一所有者，失败时必须在监听网关前关闭。
 */
export async function ensureOwnerAccount(
  options: { failClosed?: boolean } = {},
): Promise<OwnerBootstrapResult> {
  if (!isOwnerConfigured()) return { skipped: 'not-configured' }

  // 测试有自己的账号准备流程（test/helpers.ts 的 getAuthCookie，它先试登录
  // 再试注册）。这里插一脚会先占掉「唯一用户」的名额，让那些测试的注册
  // 分支永远走不到——而那个分支正是被测对象之一。
  if (config.nodeEnv === 'test' && !options.failClosed) return { skipped: 'test' }

  try {
    const [existing] = await db.select({ id: user.id, email: user.email }).from(user).limit(1)

    // 先取密码是否已匹配（决定走哪条分支），再执行
    let passwordMatches: boolean | null = null
    let credentialId: string | null = null
    if (existing) {
      const [credential] = await db
        .select({ id: account.id, password: account.password })
        .from(account)
        .where(eq(account.userId, existing.id))
        .limit(1)
      credentialId = credential?.id ?? null

      if (credential?.password) {
        const ctx = await auth.$context
        passwordMatches = await ctx.password.verify({
          hash: credential.password,
          password: config.ownerPassword,
        })
      }
    }

    const action = decideOwnerAction({
      existingEmail: existing?.email ?? null,
      ownerEmail: config.ownerEmail,
      passwordMatches,
    })

    if (action.kind === 'skip') {
      if (options.failClosed) {
        throw new Error('配置的 OWNER_EMAIL 与数据库中的账号不一致')
      }
      // 提示要具体到「怎么改过来」，否则用户只知道没生效
      console.warn(
        `[owner] 库里已有账号 ${action.existingEmail}，与 OWNER_EMAIL（${config.ownerEmail}）不同，未改动。\n` +
          '         想换成环境变量里那个：清空 user 表后重启，或用现有账号登录。',
      )
      return { skipped: 'email-mismatch', email: action.existingEmail }
    }

    if (action.kind === 'noop') return { email: config.ownerEmail }

    if (action.kind === 'create') {
      await auth.api.signUpEmail({
        body: {
          email: config.ownerEmail,
          password: config.ownerPassword,
          // 与登录页一致的推导规则（邮箱前缀）
          name: config.ownerEmail.split('@')[0] || 'me',
        },
      })
      // 明确告知发生了写入。静默成功会让「到底建没建」变成要靠试登录才知道
      console.log(`[owner] 已按 OWNER_EMAIL 创建账号：${config.ownerEmail}`)
      return { created: true, email: config.ownerEmail }
    }

    // update-password：同步密码。
    // 只改 password 列与 updatedAt，**不动账号 id**——换 id 会让已登录的
    // session 全部失效，用户会莫名其妙被踢出去
    const ctx = await auth.$context
    const hash = await ctx.password.hash(config.ownerPassword)

    if (credentialId) {
      await db
        .update(account)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(account.id, credentialId))
    } else if (existing) {
      // 账号存在但没有凭据记录（异常状态，比如手工插过 user 行）
      await db.insert(account).values({
        id: nanoid(),
        accountId: existing.id,
        providerId: 'credential',
        userId: existing.id,
        password: hash,
      })
    }

    console.log(`[owner] OWNER_PASSWORD 与库里的不一致，已同步密码：${config.ownerEmail}`)
    return { passwordUpdated: true, email: config.ownerEmail }
  } catch (error) {
    if (options.failClosed) throw error
    // 不抛出：建号失败不该让服务起不来，用户仍可手工注册
    console.warn(
      '[owner] 准备所有者账号失败，可以改用首次注册：',
      error instanceof Error ? error.message : error,
    )
    return {}
  }
}

/** 库里是否已有账号。登录页据此在「首次注册」与「登录」之间切换 */
export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ count: count() }).from(user)
  return (row?.count ?? 0) > 0
}

/**
 * 登录页预填用的凭据。
 *
 * **只在非生产环境返回。** 它会把密码明文交给一个**不需要鉴权**的端点，
 * 生产环境下任何人访问 `/api/auth/setup-state` 就能拿到你的密码——
 * 那不是便利，是漏洞。开发环境里它来自 `.env`（本来就在本地），
 * 且目的是省掉每次开浏览器手打密码。
 */
export function prefillCredentials(): { email: string; password: string } | null {
  if (config.nodeEnv === 'production') return null
  if (!isOwnerConfigured()) return null
  return { email: config.ownerEmail, password: config.ownerPassword }
}
