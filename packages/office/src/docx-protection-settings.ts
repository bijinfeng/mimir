import JSZip from 'jszip'
import { XMLValidator } from 'fast-xml-parser'
import { decodeEntities } from '../vendor/packages/docx-engine/src/parse-xml-text.js'
import type { DocxPasswordCredential } from './docx-protection-password-crypto.js'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WS = 'http://purl.oclc.org/ooxml/wordprocessingml/main'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
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
const word = (el: Element) => el.ns === W || el.ns === WS
function fail(): never {
  throw new Error('保护设置结构无法安全修改，原件保持不变')
}
/** Offsets are retained; XML is never serialized back over the original shell. */
function xmlTree(xml: string, allowOpaqueText = false): Element {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    fail()
  const roots: Element[] = [],
    stack: Element[] = []
  const tokens =
    /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/[\w:.-]+\s*>|<[\w:.-]+(?:\s+(?:"[^"]*"|'[^']*'|[^<>"'])*)?\s*\/?>/g
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
    if (token.startsWith('<![CDATA[') && !stack.length) fail()
    if (stack.length > 128 || roots.length > 1) fail()
    if (token.startsWith('<?') || token.startsWith('<!--') || token.startsWith('<![CDATA['))
      continue
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

export function emptyDocxProtectionSettings(documentXml: string): string {
  const tokens = documentXml
    .slice(0, 65536)
    .matchAll(
      /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[\w:.-]+(?:\s+(?:"[^"]*"|'[^']*'|[^<>"'])*)?\s*\/?>/g,
    )
  const opening = [...tokens].find((m) => !m[0].startsWith('<!') && !m[0].startsWith('<?'))?.[0]
  if (!opening || opening.length > 65536) fail()
  const name = /^<([^\s/>]+)/.exec(opening)![1]!
  const root = xmlTree(opening.endsWith('/>') ? opening : opening + `</${name}>`, true)
  if (!word(root) || root.local !== 'document') fail()
  return `<w:settings xmlns:w="${root.ns}"/>`
}
export type DocxRestrictionMode = 'readOnly' | 'comments' | 'forms' | 'trackedChanges'
export type DocxPasswordIntent =
  | { action: 'preserve' | 'clear' }
  | { action: 'replace'; password: string }
export interface DocxProtectionSettingsInput {
  enabled: boolean
  mode: DocxRestrictionMode
  restrictionPassword: DocxPasswordIntent
  modificationPassword: DocxPasswordIntent
  recommended: boolean
  currentRestrictionPassword?: string
}
export interface PreparedDocxSettings {
  enabled: boolean
  mode: DocxRestrictionMode
  restrictionPassword: 'preserve' | 'clear' | DocxPasswordCredential
  modificationPassword: 'preserve' | 'clear' | DocxPasswordCredential
  recommended: boolean
}
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
type Patch = { start: number; end: number; value: string }
function patches(xml: string, list: Patch[]) {
  for (const p of list.toSorted((a, b) => b.start - a.start))
    xml = xml.slice(0, p.start) + p.value + xml.slice(p.end)
  return xml
}
const credentialKeys = [
  'hash',
  'salt',
  'cryptAlgorithmSid',
  'cryptSpinCount',
  'cryptProviderType',
  'cryptAlgorithmClass',
  'cryptAlgorithmType',
]
function credentialAttrs(value: DocxPasswordCredential) {
  return {
    hash: value.hash,
    salt: value.salt,
    cryptAlgorithmSid: '14',
    cryptSpinCount: String(value.spinCount),
    cryptProviderType: 'rsaAES',
    cryptAlgorithmClass: 'hash',
    cryptAlgorithmType: 'typeAny',
  }
}
/** Only actual Word namespace attributes are touched; other native spans remain byte exact. */
export function patchDocxProtectionSettings(
  original: string | null,
  settings: PreparedDocxSettings,
): string {
  const xml = original ?? `<w:settings xmlns:w="${W}"/>`,
    root = xmlTree(xml, true)
  if (!word(root) || root.local !== 'settings') fail()
  const list: Patch[] = []
  const update = (name: string, values: Record<string, string | null>, needed: boolean) => {
    const nodes = root.children.filter((n) => word(n) && n.local === name)
    if (nodes.length > 1) fail()
    const node = nodes[0]
    if (!needed) {
      if (node) list.push({ start: node.start, end: node.end, value: '' })
      return
    }
    const ns = node?.ns ?? root.ns
    const bindings = node?.namespaces ?? root.namespaces
    let prefix = Object.keys(bindings).find((key) => key && bindings[key] === ns)
    let declaration = ''
    if (!prefix) {
      prefix = 'mimirW'
      let n = 0
      while (bindings[prefix]) prefix = `mimirW${++n}`
      declaration = ` xmlns:${prefix}="${ns}"`
    }
    if (!node) {
      const attrs = Object.entries(values)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => ` ${prefix}:${k}="${escape(v!)}"`)
        .join('')
      const value = `<${prefix}:${name}${declaration}${attrs}/>`
      if (xml.slice(root.start, root.openEnd).endsWith('/>'))
        list.push({ start: root.openEnd - 2, end: root.openEnd, value: `>${value}</${root.name}>` })
      else list.push({ start: root.closeStart, end: root.closeStart, value })
      return
    }
    let addition = declaration
    for (const [key, value] of Object.entries(values)) {
      const matches = node.attrs.filter((a) => a.local === key && a.ns === ns)
      if (matches.length > 1) fail()
      const a = matches[0]
      if (a) {
        if (value === null) list.push({ start: a.start, end: a.end, value: '' })
        else if (a.value !== value)
          list.push({ start: a.start, end: a.end, value: `${a.name}="${escape(value)}"` })
      } else if (value !== null) addition += ` ${prefix}:${key}="${escape(value)}"`
    }
    if (addition) {
      const at = node.openEnd - (xml.slice(node.start, node.openEnd).endsWith('/>') ? 2 : 1)
      list.push({ start: at, end: at, value: addition })
    }
  }
  const fields = (intent: PreparedDocxSettings['restrictionPassword']) =>
    intent === 'preserve' ? {} : Object.fromEntries(credentialKeys.map((k) => [k, null]))
  const docFields: Record<string, string | null> = {
    edit: settings.mode,
    enforcement: '1',
    ...fields(settings.restrictionPassword),
  }
  if (typeof settings.restrictionPassword === 'object')
    Object.assign(docFields, credentialAttrs(settings.restrictionPassword))
  const existingWrite = root.children.find((n) => word(n) && n.local === 'writeProtection')
  const previousRecommended = existingWrite?.attrs.find(
    (a) => a.ns === existingWrite.ns && a.local === 'recommended',
  )?.value
  const recommendationChanged =
    settings.recommended !== ['1', 'true', 'on'].includes(previousRecommended ?? '')
  const writeFields: Record<string, string | null> = {
    ...(recommendationChanged ? { recommended: settings.recommended ? '1' : '0' } : {}),
    ...fields(settings.modificationPassword),
  }
  if (typeof settings.modificationPassword === 'object')
    Object.assign(writeFields, credentialAttrs(settings.modificationPassword))
  const preservedPassword = !!existingWrite?.attrs.some(
    (a) => word(existingWrite) && a.ns === existingWrite.ns && credentialKeys.includes(a.local),
  )
  update('documentProtection', docFields, settings.enabled)
  update(
    'writeProtection',
    writeFields,
    settings.recommended ||
      typeof settings.modificationPassword === 'object' ||
      (settings.modificationPassword === 'preserve' &&
        (preservedPassword || (!!existingWrite && !recommendationChanged))),
  )
  // Multiple additions to a self-closing root must be coalesced, preserving a single valid closing tag.
  if (list.filter((p) => p.start === root.openEnd - 2 && p.end === root.openEnd).length > 1) {
    const adds = list.filter((p) => p.start === root.openEnd - 2 && p.end === root.openEnd)
    const content = adds.map((p) => p.value.slice(1, -`</${root.name}>`.length)).join('')
    for (const p of adds) list.splice(list.indexOf(p), 1)
    list.push({ start: root.openEnd - 2, end: root.openEnd, value: `>${content}</${root.name}>` })
  }
  const result = patches(xml, list)
  xmlTree(result, true)
  return result
}
function append(xml: string, root: Element, value: string) {
  return xml.slice(root.start, root.openEnd).endsWith('/>')
    ? xml.slice(0, root.openEnd - 2) + `>${value}</${root.name}>` + xml.slice(root.openEnd)
    : xml.slice(0, root.closeStart) + value + xml.slice(root.closeStart)
}
/** Merge just the authorized protection nodes into the content writer's current settings shell. */
function mergeSettingsShell(
  current: string | null,
  baseline: string | null,
  candidate: string,
): string {
  if (current === baseline || !current) return candidate
  const root = xmlTree(current, true),
    nextRoot = xmlTree(candidate, true),
    oldRoot = baseline ? xmlTree(baseline, true) : null
  if (!word(root) || root.local !== 'settings') fail()
  const changes: Patch[] = []
  for (const name of ['documentProtection', 'writeProtection']) {
    const find = (n: Element | null) => n?.children.find((c) => word(c) && c.local === name)
    const before = find(oldRoot),
      after = find(nextRoot),
      target = find(root)
    const oldRaw = before ? baseline!.slice(before.start, before.end) : '',
      nextRaw = after ? candidate.slice(after.start, after.end) : ''
    if (oldRaw === nextRaw) continue
    let raw = nextRaw
    if (after) {
      let declarations = ''
      const opening = raw.slice(0, after.openEnd - after.start)
      const locallyDeclared = new Set(
        [...opening.matchAll(/\sxmlns(?::([\w:.-]+))?\s*=/g)].map((m) => m[1] ?? ''),
      )
      const usedPrefixes = new Set(
        [after.name, ...after.attrs.map((a) => a.name)].map((qualified) =>
          qualified.includes(':') ? qualified.slice(0, qualified.indexOf(':')) : '',
        ),
      )
      for (const prefix of usedPrefixes) {
        const ns = after.namespaces[prefix]
        if (
          prefix === 'xml' ||
          !ns ||
          root.namespaces[prefix] === ns ||
          locallyDeclared.has(prefix)
        )
          continue
        declarations += ` xmlns${prefix ? ':' + prefix : ''}="${escape(ns)}"`
      }
      if (declarations) {
        const pos =
          after.openEnd -
          after.start -
          (raw.slice(0, after.openEnd - after.start).endsWith('/>') ? 2 : 1)
        raw = raw.slice(0, pos) + declarations + raw.slice(pos)
      }
    }
    if (target) changes.push({ start: target.start, end: target.end, value: raw })
    else if (raw) {
      if (current.slice(root.start, root.openEnd).endsWith('/>')) return candidate
      changes.push({ start: root.closeStart, end: root.closeStart, value: raw })
    }
  }
  const result = patches(current, changes)
  xmlTree(result, true)
  return result
}
const get = (n: Element, key: string) => n.attrs.find((a) => a.ns === '' && a.local === key)?.value
/** Called only with the controller's private candidate, after native content serialization. */
export async function saveDocxProtectionSettings(
  bytes: Uint8Array,
  path: string,
  settingsXml: string,
  baselineXml: string | null = null,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const relPath = 'word/_rels/document.xml.rels',
    relXml = (await zip.file(relPath)?.async('string')) ?? `<Relationships xmlns="${REL}"/>`
  const relRoot = xmlTree(relXml, true)
  if (relRoot.ns !== REL || relRoot.local !== 'Relationships') fail()
  const rels = relRoot.children.filter((n) => n.ns === REL && n.local === 'Relationship')
  if (
    rels.length !== relRoot.children.length ||
    new Set(rels.map((n) => get(n, 'Id'))).size !== rels.length
  )
    fail()
  const existing = rels.filter((n) => get(n, 'Type')?.endsWith('/settings'))
  if (existing.length > 1) fail()
  if (!existing.length) {
    let id = 'mimirSettings',
      n = 0
    while (rels.some((r) => get(r, 'Id') === id)) id = `mimirSettings${++n}`
    const prefix = relRoot.name.includes(':')
      ? relRoot.name.slice(0, relRoot.name.indexOf(':') + 1)
      : ''
    zip.file(
      relPath,
      append(
        relXml,
        relRoot,
        `<${prefix}Relationship Id="${id}" Type="${xmlTree(settingsXml, true).ns === WS ? 'http://purl.oclc.org/ooxml/officeDocument/relationships/settings' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings'}" Target="/${escape(path)}"/>`,
      ),
    )
  }
  const ctXml = await zip.file('[Content_Types].xml')?.async('string')
  if (!ctXml) fail()
  const ctRoot = xmlTree(ctXml, true)
  if (ctRoot.ns !== CT || ctRoot.local !== 'Types') fail()
  const overrides = ctRoot.children.filter(
    (n) => n.ns === CT && n.local === 'Override' && get(n, 'PartName') === `/${path}`,
  )
  if (overrides.length > 1) fail()
  const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'
  if (overrides[0] && get(overrides[0], 'ContentType') !== contentType) fail()
  if (!overrides.length) {
    const prefix = ctRoot.name.includes(':')
      ? ctRoot.name.slice(0, ctRoot.name.indexOf(':') + 1)
      : ''
    zip.file(
      '[Content_Types].xml',
      append(
        ctXml,
        ctRoot,
        `<${prefix}Override PartName="/${escape(path)}" ContentType="${contentType}"/>`,
      ),
    )
  }
  const currentXml = (await zip.file(path)?.async('string')) ?? null
  zip.file(path, mergeSettingsShell(currentXml, baselineXml, settingsXml))
  return zip.generateAsync({ type: 'uint8array' })
}
