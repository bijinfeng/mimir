import {
  DOCX_ENCRYPTION_DEADLINE_MS,
  DOCX_ENCRYPTION_MAX_BYTES,
  DOCX_ENCRYPTION_MAX_CONTAINER_BYTES,
  DocxEncryptionError,
  validateEncryptionPassword,
  type DocxEncryptionFailure,
  type DocxEncryptionRequest,
  type DocxEncryptionResponse,
  type DocxEncryptionResult,
} from './docx-encryption-types.js'
export { DocxEncryptionError } from './docx-encryption-types.js'
export type { DocxEncryptionFormat, DocxEncryptionResult } from './docx-encryption-types.js'
const ERROR_CODES = new Set<DocxEncryptionFailure>([
  'wrong-password',
  'damaged',
  'unsupported',
  'budget',
  'unavailable',
  'timeout',
])
const cancelled = () => new DOMException('已取消本地加密处理', 'AbortError')
/** Private per-editor controller. No document state, secrets, persistence, or publication callbacks. */
export class DocxEncryptionController {
  private requestId = 0
  private epoch = 0
  private disposed = false
  private pending: { cancel(): void } | null = null
  constructor(private source: object) {}
  /** Always invalidates in-flight work, including A→B→A and re-opening the same source object. */
  bindSource(source: object): void {
    this.epoch++
    this.source = source
    this.cancel()
  }
  cancel(): void {
    this.requestId++
    this.pending?.cancel()
  }
  dispose(): void {
    this.disposed = true
    this.epoch++
    this.cancel()
  }
  decrypt(
    bytes: Uint8Array,
    password: string,
    signal: AbortSignal,
    expectedSource: object,
  ): Promise<DocxEncryptionResult> {
    return this.run('decrypt', bytes, password, signal, expectedSource)
  }
  encrypt(
    bytes: Uint8Array,
    password: string,
    signal: AbortSignal,
    expectedSource: object,
  ): Promise<DocxEncryptionResult> {
    return this.run('encrypt', bytes, password, signal, expectedSource)
  }
  private async run(
    operation: 'encrypt' | 'decrypt',
    bytes: Uint8Array,
    password: string,
    signal: AbortSignal,
    expectedSource: object,
  ): Promise<DocxEncryptionResult> {
    if (this.disposed || this.source !== expectedSource) throw cancelled()
    this.cancel()
    const id = this.requestId,
      epoch = this.epoch
    signal.throwIfAborted()
    validateEncryptionPassword(password)
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length >
        (operation === 'encrypt' ? DOCX_ENCRYPTION_MAX_BYTES : DOCX_ENCRYPTION_MAX_CONTAINER_BYTES)
    )
      throw new DocxEncryptionError('budget')
    const result = await new Promise<DocxEncryptionResult>((resolve, reject) => {
      if (typeof Worker === 'undefined') {
        reject(new DocxEncryptionError('unavailable'))
        return
      }
      let worker: Worker
      try {
        worker = new Worker(new URL('./docx-encryption.worker.ts', import.meta.url), {
          type: 'module',
        })
      } catch {
        reject(new DocxEncryptionError('unavailable'))
        return
      }
      let settled = false
      const pending = { cancel: () => finish(cancelled()) }
      const finish = (error?: Error, value?: DocxEncryptionResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        worker.removeEventListener('message', message)
        worker.removeEventListener('error', failure)
        worker.removeEventListener('messageerror', failure)
        worker.terminate()
        if (this.pending === pending) this.pending = null
        if (error) reject(error)
        else resolve(value!)
      }
      const abort = () => finish(cancelled())
      const failure = () => finish(new DocxEncryptionError('unavailable'))
      const message = ({ data }: MessageEvent<DocxEncryptionResponse>) => {
        if (settled) return
        if (
          this.disposed ||
          this.epoch !== epoch ||
          this.source !== expectedSource ||
          this.requestId !== id ||
          signal.aborted
        ) {
          finish(cancelled())
          return
        }
        if (!data || typeof data !== 'object' || data.id !== id || Object.keys(data).length !== 2) {
          failure()
          return
        }
        if ('error' in data) {
          finish(new DocxEncryptionError(ERROR_CODES.has(data.error) ? data.error : 'unavailable'))
          return
        }
        const value = 'result' in data ? data.result : null
        if (
          !value ||
          Object.keys(value).length !== 2 ||
          !(value.bytes instanceof Uint8Array) ||
          value.bytes.length === 0 ||
          value.bytes.length >
            (operation === 'encrypt'
              ? DOCX_ENCRYPTION_MAX_CONTAINER_BYTES
              : DOCX_ENCRYPTION_MAX_BYTES) ||
          !['standard', 'agile'].includes(value.format) ||
          (operation === 'encrypt' && value.format !== 'agile')
        ) {
          failure()
          return
        }
        finish(undefined, value)
      }
      const timer = setTimeout(
        () => finish(new DocxEncryptionError('timeout')),
        DOCX_ENCRYPTION_DEADLINE_MS,
      )
      this.pending = pending
      signal.addEventListener('abort', abort, { once: true })
      worker.addEventListener('message', message)
      worker.addEventListener('error', failure)
      worker.addEventListener('messageerror', failure)
      if (signal.aborted) {
        abort()
        return
      }
      try {
        const copy = bytes.slice(),
          request: DocxEncryptionRequest = { id, operation, bytes: copy, password }
        worker.postMessage(request, [copy.buffer])
      } catch {
        failure()
      }
    })
    // A result and a source switch may share the same event turn. Revalidate after awaiting too.
    if (
      this.disposed ||
      this.epoch !== epoch ||
      this.source !== expectedSource ||
      this.requestId !== id ||
      signal.aborted
    )
      throw cancelled()
    return result
  }
}
