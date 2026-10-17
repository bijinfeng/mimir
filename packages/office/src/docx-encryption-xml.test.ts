import { readFileSync } from 'node:fs'
import { XMLValidator } from 'fast-xml-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEncryptionContainer } from './docx-encryption-container.js'
import { parseEncryptionInfo } from './docx-encryption-info.js'
const info = readEncryptionContainer(
  new Uint8Array(
    readFileSync(
      new URL('../tests/fixtures/docx-encryption/office-agile-password.docx', import.meta.url),
    ),
  ),
).info
const original = new TextDecoder().decode(info.subarray(8)),
  expected = parseEncryptionInfo(info)
function parse(transform: (xml: string) => string) {
  const xml = new TextEncoder().encode(transform(original)),
    bytes = new Uint8Array(xml.length + 8)
  bytes.set(info.subarray(0, 8))
  bytes.set(xml, 8)
  return parseEncryptionInfo(bytes)
}
const add = (declaration: string) => (xml: string) =>
  xml.replace('<encryption ', `<encryption ${declaration} `)
const insert = (fragment: string) => (xml: string) =>
  xml.replace('<encryption ', `${fragment}<encryption `)
afterEach(() => vi.restoreAllMocks())
describe('private XML grammar without relying on the general validator', () => {
  for (const [name, transform] of [
    ['NBSP in closing tag', (xml: string) => xml.replace('</encryption>', '</encryption \u00a0>')],
    ['leading closing whitespace', (xml: string) => xml.replace('</encryption>', '</ encryption>')],
    ['NBSP attribute separator', (xml: string) => xml.replace(' blockSize=', '\u00a0blockSize=')],
    ['NBSP beside equals', (xml: string) => xml.replace('blockSize=', 'blockSize\u00a0=')],
    ['missing attribute separator', (xml: string) => xml.replace(' blockSize=', 'blockSize=')],
    ['stray attribute data', (xml: string) => xml.replace(' blockSize=', ' stray blockSize=')],
    ['repeated namespace', add('xmlns:unused="urn:a" xmlns:unused="urn:b"')],
    ['missing PI target', insert('<? ?>')],
    ['empty PI', insert('<??>')],
    ['numeric PI target', insert('<?1bad?>')],
    ['combining PI start', insert('<?\u0300bad?>')],
    ['question inside PI target', insert('<?audit?data?>')],
    ['invalid PI separator', insert('<?audit\u00a0data?>')],
    ['reserved mixed-case PI target', insert('<?XmL?>')],
    ['internal comment double hyphen', insert('<!-- a--b -->')],
    ['comment ending in hyphen', insert('<!-- a--->')],
    ['empty malformed comment', insert('<!-->')],
  ] as const) {
    it(`rejects ${name} even if the external syntax pass reports success`, () => {
      vi.spyOn(XMLValidator, 'validate').mockReturnValue(true)
      expect(() => parse(transform)).toThrowError(expect.objectContaining({ code: 'damaged' }))
    })
  }
  for (const space of [' ', '\t', '\r', '\n', ' \t\r\n']) {
    it(`accepts XML S in closing tags and around attributes ${JSON.stringify(space)}`, () => {
      expect(
        parse((xml) =>
          xml
            .replace('</encryption>', `</encryption${space}>`)
            .replace(' blockSize=', `${space}blockSize${space}=${space}`),
        ),
      ).toEqual(expected)
    })
  }
  for (const fragment of [
    '<?audit?>',
    '<?audit ?>',
    '<?audit\tdata?>',
    '<?audit\r\ndata?>',
    '<?密码?>',
    '<?𐀀?>',
    '<?audit:a:b?>',
    '<?:audit?>',
    '<?xml-stylesheet href="&unknown;"?>',
    '<?audit < > &unknown; &#0; ? data?>',
    '<!---->',
    '<!---a-->',
    '<!-- a-b -->',
    '<!-- - -->',
    '<!-- < > &unknown; &#0; -->',
  ]) {
    it(`accepts the legal neighbouring grammar ${fragment}`, () => {
      expect(parse(insert(fragment))).toEqual(expected)
    })
  }
})
describe('encryption header private XML1.0 lexical validation', () => {
  for (const reference of [
    '&unknown;',
    '&',
    '&#;',
    '&#x;',
    '&#-1;',
    '&#x110000;',
    '&#65534;',
    '&#xFFFF;',
    '&#X41;',
  ]) {
    it(`refuses malformed/undeclared reference in an otherwise unused declaration: ${reference}`, () => {
      expect(() => parse(add(`xmlns:unused="urn:${reference}"`))).toThrowError(
        expect.objectContaining({ code: 'damaged' }),
      )
    })
  }
  for (const code of [0, 1, 0xb, 0x1f, 0xfffe, 0xffff]) {
    it(`refuses XML-forbidden raw code point ${code} even in an opaque comment`, () => {
      expect(() =>
        parse((xml) =>
          xml.replace('<encryption ', `<!-- ${String.fromCodePoint(code)} --><encryption `),
        ),
      ).toThrowError(expect.objectContaining({ code: 'damaged' }))
    })
  }
  it('decodes predefined and numeric namespace references exactly once', () => {
    expect(
      parse((xml) =>
        add(
          'xmlns:unused="urn:&amp;#0;&lt;&gt;&quot;&apos;&#xD7FF;&#xE000;&#xFFFD;&#x10000;&#x10FFFF;"',
        )(xml).replace(
          'xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password"',
          'xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/passw&#111;rd"',
        ),
      ),
    ).toEqual(expected)
  })
  it('keeps entity-like sequences literal inside comments and processing instructions', () => {
    expect(
      parse((xml) =>
        xml.replace('<encryption ', '<!-- &unknown; &#0; --><?audit &unknown; &#0;?><encryption '),
      ),
    ).toEqual(expected)
  })
  it('supports the declared UTF8 encoding and refuses contradictory byte encodings', () => {
    expect(parse((xml) => xml.replace('encoding="UTF-8"', "encoding='utf-8'"))).toEqual(expected)
    expect(() => parse((xml) => xml.replace('encoding="UTF-8"', 'encoding="UTF-16"'))).toThrowError(
      expect.objectContaining({ code: 'unsupported' }),
    )
  })
  for (const transform of [
    (xml: string) => add('xmlns:unused="urn:A<B"')(xml),
    (xml: string) => xml.replace('<keyData ', ']]><keyData '),
    (xml: string) => xml.replace('<encryption ', '&#32;<encryption '),
    (xml: string) => xml.replace('<keyData ', '\u00a0<keyData '),
    (xml: string) => xml.replace('version="1.0"', 'version="1.1"'),
    (xml: string) => xml.replace('standalone="yes"', 'standalone="true"'),
  ]) {
    it('refuses malformed XML lexical boundaries before deriving any key', () => {
      expect(() => parse(transform)).toThrowError(expect.objectContaining({ code: 'damaged' }))
    })
  }
})
describe('encryption header namespace scope and QName validation', () => {
  for (const declaration of [
    'xmlns:unused=""',
    'xmlns:unused="http://www.w3.org/XML/1998/namespace"',
    'xmlns:unused="http://www.w3.org/2000/xmlns/"',
    'xmlns:xml=""',
    'xmlns="http://www.w3.org/XML/1998/namespace"',
    'xmlns="http://www.w3.org/2000/xmlns/"',
  ]) {
    it(`refuses forbidden namespace binding: ${declaration}`, () => {
      expect(() => parse(add(declaration))).toThrowError(
        expect.objectContaining({ code: 'damaged' }),
      )
    })
  }
  for (const prefix of ['__proto__', 'toString', 'constructor', '密码', '𐀀']) {
    it(`accepts explicitly declared legal QName prefix ${prefix}`, () => {
      expect(
        parse((xml) =>
          xml
            .replaceAll('xmlns:p=', `xmlns:${prefix}=`)
            .replaceAll('p:encryptedKey', `${prefix}:encryptedKey`),
        ),
      ).toEqual(expected)
    })
  }
  it('keeps supplementary-plane namespace spellings injective even when the syntax marker is already present', () => {
    expect(
      parse((xml) =>
        add('xmlns:𐀁="urn:otherĀ"')(xml)
          .replaceAll('xmlns:p=', 'xmlns:𐀀=')
          .replaceAll('p:encryptedKey', '𐀀:encryptedKey'),
      ),
    ).toEqual(expected)
    expect(() =>
      parse((xml) =>
        add('xmlns:𐀁="urn:otherĀ"')(xml)
          .replaceAll('xmlns:p=', 'xmlns:𐀀=')
          .replaceAll('p:encryptedKey', '𐀀:encryptedKey')
          .replace('/></keyEncryptor>', '></𐀁:encryptedKey></keyEncryptor>'),
      ),
    ).toThrowError(expect.objectContaining({ code: 'damaged' }))
  })
  it('preserves the implicit xml prefix and accepts its sole legal explicit binding', () => {
    expect(parse(add('xmlns:xml="http://www.w3.org/XML/1998/namespace"'))).toEqual(expected)
  })
  it('resolves prefixes per element without inheriting ordinary object properties', () => {
    expect(
      parse((xml) =>
        xml
          .replace(
            'xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password"',
            'xmlns:p="urn:unused"',
          )
          .replace(
            '<p:encryptedKey ',
            '<constructor:encryptedKey xmlns:constructor="http://schemas.microsoft.com/office/2006/keyEncryptor/password" ',
          ),
      ),
    ).toEqual(expected)
    expect(() =>
      parse((xml) => xml.replaceAll('p:encryptedKey', 'toString:encryptedKey')),
    ).toThrowError(expect.objectContaining({ code: 'damaged' }))
  })
  for (const prefix of ['1bad', 'a:b']) {
    it(`refuses invalid QName prefix ${prefix}`, () => {
      expect(() =>
        parse((xml) =>
          xml
            .replaceAll('xmlns:p=', `xmlns:${prefix}=`)
            .replaceAll('p:encryptedKey', `${prefix}:encryptedKey`),
        ),
      ).toThrowError(expect.objectContaining({ code: 'damaged' }))
    })
  }
})
