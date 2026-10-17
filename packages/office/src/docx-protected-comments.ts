import JSZip from 'jszip'
import { XMLValidator } from 'fast-xml-parser'
import type { CommentInfo } from '../vendor/packages/docx-engine/src/types.js'
import { decodeEntities } from '../vendor/packages/docx-engine/src/parse-xml-text.js'
import type { BoundedZip } from './zip-bounds.js'
import type { PmDocJson } from './docx.js'

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
  targetReason(block: number): string | null
  validate(comments: unknown): CommentInfo[]
  validateDocument(edited: PmDocJson, comments: unknown): void
  save(comments: unknown, edited: PmDocJson): Promise<Uint8Array>
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
function xmlTree(xml: string, allowOpaqueText = false): Element {
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
    if (
      gap.includes('<') ||
      (gap.trim() && (!stack.length || (!allowOpaqueText && stack.at(-1)?.local !== 't')))
    )
      fail()
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

interface AnchorRange {
  block: number
  from: number
  to: number
}
interface AnchorParagraph {
  node: Element
  text: string
  runs: { node: Element; text: Element; from: number; to: number }[]
}
const ANCHOR_UNSUPPORTED = '该原生批注锚点尚不支持安全修改；请选择普通单段文字'
function pmAnchors(doc: PmDocJson): Map<string, AnchorRange[]> {
  const result = new Map<string, AnchorRange[]>()
  doc.content?.forEach((block, blockIndex) => {
    let offset = 0
    const walk = (node: PmDocJson) => {
      if (node.type === 'text') {
        const end = offset + (node.text?.length ?? 0)
        for (const mark of (node.marks ?? []) as PmDocJson[]) {
          if (mark.type !== 'comment') continue
          const ids = String(mark.attrs?.ids ?? '')
            .split(/\s+/)
            .filter(Boolean)
          if (!ids.length || new Set(ids).size !== ids.length) fail()
          for (const id of ids) {
            if (!validId(id)) fail()
            const ranges = result.get(id) ?? []
            const last = ranges.at(-1)
            if (last?.block === blockIndex && last.to === offset) last.to = end
            else ranges.push({ block: blockIndex, from: offset, to: end })
            result.set(id, ranges)
          }
        }
        offset = end
      } else {
        // Any nested/nontext target is ineligible for new anchors, but retained
        // comments on these blocks must still compare across the entire PM tree.
        if (node !== block) offset++
        node.content?.forEach(walk)
        if (node !== block) offset++
      }
    }
    walk(block)
  })
  return result
}
function createAnchorMapping(xml: string, original: PmDocJson) {
  const originalMarks = pmAnchors(original)
  const paragraphs = new Map<number, AnchorParagraph>()
  const removable = new Map<string, Element[]>()
  try {
    const root = xmlTree(xml, true)
    if (!word(root) || root.local !== 'document') fail()
    const body = root.children.find((n) => word(n) && n.local === 'body')
    if (!body) fail()
    original.content?.forEach((block, index) => {
      try {
        const nativeIndex = block.attrs?.docxIndex
        if (typeof nativeIndex !== 'number') fail()
        // The engine expands these body elements into multiple DOCX indices.
        // Equal paragraph text cannot prove identity after that expansion.
        if (
          body.children
            .slice(0, nativeIndex + 1)
            .some((n) => word(n) && ['sdt', 'altChunk'].includes(n.local))
        )
          fail()
        const p = body.children[nativeIndex]
        if (!p || !word(p) || p.local !== 'p') fail()
        if (!block.content?.length || block.content.some((n) => n.type !== 'text')) fail()
        const runs: AnchorParagraph['runs'] = []
        let text = ''
        for (const child of p.children) {
          if (!word(child)) fail()
          if (child.local === 'pPr') continue
          if (['commentRangeStart', 'commentRangeEnd'].includes(child.local)) {
            if (child.children.length || !validId(attr(child, 'id'))) fail()
            continue
          }
          if (child.local !== 'r') fail()
          // Run identity/revision metadata cannot be duplicated by splitting.
          if (child.attrs.some((a) => /^(id|rsid.*|durableId)$/i.test(a.local))) fail()
          const content = child.children.filter((n) => !(word(n) && n.local === 'rPr'))
          if (!content.length) continue // exact empty run retained after reference deletion
          if (content.length !== 1 || !word(content[0]!)) fail()
          const t = content[0]!
          if (t.local === 'commentReference') {
            if (!validId(attr(t, 'id')) || t.children.length) fail()
            continue
          }
          if (t.local !== 't' || t.children.length || t.closeStart < t.openEnd) fail()
          const value = decodeEntities(xml.slice(t.openEnd, t.closeStart))
          if (!value.length) continue
          runs.push({ node: child, text: t, from: text.length, to: text.length + value.length })
          text += value
        }
        if (text !== block.content.map((n) => n.text ?? '').join('')) fail()
        const para = { node: p, text, runs }
        paragraphs.set(index, para)
        for (const [id, ranges] of originalMarks) {
          if (ranges.length !== 1 || ranges[0]!.block !== index) continue
          const range = ranges[0]!
          const all = descendants(root).filter(
            (n) =>
              word(n) &&
              ['commentRangeStart', 'commentRangeEnd', 'commentReference'].includes(n.local) &&
              attr(n, 'id') === id,
          )
          if (all.length !== 3) continue
          const start = all.find((n) => n.local === 'commentRangeStart')
          const end = all.find((n) => n.local === 'commentRangeEnd')
          const ref = all.find((n) => n.local === 'commentReference')
          if (
            !start ||
            !end ||
            !ref ||
            !p.children.includes(start) ||
            !p.children.includes(end) ||
            ref.start < p.start ||
            ref.end > p.end ||
            start.end > end.start ||
            ref.start < end.end
          )
            continue
          const offsetAt = (node: Element) =>
            runs.filter((r) => r.node.end <= node.start).reduce((n, r) => n + r.to - r.from, 0)
          if (offsetAt(start) === range.from && offsetAt(end) === range.to) removable.set(id, all)
        }
      } catch {
        /* This paragraph stays readable and byte-preserved. */
      }
    })
  } catch {
    /* Existing discussion text editing does not require mutable anchors. */
  }
  const plan = (edited: PmDocJson, ids: Set<string>, baselineIds: Set<string>) => {
    const marks = pmAnchors(edited)
    for (const [id, before] of originalMarks) {
      if (ids.has(id) || !baselineIds.has(id)) {
        if (JSON.stringify(before) !== JSON.stringify(marks.get(id))) fail()
      } else if (marks.has(id) || !removable.has(id)) throw new Error(ANCHOR_UNSUPPORTED)
    }
    const additions: { id: string; range: AnchorRange; paragraph: AnchorParagraph }[] = []
    for (const [id, ranges] of marks) {
      if (!ids.has(id) && !originalMarks.has(id)) fail()
      if (originalMarks.has(id)) {
        if (JSON.stringify(ranges) !== JSON.stringify(originalMarks.get(id))) fail()
        continue
      }
      if (ranges.length !== 1) throw new Error(ANCHOR_UNSUPPORTED)
      const range = ranges[0]!,
        paragraph = paragraphs.get(range.block)
      if (!paragraph || range.from >= range.to || range.to > paragraph.text.length)
        throw new Error(ANCHOR_UNSUPPORTED)
      // A UTF-16 boundary cannot bisect a code point.
      for (const at of [range.from, range.to])
        if (
          at > 0 &&
          /[\uD800-\uDBFF]/.test(paragraph.text[at - 1]!) &&
          /[\uDC00-\uDFFF]/.test(paragraph.text[at]!)
        )
          fail()
      const overlaps = [...marks].some(
        ([other, rs]) =>
          other !== id &&
          rs.some((r) => r.block === range.block && r.from < range.to && r.to > range.from),
      )
      if (overlaps) throw new Error('锚点已包含其他批注，不能覆盖其标记')
      additions.push({ id, range, paragraph })
    }
    for (const id of ids)
      if (!baselineIds.has(id) && (!marks.has(id) || originalMarks.has(id))) fail()
    return additions
  }
  return {
    canAdd: paragraphs.size > 0,
    targetReason: (block: number) => (paragraphs.has(block) ? null : ANCHOR_UNSUPPORTED),
    canDelete: (id: string) => removable.has(id),
    validate: (edited: PmDocJson, roots: Set<string>, baselineRoots: Set<string>) => {
      plan(edited, roots, baselineRoots)
    },
    patch(edited: PmDocJson, roots: Set<string>, baselineRoots: Set<string>): string {
      const additions = plan(edited, roots, baselineRoots)
      const edits: { start: number; end: number; value: string }[] = []
      for (const id of baselineRoots)
        if (!roots.has(id))
          for (const node of removable.get(id) ?? [])
            edits.push({ start: node.start, end: node.end, value: '' })
      const byPara = new Map<AnchorParagraph, typeof additions>()
      for (const item of additions)
        byPara.set(item.paragraph, [...(byPara.get(item.paragraph) ?? []), item])
      for (const [paragraph, items] of byPara) {
        const events = new Map<number, string>()
        for (const { id, range } of items) {
          const ns = paragraph.node.ns
          const marker = (name: string) => `<w:${name} xmlns:w="${ns}" w:id="${id}"/>`
          events.set(range.from, (events.get(range.from) ?? '') + marker('commentRangeStart'))
          events.set(
            range.to,
            (events.get(range.to) ?? '') +
              marker('commentRangeEnd') +
              `<w:r xmlns:w="${ns}">${marker('commentReference')}</w:r>`,
          )
        }
        for (const [offset, value] of events) {
          const inside = paragraph.runs.find((r) => offset > r.from && offset < r.to)
          if (inside) continue
          const next = paragraph.runs.find((r) => r.from === offset)
          const prev = paragraph.runs.findLast((r) => r.to === offset)
          const at = next?.node.start ?? prev?.node.end
          if (at === undefined) fail()
          edits.push({ start: at, end: at, value })
        }
        for (const run of paragraph.runs) {
          const cuts = [...events.keys()]
            .filter((n) => n > run.from && n < run.to)
            .toSorted((a, b) => a - b)
          if (!cuts.length) continue
          const prefix = xml.slice(run.node.start, run.text.start)
          const suffix = xml.slice(run.text.closeStart, run.node.end)
          const text = decodeEntities(xml.slice(run.text.openEnd, run.text.closeStart))
          // Every duplicated run retains its exact attributes/rPr; only the selected
          // w:t content is split. All other runs/paragraph shell remain raw bytes.
          const offsets = [run.from, ...cuts, run.to]
          const pieces = offsets.slice(0, -1).map((from, i) => {
            const value = text.slice(from - run.from, offsets[i + 1]! - run.from)
            const opening = xml.slice(run.text.start, run.text.openEnd)
            const preserved =
              value.trim() !== value &&
              attr(run.text, 'space', 'http://www.w3.org/XML/1998/namespace') !== 'preserve'
            const withSpace = preserved
              ? setAttribute(
                  xml,
                  run.text,
                  'http://www.w3.org/XML/1998/namespace',
                  'space',
                  'preserve',
                  'xml',
                )
              : xml
            const open = preserved
              ? withSpace.slice(run.text.start, run.text.openEnd + withSpace.length - xml.length)
              : opening
            return prefix + open + escapeText(value) + suffix + (events.get(offsets[i + 1]!) ?? '')
          })
          // The final boundary event is inserted separately at the original run end.
          const tail = events.get(run.to) ?? ''
          let value = pieces.join('')
          if (tail) value = value.slice(0, -tail.length)
          edits.push({ start: run.node.start, end: run.node.end, value })
        }
      }
      return splice(xml, edits)
    },
  }
}

export async function createProtectedComments(
  archive: BoundedZip,
  original: Uint8Array,
  originalDoc: PmDocJson,
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
    const emptyPackage =
      commentRels.length === 0 && !archive.list().some((p) => /comments|people/i.test(p))
    if (
      commentRels.length !== commentsRel.length + extRel.length ||
      (commentsRel.length !== 1 && !emptyPackage) ||
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
    const path = emptyPackage ? 'word/comments.xml' : targetPath(commentsRel[0]!.target),
      xml = emptyPackage ? `<w:comments xmlns:w="${W}"></w:comments>` : await readText(path)
    if (!xml) fail()
    const native = parseComments(xml)
    if (
      !emptyPackage &&
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
    const anchors = createAnchorMapping((await readText('word/document.xml')) ?? '', originalDoc)
    const baselineRoots = new Set(baseline.filter((c) => !c.parentId).map((c) => c.id))
    const replyIdReason =
      baseline.length >= 1000
        ? '原件批注数量已达上限，暂不能追加回复'
        : baseline.some((c) => Number(c.id) === 2147483647)
          ? '原件批注编号已达上限，暂不能追加回复'
          : null
    const access = (id: string): DocxCommentAccess => {
      const item = native.items.find((c) => c.model.id === id)
      return Object.freeze({
        editText: item?.textReason ?? null,
        reply: item?.textReason ?? replyIdReason,
        resolve: item?.textReason ?? null,
        reopen: item?.textReason ?? null,
        add: replyIdReason ?? (anchors.canAdd ? null : ANCHOR_UNSUPPORTED),
        delete: item
          ? (item.textReason ??
            (item.model.parentId || anchors.canDelete(id) ? null : ANCHOR_UNSUPPORTED))
          : null,
      })
    }
    const validate = (input: unknown): CommentInfo[] => {
      if (!Array.isArray(input) || input.length > Math.min(1000, baseline.length + 100)) fail()
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
          const root = input.find((r: CommentInfo) => r.id === c.parentId && !r.parentId) as
            | CommentInfo
            | undefined
          if (
            (c.parentId ? !root || (old.has(root.id) && access(root.id).reply) : access('').add) ||
            c.paraId !== undefined ||
            (c.initials !== undefined && (!textValid(c.initials) || c.initials.length > 100)) ||
            (c.parentId !== undefined && c.done !== undefined) ||
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
      for (const c of baseline)
        if (!ids.has(c.id)) {
          if (access(c.id).delete) throw new Error(access(c.id).delete!)
          if (!c.parentId && out.some((item) => item.parentId === c.id)) fail()
        }
      for (const c of out)
        if (c.parentId && !out.some((r) => r.id === c.parentId && !r.parentId)) fail()
      return out
    }
    const validateDocument = (edited: PmDocJson, input: unknown) => {
      const current = validate(input)
      anchors.validate(
        edited,
        new Set(current.filter((c) => !c.parentId).map((c) => c.id)),
        baselineRoots,
      )
    }
    const save = async (input: unknown, edited: PmDocJson) => {
      validateDocument(edited, input)
      const current = validate(input)
      const same =
        baseline.length === current.length &&
        baseline.every((b) => {
          const c = current.find((n) => n.id === b.id)
          return c && c.text === b.text && !!c.done === !!b.done
        })
      if (same) return bytes.slice()
      const removed = baseline.filter((b) => !current.some((c) => c.id === b.id))
      let output = splice(
          xml,
          removed.map((c) => {
            const node = native.items.find((i) => i.model.id === c.id)!.node
            return { start: node.start, end: node.end, value: '' }
          }),
        ),
        extOutput = extXml
          ? splice(
              extXml,
              removed.flatMap((c) => {
                const node = extNodes.get((c.paraId ?? '').toUpperCase())
                return node ? [{ start: node.start, end: node.end, value: '' }] : []
              }),
            )
          : null
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
          if (current.some((c) => c.id === b.id) && pids.has(b.id) && !b.paraId) {
            const item = parseComments(output).items.find((i) => i.model.id === b.id)!
            const p = item.node.children.findLast((n) => word(n) && n.local === 'p')
            if (!p) fail()
            output = setAttribute(output, p, W14, 'paraId', pids.get(b.id)!, 'w14')
          }
      }
      for (const c of current.filter((candidate) => !baseline.some((b) => b.id === candidate.id))) {
        const root = xmlTree(output),
          wns = root.ns
        const child = `<w:comment xmlns:w="${wns}" xmlns:w14="${W14}" w:id="${c.id}" w:author="${escapeAttr(c.author)}"${c.initials === undefined ? '' : ` w:initials="${escapeAttr(c.initials)}"`} w:date="${escapeAttr(c.date!)}">${c.text
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
      const documentXml = anchors.patch(
        edited,
        new Set(current.filter((c) => !c.parentId).map((c) => c.id)),
        baselineRoots,
      )
      if (documentXml !== (await readText('word/document.xml'))) {
        const documentRoot = xmlTree(documentXml, true)
        const nativeAnchors = descendants(documentRoot).filter(
          (n) =>
            word(n) &&
            ['commentRangeStart', 'commentRangeEnd', 'commentReference'].includes(n.local),
        )
        for (const c of current.filter((item) => !item.parentId && !baselineRoots.has(item.id)))
          if (nativeAnchors.filter((n) => attr(n, 'id') === c.id).length !== 3) fail()
        for (const c of removed.filter((item) => !item.parentId))
          if (nativeAnchors.some((n) => attr(n, 'id') === c.id)) fail()
        zip.file('word/document.xml', documentXml)
      }
      let nextRels = relXml,
        nextTypes = typesXml
      if (emptyPackage) {
        let n = 1
        while (rels.items.some((r) => r.id === `mimirCommentsRoot${n}`)) n++
        nextRels = appendChild(
          nextRels,
          xmlTree(nextRels),
          `<Relationship xmlns="${REL}" Id="mimirCommentsRoot${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`,
        )
        nextTypes = appendChild(
          nextTypes,
          xmlTree(nextTypes),
          `<Override xmlns="${CT}" PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`,
        )
      }
      if (extOutput !== extXml && extOutput !== null) zip.file(extPath, extOutput)
      if (extOutput && !extRel.length) {
        if (archive.list().includes(extPath)) fail()
        let n = 1
        while (rels.items.some((r) => r.id === `mimirComments${n}`)) n++
        nextRels = appendChild(
          nextRels,
          xmlTree(nextRels),
          `<Relationship xmlns="${REL}" Id="mimirComments${n}" Type="${EXT_REL}" Target="commentsExtended.xml"/>`,
        )
        if (types.children.some((c) => attr(c, 'PartName', '') === `/${extPath}`)) fail()
        nextTypes = appendChild(
          nextTypes,
          xmlTree(nextTypes),
          `<Override xmlns="${CT}" PartName="/${extPath}" ContentType="${EXT_TYPE}"/>`,
        )
      }
      if (nextRels !== relXml) zip.file(relPath, nextRels)
      if (nextTypes !== typesXml) zip.file(typesPath, nextTypes)
      return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    }
    return Object.freeze({
      comments: Object.freeze(structuredClone(baseline)),
      reason: null,
      access,
      targetReason: anchors.targetReason,
      validate,
      validateDocument,
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
      targetReason: () => UNSUPPORTED,
      validate: fail,
      validateDocument: fail,
      save: async () => fail(),
    })
  }
}
