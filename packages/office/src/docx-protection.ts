import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { getSchema } from '@tiptap/core'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { PmDocJson } from './docx.js'
import type { ProtectedComments, DocxCommentAccess } from './docx-protected-comments.js'
import type { CommentInfo } from '../vendor/packages/docx-engine/src/types.js'

const WORD_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
])
const MODES = new Set(['readOnly', 'comments', 'forms', 'trackedChanges'])
const MODE_LABELS: Record<string, string> = {
  readOnly: '只读',
  comments: '仅批注',
  forms: '仅填写表单',
  trackedChanges: '强制修订',
}
export interface NativeDocxProtection {
  readonly uncertain: boolean
  readonly mode: string | null
  readonly enforced: boolean
  readonly credentials: 'none' | 'sha512' | 'unsupported'
  readonly modificationPassword: boolean
  readonly recommended: boolean
  readonly reason: string | null
}
export interface DocxProtectionAccess {
  readonly writable: boolean
  readonly reason: string | null
  readonly epoch: number
  readonly recommendedChoice: boolean
  readonly commentsOnly: boolean
}
export interface DocxProtectionController {
  readonly native: NativeDocxProtection
  getAccess(): DocxProtectionAccess
  subscribe(listener: () => void): () => void
  continueRecommendedEditing(): void
  assertWrite(): void
  getCommentAccess(id: string): DocxCommentAccess
  readComments(): CommentInfo[] | null
  assertCommentMutation(edited: PmDocJson, options: SaveOptions): void
  assertSave(edited: PmDocJson, options: SaveOptions): void
}
type XmlNode = Record<string, unknown>
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
})
function local(name: string) {
  return name.slice(name.indexOf(':') + 1)
}
function namespace(name: string, ns: Record<string, string>) {
  return ns[name.includes(':') ? name.slice(0, name.indexOf(':')) : ''] ?? ''
}
function namespaces(node: XmlNode, parent: Record<string, string>) {
  const ns = { ...parent }
  for (const [key, value] of Object.entries((node[':@'] ?? {}) as Record<string, string>)) {
    if (key === '@_xmlns') ns[''] = value
    else if (key.startsWith('@_xmlns:')) ns[key.slice(8)] = value
  }
  return ns
}
function attributes(node: XmlNode, ns: Record<string, string>): Record<string, string> | null {
  const result: Record<string, string> = Object.create(null)
  for (const [raw, value] of Object.entries((node[':@'] ?? {}) as Record<string, string>)) {
    const key = raw.slice(2)
    if (key === 'xmlns' || key.startsWith('xmlns:')) continue
    // OOXML attributes are qualified. Unknown namespaces cannot grant permissions.
    if (!key.includes(':') || !WORD_NAMESPACES.has(namespace(key, ns))) return null
    if (Object.hasOwn(result, local(key))) return null
    result[local(key)] = value
  }
  return result
}
function onOff(value: string | undefined): boolean | null {
  if (value === undefined || value === '0' || value === 'false' || value === 'off') return false
  if (value === '1' || value === 'true' || value === 'on') return true
  return null
}
function base64Length(value: string | undefined): number | null {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    return null
  try {
    return atob(value).length
  } catch {
    return null
  }
}
function credentials(
  attrs: Record<string, string>,
  kind: 'documentProtection' | 'writeProtection',
): NativeDocxProtection['credentials'] {
  const switches =
    kind === 'documentProtection' ? ['edit', 'enforcement', 'formatting'] : ['recommended']
  const fields = Object.keys(attrs).filter((key) => !switches.includes(key))
  if (!fields.length) return 'none'
  if (
    fields.some(
      (key) =>
        ![
          'hash',
          'salt',
          'cryptProviderType',
          'cryptAlgorithmClass',
          'cryptAlgorithmType',
          'cryptAlgorithmSid',
          'cryptSpinCount',
        ].includes(key),
    )
  )
    return 'unsupported'
  if (
    attrs.cryptAlgorithmSid !== '14' ||
    base64Length(attrs.hash) !== 64 ||
    !base64Length(attrs.salt)
  )
    return 'unsupported'
  if (attrs.cryptProviderType !== undefined && attrs.cryptProviderType !== 'rsaAES')
    return 'unsupported'
  if (attrs.cryptAlgorithmClass !== undefined && attrs.cryptAlgorithmClass !== 'hash')
    return 'unsupported'
  if (attrs.cryptAlgorithmType !== undefined && attrs.cryptAlgorithmType !== 'typeAny')
    return 'unsupported'
  // Missing spin is allowed by this scheme; malformed/over-budget values never default or clamp.
  if (
    attrs.cryptSpinCount !== undefined &&
    (!/^\d+$/.test(attrs.cryptSpinCount) ||
      !Number.isSafeInteger(Number(attrs.cryptSpinCount)) ||
      Number(attrs.cryptSpinCount) > 1_000_000)
  )
    return 'unsupported'
  return 'sha512'
}
function containsProtection(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProtection)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, child]) =>
      ['documentProtection', 'writeProtection'].includes(local(key)) ||
      (key !== ':@' && containsProtection(child)),
  )
}
export function readNativeDocxProtection(xml: string | null): NativeDocxProtection {
  const empty: NativeDocxProtection = {
    uncertain: false,
    mode: null,
    enforced: false,
    credentials: 'none',
    modificationPassword: false,
    recommended: false,
    reason: null,
  }
  const unknown = (reason: string) => Object.freeze({ ...empty, uncertain: true, reason })
  if (xml === null) return Object.freeze(empty)
  if (
    xml.length > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    return unknown('保护设置无法可靠读取，当前仅只读保留原件')
  const roots = (parser.parse(xml) as XmlNode[]).filter((node) =>
    Object.keys(node).some((key) => key !== ':@' && !key.startsWith('?') && !key.startsWith('#')),
  )
  if (roots.length !== 1) return unknown('保护设置根节点异常，当前仅只读保留原件')
  const root = roots[0]!,
    ns = namespaces(root, {}),
    rootName = Object.keys(root).find((key) => key !== ':@')!
  if (local(rootName) !== 'settings' || !WORD_NAMESPACES.has(namespace(rootName, ns)))
    return unknown('保护设置命名空间不受支持，当前仅只读保留原件')
  const nodes: { name: string; attrs: Record<string, string> }[] = []
  for (const node of root[rootName] as XmlNode[]) {
    const name = Object.keys(node).find((key) => key !== ':@')
    if (!name) continue
    if (!['documentProtection', 'writeProtection'].includes(local(name))) {
      if (containsProtection(node[name])) return unknown('嵌套保护配置暂不支持，当前仅只读保留原件')
      continue
    }
    const childNs = namespaces(node, ns)
    const attrs = attributes(node, childNs)
    if (
      !WORD_NAMESPACES.has(namespace(name, childNs)) ||
      !attrs ||
      (node[name] as XmlNode[]).length
    )
      return unknown('保护节点含不受支持的配置，当前仅只读保留原件')
    if (nodes.some((item) => item.name === local(name)))
      return unknown('原件含重复保护节点，当前仅只读保留原件')
    nodes.push({ name: local(name), attrs })
  }
  const doc = nodes.find((node) => node.name === 'documentProtection')?.attrs
  const write = nodes.find((node) => node.name === 'writeProtection')?.attrs
  const enforced = doc ? onOff(doc.enforcement) : false
  const recommended = write ? onOff(write.recommended) : false
  if (enforced === null || recommended === null)
    return unknown('原件保护开关无法判定，当前仅只读保留原件')
  if (doc && onOff(doc.formatting) === null)
    return unknown('原件格式保护开关无法判定，当前仅只读保留原件')
  const docCredential = doc ? credentials(doc, 'documentProtection') : 'none',
    writeCredential = write ? credentials(write, 'writeProtection') : 'none'
  const credential =
    docCredential === 'unsupported' || writeCredential === 'unsupported'
      ? 'unsupported'
      : docCredential === 'sha512' || writeCredential === 'sha512'
        ? 'sha512'
        : 'none'
  const modificationPassword = writeCredential !== 'none'
  const mode = doc?.edit ?? null
  let reason: string | null = null
  if (doc && !MODES.has(mode ?? '') && !(mode === 'none' && !enforced))
    reason = '原件编辑限制类型无法可靠判定，当前仅只读保留'
  else if (credential === 'unsupported')
    reason = '原件包含旧式、未知或异常保护凭据，当前仅只读保留，不能移除保护'
  else if (write && !recommended && writeCredential === 'none')
    return unknown('修改保护配置无法可靠判定，当前仅只读保留原件')
  else if (modificationPassword) reason = '原件设有修改密码，本版本尚不支持核验，当前仅只读保留'
  else if (enforced && !MODES.has(mode ?? ''))
    reason = '原件启用了不受支持的编辑限制，当前仅只读保留'
  else if (enforced)
    reason =
      mode === 'readOnly'
        ? '原件已启用只读保护'
        : `原件已启用“${MODE_LABELS[mode!]}”；受限编辑尚未支持，当前仅只读保留`
  return Object.freeze({
    uncertain: false,
    mode,
    enforced,
    credentials: credential,
    modificationPassword,
    recommended: recommended === true,
    reason,
  })
}

let schema: ReturnType<typeof getSchema> | undefined
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
/** Mounting Tiptap adds schema defaults; only those and absent/null local attrs are ignored. */
function canonicalDoc(node: PmDocJson): unknown {
  schema ??= getSchema(editorExtensions)
  const spec = schema.nodes[node.type]?.spec ?? schema.marks[node.type]?.spec
  const defaults = Object.fromEntries(
    Object.entries(spec?.attrs ?? {}).map(([key, value]) => [key, value.default]),
  )
  const attrs = Object.fromEntries(
    Object.entries(node.attrs ?? {}).filter(
      ([key, value]) =>
        value !== null && value !== undefined && stable(value) !== stable(defaults?.[key]),
    ),
  )
  return {
    ...node,
    attrs: Object.keys(attrs).length ? attrs : undefined,
    content: node.content?.length ? node.content.map(canonicalDoc) : undefined,
    marks:
      Array.isArray(node.marks) && node.marks.length
        ? (node.marks as PmDocJson[]).map(canonicalDoc)
        : undefined,
  }
}
export function createDocxProtection(
  xml: string | null,
  original: PmDocJson,
  settingsPath = 'word/settings.xml',
  comments?: ProtectedComments,
): DocxProtectionController {
  const native = readNativeDocxProtection(xml)
  const commentMode =
    native.enforced &&
    native.mode === 'comments' &&
    !native.uncertain &&
    native.credentials !== 'unsupported' &&
    !native.modificationPassword
  const commentsOnly = commentMode && comments?.reason === null
  const baseline = stable(canonicalDoc(original))
  const listeners = new Set<() => void>()
  let epoch = 0,
    continued = false
  const access = (): DocxProtectionAccess =>
    Object.freeze({
      commentsOnly,
      writable: native.reason === null && (!native.recommended || continued),
      reason:
        (commentsOnly
          ? '原件仅批注：可编辑已有讨论；正文与批注锚点只读'
          : commentMode && comments?.reason
            ? '原件仅批注；已有讨论结构尚不支持安全修改，当前只读保留'
            : native.reason) ??
        (native.recommended && !continued ? '原件建议只读；可在“文档保护”中选择继续编辑' : null),
      epoch,
      recommendedChoice: native.reason === null && native.recommended && !continued,
    })
  let snapshot = access()
  const assertCommentMutation = (edited: PmDocJson, options: SaveOptions) => {
    if (!commentsOnly || !comments) throw new Error(snapshot.reason ?? '原件不允许编辑批注')
    if (baseline !== stable(canonicalDoc(edited)))
      throw new Error('原件仅允许批注，正文与批注锚点不能修改')
    if (Object.entries(options).some(([key, value]) => key !== 'comments' && value !== undefined))
      throw new Error('原件仅允许已有批注修改，不能修改其他附加结构')
    if (options.comments !== undefined) comments.validate(options.comments)
  }
  return Object.freeze({
    native,
    readComments: () =>
      commentsOnly && comments ? (structuredClone(comments.comments) as CommentInfo[]) : null,
    getCommentAccess(id: string): DocxCommentAccess {
      if (snapshot.writable)
        return Object.freeze({
          editText: null,
          reply: null,
          resolve: null,
          reopen: null,
          add: null,
          delete: null,
        })
      if (commentsOnly && comments) return comments.access(id)
      return Object.freeze({
        editText: snapshot.reason,
        reply: snapshot.reason,
        resolve: snapshot.reason,
        reopen: snapshot.reason,
        add: snapshot.reason,
        delete: snapshot.reason,
      })
    },
    assertCommentMutation,
    getAccess: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    continueRecommendedEditing() {
      if (!snapshot.recommendedChoice) throw new Error('当前原件不允许通过建议只读选择解除编辑限制')
      continued = true
      epoch++
      snapshot = access()
      listeners.forEach((listener) => listener())
    },
    assertWrite() {
      if (!snapshot.writable) throw new Error(snapshot.reason ?? '原件受保护，不能修改')
    },
    assertSave(edited: PmDocJson, options: SaveOptions) {
      if (
        options.protection !== undefined ||
        options.writeProtection !== undefined ||
        [...Object.keys(options.partXml ?? {}), ...Object.keys(options.partBinary ?? {})].some(
          (path) =>
            [
              settingsPath,
              'word/settings.xml',
              'word/_rels/document.xml.rels',
              '[Content_Types].xml',
            ].includes(normalizePartPath(path)),
        )
      )
        throw new Error('当前版本不支持修改或覆盖原件保护设置')
      if (commentsOnly) {
        assertCommentMutation(edited, options)
        return
      }
      if (
        !snapshot.writable &&
        (baseline !== stable(canonicalDoc(edited)) ||
          Object.values(options).some((value) => value !== undefined))
      )
        throw new Error(snapshot.reason ?? '原件受保护，不能保存修改')
    },
  })
}

function normalizePartPath(path: string): string {
  const parts: string[] = []
  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (segment === '..') parts.pop()
    else if (segment && segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}
/** Respect the package relationship; a missing/ambiguous target is not “unprotected”. */
export async function readDocxProtectionSettings(
  archive: import('./zip-bounds.js').BoundedZip,
): Promise<{ xml: string | null; path: string }> {
  const fallback = { xml: await archive.readText('word/settings.xml'), path: 'word/settings.xml' }
  const unreadable = { xml: '<unreadable', path: 'word/settings.xml' }
  const xml = await archive.readText('word/_rels/document.xml.rels')
  if (xml === null) return fallback
  if (
    xml.length > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    return unreadable
  const roots = (parser.parse(xml) as XmlNode[]).filter((node) =>
    Object.keys(node).some((key) => key !== ':@' && !key.startsWith('?') && !key.startsWith('#')),
  )
  if (roots.length !== 1) return unreadable
  const root = roots[0]!,
    ns = namespaces(root, {}),
    name = Object.keys(root).find((key) => key !== ':@')!
  const packageNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships'
  if (local(name) !== 'Relationships' || namespace(name, ns) !== packageNamespace) return unreadable
  const relations: Record<string, string>[] = []
  const ids = new Set<string>()
  for (const node of root[name] as XmlNode[]) {
    const child = Object.keys(node).find((key) => key !== ':@')
    if (!child || child.startsWith('#')) continue
    if (
      local(child) !== 'Relationship' ||
      namespace(child, namespaces(node, ns)) !== packageNamespace ||
      (node[child] as XmlNode[]).length
    )
      return unreadable
    const attrs: Record<string, string> = {}
    for (const [raw, value] of Object.entries((node[':@'] ?? {}) as Record<string, string>)) {
      const key = raw.slice(2)
      if (key === 'xmlns' || key.startsWith('xmlns:')) continue
      if (!['Id', 'Type', 'Target', 'TargetMode'].includes(key)) return unreadable
      attrs[key] = value
    }
    if (!attrs.Id || ids.has(attrs.Id) || !attrs.Type || !attrs.Target) return unreadable
    ids.add(attrs.Id)
    relations.push(attrs)
  }
  const settings = relations.filter((relation) => relation.Type!.endsWith('/settings'))
  if (!settings.length) return fallback
  if (
    settings.length !== 1 ||
    ![
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
      'http://purl.oclc.org/ooxml/officeDocument/relationships/settings',
    ].includes(settings[0]!.Type!) ||
    (settings[0]!.TargetMode !== undefined && settings[0]!.TargetMode !== 'Internal')
  )
    return unreadable
  const target = settings[0]!.Target!
  if (target.includes('\\') || target.includes('%') || target.includes('?') || target.includes('#'))
    return unreadable
  const parts = target.startsWith('/') ? [] : ['word']
  for (const segment of target.split('/')) {
    if (segment === '..') {
      if (!parts.length) return unreadable
      parts.pop()
    } else if (segment && segment !== '.') parts.push(segment)
  }
  const path = parts.join('/')
  return { path, xml: (await archive.readText(path)) ?? unreadable.xml }
}
