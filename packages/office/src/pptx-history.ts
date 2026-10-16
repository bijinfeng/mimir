import type { PptxEditSession, PptxSessionCheckpoint } from './pptx.js'

/** Canvas history includes both manual edits and completed Agent transactions. */
export class PptxHistory {
  private past: PptxSessionCheckpoint[] = []
  private future: PptxSessionCheckpoint[] = []
  private current: PptxSessionCheckpoint
  private revision: number
  constructor(
    private readonly session: PptxEditSession,
    private readonly limit = 30,
  ) {
    this.current = session.checkpoint()
    this.revision = session.version()
  }
  get canUndo() {
    return this.past.length > 0
  }
  get canRedo() {
    return this.future.length > 0
  }
  record() {
    if (this.session.version() === this.revision) return
    this.past.push(this.current)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
    this.synchronize()
  }
  /** Saving changes the baseline, never creates an edit step. */
  synchronize() {
    this.current = this.session.checkpoint()
    this.revision = this.session.version()
  }
  undo() {
    const previous = this.past.pop()
    if (!previous) return false
    this.future.push(this.current)
    this.session.restore(previous, { forceDirty: true })
    this.synchronize()
    return true
  }
  redo() {
    const next = this.future.pop()
    if (!next) return false
    this.past.push(this.current)
    this.session.restore(next, { forceDirty: true })
    this.synchronize()
    return true
  }
}
