import { docxPrivacyIntent } from './docx-privacy-state.js'
import type { DocxSession, PmDocJson } from './docx.js'
import { DocxEncryptionController } from './docx-encryption.js'
import { readEncryptionContainer } from './docx-encryption-container.js'
import { parseEncryptionInfo } from './docx-encryption-info.js'
import { validateEncryptionPassword } from './docx-encryption-types.js'
import { docxEncryptionToken, projectDocxEncryption } from './docx-encryption-state.js'
const MAX_INTENTS = 64
const cancelled = () => new DOMException('已取消本地加密处理', 'AbortError')
const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, index) => value === b[index])
/** Actual bounded CFB and EncryptionInfo validation; a signature alone is not acceptance. */
export function isEncryptedDocx(bytes: Uint8Array): boolean {
  if (![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => bytes[i] === v))
    return false
  const container = readEncryptionContainer(bytes)
  parseEncryptionInfo(container.info)
  return true
}
interface EncryptionState {
  create(password: string | null): string
  discard(token: string): void
  current(doc: PmDocJson): boolean
  persisted(): boolean
  subscribe(listener: () => void): () => void
  revision(): number
  bind(read: () => object): () => void
  cancel(): void
  dispose(): void
}
const states = new WeakMap<DocxSession, EncryptionState>()
const stateOf = (session: DocxSession) => {
  const state = states.get(session)
  if (!state) throw new Error('当前文档已关闭，请重新打开')
  return state
}
export const readDocxEncryptionState = (session: DocxSession, doc: PmDocJson) => {
  const state = stateOf(session)
  return { encrypted: state.current(doc), persisted: state.persisted() }
}
export const subscribeDocxEncryption = (session: DocxSession, listener: () => void) =>
  stateOf(session).subscribe(listener)
export const docxEncryptionRevision = (session: DocxSession) => stateOf(session).revision()
export const createDocxEncryptionIntent = (session: DocxSession, password: string | null) =>
  stateOf(session).create(password)
export const discardDocxEncryptionIntent = (session: DocxSession, token: string) =>
  stateOf(session).discard(token)
export const bindDocxEncryptionDocument = (session: DocxSession, read: () => object) =>
  stateOf(session).bind(read)
export const cancelDocxEncryptionGeneration = (session: DocxSession) =>
  states.get(session)?.cancel()
export const disposeDocxEncryptionSession = (session: DocxSession) => states.get(session)?.dispose()
/** Native OOXML stays the patch baseline; every cipher output owns its native privacy candidate. */
export function encryptedDocxSession(
  native: DocxSession,
  sourceBytes: Uint8Array,
  openingPassword: string | null,
  controller: DocxEncryptionController,
  source: object,
): DocxSession {
  const secrets = new Map<string | null, string | null>([[null, openingPassword]])
  let active = true,
    persistedPassword = openingPassword,
    persistedBytes = sourceBytes.slice(),
    persistedPlain = native.originalBytes.slice(),
    readDocument: (() => object) | null = null,
    generation = false
  const listeners = new Set<() => void>()
  let revision = 0
  interface CachedCipher {
    key: string
    floor: boolean
    bytes: Uint8Array
    plain: Uint8Array
    password: string | null
  }
  let persistedCache: CachedCipher | null = null,
    generatedCache: CachedCipher | null = null
  let generationAbort: AbortController | null = null
  const candidates = new WeakMap<
    Uint8Array,
    {
      native: Uint8Array
      password: string | null
      document: object | null
      epoch: number
      cache: CachedCipher
      cleaned: boolean
    }
  >()
  const live = () => {
    if (!active) throw cancelled()
  }
  const passwordOf = (doc: PmDocJson) => {
    live()
    const token = docxEncryptionToken(doc)
    if (!secrets.has(token)) throw new Error('打开密码历史已失效，请重新打开文档')
    return secrets.get(token)!
  }
  const own = (bytes: Uint8Array) => {
    live()
    const candidate = candidates.get(bytes)
    if (!candidate) throw new Error('保存副本已失效，请重新保存或导出')
    // Public output buffers are mutable; ownership also binds every byte to the private snapshot.
    if (!equal(candidate.cache.bytes, bytes)) throw new Error('保存副本已被修改，请重新保存或导出')
    native.assertSaveCandidate(candidate.native)
    return candidate
  }
  const session: DocxSession = {
    ...native,
    async save(doc, options = {}) {
      live()
      if (generation) throw new Error('正在生成文档副本，请稍后再试')
      generation = true
      const requestAbort = new AbortController()
      generationAbort = requestAbort
      try {
        doc = structuredClone(doc)
        options = structuredClone(options)
        const password = passwordOf(doc),
          document = readDocument?.() ?? null,
          epoch = native.protection.getAccess().epoch
        const guard = () => {
          live()
          requestAbort.signal.throwIfAborted()
          if (
            (readDocument && readDocument() !== document) ||
            native.protection.getAccess().epoch !== epoch
          )
            throw new Error('文档或保护状态已变化，请重新保存或导出')
        }
        // Cache only document/options identity plus P's monotonic metadata floor. Native saves
        // update core revision/time; identical content must not get a new random cipher every export.
        const access = native.protection.getAccess()
        if (password !== persistedPassword && (!access.writable || access.mandatoryTracking))
          throw new Error(access.reason ?? '原件编辑限制不允许更改打开密码')
        const key = JSON.stringify([doc, options, epoch])
        // P/W/T final native checks always run, including for a cached ciphertext no-op.
        const plain = await native.save(projectDocxEncryption(doc), options)
        guard()
        const privacy = await native.readPrivacyState()
        guard()
        native.assertSaveCandidate(plain)
        const cached = [persistedCache, generatedCache].find(
          (value) =>
            value &&
            value.key === key &&
            value.floor === privacy.cleaned &&
            value.password === password,
        )
        const output = cached
          ? cached.bytes.slice()
          : password === persistedPassword && equal(plain, persistedPlain)
            ? persistedBytes.slice()
            : password === null
              ? plain.slice()
              : (await controller.encrypt(plain, password, requestAbort.signal, source)).bytes
        guard()
        native.assertSaveCandidate(plain)
        const actualPlain =
          cached?.plain ??
          (password === persistedPassword && equal(plain, persistedPlain) ? persistedPlain : plain)
        const cache = {
          key,
          floor: privacy.cleaned,
          bytes: output.slice(),
          plain: actualPlain.slice(),
          password,
        }
        generatedCache = cache
        const cleaned =
          privacy.cleaned ||
          (docxPrivacyIntent(doc) ?? options.removePersonalInfo ?? privacy.original)
        candidates.set(output, { native: plain, password, document, epoch, cache, cleaned })
        return output
      } finally {
        generation = false
        if (generationAbort === requestAbort) generationAbort = null
      }
    },
    assertSaveCandidate(bytes) {
      const candidate = own(bytes)
      if (
        (readDocument && readDocument() !== candidate.document) ||
        native.protection.getAccess().epoch !== candidate.epoch
      )
        throw new Error('文档或打开密码设置已变化，请重新保存或导出')
    },
    acknowledgeSaved(bytes) {
      // Old IO ACKs what really persisted; newer Editor intent stays dirty. P's floor advances.
      const candidate = own(bytes)
      native.acknowledgeSaved(candidate.native)
      persistedPassword = candidate.password
      persistedBytes = candidate.cache.bytes.slice()
      persistedPlain = candidate.cache.plain.slice()
      persistedCache = { ...candidate.cache, floor: candidate.cleaned }
      candidates.delete(bytes)
      revision++
      listeners.forEach((listener) => listener())
    },
  }
  Object.defineProperty(session, 'protection', {
    value: native.protection,
    writable: false,
    configurable: false,
    enumerable: true,
  })
  states.set(session, {
    create(password) {
      live()
      const access = native.protection.getAccess()
      if (!access.writable || access.mandatoryTracking)
        throw new Error(access.reason ?? '原件编辑限制不允许更改打开密码')
      if (password !== null) validateEncryptionPassword(password)
      if (secrets.size >= MAX_INTENTS)
        throw new Error('本次打开的密码设置历史已达 63 次，请保存后重新打开文档')
      const token = `enc:${crypto.randomUUID()}`
      secrets.set(token, password)
      return token
    },
    discard(token) {
      secrets.delete(token)
    },
    current: (doc) => passwordOf(doc) !== null,
    persisted: () => persistedPassword !== null,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    revision: () => revision,
    bind(read) {
      live()
      readDocument = read
      return () => {
        if (readDocument === read) readDocument = null
      }
    },
    cancel() {
      generationAbort?.abort(new DOMException('已取消生成文档副本', 'AbortError'))
      controller.cancel()
    },
    dispose() {
      if (!active) return
      active = false
      generationAbort?.abort()
      controller.dispose()
      secrets.clear()
      listeners.clear()
      persistedCache = null
      generatedCache = null
      persistedPassword = null
      persistedBytes = new Uint8Array()
      persistedPlain = new Uint8Array()
      readDocument = null
      states.delete(session)
    },
  })
  return session
}
