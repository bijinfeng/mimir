/** A presentation window is an isolated viewer, never a same-origin HTML execution surface. */
export function htmlPresentationDocument(html: string): string {
  const escaped = html.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>HTML 演示</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block}</style></head><body><iframe title="HTML 演示" sandbox="allow-scripts allow-forms allow-popups allow-modals" referrerpolicy="no-referrer" srcdoc="${escaped}"></iframe></body></html>`
}

export function downloadHtml(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'page.html'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function openHtmlPresentation(html: string): boolean {
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.opener = null
  const url = URL.createObjectURL(new Blob([htmlPresentationDocument(html)], { type: 'text/html' }))
  popup.location.replace(url)
  // Retain the blob until the independent viewer has had time to navigate.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
