import JSZip from 'jszip'
import { getSchema } from '@tiptap/core'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { XMLValidator } from 'fast-xml-parser'
import { decodeEntities } from '../vendor/packages/docx-engine/src/parse-xml-text.js'
import type { BoundedZip } from './zip-bounds.js'
import type { PmDocJson } from './docx.js'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WS = 'http://purl.oclc.org/ooxml/wordprocessingml/main'
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
let pmSchema: ReturnType<typeof getSchema> | undefined
const UNSUPPORTED = '这份原生表单结构尚不支持安全填写，原件完整保留'
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
export interface DocxFormControl {
  readonly id: string
  readonly label: string
  readonly kind: 'legacy' | 'sdt'
  readonly checked: boolean | null
  readonly reason: string | null
  readonly from: number | null
  readonly to: number | null
}
interface Occurrence {
  id: string
  label: string
  kind: 'legacy' | 'sdt'
  checked: boolean
  stateKnown: boolean
  reason: string | null
  from: number | null
  to: number | null
  glyphs: { checked: string; unchecked: string }
  state: Element | null
  box: Element
  text: Element | null
}
export interface ProtectedForms {
  readonly reason: string | null
  read(edited: PmDocJson): DocxFormControl[]
  toggleText(id: string, edited: PmDocJson): string
  validate(edited: PmDocJson): void
  save(edited: PmDocJson): Promise<Uint8Array>
}
const children = (el: Element, name: string, ns = W) =>
  el.children.filter((n) => n.local === name && n.ns === ns)
function one(el: Element, name: string, ns = W): Element | null {
  const found = children(el, name, ns)
  if (found.length > 1) fail()
  return found[0] ?? null
}
function flag(el: Element | null, fallback = false): boolean {
  if (!el) return fallback
  if (el.children.length || el.attrs.some((a) => a.local === 'val' && a.ns !== el.ns)) fail()
  const value = attr(el, 'val')?.toLowerCase()
  if (value === undefined || ['1', 'true', 'on'].includes(value)) return true
  if (['0', 'false', 'off'].includes(value)) return false
  fail()
}
function glyph(el: Element | null, fallback: string): string {
  if (!el) return fallback
  const hex = attr(el, 'val')
  if (!hex || !/^[0-9a-f]{1,6}$/i.test(hex)) fail()
  const cp = Number.parseInt(hex, 16)
  if (cp < 0x20 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) fail()
  return String.fromCodePoint(cp)
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
function patches(xml: string, changes: { from: number; to: number; text: string }[]): string {
  for (const p of changes.toSorted((a, b) => b.from - a.from))
    xml = xml.slice(0, p.from) + p.text + xml.slice(p.to)
  return xml
}
function statePatch(xml: string, item: Occurrence, checked: boolean) {
  const ns = item.kind === 'legacy' ? W : W14
  if (item.state) {
    const value = item.state.attrs.find((a) => a.local === 'val' && a.ns === ns)
    if (value)
      return { from: value.start, to: value.end, text: `${value.name}="${checked ? '1' : '0'}"` }
    const prefixName = Object.entries(item.state.namespaces).find(([p, n]) => p && n === ns)?.[0]
    const prefix = prefixName ? prefixName + ':' : ''
    // Qualified attributes cannot use a default namespace.
    if (!prefix) fail()
    const at =
      item.state.openEnd - (xml.slice(item.state.start, item.state.openEnd).endsWith('/>') ? 2 : 1)
    return { from: at, to: at, text: ` ${prefix}val="${checked ? '1' : '0'}"` }
  }
  const prefix = Object.entries(item.box.namespaces).find(([p, n]) => p && n === ns)?.[0]
  if (!prefix) fail()
  const at = item.box.closeStart
  if (xml.slice(item.box.start, item.box.openEnd).endsWith('/>'))
    return {
      from: item.box.openEnd - 2,
      to: item.box.openEnd,
      text: `><${prefix}:checked ${prefix}:val="${checked ? '1' : '0'}"/></${item.box.name}>`,
    }
  return { from: at, to: at, text: `<${prefix}:checked ${prefix}:val="${checked ? '1' : '0'}"/>` }
}
/** Private native occurrences, never caller marks, are the authority for form filling. */
export async function createProtectedForms(
  archive: BoundedZip,
  bytes: Uint8Array,
  original: PmDocJson,
  canonical: (doc: PmDocJson) => unknown,
): Promise<ProtectedForms> {
  pmSchema ??= getSchema(editorExtensions)
  const originalBytes = bytes.slice()
  let xml = '',
    reason: string | null = null
  const items: Occurrence[] = []
  try {
    xml = (await archive.readText('word/document.xml')) ?? ''
    const root = xmlTree(xml, true)
    if (root.ns !== W || root.local !== 'document') fail()
    const body = one(root, 'body')
    if (!body) fail()
    const all = descendants(body)
    const restriction = all.some(
      (n) => word(n) && ['permStart', 'permEnd', 'formProt'].includes(n.local),
    )
      ? '原件含区域权限或节级表单保护，当前不能可靠判断填写范围'
      : null
    // Every real control is listed, including controls whose native container cannot be mapped.
    for (const el of all) {
      const legacy = word(el) && el.local === 'checkBox'
      if (!legacy && !(el.ns === W14 && el.local === 'checkbox')) continue
      let checked = false,
        stateKnown = true
      try {
        checked = flag(
          one(el, 'checked', legacy ? W : W14),
          legacy ? flag(one(el, 'default')) : false,
        )
      } catch {
        stateKnown = false
      }
      items.push({
        id: `form-${items.length + 1}`,
        label: `复选框 ${items.length + 1}`,
        kind: legacy ? 'legacy' : 'sdt',
        checked,
        stateKnown,
        reason: restriction ?? '此控件所在原生结构无法可靠定位，当前只读保留',
        from: null,
        to: null,
        glyphs: { checked: '☒', unchecked: '☐' },
        state: null,
        box: el,
        text: null,
      })
    }
    const byBox = new Map(items.map((i) => [i.box, i]))
    let pmPos = 0
    for (const block of original.content ?? []) {
      const blockPos = pmPos
      pmPos += pmSchema.nodeFromJSON(block).nodeSize
      const index = block.attrs?.docxIndex
      if (
        typeof index !== 'number' ||
        body.children
          .slice(0, index + 1)
          .some((n) => word(n) && ['sdt', 'altChunk'].includes(n.local))
      )
        continue
      const p = body.children[index]
      if (!p || !word(p) || p.local !== 'p' || block.content?.some((n) => n.type !== 'text'))
        continue
      const mapped: Occurrence[] = []
      let text = ''
      try {
        const flat = p.children.filter((n) => !(word(n) && n.local === 'pPr'))
        for (let k = 0; k < flat.length; k++) {
          const el = flat[k]!
          if (word(el) && el.local === 'sdt') {
            const pr = one(el, 'sdtPr'),
              content = one(el, 'sdtContent')
            if (!pr || !content) fail()
            // Bound controls require updating their customXml data as well.
            // Other Word control types/behaviors are not a plain checkbox;
            // opaque extension siblings are retained without interpreting them.
            if (
              pr.children.some(
                (n) =>
                  word(n) &&
                  !['rPr', 'alias', 'id', 'tag', 'lock', 'placeholder'].includes(n.local),
              )
            )
              fail()
            const box = one(pr, 'checkbox', W14),
              item = box && byBox.get(box)
            if (!item) fail()
            mapped.push(item)
            item.state = one(box!, 'checked', W14)
            item.checked = flag(item.state)
            item.glyphs = {
              checked: glyph(one(box!, 'checkedState', W14), '☒'),
              unchecked: glyph(one(box!, 'uncheckedState', W14), '☐'),
            }
            if (item.glyphs.checked === item.glyphs.unchecked) fail()
            const nodes = descendants(content)
            if (
              content.children.length !== 1 ||
              content.children[0]?.local !== 'r' ||
              nodes.some(
                (n) =>
                  word(n) &&
                  !['r', 'rPr', 't', 'rFonts', 'b', 'i', 'color', 'sz', 'szCs', 'lang'].includes(
                    n.local,
                  ),
              )
            )
              fail()
            const ts = nodes.filter((n) => word(n) && n.local === 't')
            if (ts.length !== 1 || ts[0]!.children.length) fail()
            item.text = ts[0]!
            const value = decodeEntities(xml.slice(item.text.openEnd, item.text.closeStart))
            if (value !== item.glyphs[item.checked ? 'checked' : 'unchecked']) fail()
            item.from = blockPos + 1 + text.length
            item.to = item.from + value.length
            text += value
            item.reason = restriction ?? (one(pr, 'lock') ? '此内容控件已锁定，当前只读保留' : null)
            if (descendants(content).some((n) => word(n) && n.local === 'sdt')) fail()
            continue
          }
          if (!word(el) || el.local !== 'r') fail()
          const runContent = el.children.filter((n) => !(word(n) && n.local === 'rPr'))
          const field = runContent.find((n) => word(n) && n.local === 'fldChar')
          if (field) {
            if (runContent.length !== 1 || attr(field, 'fldCharType') !== 'begin') fail()
            const ff = one(field, 'ffData'),
              box = ff && one(ff, 'checkBox'),
              item = box && byBox.get(box)
            if (!item) fail()
            mapped.push(item)
            item.state = one(box!, 'checked')
            item.checked = flag(item.state, flag(one(box!, 'default')))
            let instruction = '',
              end = false
            for (k++; k < flat.length; k++) {
              const run = flat[k]!
              if (!word(run) || run.local !== 'r') fail()
              for (const child of run.children) {
                if (!word(child)) fail()
                if (child.local === 'rPr') continue
                if (child.local === 'instrText' && !child.children.length)
                  instruction += decodeEntities(xml.slice(child.openEnd, child.closeStart))
                else if (child.local === 'fldChar' && attr(child, 'fldCharType') === 'end')
                  end = true
                else if (child.local === 'fldChar' && attr(child, 'fldCharType') === 'separate')
                  continue
                else fail()
              }
              if (end) break
            }
            if (!end || instruction.trim() !== 'FORMCHECKBOX') fail()
            const value = item.glyphs[item.checked ? 'checked' : 'unchecked']
            item.from = blockPos + 1 + text.length
            item.to = item.from + value.length
            text += value
            const name = one(ff!, 'name')
            const nameText = name && attr(name, 'val')
            if (nameText) item.label = `${nameText}（${item.label}）`
            item.reason =
              restriction ??
              (!flag(one(ff!, 'enabled'), true) ? '此旧式表单控件已禁用，当前只读保留' : null)
          } else {
            for (const t of runContent) {
              if (!word(t) || t.local !== 't' || t.children.length) fail()
              text += decodeEntities(xml.slice(t.openEnd, t.closeStart))
            }
          }
        }
        if (text !== (block.content ?? []).map((n) => n.text ?? '').join('')) fail()
        // Prove the parsed range really carries the corresponding engine mark.
        for (const item of mapped) {
          let offset = blockPos + 1
          const covering = (block.content ?? []).filter((node) => {
            const start = offset
            offset += node.text?.length ?? 0
            return start < item.to! && offset > item.from!
          })
          if (
            !covering.length ||
            covering.some(
              (n) =>
                !(n.marks as PmDocJson[] | undefined)?.some((m) =>
                  item.kind === 'legacy'
                    ? m.type === 'instrField' && m.attrs?.instr === 'FORMCHECKBOX'
                    : m.type === 'ctrlCheckbox',
                ),
            )
          )
            fail()
        }
      } catch {
        for (const item of mapped) {
          item.reason = restriction ?? '此控件的原生字段、显示或段落结构复杂，当前只读保留'
          item.from = null
          item.to = null
        }
      }
    }
  } catch {
    reason = UNSUPPORTED
  }
  if (items.length > 1000) reason = '原件复选框过多，当前只读保留'
  const usable = items.filter((i) => !i.reason && i.from !== null)
  function states(edited: PmDocJson): Map<string, boolean> {
    if (reason) fail()
    const result = new Map<string, boolean>()
    const clean = structuredClone(edited)
    const leaves: { node: PmDocJson; from: number; to: number }[] = []
    let position = 0
    const visit = (node: PmDocJson, root = false) => {
      if (node.type === 'text') {
        const from = position
        position += node.text?.length ?? 0
        leaves.push({ node, from, to: position })
      } else {
        const type = pmSchema!.nodes[node.type]
        if (!type) fail()
        if (!root) position++
        for (const child of node.content ?? []) visit(child)
        if (!root && !type.isLeaf) position++
      }
    }
    visit(clean, true)
    const changes: { node: PmDocJson; from: number; to: number; text: string }[] = []
    let delta = 0,
      leafIndex = 0
    for (const item of usable.toSorted((a, b) => a.from! - b.from!)) {
      const from = item.from! + delta
      while (leaves[leafIndex] && leaves[leafIndex]!.to <= from) leafIndex++
      const leaf = leaves[leafIndex]
      if (!leaf || from < leaf.from) fail()
      const at = from - leaf.from,
        rest = (leaf.node.text ?? '').slice(at)
      const matches = [false, true].filter((checked) =>
        rest.startsWith(item.glyphs[checked ? 'checked' : 'unchecked']),
      )
      if (matches.length !== 1) fail()
      const checked = matches[0]!,
        value = item.glyphs[checked ? 'checked' : 'unchecked']
      if (from + value.length > leaf.to) fail()
      const base = item.glyphs[item.checked ? 'checked' : 'unchecked']
      changes.push({ node: leaf.node, from: at, to: at + value.length, text: base })
      result.set(item.id, checked)
      delta += value.length - base.length
    }
    for (const change of changes.toReversed()) {
      const value = change.node.text ?? ''
      change.node.text = value.slice(0, change.from) + change.text + value.slice(change.to)
    }
    if (stable(canonical(clean)) !== baseline) fail()
    return result
  }
  const baseline = stable(canonical(original))
  return {
    reason,
    read(edited) {
      let current = new Map<string, boolean>(),
        invalid = false
      try {
        current = states(edited)
      } catch {
        invalid = true
      }
      let delta = 0
      return items.map((i) => {
        const checked = current.get(i.id) ?? i.checked
        const length = i.glyphs[checked ? 'checked' : 'unchecked'].length
        const from = i.from === null ? null : i.from + delta
        const to = from === null ? null : from + length
        if (!i.reason && i.from !== null) delta += length - (i.to! - i.from)
        return {
          id: i.id,
          label: i.label,
          kind: i.kind,
          checked: i.stateKnown ? checked : null,
          reason:
            reason ?? i.reason ?? (invalid ? '当前表单状态无法可靠校验，请重新打开原件' : null),
          from,
          to,
        }
      })
    },
    toggleText(id, edited) {
      const item = usable.find((i) => i.id === id)
      if (!item) fail()
      const checked = states(edited).get(id)!
      return item.glyphs[checked ? 'unchecked' : 'checked']
    },
    validate(edited) {
      states(edited)
    },
    async save(edited) {
      const current = states(edited),
        changes = []
      for (const item of usable) {
        const checked = current.get(item.id)!
        if (checked === item.checked) continue
        changes.push(statePatch(xml, item, checked))
        if (item.text)
          changes.push({
            from: item.text.openEnd,
            to: item.text.closeStart,
            text: item.glyphs[checked ? 'checked' : 'unchecked']
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;'),
          })
      }
      if (!changes.length) return originalBytes.slice()
      const zip = await JSZip.loadAsync(originalBytes)
      zip.file('word/document.xml', patches(xml, changes))
      return zip.generateAsync({ type: 'uint8array' })
    },
  }
}
