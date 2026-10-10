import type { Editor } from '@tiptap/core'
import { applyLink } from './markdown-format.js'

export interface WikiMatch {
  from: number
  to: number
  query: string
}

/** 只在当前文本块的光标前寻找尚未闭合的 `[[`。 */
export function wikiMatchAtCaret(editor: Editor): string {
  const { selection, doc } = editor.state
  if (!selection.empty || !selection.$from.parent.isTextblock) return ''
  const from = selection.$from.start()
  const before = doc.textBetween(from, selection.from, '\n', '\ufffc')
  const open = before.lastIndexOf('[[')
  if (open < 0) return ''
  const query = before.slice(open + 2)
  if (query.length > 80 || /[\]\n]/.test(query)) return ''
  return JSON.stringify({ from: from + open, to: selection.from, query } satisfies WikiMatch)
}

/** 插入稳定 ID 链接，标题只是可编辑的显示文字。 */
export function insertInternalNoteLink(
  editor: Editor,
  match: WikiMatch,
  item: { id: string; title: string },
): void {
  editor
    .chain()
    .focus()
    .insertContentAt({ from: match.from, to: match.to }, [
      {
        type: 'text',
        text: item.title,
        marks: [{ type: 'link', attrs: { href: `/doc/${item.id}` } }],
      },
      { type: 'text', text: ' ' },
    ])
    .run()
}

/** 工具栏选笔记时保留已选文字；空光标则插入笔记标题。 */
export function linkExistingNote(editor: Editor, item: { id: string; title: string }): void {
  const href = `/doc/${item.id}`
  if (!editor.state.selection.empty || editor.isActive('link')) {
    applyLink(editor, href)
    return
  }
  editor
    .chain()
    .focus()
    .insertContent([
      { type: 'text', text: item.title, marks: [{ type: 'link', attrs: { href } }] },
      { type: 'text', text: ' ' },
    ])
    .run()
}
