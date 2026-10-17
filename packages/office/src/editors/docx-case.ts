import { Extension, type Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as PmNode, Mark } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'

/**
 * Semantics adapted from GenOffice case-transform.ts (Apache-2.0),
 * commit 480548fd55f1be3593ee0d8e316a734751d58309. Mimir computes case
 * across run boundaries and also recognizes Chinese fullwidth ! and ?.
 */
export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence'
export interface DocxCaseResult {
  changed: boolean
  message: string
}
export interface DocxCaseOptions {
  onResult?: (result: DocxCaseResult) => void
  onError?: (message: string) => void
}
export const DOCX_CASE_MODES = [
  { mode: 'sentence', label: '句首大写', example: 'Hello world.' },
  { mode: 'lower', label: '全部小写', example: 'hello world' },
  { mode: 'upper', label: '全部大写', example: 'HELLO WORLD' },
  { mode: 'title', label: '每词首字母大写', example: 'Hello World' },
] as const satisfies readonly { mode: CaseMode; label: string; example: string }[]

export function transformCase(text: string, mode: CaseMode): string {
  if (mode === 'upper') return text.toUpperCase()
  const lower = text.toLowerCase()
  if (mode === 'lower') return lower
  return mode === 'title'
    ? lower.replace(/(^|\s)(\p{L})/gu, (match) => match.toUpperCase())
    : lower.replace(/(^\s*\p{L})|([.!?。！？]\s*\p{L})/gu, (match) => match.toUpperCase())
}
export function nextCaseMode(text: string): CaseMode {
  const letters = text.replace(/\P{L}/gu, '')
  if (!letters) return 'lower'
  if (letters === letters.toLowerCase()) return 'upper'
  if (letters === letters.toUpperCase()) return 'title'
  return 'lower'
}

interface CaseLeaf {
  from: number
  to: number
  text: string
  marks: readonly Mark[]
  /** Position in the logical text, including paragraph/soft-break separators. */
  offset: number
}
export interface DocxCaseTarget {
  readonly editor: Editor
  readonly doc: PmNode
  readonly from: number
  readonly to: number
  readonly anchor: number
  readonly head: number
  readonly text: string
  readonly leaves: readonly CaseLeaf[]
  readonly reason: string | null
}
const blocks = new Set([
  'docParagraph',
  'docHeading',
  'docListItem',
  'docTable',
  'docTableRow',
  'docTableCell',
  'docTableHeader',
])
const marks = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'link',
  'comment',
  'docTextStyle',
  'formatOffClear',
])
const protectedAttrs = [
  'sdtShell',
  'moveRevision',
  'blockRevision',
  'pPrChange',
  'paraMarkDel',
  'cellRevision',
  'rowRevision',
]
const protectedMessage = '选区含域、修订或受保护内容，请重新选择普通文字'

/** Captures the real selection once; selection-only moves do not retarget it. */
export function docxCaseTarget(editor: Editor): DocxCaseTarget {
  const { doc, selection } = editor.state
  const { from, to, anchor, head } = selection
  let reason: string | null =
    editor.isDestroyed || !editor.isEditable
      ? '当前文档不可编辑'
      : !(selection instanceof TextSelection) || selection.empty
        ? '请先选择要转换的文字'
        : null
  const leaves: CaseLeaf[] = []
  let text = ''
  if (!reason) {
    doc.nodesBetween(from, to, (node, pos) => {
      if (reason) return false
      if (protectedAttrs.some((attr) => node.attrs[attr])) {
        reason = protectedMessage
        return false
      }
      if (node.isText) {
        if (node.marks.some((mark) => !marks.has(mark.type.name) || mark.attrs.vanish === true)) {
          reason = protectedMessage
          return false
        }
        const start = Math.max(from, pos),
          end = Math.min(to, pos + node.nodeSize)
        const slice = node.text!.slice(start - pos, end - pos)
        if (/[\uD800-\uDFFF]/u.test(slice)) {
          reason = '选区截断了完整字符，请重新选择文字'
          return false
        }
        if (slice) {
          leaves.push({ from: start, to: end, text: slice, marks: node.marks, offset: text.length })
          text += slice
        }
      } else if (node.type.name === 'hardBreak') text += '\n'
      else if (!blocks.has(node.type.name)) {
        reason = protectedMessage
        return false
      } else if (node.isTextblock && text) text += '\n'
      return undefined
    })
    if (!reason && !leaves.length) reason = '请先选择要转换的文字'
  }
  return { editor, doc, from, to, anchor, head, text, leaves, reason }
}

/**
 * Lowercase the complete logical string first (Greek final sigma is contextual).
 * Scalar conversion lengths then assign the output back to its original marks.
 * A proof against the full transform prevents a partial/incorrect rewrite.
 */
function mappedCase(text: string, mode: CaseMode): Map<number, string> {
  const base = mode === 'upper' ? text.toUpperCase() : text.toLowerCase()
  const capitals = new Set<number>()
  if (mode === 'title' || mode === 'sentence') {
    const regex = mode === 'title' ? /(^|\s)(\p{L})/gu : /(^\s*\p{L})|([.!?。！？]\s*\p{L})/gu
    for (const match of base.matchAll(regex)) {
      const letter = [...match[0]].at(-1)!
      capitals.add(match.index + match[0].length - letter.length)
    }
  }
  const result = new Map<number, string>()
  let sourceOffset = 0,
    baseOffset = 0
  for (const scalar of text) {
    const length = (mode === 'upper' ? scalar.toUpperCase() : scalar.toLowerCase()).length
    const chunk = base.slice(baseOffset, baseOffset + length)
    let next = '',
      at = baseOffset
    for (const char of chunk) {
      next += capitals.has(at) ? char.toUpperCase() : char
      at += char.length
    }
    result.set(sourceOffset, next)
    sourceOffset += scalar.length
    baseOffset += length
  }
  if (baseOffset !== base.length || [...result.values()].join('') !== transformCase(text, mode))
    throw new Error('无法安全转换这段文字，请缩小选区后重试')
  return result
}

/** Preflights the entire range, then dispatches one transaction preserving marks. */
export function applyDocxCase(
  editor: Editor,
  target: DocxCaseTarget,
  mode: CaseMode,
): DocxCaseResult {
  if (editor.isDestroyed || !editor.isEditable) throw new Error('当前文档不可编辑')
  if (target.editor !== editor || editor.state.doc !== target.doc)
    throw new Error('文档已变化，请重新打开大小写菜单')
  if (target.reason) throw new Error(target.reason)
  const output = mappedCase(target.text, mode)
  const replacements = target.leaves.map((leaf) => {
    let next = '',
      offset = leaf.offset
    for (const char of leaf.text) {
      const piece = output.get(offset)
      if (piece === undefined) throw new Error('无法安全转换这段文字，请重新选择')
      next += piece
      offset += char.length
    }
    return { ...leaf, next }
  })
  const tr = closeHistory(editor.state.tr)
  for (const leaf of replacements) {
    if (leaf.next === leaf.text) continue
    tr.replaceWith(
      tr.mapping.map(leaf.from),
      tr.mapping.map(leaf.to),
      editor.schema.text(leaf.next, leaf.marks),
    )
  }
  if (!tr.docChanged) return { changed: false, message: '所选文字无需转换' }
  const end = target.to + tr.doc.content.size - target.doc.content.size
  const reverse = target.anchor > target.head
  tr.setSelection(
    TextSelection.create(tr.doc, reverse ? end : target.from, reverse ? target.from : end),
  )
  editor.view.dispatch(tr)
  // A metadata-only boundary keeps the next keystroke out of this undo event.
  // The text/marks/selection were changed together in the single transaction above.
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  return { changed: true, message: '已转换所选文字' }
}

/** Local editor keymap: never captures a toolbar/Inspector input's key events. */
export const DocxCaseExtension = Extension.create<DocxCaseOptions>({
  name: 'mimirCase',
  addOptions() {
    return {}
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (
              event.key !== 'F3' ||
              !event.shiftKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.isComposing
            )
              return false
            const origin = event.target instanceof Element ? event.target : null
            const editable = origin?.closest('[contenteditable]')
            const form = origin?.closest(
              'input, textarea, select, [role="textbox"], [role="combobox"]',
            )
            if (
              (form && form !== view.dom) ||
              (editable && editable !== view.dom && view.dom.contains(editable))
            )
              return false
            const target = docxCaseTarget(this.editor)
            try {
              const result = applyDocxCase(this.editor, target, nextCaseMode(target.text))
              this.options.onResult?.(result)
            } catch (cause) {
              this.options.onError?.(cause instanceof Error ? cause.message : String(cause))
            }
            return true
          },
        },
      }),
    ]
  },
})
