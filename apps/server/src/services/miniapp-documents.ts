import type { DocumentSummary, NoteUpdate } from '@mimir/shared'
import type {
  MiniappCreateNoteInput,
  MiniappDocument,
  MiniappDocumentSummary,
  MiniappUpdateInput,
} from '@mimir/shared/miniapp'
import { createNote, readDocumentVersion, updateNote } from './documents.js'
import { requireExistingFolder } from './retrieval-scope.js'
import { HttpError } from '../lib/http.js'

export function miniappSummary(document: DocumentSummary): MiniappDocumentSummary {
  const { path: _path, ...summary } = document
  return summary
}
export async function getMiniappDocument(id: string): Promise<MiniappDocument | null> {
  const version = await readDocumentVersion(id)
  if (!version) return null
  const { path: _path, sourceKey, ...document } = version.document
  return {
    ...document,
    revision: version.revision,
    indexState: version.indexState,
    canEditBody: document.kind === 'note',
    hasOriginal: document.kind === 'file' && sourceKey !== null,
  }
}
export async function createMiniappNote(input: MiniappCreateNoteInput): Promise<MiniappDocument> {
  const folder = await requireExistingFolder(input.folder)
  const created = await createNote(
    { title: input.title, body: input.body, tags: input.tags ?? [], folder },
    { preserveSource: true },
  )
  return (await getMiniappDocument(created.id))!
}
export async function updateMiniappDocument(
  id: string,
  input: MiniappUpdateInput,
): Promise<MiniappDocument> {
  const fields: NoteUpdate = {}
  if (input.title !== undefined) fields.title = input.title
  if (input.body !== undefined) fields.body = input.body
  if (input.tags !== undefined) fields.tags = input.tags
  if (input.folder !== undefined) fields.folder = await requireExistingFolder(input.folder)
  const updated = await updateNote(id, fields, {
    expectedRevision: input.expectedRevision,
    preserveSource: true,
    requireDurableMetadata: true,
  })
  if (!updated) throw new HttpError(404, 'NOT_FOUND', '文档不存在')
  return (await getMiniappDocument(id))!
}
export async function appendMiniappDocument(
  id: string,
  expectedRevision: string,
  text: string,
): Promise<MiniappDocument> {
  const updated = await updateNote(
    id,
    {},
    { expectedRevision, appendText: text, preserveSource: true, requireDurableMetadata: true },
  )
  if (!updated) throw new HttpError(404, 'NOT_FOUND', '文档不存在')
  return (await getMiniappDocument(id))!
}
