/** @vitest-environment happy-dom */
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  insertInternalNoteLink,
  linkExistingNote,
  wikiMatchAtCaret,
  type WikiMatch,
} from '@mimir/office/note-links'
import { createExtensions } from './extensions.js'

const editors: Editor[] = []

afterEach(() => {
  for (const editor of editors) editor.destroy()
  editors.length = 0
})

function editorFor(body: string): Editor {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: createExtensions(),
    content: body,
    contentType: 'markdown',
  })
  editors.push(editor)
  editor.commands.setTextSelection(editor.state.doc.content.size - 1)
  return editor
}

describe('`[[` 笔记内链', () => {
  it('只识别光标前未闭合的候选，并用真实方言序列化为稳定 ID 链接', () => {
    const editor = editorFor('参见 [[mimir')
    const match = JSON.parse(wikiMatchAtCaret(editor)) as WikiMatch
    expect(match.query).toBe('mimir')

    insertInternalNoteLink(editor, match, { id: 'stable-id_123', title: 'mimir 产品说明' })
    expect(editor.getMarkdown()).toContain('[mimir 产品说明](/doc/stable-id_123)')
    expect(editor.getMarkdown()).not.toContain('[[')
    expect(wikiMatchAtCaret(editor)).toBe('')
  })

  it('已闭合的双括号不触发候选', () => {
    const editor = editorFor('已经写好 [[mimir]]')
    expect(wikiMatchAtCaret(editor)).toBe('')
  })
})

describe('工具栏链接到已有笔记', () => {
  it('把所选文字保留为链接文字', () => {
    const editor = editorFor('read target now')
    editor.commands.setTextSelection({ from: 6, to: 12 })
    linkExistingNote(editor, { id: 'stable-id', title: 'Target Note' })
    expect(editor.getMarkdown()).toContain('read [target](/doc/stable-id) now')
  })

  it('空光标处插入笔记标题和稳定 ID 链接', () => {
    const editor = editorFor('read')
    linkExistingNote(editor, { id: 'stable-id', title: 'Target Note' })
    expect(editor.getMarkdown()).toContain('[Target Note](/doc/stable-id)')
  })
})
