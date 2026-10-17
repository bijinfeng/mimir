/** ECMA-376 [MS-OFFCRYPTO] Standard / Agile, executed only in an isolated terminable worker. */
import { cbc, ecb } from '@noble/ciphers/aes.js'
import { sha1 } from '@noble/hashes/legacy.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { readEncryptionContainer, writeEncryptionContainer } from './docx-encryption-container.js'
import {
  buildAgileEncryptionInfo,
  parseEncryptionInfo,
  type AgileInfo,
  type StandardInfo,
} from './docx-encryption-info.js'
import { validateEncryptedDocxPlaintext } from './docx-encryption-zip.js'
import {
  DOCX_ENCRYPTION_MAX_BYTES,
  encryptionFailure as fail,
  validateEncryptionPassword,
  type DocxEncryptionResult,
} from './docx-encryption-types.js'
const BLOCK = {
  key: new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]),
  verifier: new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]),
  verifierHash: new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]),
  hmacKey: new Uint8Array([0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6]),
  hmacValue: new Uint8Array([0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33]),
}
const concat = (...arrays: Uint8Array[]) => {
  const result = new Uint8Array(arrays.reduce((sum, value) => sum + value.length, 0))
  let offset = 0
  for (const value of arrays) {
    result.set(value, offset)
    offset += value.length
  }
  return result
}
const le32 = (number: number) => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, number, true)
  return bytes
}
const utf16 = (text: string) => {
  const bytes = new Uint8Array(text.length * 2),
    view = new DataView(bytes.buffer)
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true)
  return bytes
}
const equal = (a: Uint8Array, b: Uint8Array) => {
  let difference = a.length ^ b.length
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ (b[i] ?? 0)
  return difference === 0
}
const pad = (bytes: Uint8Array) => {
  const result = new Uint8Array(Math.ceil(bytes.length / 16) * 16)
  result.set(bytes)
  return result
}
const iv = (salt: Uint8Array, block: Uint8Array) => sha512(concat(salt, block)).slice(0, 16)
const crypt = (encrypt: boolean, key: Uint8Array, vector: Uint8Array, bytes: Uint8Array) => {
  const cipher = cbc(key, vector, { disablePadding: true })
  return encrypt ? cipher.encrypt(bytes) : cipher.decrypt(bytes)
}
function passwordHash(
  password: string,
  salt: Uint8Array,
  spin: number,
  standard = false,
): Uint8Array {
  const hash = standard ? sha1 : sha512,
    encoded = utf16(password)
  let value = hash(concat(salt, encoded))
  encoded.fill(0)
  const buffer = new Uint8Array(value.length + 4),
    counter = new DataView(buffer.buffer)
  for (let i = 0; i < spin; i++) {
    counter.setUint32(0, i, true)
    buffer.set(value, 4)
    value.fill(0)
    value = hash(buffer)
  }
  buffer.fill(0)
  return value
}
const agileKey = (hash: Uint8Array, block: Uint8Array) => sha512(concat(hash, block)).slice(0, 32)
function packageLength(bytes: Uint8Array): number {
  if (bytes.length < 24) fail('damaged')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    length = view.getBigUint64(0, true)
  if (length > BigInt(DOCX_ENCRYPTION_MAX_BYTES)) fail('budget')
  if (!length || bytes.length !== 8 + Math.ceil(Number(length) / 16) * 16) fail('damaged')
  return Number(length)
}
function standardDecrypt(bytes: Uint8Array, password: string, info: StandardInfo): Uint8Array {
  const length = packageLength(bytes),
    hash = passwordHash(password, info.salt, 50000, true)
  const final = sha1(concat(hash, le32(0))),
    x = new Uint8Array(64).fill(0x36)
  hash.fill(0)
  for (let i = 0; i < final.length; i++) x[i] = x[i]! ^ final[i]!
  const key = sha1(x).slice(0, 16)
  x.fill(0)
  final.fill(0)
  try {
    const verifier = ecb(key, { disablePadding: true }).decrypt(info.verifier)
    const expected = ecb(key, { disablePadding: true }).decrypt(info.verifierHash).slice(0, 20)
    if (!equal(sha1(verifier), expected)) fail('wrong-password')
    return ecb(key, { disablePadding: true }).decrypt(bytes.subarray(8)).slice(0, length)
  } finally {
    key.fill(0)
  }
}
function agileDecrypt(bytes: Uint8Array, password: string, info: AgileInfo): Uint8Array {
  const length = packageLength(bytes),
    hash = passwordHash(password, info.passwordSalt, info.spin)
  const verifierKey = agileKey(hash, BLOCK.verifier),
    verifierHashKey = agileKey(hash, BLOCK.verifierHash),
    packageKeyKey = agileKey(hash, BLOCK.key)
  hash.fill(0)
  let key: Uint8Array | undefined, integrityKey: Uint8Array | undefined
  try {
    const verifier = crypt(false, verifierKey, info.passwordSalt, info.verifier)
    const verifierHash = crypt(false, verifierHashKey, info.passwordSalt, info.verifierHash)
    if (!equal(sha512(verifier), verifierHash)) fail('wrong-password')
    key = crypt(false, packageKeyKey, info.passwordSalt, info.key)
    integrityKey = crypt(false, key, iv(info.salt, BLOCK.hmacKey), info.hmacKey)
    const expected = crypt(false, key, iv(info.salt, BLOCK.hmacValue), info.hmacValue)
    if (!equal(hmac(sha512, integrityKey, bytes), expected)) fail('damaged')
    const output = new Uint8Array(length)
    for (let start = 0, index = 0; start < length; start += 4096, index++) {
      const size = Math.min(4096, length - start),
        encryptedSize = Math.ceil(size / 16) * 16
      const decrypted = crypt(
        false,
        key,
        iv(info.salt, le32(index)),
        bytes.subarray(8 + start, 8 + start + encryptedSize),
      )
      output.set(decrypted.subarray(0, size), start)
      decrypted.fill(0)
    }
    return output
  } finally {
    verifierKey.fill(0)
    verifierHashKey.fill(0)
    packageKeyKey.fill(0)
    key?.fill(0)
    integrityKey?.fill(0)
  }
}
/** No password or derived key is returned. Caller must terminate worker on every settlement. */
export async function decryptDocxInWorker(
  bytes: Uint8Array,
  password: string,
): Promise<DocxEncryptionResult> {
  validateEncryptionPassword(password)
  const container = readEncryptionContainer(bytes),
    info = parseEncryptionInfo(container.info)
  // All declared parameters and lengths are validated before expensive password derivation.
  packageLength(container.package)
  const plaintext =
    info.format === 'agile'
      ? agileDecrypt(container.package, password, info)
      : standardDecrypt(container.package, password, info)
  try {
    await validateEncryptedDocxPlaintext(plaintext)
  } catch (error) {
    plaintext.fill(0)
    throw error
  }
  return { bytes: plaintext, format: info.format }
}
const secureRandom = (length: number) => {
  if (!globalThis.crypto?.getRandomValues) fail('unavailable')
  return crypto.getRandomValues(new Uint8Array(length))
}

export async function encryptDocxInWorker(
  bytes: Uint8Array,
  password: string,
): Promise<DocxEncryptionResult> {
  validateEncryptionPassword(password)
  await validateEncryptedDocxPlaintext(bytes)
  const salt = secureRandom(16),
    passwordSalt = secureRandom(16),
    key = secureRandom(32),
    integrityKey = secureRandom(64),
    verifier = secureRandom(16),
    spin = 100000
  const hash = passwordHash(password, passwordSalt, spin)
  const verifierKey = agileKey(hash, BLOCK.verifier),
    verifierHashKey = agileKey(hash, BLOCK.verifierHash),
    packageKeyKey = agileKey(hash, BLOCK.key)
  hash.fill(0)
  try {
    const encrypted = new Uint8Array(8 + Math.ceil(bytes.length / 16) * 16)
    new DataView(encrypted.buffer).setBigUint64(0, BigInt(bytes.length), true)
    for (let start = 0, index = 0; start < bytes.length; start += 4096, index++) {
      const chunk = pad(bytes.subarray(start, start + 4096))
      encrypted.set(crypt(true, key, iv(salt, le32(index)), chunk), start + 8)
      chunk.fill(0)
    }
    const info = buildAgileEncryptionInfo({
      salt,
      passwordSalt,
      spin,
      verifier: crypt(true, verifierKey, passwordSalt, verifier),
      verifierHash: crypt(true, verifierHashKey, passwordSalt, sha512(verifier)),
      key: crypt(true, packageKeyKey, passwordSalt, key),
      hmacKey: crypt(true, key, iv(salt, BLOCK.hmacKey), integrityKey),
      hmacValue: crypt(true, key, iv(salt, BLOCK.hmacValue), hmac(sha512, integrityKey, encrypted)),
    })
    return { bytes: writeEncryptionContainer(info, encrypted), format: 'agile' }
  } finally {
    key.fill(0)
    integrityKey.fill(0)
    verifier.fill(0)
    verifierKey.fill(0)
    verifierHashKey.fill(0)
    packageKeyKey.fill(0)
  }
}
