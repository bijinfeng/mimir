import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { decryptDocxInWorker, encryptDocxInWorker } from './docx-encryption-core.js'
import { readEncryptionContainer, writeEncryptionContainer } from './docx-encryption-container.js'
import { parseEncryptionInfo } from './docx-encryption-info.js'
import {
  DOCX_ENCRYPTION_MAX_BYTES,
  DOCX_ENCRYPTION_MAX_CONTAINER_BYTES,
} from './docx-encryption-types.js'
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../tests/fixtures/docx-encryption/${name}`, import.meta.url)),
  )
const plain = fixture('office-agile-plain.docx')
const password = 'Password1234_'
const replaceXml = (bytes: Uint8Array, replace: (xml: string) => string) => {
  const container = readEncryptionContainer(bytes)
  const xml = new TextEncoder().encode(
    replace(new TextDecoder().decode(container.info.subarray(8))),
  )
  const info = new Uint8Array(xml.length + 8)
  info.set(container.info.subarray(0, 8))
  info.set(xml, 8)
  return writeEncryptionContainer(info, container.package)
}
describe('real independently produced Microsoft Office encrypted fixtures', () => {
  for (const format of ['agile', 'standard']) {
    it(`decrypts ${format} to byte-exact external plaintext`, async () => {
      const result = await decryptDocxInWorker(fixture(`office-${format}-password.docx`), password)
      expect(result.format).toBe(format)
      expect(result.bytes).toEqual(fixture(`office-${format}-plain.docx`))
    })
    it(`classifies ${format} wrong password without exposing input`, async () => {
      await expect(
        decryptDocxInWorker(fixture(`office-${format}-password.docx`), 'wrong-private-密码'),
      ).rejects.toMatchObject({ code: 'wrong-password' })
    })
  }
})
describe('Agile native encryption and authenticated package', () => {
  it('writes AES256/CBC/SHA512100k with fresh random inputs and preserves non-ASCII passwords and UTF16 surrogate pairs', async () => {
    const secret = '中文密碼🦉é\u0000Z'
    const first = await encryptDocxInWorker(plain, secret),
      second = await encryptDocxInWorker(plain, secret)
    expect(first.bytes).not.toEqual(second.bytes)
    expect(first.bytes.subarray(0, 8)).toEqual(
      new Uint8Array([208, 207, 17, 224, 161, 177, 26, 225]),
    )
    const info = parseEncryptionInfo(readEncryptionContainer(first.bytes).info)
    expect(info).toMatchObject({ format: 'agile', spin: 100000 })
    expect((await decryptDocxInWorker(first.bytes, secret)).bytes).toEqual(plain)
  })
  for (const extra of [1, 15, 16, 17, 4095, 4096, 4097, 20000]) {
    it(`round-trips native ZIP with ${extra} opaque bytes, including segment/final padding`, async () => {
      const zip = await JSZip.loadAsync(plain)
      zip.file(
        'customXml/opaque.bin',
        Uint8Array.from({ length: extra }, (_, i) => (i * 137) & 255),
      )
      const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
      const encrypted = await encryptDocxInWorker(bytes, password)
      expect((await decryptDocxInWorker(encrypted.bytes, password)).bytes).toEqual(bytes)
    })
  }
  it('rejects ciphertext tampering by HMAC even if ZIP headers remain valid', async () => {
    const container = readEncryptionContainer(fixture('office-agile-password.docx'))
    container.package[5000] = container.package[5000]! ^ 1
    await expect(
      decryptDocxInWorker(writeEncryptionContainer(container.info, container.package), password),
    ).rejects.toMatchObject({ code: 'damaged' })
  })
  for (const attribute of ['encryptedHmacKey', 'encryptedHmacValue']) {
    it(`authenticates ${attribute}, not just verifier and ZIP signature`, async () => {
      const bytes = replaceXml(fixture('office-agile-password.docx'), (xml) =>
        xml.replace(new RegExp(`${attribute}=".`), `${attribute}="A`),
      )
      await expect(decryptDocxInWorker(bytes, password)).rejects.toMatchObject({ code: 'damaged' })
    })
  }
  it('detects Standard ciphertext corruption through bounded full-entry CRC validation', async () => {
    const container = readEncryptionContainer(fixture('office-standard-password.docx'))
    container.package[100] = container.package[100]! ^ 1
    await expect(
      decryptDocxInWorker(writeEncryptionContainer(container.info, container.package), password),
    ).rejects.toMatchObject({ code: 'damaged' })
  })
})
describe('pre-derivation scheme/header/XML/length budgets', () => {
  const encrypted = fixture('office-agile-password.docx')
  for (const [label, transform, code] of [
    [
      'huge spin',
      (xml: string) => xml.replace('spinCount="100000"', 'spinCount="1000001"'),
      'budget',
    ],
    [
      'negative spin',
      (xml: string) => xml.replace('spinCount="100000"', 'spinCount="-1"'),
      'damaged',
    ],
    [
      'exponential spin',
      (xml: string) => xml.replace('spinCount="100000"', 'spinCount="1e5"'),
      'damaged',
    ],
    ['unsupported hash', (xml: string) => xml.replace('SHA512', 'SHA256'), 'unsupported'],
    [
      'unsupported key length',
      (xml: string) => xml.replace('keyBits="256"', 'keyBits="128"'),
      'unsupported',
    ],
    [
      'wrong element namespace',
      (xml: string) =>
        xml.replace(
          'xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password"',
          'xmlns:p="urn:fake"',
        ),
      'damaged',
    ],
    [
      'namespaced attribute lookalike',
      (xml: string) => xml.replace('spinCount="100000"', 'p:spinCount="100000"'),
      'damaged',
    ],
    [
      'duplicate node',
      (xml: string) => xml.replace('</encryption>', '<keyData/></encryption>'),
      'damaged',
    ],
    [
      'entity declaration',
      (xml: string) =>
        xml.replace('<encryption ', '<!DOCTYPE encryption [<!ENTITY x "boom">]><encryption '),
      'damaged',
    ],
    [
      'short salt',
      (xml: string) => xml.replace(/saltValue="[^"]*"/, 'saltValue="AA=="'),
      'damaged',
    ],
    [
      'unknown native parameter',
      (xml: string) => xml.replace('<keyData ', '<keyData future="1" '),
      'unsupported',
    ],
  ] as const) {
    it(`rejects ${label} before expensive derivation`, async () => {
      await expect(
        decryptDocxInWorker(replaceXml(encrypted, transform), password),
      ).rejects.toMatchObject({ code })
    })
  }
  it('accepts equivalent XML namespace prefixes rather than hard-coding p', async () => {
    const bytes = replaceXml(encrypted, (xml) =>
      xml.replaceAll('xmlns:p=', 'xmlns:key=').replaceAll('p:encryptedKey', 'key:encryptedKey'),
    )
    expect((await decryptDocxInWorker(bytes, password)).bytes).toEqual(plain)
  })
  it('validates 64-bit length, exact encrypted padding length, and bounded container input', async () => {
    const container = readEncryptionContainer(encrypted)
    new DataView(container.package.buffer).setBigUint64(0, 2n ** 40n, true)
    await expect(
      decryptDocxInWorker(writeEncryptionContainer(container.info, container.package), password),
    ).rejects.toMatchObject({ code: 'budget' })
    await expect(
      decryptDocxInWorker(new Uint8Array(DOCX_ENCRYPTION_MAX_CONTAINER_BYTES + 1), password),
    ).rejects.toMatchObject({ code: 'budget' })
    await expect(
      encryptDocxInWorker(new Uint8Array(DOCX_ENCRYPTION_MAX_BYTES + 1), password),
    ).rejects.toMatchObject({ code: 'budget' })
    const original = readEncryptionContainer(encrypted)
    await expect(
      decryptDocxInWorker(
        writeEncryptionContainer(original.info, original.package.slice(0, -16)),
        password,
      ),
    ).rejects.toMatchObject({ code: 'damaged' })
  })
  it('rejects unsupported Standard parameters and malformed header length', async () => {
    const container = readEncryptionContainer(fixture('office-standard-password.docx'))
    const wrongKey = container.info.slice()
    new DataView(wrongKey.buffer).setUint32(28, 256, true)
    await expect(
      decryptDocxInWorker(writeEncryptionContainer(wrongKey, container.package), password),
    ).rejects.toMatchObject({ code: 'unsupported' })
    const badLength = container.info.slice()
    new DataView(badLength.buffer).setUint32(8, 4095, true)
    await expect(
      decryptDocxInWorker(writeEncryptionContainer(badLength, container.package), password),
    ).rejects.toMatchObject({ code: 'damaged' })
  })
  it('refuses empty/oversize passwords and non-DOCX plaintext', async () => {
    await expect(encryptDocxInWorker(plain, '')).rejects.toMatchObject({ code: 'budget' })
    await expect(decryptDocxInWorker(encrypted, 'x'.repeat(1025))).rejects.toMatchObject({
      code: 'budget',
    })
    await expect(
      encryptDocxInWorker(new TextEncoder().encode('private plaintext'), password),
    ).rejects.toMatchObject({ code: 'damaged' })
  })
})
