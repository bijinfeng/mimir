import { readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { env } from '../env.js'
import { toSearchText } from '../lib/segment.js'
import { contentHash, toExcerpt } from '../lib/text.js'
import { readNote, toVaultRelative, writeNote } from '../lib/vault.js'
import { syncTags } from './documents.js'

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
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const found: string[] = []

  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      // .trash 是回收站，不参与索引
      if (entry.name.startsWith('.')) continue

      const abs = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        found.push(abs)
      }
    }
  }

  await walk(dir)
  return found
}

export async function reindexVault(): Promise<ReindexResult> {
  const files = await walkMarkdown(env.vaultDir)

  // 先取现有 note 的 id 集合，用来区分「新建」和「更新」，
  // 比事后猜测 returning 的值可靠
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.kind, 'note'), isNull(documents.deletedAt)))
  const existingIds = new Set(existing.map((row) => row.id))

  const result: ReindexResult = {
    scanned: files.length,
    created: 0,
    updated: 0,
    removed: 0,
  }
  const seenIds = new Set<string>()

  for (const abs of files) {
    const relPath = toVaultRelative(abs).split(sep).join('/')

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
  const files = await walkMarkdown(env.vaultDir)
  const paths = files.map((abs) => toVaultRelative(abs).split(sep).join('/'))
  if (paths.length === 0) return 0

  const known = await db
    .select({ path: documents.path })
    .from(documents)
    .where(and(eq(documents.kind, 'note'), inArray(documents.path, paths)))

  return paths.length - known.length
}
