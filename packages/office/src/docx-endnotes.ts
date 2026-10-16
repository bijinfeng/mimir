import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { PageNoteItem } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import type { ParsedDoc, SectionInfo } from '../vendor/packages/docx-engine/src/types.js'
import { noteNumbering } from './docx-note-numbering.js'
import { endnoteItems, makeGapNotesEl } from './footnotes.js'

const key = new PluginKey<DecorationSet>('mimirEndnotes')
const signatures = new WeakMap<Editor, string>()
export interface EndnoteGroup {
  pos: number
  section: number
  items: (PageNoteItem & { kind: 'endnote'; markText?: string })[]
}

/** Locate each live reference's section; a sectEnd override only collects that section's notes. */
export function liveEndnoteGroups(
  editor: Editor,
  parsed: ParsedDoc,
  sections: SectionInfo[],
): EndnoteGroup[] {
  const grouped = new Map<number, string[]>()
  const seen = new Set<string>()
  const positions: number[] = []
  const number = noteNumbering('endnote', parsed.endnoteProps)
  const markers = new Map<string, { no: number; markText: string }>()
  editor.state.doc.forEach((node, offset, index) => {
    positions[index] = offset + node.nodeSize
    const section = Math.max(
      0,
      sections.findIndex((item) => index <= item.lastBlockIndex),
    )
    const target =
      (sections[section]?.settings.endnotePr?.pos ?? parsed.endnoteProps?.pos) === 'sectEnd'
        ? section
        : sections.length - 1
    node.descendants((child) => {
      if (child.type.name !== 'docNoteRef' || child.attrs.kind !== 'endnote') return
      const id = String(child.attrs.id)
      if (seen.has(id)) return
      seen.add(id)
      markers.set(id, number(id, section, 0, sections[section]?.settings.endnotePr))
      grouped.set(target, [...(grouped.get(target) ?? []), id])
    })
  })
  return [...grouped]
    .toSorted(([a], [b]) => a - b)
    .flatMap(([section, ids]) => {
      const settings = sections[section]?.settings
      if (!settings) return []
      const notes = ids.flatMap((id) => parsed.endnotes.find((note) => note.id === id) ?? [])
      const items = endnoteItems(parsed, notes, settings).map((item) =>
        Object.assign({}, item, markers.get(item.id)),
      )
      const pos =
        positions[Math.min(sections[section]!.lastBlockIndex, positions.length - 1)] ??
        editor.state.doc.content.size
      return items.length ? [{ section, pos, items }] : []
    })
}

/** Read-only, in-flow widgets: real line geometry, no duplicated editable/save content. */
export function syncEndnoteDecorations(
  editor: Editor,
  groups: EndnoteGroup[],
  sections: SectionInfo[],
): void {
  if (!key.getState(editor.state))
    editor.registerPlugin(
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, value) => tr.getMeta(key) ?? value.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    )
  const signature = JSON.stringify([
    groups,
    sections.map((section) => [
      section.settings.pageWidth,
      section.settings.marginLeft,
      section.settings.marginRight,
    ]),
  ])
  if (signatures.get(editor) === signature) return
  signatures.set(editor, signature)
  const decorations = groups.map((group) =>
    Decoration.widget(
      group.pos,
      () => {
        const settings = sections[group.section]!.settings
        const element = document.createElement('div')
        element.className = 'mimir-docx-endnotes'
        const rows = makeGapNotesEl(
          group.items,
          (settings.pageWidth - settings.marginLeft - settings.marginRight) / 15,
        )
        Object.assign(rows.style, { position: 'relative', top: 'auto', left: 'auto' })
        element.append(rows)
        element.dataset.endnoteSection = String(group.section)
        element.setAttribute('role', 'group')
        element.setAttribute('aria-label', `第 ${group.section + 1} 节尾注`)
        element.contentEditable = 'false'
        Object.assign(element.style, {
          position: 'relative',
          marginTop: '8px',
          marginBottom: '0px',
          top: 'auto',
          left: 'auto',
        })
        return element
      },
      { key: `endnotes:${group.section}:${signature}`, side: -1, ignoreSelection: true },
    ),
  )
  editor.view.dispatch(
    editor.state.tr
      .setMeta(key, DecorationSet.create(editor.state.doc, decorations))
      .setMeta('addToHistory', false),
  )
}
export function clearEndnoteDecorations(editor: Editor): void {
  signatures.delete(editor)
  editor.unregisterPlugin(key)
}

/** Gaps inserted inside a read-only widget are owned by us; remove them before remeasurement. */
export function clearEndnoteGaps(pm: HTMLElement): void {
  for (const gap of pm.querySelectorAll('.mimir-endnote-gap')) gap.remove()
  for (const notes of pm.querySelectorAll('.mimir-docx-endnotes')) notes.normalize()
}
