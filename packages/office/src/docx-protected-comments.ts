import JSZip from 'jszip'
import { XMLValidator } from 'fast-xml-parser'
import type { CommentInfo } from '../vendor/packages/docx-engine/src/types.js'
import { decodeEntities } from '../vendor/packages/docx-engine/src/parse-xml-text.js'
import type { BoundedZip } from './zip-bounds.js'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WS = 'http://purl.oclc.org/ooxml/wordprocessingml/main'
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const EXT_REL = 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended'
const EXT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml'
const UNSUPPORTED = '这条原生讨论结构尚不支持安全修改，原件完整保留'
export type DocxCommentOperation = 'editText' | 'reply' | 'resolve' | 'reopen' | 'add' | 'delete'
export type DocxCommentAccess = Readonly<Record<DocxCommentOperation, string | null>>
export interface ProtectedComments {
  readonly comments: readonly CommentInfo[]
  readonly reason: string | null
  access(id: string): DocxCommentAccess
  validate(comments: unknown): CommentInfo[]
  save(comments: unknown): Promise<Uint8Array>
}
interface Attr {
  name: string
  ns: string
  local: string
  value: string
  start: number
  end: number
}
interface Element {
  name: string
  ns: string
  local: string
  start: number
  openEnd: number
  closeStart: number
  end: number
  attrs: Attr[]
  children: Element[]
  namespaces: Record<string, string>
}
const local = (name: string) => name.slice(name.indexOf(':') + 1)
const uri = (name: string, ns: Record<string, string>, attribute = false) =>
  name.includes(':')
    ? (ns[name.slice(0, name.indexOf(':'))] ?? '')
    : attribute
      ? ''
      : (ns[''] ?? '')
const attr = (el: Element, name: string, ns = el.ns) =>
  el.attrs.find((a) => a.local === name && a.ns === ns)?.value
const word = (el: Element) => el.ns === W || el.ns === WS
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^(0|[1-9]\d{0,9})$/.test(id) && Number(id) <= 2147483647
function fail(): never {
  throw new Error(UNSUPPORTED)
}
/** Offsets are retained; XML is never serialized back over the original shell. */
function xmlTree(xml: string): Element {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    fail()
  const roots: Element[] = [],
    stack: Element[] = []
  const tokens =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/[\w:.-]+\s*>|<[\w:.-]+(?:\s+(?:"[^"]*"|'[^']*'|[^<>"'])*)?\s*\/?>/g
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = tokens.exec(xml))) {
    const token = m[0]
    const gap = xml.slice(cursor, m.index)
    if (gap.includes('<') || (gap.trim() && stack.at(-1)?.local !== 't')) fail()
    cursor = tokens.lastIndex
    if (token.startsWith('<?') || token.startsWith('<!--')) continue
    if (token.startsWith('</')) {
      const node = stack.pop()
      if (!node || token.slice(2, -1).trim() !== node.name) fail()
      node.closeStart = m.index
      node.end = tokens.lastIndex
      continue
    }
    const name = /^<([^\s/>]+)/.exec(token)![1]!
    const namespaces: Record<string, string> = {
      xml: 'http://www.w3.org/XML/1998/namespace',
      ...stack.at(-1)?.namespaces,
    }
    const raw: { name: string; value: string; start: number; end: number }[] = []
    const matches = token.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)
    for (const a of matches) {
      const key = a[1]!,
        value = decodeEntities(a[3]!)
      if (key === 'xmlns') namespaces[''] = value
      else if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value
      else
        raw.push({
          name: key,
          value,
          start: m.index + a.index!,
          end: m.index + a.index! + a[0].length,
        })
    }
    const attrs: Attr[] = raw.map((a) =>
      Object.assign(a, { ns: uri(a.name, namespaces, true), local: local(a.name) }),
    )
    if (
      new Set(attrs.map((a) => `${a.ns}|${a.local}`)).size !== attrs.length ||
      attrs.some((a) => a.name.includes(':') && !a.ns)
    )
      fail()
    const node: Element = {
      name,
      ns: uri(name, namespaces),
      local: local(name),
      start: m.index,
      openEnd: tokens.lastIndex,
      closeStart: tokens.lastIndex - 2,
      end: tokens.lastIndex,
      attrs,
      children: [],
      namespaces,
    }
    if (!node.ns) fail()
    if (stack.length) stack.at(-1)!.children.push(node)
    else roots.push(node)
    if (!token.endsWith('/>')) stack.push(node)
  }
  if (stack.length || roots.length !== 1 || xml.slice(cursor).trim()) fail()
  return roots[0]!
}
const descendants = (el: Element): Element[] => el.children.flatMap((c) => [c, ...descendants(c)])
function targetPath(target: string): string {
  if (/[\\%?#:]/.test(target)) fail()
  const parts = target.startsWith('/') ? [] : ['word']
  for (const item of target.split('/')) {
    if (item === '..') {
      if (!parts.length) fail()
      parts.pop()
    } else if (item && item !== '.') parts.push(item)
  }
  return parts.join('/')
}
function relationships(xml: string): {
  root: Element
  items: { id: string; type: string; target: string; external: boolean }[]
} {
  const root = xmlTree(xml)
  if (root.ns !== REL || root.local !== 'Relationships') fail()
  const ids = new Set<string>()
  const items = root.children.map((el) => {
    const id = attr(el, 'Id', ''),
      type = attr(el, 'Type', ''),
      target = attr(el, 'Target', '')
    if (
      el.ns !== REL ||
      el.local !== 'Relationship' ||
      el.children.length ||
      !id ||
      ids.has(id) ||
      !type ||
      !target ||
      el.attrs.some((a) => a.ns || !['Id', 'Type', 'Target', 'TargetMode'].includes(a.local))
    )
      fail()
    ids.add(id)
    // External hyperlinks are preserved, but external comment relationships are never eligible.
    if (
      /comments|people/i.test(type) &&
      attr(el, 'TargetMode', '') &&
      attr(el, 'TargetMode', '') !== 'Internal'
    )
      fail()
    return { id, type, target, external: attr(el, 'TargetMode', '') === 'External' }
  })
  return { root, items }
}
const escapeText = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const escapeAttr = (s: string) => escapeText(s).replaceAll('"', '&quot;')
const textValid = (s: unknown): s is string =>
  typeof s === 'string' &&
  s.length <= 20_000 &&
  !!s.trim() &&
  Array.from(s).every((char) => {
    const code = char.codePointAt(0)!
    return (
      (code === 9 || code === 10 || code === 13 || code >= 32) &&
      !(code >= 0xd800 && code <= 0xdfff) &&
      code !== 0xfffe &&
      code !== 0xffff
    )
  })
function splice(xml: string, edits: { start: number; end: number; value: string }[]) {
  let out = xml
  for (const edit of edits.toSorted((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.value + out.slice(edit.end)
  return out
}
function appendChild(xml: string, root: Element, child: string): string {
  if (xml.slice(root.start, root.end).endsWith('/>'))
    return xml.slice(0, root.openEnd - 2) + '>' + child + `</${root.name}>` + xml.slice(root.end)
  return xml.slice(0, root.closeStart) + child + xml.slice(root.closeStart)
}
function setAttribute(
  xml: string,
  el: Element,
  ns: string,
  name: string,
  value: string,
  preferred: string,
): string {
  const existing = el.attrs.find((a) => a.ns === ns && a.local === name)
  if (existing) {
    const original = xml.slice(existing.start, existing.end)
    const next = original.replace(
      /(["'])([\s\S]*?)\1$/,
      (_all, quote: string) => `${quote}${value}${quote}`,
    )
    return splice(xml, [{ start: existing.start, end: existing.end, value: next }])
  }
  let prefix = Object.keys(el.namespaces).find((p) => p && el.namespaces[p] === ns) ?? preferred
  if (el.namespaces[prefix] && el.namespaces[prefix] !== ns) {
    let suffix = 1
    while (el.namespaces[`${preferred}${suffix}`]) suffix++
    prefix = `${preferred}${suffix}`
  }
  const binding = el.namespaces[prefix] === ns ? '' : ` xmlns:${prefix}="${ns}"`
  const offset = el.openEnd - (xml.slice(el.start, el.openEnd).endsWith('/>') ? 2 : 1)
  return splice(xml, [
    { start: offset, end: offset, value: `${binding} ${prefix}:${name}="${value}"` },
  ])
}
interface NativeComment {
  model: CommentInfo
  node: Element
  textNodes: Element[][]
  textReason: string | null
}
function parseComments(xml: string): { root: Element; items: NativeComment[] } {
  const root = xmlTree(xml)
  if (!word(root) || root.local !== 'comments') fail()
  const ids = new Set<string>(),
    pids = new Set<string>()
  const items = root.children.map((node): NativeComment => {
    if (!word(node) || node.local !== 'comment') fail()
    const id = attr(node, 'id'),
      author = attr(node, 'author') ?? ''
    if (!validId(id) || ids.has(id)) fail()
    ids.add(id)
    const paragraphs = node.children.filter((p) => word(p) && p.local === 'p')
    const paraId = paragraphs.at(-1) ? attr(paragraphs.at(-1)!, 'paraId', W14) : undefined
    for (const paragraph of descendants(node).filter((p) => word(p) && p.local === 'p')) {
      const paragraphId = attr(paragraph, 'paraId', W14)
      if (!paragraphId) continue
      if (!/^[\dA-F]{8}$/i.test(paragraphId) || pids.has(paragraphId.toUpperCase())) fail()
      pids.add(paragraphId.toUpperCase())
    }
    const textNodes = paragraphs.map((p) =>
      descendants(p).filter((t) => word(t) && t.local === 't'),
    )
    const text = textNodes
      .map((nodes) => nodes.map((t) => decodeEntities(xml.slice(t.openEnd, t.closeStart))).join(''))
      .join('\n')
    // Formatting, transparent raw attributes and hyperlink shells survive exact splices.
    // Fields, revisions, tables, controls, unknown content and nested paragraphs cannot grant writes.
    const safe = new Set([
      'p',
      'pPr',
      'r',
      'rPr',
      't',
      'hyperlink',
      'b',
      'i',
      'u',
      'color',
      'sz',
      'szCs',
      'rFonts',
      'lang',
      'spacing',
      'jc',
      'ind',
      'pStyle',
      'highlight',
      'vertAlign',
      'strike',
      'caps',
      'smallCaps',
      'noProof',
    ])
    const allowedChildren: Record<string, string[]> = {
      p: ['pPr', 'r', 'hyperlink'],
      r: ['rPr', 't'],
      hyperlink: ['r'],
      pPr: ['pStyle', 'spacing', 'jc', 'ind'],
      rPr: [...safe].filter(
        (name) => !['p', 'pPr', 'r', 'rPr', 't', 'hyperlink', 'pStyle', 'jc', 'ind'].includes(name),
      ),
    }
    const invalidHierarchy = descendants(node).some((n) =>
      n.children.some(
        (child) => !word(child) || !(allowedChildren[n.local] ?? []).includes(child.local),
      ),
    )
    const textReason =
      invalidHierarchy ||
      !paragraphs.length ||
      node.children.length !== paragraphs.length ||
      textNodes.some(
        (nodes) =>
          !nodes.length ||
          nodes.some(
            (t) =>
              t.children.length ||
              t.closeStart < t.openEnd ||
              xml.slice(t.openEnd, t.closeStart).includes('<'),
          ),
      ) ||
      [node, ...descendants(node)].some((n) =>
        n.attrs.some(
          (a) =>
            a.ns !== W &&
            a.ns !== WS &&
            a.ns !== W14 &&
            !(
              n.local === 'hyperlink' &&
              a.local === 'id' &&
              [
                'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'http://purl.oclc.org/ooxml/officeDocument/relationships',
              ].includes(a.ns)
            ) &&
            (/office\/word\//.test(a.ns) || /^(id|parentId|paraId|durableId|done)$/i.test(a.local)),
        ),
      ) ||
      descendants(node).some((n) => !word(n) || !safe.has(n.local))
        ? UNSUPPORTED
        : null
    return {
      model: {
        id,
        author,
        ...(attr(node, 'initials') === undefined ? {} : { initials: attr(node, 'initials') }),
        ...(attr(node, 'date') === undefined ? {} : { date: attr(node, 'date') }),
        text,
        ...(paraId ? { paraId } : {}),
      },
      node,
      textNodes,
      textReason,
    }
  })
  return { root, items }
}
function patchText(xml: string, item: NativeComment, text: string): string {
  if (item.textReason) throw new Error(item.textReason)
  const lines = text.split('\n')
  if (lines.length !== item.textNodes.length)
    throw new Error('受保护批注只能修改现有段落文字，不能增加或删除段落')
  const edits: { start: number; end: number; value: string }[] = []
  item.textNodes.forEach((nodes, p) => {
    const old = nodes.map((t) => decodeEntities(xml.slice(t.openEnd, t.closeStart)))
    if (old.join('') === lines[p]) return
    // Preserve common run prefix/suffix and all element attributes (including unknown ones).
    const full = old.join(''),
      next = lines[p]!
    let prefix = 0,
      suffix = 0
    while (prefix < Math.min(full.length, next.length) && full[prefix] === next[prefix]) prefix++
    while (
      suffix < Math.min(full.length, next.length) - prefix &&
      full.at(-1 - suffix) === next.at(-1 - suffix)
    )
      suffix++
    const end = full.length - suffix
    let offset = 0,
      inserted = false
    nodes.forEach((t, i) => {
      const start = offset
      offset += old[i]!.length
      const touches =
        prefix === end ? start <= prefix && prefix <= offset : start < end && offset > prefix
      if (!touches) return
      const value =
        old[i]!.slice(0, Math.max(0, prefix - start)) +
        (inserted ? '' : next.slice(prefix, next.length - suffix)) +
        old[i]!.slice(Math.max(0, end - start))
      inserted = true
      // Existing xml:space semantics must preserve new leading/trailing whitespace.
      const inner = escapeText(value)
      const preserved =
        value.trim() !== value &&
        attr(t, 'space', 'http://www.w3.org/XML/1998/namespace') !== 'preserve'
      if (preserved) {
        const snippet = setAttribute(
          xml,
          t,
          'http://www.w3.org/XML/1998/namespace',
          'space',
          'preserve',
          'xml',
        ).slice(t.start)
        const open = snippet.slice(0, t.openEnd - t.start + snippet.length - (xml.length - t.start))
        edits.push({ start: t.start, end: t.closeStart, value: open + inner })
      } else edits.push({ start: t.openEnd, end: t.closeStart, value: inner })
    })
    if (!inserted) fail()
  })
  return splice(xml, edits)
}

export async function createProtectedComments(
  archive: BoundedZip,
  original: Uint8Array,
): Promise<ProtectedComments> {
  const bytes = original.slice()
  const readText = async (path: string) => {
    const data = await archive.read(path)
    return data === null
      ? null
      : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data)
  }
  try {
    const relPath = 'word/_rels/document.xml.rels',
      typesPath = '[Content_Types].xml'
    const relXml = await readText(relPath),
      typesXml = await readText(typesPath)
    if (!relXml || !typesXml) fail()
    const rels = relationships(relXml),
      types = xmlTree(typesXml)
    if (
      types.ns !== CT ||
      types.local !== 'Types' ||
      types.children.some((n) => n.ns !== CT || !['Override', 'Default'].includes(n.local))
    )
      fail()
    const commentRels = rels.items.filter((r) => /comments|people/i.test(r.type))
    const commentsRel = commentRels.filter((r) =>
      [
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
        'http://purl.oclc.org/ooxml/officeDocument/relationships/comments',
      ].includes(r.type),
    )
    const extRel = commentRels.filter((r) => r.type === EXT_REL)
    if (commentRels.length === 0 && !archive.list().some((p) => /comments|people/i.test(p))) {
      const empty = (input: unknown): CommentInfo[] => {
        if (!Array.isArray(input) || input.length) fail()
        return []
      }
      return Object.freeze({
        comments: Object.freeze([]),
        reason: null,
        access: () =>
          Object.freeze({
            editText: UNSUPPORTED,
            reply: UNSUPPORTED,
            resolve: UNSUPPORTED,
            reopen: UNSUPPORTED,
            add: '受保护原件新增批注尚未支持',
            delete: '受保护原件删除批注尚未支持',
          }),
        validate: empty,
        save: async (input: unknown) => {
          empty(input)
          return bytes.slice()
        },
      })
    }
    if (
      commentRels.length !== commentsRel.length + extRel.length ||
      commentsRel.length !== 1 ||
      extRel.length > 1 ||
      archive.list().some((p) => /commentsIds|commentsExtensible|people\.xml/i.test(p))
    )
      fail()
    const declaredParts = new Set<string>()
    for (const node of types.children) {
      if (
        node.children.length ||
        node.attrs.some((a) => a.ns || !['PartName', 'ContentType', 'Extension'].includes(a.local))
      )
        fail()
      if (node.local === 'Override') {
        const part = attr(node, 'PartName', '')
        if (!part || declaredParts.has(part) || !attr(node, 'ContentType', '')) fail()
        declaredParts.add(part)
      }
      const contentType = attr(node, 'ContentType', '') ?? ''
      if (
        /comments|people/i.test(contentType) &&
        ![
          'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
          EXT_TYPE,
        ].includes(contentType)
      )
        fail()
    }
    const path = targetPath(commentsRel[0]!.target),
      xml = await readText(path)
    if (!xml) fail()
    const native = parseComments(xml)
    if (
      !types.children.some(
        (n) =>
          attr(n, 'PartName', '') === `/${path}` &&
          attr(n, 'ContentType', '') ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
      )
    )
      fail()
    const commentsRelsPath = `${path.slice(0, path.lastIndexOf('/') + 1)}_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`
    const commentsRelsXml = await readText(commentsRelsPath)
    if (commentsRelsXml) {
      const links = relationships(commentsRelsXml)
      if (
        links.items.some(
          (r) =>
            ![
              'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
              'http://purl.oclc.org/ooxml/officeDocument/relationships/hyperlink',
            ].includes(r.type),
        )
      )
        fail()
    }
    const extPath = extRel[0] ? targetPath(extRel[0].target) : 'word/commentsExtended.xml'
    if (!extRel.length && types.children.some((n) => attr(n, 'PartName', '') === `/${extPath}`))
      fail()
    const extXml = await readText(extPath)
    if (
      extRel.length &&
      !types.children.some(
        (n) => attr(n, 'PartName', '') === `/${extPath}` && attr(n, 'ContentType', '') === EXT_TYPE,
      )
    )
      fail()
    if (
      !!extXml !== !!extRel.length ||
      path === extPath ||
      [path, extPath].some(
        (p) =>
          !p.startsWith('word/') ||
          p === 'word/document.xml' ||
          p === relPath ||
          p === typesPath ||
          p.endsWith('/settings.xml'),
      )
    )
      fail()
    if (
      rels.items.some(
        (r) =>
          !commentRels.includes(r) && !r.external && [path, extPath].includes(targetPath(r.target)),
      )
    )
      fail()
    const extNodes = new Map<string, Element>()
    let extRoot: Element | null = null
    if (extXml) {
      extRoot = xmlTree(extXml)
      if (extRoot.ns !== W15 || extRoot.local !== 'commentsEx') fail()
      const byPid = new Map(
        native.items
          .filter((i) => i.model.paraId)
          .map((i) => [i.model.paraId!.toUpperCase(), i.model]),
      )
      for (const n of extRoot.children) {
        const pid = attr(n, 'paraId'),
          parent = attr(n, 'paraIdParent'),
          done = attr(n, 'done')
        if (
          n.ns !== W15 ||
          n.local !== 'commentEx' ||
          n.children.length ||
          !pid ||
          !byPid.has(pid.toUpperCase()) ||
          extNodes.has(pid.toUpperCase()) ||
          (done !== undefined && !['0', '1', 'false', 'true'].includes(done)) ||
          n.attrs.some((a) => a.ns !== W15 || !['paraId', 'paraIdParent', 'done'].includes(a.local))
        )
          fail()
        extNodes.set(pid.toUpperCase(), n)
        const c = byPid.get(pid.toUpperCase())!
        if (done === '1' || done === 'true') c.done = true
        if (parent) {
          const root = byPid.get(parent.toUpperCase())
          if (!root || root.id === c.id) fail()
          c.parentId = root.id
        }
      }
      if (
        native.items.some(
          (c) =>
            c.model.parentId &&
            native.items.find((r) => r.model.id === c.model.parentId)?.model.parentId,
        )
      )
        fail()
    }
    if (native.items.length > 1000) fail()
    const baseline = native.items.map((i) => i.model)
    const replyIdReason =
      baseline.length >= 1000
        ? '原件批注数量已达上限，暂不能追加回复'
        : baseline.some((c) => Number(c.id) === 2147483647)
          ? '原件批注编号已达上限，暂不能追加回复'
          : null
    const access = (id: string): DocxCommentAccess => {
      const item = native.items.find((c) => c.model.id === id)
      return Object.freeze({
        editText: item?.textReason ?? (item ? null : UNSUPPORTED),
        reply: item?.textReason ?? (item ? replyIdReason : UNSUPPORTED),
        resolve: item?.textReason ?? (item ? null : UNSUPPORTED),
        reopen: item?.textReason ?? (item ? null : UNSUPPORTED),
        add: '受保护原件新增批注尚未支持',
        delete: '受保护原件删除批注尚未支持',
      })
    }
    const validate = (input: unknown): CommentInfo[] => {
      if (
        !Array.isArray(input) ||
        input.length < baseline.length ||
        input.length > Math.min(1000, baseline.length + 100)
      )
        fail()
      const ids = new Set<string>(),
        old = new Map(baseline.map((c) => [c.id, c]))
      const out = input.map((value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
        const c = value as CommentInfo
        if (
          Object.keys(c).some(
            (key) =>
              !['id', 'author', 'initials', 'date', 'text', 'parentId', 'done', 'paraId'].includes(
                key,
              ),
          ) ||
          !validId(c.id) ||
          ids.has(c.id) ||
          (!textValid(c.text) && c.text !== old.get(c.id)?.text) ||
          (c.done !== undefined && typeof c.done !== 'boolean')
        )
          fail()
        ids.add(c.id)
        const prior = old.get(c.id)
        if (prior) {
          for (const field of ['author', 'initials', 'date', 'parentId', 'paraId'] as const)
            if (c[field] !== prior[field]) fail()
          if (c.text !== prior.text)
            patchText(
              xml,
              native.items.find((i) => i.model.id === c.id)!,
              c.text,
            )
          if (!!c.done !== !!prior.done && (c.parentId || access(c.id).resolve)) fail()
        } else {
          const root = baseline.find((r) => r.id === c.parentId && !r.parentId)
          if (
            !root ||
            access(root.id).reply ||
            c.paraId !== undefined ||
            c.initials !== undefined ||
            c.done !== undefined ||
            !textValid(c.author) ||
            c.author.length > 100 ||
            typeof c.date !== 'string' ||
            !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(c.date) ||
            !Number.isFinite(Date.parse(c.date))
          )
            fail()
        }
        return structuredClone(c)
      })
      if (baseline.some((c) => !ids.has(c.id))) fail()
      return out
    }
    const save = async (input: unknown) => {
      const current = validate(input)
      const same =
        baseline.length === current.length &&
        baseline.every((b) => {
          const c = current.find((n) => n.id === b.id)!
          return c.text === b.text && !!c.done === !!b.done
        })
      if (same) return bytes.slice()
      let output = xml,
        extOutput = extXml
      const needsExt = current.some(
        (c) => c.parentId || !!c.done !== !!baseline.find((b) => b.id === c.id)?.done,
      )
      const pids = new Map(baseline.filter((c) => c.paraId).map((c) => [c.id, c.paraId!]))
      const used = new Set(
        [native.root, ...descendants(native.root)]
          .map((p) => attr(p, 'paraId', W14)?.toUpperCase())
          .filter((p): p is string => !!p),
      )
      let counter = 1
      const pidFor = (id: string) => {
        if (pids.has(id)) return pids.get(id)!
        while (used.has(counter.toString(16).padStart(8, '0').toUpperCase())) counter++
        const pid = (counter++).toString(16).padStart(8, '0').toUpperCase()
        used.add(pid)
        pids.set(id, pid)
        return pid
      }
      for (const c of current) {
        const prior = baseline.find((b) => b.id === c.id)
        if (prior && prior.text !== c.text)
          output = patchText(
            output,
            parseComments(output).items.find((i) => i.model.id === c.id)!,
            c.text,
          )
      }
      if (needsExt) {
        for (const c of current)
          if (c.parentId || !!c.done !== !!baseline.find((b) => b.id === c.id)?.done) {
            pidFor(c.id)
            if (c.parentId) pidFor(c.parentId)
          }
        for (const b of baseline)
          if (pids.has(b.id) && !b.paraId) {
            const item = parseComments(output).items.find((i) => i.model.id === b.id)!
            const p = item.node.children.findLast((n) => word(n) && n.local === 'p')
            if (!p) fail()
            output = setAttribute(output, p, W14, 'paraId', pids.get(b.id)!, 'w14')
          }
      }
      for (const c of current.filter((candidate) => !baseline.some((b) => b.id === candidate.id))) {
        const root = xmlTree(output),
          wns = root.ns
        const child = `<w:comment xmlns:w="${wns}" xmlns:w14="${W14}" w:id="${c.id}" w:author="${escapeAttr(c.author)}" w:date="${escapeAttr(c.date!)}">${c.text
          .split('\n')
          .map(
            (line, i, arr) =>
              `<w:p${i === arr.length - 1 ? ` w14:paraId="${pidFor(c.id)}"` : ''}><w:r><w:t xml:space="preserve">${escapeText(line)}</w:t></w:r></w:p>`,
          )
          .join('')}</w:comment>`
        output = appendChild(output, root, child)
      }
      if (needsExt) {
        extOutput ??= `<w15:commentsEx xmlns:w15="${W15}"></w15:commentsEx>`
        const threadRoots = new Set(
          current.filter((c) => !baseline.some((b) => b.id === c.id)).map((c) => c.parentId),
        )
        for (const c of current) {
          const prior = baseline.find((b) => b.id === c.id)
          if (
            prior &&
            !!c.done === !!prior.done &&
            (!threadRoots.has(c.id) || extNodes.has((pids.get(c.id) ?? '').toUpperCase()))
          )
            continue
          const pid = pidFor(c.id),
            root = xmlTree(extOutput)
          const node = root.children.find(
            (n) => attr(n, 'paraId')?.toUpperCase() === pid.toUpperCase(),
          )
          if (node)
            extOutput = setAttribute(extOutput, node, W15, 'done', c.done ? '1' : '0', 'w15')
          else
            extOutput = appendChild(
              extOutput,
              root,
              `<w15:commentEx xmlns:w15="${W15}" w15:paraId="${pid}"${c.parentId ? ` w15:paraIdParent="${pidFor(c.parentId)}"` : ''} w15:done="${c.done ? '1' : '0'}"/>`,
            )
        }
      }
      // Independent re-extraction verifies text before publishing any ZIP output.
      const check = parseComments(output)
      if (current.some((c) => check.items.find((n) => n.model.id === c.id)?.model.text !== c.text))
        fail()
      const zip = await JSZip.loadAsync(bytes)
      zip.file(path, output)
      if (extOutput !== extXml && extOutput !== null) zip.file(extPath, extOutput)
      if (extOutput && !extRel.length) {
        if (archive.list().includes(extPath)) fail()
        let n = 1
        while (rels.items.some((r) => r.id === `mimirComments${n}`)) n++
        zip.file(
          relPath,
          appendChild(
            relXml,
            rels.root,
            `<Relationship xmlns="${REL}" Id="mimirComments${n}" Type="${EXT_REL}" Target="commentsExtended.xml"/>`,
          ),
        )
        if (types.children.some((c) => attr(c, 'PartName', '') === `/${extPath}`)) fail()
        zip.file(
          typesPath,
          appendChild(
            typesXml,
            types,
            `<Override xmlns="${CT}" PartName="/${extPath}" ContentType="${EXT_TYPE}"/>`,
          ),
        )
      }
      return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    }
    return Object.freeze({
      comments: Object.freeze(structuredClone(baseline)),
      reason: null,
      access,
      validate,
      save,
    })
  } catch {
    return Object.freeze({
      comments: Object.freeze([]),
      reason: UNSUPPORTED,
      access: () =>
        Object.freeze(
          Object.fromEntries(
            ['editText', 'reply', 'resolve', 'reopen', 'add', 'delete'].map((op) => [
              op,
              UNSUPPORTED,
            ]),
          ) as Record<DocxCommentOperation, string>,
        ),
      validate: fail,
      save: async () => fail(),
    })
  }
}
