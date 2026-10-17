import { Extension, type Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node } from '@tiptap/pm/model'
import type { DocxSession } from '../docx.js'
import { DOCX_ENCRYPTION_ATTR } from '../docx-encryption-state.js'
import {
  createDocxEncryptionIntent,
  discardDocxEncryptionIntent,
} from '../docx-encrypted-session.js'
export const DocxEncryptionExtension = Extension.create({
  name: 'mimirOpeningEncryption',
  addGlobalAttributes: () => [
    { types: ['doc'], attributes: { [DOCX_ENCRYPTION_ATTR]: { default: null, rendered: false } } },
  ],
})
export function applyDocxEncryption(
  editor: Editor,
  session: DocxSession,
  target: Node,
  password: string | null,
) {
  if (editor.isDestroyed || editor.state.doc !== target)
    throw new Error('文档已变化，请重新读取设置')
  const access = session.protection.getAccess()
  if (!access.writable || access.mandatoryTracking)
    throw new Error(access.reason ?? '原件编辑限制不允许更改打开密码')
  const token = createDocxEncryptionIntent(session, password)
  try {
    editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute(DOCX_ENCRYPTION_ATTR, token))
  } catch (cause) {
    discardDocxEncryptionIntent(session, token)
    throw cause
  }
  if (editor.state.doc.attrs[DOCX_ENCRYPTION_ATTR] !== token) {
    discardDocxEncryptionIntent(session, token)
    throw new Error('当前编辑限制不允许更改打开密码')
  }
  editor.view.dispatch(closeHistory(editor.state.tr))
  return editor.state.doc
}
