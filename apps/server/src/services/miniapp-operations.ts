import { createHash, randomBytes } from 'node:crypto'
import { and, eq, ne, or } from 'drizzle-orm'
import { db } from '../db/client.js'
import { miniappOperations } from '../db/schema.js'
import { HttpError } from '../lib/http.js'
import type { MiniappOperation, MiniappOperationResult } from '@mimir/shared/miniapp'
import type { MiniappPrincipal } from './miniapp-auth.js'

const processId = randomBytes(16).toString('hex')
type OperationRow = typeof miniappOperations.$inferSelect
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
function toOperation(row: OperationRow): MiniappOperation {
  return {
    id: row.id,
    requestId: row.requestId,
    kind: row.kind as MiniappOperation['kind'],
    status: row.status as MiniappOperation['status'],
    conversationId: row.conversationId,
    result: row.result,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
export async function recoverMiniappOperations(): Promise<void> {
  await db
    .update(miniappOperations)
    .set({
      status: 'interrupted',
      updatedAt: new Date(),
      error: {
        code: 'OPERATION_INTERRUPTED',
        message: '服务已重新启动，结果不确定。请先刷新资料或会话确认，系统不会自动重复执行。',
      },
    })
    .where(and(eq(miniappOperations.status, 'pending'), ne(miniappOperations.processId, processId)))
}
export async function getMiniappOperation(
  principal: MiniappPrincipal,
  id: string,
): Promise<MiniappOperation | null> {
  const [row] = await db
    .select()
    .from(miniappOperations)
    .where(
      and(
        eq(miniappOperations.ownerId, principal.ownerId),
        or(eq(miniappOperations.id, id), eq(miniappOperations.requestId, id)),
      ),
    )
    .limit(1)
  return row ? toOperation(row) : null
}
export async function beginMiniappOperation(
  principal: MiniappPrincipal,
  requestId: string,
  kind: MiniappOperation['kind'],
  payload: unknown,
): Promise<{ operation: MiniappOperation; fresh: boolean }> {
  const fingerprint = createHash('sha256').update(canonical({ kind, payload })).digest('hex')
  const now = new Date()
  const [inserted] = await db
    .insert(miniappOperations)
    .values({
      id: randomBytes(16).toString('hex'),
      ownerId: principal.ownerId,
      deviceId: principal.id,
      requestId,
      kind,
      fingerprint,
      status: 'pending',
      processId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning()
  if (inserted) return { operation: toOperation(inserted), fresh: true }
  const [existing] = await db
    .select()
    .from(miniappOperations)
    .where(
      and(
        eq(miniappOperations.ownerId, principal.ownerId),
        eq(miniappOperations.requestId, requestId),
      ),
    )
    .limit(1)
  if (!existing)
    throw new HttpError(500, 'OPERATION_UNAVAILABLE', '无法读取操作记录，请稍后查询原请求')
  if (existing.fingerprint !== fingerprint)
    throw new HttpError(
      409,
      'REQUEST_ID_CONFLICT',
      '同一请求编号已用于其他内容，请先确认原操作结果',
    )
  if (existing.status === 'pending' && existing.processId !== processId) {
    await failMiniappOperation(existing.id, new Error('process changed'))
    return { operation: (await getMiniappOperation(principal, existing.id))!, fresh: false }
  }
  return { operation: toOperation(existing), fresh: false }
}
export async function bindMiniappConversation(id: string, conversationId: string): Promise<void> {
  await db
    .update(miniappOperations)
    .set({ conversationId, updatedAt: new Date() })
    .where(and(eq(miniappOperations.id, id), eq(miniappOperations.status, 'pending')))
}
export async function finishMiniappOperation(
  id: string,
  result: MiniappOperationResult,
): Promise<void> {
  await db
    .update(miniappOperations)
    .set({ status: 'succeeded', result, error: null, updatedAt: new Date() })
    .where(and(eq(miniappOperations.id, id), eq(miniappOperations.status, 'pending')))
}
export async function failMiniappOperation(
  id: string,
  error: unknown,
  definite = false,
): Promise<void> {
  const known = error instanceof HttpError
  const failed = definite || known
  await db
    .update(miniappOperations)
    .set({
      status: failed ? 'failed' : 'interrupted',
      updatedAt: new Date(),
      error: known
        ? { code: error.code, message: error.message }
        : {
            code: failed ? 'OPERATION_FAILED' : 'OPERATION_INTERRUPTED',
            message: failed
              ? '操作未完成，请查看会话中的错误说明'
              : '未收到确定结果，请先刷新资料或会话确认，系统不会自动重复执行。',
          },
    })
    .where(and(eq(miniappOperations.id, id), eq(miniappOperations.status, 'pending')))
}
export async function runMiniappOperation(
  principal: MiniappPrincipal,
  requestId: string,
  kind: MiniappOperation['kind'],
  payload: unknown,
  action: () => Promise<MiniappOperationResult>,
  background = false,
): Promise<MiniappOperation> {
  const entry = await beginMiniappOperation(principal, requestId, kind, payload)
  if (!entry.fresh) return entry.operation
  const work = async () => {
    try {
      await finishMiniappOperation(entry.operation.id, await action())
    } catch (error) {
      await failMiniappOperation(entry.operation.id, error)
    }
  }
  if (background) {
    // Deliberately detached from HTTP abort: reconnecting only queries this receipt.
    void work().catch(() => {
      console.error('小程序操作回执写入失败，保持原请求记录以便恢复：', entry.operation.id)
    })
    return entry.operation
  }
  await work()
  return (await getMiniappOperation(principal, entry.operation.id))!
}
