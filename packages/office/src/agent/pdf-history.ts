import { sameLayout, type PdfPageRef } from '../editors/pdf-pages.js'
export interface PdfHistoryEntry {
  bytes: Uint8Array
  pages: readonly PdfPageRef[]
  state: unknown
  assets?: readonly Uint8Array[]
}
/** Bounded opaque working-copy snapshots; saved baseline lives outside this history. */
export class PdfHistory {
  private entries: PdfHistoryEntry[] = []
  private at = -1
  private revision = 0
  private listeners = new Set<() => void>()
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.revision
  private emit() {
    this.revision++
    for (const listener of this.listeners) listener()
  }
  get canUndo() {
    return this.at > 0
  }
  get canRedo() {
    return this.at >= 0 && this.at < this.entries.length - 1
  }
  observe(entry: PdfHistoryEntry) {
    const current = this.entries[this.at]
    if (current && current.bytes === entry.bytes && sameLayout(current.pages, entry.pages)) return
    this.entries = this.entries.slice(0, this.at + 1)
    this.entries.push(entry)
    const cost = () =>
      [...new Set(this.entries.flatMap((e) => [e.bytes, ...(e.assets ?? [])]))].reduce(
        (n, b) => n + b.byteLength,
        0,
      )
    while (this.entries.length > 1 && (this.entries.length > 50 || cost() > 64 * 1024 * 1024))
      this.entries.shift()
    this.at = this.entries.length - 1
    this.emit()
  }
  rebase(entry: PdfHistoryEntry) {
    if (this.at < 0) {
      this.observe(entry)
      return
    }
    this.entries[this.at] = entry
    this.emit()
  }
  undo() {
    if (!this.canUndo) return null
    this.at--
    this.emit()
    return this.entries[this.at]!
  }
  redo() {
    if (!this.canRedo) return null
    this.at++
    this.emit()
    return this.entries[this.at]!
  }
}
