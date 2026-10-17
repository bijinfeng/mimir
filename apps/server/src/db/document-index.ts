import { and, eq } from 'drizzle-orm'
import { db } from './client.js'
import { chunks, chunkEmbeddings, documents } from './schema.js'
import { dbDriver } from '../env.js'
import { chunkText } from '../lib/chunk.js'

// The program is synchronous: SQLite drains .all() inside its synchronous transaction.
// PostgreSQL awaits the same statements inside its real asynchronous transaction.
// No service async callback ever enters better-sqlite3's transaction API.
type Statement = PromiseLike<unknown>
type Program<T> = Generator<Statement, T, unknown>
function* result<T>(statement: PromiseLike<T>): Generator<Statement, T, unknown> {
  return (yield statement) as T
}
async function atomic<T>(program: (tx: typeof db) => Program<T>): Promise<T> {
  if (dbDriver === 'postgres') {
    return db.transaction(async (tx) => {
      const steps = program(tx as typeof db)
      let step = steps.next()
      while (!step.done) step = steps.next(await step.value)
      return step.value
    })
  }
  // Runtime SQLite queries expose .all(); the public db type is deliberately PG-shaped.
  const transact = db.transaction as unknown as (work: (tx: typeof db) => T) => T
  return transact.call(db, (tx) => {
    const steps = program(tx)
    let step = steps.next()
    while (!step.done) {
      const query = step.value as Statement & { all(): unknown }
      step = steps.next(query.all())
    }
    return step.value
  })
}
function* current(tx: typeof db, id: string) {
  const query = tx.select().from(documents).where(eq(documents.id, id))
  const rows = yield* result(dbDriver === 'postgres' ? query.for('update') : query)
  return rows[0]
}
export interface IndexIdentity {
  body: string
  contentHash: string | null
  sourceKey: string | null
}
function matches(row: typeof documents.$inferSelect | undefined, expected: IndexIdentity): boolean {
  return (
    !!row &&
    row.deletedAt === null &&
    row.body === expected.body &&
    row.contentHash === expected.contentHash &&
    row.sourceKey === expected.sourceKey
  )
}
export async function publishFileReplacement(
  id: string,
  expected: IndexIdentity,
  values: Partial<typeof documents.$inferInsert>,
  invalidateChunks = true,
): Promise<typeof documents.$inferSelect> {
  return atomic(function* (tx) {
    if (!matches(yield* current(tx, id), expected))
      throw new Error('原件已变化，请重新读取后再保存')
    const rows = yield* result(
      tx.update(documents).set(values).where(eq(documents.id, id)).returning(),
    )
    if (invalidateChunks)
      yield* result(tx.delete(chunks).where(eq(chunks.documentId, id)).returning({ id: chunks.id }))
    if (!rows[0]) throw new Error('替换原件入库失败：数据库未返回记录')
    return rows[0]
  })
}
/** Reindex also clears old chunks in the same transaction as the source/body publication. */
export async function publishFileReindex(values: typeof documents.$inferInsert): Promise<void> {
  await atomic(function* (tx) {
    const old = yield* current(tx, values.id)
    yield* result(
      tx
        .insert(documents)
        .values(values)
        .onConflictDoUpdate({
          target: documents.id,
          set: { ...values, deletedAt: null },
        })
        .returning({ id: documents.id }),
    )
    if (!values.body || !old || old.body !== values.body || old.sourceKey !== values.sourceKey)
      yield* result(
        tx.delete(chunks).where(eq(chunks.documentId, values.id)).returning({ id: chunks.id }),
      )
  })
}
export async function publishChunks(
  id: string,
  expected: IndexIdentity,
  size: number,
  overlap: number,
): Promise<{ count: number; unchanged: boolean }> {
  return atomic(function* (tx) {
    const doc = yield* current(tx, id)
    if (!matches(doc, expected)) return { count: 0, unchanged: true }
    const next = chunkText(expected.body, { size, overlap, title: doc!.title }, id)
    const existing = yield* result(
      tx.select().from(chunks).where(eq(chunks.documentId, id)).orderBy(chunks.idx),
    )
    if (
      existing.length === next.length &&
      existing.every(
        (row, i) =>
          row.id === next[i]!.id &&
          row.startAt === next[i]!.start &&
          row.endAt === next[i]!.end &&
          row.content === next[i]!.content,
      )
    ) {
      for (const [i, row] of existing.entries()) {
        const chunk = next[i]!
        if (row.searchText === chunk.searchText && row.heading === chunk.heading) continue
        yield* result(
          tx
            .update(chunks)
            .set({ searchText: chunk.searchText, heading: chunk.heading, updatedAt: new Date() })
            .where(eq(chunks.id, row.id))
            .returning({ id: chunks.id }),
        )
      }
      return { count: existing.length, unchanged: true }
    }
    yield* result(tx.delete(chunks).where(eq(chunks.documentId, id)).returning({ id: chunks.id }))
    const now = new Date()
    if (next.length)
      yield* result(
        tx
          .insert(chunks)
          .values(
            next.map((chunk) => ({
              id: chunk.id,
              documentId: id,
              idx: chunk.index,
              content: chunk.content,
              searchText: chunk.searchText,
              startAt: chunk.start,
              endAt: chunk.end,
              heading: chunk.heading,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .returning({ id: chunks.id }),
      )
    return { count: next.length, unchanged: false }
  })
}
export async function publishEmbedding(
  id: string,
  expected: IndexIdentity,
  chunk: { id: string; content: string },
  values: typeof chunkEmbeddings.$inferInsert,
): Promise<boolean> {
  return atomic(function* (tx) {
    if (!matches(yield* current(tx, id), expected)) return false
    const rows = yield* result(
      tx
        .select({ id: chunks.id })
        .from(chunks)
        .where(
          and(
            eq(chunks.id, chunk.id),
            eq(chunks.documentId, id),
            eq(chunks.content, chunk.content),
          ),
        ),
    )
    if (!rows.length) return false
    yield* result(
      tx
        .insert(chunkEmbeddings)
        .values(values)
        .onConflictDoUpdate({
          target: [chunkEmbeddings.chunkId, chunkEmbeddings.model],
          set: { dimension: values.dimension, embedding: values.embedding },
        })
        .returning({ chunkId: chunkEmbeddings.chunkId }),
    )
    return true
  })
}
