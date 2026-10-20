export type ReleaseNotes = string | { version: string; note: string | null }[] | null | undefined

/** Display text only. Never pass the result to an HTML/Markdown renderer or an external opener. */
function noteText(note: string): string {
  return note
    .replace(/\r\n?/g, '\n')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key: string) => {
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
      }
      if (!key.startsWith('#')) return named[key.toLowerCase()] ?? entity
      const value =
        key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1))
      return value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
        ? String.fromCodePoint(value)
        : ''
    })
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<(?:br\b[^>]*|\/(?:p|div|h[1-6]|li|ul|ol|blockquote))\s*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/!?\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
    .replace(/!?\[([^\]\n]*)\]\[[^\]\n]*\]/g, '$1')
    .replace(/^\s{0,3}\[[^\]\n]+\]:[^\n]*$/gm, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gm, '')
    .replace(/^\s{0,3}(?:```|~~~)[^\n]*$/gm, '')
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, '')
    .replace(/^(\s*)[-+*]\s+(?:\[[ xX]\]\s*)?/gm, '$1• ')
    .replace(/(\*\*|__|~~)([^\n]+?)\1/g, '$2')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_(?=$|\s|[.,!?:，。！？、：])/gm, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** GitHub API Markdown and electron-updater's HTML/multi-version notes share one text contract. */
export function normalizeReleaseNotes(notes: ReleaseNotes): string | undefined {
  const entries =
    typeof notes === 'string' ? [notes] : (notes?.map((entry) => entry.note ?? '') ?? [])
  return entries.map(noteText).filter(Boolean).join('\n\n') || undefined
}
