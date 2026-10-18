import { createHash, createHmac, randomBytes } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { auth } from '../auth.js'
import { db } from '../db/client.js'
import { account, miniappDevices, session, user } from '../db/schema.js'
import { env } from '../env.js'
import { HttpError } from '../lib/http.js'
import type { MiniappLoginInput, MiniappLoginResponse, MiniappSession } from '@mimir/shared/miniapp'

const TOKEN_AGE_MS = 30 * 24 * 60 * 60 * 1000
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const credentialDigest = (value: string) =>
  createHmac('sha256', env.authSecret).update(value).digest('hex')
export interface MiniappPrincipal {
  id: string
  ownerId: string
  sessionId: string
  expiresAt: Date
  user: { id: string; name: string; email: string }
}
export function miniappSession(principal: MiniappPrincipal): MiniappSession {
  return {
    deviceId: principal.id,
    expiresAt: principal.expiresAt.toISOString(),
    user: principal.user,
  }
}

async function credentialFor(ownerId: string): Promise<string | null> {
  const [row] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, ownerId), eq(account.providerId, 'credential')))
    .limit(1)
  return row?.password ? credentialDigest(row.password) : null
}

/** Server-side Better Auth API retains password hashing and its authentication policy.
 * Its backing session is never delivered to the miniapp, so opaque device tokens
 * cannot be used on cookie-authenticated APIs. Session revocation also revokes access.
 */
export async function loginMiniapp(input: MiniappLoginInput): Promise<MiniappLoginResponse> {
  const identifier = input.identifier.trim()
  let email = identifier
  if (!identifier.includes('@')) {
    const [found] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.name, identifier))
      .limit(1)
    email = found?.email ?? 'nonexistent-owner@invalid.local'
  }
  const [candidate] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    .limit(1)
  const beforeCredential = candidate ? await credentialFor(candidate.id) : null
  const signedIn = await auth.api
    .signInEmail({ body: { email, password: input.password } })
    .catch(() => {
      throw new HttpError(401, 'UNAUTHORIZED', '用户名或密码不正确')
    })
  if (!signedIn.token) throw new HttpError(401, 'UNAUTHORIZED', '无法建立设备会话，请重新登录')
  const [backing] = await db
    .select()
    .from(session)
    .where(eq(session.token, signedIn.token))
    .limit(1)
  const credentialHash = await credentialFor(signedIn.user.id)
  if (
    !backing ||
    !credentialHash ||
    beforeCredential !== credentialHash ||
    candidate?.id !== signedIn.user.id
  ) {
    if (backing) await db.delete(session).where(eq(session.id, backing.id))
    throw new HttpError(401, 'UNAUTHORIZED', '账号状态已变化，请重新登录')
  }
  const rawToken = randomBytes(32).toString('base64url')
  const createdAt = new Date()
  const expiresAt = new Date(
    Math.min(createdAt.getTime() + TOKEN_AGE_MS, backing.expiresAt.getTime()),
  )
  const id = randomBytes(16).toString('hex')
  try {
    await db
      .insert(miniappDevices)
      .values({
        id,
        ownerId: signedIn.user.id,
        sessionId: backing.id,
        tokenHash: digest(rawToken),
        credentialHash,
        name: input.deviceName || '微信小程序',
        createdAt,
        expiresAt,
      })
  } catch (error) {
    await db.delete(session).where(eq(session.id, backing.id))
    throw error
  }
  return {
    token: rawToken,
    deviceId: id,
    expiresAt: expiresAt.toISOString(),
    user: { id: signedIn.user.id, email: signedIn.user.email, name: signedIn.user.name },
  }
}

export async function authenticateMiniapp(
  authorization: string | undefined,
): Promise<MiniappPrincipal> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')
  if (!match) throw new HttpError(401, 'MINIAPP_SESSION_EXPIRED', '请重新登录')
  const [row] = await db
    .select({ device: miniappDevices, owner: user, backing: session })
    .from(miniappDevices)
    .innerJoin(user, eq(user.id, miniappDevices.ownerId))
    .innerJoin(session, eq(session.id, miniappDevices.sessionId))
    .where(and(eq(miniappDevices.tokenHash, digest(match[1]!)), isNull(miniappDevices.revokedAt)))
    .limit(1)
  if (
    !row ||
    row.device.expiresAt.getTime() <= Date.now() ||
    row.backing.expiresAt.getTime() <= Date.now() ||
    row.device.credentialHash !== (await credentialFor(row.owner.id))
  ) {
    throw new HttpError(401, 'MINIAPP_SESSION_EXPIRED', '登录已过期或已撤销，请重新登录')
  }
  return {
    id: row.device.id,
    ownerId: row.owner.id,
    sessionId: row.backing.id,
    expiresAt: row.device.expiresAt,
    user: { id: row.owner.id, name: row.owner.name, email: row.owner.email },
  }
}
export async function logoutMiniapp(principal: MiniappPrincipal): Promise<void> {
  await db
    .update(miniappDevices)
    .set({ revokedAt: new Date() })
    .where(eq(miniappDevices.id, principal.id))
  await db.delete(session).where(eq(session.id, principal.sessionId))
}
