import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { toSearchText } from '@mimir/tokenizer'
import { contentHash, toExcerpt } from '../lib/text.js'
import { readNote, toVaultPath, writeNote, VAULT_PREFIX } from '../lib/vault.js'
import { documentIdFromKey, readUpload, readUploadMeta, UPLOAD_PREFIX } from '../lib/uploads.js'
import { activeStorage } from '../plugins/host.js'
import { syncTags } from './documents.js'
import { syncDocumentLinks } from './links.js'
import { extractText } from './extract.js'

/**
 * 重建索引：扫描 `vault/` 与 `uploads/`，把文件状态同步进数据库。
 *
 * 这是「文件是真相」这条规则的另一半。有了它，下面这些操作都变得安全：
 *   - 改分块策略 / 换 embedding 模型后全量重跑
 *   - 直接用 Obsidian 批量改文件名
 *   - 删掉数据库、从文件重建
 *
 * 反向也成立：数据库里标为 note 或 file、但文件已不存在的记录会被标记删除。
 * 抓取来的资料（web / wechat / github）没有对应文件，不参与这条清理。
 *
 * ## 上传件为什么能参与重建（抓取件不能）
 *
 * 抓取件没有用户可见的文件——正文只在数据库里，`raw/` 快照是派生物。
 * 上传件的真相是 `uploads/<id>/<原名>`，而 `meta.json` 记着标题、标签、
 * 目录与时间。所以**上传件是重建能力最强的一类**：目录还在，删库也能恢复；
 * 正文能重新提取就重新提取，不能就留空（那时 `parse_error` 或
 * `parseSupport()` 会说明原因）。
 */

export interface ReindexResult {
  scanned: number
  created: number
  updated: number
  removed: number
  /**
   * 同一个 `id` 出现在多个路径下的文件数。
   *
   * **这是 S3 后端特有的失败模式的可观测面。** 那边改名是「复制 + 删除」
   * 两步而非原子的 `rename(2)`（`docs/RESEARCH.md` §10.3a），
   * 复制成功、删除失败就会留下两个同 id 的文件。没有这个计数的话，
   * 表现是「upsert 时互相覆盖」，而哪一份胜出取决于扫描顺序——
   * 一个不报错的静默错误。
   */
  duplicates: number
  /**
   * `uploads/` 下缺 `meta.json` 的目录数。
   *
   * 这类目录无法恢复成文档（缺标题、标签、时间）。**把它计数报出来**
   * 而不是静默跳过：用户手工往 `uploads/` 里丢过文件、或者某次上传
   * 在写 meta 之前中断过，都会产生它——那值得知道，而不是让文件静静地待着。
   */
  orphanUploads: number
}

/**
 * vault 下所有 Markdown 的存储 key。
 *
 * 遍历交给 `StorageBackend.list`——它已经处理了对象存储最难的那部分
 * （翻页，见 plugins/storage/src/s3.ts）。这里只做**策略**判断：
 * 跳过隐藏项（`.trash` 是回收站，不参与索引）。
 *
 * 跳过逻辑按**路径段**判断而不是只看开头：key 是 `vault/...`，
 * 而回收站在 `vault/.trash/...`——只看开头会把整个 vault 都漏掉。
 */
async function listVaultNotes(): Promise<string[]> {
  const all = await activeStorage().list(VAULT_PREFIX)

  return all.filter((key) => {
    const relative = toVaultPath(key)
    // 逐段判断：「任何一层以 . 开头」都算隐藏，与改动前 readdir 里的
    // `entry.name.startsWith('.')` 语义一致
    return relative.split('/').every((segment) => !segment.startsWith('.')) && key.endsWith('.md')
  })
}

/**
 * `uploads/` 下可恢复的文档：每个 id 带它的原件 key（可能为 null）。
 *
 * 以 `meta.json` 为判据而不是「目录里有文件」：一份原件写到一半失败、
 * 或者用户手工往里丢了个文件，都不该被当成一条可恢复的文档——
 * meta 里才有标题、标签、目录、时间这些**只能来自用户**的信息。
 *
 * **有 meta 但没有原件时仍然要返回这条**（`originalKey: null`）：
 * 记录本身有价值——「有这么一份文件，但原件不见了」比「什么都没有」有用，
 * 用户看到它才知道要找回来。原件的缺失由 `source_key` 为 null 如实表达。
 *
 * 缺 meta 的目录既不能恢复也不该静默消失，所以单独计数（`orphanUploads`）。
 *
 * **只扫一次**：原件 key 从这一次 `list` 的结果里分出来，不再按目录逐个
 * 重新列举。对象存储的 LIST 是按请求计费的（`docs/TECH.md` §8.5），
 * 一个文件一次 LIST 的写法在 500 篇的库上就是 500 次请求。
 */
async function listUploads(): Promise<{
  entries: { id: string; originalKey: string | null }[]
  orphans: number
}> {
  const keys = await activeStorage().list(UPLOAD_PREFIX)

  const originals = new Map<string, string>()
  const withMeta = new Set<string>()
  const seen = new Set<string>()

  for (const key of keys) {
    const id = documentIdFromKey(key)
    if (!id) continue
    seen.add(id)
    if (key.endsWith('/meta.json')) withMeta.add(id)
    else originals.set(id, key)
  }

  let orphans = 0
  const entries: { id: string; originalKey: string | null }[] = []

  for (const id of seen) {
    if (!withMeta.has(id)) {
      orphans += 1
      console.warn(`uploads/${id} 里没有 meta.json，跳过（不是一条可恢复的文档）`)
      continue
    }
    entries.push({ id, originalKey: originals.get(id) ?? null })
  }

  return { entries, orphans }
}

export async function reindexVault(): Promise<ReindexResult> {
  const keys = await listVaultNotes()
  const uploads = await listUploads()

  // 先取现有 note / file 的 id 集合，用来区分「新建」和「更新」，
  // 比事后猜测 returning 的值可靠
  const existing = await db
    .select({ id: documents.id, kind: documents.kind })
    .from(documents)
    .where(and(isNull(documents.deletedAt), inArray(documents.kind, ['note', 'file'])))
  const existingIds = new Set(existing.map((row) => row.id))

  const result: ReindexResult = {
    scanned: keys.length + uploads.entries.length,
    created: 0,
    updated: 0,
    removed: 0,
    duplicates: 0,
    orphanUploads: uploads.orphans,
  }
  const seenIds = new Set<string>()

  for (const key of keys) {
    const relPath = toVaultPath(key)

    let note
    try {
      note = await readNote(relPath)
    } catch (error) {
      console.warn(`跳过无法解析的文件 ${relPath}`, error)
      continue
    }

    // 文件缺 frontmatter.id（例如从别处拷来的 md）时补一个，
    // 并写回文件，避免每次重建索引都生成新 id
    let id = note.id
    if (!id || id === relPath) {
      id = nanoid(16)
      await writeNote({ ...note, id })
    }

    /**
     * 同一个 id 已经在这次扫描里出现过了。
     *
     * 正常情况不会发生——除非 S3 后端的改名在「复制成功、删除失败」之间
     * 断掉了。**跳过而不是覆盖**：两份文件里必有一份是旧的，
     * 而按顺序覆盖会让结果取决于列出的顺序（对象存储不保证顺序）。
     * 留下警告，让用户能自己去看是哪两个文件。
     */
    if (seenIds.has(id)) {
      result.duplicates += 1
      console.warn(
        `同一个 id 出现在多个文件里，已跳过：${relPath}（id=${id}）。` +
          '若是刚从对象存储迁移过来，检查是否有改名留下的重复文件。',
      )
      continue
    }

    seenIds.add(id)

    const values = {
      id,
      kind: 'note',
      status: note.status,
      title: note.title,
      body: note.body,
      excerpt: toExcerpt(note.body),
      searchText: toSearchText(note.title, note.body),
      contentHash: contentHash(note.body),
      path: relPath,
      // 目录存在 frontmatter 里，所以重建索引必须把它一起还原——
      // 否则「数据库丢了、从文件重建」之后目录树会整棵消失
      folder: note.folder,
      updatedAt: new Date(note.updatedAt),
    }

    await db
      .insert(documents)
      .values(values)
      .onConflictDoUpdate({
        target: documents.id,
        set: { ...values, deletedAt: null },
      })

    // 标签存在文件 frontmatter 里，所以重建索引必须把它们一起还原。
    // 只 upsert documents 行而不同步 document_tags 的话，内容回来了但标签没了——
    // 这个 bug 由 vault-roundtrip.test.ts 抓到过。
    await syncTags(id, note.tags)

    // 双链同样是派生数据，也要能从正文重建。不同步的话，
    // 「删库重建」之后所有反链会指向空
    await syncDocumentLinks(id, note.body)

    if (existingIds.has(id)) {
      result.updated += 1
    } else {
      result.created += 1
    }
  }

  /**
   * 上传件：`uploads/<id>/` → 一条 `kind = 'file'` 的文档。
   *
   * 元数据以 `meta.json` 为准（标题 / 标签 / 目录 / 状态 / 时间都是用户整理
   * 出来的结果，**只能从那里恢复**）。正文则**重新提取一次**——它是派生数据，
   * 而重建索引的场景之一恰好就是「换了提取实现后重跑」。
   *
   * 提取失败不阻止恢复：原件在、记录在，只是没有正文（`parse_error` 或
   * `parseSupport()` 会说明原因）。这与上传时的那条判断一致。
   */
  for (const { id, originalKey } of uploads.entries) {
    const meta = await readUploadMeta(id)
    if (!meta) continue

    if (seenIds.has(id)) {
      result.duplicates += 1
      console.warn(`上传件 id 与某篇笔记重复，已跳过：uploads/${id}（id=${id}）`)
      continue
    }
    seenIds.add(id)

    let body = ''
    let parseError: string | null = null

    if (originalKey !== null) {
      try {
        const data = await readUpload(originalKey)
        const extracted = await extractText(meta.filename, meta.mime, data)
        body = extracted.markdown
        parseError = extracted.error
      } catch (error) {
        // 原件读不到也仍然建记录：meta.json 里那条信息本身有价值
        // （「有这么一份文件，但原件不见了」比「什么都没有」有用得多）
        console.warn(`恢复上传件 ${id} 的正文失败：`, error)
      }
    }

    const values = {
      id,
      kind: 'file',
      status: meta.status,
      title: meta.title,
      body,
      excerpt: toExcerpt(body),
      searchText: toSearchText(meta.title, body),
      contentHash: contentHash(body),
      sourceKey: originalKey,
      mime: meta.mime,
      size: meta.size,
      parseError,
      // 目录存在 meta.json 里，必须一起还原——否则「删库重建」之后目录树整棵消失
      folder: meta.folder,
      createdAt: new Date(meta.createdAt),
      updatedAt: new Date(meta.updatedAt),
    }

    await db
      .insert(documents)
      .values(values)
      .onConflictDoUpdate({ target: documents.id, set: { ...values, deletedAt: null } })

    // 标签只在 meta.json 里（上传件没有 vault 文件）
    await syncTags(id, meta.tags)
    await syncDocumentLinks(id, body)

    if (existingIds.has(id)) {
      result.updated += 1
    } else {
      result.created += 1
    }
  }

  // 文件已消失的 note **与上传件**标记删除。seenIds 为空时 SQL 的 not in () 不合法，
  // 这种情况下把两类全部标记删除。
  //
  // 注意：抓取来的资料（web / wechat / github）**不参与**这条清理——
  // 它们本来就没有用户可见的文件，把「没有文件」当成「已删除」会把库清空
  const staleWhere =
    seenIds.size === 0
      ? and(inArray(documents.kind, ['note', 'file']), isNull(documents.deletedAt))
      : and(
          inArray(documents.kind, ['note', 'file']),
          isNull(documents.deletedAt),
          notInArray(documents.id, [...seenIds]),
        )

  const stale = await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(staleWhere)
    .returning({ id: documents.id })

  result.removed = stale.length
  return result
}

/** 仅统计，不落库。用于界面显示「有多少文件尚未入库」 */
export async function countOrphanFiles(): Promise<number> {
  const keys = await listVaultNotes()
  const paths = keys.map((key) => toVaultPath(key))
  if (paths.length === 0) return 0

  const known = await db
    .select({ path: documents.path })
    .from(documents)
    .where(and(eq(documents.kind, 'note'), inArray(documents.path, paths)))

  return paths.length - known.length
}
