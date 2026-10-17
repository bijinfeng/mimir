import { Extension, type Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node } from '@tiptap/pm/model'
import { DOCX_PRIVACY_ATTR, docxPrivacyIntent } from '../docx-privacy-state.js'
import type { DocxSession } from '../docx.js'

export const DocxPrivacyExtension = Extension.create({
  name: 'mimirPrivacy',
  addGlobalAttributes: () => [
    { types: ['doc'], attributes: { [DOCX_PRIVACY_ATTR]: { default: null, rendered: false } } },
  ],
})
export function applyDocxPrivacy(
  editor: Editor,
  session: DocxSession,
  target: Node,
  value: boolean,
  original: boolean,
): Node {
  if (editor.isDestroyed || editor.state.doc !== target)
    throw new Error('文档已变化，请重新读取设置')
  const access = session.protection.getAccess()
  if (!access.writable || access.mandatoryTracking)
    throw new Error(access.reason ?? '原件编辑限制不允许更改个人信息设置')
  if ((docxPrivacyIntent(target.toJSON()) ?? original) === value) return target
  editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute(DOCX_PRIVACY_ATTR, value))
  if (editor.state.doc.attrs[DOCX_PRIVACY_ATTR] !== value)
    throw new Error('当前编辑限制不允许更改个人信息设置')
  editor.view.dispatch(closeHistory(editor.state.tr))
  return editor.state.doc
}
