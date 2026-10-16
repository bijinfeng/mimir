import type { Editor } from '@tiptap/core'
import type { NoteProps } from '../vendor/packages/docx-engine/src/types.js'
import { formatNoteNumber, type NoteKind } from '../vendor/apps/docs/src/renderer/note-format.js'

/** One counter per reference stream; section properties override only their declared fields. */
export function noteNumbering(kind: NoteKind, defaults?: NoteProps) {
  let next = defaults?.numStart ?? 1
  let previousSection = -1,
    previousPage = -1
  const known = new Map<string, { no: number; markText: string }>()
  return (id: string, section: number, page: number, overrides?: NoteProps) => {
    const previous = known.get(id)
    if (previous) return previous
    const props = { ...defaults, ...overrides }
    if (
      previousSection < 0 ||
      (section !== previousSection &&
        (props.numRestart === 'eachSect' || overrides?.numStart !== undefined)) ||
      (page !== previousPage && props.numRestart === 'eachPage')
    )
      next = props.numStart ?? 1
    const no = next++
    previousSection = section
    previousPage = page
    const entry = {
      no,
      markText: formatNoteNumber(
        props.numFmt ?? (kind === 'footnote' ? 'decimal' : 'lowerRoman'),
        no,
      ),
    }
    known.set(id, entry)
    return entry
  }
}

/** Update only leaf reference paint; the source marker attributes remain untouched for surgical save. */
export function paintNoteNumbers(editor: Editor, entries: Map<string, string>): boolean {
  const observer = (editor.view as unknown as { domObserver?: { stop(): void; start(): void } })
    .domObserver
  let changed = false
  observer?.stop()
  try {
    for (const reference of editor.view.dom.querySelectorAll<HTMLElement>('sup.doc-note-ref')) {
      const text = entries.get(`${reference.dataset.noteKind}:${reference.dataset.noteRef}`)
      if (text !== undefined && reference.textContent !== text) {
        reference.textContent = text
        changed = true
      }
    }
  } finally {
    observer?.start()
  }
  return changed
}
