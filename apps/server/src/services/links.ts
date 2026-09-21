import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { DocumentKind } from '@mimir/shared'
import { db } from '../db/client.js'
import { documentLinks, documents } from '../db/schema.js'

/**
 * 双链。
 *
 * `docs/PRD.md` §5.10：「文档底部列出『来源』和『被引用』，让双向链接是双向的。」
 *
 * 链接从正文里的**站内链接**解析：`[标题](/doc/<id>)`。
 * 用 id 而不是标题做锚点，理由是标题会改——按标题匹配的话，对方改个名
 * 所有指向它的链接就断了，而且断得无声无息。
 *
 * **只存出链，不存反链。** 反链靠反向查询得到。存一份反链等于把同一个事实
 * 写两遍，必然有一天对不上（比如文档被删、或某次写入失败）。
 */

/**
 * 站内链接的语法。`/doc/<id>` 是唯一形式。
 *
 * 刻意不接受裸标题（`[[双链]]` 那种）：标题会在编辑过程中不断变化，
 * 编辑器每敲一个字都去解析一遍会得到大量误匹配。id 是稳定的。
 */
const LINK_PATTERN = /\]\(\/doc\/([A-Za-z0-9_-]+)\)/g

/** 从 Markdown 正文里抽出所有站内链接指向的文档 id */
export function extractLinkTargets(markdown: string): string[] {
  const found = new Set<string>()
  for (const match of markdown.matchAll(LINK_PATTERN)) {
    const id = match[1]
    if (id) found.add(id)
  }
  return [...found]
}

/**
 * 重建某篇文档的出链。每次保存正文时调用。
 *
 * 「先删后插」而不是 diff：出链数量是个位数或十几，简单胜过聪明，
 * 而且我们无法从最终文本里区分「新增了哪些、删掉了哪些」——
 * 那是解析器的活，不值得为它做一个差量算法。
 */
export async function syncDocumentLinks(documentId: string, body: string): Promise<void> {
  const targets = extractLinkTargets(body).filter((id) => id !== documentId)
  const alive = await filterExisting(targets)

  await db.delete(documentLinks).where(eq(documentLinks.fromId, documentId))
  if (alive.length === 0) return

  await db
    .insert(documentLinks)
    .values(alive.map((toId) => ({ fromId: documentId, toId })))
    .onConflictDoNothing()
}

/** 链接目标可能已被删除——指向不存在的 id 不该让保存失败，但也别写进表里 */
async function filterExisting(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(inArray(documents.id, ids), isNull(documents.deletedAt)))
  return rows.map((row) => row.id)
}

export interface DocumentLink {
  id: string
  title: string
  kind: DocumentKind
}

export interface DocumentLinks {
  /** 来源：这篇链接出去的目标 */
  sources: DocumentLink[]
  /** 被引用：链接到这篇的文档 */
  backlinks: DocumentLink[]
}

/**
 * 取一篇文档的双链两侧。
 *
 * 两侧都是一次连接 + 一次文档查询，不是 N+1——
 * 底部「来源 / 被引用」通常各只有几条，但反链在热门笔记上可能很多，
 * 所以还是走连接而不是逐条查标题。
 */
export async function getDocumentLinks(documentId: string): Promise<DocumentLinks> {
  const columns = { id: documents.id, title: documents.title, kind: documents.kind }

  const [sourceRows, backlinkRows] = await Promise.all([
    db
      .select(columns)
      .from(documentLinks)
      .innerJoin(documents, eq(documents.id, documentLinks.toId))
      .where(and(eq(documentLinks.fromId, documentId), isNull(documents.deletedAt))),
    db
      .select(columns)
      .from(documentLinks)
      .innerJoin(documents, eq(documents.id, documentLinks.fromId))
      .where(and(eq(documentLinks.toId, documentId), isNull(documents.deletedAt))),
  ])

  return { sources: toLinks(sourceRows), backlinks: toLinks(backlinkRows) }
}

/**
 * kind 在数据库里是 text，与文档主表的处理方式一致：在这一层收敛成契约类型，
 * 而不是让每个调用方各自断言。提到模块作用域是因为它不捕获任何外部变量。
 */
function toLinks(rows: { id: string; title: string; kind: string }[]): DocumentLink[] {
  return rows
    .map((row) => ({ id: row.id, title: row.title, kind: row.kind as DocumentKind }))
    .toSorted((a, b) => a.title.localeCompare(b.title, 'zh'))
}

/**
 * 批量取反链数量。
 *
 * 列表页不需要标题，只需要「有几条指向它」这个数字；
 * 为每一行都跑一次 getDocumentLinks 是 N+1。
 */
export async function countBacklinks(documentIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (documentIds.length === 0) return result

  const rows = await db
    .select({ toId: documentLinks.toId })
    .from(documentLinks)
    .where(inArray(documentLinks.toId, documentIds))

  for (const row of rows) {
    result.set(row.toId, (result.get(row.toId) ?? 0) + 1)
  }
  return result
}
