import { decryptDocxInWorker, encryptDocxInWorker } from './docx-encryption-core.js'
import {
  DocxEncryptionError,
  type DocxEncryptionRequest,
  type DocxEncryptionResponse,
} from './docx-encryption-types.js'
const scope = globalThis as unknown as {
  addEventListener(
    type: 'message',
    fn: (event: MessageEvent<unknown>) => void,
    options: { once: boolean },
  ): void
  postMessage(message: DocxEncryptionResponse, transfer: Transferable[]): void
}
scope.addEventListener(
  'message',
  async ({ data }) => {
    const request = data as DocxEncryptionRequest
    if (!request || !Number.isSafeInteger(request.id) || request.id < 1) return
    try {
      if (
        Object.keys(request).length !== 4 ||
        !(request.bytes instanceof Uint8Array) ||
        typeof request.password !== 'string' ||
        !['encrypt', 'decrypt'].includes(request.operation)
      )
        throw new DocxEncryptionError('damaged')
      const result = await (
        request.operation === 'decrypt' ? decryptDocxInWorker : encryptDocxInWorker
      )(request.bytes, request.password)
      request.password = ''
      request.bytes.fill(0)
      scope.postMessage({ id: request.id, result }, [result.bytes.buffer as ArrayBuffer])
    } catch (error) {
      request.password = ''
      if (request.bytes instanceof Uint8Array) request.bytes.fill(0)
      // Exception text may contain platform/internal details. Only a fixed error code crosses back.
      scope.postMessage(
        { id: request.id, error: error instanceof DocxEncryptionError ? error.code : 'damaged' },
        [],
      )
    }
  },
  { once: true },
)
