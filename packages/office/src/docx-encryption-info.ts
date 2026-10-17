import { XMLValidator } from 'fast-xml-parser'
import { DOCX_ENCRYPTION_MAX_SPIN, encryptionFailure as fail } from './docx-encryption-types.js'
const E = 'http://schemas.microsoft.com/office/2006/encryption'
const P = 'http://schemas.microsoft.com/office/2006/keyEncryptor/password'
export const AGILE_PREFIX = new Uint8Array([4, 0, 4, 0, 64, 0, 0, 0])
export interface AgileInfo {
  format: 'agile'
  salt: Uint8Array
  passwordSalt: Uint8Array
  spin: number
  verifier: Uint8Array
  verifierHash: Uint8Array
  key: Uint8Array
  hmacKey: Uint8Array
  hmacValue: Uint8Array
}
export interface StandardInfo {
  format: 'standard'
  salt: Uint8Array
  verifier: Uint8Array
  verifierHash: Uint8Array
}
interface Element {
  name: string
  ns: string
  attrs: Record<string, string>
  children: Element[]
}
const XML = 'http://www.w3.org/XML/1998/namespace'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const predefined = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
])
/** XML 1.0 Char, for both literal code points and numeric references. */
function xmlChar(code: number): boolean {
  return (
    code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  )
}
function ncNameStart(code: number): boolean {
  return (
    code === 95 ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 0xc0 && code <= 0xd6) ||
    (code >= 0xd8 && code <= 0xf6) ||
    (code >= 0xf8 && code <= 0x2ff) ||
    (code >= 0x370 && code <= 0x37d) ||
    (code >= 0x37f && code <= 0x1fff) ||
    (code >= 0x200c && code <= 0x200d) ||
    (code >= 0x2070 && code <= 0x218f) ||
    (code >= 0x2c00 && code <= 0x2fef) ||
    (code >= 0x3001 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfdcf) ||
    (code >= 0xfdf0 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0xeffff)
  )
}
function xmlName(value: string, allowColon = false): void {
  let first = true
  if (!value) fail('damaged')
  for (const char of value) {
    const code = char.codePointAt(0)!
    if (
      !ncNameStart(code) &&
      !(allowColon && code === 58) &&
      (first ||
        !(
          code === 45 ||
          code === 46 ||
          (code >= 48 && code <= 57) ||
          code === 0xb7 ||
          (code >= 0x300 && code <= 0x36f) ||
          (code >= 0x203f && code <= 0x2040)
        ))
    )
      fail('damaged')
    first = false
  }
}
function qName(value: string): [string, string] {
  const parts = value.split(':')
  if (parts.length > 2) fail('damaged')
  for (const part of parts) xmlName(part)
  return parts.length === 2 ? [parts[0]!, parts[1]!] : ['', parts[0]!]
}
/** Decode literal attribute/text spans once. Comment/PI contents do not expand references.
 * DTD is never accepted, so only predefined entities and valid numeric references exist.
 */
function decodeXml(value: string): string {
  let cursor = 0,
    result = ''
  for (;;) {
    const start = value.indexOf('&', cursor)
    if (start < 0) return result + value.slice(cursor)
    const end = value.indexOf(';', start + 1)
    if (end < 0) fail('damaged')
    const reference = value.slice(start + 1, end)
    let decoded = predefined.get(reference)
    if (decoded === undefined) {
      const numeric = /^#(?:([0-9]+)|x([0-9a-fA-F]+))$/.exec(reference)
      if (!numeric) fail('damaged')
      const code = Number.parseInt(numeric[1] ?? numeric[2]!, numeric[1] === undefined ? 16 : 10)
      if (!xmlChar(code)) fail('damaged')
      decoded = String.fromCodePoint(code)
    }
    result += value.slice(cursor, start) + decoded
    cursor = end + 1
  }
}
/** The installed XMLValidator's Name regex omits XML1.0 supplementary-plane names.
 * Substitute an injective BMP-only spelling for its syntax pass only; the scanner
 * still validates original QNames and exact closing names. The marker is absent
 * from the bounded input, so distinct names/attribute keys cannot collide.
 */
function validatorInput(xml: string): string {
  if (!/[\u{10000}-\u{10ffff}]/u.test(xml)) return xml
  const used = new Set(xml)
  let code = 0x100
  while (code <= 0xd7ff && (!ncNameStart(code) || used.has(String.fromCharCode(code)))) code++
  if (code > 0xd7ff) fail('budget')
  const marker = String.fromCharCode(code)
  return xml.replace(
    /[\u{10000}-\u{10ffff}]/gu,
    (char) => `${marker}${char.codePointAt(0)!.toString(16)}${marker}`,
  )
}
/** Input is at most 64KiB and a maximum of 16 elements/8 levels, before derivation.
 * Validate lexical XML independently of XMLValidator; its success is not a grammar proof.
 */
function readXml(xml: string): Element {
  for (const char of xml) if (!xmlChar(char.codePointAt(0)!)) fail('damaged')
  if (XMLValidator.validate(validatorInput(xml)) !== true) fail('damaged')
  const roots: Element[] = [],
    stack: { node: Element; rawName: string; bindings: Map<string, string> }[] = []
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^<>"']|"[^"]*"|'[^']*')*>/g
  let cursor = 0,
    count = 0,
    match: RegExpExecArray | null
  while ((match = tokens.exec(xml))) {
    const token = match[0],
      gap = xml.slice(cursor, match.index)
    // EncryptionInfo has element-only content; escaped non-whitespace remains invalid.
    if (
      gap.includes('<') ||
      gap.includes(']]>') ||
      (!stack.length && !/^[\t\r\n ]*$/.test(gap)) ||
      !/^[\t\r\n ]*$/.test(decodeXml(gap))
    )
      fail('damaged')
    cursor = tokens.lastIndex
    if (token.startsWith('<!--')) {
      const body = token.slice(4, -3)
      // XML Comment excludes both internal "--" and a final "-" before "-->".
      if (token.length < 7 || !token.endsWith('-->') || body.includes('--') || body.endsWith('-'))
        fail('damaged')
      continue
    }
    if (token.startsWith('<?')) {
      const instruction = /^<\?([^ \t\r\n?]+)(?:[ \t\r\n][\s\S]*)?\?>$/.exec(token)
      if (!instruction) fail('damaged')
      const target = instruction[1]!
      // PITarget is XML Name (colons allowed), not a namespace-qualified QName.
      xmlName(target, true)
      if (target.toLowerCase() === 'xml') {
        const declaration =
          /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(["'])1\.0\1(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(["'])([A-Za-z][A-Za-z0-9._-]*)\2)?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(["'])(yes|no)\4)?[ \t\r\n]*\?>$/.exec(
            token,
          )
        if (match.index !== 0 || !declaration) fail('damaged')
        if (declaration[3] && declaration[3].toLowerCase() !== 'utf-8') fail('unsupported')
      }
      continue
    }
    if (token.startsWith('</')) {
      const closing = /^<\/([^ \t\r\n/>]+)[ \t\r\n]*>$/.exec(token)
      if (!closing) fail('damaged')
      qName(closing[1]!)
      const scope = stack.pop()
      if (!scope || closing[1] !== scope.rawName) fail('damaged')
      continue
    }
    if (token.startsWith('<!')) fail('damaged')
    if (++count > 16 || stack.length >= 8) fail('budget')
    const rawName = /^<([^ \t\r\n/>]+)/.exec(token)?.[1]
    if (!rawName) fail('damaged')
    const [prefix, name] = qName(rawName)
    const bindings = new Map(stack.at(-1)?.bindings ?? [['xml', XML]])
    const attributes = token.slice(rawName.length + 1, token.endsWith('/>') ? -2 : -1)
    const attribute = /[ \t\r\n]+([^ \t\r\n=/>]+)[ \t\r\n]*=[ \t\r\n]*(["'])([\s\S]*?)\2/gy
    const rawAttrs: { key: string; value: string }[] = []
    const seen = new Set<string>()
    while (!/^[ \t\r\n]*$/.test(attributes.slice(attribute.lastIndex))) {
      // Sticky matching consumes every attribute delimiter; never skip malformed syntax.
      const a = attribute.exec(attributes)
      if (!a) fail('damaged')
      const key = a[1]!,
        value = a[3]!
      qName(key)
      if (seen.has(key) || value.includes('<')) fail('damaged')
      seen.add(key)
      // XML attribute whitespace normalization happens before reference decoding.
      rawAttrs.push({
        key,
        value: decodeXml(value.replace(/\r\n?/g, '\n').replace(/[\t\n]/g, ' ')),
      })
    }
    for (const { key, value } of rawAttrs) {
      if (key !== 'xmlns' && !key.startsWith('xmlns:')) continue
      const declared = key === 'xmlns' ? '' : key.slice(6)
      if (
        declared === 'xmlns' ||
        (declared && !value) ||
        value === XMLNS ||
        (declared === 'xml') !== (value === XML)
      )
        fail('damaged')
      bindings.set(declared, value)
    }
    const attrs: Record<string, string> = Object.create(null)
    for (const { key, value } of rawAttrs) {
      if (key === 'xmlns' || key.startsWith('xmlns:')) continue
      // Supported encryption attributes are all unqualified. Rebound lookalikes are invalid.
      if (key.includes(':') || Object.hasOwn(attrs, key)) fail('damaged')
      attrs[key] = value
    }
    const ns = bindings.get(prefix)
    if (!ns) fail('damaged')
    const node: Element = { name, ns, attrs, children: [] }
    const parent = stack.at(-1)
    if (parent) parent.node.children.push(node)
    else roots.push(node)
    if (roots.length > 1) fail('damaged')
    if (!token.endsWith('/>')) stack.push({ node, rawName, bindings })
  }
  if (stack.length || roots.length !== 1 || !/^[\t\r\n ]*$/.test(xml.slice(cursor))) fail('damaged')
  return roots[0]!
}
function expect(el: Element | undefined, name: string, ns = E): Element {
  if (!el || el.name !== name || el.ns !== ns) fail('damaged')
  return el
}
function only(el: Element, keys: string[]) {
  if (
    Object.keys(el.attrs).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(el.attrs, key))
  )
    fail('unsupported')
}
function number(value: string | undefined): number {
  if (!value || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)))
    fail('damaged')
  return Number(value)
}
export function decodeEncryptionBase64(value: string | undefined, length: number): Uint8Array {
  if (
    !value ||
    value.length > 128 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    fail('damaged')
  let binary: string
  try {
    binary = atob(value)
  } catch {
    fail('damaged')
  }
  if (binary.length !== length || btoa(binary) !== value) fail('damaged')
  return Uint8Array.from(binary, (s) => s.charCodeAt(0))
}
const PARAMS = [
  'saltSize',
  'blockSize',
  'keyBits',
  'hashSize',
  'cipherAlgorithm',
  'cipherChaining',
  'hashAlgorithm',
  'saltValue',
]
function parameters(el: Element): Uint8Array {
  if (
    number(el.attrs.saltSize) !== 16 ||
    number(el.attrs.blockSize) !== 16 ||
    number(el.attrs.keyBits) !== 256 ||
    number(el.attrs.hashSize) !== 64 ||
    el.attrs.cipherAlgorithm !== 'AES' ||
    el.attrs.cipherChaining !== 'ChainingModeCBC' ||
    el.attrs.hashAlgorithm !== 'SHA512'
  )
    fail('unsupported')
  return decodeEncryptionBase64(el.attrs.saltValue, 16)
}
export function parseEncryptionInfo(input: Uint8Array): AgileInfo | StandardInfo {
  if (input.length < 8 || input.length > 65536) fail('damaged')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const u32 = (p: number) => {
    if (p + 4 > input.length) fail('damaged')
    return view.getUint32(p, true)
  }
  const major = view.getUint16(0, true),
    minor = view.getUint16(2, true)
  if (major === 4 && minor === 4) {
    if (u32(4) !== 64) fail('damaged')
    let xml: string
    try {
      xml = new TextDecoder('utf-8', { fatal: true }).decode(input.subarray(8))
    } catch {
      fail('damaged')
    }
    const root = expect(readXml(xml), 'encryption')
    if (root.children.length !== 3 || Object.keys(root.attrs).length) fail('damaged')
    const data = expect(root.children[0], 'keyData'),
      integrity = expect(root.children[1], 'dataIntegrity'),
      encryptors = expect(root.children[2], 'keyEncryptors')
    only(data, PARAMS)
    only(integrity, ['encryptedHmacKey', 'encryptedHmacValue'])
    if (
      data.children.length ||
      integrity.children.length ||
      Object.keys(encryptors.attrs).length ||
      encryptors.children.length !== 1
    )
      fail('unsupported')
    const encryptor = expect(encryptors.children[0], 'keyEncryptor')
    only(encryptor, ['uri'])
    if (encryptor.attrs.uri !== P || encryptor.children.length !== 1) fail('unsupported')
    const key = expect(encryptor.children[0], 'encryptedKey', P)
    only(key, [
      ...PARAMS,
      'spinCount',
      'encryptedVerifierHashInput',
      'encryptedVerifierHashValue',
      'encryptedKeyValue',
    ])
    if (key.children.length) fail('damaged')
    const salt = parameters(data),
      passwordSalt = parameters(key),
      spin = number(key.attrs.spinCount)
    if (spin > DOCX_ENCRYPTION_MAX_SPIN) fail('budget')
    return {
      format: 'agile',
      salt,
      passwordSalt,
      spin,
      verifier: decodeEncryptionBase64(key.attrs.encryptedVerifierHashInput, 16),
      verifierHash: decodeEncryptionBase64(key.attrs.encryptedVerifierHashValue, 64),
      key: decodeEncryptionBase64(key.attrs.encryptedKeyValue, 32),
      hmacKey: decodeEncryptionBase64(integrity.attrs.encryptedHmacKey, 64),
      hmacValue: decodeEncryptionBase64(integrity.attrs.encryptedHmacValue, 64),
    }
  }
  if (![2, 3, 4].includes(major) || minor !== 2) fail('unsupported')
  const headerSize = u32(8)
  if (
    headerSize < 34 ||
    headerSize > 4096 ||
    headerSize % 2 ||
    12 + headerSize + 72 !== input.length
  )
    fail('damaged')
  if (
    u32(4) !== 0x24 ||
    u32(12) !== 0x24 ||
    u32(16) !== 0 ||
    u32(20) !== 0x660e ||
    u32(24) !== 0x8004 ||
    u32(28) !== 128 ||
    u32(32) !== 24
  )
    fail('unsupported')
  if (
    u32(36) !== 0 ||
    u32(40) !== 0 ||
    input[12 + headerSize - 1] !== 0 ||
    input[12 + headerSize - 2] !== 0
  )
    fail('damaged')
  const offset = 12 + headerSize
  if (u32(offset) !== 16 || u32(offset + 36) !== 20) fail('damaged')
  return {
    format: 'standard',
    salt: input.slice(offset + 4, offset + 20),
    verifier: input.slice(offset + 20, offset + 36),
    verifierHash: input.slice(offset + 40, offset + 72),
  }
}
export function encodeEncryptionBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}
export function buildAgileEncryptionInfo(info: Omit<AgileInfo, 'format'>): Uint8Array {
  const b = encodeEncryptionBase64,
    parameterAttrs =
      'saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512"'
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><encryption xmlns="${E}" xmlns:p="${P}"><keyData ${parameterAttrs} saltValue="${b(info.salt)}"/><dataIntegrity encryptedHmacKey="${b(info.hmacKey)}" encryptedHmacValue="${b(info.hmacValue)}"/><keyEncryptors><keyEncryptor uri="${P}"><p:encryptedKey spinCount="${info.spin}" ${parameterAttrs} saltValue="${b(info.passwordSalt)}" encryptedVerifierHashInput="${b(info.verifier)}" encryptedVerifierHashValue="${b(info.verifierHash)}" encryptedKeyValue="${b(info.key)}"/></keyEncryptor></keyEncryptors></encryption>`
  const body = new TextEncoder().encode(xml),
    result = new Uint8Array(body.length + 8)
  result.set(AGILE_PREFIX)
  result.set(body, 8)
  return result
}
