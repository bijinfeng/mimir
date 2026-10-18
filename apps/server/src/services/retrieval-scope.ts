import { and, eq, isNull, sql } from 'drizzle-orm'
import { retrievalFolderPathSchema, retrievalScopeSchema, type RetrievalScope } from '@mimir/shared'
import { db } from '../db/client.js'
import { documents, folders } from '../db/schema.js'
import { HttpError } from '../lib/http.js'

export async function requireExistingFolder(input: string): Promise<string> {
  const parsed = retrievalFolderPathSchema.safeParse(input)
  if (!parsed.success) throw new HttpError(400, 'INVALID_SCOPE', '目录路径不合法')
  const [folder] = await db
    .select({ path: folders.path })
    .from(folders)
    .where(eq(folders.path, parsed.data))
  if (!folder) throw new HttpError(404, 'SCOPE_NOT_FOUND', '目录已删除或移动，请重新选择范围')
  return folder.path
}

export async function normalizeRetrievalScope(scope: RetrievalScope): Promise<RetrievalScope> {
  const result = retrievalScopeSchema.safeParse(scope)
  if (!result.success) throw new HttpError(400, 'INVALID_SCOPE', '检索范围不合法')
  const value = result.data
  if (value.type === 'folder')
    return { type: 'folder', path: await requireExistingFolder(value.path) }
  if (value.type === 'document') {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, value.documentId), isNull(documents.deletedAt)))
    if (!doc) throw new HttpError(404, 'SCOPE_NOT_FOUND', '文档已删除，请重新选择范围')
  }
  return value
}

/** ORM counterpart of the leg predicate, used again at materialization time. */
export function retrievalScopeCondition(scope?: RetrievalScope) {
  if (!scope || scope.type === 'all') return sql`1 = 1`
  if (scope.type === 'document') return eq(documents.id, scope.documentId)
  const prefix = `${scope.path.replace(/[\\%_]/g, '\\$&')}/%`
  return sql`(${documents.folder} = ${scope.path} or ${documents.folder} like ${prefix} escape '\\')`
}
