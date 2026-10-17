import { Extension, type Editor } from '@tiptap/core'
import { Plugin, type Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as PmNode } from '@tiptap/pm/model'
import {
  INK_ANCHOR,
  INK_ATTR,
  INK_PARAGRAPHS,
  MAX_INK_STROKES,
  encodeInkPayload,
  inkAnnotations,
  type InkStroke,
} from '../docx-ink-model.js'
let sequence = 0
const newId = () => `ink-${Date.now().toString(36)}-${++sequence}`
export const DocxInkExtension = Extension.create({
  name: 'mimirInk',
  addGlobalAttributes() {
    return [
      { types: ['doc'], attributes: { [INK_ATTR]: { default: null, rendered: false } } },
      {
        types: [...INK_PARAGRAPHS, 'docProtected', 'docTable'],
        attributes: { [INK_ANCHOR]: { default: null, rendered: false } },
      },
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const groups = new Map<string, number[]>()
          newState.doc.forEach((node, pos) => {
            const id = node.attrs[INK_ANCHOR]
            if (typeof id === 'string') groups.set(id, [...(groups.get(id) ?? []), pos])
          })
          const tr = newState.tr
          for (const [id, positions] of groups) {
            if (positions.length < 2) continue
            let oldPos: number | undefined
            oldState.doc.forEach((node, pos) => {
              if (node.attrs[INK_ANCHOR] === id) oldPos = pos
            })
            let mapped = oldPos
            if (mapped !== undefined)
              for (const transaction of transactions) mapped = transaction.mapping.map(mapped, 1)
            const keep = mapped !== undefined && positions.includes(mapped) ? mapped : positions[0]
            for (const pos of positions)
              if (pos !== keep) tr.setNodeAttribute(pos, INK_ANCHOR, null)
          }
          return tr.docChanged ? tr : null
        },
      }),
    ]
  },
})
function dispatchInk(editor: Editor, doc: PmNode, apply: (tr: Transaction) => void) {
  if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== doc)
    throw new Error('正文已变化，请重新操作笔迹')
  const tr = closeHistory(editor.state.tr)
  apply(tr)
  if (tr.docChanged) {
    editor.view.dispatch(tr)
    editor.view.dispatch(closeHistory(editor.state.tr))
  }
}
export function addDocxInk(
  editor: Editor,
  doc: PmNode,
  position: number,
  stroke: InkStroke,
): string {
  encodeInkPayload(stroke)
  const node = doc.nodeAt(position),
    annotations = inkAnnotations(doc)
  if (!node || !INK_PARAGRAPHS.has(node.type.name)) throw new Error('请在可编辑正文段落上绘图')
  if (annotations.length >= MAX_INK_STROKES) throw new Error('最多保留500笔，请先清理笔迹')
  const anchor = typeof node.attrs[INK_ANCHOR] === 'string' ? node.attrs[INK_ANCHOR] : newId(),
    id = newId()
  dispatchInk(editor, doc, (tr) => {
    if (node.attrs[INK_ANCHOR] !== anchor) tr.setNodeAttribute(position, INK_ANCHOR, anchor)
    tr.setDocAttribute(INK_ATTR, [...annotations, { id, anchor, stroke }])
  })
  return id
}
export function removeDocxInk(editor: Editor, doc: PmNode, ids: readonly string[]) {
  const removing = new Set(ids),
    current = inkAnnotations(doc)
  const next = current.filter((ink) => !ink.stroke || !removing.has(ink.id))
  if (next.length !== current.length)
    dispatchInk(editor, doc, (tr) => tr.setDocAttribute(INK_ATTR, next))
}

export interface InkUiState {
  enabled: boolean
  tool: import('../docx-ink-model.js').InkTool
  penColor: string
  penWidth: number
  highlighterColor: string
  highlighterWidth: number
  selected: string | null
}
export function createInkController(identity?: unknown) {
  let state: InkUiState = {
    enabled: false,
    tool: 'pen',
    penColor: '1F2937',
    penWidth: 2,
    highlighterColor: 'FFE066',
    highlighterWidth: 14,
    selected: null,
  }
  const listeners = new Set<() => void>()
  return {
    identity,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update: (patch: Partial<InkUiState>) => {
      state = { ...state, ...patch }
      listeners.forEach((listener) => listener())
    },
  }
}
export type InkController = ReturnType<typeof createInkController>
