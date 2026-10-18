import { documentInRetrievalScope, type RetrievalScope } from '@mimir/shared'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { HttpError } from '../lib/http.js'
import matter from 'gray-matter'
import { toStorageKey } from '../lib/vault.js'
import { activeStorage } from '../plugins/host.js'
import { readUploadSnapshot } from '../lib/document-publication.js'
import { extractText } from '../services/extract.js'

/** Check only selected sources. This never writes files, rebuilds indexes, or calls models. */
export async function requireFreshSources(
  ids: readonly string[],
  scope?: RetrievalScope,
): Promise<Map<string, { body: string; offset: number; indexedBody: string }>> {
  const snapshots = new Map<string, { body: string; offset: number; indexedBody: string }>()
  for (const id of new Set(ids)) {
    const [row] = await db.select().from(documents).where(eq(documents.id, id))
    if (!row || row.deletedAt) throw new HttpError(409, 'SOURCE_CHANGED', '资料已删除，请重新检索')
    if (!documentInRetrievalScope(row, scope))
      throw new HttpError(409, 'SCOPE_CHANGED', '资料范围已变化，请重新检索')
    if (row.kind === 'note') {
      const raw = row.path
        ? await activeStorage()
            .read(toStorageKey(row.path))
            .catch(() => null)
        : null
      const parsed = raw ? matter(Buffer.from(raw).toString('utf8')) : null
      const source = parsed?.content
      const folder =
        typeof parsed?.data.folder === 'string' && parsed.data.folder.trim()
          ? parsed.data.folder.trim()
          : null
      // Older writers wrapped trimmed Markdown with a newline on each side. Accept
      // that representation only, and translate offsets into the actual source.
      if (
        source === undefined ||
        source.trim() !== row.body.trim() ||
        parsed?.data.title !== row.title ||
        folder !== row.folder
      )
        throw new HttpError(
          409,
          'SOURCE_CHANGED',
          '笔记源文件已变化或不可读取，请先同步索引再检索',
          { documentId: id },
        )
      const trimmed = row.body.trim()
      const offset =
        source === row.body || !trimmed ? 0 : source.indexOf(trimmed) - row.body.indexOf(trimmed)
      snapshots.set(id, { body: source, offset, indexedBody: row.body })
    } else if (row.kind === 'file') {
      const snapshot = await readUploadSnapshot(id)
      if (
        !snapshot ||
        snapshot.identity.key !== row.sourceKey ||
        snapshot.data.byteLength !== row.size
      )
        throw new HttpError(409, 'SOURCE_CHANGED', '文件原件已变化或不可读取，请先同步索引再检索', {
          documentId: id,
        })
      // Existing indexes do not persist an original-byte hash. Compare derived plaintext
      // against the current original, rather than trusting an unchanged key or length.
      const extracted = await extractText(snapshot.meta.filename, snapshot.meta.mime, snapshot.data)
      if (extracted.markdown !== row.body || extracted.error !== row.parseError)
        throw new HttpError(409, 'SOURCE_CHANGED', '文件正文与索引不一致，请先同步索引再检索', {
          documentId: id,
        })
      snapshots.set(id, { body: row.body, offset: 0, indexedBody: row.body })
    } else snapshots.set(id, { body: row.body, offset: 0, indexedBody: row.body })
  }
  return snapshots
}
