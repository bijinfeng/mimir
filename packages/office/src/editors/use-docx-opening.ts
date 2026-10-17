import { useEffect, useState, useSyncExternalStore } from 'react'
import { openDocx, type DocxSession } from '../docx.js'
import { DocxEncryptionController } from '../docx-encryption.js'
import {
  disposeDocxEncryptionSession,
  encryptedDocxSession,
  isEncryptedDocx,
} from '../docx-encrypted-session.js'
interface OpeningSnapshot {
  value: DocxSession | null
  error: string | null
  prompt: boolean
  busy: boolean
  feedback: string
}
const INITIAL: OpeningSnapshot = {
  value: null,
  error: null,
  prompt: false,
  busy: false,
  feedback: '',
}
const NO_SUBSCRIBE = () => () => {}
const NO_SNAPSHOT = () => INITIAL
/** One load attempt owns all async work, including reopening A after A→B→A. */
export class DocxOpening {
  private readonly source = {}
  private readonly controller = new DocxEncryptionController(this.source)
  private readonly listeners = new Set<() => void>()
  private snapshot: OpeningSnapshot = INITIAL
  private active = true
  private epoch = 0
  private request: AbortController | null = null
  private readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) {
    this.bytes = bytes.slice()
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  private publish(value: Partial<OpeningSnapshot>) {
    if (!this.active) return
    this.snapshot = { ...this.snapshot, ...value }
    this.listeners.forEach((listener) => listener())
  }
  async start() {
    try {
      if (isEncryptedDocx(this.bytes)) this.publish({ prompt: true })
      else await this.open(null)
    } catch (cause) {
      this.publish({ error: cause instanceof Error ? cause.message : '文件无法打开' })
    }
  }
  open = async (password: string | null) => {
    if (!this.active || this.request || this.snapshot.value) return
    const epoch = ++this.epoch,
      request = new AbortController()
    this.request = request
    this.publish({ busy: true, feedback: '' })
    const current = () => this.active && this.epoch === epoch && !request.signal.aborted
    try {
      const plain =
        password === null
          ? this.bytes.slice()
          : (await this.controller.decrypt(this.bytes, password, request.signal, this.source)).bytes
      if (!current()) return
      const native = await openDocx(plain)
      if (!current()) return
      const session = encryptedDocxSession(
        native,
        this.bytes,
        password,
        this.controller,
        this.source,
      )
      this.publish({ value: session, prompt: false, busy: false, feedback: '' })
    } catch (cause) {
      if (!current()) return
      const message = cause instanceof Error ? cause.message : '文件无法打开'
      this.publish(
        password === null ? { error: message, busy: false } : { feedback: message, busy: false },
      )
    } finally {
      password = null
      if (this.request === request) this.request = null
    }
  }
  cancel = () => {
    this.epoch++
    this.request?.abort()
    this.request = null
    this.controller.cancel()
    this.publish({ busy: false, feedback: '已取消本地打开，原件保持不变' })
  }
  dispose() {
    if (!this.active) return
    this.active = false
    this.epoch++
    this.request?.abort()
    this.request = null
    if (this.snapshot.value) disposeDocxEncryptionSession(this.snapshot.value)
    this.controller.dispose()
    this.snapshot = INITIAL
    this.listeners.clear()
  }
}
export function useDocxOpening(bytes: Uint8Array | null, documentId: string) {
  const [record, setRecord] = useState<{
    bytes: Uint8Array
    documentId: string
    opening: DocxOpening
  } | null>(null)
  useEffect(() => {
    if (!bytes) return
    const opening = new DocxOpening(bytes)
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setRecord({ bytes, documentId, opening })
      void opening.start()
    })
    return () => {
      active = false
      opening.dispose()
    }
  }, [bytes, documentId])
  const opening =
    record?.bytes === bytes && record.documentId === documentId ? record.opening : null
  const snapshot = useSyncExternalStore(
    opening?.subscribe ?? NO_SUBSCRIBE,
    opening?.getSnapshot ?? NO_SNAPSHOT,
  )
  return { ...snapshot, opening }
}
