import { XMLParser, XMLValidator } from 'fast-xml-parser'

export interface PivotXmlNode {
  tag: string
  attrs: Record<string, string>
  children: PivotXmlNode[]
}
const convert = (items: Record<string, unknown>[]): PivotXmlNode[] =>
  items.flatMap((item) => {
    const tag = Object.keys(item).find((key) => key !== ':@')!
    if (tag === '?xml') return []
    if (tag === '#text') {
      return String(item[tag]).trim()
        ? [{ tag: '#text', attrs: { value: String(item[tag]) }, children: [] }]
        : []
    }
    return [
      {
        tag,
        attrs: (item[':@'] ?? {}) as Record<string, string>,
        children: convert(item[tag] as Record<string, unknown>[]),
      },
    ]
  })

/** Ordered semantic tree: no namespace stripping, entity expansion, or discarded unknown content. */
export function pivotXmlTree(xml: string): PivotXmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error('原件 XML 无法安全解析')
  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
  }).parse(xml)
  const nodes = convert(parsed)
  if (nodes.length !== 1) throw new Error('原件 XML 根节点不唯一')
  return nodes[0]!
}

const XML = 'http://www.w3.org/XML/1998/namespace'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const fail = (detail: string): never => {
  throw new Error(`范围原生 XML 无法安全读取：${detail}`)
}
interface Patch {
  start: number
  end: number
  value: string
}
function patch(xml: string, patches: readonly Patch[]): string {
  return patches
    .toSorted((a, b) => b.start - a.start || b.end - a.end)
    .reduce((text, item) => text.slice(0, item.start) + item.value + text.slice(item.end), xml)
}
function decodeXlsxRangeXml(raw: string): string {
  if (raw.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, '').includes('&'))
    fail('XML 实体无效')
  return raw.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (entity) => {
    const fixed: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    }
    if (fixed[entity] !== undefined) return fixed[entity]!
    const n =
      entity[2] === 'x' ? Number.parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1))
    if (
      !(
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 32 && n <= 0xd7ff) ||
        (n >= 0xe000 && n <= 0xfffd) ||
        (n >= 0x10000 && n <= 0x10ffff)
      )
    )
      fail('XML 字符无效')
    return String.fromCodePoint(n)
  })
}
function assertXmlComment(token: string): void {
  const body = token.slice(4, -3)
  if (token.length < 7 || !token.endsWith('-->') || body.includes('--') || body.endsWith('-'))
    fail('XML 注释无效')
}
/** Validate native comment lexemes before semantic parsers or empty-leaf checks discard them. */
export function* xlsxRangeXmlTokens(xml: string): Generator<RegExpExecArray> {
  for (const match of xml.matchAll(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?(?:[\s\S]*?)\?>|<(?:"[^"]*"|'[^']*'|[^'">])*?>/g,
  )) {
    if (match[0].startsWith('<!--')) assertXmlComment(match[0])
    yield match
  }
}
/** XML character data, not inner markup: CDATA never participates in entity decoding. */
export function readXlsxFormulaCharacterData(raw: string): string {
  let cursor = 0,
    text = ''
  while (cursor < raw.length) {
    if (raw.startsWith('<![CDATA[', cursor)) {
      const end = raw.indexOf(']]>', cursor + 9)
      if (end < 0) fail('公式 CDATA 未闭合')
      text += raw.slice(cursor + 9, end).replace(/\r\n?/g, '\n')
      cursor = end + 3
    } else if (raw.startsWith('<!--', cursor)) {
      const end = raw.indexOf('-->', cursor + 4)
      if (end < 0) fail('公式 XML 注释未闭合')
      assertXmlComment(raw.slice(cursor, end + 3))
      cursor = end + 3
    } else {
      const end = raw.indexOf('<', cursor)
      if (end === cursor) fail('公式含未知或混合子元素')
      const part = raw.slice(cursor, end < 0 ? raw.length : end)
      if (part.includes(']]>')) fail('公式 XML 字符数据无效')
      text += decodeXlsxRangeXml(part.replace(/\r\n?/g, '\n'))
      cursor = end < 0 ? raw.length : end
    }
  }
  return text
}
/** Rewrite only actual formula elements; fake end tags inside CDATA/comments are character data. */
export function rewriteXlsxRangeFormulas(
  xml: string,
  names: readonly string[],
  transform: (formula: string, openingTag: string) => string,
): string {
  if (new TextEncoder().encode(xml).byteLength > 4 * 1024 * 1024) fail('公式 XML 超过预算')
  const selected = new Set(names),
    patches: Patch[] = []
  let active: { name: string; start: number; innerStart: number; open: string } | undefined
  let count = 0
  for (const match of xlsxRangeXmlTokens(xml)) {
    if (++count > 200000) fail('公式 XML 节点超过预算')
    const token = match[0]
    if (token.startsWith('<!--') || token.startsWith('<![CDATA[')) continue
    if (active) {
      if (/^<\/([^\s>]+)\s*>$/.exec(token)?.[1] !== active.name) fail('公式含未知或混合子元素')
      const formula = readXlsxFormulaCharacterData(xml.slice(active.innerStart, match.index))
      const changed = transform(formula, active.open)
      if (changed !== formula)
        patches.push({
          start: active.start,
          end: match.index + token.length,
          value:
            active.open +
            changed
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;')
              .replaceAll('\r', '&#13;') +
            token,
        })
      active = undefined
    } else {
      const name = /^<([^\s/>]+)/.exec(token)?.[1]
      if (name && selected.has(name) && !token.endsWith('/>'))
        active = { name, start: match.index, innerStart: match.index + token.length, open: token }
    }
  }
  if (active) fail('公式 XML 未闭合')
  return patch(xml, patches)
}
export interface XlsxRangeXmlNode {
  tag: string
  local: string
  ns: string
  namespaces: Map<string, string>
  attrs: Map<string, string>
  start: number
  openEnd: number
  closeStart: number
  end: number
  children: XlsxRangeXmlNode[]
}
type Node = XlsxRangeXmlNode
/** Offsets retain every unrelated native byte; the bounded semantic parser validates XML first. */
export function readXlsxRangeXmlTree(xml: string): Node {
  if (new TextEncoder().encode(xml).byteLength > 4 * 1024 * 1024) fail('XML 超过预算')
  for (const char of xml) {
    const n = char.codePointAt(0)!
    if (
      !(
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 32 && n <= 0xd7ff) ||
        (n >= 0xe000 && n <= 0xfffd) ||
        (n >= 0x10000 && n <= 0x10ffff)
      )
    )
      fail('XML 字符无效')
  }
  const tokens = () => xlsxRangeXmlTokens(xml)
  let depth = 0,
    count = 0
  for (const [tag] of tokens()) {
    if (tag.startsWith('<!') || tag.startsWith('<?')) continue
    if (tag.startsWith('</')) depth--
    else {
      if (++count > 200000 || ++depth > 64) fail('XML 节点或深度超过预算')
      if (tag.endsWith('/>')) depth--
    }
  }
  pivotXmlTree(xml)
  let previous = 0
  for (const match of tokens()) {
    decodeXlsxRangeXml(xml.slice(previous, match.index))
    if (match[0].startsWith('<?') && !(match.index === 0 && /^<\?xml\s/.test(match[0])))
      fail('未知 XML 处理指令')
    previous = match.index + match[0].length
  }
  decodeXlsxRangeXml(xml.slice(previous))
  const stack: Node[] = [],
    roots: Node[] = []
  for (const match of tokens()) {
    const raw = match[0],
      start = match.index
    if (raw.startsWith('<!') || raw.startsWith('<?')) continue
    if (raw.startsWith('</')) {
      const node = stack.pop()!
      node.closeStart = start
      node.end = start + raw.length
      continue
    }
    const tag = /^<([^\s/>]+)/.exec(raw)![1]!,
      attrs = new Map<string, string>()
    const body = raw.slice(tag.length + 1)
    for (const attribute of body.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const name = attribute[1]!
      if (attrs.has(name)) fail('XML 属性重复')
      attrs.set(name, decodeXlsxRangeXml((attribute[2] ?? attribute[3]!).replace(/[\t\r\n]/g, ' ')))
    }
    const namespaces = new Map(stack.at(-1)?.namespaces ?? [['xml', XML]])
    for (const [name, value] of attrs) {
      if (name === 'xmlns') {
        if (value === XML || value === XMLNS) fail('保留命名空间绑定')
        namespaces.set('', value)
      } else if (name.startsWith('xmlns:')) {
        const prefix = name.slice(6)
        if (
          !value ||
          prefix === 'xmlns' ||
          value === XMLNS ||
          (prefix === 'xml') !== (value === XML)
        )
          fail('保留命名空间绑定')
        namespaces.set(prefix, value)
      }
    }
    const resolve = (name: string, attribute = false) => {
      const parts = name.split(':')
      if (parts.length > 2) fail('XML QName 无效')
      const prefix = parts.length === 2 ? parts[0]! : ''
      if (prefix && !namespaces.has(prefix)) fail('命名空间未声明')
      return {
        local: parts.at(-1)!,
        ns: !prefix && attribute ? '' : (namespaces.get(prefix) ?? ''),
      }
    }
    const expanded = new Set<string>()
    for (const name of attrs.keys())
      if (name !== 'xmlns' && !name.startsWith('xmlns:')) {
        const resolved = resolve(name, true),
          key = resolved.ns + '|' + resolved.local
        if (expanded.has(key)) fail('XML 属性身份重复')
        expanded.add(key)
      }
    const node: Node = {
      tag,
      ...resolve(tag),
      namespaces,
      attrs,
      start,
      openEnd: start + raw.length,
      closeStart: start + raw.length,
      end: start + raw.length,
      children: [],
    }
    if (stack.length) stack.at(-1)!.children.push(node)
    else roots.push(node)
    if (!raw.endsWith('/>')) stack.push(node)
  }
  if (roots.length !== 1) fail('XML 根节点无效')
  return roots[0]!
}
