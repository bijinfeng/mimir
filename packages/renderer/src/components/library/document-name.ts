import type { DocumentSummary } from '@mimir/shared'

/** 标题是用户可改的；只在展示时补当前原件的扩展名，避免改名后重复拼接。 */
export function displayDocumentTitle(doc: DocumentSummary): string {
  if (doc.kind !== 'file' || !doc.fileExtension) return doc.title
  const suffix = `.${doc.fileExtension}`
  return doc.title.toLowerCase().endsWith(suffix.toLowerCase())
    ? doc.title
    : `${doc.title}${suffix}`
}
