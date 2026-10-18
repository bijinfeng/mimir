import { sql } from 'drizzle-orm'
import type { RetrievalScope } from '@mimir/shared'

/** All callers join documents as d; interpolate only values, never user SQL. */
export function scopePredicate(scope?: RetrievalScope) {
  if (!scope || scope.type === 'all') return sql`1 = 1`
  if (scope.type === 'document') return sql`d.id = ${scope.documentId}`
  const prefix = `${scope.path.replace(/[\\%_]/g, '\\$&')}/%`
  return sql`(d.folder = ${scope.path} or d.folder like ${prefix} escape '\\')`
}
