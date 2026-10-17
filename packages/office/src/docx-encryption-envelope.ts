/** Read-only Office encryption envelope. No password, KDF, worker, decrypt or ZIP expansion. */
import { readEncryptionContainer } from './docx-encryption-container.js'
import { parseEncryptionInfo } from './docx-encryption-info.js'
import { DOCX_ENCRYPTION_MAX_BYTES, encryptionFailure } from './docx-encryption-types.js'

export function inspectOfficeEncryptionEnvelope(bytes: Uint8Array): 'standard' | 'agile' {
  const container = readEncryptionContainer(bytes)
  const info = parseEncryptionInfo(container.info)
  const encrypted = container.package
  if (encrypted.length < 24) encryptionFailure('damaged')
  const size = new DataView(
    encrypted.buffer,
    encrypted.byteOffset,
    encrypted.byteLength,
  ).getBigUint64(0, true)
  if (size > BigInt(DOCX_ENCRYPTION_MAX_BYTES)) encryptionFailure('budget')
  if (!size || encrypted.length !== 8 + Math.ceil(Number(size) / 16) * 16)
    encryptionFailure('damaged')
  // This validates the public envelope only. The encrypted plaintext's format is unknowable here.
  return info.format
}
