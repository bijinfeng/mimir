// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { expect, it } from 'vitest'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import {
  setPageGaps,
  type PageGapSpec,
} from '../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'
import {
  clearContinuationGaps,
  orderedContinuationGaps,
  insertOrderedEndnoteGap,
} from './docx-footnote-gaps.js'

it.each([0, 4])(
  'keeps continuation papers before the same endnote line in source order (offset %i)',
  (offset) => {
    const owner = document.createElement('div')
    const text = document.createTextNode('Endnote content')
    owner.append(text)
    const tails = new Map<HTMLElement, Map<number, HTMLElement>>()
    for (const value of [0, 250, 546]) {
      const gap = document.createElement('span')
      gap.dataset.offset = String(value)
      insertOrderedEndnoteGap(
        owner,
        offset,
        gap,
        () => (offset ? { node: text, charOffset: offset } : null),
        tails,
      )
    }
    expect(
      [...owner.querySelectorAll('[data-offset]')].map((el) => el.getAttribute('data-offset')),
    ).toEqual(['0', '250', '546'])
    expect(owner.textContent).toBe('Endnote content')
  },
)
const continuationGaps = () =>
  [0, 250, 546].map((offset) => {
    const notes = document.createElement('div')
    notes.dataset.offset = String(offset)
    return {
      pos: 1,
      kind: 'inline',
      metrics: { marginTop: 40, marginBottom: 300, marginLeft: 60, marginRight: 60 },
      notes,
      notesKey: String(offset),
    } satisfies PageGapSpec
  })
it('keeps continuation papers in source order at a shared PM anchor across repeated layout passes', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'a' }] }],
    },
  })
  const original = editor.getJSON()
  for (let pass = 0; pass < 2; pass++) {
    orderedContinuationGaps(editor, [])
    setPageGaps(editor.view, orderedContinuationGaps(editor, continuationGaps()))
    expect(
      [...editor.view.dom.querySelectorAll('[data-offset]')].map((item) =>
        item.getAttribute('data-offset'),
      ),
    ).toEqual(['0', '250', '546'])
    expect(editor.getJSON()).toEqual(original)
  }
  clearContinuationGaps(editor)
  expect(editor.view.dom.querySelector('.page-gap')).toBeNull()
  editor.destroy()
})
