import type { EditorView } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'
import type { DocxProtectionController } from '../docx-protection.js'
import { TRACK_IGNORE } from '../../vendor/apps/docs/src/renderer/editor/revisions.js'

/** The controller revalidates the entire document, including marks and native occurrence identity. */
export function toggleProtectedForm(
  view: EditorView,
  controller: DocxProtectionController,
  id: string,
): void {
  const current = controller.readFormControls(view.state.doc.toJSON()).find((c) => c.id === id)
  if (
    !controller.getAccess().formsOnly ||
    !current ||
    current.reason ||
    current.from === null ||
    current.to === null
  )
    throw new Error(current?.reason ?? '此复选框当前不能填写')
  const node = view.state.doc.resolve(current.from).nodeAfter
  if (!node?.isText || !node.text) throw new Error('复选框已变化，请重新选择')
  // Only validated native controls reach here. Read the original pair from the controller,
  // not a permissive glyph/mark parser; the next state is checked by the same full guard.
  const next = controller.formToggleText(id, view.state.doc.toJSON())
  const tr = closeHistory(view.state.tr).replaceWith(
    current.from,
    current.to,
    view.state.schema.text(next, node.marks),
  )
  tr.setSelection(TextSelection.create(tr.doc, current.from + next.length))
  tr.setMeta(TRACK_IGNORE, true)
  if (!controller.allowsFormTransaction(tr.doc.toJSON()))
    throw new Error('复选框填写校验失败，原件未修改')
  const before = view.state.doc
  view.dispatch(tr)
  if (view.state.doc === before) throw new Error('当前编辑器拒绝了复选框修改')
}
