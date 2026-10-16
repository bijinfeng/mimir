// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { afterEach, expect, it } from 'vitest'
import { createExtensions } from './extensions'
import {
  MarkdownSlash,
  markdownSlashItems,
  type MarkdownSlashState,
} from '../../../office/src/editors/markdown-slash'

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function open(markdown: string, editable = true) {
  const mount = document.createElement('div')
  let menu: MarkdownSlashState | null = null
  const editor = new Editor({
    element: mount,
    extensions: [
      ...createExtensions(),
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
    content: markdown,
    contentType: 'markdown',
    editable,
  })
  editors.push(editor)
  return { editor, mount, menu: () => menu }
}

it('parses, visibly renders, edits and serializes a real $$ dialect node', () => {
  const { editor, mount } = open('前文\n\n$$\nE = mc^2\n$$\n\n后文')
  expect(editor.state.doc.child(1).type.name).toBe('mathBlock')
  expect(mount.querySelector('.katex')).not.toBeNull()
  const source = mount.querySelector<HTMLTextAreaElement>('.mimir-math-block__source')!
  source.value = '\\frac{1}{2}'
  source.dispatchEvent(new Event('input', { bubbles: true }))
  expect(mount.querySelector('.katex')).not.toBeNull()
  expect(editor.getMarkdown()).toContain('$$\n\\frac{1}{2}\n$$')
  const reopened = open(editor.getMarkdown(), false)
  expect(reopened.editor.state.doc.child(1).type.name).toBe('mathBlock')
  expect(reopened.mount.querySelector('.katex')).not.toBeNull()
  expect(reopened.mount.querySelector('textarea')).toBeNull()
})

it('shows the source for invalid formulas and never interprets HTML from the formula', () => {
  const formula = '\\notACommand{<img src=x onerror=alert(1)>}'
  const { editor, mount } = open(`$$\n${formula}\n$$`)
  expect(mount.querySelector('.mimir-math-block__error')?.textContent).toBe(formula)
  expect(mount.querySelector('img')).toBeNull()
  expect(editor.getMarkdown()).toBe(`$$\n${formula}\n$$`)
})

it('offers /math only with the host node, then inserts a formula rather than a code block', async () => {
  const { editor, menu } = open('')
  expect(markdownSlashItems(editor, 'math').map((item) => item.id)).toEqual(['math'])
  editor.commands.insertContent('/math')
  await new Promise((resolve) => setTimeout(resolve, 0))
  const item = menu()?.items.find((entry) => entry.id === 'math')
  expect(item).toBeDefined()
  menu()?.command(item!)
  expect(editor.getMarkdown()).toContain('$$\nx^2 + y^2 = z^2\n$$')
  expect(
    [...Array(editor.state.doc.childCount)].some(
      (_, index) => editor.state.doc.child(index).type.name === 'mathBlock',
    ),
  ).toBe(true)
})
