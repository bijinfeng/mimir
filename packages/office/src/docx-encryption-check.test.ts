import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { readEncryptionContainer } from './docx-encryption-container.js'
import { parseEncryptionInfo } from './docx-encryption-info.js'
import { validateEncryptedDocxPlaintext } from './docx-encryption-zip.js'

const original = readEncryptionContainer(
  new Uint8Array(
    readFileSync(
      new URL('../tests/fixtures/docx-encryption/office-agile-password.docx', import.meta.url),
    ),
  ),
).info
const xml = new TextDecoder().decode(original.subarray(8))
function changed(transform: (value: string) => string) {
  const body = new TextEncoder().encode(transform(xml))
  const result = new Uint8Array(body.length + 8)
  result.set(original.subarray(0, 8))
  result.set(body, 8)
  return result
}
const replacePrefix = (value: string, prefix: string) =>
  value
    .replaceAll('xmlns:p=', `xmlns:${prefix}=`)
    .replaceAll('p:encryptedKey', `${prefix}:encryptedKey`)

describe('independent encryption XML namespace and lexical regressions', () => {
  for (const [name, declaration] of [
    ['undeclared entity in an unused namespace', 'xmlns:unused="&bogus;"'],
    ['forbidden zero character reference', 'xmlns:unused="&#0;"'],
    ['forbidden surrogate reference', 'xmlns:unused="&#xD800;"'],
    ['raw forbidden control', 'xmlns:unused="\u0001"'],
    ['reserved xml prefix rebound', 'xmlns:xml="urn:invalid"'],
    ['reserved xmlns prefix declaration', 'xmlns:xmlns="urn:invalid"'],
  ]) {
    it(`refuses ${name} before KDF`, () => {
      expect(() =>
        parseEncryptionInfo(
          changed((value) => value.replace('<encryption ', `<encryption ${declaration} `)),
        ),
      ).toThrowError(expect.objectContaining({ code: 'damaged' }))
    })
  }
  it('accepts a legal __proto__ namespace prefix without object prototype semantics', () => {
    expect(
      parseEncryptionInfo(
        changed((value) =>
          value
            .replaceAll('xmlns:p=', 'xmlns:__proto__=')
            .replaceAll('p:encryptedKey', '__proto__:encryptedKey'),
        ),
      ),
    ).toEqual(parseEncryptionInfo(original))
  })
})

describe('independent XML lexical followup beyond validator syntax coverage', () => {
  for (const [name, transform] of [
    [
      'non-XML whitespace between attributes',
      (value: string) => value.replace(' blockSize=', '\u00a0blockSize='),
    ],
    [
      'non-XML whitespace around equals',
      (value: string) => value.replace('blockSize=', 'blockSize\u00a0='),
    ],
    [
      'non-XML whitespace in closing tag',
      (value: string) => value.replace('</encryption>', '</encryption \u00a0>'),
    ],
    [
      'invalid processing instruction target',
      (value: string) => value.replace('<encryption ', '<?1bad?><encryption '),
    ],
    [
      'empty processing instruction target',
      (value: string) => value.replace('<encryption ', '<? ?><encryption '),
    ],
    [
      'double hyphen inside comment',
      (value: string) => value.replace('<encryption ', '<!-- a--b --><encryption '),
    ],
    [
      'comment ending in hyphen',
      (value: string) => value.replace('<encryption ', '<!-- a---><encryption '),
    ],
  ] as const) {
    it(`refuses ${name} before KDF`, () => {
      expect(() => parseEncryptionInfo(changed(transform))).toThrowError(
        expect.objectContaining({ code: 'damaged' }),
      )
    })
  }
  it('accepts the highest legal supplementary QName start and refuses the next plane', () => {
    expect(parseEncryptionInfo(changed((value) => replacePrefix(value, '\u{effff}')))).toEqual(
      parseEncryptionInfo(original),
    )
    expect(() =>
      parseEncryptionInfo(changed((value) => replacePrefix(value, '\u{f0000}'))),
    ).toThrowError(expect.objectContaining({ code: 'damaged' }))
  })
})

function mutate(transform: (view: DataView, directory: number, miniFat: number) => void) {
  const bytes = new Uint8Array(
    readFileSync(
      new URL('../tests/fixtures/docx-encryption/office-standard-password.docx', import.meta.url),
    ),
  )
  const view = new DataView(bytes.buffer)
  transform(view, (view.getUint32(48, true) + 1) * 512, (view.getUint32(60, true) + 1) * 512)
  return bytes
}
describe('independent CFB minifat, root, and declared-chain regressions', () => {
  for (const [name, transform] of [
    ['mini-sector self cycle', (v: DataView, _d: number, m: number) => v.setUint32(m, 0, true)],
    [
      'mini-sector out of range',
      (v: DataView, _d: number, m: number) => v.setUint32(m, 0x100000, true),
    ],
    [
      'mini-sector alias across streams',
      (v: DataView, d: number) => v.setUint32(d + 256 + 116, 0, true),
    ],
    [
      'mini-sector chain prematurely ended',
      (v: DataView, _d: number, m: number) => v.setUint32(m, 0xfffffffe, true),
    ],
    [
      'mini-stream root size not aligned',
      (v: DataView, d: number) => v.setUint32(d + 120, 4223, true),
    ],
    [
      'DIFAT sector aliases a FAT sector',
      (v: DataView) => {
        v.setUint32(68, v.getUint32(76, true), true)
        v.setUint32(72, 1, true)
      },
    ],
    ['v3 advertises v4 directory count', (v: DataView) => v.setUint32(40, 1, true)],
  ] as const) {
    it(`refuses ${name}`, () => {
      expect(() => readEncryptionContainer(mutate(transform))).toThrowError(
        expect.objectContaining({ code: 'damaged' }),
      )
    })
  }
})

it('stops a real compressed ZIP entry exceeding the streaming expanded-byte budget', async () => {
  const source = new Uint8Array(
    readFileSync(
      new URL('../tests/fixtures/docx-encryption/office-agile-plain.docx', import.meta.url),
    ),
  )
  const archive = await JSZip.loadAsync(source)
  archive.file('customXml/expanded-budget.bin', new Uint8Array(64 * 1024 * 1024 + 1))
  const compressed = await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  expect(compressed.length).toBeLessThan(100000)
  await expect(validateEncryptedDocxPlaintext(compressed)).rejects.toMatchObject({ code: 'budget' })
})
