import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { extensionOf } from '@mimir/shared'
import type {
  DocumentCounts,
  DocumentDetail,
  DocumentListQuery,
  DocumentSummary,
  NoteCreate,
  NoteLookupItem,
  NoteUpdate,
} from '@mimir/shared'
import { publishFileReplacement } from '../db/document-index.js'
import {
  readUploadSnapshot,
  sameUpload,
  uploadIdentity,
  withDocumentPublication,
} from '../lib/document-publication.js'
import { db } from '../db/client.js'
import { documentTags, documents, tags } from '../db/schema.js'
import { toSearchText } from '@mimir/tokenizer'
import { contentHash, toExcerpt } from '../lib/text.js'
import {
  buildNotePath,
  moveNote,
  readNote,
  readNoteFrontmatter,
  trashNote,
  writeNote,
  type VaultNote,
} from '../lib/vault.js'
import { readUploadMeta, removeUpload, writeUploadMeta } from '../lib/uploads.js'
import { ensureFolders, normalizeFolder } from './folders.js'
import { getDocumentLinks, syncDocumentLinks } from './links.js'
import { extractText } from './extract.js'
import { rebuildChunksAndEmbed } from './chunks.js'

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
    // 格式与大小只在文件类上有值（见 shared/documents.ts 的「格式是属性」）
    mime: row.mime,
    fileExtension: row.kind === 'file' ? extensionOf(row.sourceKey ?? '') || null : null,
    size: row.size,
    folder: row.folder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 取出若干文档的标签，避免 N+1 查询。
 *
 * 导出给 `services/upload.ts`：上传件写库后要把标签一起返回给前端，
 * 而在那边重写一份查询会让「标签怎么读」出现两处实现。
 */
export async function loadTags(documentIds: string[]): Promise<Map<string, string[]>> {
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

  // 建到指定目录（知识库页的「直接编辑」会带）：先补注册表行（mkdir -p），
  // 再把指派写进 frontmatter 与数据库——与 updateNote 的指派路径同一条规则
  const folder = input.folder ? normalizeFolder(input.folder) || null : null
  await ensureFolders(folder)

  const note: VaultNote = {
    id,
    title: input.title,
    tags: input.tags,
    body: input.body,
    status: 'ready',
    // 目录由创建参数决定；不带参数时未指派，之后可在详情的「⋯」菜单里指定
    folder,
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
      status: 'ready',
      title: note.title,
      body: note.body,
      path,
      folder,
      ...index,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!row) throw new Error('创建笔记失败：数据库未返回记录')

  await syncTags(id, input.tags)
  // 新建的笔记正文里也可能有站内链接——「存成笔记」保留引用来源走的就是这条路。
  // 漏掉这一步的后果是：笔记正文里写着的链接不产生反链，
  // 对方文档底部的「被引用」里看不到它
  await syncDocumentLinks(id, note.body)
  await rebuildChunksAndEmbed(id, note.body)

  return {
    ...toSummary(row, [...input.tags].toSorted()),
    body: row.body,
    sourceKey: row.sourceKey,
    parseError: row.parseError,
    links: await getDocumentLinks(id),
  }
}

const noteUpdateLocks = new Map<string, Promise<void>>()

/** An editor/save conflict with a useful message at the API boundary. */
export class DocumentUpdateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentUpdateError'
  }
}

/** Serialize writes to one note through the vault and database update together. */
export async function updateNote(
  id: string,
  input: NoteUpdate,
  options?: { precondition?: () => Promise<void>; extraFrontmatter?: Record<string, unknown> },
): Promise<DocumentDetail | null> {
  const previous = noteUpdateLocks.get(id) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  noteUpdateLocks.set(id, current)
  await previous
  try {
    const doc = await withDocumentPublication(id, async () => {
      await options?.precondition?.()
      return updateNoteUnlocked(id, input, options?.extraFrontmatter)
    })
    if (doc) await rebuildChunksAndEmbed(id, doc.body)
    return doc
  } finally {
    release()
    if (noteUpdateLocks.get(id) === current) noteUpdateLocks.delete(id)
  }
}

async function updateNoteUnlocked(
  id: string,
  input: NoteUpdate,
  extraOverride?: Record<string, unknown>,
): Promise<DocumentDetail | null> {
  const existing = await getDocumentRow(id)
  if (!existing) return null
  const snapshot = existing.kind === 'file' ? await readUploadSnapshot(id) : null
  const source = snapshot?.identity ?? null
  if (source && source.key !== existing.sourceKey)
    throw new DocumentUpdateError('原件已变化，请重新读取后再修改')
  if (source?.compound && input.body !== undefined)
    throw new DocumentUpdateError('加密文件的正文不能直接修改，请在编辑器中本地解锁后保存原件')
  const compound =
    snapshot && source?.compound
      ? await extractText(
          'encrypted.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          snapshot.data,
        )
      : null
  const extraFrontmatter =
    existing.kind === 'note' && existing.path
      ? (extraOverride ?? (await readNoteFrontmatter(existing.path)))
      : undefined

  const title = input.title ?? existing.title
  const body = compound ? '' : (input.body ?? existing.body)
  const status = input.status ?? existing.status
  const tagNames = input.tags ?? [...((await loadTags([id])).get(id) ?? [])]
  // folder 用 `=== undefined` 判断而不是 `??`：空串是合法值（移出目录），
  // 用 ?? 会把「移出目录」当成「不修改」
  const folder =
    input.folder === undefined ? existing.folder : normalizeFolder(input.folder) || null

  // 指派到新目录时先补建注册表行（mkdir -p）：folders 表是树结构的唯一真相（D-068），
  // 漏了这一步，文档指派存在而树上看不到这个目录
  await ensureFolders(folder)

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
      folder,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: now.toISOString(),
      path,
      ...(extraFrontmatter ? { extraFrontmatter } : {}),
    })
  }

  /**
   * 上传件的元数据写回 `meta.json`。
   *
   * **这一条是「文件是真相」对上传件的落点。** 笔记的标签与目录存在
   * frontmatter 里（上面的 `writeNote`），上传件没有 vault 文件——它的
   * 对应物就是 `meta.json`。不写回的话，整理出来的标签与目录只活在数据库里，
   * 而重建索引会从 meta.json 读回**旧的**元数据：用户加的标签静默消失。
   *
   * 正文**不写进 meta.json**：它是派生数据（由原件重新提取），
   * 而 meta.json 只记「只能来自用户」的那些信息。
   */
  if (existing.kind === 'file' && source && !sameUpload(source, await uploadIdentity(id)))
    throw new DocumentUpdateError('原件已变化，请重新读取后再修改')
  if (existing.kind === 'file' && existing.sourceKey) {
    const meta = await readUploadMeta(id)
    if (meta) {
      await writeUploadMeta(id, {
        ...meta,
        title,
        tags: tagNames,
        folder,
        status,
        updatedAt: now.toISOString(),
      }).catch((error: unknown) => {
        // 写失败不阻止这次的修改：数据库已经更新，而重建索引时
        // 会以 meta.json 为准——所以这里必须留下日志（否则会静默回退）
        console.warn(`写回 meta.json 失败（${id}），重建索引后可能丢失这次改动：`, error)
      })
    } else {
      /**
       * 记录有原件、却读不到 meta.json。
       *
       * **这一条不能静默**：它就是「整理结果只活在数据库里」的状态——
       * 重建索引时标签与目录会回到旧值，而用户完全看不出发生了什么。
       * 两种起因都值得知道：`meta.json` 被手工删了，或者存储后端读不到。
       */
      console.warn(
        `读不到 uploads/${id}/meta.json，本次改动（标签/目录/标题）只写进了数据库。` +
          '重建索引会以 meta.json 为准，那些改动可能丢失。',
      )
    }
  }

  const values = {
    title,
    body,
    status,
    path,
    folder,
    ...buildIndexFields(title, body),
    updatedAt: now,
    ...(compound ? { parseError: compound.error } : {}),
  }
  const row =
    existing.kind === 'file'
      ? await publishFileReplacement(id, existing, values, body === '' || body !== existing.body)
      : (await db.update(documents).set(values).where(eq(documents.id, id)).returning())[0]

  if (!row) return null

  await syncTags(id, tagNames)
  // 正文变了，出链跟着重建。放在数据库写入之后：链接表是索引，
  // 而正文是真相——先写完真相再更新索引，顺序与全局规则一致
  await syncDocumentLinks(id, body)

  return {
    ...toSummary(row, [...tagNames].toSorted()),
    body: row.body,
    sourceKey: row.sourceKey,
    parseError: row.parseError,
    links: await getDocumentLinks(id),
  }
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
  return {
    ...toSummary(row, tagNames),
    body,
    sourceKey: row.sourceKey,
    parseError: row.parseError,
    links: await getDocumentLinks(id),
  }
}

export async function listDocuments(query: DocumentListQuery): Promise<DocumentSummary[]> {
  const conditions = [isNull(documents.deletedAt)]
  if (query.kind) conditions.push(eq(documents.kind, query.kind))
  // 多选 kind（「收集的资料」这个视图用它）。与 `kind` 同时给出时两个条件都生效，
  // 但界面只会给一个——两个都传是调用方的错，让它安静地 AND 起来即可
  if (query.kinds && query.kinds.length > 0) {
    conditions.push(inArray(documents.kind, [...query.kinds]))
  }
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
  if (query.folder !== undefined && query.folder !== '') {
    const folder = normalizeFolder(query.folder)
    // 含子目录：选中「技术」要能看见「技术/前端/React」下的东西，
    // 否则用户得把每个子目录都点一遍才能翻完
    conditions.push(
      sql`(${documents.folder} = ${folder} or ${documents.folder} like ${`${folder}/%`})`,
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

/** 站内链接的标题补全。服务端限定数量并排除回收站，避免遍历所有文档。 */
export async function findNotes(query: string): Promise<NoteLookupItem[]> {
  const conditions = [eq(documents.kind, 'note'), isNull(documents.deletedAt)]
  if (query) {
    const escaped = query.replace(/[\\%_]/g, '\\$&')
    conditions.push(sql`lower(${documents.title}) like lower(${`%${escaped}%`}) escape ${'\\'}`)
  }

  return db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(20)
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

  // 上传件没有 vault 文件，它的真相在 `uploads/<id>/`。**先库后文件**：
  // 与头像删除同一条规则（「永远不要让指针存在的时候指向一个不存在的东西」）——
  // 记录先消失，剩下一个孤儿目录无害；反过来是一段时间里「库里有、点开是 404」
  await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, id))

  if (row.kind === 'file' && row.sourceKey) {
    await removeUpload(id).catch((error: unknown) => {
      console.warn(`删除原件目录失败（记录已删）：uploads/${id}`, error)
    })
  }

  return true
}

export async function listAllTags(): Promise<{ name: string; count: number }[]> {
  const rows = await db
    .select({
      name: tags.name,
      count: count(documentTags.documentId),
    })
    .from(tags)
    .leftJoin(documentTags, eq(documentTags.tagId, tags.id))
    .groupBy(tags.name)
    .orderBy(desc(sql`count(${documentTags.documentId})`), tags.name)

  return rows.map((row) => ({ name: row.name, count: Number(row.count) }))
}

/**
 * 各视图的文档数，供左导航显示。
 *
 * 单独一次聚合查询，而不是让前端拉全量列表自己算：
 * 导航里的计数必须**准确且便宜**——为它拉 500 条文档摘要只为了 count，
 * 在知识库长大之后会成为每次页面切换的开销。
 */
export async function countDocuments(): Promise<DocumentCounts> {
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(isNull(documents.deletedAt))

  // 导航上的每个数字都必须与点进去看到的条数一致（`documentCountsSchema`
  // 的承诺）。来源计数（D-047）、收件箱计数（D-054）与归档计数（D-065）
  // 都已退役，只剩全集
  return { all: rows.length }
}
