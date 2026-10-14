import { Editor } from '@tiptap/core'
import { afterEach, expect, it } from 'vitest'
import { markdownFindAdapter } from '@mimir/office'
import { createExtensions } from './extensions.js'

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

it('finds across marks without dirtying Markdown and replaces through one live editor transaction', () => {
  const host = document.createElement('div')
  editor = new Editor({
    element: host,
    extensions: createExtensions(),
    content: 'Al**ph**a Alpha',
    contentType: 'markdown',
  })
  const before = editor.getMarkdown()
  const find = markdownFindAdapter(editor)
  const options = { matchCase: false, wholeWord: false }
  expect(find.search('alpha', options, 0)).toBe(2)
  // One logical hit can span multiple DOM nodes when a mark splits its text.
  expect(host.querySelectorAll('.search-hit').length).toBeGreaterThanOrEqual(2)
  expect(editor.getMarkdown()).toBe(before)
  find.replaceOne?.(0, 'Beta')
  expect(editor.getMarkdown()).toContain('Beta Alpha')
  expect(find.search('Alpha', options, 0)).toBe(1)
  find.replaceAll?.('Gamma')
  expect(editor.getMarkdown()).toContain('Beta Gamma')
})
