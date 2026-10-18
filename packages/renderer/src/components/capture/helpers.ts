import { detectSource } from '@mimir/shared'
import { ApiRequestError } from '../../lib/api'

export function validCaptureSource(url: string) {
  const value = url.trim()
  if (!value || value.length > 2000 || !/^https?:\/\//i.test(value)) return null
  try {
    const parsed = new URL(value)
    if (!parsed.hostname) return null
    return detectSource(value)
  } catch {
    return null
  }
}

/** No response can mean the write succeeded. HTTP validation failures are definitive. */
export function uncertainResult(error: unknown) {
  return !(error instanceof ApiRequestError) || error.status >= 500 || error.status === 408
}
export function targetFolderFor(file: File, folder?: string | null) {
  const relative = file.webkitRelativePath ?? ''
  const dir = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : ''
  return dir ? (folder ? `${folder}/${dir}` : dir) : (folder ?? undefined)
}
