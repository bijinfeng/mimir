import { createHash } from 'node:crypto'
import { activeStorage } from '../plugins/host.js'
import { metaKey, uploadMetaSchema, uploadKey, type UploadMeta } from './uploads.js'

export const ENCRYPTED_OFFICE_INDEX_MESSAGE =
  '此文件使用 Office 打开密码加密；原件已保留，正文不进入知识库索引'

// All in-process source/index publishers share this queue. Provider work stays outside it.
const publications = new Map<string, Promise<void>>()
export async function withDocumentPublication<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = publications.get(id) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  publications.set(id, queued)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (publications.get(id) === queued) publications.delete(id)
  }
}

export const bytesIdentity = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export interface UploadIdentity {
  meta: string
  key: string
  source: string
  compound: boolean
}
export interface UploadSnapshot {
  identity: UploadIdentity
  data: Uint8Array
  meta: UploadMeta
}
/** The parser and its source identity must use the very same read, including same-key changes. */
export async function readUploadSnapshot(id: string): Promise<UploadSnapshot | null> {
  const storage = activeStorage()
  const readMeta = await storage.read(metaKey(id)).catch(() => null)
  if (!readMeta) return null
  const raw = new Uint8Array(readMeta)
  let meta
  try {
    meta = uploadMetaSchema.parse(JSON.parse(new TextDecoder().decode(raw)))
  } catch {
    return null
  }
  const key = meta.sourceKey ?? uploadKey(id, meta.filename)
  if (!key.startsWith(`uploads/${id}/`)) return null
  const read = await storage.read(key).catch(() => null)
  if (!read) return null
  // Own the bytes: a storage implementation may reuse its returned backing buffer.
  const data = new Uint8Array(read)
  return {
    data,
    meta,
    identity: {
      meta: bytesIdentity(raw),
      key,
      source: bytesIdentity(data),
      compound: isCompound(data),
    },
  }
}
/** Actual storage identity, including same-key external changes; DB sourceKey alone is insufficient. */
export async function uploadIdentity(id: string): Promise<UploadIdentity | null> {
  return (await readUploadSnapshot(id))?.identity ?? null
}
export function sameUpload(a: UploadIdentity | null, b: UploadIdentity | null): boolean {
  return a !== null && b !== null && a.meta === b.meta && a.key === b.key && a.source === b.source
}
export function isCompound(bytes: Uint8Array): boolean {
  return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => bytes[i] === v)
}
