import { readFileSync } from 'node:fs'
import * as CFB from 'cfb'
import { describe, expect, it } from 'vitest'
import { readEncryptionContainer } from './docx-encryption-container.js'
const fixture = () =>
  new Uint8Array(
    readFileSync(
      new URL('../tests/fixtures/docx-encryption/office-standard-password.docx', import.meta.url),
    ),
  )
function mutate(fn: (bytes: Uint8Array, view: DataView, dir: number, fat: number) => void) {
  const bytes = fixture(),
    view = new DataView(bytes.buffer)
  fn(bytes, view, (view.getUint32(48, true) + 1) * 512, (view.getUint32(76, true) + 1) * 512)
  return bytes
}
describe('bounded actual CFB directory and sector chains', () => {
  it('requires actual magic and structurally valid streams, not a stream name substring', () => {
    expect(() =>
      readEncryptionContainer(new TextEncoder().encode('EncryptedPackage EncryptionInfo')),
    ).toThrow(/加密|Office|预算/)
    const bytes = new Uint8Array(512)
    bytes.set([208, 207, 17, 224, 161, 177, 26, 225])
    bytes.set(new TextEncoder().encode('EncryptedPackage EncryptionInfo'), 100)
    expect(() => readEncryptionContainer(bytes)).toThrow(/加密|Office|预算/)
  })
  for (const [name, change] of [
    [
      'duplicate root streams',
      (b: Uint8Array, v: DataView, d: number) => {
        b.set(b.slice(d + 128, d + 128 + 64), d + 256)
        v.setUint16(d + 256 + 64, v.getUint16(d + 128 + 64, true), true)
      },
    ],
    [
      'case-insensitive duplicate stream',
      (b: Uint8Array, v: DataView, d: number) => {
        b.set(b.slice(d + 128, d + 128 + 64), d + 256)
        v.setUint16(d + 256 + 64, v.getUint16(d + 128 + 64, true), true)
        v.setUint16(d + 256, 'e'.charCodeAt(0), true)
      },
    ],
    ['second root', (_b: Uint8Array, v: DataView, d: number) => v.setUint8(d + 128 + 66, 5)],
    [
      'directory cycle',
      (_b: Uint8Array, v: DataView, d: number) => v.setUint32(d + 128 + 68, 1, true),
    ],
    [
      'directory out of range',
      (_b: Uint8Array, v: DataView, d: number) => v.setUint32(d + 76, 9000, true),
    ],
    [
      'FAT directory cycle',
      (_b: Uint8Array, v: DataView, _d: number, f: number) => {
        const id = v.getUint32(48, true)
        v.setUint32(f + id * 4, id, true)
      },
    ],
    [
      'overlapping metadata and stream sector',
      (_b: Uint8Array, v: DataView, d: number) => {
        v.setUint32(d + 256 + 116, v.getUint32(48, true), true)
        v.setUint32(d + 256 + 120, 4096, true)
      },
    ],
    [
      'stream size above budget',
      (_b: Uint8Array, v: DataView, d: number) => v.setUint32(d + 128 + 124, 1, true),
    ],
    [
      'invalid null name terminator',
      (_b: Uint8Array, v: DataView, d: number) =>
        v.setUint16(d + 128 + v.getUint16(d + 128 + 64, true) - 2, 65, true),
    ],
    [
      'unreachable live stream',
      (_b: Uint8Array, v: DataView, d: number) => v.setUint32(d + 76, 0xffffffff, true),
    ],
    [
      'bad FAT marker',
      (_b: Uint8Array, v: DataView, _d: number, f: number) =>
        v.setUint32(f + v.getUint32(76, true) * 4, 0xfffffffe, true),
    ],
  ] as const) {
    it(`refuses ${name} within bounded synchronous work`, () => {
      expect(() => readEncryptionContainer(mutate(change))).toThrow(/加密|Office|预算/)
    })
  }
  it('enforces the directory budget before materializing any native stream', () => {
    const file = CFB.utils.cfb_new()
    for (let i = 0; i < 512; i++) CFB.utils.cfb_add(file, `entry${i}`, new Uint8Array([1]))
    const bytes = new Uint8Array(CFB.write(file, { type: 'array' }))
    expect(() => readEncryptionContainer(bytes)).toThrowError(
      expect.objectContaining({ code: 'budget' }),
    )
  })
  it('rejects truncation instead of padding malformed source sectors', () => {
    expect(() => readEncryptionContainer(fixture().subarray(0, -1))).toThrow(/加密|Office|预算/)
  })
})
