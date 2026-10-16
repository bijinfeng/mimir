import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  makeGapEl,
  type PageGapSpec,
} from '../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'
import { TopLevelPositions } from '../vendor/apps/docs/src/renderer/editor/top-level-pos.js'
import type { LineAnchor } from '../vendor/apps/docs/src/renderer/pagination-lines.js'
const key = new PluginKey<DecorationSet>('mimirFootnoteContinuations')
const signatures = new WeakMap<Editor, string>()

/** Multiple continuation papers can precede one line inside a read-only endnote widget. */
export function insertOrderedEndnoteGap(
  owner: HTMLElement,
  offset: number,
  gap: HTMLElement,
  anchorFor: () => LineAnchor | null,
  tails: Map<HTMLElement, Map<number, HTMLElement>>,
): void {
  const offsets = tails.get(owner) ?? new Map<number, HTMLElement>()
  tails.set(owner, offsets)
  const previous = offsets.get(offset)
  if (previous) previous.after(gap)
  else {
    const anchor = anchorFor()
    if (anchor) {
      const range = document.createRange()
      range.setStart(anchor.node, anchor.charOffset)
      range.collapse(true)
      range.insertNode(gap)
    } else owner.prepend(gap)
  }
  offsets.set(offset, gap)
}

/** PM reverses equal-side widgets at one anchor. Give continuation papers distinct ordered sides. */
export function orderedContinuationGaps(editor: Editor, gaps: PageGapSpec[]): PageGapSpec[] {
  const positions = new TopLevelPositions(editor.view)
  const groups = new Map<number, PageGapSpec[]>()
  const ordinary: PageGapSpec[] = []
  for (const gap of gaps) {
    const pos = 'el' in gap ? positions.of(gap.el)?.from : gap.pos
    if (pos === undefined) {
      ordinary.push(gap)
      continue
    }
    groups.set(pos, [...(groups.get(pos) ?? []), gap])
  }
  const duplicates = [...groups].filter(([, items]) => items.length > 1)
  for (const [, items] of groups) if (items.length === 1) ordinary.push(items[0]!)
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
  const signature = JSON.stringify(
    duplicates.map(([pos, items]) => [
      pos,
      items.map((item) => [
        item.metrics,
        item.notesKey,
        item.hfKey,
        item.repeatHeaderKey,
        item.pullUp,
      ]),
    ]),
  )
  if (signatures.get(editor) === signature) return ordinary
  signatures.set(editor, signature)
  const decorations: Decoration[] = []
  for (const [pos, items] of duplicates)
    items.forEach((gap, index) => {
      const side = (index - items.length) * 2 - 2
      decorations.push(
        Decoration.widget(
          pos,
          () => {
            const kind = 'el' in gap ? 'block' : (gap.kind ?? 'inline')
            const element = makeGapEl(gap.metrics, kind, gap.cols)
            if (gap.boundaryY !== undefined) element.dataset.boundaryY = gap.boundaryY.toFixed(1)
            if (gap.pullUp && kind !== 'table') element.style.marginTop = `-${gap.pullUp}px`
            if (gap.notes) element.append(gap.notes)
            const parent =
              kind === 'table'
                ? (element.querySelector('.page-gap-table-fill') ?? element)
                : element
            for (const hf of gap.hfEls ?? []) parent.append(hf)
            return element
          },
          { side, key: `continuation:${pos}:${index}:${signature}` },
        ),
      )
      gap.repeatHeaderEls?.forEach((header, ordinal) =>
        decorations.push(
          Decoration.widget(pos, () => header, {
            side: side + 1,
            key: `continuation-header:${pos}:${index}:${ordinal}:${signature}`,
          }),
        ),
      )
    })
  editor.view.dispatch(
    editor.state.tr
      .setMeta(key, DecorationSet.create(editor.state.doc, decorations))
      .setMeta('addToHistory', false),
  )
  return ordinary
}
export function clearContinuationGaps(editor: Editor): void {
  signatures.delete(editor)
  editor.unregisterPlugin(key)
}
