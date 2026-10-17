import type { PmDocJson } from './docx.js'

/** Session-local history intent. Null always means the immutable opened source. */
export const DOCX_PRIVACY_ATTR = 'mimirPrivacy'
export function docxPrivacyIntent(doc: Pick<PmDocJson, 'attrs'>): boolean | undefined {
  const value = doc.attrs?.[DOCX_PRIVACY_ATTR]
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error('个人信息设置无效，请重新打开文档')
  return value
}
export function projectDocxPrivacy(doc: PmDocJson): PmDocJson {
  docxPrivacyIntent(doc)
  if (!doc.attrs || !(DOCX_PRIVACY_ATTR in doc.attrs)) return doc
  const { [DOCX_PRIVACY_ATTR]: _intent, ...attrs } = doc.attrs
  return { ...doc, attrs }
}
