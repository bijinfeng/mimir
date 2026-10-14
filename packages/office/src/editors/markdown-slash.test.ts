/** @vitest-environment happy-dom */
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownSlash, markdownSlashItems, type MarkdownSlashState } from './markdown-slash.js'

const live: Editor[] = []
afterEach(() => {
  for (const editor of live) editor.destroy()
  live.length = 0
})

function makeEditor() {
  let menu: MarkdownSlashState | null = null
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      Markdown,
      MarkdownSlash.configure({
        controller: {
          open: (state) => {
            menu = state
          },
          update: (state) => {
            menu = state
          },
          keyDown: () => false,
          close: () => {
            menu = null
          },
        },
      }),
    ],
    content: '',
    contentType: 'markdown',
  })
  live.push(editor)
  return { editor, menu: () => menu }
}

describe('Markdown slash menu', () => {
  it('filters only commands backed by the live schema', () => {
    const { editor } = makeEditor()
    expect(markdownSlashItems(editor, 'heading').map((item) => item.id)).toEqual(['h1', 'h2', 'h3'])
    expect(markdownSlashItems(editor, 'math')).toEqual([])
  })

  it('removes /query and writes through the shared operation executor', async () => {
    const harness = makeEditor()
    harness.editor.commands.insertContent('/h1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const menu = harness.menu()
    expect(menu?.items.map((item) => item.id)).toContain('h1')
    const heading = menu?.items.find((item) => item.id === 'h1')
    expect(heading).toBeDefined()
    menu?.command(heading!)
    expect(harness.editor.state.doc.firstChild?.type.name).toBe('heading')
    harness.editor.commands.insertContent('Hello')
    expect(harness.editor.getMarkdown()).toMatch(/^# Hello\n*$/)
  })
})
