import JSZip from 'jszip'
import { DOCX_ENCRYPTION_MAX_BYTES, encryptionFailure as fail } from './docx-encryption-types.js'
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
interface Stream {
  on(event: 'data', fn: (chunk: Uint8Array) => void): Stream
  on(event: 'error', fn: () => void): Stream
  on(event: 'end', fn: () => void): Stream
  pause(): void
  resume(): void
}
/** CRC is corruption detection for legacy Standard, not authentication. No expanded entries retained. */
export async function validateEncryptedDocxPlaintext(bytes: Uint8Array): Promise<void> {
  if (bytes.length > DOCX_ENCRYPTION_MAX_BYTES) fail('budget')
  if (
    bytes.length < 22 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 3 ||
    bytes[3] !== 4
  )
    fail('damaged')
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    fail('damaged')
  }
  const files = Object.values(zip.files).filter((file) => !file.dir)
  if (files.length > 10000) fail('budget')
  if (
    !zip.file('[Content_Types].xml') ||
    !zip.file('_rels/.rels') ||
    !zip.file('word/document.xml')
  )
    fail('damaged')
  let total = 0
  for (const file of files) {
    await new Promise<void>((resolve, reject) => {
      const native = file as JSZip.JSZipObject & {
        internalStream(type: 'uint8array'): Stream
      }
      const compressed = Reflect.get(native, '_data') as { crc32?: unknown } | undefined
      const expected = compressed?.crc32
      if (typeof expected !== 'number' || !Number.isInteger(expected)) {
        reject(new Error('invalid'))
        return
      }
      const stream = native.internalStream('uint8array')
      let count = 0,
        crc = 0xffffffff,
        settled = false
      stream.on('data', (chunk) => {
        if (settled) return
        count += chunk.length
        total += chunk.length
        if (count > 64 * 1024 * 1024 || total > 200 * 1024 * 1024) {
          settled = true
          stream.pause()
          try {
            fail('budget')
          } catch (error) {
            reject(error)
          }
          return
        }
        for (const value of chunk) crc = CRC_TABLE[(crc ^ value) & 255]! ^ (crc >>> 8)
      })
      stream.on('error', () => {
        if (!settled) {
          settled = true
          reject(new Error('invalid'))
        }
      })
      stream.on('end', () => {
        if (settled) return
        settled = true
        if ((crc ^ 0xffffffff) >>> 0 !== expected >>> 0) reject(new Error('invalid'))
        else resolve()
      })
      stream.resume()
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'DocxEncryptionError') throw error
      fail('damaged')
    })
  }
}
