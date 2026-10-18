/** Stable outline IDs share DOM order with the Markdown renderer. */
export interface Heading {
  id: string
  level: number
  text: string
}

const label = (text: string) =>
  text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\\([\\`*{}[\]()#+.!_>-])/g, '$1')
    .trim()

/** Fenced/indented code is never an outline entry. Both ATX and Setext headings render. */
export function extractHeadings(markdown: string): Heading[] {
  const out: Heading[] = []
  let fence: { marker: string; length: number } | null = null
  let previous = ''
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.replace(/^ {0,3}(?:> ?)+/, '')
    const fenced = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (
        fenced &&
        fenced[1]![0] === fence.marker &&
        fenced[1]!.length >= fence.length &&
        !fenced[2]!.trim()
      )
        fence = null
      previous = ''
      continue
    }
    if (fenced && !(fenced[1]![0] === '`' && fenced[2]!.includes('`'))) {
      fence = { marker: fenced[1]![0]!, length: fenced[1]!.length }
      previous = ''
      continue
    }
    if (/^(?: {4}|\t)/.test(line)) {
      previous = ''
      continue
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(line)
    const setext = previous.trim() && /^ {0,3}(=+|-+)\s*$/.exec(line)
    if (heading || setext) {
      const level = heading ? heading[1]!.length : setext && setext[1]![0] === '=' ? 1 : 2
      out.push({
        id: `h-${out.length}`,
        level: level <= 2 ? 2 : 3,
        text: label(heading ? (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '') : previous),
      })
      previous = ''
    } else previous = line
  }
  return out
}
