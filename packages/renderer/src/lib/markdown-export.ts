/** Export a snapshot of the live body, together with the note's current saved YAML properties. */
export function downloadMarkdownNote(title: string, markdown: string, yaml: string): void {
  const filename = (title.trim().replace(/[<>:"/\\|?*\p{Cc}]/gu, '_') || '未命名笔记')
    .replace(/\.md$/i, '')
    .slice(0, 180)
  const body = yaml.trim() ? `---\n${yaml.replace(/\n+$/, '')}\n---\n\n${markdown}` : markdown
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.md`
  anchor.hidden = true
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    // Let the browser start the download before releasing the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
