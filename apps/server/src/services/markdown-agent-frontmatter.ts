import matter from 'gray-matter'
import { getDocument, updateNote } from './documents.js'
import { noteUpdateSchema, type NoteUpdate } from '@mimir/shared'
import { extraNoteFrontmatter, readNoteFrontmatter } from '../lib/vault.js'

const reserved = new Set(['id', 'createdAt', 'updatedAt', '__proto__', 'constructor', 'prototype'])
export class MarkdownFrontmatterConflictError extends Error {}

function formatFrontmatter(
  doc: { title: string; tags: string[]; status: string; folder: string | null },
  extra: Record<string, unknown>,
): string {
  const data = {
    title: doc.title,
    tags: doc.tags,
    status: doc.status,
    ...(doc.folder ? { folder: doc.folder } : {}),
    ...extraNoteFrontmatter(extra),
  }
  return matter
    .stringify('', data)
    .slice(4)
    .replace(/\n---\n\n$/, '')
}

/** Expose indexed metadata and user-defined vault YAML in one editable document. */
export async function readMarkdownFrontmatter(documentId: string): Promise<string> {
  const doc = await getDocument(documentId)
  if (!doc || doc.kind !== 'note') throw new Error('当前文档不是可编辑的笔记')
  const extra = doc.path ? await readNoteFrontmatter(doc.path) : {}
  return formatFrontmatter(doc, extra)
}

/** Validate the complete YAML document before calling the existing file-first note update path. */
export async function updateMarkdownFrontmatter(
  documentId: string,
  yaml: string,
  expectedYaml: string,
) {
  const doc = await getDocument(documentId)
  if (!doc || doc.kind !== 'note') throw new Error('当前文档不是可编辑的笔记')
  const parsed = matter(`---\n${yaml}\n---\n`).data as Record<string, unknown>
  for (const key of Object.keys(parsed)) {
    if (reserved.has(key)) throw new Error(`frontmatter 字段 ${key} 由 Mimir 管理，不能编辑`)
  }
  const extra = extraNoteFrontmatter(parsed)
  const patch: NoteUpdate = {}
  if ('title' in parsed) {
    if (typeof parsed.title !== 'string' || !parsed.title.trim() || parsed.title.length > 200)
      throw new Error('title 必须是 1–200 字符的文字')
    patch.title = parsed.title
  }
  if ('tags' in parsed) {
    if (
      !Array.isArray(parsed.tags) ||
      parsed.tags.length > 20 ||
      parsed.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 50)
    )
      throw new Error('tags 必须是最多 20 个非空文字标签')
    patch.tags = parsed.tags as string[]
  }
  if ('status' in parsed) {
    if (parsed.status !== 'ready' && parsed.status !== 'failed') throw new Error('status 无效')
    patch.status = parsed.status
  }
  if ('folder' in parsed) {
    if (parsed.folder !== null && (typeof parsed.folder !== 'string' || parsed.folder.length > 200))
      throw new Error('folder 必须是文字路径')
    patch.folder = parsed.folder === null ? '' : parsed.folder
  }
  const checked = noteUpdateSchema.safeParse(patch)
  if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? 'frontmatter 无效')
  const updated = await updateNote(documentId, checked.data, {
    extraFrontmatter: extra,
    precondition: async () => {
      if ((await readMarkdownFrontmatter(documentId)) !== expectedYaml)
        throw new MarkdownFrontmatterConflictError('笔记属性已被修改，请重新打开属性面板后再保存')
    },
  })
  if (!updated) throw new Error('笔记已不存在')
  return { ...updated, yaml: formatFrontmatter(updated, extra) }
}
