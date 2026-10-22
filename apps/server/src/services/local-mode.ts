import { randomBytes, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { LOCAL_TOKEN_COOKIE } from '@mimir/shared'
import { db } from '../db/client.js'
import { user } from '../db/schema.js'
import { config } from '../config.js'
import { auth } from '../auth.js'

/**
 * 本地模式（D-100）：桌面客户端的进程内私有宿主「不需要登录」的那一半。
 *
 * ## 为什么不是「API 免鉴权」
 *
 * 宿主只绑回环地址，但**回环不等于安全边界**：任何本机进程都能访问它，
 * 一个恶意网页也能扫本机端口。若 API 彻底免鉴权，跨站请求就不需要 cookie
 * 了——SameSite 那层保护随之作废，一个页面就能 POST 出文档（无 preflight
 * 的 `text/plain` 请求会被真的发出，只是响应读不到）。
 *
 * 所以本地模式的入口是一把**宿主每次启动随机生成的令牌**，由桌面主进程
 * 写进 Electron 的 cookie jar（httpOnly + SameSite=Lax）。浏览器里跑着的
 * 网页拿不到它、跨站请求也不会带上它；而桌面窗口加载的就是这个源，
 * 同源请求天然带 cookie。效果是「用户什么都不用做就进去了」，
 * 但 §14.5 的跨站防线一条没丢。
 *
 * ## 为什么要有一个本机用户
 *
 * 文档的所有权字段、头像、外键都需要一个真实的 `user` 行；`requireAuth`
 * 往下游传的也是这个形状。它走 better-auth 自己的注册流程创建（密码哈希、
 * account 行形状、建号钩子里的默认内容播种都归它）——直接插表要复刻密码
 * 哈希，升级时会静默失配（D-020 记过这条坑）。
 *
 * 密码是随机的、不公开，也**不应该**被用来登录：本地模式的进入方式是令牌，
 * 不是密码。它存在只是让账号形状完整。
 */

/** 本机用户的邮箱。固定值：它代表「这台机器上的所有者」，不是一个可注册的账号 */
export const LOCAL_OWNER_EMAIL = 'local@mimir.local'

/** 本机用户在你界面上的默认名字。用户可以改（`PATCH /api/local/profile`） */
const LOCAL_OWNER_NAME = '本地用户'

/** 合成会话的有效期：本地模式没有「过期」这个概念，给一个远期时间即可 */
const SYNTHETIC_SESSION_MS = 100 * 365 * 24 * 60 * 60 * 1000

type UserRow = typeof user.$inferSelect

/**
 * 缓存本机用户行。
 *
 * **只缓存成功结果**（不是缓存 promise）：失败（数据库暂时锁住之类）时
 * 下一次请求还会再试，而不是把一个 rejection 永久钉在这里。
 */
let cached: UserRow | null = null
let inflight: Promise<UserRow> | null = null

export function ensureLocalOwner(): Promise<UserRow | null> {
  if (!config.localMode) return Promise.resolve(null)
  if (cached) return Promise.resolve(cached)

  inflight ??= bootstrapOwner().finally(() => {
    inflight = null
  })
  return inflight.then((row) => {
    cached = row
    return row
  })
}

async function bootstrapOwner(): Promise<UserRow> {
  const [existing] = await db.select().from(user).limit(1)
  if (existing) return existing

  await auth.api.signUpEmail({
    body: {
      email: LOCAL_OWNER_EMAIL,
      password: randomBytes(32).toString('base64url'),
      name: LOCAL_OWNER_NAME,
    },
  })

  const [created] = await db.select().from(user).limit(1)
  if (!created) throw new Error('本地模式：建号之后读不到用户行')
  console.log(`[local] 已创建本机用户（${created.email}）——本地模式不需要登录`)
  return created
}

/**
 * 请求里的本机令牌是否合法。
 *
 * **常量时间比较**：令牌是本地模式下唯一把跨站请求挡在外面的东西，
 * 逐字节提前返回的比较会泄露前缀。长度不同时 `timingSafeEqual` 会抛错，
 * 所以先比长度（长度本身不是秘密）。
 */
export function localTokenMatches(cookieHeader: string | undefined): boolean {
  if (!config.localMode || !config.localToken) return false
  if (!cookieHeader) return false

  const presented = readCookie(cookieHeader, LOCAL_TOKEN_COOKIE)
  if (!presented) return false

  const a = Buffer.from(presented)
  const b = Buffer.from(config.localToken)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * 合成会话。形状与 better-auth 的 session 行一致，供 `c.set('session', …)`。
 *
 * 它不是数据库里的行——本地模式没有会话可查。`id` / `token` 用固定前缀
 * 让日志里一眼能认出来源（真会话的 token 是随机串）。
 */
export function localSession(owner: UserRow): AppLocalSession {
  const now = new Date()
  return {
    id: `local-${owner.id}`,
    token: `local-${owner.id}`,
    userId: owner.id,
    expiresAt: new Date(now.getTime() + SYNTHETIC_SESSION_MS),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  }
}

/** `get-session` 的响应体。字段与 better-auth 的同名端点对齐（多几个也无害） */
export interface LocalSessionPayload {
  session: AppLocalSession
  user: UserRow
}

export async function localSessionPayload(): Promise<LocalSessionPayload | null> {
  const owner = await ensureLocalOwner()
  if (!owner) return null
  return { session: localSession(owner), user: owner }
}

/**
 * 更新本机用户的名称。
 *
 * **必须同时刷新缓存**：`ensureLocalOwner` 缓存了用户行，而 `get-session`
 * 读的就是它——只写库不清缓存的话，改完名字界面还是旧的，直到重启。
 * 这类「改了不生效」正是本项目最忌讳的一类静默错误。
 */
export async function setLocalOwnerName(name: string): Promise<string | null> {
  const owner = await ensureLocalOwner()
  if (!owner) return null

  await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, owner.id))

  cached = { ...owner, name, updatedAt: new Date() }
  return cached.name
}

/** 合成会话的类型。这里只声明形状，避免与 better-auth 的内部类型耦合 */
export interface AppLocalSession {
  id: string
  token: string
  userId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  ipAddress: string | null
  userAgent: string | null
}

/** 从 Cookie 头里取一个值。只做这一件事，不引 cookie 解析库 */
function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      // 不是合法的百分号编码：原样返回，让它去比较失败（而不是 500）
      return value
    }
  }
  return null
}
