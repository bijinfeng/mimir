import { z } from 'zod'

export const retrievalFolderPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (path) =>
      !/[\p{Cc}]/u.test(path) &&
      !path.includes('\\') &&
      !path
        .split('/')
        .some((part) => !part || part === '.' || part === '..' || part !== part.trim()),
    '目录路径必须是完整的相对路径',
  )

/** Retrieval boundaries are independent of search-only versus model-answer mode. */
export const retrievalScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }).strict(),
  z.object({ type: z.literal('folder'), path: retrievalFolderPathSchema }).strict(),
  z.object({ type: z.literal('document'), documentId: z.string().trim().min(1).max(200) }).strict(),
])
export type RetrievalScope = z.infer<typeof retrievalScopeSchema>

/** Literal segment comparison; never interpret SQL wildcard characters as path syntax. */
export function documentInRetrievalScope(
  document: { id: string; folder: string | null },
  scope: RetrievalScope | undefined,
): boolean {
  if (!scope || scope.type === 'all') return true
  if (scope.type === 'document') return document.id === scope.documentId
  return document.folder === scope.path || document.folder?.startsWith(`${scope.path}/`) === true
}
