import type { PmDocJson } from './docx.js'
/** The only encryption data permitted in document/history JSON. Secrets stay in a closure. */
export const DOCX_ENCRYPTION_ATTR = 'mimirOpeningEncryption'
export const isDocxEncryptionToken = (token: unknown): token is string =>
  typeof token === 'string' &&
  /^enc:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token)
export function docxEncryptionToken(doc: Pick<PmDocJson, 'attrs'>): string | null {
  const token = doc.attrs?.[DOCX_ENCRYPTION_ATTR]
  if (token === null || token === undefined) return null
  if (!isDocxEncryptionToken(token)) throw new Error('打开密码设置无效，请重新打开文档')
  return token
}
export function projectDocxEncryption(doc: PmDocJson): PmDocJson {
  docxEncryptionToken(doc)
  if (!doc.attrs || !Object.hasOwn(doc.attrs, DOCX_ENCRYPTION_ATTR)) return doc
  const { [DOCX_ENCRYPTION_ATTR]: _token, ...attrs } = doc.attrs
  return { ...doc, attrs }
}
