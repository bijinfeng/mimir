import { DOCX_ENCRYPTION_ATTR, isDocxEncryptionToken } from './docx-encryption-state.js'
import { DOCX_PRIVACY_ATTR } from './docx-privacy-state.js'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { createForcedTrackingPolicy } from './docx-forced-tracking.js'
import { getSchema } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { PmDocJson } from './docx.js'
import type { ProtectedComments, DocxCommentAccess } from './docx-protected-comments.js'
import type { ProtectedForms, DocxFormControl } from './docx-protected-forms.js'
import { createDocxPassword, verifyDocxModificationPassword } from './docx-protection-password.js'
import {
  DOCX_PASSWORD_DEFAULT_SPIN,
  validateDocxPasswordCredential,
  type DocxPasswordCredential,
} from './docx-protection-password-crypto.js'
import {
  patchDocxProtectionSettings,
  saveDocxProtectionSettings,
  type DocxProtectionSettingsInput,
} from './docx-protection-settings.js'
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
  readonly formsOnly: boolean
  readonly mandatoryTracking: boolean
  readonly modificationPasswordRequired: boolean
  readonly modificationUnlocked: boolean
}
export interface DocxProtectionController {
  readonly native: NativeDocxProtection
  getAccess(): DocxProtectionAccess
  subscribe(listener: () => void): () => void
  continueRecommendedEditing(): void
  verifyModificationPassword(password: string, signal?: AbortSignal): Promise<void>
  endModificationSession(): void
  hasSettingsHistory(): boolean
  settingsReason(): string | null
  restrictionPasswordRequired(): boolean
  applySettings(
    input: DocxProtectionSettingsInput,
    doc: PmDocJson,
    options: SaveOptions,
    publish: (token: string) => boolean,
    signal: AbortSignal,
  ): Promise<boolean>
  allowsSettingsTransaction(before: PmDocJson, after: PmDocJson): boolean
  activateSettingsDocument(doc: PmDocJson): void
  settingsBodySave(edited: PmDocJson, options: SaveOptions): boolean
  saveSettings(bytes: Uint8Array): Promise<Uint8Array>
  assertWrite(): void
  trackingPolicy(): ReturnType<typeof createForcedTrackingPolicy> | null
  getCommentAccess(id: string): DocxCommentAccess
  getCommentTargetReason(block: number): string | null
  readComments(): CommentInfo[] | null
  assertCommentMutation(edited: PmDocJson, options: SaveOptions): void
  allowsCommentTransaction(edited: PmDocJson): boolean
  runCommentTransaction(edited: PmDocJson, options: SaveOptions, publish: () => boolean): boolean
  formToggleText(id: string, edited: PmDocJson): string
  readFormControls(edited: PmDocJson): DocxFormControl[]
  allowsFormTransaction(edited: PmDocJson): boolean
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
  if (attrs.cryptAlgorithmSid !== '14') return 'unsupported'
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
  try {
    validateDocxPasswordCredential(privateCredential(attrs))
  } catch {
    return 'unsupported'
  }
  return 'sha512'
}
function privateCredential(attrs: Record<string, string>): DocxPasswordCredential {
  return Object.freeze({
    hash: attrs.hash!,
    salt: attrs.salt!,
    algorithmSid: 14,
    spinCount:
      attrs.cryptSpinCount === undefined
        ? DOCX_PASSWORD_DEFAULT_SPIN
        : Number(attrs.cryptSpinCount),
  })
}
const nativePrivate = new WeakMap<
  NativeDocxProtection,
  {
    document: DocxPasswordCredential | null
    write: DocxPasswordCredential | null
    restrictionReason: string | null
  }
>()
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
  else if (enforced && !MODES.has(mode ?? ''))
    reason = '原件启用了不受支持的编辑限制，当前仅只读保留'
  else if (enforced)
    reason =
      mode === 'readOnly'
        ? '原件已启用只读保护'
        : `原件已启用“${MODE_LABELS[mode!]}”；受限编辑尚未支持，当前仅只读保留`
  const restrictionReason = reason
  if (modificationPassword && credential !== 'unsupported' && reason === null)
    reason = '原件设有修改密码；验证后可在当前会话继续编辑'
  const result = Object.freeze({
    uncertain: false,
    mode,
    enforced,
    credentials: credential,
    modificationPassword,
    recommended: recommended === true,
    reason,
  })
  nativePrivate.set(result, {
    document: docCredential === 'sha512' ? privateCredential(doc!) : null,
    write: writeCredential === 'sha512' ? privateCredential(write!) : null,
    restrictionReason,
  })
  return result
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
        (node.type !== 'doc' || key !== 'mimirProtectionState') &&
        !(node.type === 'doc' && key === DOCX_PRIVACY_ATTR && typeof value === 'boolean') &&
        !(node.type === 'doc' && key === DOCX_ENCRYPTION_ATTR && isDocxEncryptionToken(value)) &&
        value !== null &&
        value !== undefined &&
        stable(value) !== stable(defaults?.[key]),
    ),
  )
  return {
    ...node,
    attrs: Object.keys(attrs).length ? attrs : undefined,
    content: node.content?.length ? node.content.map(canonicalDoc) : undefined,
    marks:
      Array.isArray(node.marks) && node.marks.length
        ? (node.marks as PmDocJson[])
            .toSorted(
              (a, b) =>
                Object.keys(schema!.marks).indexOf(a.type) -
                Object.keys(schema!.marks).indexOf(b.type),
            )
            .map(canonicalDoc)
        : undefined,
  }
}
function stripCommentMarks(node: ProseMirrorNode): ProseMirrorNode {
  const children: ProseMirrorNode[] = []
  node.content.forEach((child) => children.push(stripCommentMarks(child)))
  return node
    .copy(Fragment.fromArray(children))
    .mark(node.marks.filter((mark) => mark.type.name !== 'comment'))
}

/** Normalize split/merged text with the real schema while removing only comment marks. */
function commentBody(doc: PmDocJson): string {
  schema ??= getSchema(editorExtensions)
  // Keep raw unknown attrs/marks as an additional invariant: schema hydration
  // alone would silently drop a caller's forged unknown property.
  const rawStrip = (node: PmDocJson): PmDocJson => {
    const children: PmDocJson[] = []
    for (const child of node.content ?? []) {
      const next = rawStrip(child),
        prior = children.at(-1)
      if (
        prior?.type === 'text' &&
        next.type === 'text' &&
        stable({ ...prior, text: undefined }) === stable({ ...next, text: undefined })
      )
        prior.text = (prior.text ?? '') + (next.text ?? '')
      else children.push(next)
    }
    const marks = (node.marks as PmDocJson[] | undefined)?.filter((m) => m.type !== 'comment')
    return {
      ...node,
      content: children.length ? children : undefined,
      marks: marks?.length ? marks : undefined,
    }
  }
  const raw = rawStrip(canonicalDoc(doc) as PmDocJson)
  return stable({
    raw,
    normalized: canonicalDoc(stripCommentMarks(schema.nodeFromJSON(doc)).toJSON() as PmDocJson),
  })
}
/** Preserve unknown properties and normalize only adjacent equal marked text. */
function mergeFormText(node: PmDocJson): PmDocJson {
  const content: PmDocJson[] = []
  for (const child of node.content ?? []) {
    const next = mergeFormText(child),
      prior = content.at(-1)
    if (
      prior?.type === 'text' &&
      next.type === 'text' &&
      stable({ ...prior, text: undefined }) === stable({ ...next, text: undefined })
    )
      prior.text = (prior.text ?? '') + (next.text ?? '')
    else content.push(next)
  }
  return { ...node, content: content.length ? content : undefined }
}
export function canonicalFormDoc(doc: PmDocJson): unknown {
  return mergeFormText(canonicalDoc(doc) as PmDocJson)
}
export const docxFormFingerprint = (doc: PmDocJson): string =>
  stable({
    doc: canonicalFormDoc(doc),
    protection: doc.attrs?.mimirProtectionState ?? null,
    openingEncryption: doc.attrs?.[DOCX_ENCRYPTION_ATTR] ?? null,
    privacy: doc.attrs?.[DOCX_PRIVACY_ATTR] ?? null,
  })
const validateIntent = (intent: DocxProtectionSettingsInput['restrictionPassword']) => {
  if (
    !intent ||
    !['preserve', 'clear', 'replace'].includes(intent.action) ||
    Object.keys(intent).some((k) => !['action', 'password'].includes(k))
  )
    throw new Error('密码操作无效')
  if (intent.action === 'replace' && (!intent.password || typeof intent.password !== 'string'))
    throw new Error('新密码不能为空；移除密码请显式选择清除')
}
export function createDocxProtection(
  xml: string | null,
  original: PmDocJson,
  settingsPath = 'word/settings.xml',
  comments?: ProtectedComments,
  forms?: ProtectedForms,
  validateSettings?: (candidate: string) => Promise<void>,
  emptySettingsXml?: string,
  nativeTrackingTargets: ReadonlySet<number> = new Set(),
  nativeRevisionIds: ReadonlySet<string> = new Set(),
): DocxProtectionController {
  let native = readNativeDocxProtection(xml)
  let privateState = nativePrivate.get(native)
  let restrictionReason = privateState ? privateState.restrictionReason : native.reason
  let commentMode =
    native.enforced &&
    native.mode === 'comments' &&
    !native.uncertain &&
    native.credentials !== 'unsupported'
  let formMode =
    native.enforced &&
    native.mode === 'forms' &&
    !native.uncertain &&
    native.credentials !== 'unsupported'
  const baseline = stable(canonicalDoc(original))
  interface Candidate {
    xml: string | null
    doc: string
    options: string
  }
  const candidates = new Map<string | null, Candidate>([
    [null, { xml, doc: baseline, options: stable({}) }],
  ])
  const trackingPolicies = new Map<string | null, ReturnType<typeof createForcedTrackingPolicy>>()
  let settingsToken: string | null = null
  let nextToken = 0
  const candidate = () => candidates.get(settingsToken)!
  const tokenOf = (doc: PmDocJson): string | null => {
    const value = doc.attrs?.mimirProtectionState
    if (value === null || value === undefined) return null
    if (typeof value !== 'string' || !candidates.has(value)) throw new Error('保护设置历史身份无效')
    return value
  }
  const authorizedBody = (edited: PmDocJson, options: SaveOptions) =>
    settingsToken !== null &&
    candidate().doc === stable(canonicalDoc(edited)) &&
    candidate().options === stable(options)
  const settingsReason = () =>
    native.uncertain || native.credentials === 'unsupported'
      ? '当前保护配置无法安全修改，原件完整保留'
      : native.modificationPassword && !modificationVerified
        ? '请先验证当前修改密码'
        : null

  const bodyBaseline = commentBody(original)
  let permittedCommentDocument: string | null = null
  const listeners = new Set<() => void>()
  let epoch = 0,
    continued = false
  let modificationVerified = false
  let pending: AbortController | null = null
  const access = (): DocxProtectionAccess => {
    const locked = native.modificationPassword && !modificationVerified
    const matchesNativeBaseline = candidate().doc === baseline && candidate().options === stable({})
    const commentsOnly =
      !locked && commentMode && comments?.reason === null && matchesNativeBaseline
    const formsOnly = !locked && formMode && forms?.reason === null && matchesNativeBaseline
    const mandatoryTracking =
      !locked &&
      !native.uncertain &&
      native.credentials !== 'unsupported' &&
      native.enforced &&
      native.mode === 'trackedChanges'
    return Object.freeze({
      commentsOnly,
      formsOnly,
      mandatoryTracking,
      modificationPasswordRequired:
        locked &&
        !native.uncertain &&
        native.credentials !== 'unsupported' &&
        !!privateState?.write,
      modificationUnlocked: modificationVerified,
      writable:
        mandatoryTracking ||
        (!locked && restrictionReason === null && (!native.recommended || continued)),
      reason: locked
        ? native.credentials === 'unsupported' || native.uncertain
          ? native.reason
          : '原件设有修改密码；验证后可在当前会话继续编辑'
        : mandatoryTracking
          ? null
          : ((formsOnly
              ? '原件仅填写表单：可切换受支持的真实复选框；正文只读'
              : commentsOnly
                ? '原件仅批注：可管理讨论及普通单段批注；正文只读'
                : (formMode || commentMode) && !matchesNativeBaseline
                  ? '新编辑限制已生效；请保存并重新打开文档，以使用受限批注或表单工具'
                  : commentMode && comments?.reason
                    ? '原件仅批注；已有讨论结构尚不支持安全修改，当前只读保留'
                    : restrictionReason) ??
            (native.recommended && !continued
              ? '原件建议只读；可在“文档保护”中选择继续编辑'
              : null)),
      epoch,
      recommendedChoice: !locked && restrictionReason === null && native.recommended && !continued,
    })
  }
  let snapshot = access()
  const assertCommentMutation = (edited: PmDocJson, options: SaveOptions) => {
    if (!snapshot.commentsOnly || !comments)
      throw new Error(snapshot.reason ?? '原件不允许编辑批注')
    if (bodyBaseline !== commentBody(edited)) {
      throw new Error('原件仅允许批注，正文内容与格式不能修改')
    }
    if (Object.entries(options).some(([key, value]) => key !== 'comments' && value !== undefined))
      throw new Error('原件仅允许已有批注修改，不能修改其他附加结构')
    comments.validateDocument(edited, options.comments ?? comments.comments)
  }
  const controller: DocxProtectionController = Object.freeze({
    get native() {
      return native
    },
    settingsReason,
    trackingPolicy() {
      if (!snapshot.mandatoryTracking) return null
      let policy = trackingPolicies.get(settingsToken)
      if (!policy) {
        policy = createForcedTrackingPolicy(
          JSON.parse(candidate().doc) as PmDocJson,
          (doc) => stable(canonicalFormDoc(doc)),
          nativeTrackingTargets,
          nativeRevisionIds,
        )
        trackingPolicies.set(settingsToken, policy)
      }
      return policy
    },
    hasSettingsHistory: () => candidates.size > 1,
    restrictionPasswordRequired: () => native.enforced && !!privateState?.document,
    settingsBodySave: (edited: PmDocJson, options: SaveOptions) =>
      snapshot.writable || authorizedBody(edited, options),
    async saveSettings(bytes: Uint8Array) {
      const current = candidate()
      return current.xml === xml
        ? bytes
        : saveDocxProtectionSettings(bytes, settingsPath, current.xml!, xml)
    },
    allowsSettingsTransaction(before: PmDocJson, after: PmDocJson) {
      try {
        return (
          tokenOf(before) === settingsToken &&
          tokenOf(before) !== tokenOf(after) &&
          stable(canonicalDoc(before)) === stable(canonicalDoc(after))
        )
      } catch {
        return false
      }
    },
    activateSettingsDocument(doc: PmDocJson) {
      const next = tokenOf(doc)
      if (next === settingsToken) return
      if (!candidates.has(next)) throw new Error('保护设置历史身份无效')
      settingsToken = next
      native = readNativeDocxProtection(candidate().xml)
      privateState = nativePrivate.get(native)
      restrictionReason = privateState?.restrictionReason ?? native.reason
      commentMode =
        native.enforced &&
        native.mode === 'comments' &&
        !native.uncertain &&
        native.credentials !== 'unsupported'
      formMode =
        native.enforced &&
        native.mode === 'forms' &&
        !native.uncertain &&
        native.credentials !== 'unsupported'
      // Settings history never stores plaintext or silently grants a new modification credential.
      modificationVerified = false
      continued = false
      epoch++
      snapshot = access()
      listeners.forEach((listener) => listener())
    },
    async applySettings(
      input: DocxProtectionSettingsInput,
      doc: PmDocJson,
      options: SaveOptions,
      publish: (token: string) => boolean,
      signal: AbortSignal,
    ) {
      if (settingsReason()) throw new Error(settingsReason()!)
      controller.assertSave(doc, options)
      const docFingerprint = stable(canonicalDoc(doc)),
        optionsFingerprint = stable(options)
      input = structuredClone(input)
      if (pending) throw new Error('密码验证正在进行')
      if (
        !input ||
        typeof input.enabled !== 'boolean' ||
        typeof input.recommended !== 'boolean' ||
        !MODES.has(input.mode)
      )
        throw new Error('保护设置参数无效')
      validateIntent(input.restrictionPassword)
      validateIntent(input.modificationPassword)
      signal.throwIfAborted()
      if (
        input.enabled === native.enforced &&
        (!input.enabled || input.mode === native.mode) &&
        input.recommended === native.recommended &&
        input.restrictionPassword.action === 'preserve' &&
        input.modificationPassword.action === 'preserve'
      )
        return false
      const request = new AbortController(),
        expectedEpoch = epoch,
        expectedToken = settingsToken
      pending = request
      const abort = () => request.abort()
      signal.addEventListener('abort', abort, { once: true })
      try {
        if (native.enforced && privateState?.document) {
          const matches = await verifyDocxModificationPassword(
            input.currentRestrictionPassword ?? '',
            privateState.document,
            request.signal,
          )
          if (!matches) throw new Error('编辑限制密码不正确，请重试')
        }
        const prepare = async (intent: DocxProtectionSettingsInput['restrictionPassword']) =>
          intent.action === 'replace'
            ? createDocxPassword(intent.password, request.signal)
            : intent.action
        const restrictionPassword = await prepare(input.restrictionPassword),
          modificationPassword = await prepare(input.modificationPassword)
        request.signal.throwIfAborted()
        if (pending !== request || epoch !== expectedEpoch || settingsToken !== expectedToken)
          throw new DOMException('编辑会话已变化', 'AbortError')
        const nextXml = patchDocxProtectionSettings(candidate().xml ?? emptySettingsXml ?? null, {
          enabled: input.enabled,
          mode: input.mode,
          restrictionPassword,
          modificationPassword,
          recommended: input.recommended,
        })
        const nextNative = readNativeDocxProtection(nextXml)
        if (nextNative.uncertain || nextNative.credentials === 'unsupported')
          throw new Error('新保护设置无法可靠验证，未应用')
        if (
          nextXml === candidate().xml ||
          (candidate().xml === null &&
            !nextNative.enforced &&
            !nextNative.modificationPassword &&
            !nextNative.recommended)
        )
          return false
        await validateSettings?.(nextXml)
        request.signal.throwIfAborted()
        if (pending !== request || epoch !== expectedEpoch || settingsToken !== expectedToken)
          throw new DOMException('编辑会话已变化', 'AbortError')
        if (
          candidates.size >= 100 ||
          [...candidates.values()].reduce((sum, item) => sum + (item.xml?.length ?? 0) * 2, 0) +
            nextXml.length * 2 >
            16 * 1024 * 1024
        )
          throw new Error('保护设置历史已达上限，请保存后重新打开文档')
        const token = `protection-${++nextToken}`
        candidates.set(token, {
          xml: nextXml,
          doc: docFingerprint,
          options: optionsFingerprint,
        })
        try {
          const published = publish(token)
          if (!published || settingsToken !== token) throw new Error('文档已变化，保护设置未应用')
          return true
        } catch (cause) {
          // A rejected/throwing publisher must not leave an authorized token
          // that a later raw PM transaction could replay.
          if (settingsToken !== token) candidates.delete(token)
          throw cause
        }
      } finally {
        signal.removeEventListener('abort', abort)
        if (pending === request) pending = null
      }
    },
    readComments: () =>
      snapshot.commentsOnly && comments
        ? (structuredClone(comments.comments) as CommentInfo[])
        : null,
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
      if (snapshot.commentsOnly && comments) return comments.access(id)
      return Object.freeze({
        editText: snapshot.reason,
        reply: snapshot.reason,
        resolve: snapshot.reason,
        reopen: snapshot.reason,
        add: snapshot.reason,
        delete: snapshot.reason,
      })
    },
    getCommentTargetReason(block: number) {
      if (snapshot.writable) return null
      return snapshot.commentsOnly && comments ? comments.targetReason(block) : snapshot.reason
    },
    formToggleText(id: string, edited: PmDocJson) {
      if (!snapshot.formsOnly || !forms) throw new Error(snapshot.reason ?? '当前不能填写')
      return forms.toggleText(id, edited)
    },
    readFormControls: (edited: PmDocJson) =>
      forms?.read(edited).map((control) =>
        Object.assign(control, {
          reason: snapshot.formsOnly
            ? control.reason
            : (snapshot.reason ?? '当前文档未开放受限表单填写'),
        }),
      ) ?? [],
    allowsFormTransaction(edited: PmDocJson) {
      if (!snapshot.formsOnly || !forms) return false
      try {
        forms.validate(edited)
        return true
      } catch {
        return false
      }
    },
    assertCommentMutation,
    allowsCommentTransaction(edited: PmDocJson) {
      return (
        snapshot.commentsOnly &&
        permittedCommentDocument !== null &&
        permittedCommentDocument === stable(canonicalDoc(edited))
      )
    },
    runCommentTransaction(edited: PmDocJson, options: SaveOptions, publish: () => boolean) {
      assertCommentMutation(edited, options)
      if (permittedCommentDocument !== null) throw new Error('批注事务正在执行')
      permittedCommentDocument = stable(canonicalDoc(edited))
      try {
        return publish()
      } finally {
        permittedCommentDocument = null
      }
    },
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
    async verifyModificationPassword(password: string, signal?: AbortSignal) {
      if (!snapshot.modificationPasswordRequired || !privateState?.write)
        throw new Error('当前原件不支持修改密码核验')
      if (pending) throw new Error('密码验证正在进行')
      signal?.throwIfAborted()
      const request = new AbortController(),
        expectedEpoch = epoch,
        credential = privateState.write
      pending = request
      const abort = () => request.abort()
      signal?.addEventListener('abort', abort, { once: true })
      try {
        const matches = await verifyDocxModificationPassword(password, credential, request.signal)
        request.signal.throwIfAborted()
        if (pending !== request || epoch !== expectedEpoch || privateState.write !== credential)
          throw new DOMException('编辑会话已变化', 'AbortError')
        if (!matches) throw new Error('密码不正确，请重试')
        modificationVerified = true
        continued = true
        epoch++
        snapshot = access()
        listeners.forEach((listener) => listener())
      } finally {
        signal?.removeEventListener('abort', abort)
        if (pending === request) pending = null
      }
    },
    endModificationSession() {
      pending?.abort()
      pending = null
      if (!modificationVerified) return
      modificationVerified = false
      continued = false
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
      if (tokenOf(edited) !== settingsToken) throw new Error('保护设置历史身份已变化')
      if (authorizedBody(edited, options)) return
      if (snapshot.mandatoryTracking) {
        if (candidate().options !== stable({}) || stable(options) !== candidate().options)
          throw new Error('强制修订不支持修改批注、媒体、页面或其他附加结构')
        controller.trackingPolicy()!.assertDocument(edited)
        return
      }
      if (snapshot.formsOnly && forms) {
        if (Object.values(options).some((value) => value !== undefined))
          throw new Error('原件仅允许填写真实复选框，不能修改批注或其他附加结构')
        forms.validate(edited)
        return
      }
      if (snapshot.commentsOnly) {
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
  return controller
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
