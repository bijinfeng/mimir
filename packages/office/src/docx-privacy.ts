import JSZip from 'jszip'
import { XMLValidator } from 'fast-xml-parser'
import { BoundedZip } from './zip-bounds.js'

const W = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
])
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CORE = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
const DC = 'http://purl.org/dc/elements/1.1/'
const APP = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  'http://purl.oclc.org/ooxml/officeDocument/extendedProperties',
])
const PEOPLE = 'http://schemas.microsoft.com/office/word/2012/wordml'
const OFFICE_REL = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/',
]
const STORY = new Set(['header', 'footer', 'footnotes', 'endnotes', 'comments', 'glossaryDocument'])
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
interface Attribute {
  name: string
  ns: string
  local: string
  value: string
  valueStart: number
  valueEnd: number
}
interface Element {
  name: string
  ns: string
  local: string
  start: number
  openEnd: number
  closeStart: number
  end: number
  namespaces: Map<string, string>
  attrs: Attribute[]
  children: Element[]
  selfClosing: boolean
}
interface Patch {
  start: number
  end: number
  value: string
}
function fail(): never {
  throw new Error('文档个人信息结构无法安全清理，原件保持不变')
}
const local = (name: string) => name.slice(name.indexOf(':') + 1)
const namespace = (name: string, bindings: Map<string, string>, attribute = false) =>
  name.includes(':')
    ? bindings.get(name.slice(0, name.indexOf(':')))
    : attribute
      ? ''
      : (bindings.get('') ?? '')
const attr = (node: Element, name: string, ns = '') =>
  node.attrs.find((a) => a.local === name && a.ns === ns)?.value
const all = (node: Element): Element[] => [node, ...node.children.flatMap(all)]
const officeType = (type: string, name: string) =>
  OFFICE_REL.some((prefix) => type === prefix + name)

/** XML 1.0 Char: numeric references must satisfy the same range as literal text. */
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
function validateCharacters(value: string): void {
  for (const char of value) if (!xmlChar(char.codePointAt(0)!)) fail()
}
const predefined = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
])
/** Called only for literal attribute/text spans, never CDATA, comments or PI.
 * No DTD is allowed, so only the five predefined entities and numeric refs exist.
 */
function decodeXml(value: string): string {
  let cursor = 0,
    result = ''
  for (;;) {
    const start = value.indexOf('&', cursor)
    if (start < 0) return result + value.slice(cursor)
    const end = value.indexOf(';', start + 1)
    if (end < 0) fail()
    const reference = value.slice(start + 1, end)
    let decoded = predefined.get(reference)
    if (decoded === undefined) {
      const numeric = /^#(?:([0-9]+)|x([0-9a-fA-F]+))$/.exec(reference)
      if (!numeric) fail()
      const code = Number.parseInt(numeric[1] ?? numeric[2]!, numeric[1] === undefined ? 16 : 10)
      if (!xmlChar(code)) fail()
      decoded = String.fromCodePoint(code)
    }
    result += value.slice(cursor, start) + decoded
    cursor = end + 1
  }
}

/** Private bounded scanner: retain original offsets, resolve each element's lexical scope. */
function tree(xml: string): Element {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    fail()
  validateCharacters(xml)
  const roots: Element[] = [],
    stack: Element[] = []
  const tokens =
    /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/[\w:.-]+\s*>|<[\w:.-]+(?:\s+(?:"[^"]*"|'[^']*'|[^<>"'])*)?\s*\/?>/g
  let cursor = 0,
    count = 0,
    match: RegExpExecArray | null
  while ((match = tokens.exec(xml))) {
    const token = match[0],
      gap = xml.slice(cursor, match.index)
    if (gap.includes('<') || gap.includes(']]>') || (!stack.length && gap.trim())) fail()
    decodeXml(gap)
    cursor = tokens.lastIndex
    if (token.startsWith('<!--') || token.startsWith('<?')) continue
    if (token.startsWith('<![CDATA[')) {
      if (!stack.length) fail()
      continue
    }
    if (token.startsWith('</')) {
      const node = stack.pop()
      if (!node || token.slice(2, -1).trim() !== node.name) fail()
      node.closeStart = match.index
      node.end = cursor
      continue
    }
    if (++count > 100_000 || stack.length >= 64) fail()
    const name = /^<([^\s/>]+)/.exec(token)![1]!
    if (!/^(?:[\w.-]+:)?[\w.-]+$/.test(name)) fail()
    const bindings = new Map(
      stack.at(-1)?.namespaces ?? [['xml', 'http://www.w3.org/XML/1998/namespace']],
    )
    const raw = [...token.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)]
    for (const a of raw) {
      if (a[3]!.includes('<')) fail()
      const key = a[1]!,
        value = decodeXml(a[3]!)
      if (!/^(?:[\w.-]+:)?[\w.-]+$/.test(key)) fail()
      if (key === 'xmlns' || key.startsWith('xmlns:')) {
        const prefix = key === 'xmlns' ? '' : key.slice(6)
        if (
          prefix === 'xmlns' ||
          (prefix && !value) ||
          value === 'http://www.w3.org/2000/xmlns/' ||
          (prefix === 'xml') !== (value === 'http://www.w3.org/XML/1998/namespace')
        )
          fail()
        bindings.set(prefix, value)
      }
    }
    const attrs = raw
      .filter((a) => a[1] !== 'xmlns' && !a[1]!.startsWith('xmlns:'))
      .map((a) => {
        const offset = a[0].indexOf(a[2]!) + 1
        return {
          name: a[1]!,
          ns: namespace(a[1]!, bindings, true)!,
          local: local(a[1]!),
          value: decodeXml(a[3]!),
          valueStart: match!.index + a.index! + offset,
          valueEnd: match!.index + a.index! + offset + a[3]!.length,
        }
      })
    if (
      attrs.some((a) => a.ns === undefined) ||
      new Set(attrs.map((a) => `${a.ns}|${a.local}`)).size !== attrs.length
    )
      fail()
    const ns = namespace(name, bindings)
    if (ns === undefined) fail()
    const node: Element = {
      name,
      ns,
      local: local(name),
      start: match.index,
      openEnd: cursor,
      closeStart: cursor,
      end: cursor,
      namespaces: bindings,
      attrs,
      children: [],
      selfClosing: token.endsWith('/>'),
    }
    if (stack.length) stack.at(-1)!.children.push(node)
    else roots.push(node)
    if (roots.length > 1) fail()
    if (!node.selfClosing) stack.push(node)
  }
  if (stack.length || roots.length !== 1 || xml.slice(cursor).trim()) fail()
  return roots[0]!
}
function patch(xml: string, changes: Patch[]): string {
  let last = xml.length
  for (const item of changes.toSorted((a, b) => b.start - a.start)) {
    if (item.end > last || item.start > item.end) fail()
    xml = xml.slice(0, item.start) + item.value + xml.slice(item.end)
    last = item.start
  }
  return xml
}
const unsafePath = (value: string) =>
  /[\\?#<>"'&]/.test(value) || [...value].some((char) => char.charCodeAt(0) <= 32)
function resolve(source: string, target: string): string {
  if (!target || unsafePath(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) fail()
  let decoded: string
  try {
    decoded = decodeURIComponent(target)
  } catch {
    fail()
  }
  if (unsafePath(decoded)) fail()
  const pathSegments = target.startsWith('/') ? [] : source.split('/').slice(0, -1)
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!pathSegments.length) fail()
      pathSegments.pop()
    } else pathSegments.push(segment)
  }
  if (!pathSegments.length) fail()
  return pathSegments.join('/')
}
const relsPath = (source: string) =>
  source ? source.replace(/(^|\/)([^/]+)$/, '$1_rels/$2.rels') : '_rels/.rels'
interface Relationship {
  type: string
  target: string
  external: boolean
}
interface PackageParts {
  archive: BoundedZip
  read(path: string): Promise<string>
  relationships(source: string): Promise<Relationship[]>
}
async function parts(bytes: Uint8Array): Promise<PackageParts> {
  const archive = await BoundedZip.open(bytes)
  let total = 0
  const cache = new Map<string, string>()
  const read = async (path: string) => {
    const cached = cache.get(path)
    if (cached !== undefined) return cached
    const data = await archive.read(path)
    if (
      !data ||
      data.length > 2_000_000 ||
      (total += data.length) > 16_000_000 ||
      cache.size >= 256
    )
      fail()
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data)
    } catch {
      fail()
    }
    cache.set(path, text)
    return text
  }
  const relationships = async (source: string) => {
    const path = relsPath(source)
    if (!archive.list().includes(path)) return []
    const root = tree(await read(path))
    if (root.ns !== REL || root.local !== 'Relationships') fail()
    const ids = new Set<string>()
    return root.children.map((node) => {
      if (node.ns !== REL || node.local !== 'Relationship' || node.children.length) fail()
      const id = attr(node, 'Id'),
        type = attr(node, 'Type'),
        target = attr(node, 'Target'),
        mode = attr(node, 'TargetMode')
      if (
        !id ||
        ids.has(id) ||
        !type ||
        !target ||
        (mode !== undefined && mode !== 'External' && mode !== 'Internal')
      )
        fail()
      ids.add(id)
      return { type, target, external: mode === 'External' }
    })
  }
  return { archive, read, relationships }
}
/** Read only the actual direct Word setting; parsed/public flags are not authoritative. */
export function nativeDocxPrivacyEnabled(settingsXml: string | null): boolean {
  return settingsXml === null ? false : privacyFlag(tree(settingsXml))
}
function privacyFlag(root: Element): boolean {
  if (!W.has(root.ns) || root.local !== 'settings') fail()
  const nodes = root.children.filter((n) => W.has(n.ns) && n.local === 'removePersonalInformation')
  if (nodes.length > 1) fail()
  const node = nodes[0]
  if (!node) return false
  const value = attr(node, 'val', node.ns)
  if (
    node.children.length ||
    (value !== undefined && !['1', 'true', 'on', '0', 'false', 'off'].includes(value))
  )
    fail()
  return value === undefined || ['1', 'true', 'on'].includes(value)
}
function flagPatch(xml: string, root: Element, enabled: boolean): string {
  if (privacyFlag(root) === enabled) return xml
  const node = root.children.find((n) => W.has(n.ns) && n.local === 'removePersonalInformation')
  if (!enabled) return patch(xml, [{ start: node!.start, end: node!.end, value: '' }])
  if (node) {
    const value = node.attrs.find((a) => a.ns === node.ns && a.local === 'val')!
    return patch(xml, [{ start: value.valueStart, end: value.valueEnd, value: '1' }])
  }
  const prefix = [...root.namespaces].find(([key, value]) => key && value === root.ns)?.[0]
  const name = prefix ? `${prefix}:removePersonalInformation` : 'removePersonalInformation'
  const insert = `<${name}/>`
  return root.selfClosing
    ? xml.slice(0, root.openEnd - 2) + `>${insert}</${root.name}>` + xml.slice(root.end)
    : patch(xml, [{ start: root.openEnd, end: root.openEnd, value: insert }])
}
function scrub(xml: string, kind: 'story' | 'core' | 'app' | 'people'): string {
  const root = tree(xml),
    changes: Patch[] = []
  if (
    (kind === 'core' && (root.ns !== CORE || root.local !== 'coreProperties')) ||
    (kind === 'app' && (!APP.has(root.ns) || root.local !== 'Properties')) ||
    (kind === 'people' && (root.ns !== PEOPLE || root.local !== 'people')) ||
    (kind === 'story' &&
      (!W.has(root.ns) ||
        ![
          'document',
          'hdr',
          'ftr',
          'footnotes',
          'endnotes',
          'comments',
          'glossaryDocument',
        ].includes(root.local)))
  )
    fail()
  if (kind === 'story') {
    for (const node of all(root))
      for (const a of node.attrs) {
        const replacement =
          a.local === 'author' ? 'Author' : a.local === 'initials' ? 'A' : undefined
        if (W.has(a.ns) && replacement && a.value !== replacement)
          changes.push({ start: a.valueStart, end: a.valueEnd, value: replacement })
      }
  } else if (kind === 'people') {
    for (const node of root.children)
      if (node.ns === PEOPLE && node.local === 'person')
        changes.push({ start: node.start, end: node.end, value: '' })
  } else {
    for (const node of root.children) {
      const clear =
        kind === 'core'
          ? (node.ns === DC && node.local === 'creator') ||
            (node.ns === CORE && node.local === 'lastModifiedBy')
          : APP.has(node.ns) && ['Manager', 'Company'].includes(node.local)
      if (clear && !node.selfClosing && node.openEnd !== node.closeStart) {
        // Identity properties are simple values. Preserve opaque child structures by refusing.
        if (node.children.length) fail()
        changes.push({ start: node.openEnd, end: node.closeStart, value: '' })
      }
    }
  }
  return patch(xml, changes)
}

async function locatePrivacy(pkg: PackageParts) {
  const rootRels = await pkg.relationships('')
  const main = rootRels.filter((r) => officeType(r.type, 'officeDocument'))
  if (main.length !== 1 || main[0]!.external) fail()
  const documentPath = resolve('', main[0]!.target)
  const docRels = await pkg.relationships(documentPath)
  const settings = docRels.filter((r) => officeType(r.type, 'settings'))
  if (settings.length > 1 || settings[0]?.external) fail()
  const settingsPath = settings[0] ? resolve(documentPath, settings[0].target) : null
  const settingsXml = settingsPath ? await pkg.read(settingsPath) : null
  const nativeEnabled = settingsXml === null ? false : privacyFlag(tree(settingsXml))
  return { rootRels, documentPath, settingsPath, settingsXml, nativeEnabled }
}
/** Resolve original source independently of the public parser and protection UI helpers.
 * Legacy files with no root relationships and no enabled conventional privacy flag
 * retain their existing no-privacy save path. A possibly enabled orphan is refused.
 */
export async function readNativeDocxPrivacyEnabled(bytes: Uint8Array): Promise<boolean> {
  const pkg = await parts(bytes)
  if (!pkg.archive.list().includes('_rels/.rels')) {
    if (
      pkg.archive.list().includes('word/settings.xml') &&
      nativeDocxPrivacyEnabled(await pkg.read('word/settings.xml'))
    )
      fail()
    return false
  }
  return (await locatePrivacy(pkg)).nativeEnabled
}

/** Final package privacy pass. Undefined intent follows the actual native settings flag.
 * Does not remove names in body text, custom data, arbitrary extensions or binaries.
 * Returns the exact input object when neither flag nor targeted metadata changes.
 */
export async function finalizeDocxPrivacy(
  bytes: Uint8Array,
  intent?: boolean,
  forceMetadata = false,
): Promise<Uint8Array> {
  const pkg = await parts(bytes)
  const { rootRels, documentPath, settingsPath, settingsXml, nativeEnabled } =
    await locatePrivacy(pkg)
  const enabled = intent ?? nativeEnabled
  if (intent !== undefined && typeof intent !== 'boolean') fail()
  if (!enabled && intent === undefined && !forceMetadata) return bytes
  const changed = new Map<string, string>()
  if (settingsXml !== null && intent !== undefined) {
    const after = flagPatch(settingsXml, tree(settingsXml), intent)
    if (after !== settingsXml) changed.set(settingsPath!, after)
  } else if (settingsXml === null && enabled) {
    // Do not guess or overwrite a colliding settings part. Creation is an atomic package patch.
    const mainRoot = tree(await pkg.read(documentPath))
    if (!W.has(mainRoot.ns) || mainRoot.local !== 'document') fail()
    let path = documentPath.replace(/[^/]+$/, 'mimir-privacy-settings.xml'),
      sequence = 0
    while (pkg.archive.list().includes(path))
      path = documentPath.replace(/[^/]+$/, `mimir-privacy-settings-${++sequence}.xml`)
    changed.set(
      path,
      `<w:settings xmlns:w="${mainRoot.ns}"><w:removePersonalInformation/></w:settings>`,
    )
    const relPath = relsPath(documentPath),
      existing = pkg.archive.list().includes(relPath)
        ? await pkg.read(relPath)
        : `<Relationships xmlns="${REL}"/>`
    const relRoot = tree(existing),
      ids = new Set(relRoot.children.map((n) => attr(n, 'Id')))
    let id = 'mimirPrivacySettings',
      n = 0
    while (ids.has(id)) id = `mimirPrivacySettings${++n}`
    const prefix = relRoot.name.includes(':') ? relRoot.name.split(':')[0] + ':' : ''
    const target = path.split('/').at(-1)!
    const relation = `<${prefix}Relationship Id="${id}" Type="${OFFICE_REL[W.has(mainRoot.ns) && mainRoot.ns.startsWith('http://purl.') ? 1 : 0]}settings" Target="${target}"/>`
    changed.set(relPath, insertChild(existing, relRoot, relation))
    const typesXml = await pkg.read('[Content_Types].xml'),
      typesRoot = tree(typesXml)
    if (
      typesRoot.ns !== CT ||
      typesRoot.local !== 'Types' ||
      typesRoot.children.some(
        (node) =>
          node.ns === CT && node.local === 'Override' && attr(node, 'PartName') === `/${path}`,
      )
    )
      fail()
    const ctPrefix = typesRoot.name.includes(':') ? typesRoot.name.split(':')[0] + ':' : ''
    changed.set(
      '[Content_Types].xml',
      insertChild(
        typesXml,
        typesRoot,
        `<${ctPrefix}Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`,
      ),
    )
  }
  if (enabled || forceMetadata) {
    const targets = new Map<string, 'story' | 'core' | 'app' | 'people'>([[documentPath, 'story']])
    const add = (source: string, rel: Relationship, kind: 'story' | 'core' | 'app' | 'people') => {
      if (rel.external) fail()
      const path = resolve(source, rel.target),
        previous = targets.get(path)
      if (previous && previous !== kind) fail()
      targets.set(path, kind)
    }
    const propertyCounts = new Map<string, number>()
    for (const r of rootRels) {
      if (
        r.type === `${REL}/metadata/core-properties` ||
        officeType(r.type, 'extended-properties')
      ) {
        const key = officeType(r.type, 'extended-properties') ? 'app' : 'core'
        const count = (propertyCounts.get(key) ?? 0) + 1
        if (count > 1) fail()
        propertyCounts.set(key, count)
      }
      if (r.type === `${REL}/metadata/core-properties`) add('', r, 'core')
      if (officeType(r.type, 'extended-properties')) add('', r, 'app')
    }
    const visited = new Set<string>()
    for (const [path, kind] of targets) {
      if (targets.size > 256) fail()
      if (kind !== 'story' || visited.has(path)) continue
      visited.add(path)
      for (const r of await pkg.relationships(path)) {
        if ([...STORY].some((name) => officeType(r.type, name))) add(path, r, 'story')
        if (r.type === 'http://schemas.microsoft.com/office/2011/relationships/people')
          add(path, r, 'people')
      }
    }
    for (const [path, kind] of targets) {
      const before = await pkg.read(path),
        after = scrub(before, kind)
      if (after !== before) changed.set(path, after)
    }
  }
  if (!changed.size) return bytes
  const zip = await JSZip.loadAsync(bytes)
  for (const [path, xml] of changed) zip.file(path, xml, { date: zip.file(path)?.date })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
function insertChild(xml: string, root: Element, child: string): string {
  return root.selfClosing
    ? xml.slice(0, root.openEnd - 2) + `>${child}</${root.name}>` + xml.slice(root.end)
    : patch(xml, [{ start: root.closeStart, end: root.closeStart, value: child }])
}
