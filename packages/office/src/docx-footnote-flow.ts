import type { PageSlice, SectionGeom } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import { FOOTNOTE_SEPARATOR_H, type NoteFragment } from './footnotes.js'
import { pageUnusedHeight } from './pagination-geometry.js'

/** Spill note bodies onto dedicated continuation papers without changing editable body positions. */
export function paginateFootnoteContinuations(
  slices: PageSlice[],
  notes: NoteFragment[][],
  geoms: SectionGeom[],
): { slices: PageSlice[]; notes: NoteFragment[][] } {
  const pages: PageSlice[] = [],
    items: NoteFragment[][] = []
  for (let index = 0; index < slices.length; index++) {
    const source = slices[index]!
    let current: NoteFragment[] = []
    let room = Math.max(0, pageUnusedHeight(source, geoms) - FOOTNOTE_SEPARATOR_H)
    pages.push(source)
    items.push(current)
    const nextPage = () => {
      const at = slices[index + 1]?.start ?? source.end
      pages.push({ start: at, end: at, section: source.section, physHeight: 0 })
      current = []
      items.push(current)
      room = Math.max(1, (geoms[source.section]?.contentHeight ?? 1) - FOOTNOTE_SEPARATOR_H)
    }
    for (const note of notes[index] ?? []) {
      let offset = 0
      while (offset < note.height - 0.5) {
        const remaining = note.height - offset
        if (remaining <= room + 0.5) {
          current.push(
            offset
              ? { ...note, height: remaining, clipTop: offset, fullHeight: note.height }
              : note,
          )
          room -= remaining
          break
        }
        const boundaries = note.breakOffsets?.length
          ? note.breakOffsets
          : Array.from(
              { length: Math.ceil(note.height / (note.lineHeightPx ?? 16)) - 1 },
              (_, i) => (i + 1) * (note.lineHeightPx ?? 16),
            )
        const cut = boundaries.findLast((y) => y > offset + 0.5 && y <= offset + room + 0.5)
        if (cut !== undefined) {
          current.push({ ...note, height: cut - offset, clipTop: offset, fullHeight: note.height })
          offset = cut
        } else if (!current.length && pages[pages.length - 1]!.physHeight === 0) {
          // A single glyph can be taller than the whole physical paper; keep progress bounded.
          const height = Math.min(remaining, room)
          current.push({ ...note, height, clipTop: offset, fullHeight: note.height })
          offset += height
        }
        nextPage()
      }
    }
  }
  return { slices: pages, notes: items }
}
