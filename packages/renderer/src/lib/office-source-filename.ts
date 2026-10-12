/** The source endpoint uses RFC 5987 for names that contain non-ASCII characters. */
export function officeSourceFilename(
  contentDisposition: string | null,
  sourceKey: string | null,
): string | null {
  const encoded = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition ?? '')?.[1]
  if (encoded) {
    try {
      const name = decodeURIComponent(encoded.trim())
      if (name) return name
    } catch {
      // Fall back to the plain filename or source key below.
    }
  }

  const plain = /(?:^|;)\s*filename\s*=\s*"([^"]*)"/i.exec(contentDisposition ?? '')?.[1]
  if (plain) return plain

  return sourceKey?.split('/').pop() || null
}

export function officeSourceFile(
  bytes: Uint8Array,
  target: { name: string; mime: string },
  originalFilename: string | null,
): File {
  return new File([bytes as BlobPart], originalFilename || target.name, { type: target.mime })
}
import type { EditorIo } from '@mimir/office'

/** Keep the name returned by the source endpoint across the edit and save cycle. */
export function createOfficeSourceIo(
  documentId: string,
  sourceKey: string | null,
  dependencies: {
    sourceUrl: (id: string) => string
    replaceSource: (id: string, file: File) => Promise<unknown>
    fetchSource?: typeof fetch
  },
): EditorIo {
  let originalFilename: string | null = null
  const fetchSource =
    dependencies.fetchSource ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init))
  return {
    async load() {
      const res = await fetchSource(dependencies.sourceUrl(documentId), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      originalFilename = officeSourceFilename(res.headers.get('Content-Disposition'), sourceKey)
      return new Uint8Array(await res.arrayBuffer())
    },
    async save(bytes, target) {
      await dependencies.replaceSource(
        documentId,
        officeSourceFile(bytes, target, originalFilename),
      )
    },
  }
}
