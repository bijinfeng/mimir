import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { toSearchText } from '@mimir/tokenizer'
import { contentHash, toExcerpt } from '../lib/text.js'
import { readNote, toVaultPath, writeNote, VAULT_PREFIX } from '../lib/vault.js'
import { activeStorage } from '../plugins/host.js'
import { syncTags } from './documents.js'
import { syncDocumentLinks } from './links.js'

/**
 * 重建索引：扫描 vault 下的所有 Markdown，把文件状态同步进数据库。
 *
 * 这是「文件是真相」这条规则的另一半。有了它，下面这些操作都变得安全：
 *   - 改分块策略 / 换 embedding 模型后全量重跑
 *   - 直接用 Obsidian 批量改文件名
 *   - 删掉数据库、从文件重建
 *
 * 反向也成立：数据库里标为 note、但文件已不存在的记录会被标记删除。
 * 抓取来的资料（kind != note）没有对应文件，不参与这条清理。
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

export async function reindexVault(): Promise<ReindexResult> {
  const keys = await listVaultNotes()

  // 先取现有 note 的 id 集合，用来区分「新建」和「更新」，
  // 比事后猜测 returning 的值可靠
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.kind, 'note'), isNull(documents.deletedAt)))
  const existingIds = new Set(existing.map((row) => row.id))

  const result: ReindexResult = {
    scanned: keys.length,
    created: 0,
    updated: 0,
    removed: 0,
    duplicates: 0,
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

  // 文件已消失的 note 标记删除。seenIds 为空时 SQL 的 not in () 不合法，
  // 这种情况下全部标记删除。
  const staleWhere =
    seenIds.size === 0
      ? and(eq(documents.kind, 'note'), isNull(documents.deletedAt))
      : and(
          eq(documents.kind, 'note'),
          isNull(documents.deletedAt),
          notInArray(documents.id, [...seenIds]),
        )

  const stale = await db
    .update(documents)
    .set({ deletedAt: sql`now()` })
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
