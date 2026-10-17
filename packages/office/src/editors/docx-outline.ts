import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { DocxSession } from '../docx.js'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import type { DocxHeading } from './docx-view.js'

export interface DocxOutlineContext {
  documentId: string
  editor: Editor
  session: DocxSession
  handle: DocxAgentHandle | null
}
export interface DocxOutlineTarget extends DocxOutlineContext {
  heading: DocxHeading
  version: number
  epoch: number
  doc: PmNode
  node: PmNode
}
const protectedAttrs = ['sdtShell', 'moveRevision', 'blockRevision', 'pPrChange', 'paraMarkDel']
export function docxOutlineLevelReason(target: DocxOutlineTarget): string | null {
  if (target.heading.kind === 'numbered') return '编号标题请通过列表与样式工具调整层级'
  if (protectedAttrs.some((key) => target.node.attrs[key]))
    return '此标题含修订或受保护结构，暂不支持调整层级'
  let unsafe = false
  target.node.descendants((node) => {
    if (
      (!node.isText && node.type.name !== 'hardBreak') ||
      node.marks.some(
        (mark) =>
          ![
            'bold',
            'italic',
            'underline',
            'strike',
            'link',
            'comment',
            'docTextStyle',
            'formatOffClear',
          ].includes(mark.type.name) || mark.attrs.vanish === true,
      )
    )
      unsafe = true
  })
  return unsafe ? '此标题含域或特殊内联内容，暂不支持调整层级' : null
}
export function captureDocxOutlineTarget(
  context: DocxOutlineContext,
  heading: DocxHeading,
): DocxOutlineTarget {
  const node = context.editor.state.doc.nodeAt(heading.position)
  if (!node || context.editor.state.doc.child(heading.blockIndex) !== node)
    throw new Error('标题位置已变化，请重新选择标题')
  return {
    ...context,
    heading,
    node,
    doc: context.editor.state.doc,
    version: context.handle?.getVersion() ?? -1,
    epoch: context.session.protection.getAccess().epoch,
  }
}
export function docxOutlineStaleReason(
  target: DocxOutlineTarget,
  context: DocxOutlineContext,
): string | null {
  if (
    target.documentId !== context.documentId ||
    target.session !== context.session ||
    target.editor !== context.editor ||
    target.handle !== context.handle ||
    context.editor.isDestroyed ||
    !context.handle ||
    context.handle.getVersion() !== target.version ||
    context.session.protection.getAccess().epoch !== target.epoch ||
    context.editor.state.doc !== target.doc ||
    context.editor.state.doc.nodeAt(target.heading.position) !== target.node
  )
    return '文档已修改，请重新选择标题'
  return null
}
export function assertDocxOutlineTarget(
  target: DocxOutlineTarget,
  context: DocxOutlineContext,
): void {
  const reason = docxOutlineStaleReason(target, context)
  if (reason) throw new Error(reason)
  context.session.protection.assertWrite()
}
