import { and, eq, gt, isNull } from 'drizzle-orm'
import { documentAgentToolResultSchema } from '@mimir/shared'
import type { DocumentAgentFormat, DocxAgentHistory, DocxAgentToolHistory } from '@mimir/shared'
import { db } from '../db/client.js'
import { docxAgentRuns } from '../db/schema.js'

const PENDING_TTL_MS = 30 * 60 * 1000

type ToolResponse = {
  interruptId: string
  status: 'resolved' | 'cancelled'
  payload?: unknown
}

function sortedIds(ids: readonly string[]): string[] {
  const unique = new Set(ids)
  if (unique.size !== ids.length || ids.length === 0) throw new Error('无效的工具中断集合')
  if (ids.some((id) => !id.startsWith('client_tool_'))) throw new Error('不支持的工具中断类型')
  return [...unique].toSorted()
}

/** Save the run before its interrupt terminal is sent to the browser. */
export async function rememberDocxInterrupt(input: {
  runId: string
  conversationId: string
  documentId: string
  format?: DocumentAgentFormat
  version?: number
  roundId: string
  messageId: string
  interruptIds: string[]
  tools: DocxAgentToolHistory[]
}): Promise<void> {
  const interruptIds = sortedIds(input.interruptIds)
  if (
    input.tools.length !== interruptIds.length ||
    JSON.stringify(sortedIds(input.tools.map((tool) => tool.interruptId))) !==
      JSON.stringify(interruptIds)
  ) {
    throw new Error('工具记录与中断集合不匹配')
  }
  await db.insert(docxAgentRuns).values({
    runId: input.runId,
    conversationId: input.conversationId,
    documentId: input.documentId,
    format: input.format ?? 'docx',
    version: input.version ?? 0,
    roundId: input.roundId,
    messageId: input.messageId,
    interruptIds,
    tools: input.tools,
    expiresAt: new Date(Date.now() + PENDING_TTL_MS),
  })
}

/** Persist only tool names and execution states; never arguments or document text. */
export async function settleDocxInterrupt(
  runId: string,
  responses: readonly ToolResponse[],
): Promise<void> {
  const [row] = await db.select().from(docxAgentRuns).where(eq(docxAgentRuns.runId, runId))
  if (!row) throw new Error('工具中断记录不存在')
  const byId = new Map(responses.map((response) => [response.interruptId, response]))
  const tools: DocxAgentToolHistory[] = row.tools.map((tool) => {
    const response = byId.get(tool.interruptId)
    if (!response || response.status === 'cancelled') {
      return { interruptId: tool.interruptId, name: tool.name, status: 'cancelled' }
    }
    const payload = response.payload
    const result =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
    const settled: DocxAgentToolHistory = {
      interruptId: tool.interruptId,
      name: tool.name,
      status: result.ok === true ? 'completed' : 'failed',
    }
    if (typeof result.changed === 'boolean') settled.changed = result.changed
    return settled
  })
  const status: DocxAgentHistory['status'] = tools.some((tool) => tool.status === 'failed')
    ? 'failed'
    : tools.every((tool) => tool.status === 'cancelled')
      ? 'cancelled'
      : 'completed'
  await db.update(docxAgentRuns).set({ tools, status }).where(eq(docxAgentRuns.runId, runId))
}

export async function loadDocxAgentHistory(
  conversationId: string,
): Promise<Map<string, DocxAgentHistory>> {
  const rows = await db
    .select()
    .from(docxAgentRuns)
    .where(eq(docxAgentRuns.conversationId, conversationId))
  return new Map(
    rows.map((row) => [
      row.messageId,
      {
        runId: row.runId,
        documentId: row.documentId,
        format: row.format as DocumentAgentFormat,
        status: row.status as DocxAgentHistory['status'],
        tools: row.tools,
      },
    ]),
  )
}

/** Explicitly retire an interrupted run after a reload or user cancellation. */
export async function cancelPendingDocxRun(
  conversationId: string,
  runId: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(docxAgentRuns)
    .where(
      and(
        eq(docxAgentRuns.conversationId, conversationId),
        eq(docxAgentRuns.runId, runId),
        isNull(docxAgentRuns.consumedAt),
      ),
    )
  if (!row) return false
  const tools = row.tools.map((tool): DocxAgentToolHistory => ({
    interruptId: tool.interruptId,
    name: tool.name,
    status: 'cancelled',
  }))
  const updated = await db
    .update(docxAgentRuns)
    .set({ consumedAt: new Date(), status: 'cancelled', tools })
    .where(and(eq(docxAgentRuns.runId, runId), isNull(docxAgentRuns.consumedAt)))
    .returning({ runId: docxAgentRuns.runId })
  return updated.length === 1
}

/**
 * Resolve assistant-ui's resume (which omits parentRunId) against persisted,
 * authenticated context. Atomic consumption rejects retries and replay.
 */
export async function consumeDocxInterrupt(input: {
  conversationId: string
  documentId: string
  format?: DocumentAgentFormat
  version?: number
  roundId: string
  interruptIds: string[]
  responses?: readonly ToolResponse[]
}): Promise<string | null> {
  const requested = sortedIds(input.interruptIds)
  const rows = await db
    .select({
      runId: docxAgentRuns.runId,
      interruptIds: docxAgentRuns.interruptIds,
      tools: docxAgentRuns.tools,
      version: docxAgentRuns.version,
    })
    .from(docxAgentRuns)
    .where(
      and(
        eq(docxAgentRuns.conversationId, input.conversationId),
        eq(docxAgentRuns.documentId, input.documentId),
        eq(docxAgentRuns.format, input.format ?? 'docx'),
        eq(docxAgentRuns.roundId, input.roundId),
        isNull(docxAgentRuns.consumedAt),
        gt(docxAgentRuns.expiresAt, new Date()),
      ),
    )

  const matches = rows.filter(
    (row) => JSON.stringify(sortedIds(row.interruptIds)) === JSON.stringify(requested),
  )
  if (matches.length !== 1) return null

  const row = matches[0]!
  if (input.responses) {
    if (input.version === undefined) throw new Error('工具续轮缺少画布版本')
    if (input.responses.length !== row.tools.length) throw new Error('工具结果数量不匹配')
    const responses = new Map(input.responses.map((response) => [response.interruptId, response]))
    if (responses.size !== row.tools.length) throw new Error('工具结果中断 ID 重复')
    let expectedVersion = row.version
    let hasCancellation = false
    for (const tool of row.tools) {
      const response = responses.get(tool.interruptId)
      if (!response) throw new Error('工具结果与中断 ID 不匹配')
      if (response.status === 'cancelled') {
        if (response.payload !== undefined) throw new Error('已取消工具不得携带执行结果')
        hasCancellation = true
        continue
      }
      if (response.status !== 'resolved') throw new Error('工具结果状态无效')
      const parsed = documentAgentToolResultSchema.safeParse(response.payload)
      if (!parsed.success) throw new Error('工具执行结果无效')
      const result = parsed.data
      if (result.changed === true) {
        if (result.version === undefined || result.version <= expectedVersion)
          throw new Error('工具修改版本无效')
        expectedVersion = result.version
      } else if (result.version !== undefined && result.version !== expectedVersion) {
        throw new Error('工具只读结果版本不匹配')
      }
    }
    // A cancelled in-flight editor operation can leave an unsaved partial change
    // without a resolved result. The fresh context is still sent to the model,
    // while a lower version or an unexplained advance remains stale.
    if (input.version !== expectedVersion && !(hasCancellation && input.version > expectedVersion))
      return null
  } else if (input.version !== undefined && input.version !== row.version) {
    return null
  }
  const runId = row.runId
  const consumed = await db
    .update(docxAgentRuns)
    .set({ consumedAt: new Date() })
    .where(and(eq(docxAgentRuns.runId, runId), isNull(docxAgentRuns.consumedAt)))
    .returning({ runId: docxAgentRuns.runId })
  return consumed.length === 1 ? runId : null
}

/** Return a claim only when the model failed before an AG-UI stream was created. */
export async function releaseDocxInterrupt(runId: string): Promise<void> {
  await db.update(docxAgentRuns).set({ consumedAt: null }).where(eq(docxAgentRuns.runId, runId))
}
