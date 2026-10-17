import { OFFICE_MIME } from './types.js'

/** Download a materialized current snapshot without changing the library save baseline. */
export function downloadDocxSnapshot(bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: OFFICE_MIME.docx }))
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'document-copy.docx'
    anchor.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
