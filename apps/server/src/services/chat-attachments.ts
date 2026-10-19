import { createHash } from 'node:crypto'
import { and, eq, lt, isNull, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import {
  CHAT_ATTACHMENT_LIMITS as L,
  type ChatAttachment,
  type ChatAttachmentRef,
} from '@mimir/shared'
import { db } from '../db/client.js'
import {
  conversationAttachments as attachments,
  attachmentLeases as leases,
  attachmentGarbage as garbage,
  conversations,
  messageAttachments,
  messages,
} from '../db/schema.js'
import { activeStorage } from '../plugins/host.js'
import { HttpError } from '../lib/http.js'
import { prepareAttachmentBytes } from './chat-attachment-prepare.js'

type Row = typeof attachments.$inferSelect
const tasks = new Map<string, AbortController>()
const operations = new Map<string, Promise<ChatAttachment>>()
const locks = new Map<string, Promise<unknown>>()
const now = () => new Date()
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
function fail(code: string, message: string, status: 400 | 404 | 409 | 413 = 400): never {
  throw new HttpError(status, code, message)
}
async function serial<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(action)
  locks.set(id, next)
  try {
    return await next
  } finally {
    if (locks.get(id) === next) locks.delete(id)
  }
}
function publicAttachment(row: Row): ChatAttachment {
  const expired = !row.boundAt && row.expiresAt.getTime() <= Date.now()
  return {
    id: row.id,
    conversationId: row.conversationId,
    name: row.name,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    kind: row.kind === 'image' ? 'image' : 'document',
    status: expired ? 'unavailable' : (row.status as ChatAttachment['status']),
    ...(row.error || expired ? { error: expired ? '附件已过期，请重新选择' : row.error! } : {}),
    originalUrl: `/api/conversations/${row.conversationId}/attachments/${row.id}/file`,
    createdAt: row.createdAt.toISOString(),
    ...(!row.boundAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    bound: !!row.boundAt,
  }
}
async function conversationExists(id: string) {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, id))
  if (!row) fail('CONVERSATION_NOT_FOUND', '会话不存在', 404)
}
async function find(id: string, conversationId: string, ownerId?: string): Promise<Row> {
  await conversationExists(conversationId)
  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.conversationId, conversationId),
        ...(ownerId ? [eq(attachments.ownerId, ownerId)] : []),
      ),
    )
  if (!row) fail('ATTACHMENT_NOT_FOUND', '附件不存在或不属于此会话', 404)
  return row
}
export async function getChatAttachment(conversationId: string, id: string, ownerId: string) {
  return publicAttachment(await find(id, conversationId, ownerId))
}

export function uploadChatAttachment(input: {
  conversationId: string
  ownerId: string
  operationId: string
  name: string
  mime: string
  data: Uint8Array
  signal?: AbortSignal
}): Promise<ChatAttachment> {
  const key = `${input.conversationId}:${input.ownerId}:${input.operationId}`
  const previous = operations.get(key)
  if (previous)
    return previous.then((result) => {
      if (result.sha256 !== hash(input.data))
        fail('ATTACHMENT_OPERATION_MISMATCH', '同一上传操作不能替换文件', 409)
      return result
    })
  const result = uploadOnce(input)
  operations.set(key, result)
  void result
    .finally(() => {
      if (operations.get(key) === result) operations.delete(key)
    })
    .catch(() => undefined)
  return result
}
async function uploadOnce(
  input: Parameters<typeof uploadChatAttachment>[0],
): Promise<ChatAttachment> {
  const { conversationId, ownerId, data, signal } = input
  signal?.throwIfAborted()
  if (
    !input.operationId ||
    input.operationId.length > 100 ||
    !input.name ||
    input.name.length > 255 ||
    [...input.name].some((char) => char.charCodeAt(0) < 32 || char === '/' || char === '\\')
  )
    fail('INVALID_ATTACHMENT', '附件名称或上传操作无效')
  if (!data.length || data.length > L.documentBytes)
    fail('ATTACHMENT_TOO_LARGE', '附件为空或超过单件大小限制', 413)
  const digest = hash(data),
    id = nanoid(20),
    createdAt = now(),
    objectKey = `chat-attachments/${conversationId}/${createdAt.getTime()}_${id}/original`
  const row = await serial(conversationId, async () => {
    await conversationExists(conversationId)
    const [existing] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.conversationId, conversationId),
          eq(attachments.operationId, input.operationId),
        ),
      )
    if (existing) {
      if (existing.ownerId !== ownerId || existing.sha256 !== digest)
        fail('ATTACHMENT_OPERATION_MISMATCH', '上传操作不匹配', 409)
      return existing
    }
    const all = await db
      .select({ size: attachments.size })
      .from(attachments)
      .where(eq(attachments.conversationId, conversationId))
    if (all.reduce((n, a) => n + a.size, 0) + data.length > L.conversationBytes)
      fail('ATTACHMENT_QUOTA', '此会话附件超过 200MiB，请使用新会话', 413)
    const storage = activeStorage()
    await storage.write(objectKey, data)
    try {
      const [inserted] = await db
        .insert(attachments)
        .values({
          id,
          conversationId,
          ownerId,
          operationId: input.operationId,
          name: input.name,
          mime: 'application/octet-stream',
          kind: 'document',
          size: data.length,
          sha256: digest,
          objectKey,
          status: 'processing',
          createdAt,
          expiresAt: new Date(createdAt.getTime() + L.draftMs),
        })
        .returning()
      return inserted!
    } catch (error) {
      await storage.remove(objectKey).catch(() => undefined)
      throw error
    }
  })
  if (row.id !== id) return publicAttachment(row)
  const controller = new AbortController(),
    abort = () => controller.abort()
  tasks.set(id, controller)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  try {
    await leaseChatAttachment(conversationId, id, `prepare:${id}`, L.leaseMs)
    const parsed = await prepareAttachmentBytes(input.name, input.mime, data, controller.signal)
    controller.signal.throwIfAborted()
    const changed = await db
      .update(attachments)
      .set({ mime: parsed.mime, kind: parsed.kind, extractedText: parsed.text, status: 'ready' })
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.revision, 0),
          eq(attachments.status, 'processing'),
        ),
      )
      .returning()
    if (!changed.length) fail('ATTACHMENT_CANCELLED', '附件已取消', 409)
  } catch (error) {
    await db
      .update(attachments)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : '附件准备失败',
        expiresAt: new Date(Date.now() + L.orphanMs),
      })
      .where(and(eq(attachments.id, id), eq(attachments.revision, 0)))
  } finally {
    tasks.delete(id)
    signal?.removeEventListener('abort', abort)
    await releaseChatAttachmentLease(id, `prepare:${id}`)
  }
  const result = await find(id, conversationId, ownerId)
  if (signal?.aborted) {
    await deleteChatAttachment(conversationId, id, ownerId)
    throw new Error('附件上传已取消')
  }
  return publicAttachment(result)
}
export async function leaseChatAttachment(
  conversationId: string,
  id: string,
  leaseId: string,
  durationMs: number = L.leaseMs,
  ownerId?: string,
) {
  return serial(conversationId, async () => {
    const row = await find(id, conversationId, ownerId)
    if (
      !leaseId ||
      leaseId.length > 150 ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      durationMs > L.leaseMs
    )
      fail('INVALID_LEASE', '附件保护期限无效')
    if (!row.boundAt && row.expiresAt.getTime() <= Date.now())
      fail('ATTACHMENT_EXPIRED', '附件已过期', 409)
    if (!row.boundAt && row.expiresAt.getTime() < Date.now() + durationMs) {
      await db
        .update(attachments)
        .set({ expiresAt: new Date(Date.now() + durationMs) })
        .where(eq(attachments.id, id))
    }
    await db
      .insert(leases)
      .values({ attachmentId: id, leaseId, expiresAt: new Date(Date.now() + durationMs) })
      .onConflictDoUpdate({
        target: [leases.attachmentId, leases.leaseId],
        set: { expiresAt: new Date(Date.now() + durationMs) },
      })
  })
}
export async function releaseChatAttachmentLease(id: string, leaseId: string) {
  await db.delete(leases).where(and(eq(leases.attachmentId, id), eq(leases.leaseId, leaseId)))
}
async function retire(row: Row) {
  tasks.get(row.id)?.abort()
  await db
    .insert(garbage)
    .values({ objectKey: row.objectKey, createdAt: now() })
    .onConflictDoNothing()
  await db.delete(attachments).where(eq(attachments.id, row.id))
}
export async function deleteChatAttachment(conversationId: string, id: string, ownerId: string) {
  await serial(conversationId, async () => {
    const row = await find(id, conversationId, ownerId)
    // Removing a composer copy cannot revoke resources used by an already-sent round.
    if (row.boundAt) return
    const live = await db.select().from(leases).where(eq(leases.attachmentId, id))
    if (
      live.some(
        (lease) => lease.expiresAt.getTime() > Date.now() && !lease.leaseId.startsWith('prepare:'),
      )
    )
      fail('ATTACHMENT_IN_USE', '附件仍被队列或当前请求使用', 409)
    await retire(row)
  })
  await drainAttachmentGarbage()
}
export async function readChatAttachment(conversationId: string, id: string, ownerId: string) {
  const row = await find(id, conversationId, ownerId)
  if (publicAttachment(row).status !== 'ready')
    fail('ATTACHMENT_UNAVAILABLE', '附件尚未准备好或已失效', 409)
  const data = await verifiedBytes(row)
  return { attachment: publicAttachment(row), data }
}
async function verifiedBytes(row: Row): Promise<Uint8Array> {
  try {
    const data = await activeStorage().read(row.objectKey)
    if (data.length !== row.size || hash(data) !== row.sha256) throw new Error('hash')
    return data
  } catch {
    await db
      .update(attachments)
      .set({ status: 'unavailable', error: '附件原件缺失或已更改，请重新选择' })
      .where(eq(attachments.id, row.id))
    fail('ATTACHMENT_UNAVAILABLE', '附件原件缺失或已更改，请重新选择', 409)
  }
}
export async function bindChatAttachments(
  conversationId: string,
  messageId: string,
  refs: readonly ChatAttachmentRef[],
) {
  await bindAttachmentRefs(conversationId, messageId, refs, 'user')
}
/** Only server-prepared context refs may be recorded here, never client-supplied sources. */
export async function recordAssistantAttachmentContext(
  conversationId: string,
  messageId: string,
  refs: readonly ChatAttachmentRef[],
) {
  await bindAttachmentRefs(conversationId, messageId, refs, 'assistant')
}
async function bindAttachmentRefs(
  conversationId: string,
  messageId: string,
  refs: readonly ChatAttachmentRef[],
  role: 'user' | 'assistant',
) {
  await serial(conversationId, async () => {
    const [message] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.conversationId, conversationId),
          eq(messages.role, role),
        ),
      )
    if (!message) fail('ATTACHMENT_MESSAGE_MISMATCH', '附件无法关联到此消息', 409)
    for (const ref of refs) {
      const row = await find(ref.id, conversationId)
      // A prepared source can become unavailable while the model runs; preserve its truthful
      // provenance without claiming the original is still readable. It was bound on send.
      if (
        row.sha256 !== ref.sha256 ||
        (role === 'user' ? publicAttachment(row).status !== 'ready' : !row.boundAt)
      )
        fail('ATTACHMENT_UNAVAILABLE', '附件已失效', 409)
      await db
        .insert(messageAttachments)
        .values({ messageId, attachmentId: row.id })
        .onConflictDoNothing()
      if (role === 'user')
        await db
          .update(attachments)
          .set({ boundAt: row.boundAt ?? now() })
          .where(eq(attachments.id, row.id))
    }
  })
}
export async function loadMessageAttachments(
  conversationId: string,
  options: { messageId?: string; role?: 'user' | 'assistant' } = {},
): Promise<Map<string, ChatAttachment[]>> {
  const rows = await db
    .select({ messageId: messageAttachments.messageId, attachment: attachments })
    .from(messageAttachments)
    .innerJoin(attachments, eq(attachments.id, messageAttachments.attachmentId))
    .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
    .where(
      and(
        eq(attachments.conversationId, conversationId),
        eq(messages.role, options.role ?? 'user'),
        ...(options.messageId ? [eq(messages.id, options.messageId)] : []),
      ),
    )
  const result = new Map<string, ChatAttachment[]>()
  const checked = new Map<string, Row>()
  for (const row of rows) {
    let attachment = checked.get(row.attachment.id) ?? row.attachment
    if (!checked.has(attachment.id) && attachment.status === 'ready') {
      try {
        await verifiedBytes(attachment)
      } catch {
        attachment = {
          ...attachment,
          status: 'unavailable',
          error: '附件原件缺失或已更改，请重新选择',
        }
      }
    }
    checked.set(attachment.id, attachment)
    const list = result.get(row.messageId) ?? []
    list.push(publicAttachment(attachment))
    result.set(row.messageId, list)
  }
  return result
}
export async function prepareChatAttachmentContext(input: {
  conversationId: string
  refs?: readonly ChatAttachmentRef[]
  includeHistory?: boolean
  historyMessageIds?: readonly string[]
  signal?: AbortSignal
}) {
  const refs = input.refs ?? []
  if (refs.length > L.files || new Set(refs.map((r) => r.id)).size !== refs.length)
    fail('ATTACHMENT_COUNT', '每条消息最多 4 个不同附件')
  const current = await Promise.all(
    refs.map(async (ref) => {
      const row = await find(ref.id, input.conversationId)
      if (row.sha256 !== ref.sha256)
        fail('ATTACHMENT_HASH_MISMATCH', '附件内容与发送快照不匹配', 409)
      return row
    }),
  )
  if (current.reduce((n, row) => n + row.size, 0) > L.totalBytes)
    fail('ATTACHMENT_BUDGET', '每条消息附件不能超过 20MiB', 413)
  const history =
    input.includeHistory === false
      ? []
      : await db
          .select()
          .from(attachments)
          .where(eq(attachments.conversationId, input.conversationId))
  let selectedHistory = history.filter((row) => row.boundAt)
  if (input.historyMessageIds) {
    const links = input.historyMessageIds.length
      ? await db
          .select({ attachmentId: messageAttachments.attachmentId })
          .from(messageAttachments)
          .where(inArray(messageAttachments.messageId, [...input.historyMessageIds]))
      : []
    const ids = new Set(links.map((link) => link.attachmentId))
    selectedHistory = selectedHistory.filter((row) => ids.has(row.id))
  }
  const rows = [...new Map([...selectedHistory, ...current].map((row) => [row.id, row])).values()]
  const documents: Array<{ id: string; name: string; text: string }> = [],
    images: Array<{ id: string; name: string; mime: string; data: Uint8Array }> = []
  const leaseId = `run:${nanoid(20)}`,
    held: string[] = []
  const release = async () => {
    await Promise.all(held.map((id) => releaseChatAttachmentLease(id, leaseId)))
  }
  try {
    let characters = 0
    for (const row of rows) {
      input.signal?.throwIfAborted()
      if (publicAttachment(row).status !== 'ready')
        fail('ATTACHMENT_UNAVAILABLE', '附件未准备完成或已失效', 409)
      await leaseChatAttachment(input.conversationId, row.id, leaseId)
      held.push(row.id)
      const data = await verifiedBytes(row)
      if (row.kind === 'image') images.push({ id: row.id, name: row.name, mime: row.mime, data })
      else {
        const text = row.extractedText ?? ''
        characters += text.length
        documents.push({ id: row.id, name: row.name, text })
      }
    }
    if (characters > L.roundCharacters)
      fail('ATTACHMENT_CONTEXT_BUDGET', '本轮会话附件正文超过 24000 字符，请缩小附件范围', 413)
    return { attachments: rows.map(publicAttachment), documents, images, release }
  } catch (error) {
    await release()
    throw error
  }
}
/** Called before cascading a conversation. Cleanup records intentionally have no FK. */
export async function revokeConversationAttachments(id: string) {
  const rows = await db.select().from(attachments).where(eq(attachments.conversationId, id))
  for (const row of rows) {
    tasks.get(row.id)?.abort()
    await db
      .update(attachments)
      .set({ status: 'unavailable', error: '所属会话已删除', revision: row.revision + 1 })
      .where(eq(attachments.id, row.id))
    await db
      .insert(garbage)
      .values({ objectKey: row.objectKey, createdAt: now() })
      .onConflictDoNothing()
  }
}
export async function drainAttachmentGarbage() {
  for (const row of await db.select().from(garbage)) {
    try {
      await activeStorage().remove(row.objectKey)
      await db.delete(garbage).where(eq(garbage.objectKey, row.objectKey))
    } catch (error) {
      console.warn('会话附件回收待重试', row.objectKey, error)
    }
  }
}
export async function collectChatAttachments(at = new Date()) {
  await db.delete(leases).where(lt(leases.expiresAt, at))
  const rows = await db
    .select()
    .from(attachments)
    .where(and(isNull(attachments.boundAt), lt(attachments.expiresAt, at)))
  for (const candidate of rows) {
    await serial(candidate.conversationId, async () => {
      // Candidates were read outside the lock: a queued renewal or send may have won since.
      const [row] = await db.select().from(attachments).where(eq(attachments.id, candidate.id))
      if (!row || row.boundAt || row.expiresAt.getTime() >= at.getTime()) return
      const held = await db.select().from(leases).where(eq(leases.attachmentId, row.id))
      if (!held.some((lease) => lease.expiresAt.getTime() >= at.getTime())) await retire(row)
    })
  }
  await drainAttachmentGarbage()
  // A crash between file-write and DB insert leaves a timestamped, identifiable orphan.
  const live = new Set(
    (await db.select({ key: attachments.objectKey }).from(attachments)).map((row) => row.key),
  )
  for (const key of await activeStorage().list('chat-attachments/')) {
    const timestamp = /\/(\d+)_[-\w]+\/original$/.exec(key)?.[1]
    if (timestamp && !live.has(key) && Number(timestamp) + L.orphanMs < at.getTime())
      await activeStorage()
        .remove(key)
        .catch(() => undefined)
  }
}
export async function recoverChatAttachments() {
  await db
    .update(attachments)
    .set({
      status: 'failed',
      error: '服务重启中断了准备，请移除后重新选择',
      revision: 1,
      expiresAt: new Date(Date.now() + L.orphanMs),
    })
    .where(eq(attachments.status, 'processing'))
  await collectChatAttachments()
}
