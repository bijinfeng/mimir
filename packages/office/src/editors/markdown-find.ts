import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { FindOptions } from '../shims/ui.js'
import type { FindReplaceAdapter } from '../shell/EditorShell.js'
import { findRanges, type FindRange } from './docx-find.js'

const markdownSearchKey = new PluginKey<DecorationSet>('markdownSearch')

/** Search decoration is view state, so finding text never dirties or serializes the note. */
export const MarkdownSearchHighlight = Extension.create({
  name: 'markdownSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: markdownSearchKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, previous) {
            const next = tr.getMeta(markdownSearchKey) as
              | { ranges: FindRange[]; activeIndex: number }
              | undefined
            if (next)
              return DecorationSet.create(
                tr.doc,
                next.ranges.map((range, index) =>
                  Decoration.inline(range.from, range.to, {
                    class:
                      index === next.activeIndex ? 'search-hit search-hit-active' : 'search-hit',
                  }),
                ),
              )
            return previous.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return markdownSearchKey.getState(state)
          },
        },
      }),
    ]
  },
})

const adapters = new WeakMap<Editor, FindReplaceAdapter>()

/** Bind the shared find bar to the same Tiptap document as manual and Agent edits. */
export function markdownFindAdapter(editor: Editor): FindReplaceAdapter {
  const cached = adapters.get(editor)
  if (cached) return cached
  let ranges: FindRange[] = []
  const highlight = (activeIndex: number) => {
    if (!editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(markdownSearchKey, { ranges, activeIndex }))
  }
  const adapter: FindReplaceAdapter = {
    search(query: string, options: FindOptions, activeIndex: number) {
      ranges = findRanges(editor, query, options)
      highlight(Math.min(activeIndex, Math.max(0, ranges.length - 1)))
      return ranges.length
    },
    activate(index: number) {
      const range = ranges[index]
      if (!range || editor.isDestroyed) return
      highlight(index)
      const { node } = editor.view.domAtPos(range.from)
      const element = node instanceof HTMLElement ? node : node.parentElement
      element?.scrollIntoView?.({ block: 'center' })
    },
    clear() {
      ranges = []
      highlight(0)
    },
    onDocChanged(listener: () => void) {
      editor.on('update', listener)
      return () => editor.off('update', listener)
    },
    replaceOne(index: number, replacement: string) {
      const range = ranges[index]
      if (range && !editor.isDestroyed)
        editor.view.dispatch(editor.state.tr.insertText(replacement, range.from, range.to))
    },
    replaceAll(replacement: string) {
      if (!ranges.length || editor.isDestroyed) return
      const tr = editor.state.tr
      for (const range of ranges.toReversed()) tr.insertText(replacement, range.from, range.to)
      editor.view.dispatch(tr)
    },
  }
  adapters.set(editor, adapter)
  return adapter
}
