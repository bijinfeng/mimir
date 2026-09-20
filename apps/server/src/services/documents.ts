import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type {
  DocumentDetail,
  DocumentListQuery,
  DocumentSummary,
  NoteCreate,
  NoteUpdate,
} from '@mimir/shared'
import { db } from '../db/client.js'
import { documentTags, documents, tags } from '../db/schema.js'
import { toSearchText } from '../lib/segment.js'
import { contentHash, toExcerpt } from '../lib/text.js'
import {
  buildNotePath,
  moveNote,
  readNote,
  trashNote,
  writeNote,
  type VaultNote,
} from '../lib/vault.js'

/**
 * 文档服务。
 *
 * 写入路径的顺序很重要：**先落文件，再写数据库**。
 * 原因：文件是真相、数据库是可重建的索引。反过来的话，
 * 一旦数据库写成功而文件写失败，就会出现一条永远打不开的记录。
 * 反之只会产生一个「数据库暂未收录的文件」，重新索引即可修复。
 */

type Row = typeof documents.$inferSelect

function toSummary(row: Row, tagNames: string[]): DocumentSummary {
  return {
    id: row.id,
    kind: row.kind as DocumentSummary['kind'],
    status: row.status as DocumentSummary['status'],
    title: row.title,
    excerpt: row.excerpt,
    tags: tagNames,
    path: row.path,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 取出若干文档的标签，避免 N+1 查询 */
async function loadTags(documentIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (documentIds.length === 0) return result

  const rows = await db
    .select({ documentId: documentTags.documentId, name: tags.name })
    .from(documentTags)
    .innerJoin(tags, eq(tags.id, documentTags.tagId))
    .where(inArray(documentTags.documentId, documentIds))

  for (const row of rows) {
    const list = result.get(row.documentId) ?? []
    list.push(row.name)
    result.set(row.documentId, list)
  }
  for (const list of result.values()) list.sort((a, b) => a.localeCompare(b))
  return result
}

/**
 * 同步文档的标签集合。
 * 采用「先删后插」而不是 diff：标签数量是个位数，简单胜过聪明。
 * 不清理无人引用的 tag 行——留着可以让下次输入自动补全得更准。
 *
 * 导出给重建索引用：标签存在文件 frontmatter 里，所以「数据库丢了」
 * 之后重建索引也必须把它们一起还原，否则内容回来了但标签没了。
 */
export async function syncTags(documentId: string, tagNames: string[]): Promise<void> {
  const unique = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))]
  await db.delete(documentTags).where(eq(documentTags.documentId, documentId))
  if (unique.length === 0) return

  for (const name of unique) {
    // 并发下可能撞唯一索引，用 on conflict 拿到已有 id
    const [tag] = await db
      .insert(tags)
      .values({ id: nanoid(12), name })
      .onConflictDoUpdate({ target: tags.name, set: { name } })
      .returning({ id: tags.id })

    if (tag) {
      await db.insert(documentTags).values({ documentId, tagId: tag.id }).onConflictDoNothing()
    }
  }
}

function buildIndexFields(title: string, body: string) {
  return {
    excerpt: toExcerpt(body),
    searchText: toSearchText(title, body),
    contentHash: contentHash(body),
  }
}

export async function createNote(input: NoteCreate): Promise<DocumentDetail> {
  const now = new Date()
  const id = nanoid(16)
  const path = buildNotePath(input.title, id, now)

  const note: VaultNote = {
    id,
    title: input.title,
    tags: input.tags,
    body: input.body,
    status: 'inbox',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    path,
  }

  await writeNote(note)

  const index = buildIndexFields(note.title, note.body)
  const [row] = await db
    .insert(documents)
    .values({
      id,
      kind: 'note',
      status: 'inbox',
      title: note.title,
      body: note.body,
      path,
      ...index,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!row) throw new Error('创建笔记失败：数据库未返回记录')

  await syncTags(id, input.tags)

  return { ...toSummary(row, [...input.tags].toSorted()), body: row.body }
}

export async function updateNote(id: string, input: NoteUpdate): Promise<DocumentDetail | null> {
  const existing = await getDocumentRow(id)
  if (!existing) return null

  const title = input.title ?? existing.title
  const body = input.body ?? existing.body
  const status = input.status ?? existing.status
  const tagNames = input.tags ?? [...((await loadTags([id])).get(id) ?? [])]

  // 标题变了就跟随改名，保证文件名和内容一致；
  // 自动生成的 id 后缀保证不会和已有文件冲突
  let path = existing.path
  if (existing.path && title !== existing.title) {
    const nextPath = buildNotePath(title, id, existing.createdAt)
    await moveNote(existing.path, nextPath)
    path = nextPath
  }

  const now = new Date()
  if (path) {
    await writeNote({
      id,
      title,
      tags: tagNames,
      body,
      status,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: now.toISOString(),
      path,
    })
  }

  const [row] = await db
    .update(documents)
    .set({
      title,
      body,
      status,
      path,
      ...buildIndexFields(title, body),
      updatedAt: now,
    })
    .where(eq(documents.id, id))
    .returning()

  if (!row) return null

  await syncTags(id, tagNames)

  return { ...toSummary(row, [...tagNames].toSorted()), body: row.body }
}

async function getDocumentRow(id: string): Promise<Row | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
  return row ?? null
}

/**
 * 读取文档。
 *
 * 刻意的规则：**读操作不改任何东西。** 文件如果被外部编辑器（Typora/Obsidian）
 * 改过，这里返回文件里的最新正文，但不去更新索引——索引的陈旧由显式的
 * 「重建索引」操作来修复。让读请求产生写副作用会带来难查的并发问题，
 * 而且用户在编辑器里打字的过程中会不断触发写回。
 */
export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const row = await getDocumentRow(id)
  if (!row) return null

  let body = row.body
  if (row.path) {
    try {
      // 文件是真相，优先返回文件内容
      body = (await readNote(row.path)).body
    } catch {
      // 文件不在了（被手工删除或尚未同步）：退回索引里的副本，不阻塞读取
    }
  }

  const tagNames = (await loadTags([id])).get(id) ?? []
  return { ...toSummary(row, tagNames), body }
}

export async function listDocuments(query: DocumentListQuery): Promise<DocumentSummary[]> {
  const conditions = [isNull(documents.deletedAt)]
  if (query.kind) conditions.push(eq(documents.kind, query.kind))
  if (query.status) conditions.push(eq(documents.status, query.status))
  if (query.tag) {
    conditions.push(
      sql`exists (
        select 1 from ${documentTags} dt
        join ${tags} t on t.id = dt.tag_id
        where dt.document_id = ${documents.id} and t.name = ${query.tag}
      )`,
    )
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(query.limit)
    .offset(query.offset)

  const tagMap = await loadTags(rows.map((row) => row.id))
  return rows.map((row) => toSummary(row, tagMap.get(row.id) ?? []))
}

/** 软删除：记录打标记，文件移进 vault/.trash，两者都可恢复 */
export async function deleteDocument(id: string): Promise<boolean> {
  const row = await getDocumentRow(id)
  if (!row) return false

  if (row.path) {
    await trashNote(row.path).catch((error) => {
      // 文件已经不在原地也算删除成功，不能因此卡住用户
      console.warn(`移动到回收站失败（继续删除记录）：${row.path}`, error)
    })
  }

  await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, id))

  return true
}

export async function listAllTags(): Promise<{ name: string; count: number }[]> {
  const rows = await db
    .select({
      name: tags.name,
      count: sql<number>`count(${documentTags.documentId})::int`,
    })
    .from(tags)
    .leftJoin(documentTags, eq(documentTags.tagId, tags.id))
    .groupBy(tags.name)
    .orderBy(desc(sql`count(${documentTags.documentId})`), tags.name)

  return rows.map((row) => ({ name: row.name, count: Number(row.count) }))
}
