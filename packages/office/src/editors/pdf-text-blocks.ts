import type { PdfTextBlockProbe } from '@mimir/shared'
import type { PdfRect, PdfTextIndex } from './pdf-text.js'

export interface PdfTextBlock {
  page: number
  blockIndex: number
  text: string
  /** Display page proportions, using the text index's current viewport. */
  rect: PdfRect
  pdfRect: [number, number, number, number]
  items: PdfTextBlockProbe['items']
}
type Chunk = PdfTextIndex['pages'][number]['chunks'][number]
/** Whitespace-insensitive NFKC occurrences, with exact UTF-16 source boundaries. */
export function pdfTextOccurrences(text: string, needle: string): { start: number; end: number }[] {
  const units: string[] = [],
    starts: number[] = [],
    ends: number[] = []
  let offset = 0
  for (const char of text) {
    for (const unit of char.normalize('NFKC'))
      if (!/\s/.test(unit)) {
        units.push(unit)
        starts.push(offset)
        ends.push(offset + char.length)
      }
    offset += char.length
  }
  const wanted = [...needle.normalize('NFKC')].filter((char) => !/\s/.test(char)),
    results: { start: number; end: number }[] = []
  if (!wanted.length) return results
  for (let at = 0; at <= units.length - wanted.length; at++) {
    if (!wanted.every((unit, i) => units[at + i] === unit)) continue
    const end = at + wanted.length - 1
    if (
      (at > 0 && starts[at]! < ends[at - 1]!) ||
      (end + 1 < units.length && starts[end + 1]! < ends[end]!)
    )
      continue
    results.push({ start: starts[at]!, end: ends[end]! })
    at = end
  }
  return results
}
interface Line {
  chunks: Chunk[]
  bounds: [number, number, number, number]
  size: number
  text: string
}
const union = (boxes: readonly (readonly number[])[]): [number, number, number, number] => [
  Math.min(...boxes.map((box) => box[0]!)),
  Math.min(...boxes.map((box) => box[1]!)),
  Math.max(...boxes.map((box) => box[2]!)),
  Math.max(...boxes.map((box) => box[3]!)),
]
const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) / 2)]!
function line(chunks: Chunk[]): Line {
  let text = ''
  for (const [index, chunk] of chunks.entries()) {
    const previous = chunks[index - 1]
    if (
      previous &&
      chunk.pdfRect[0] - previous.pdfRect[2] > chunk.fontSizeHint * 0.15 &&
      !/\s$/.test(text) &&
      !/^\s/.test(chunk.sourceText)
    )
      text += ' '
    text += chunk.sourceText
  }
  return {
    chunks,
    bounds: union(chunks.map((chunk) => chunk.pdfRect)),
    size: median(chunks.map((chunk) => chunk.fontSizeHint)),
    text,
  }
}

/** Conservative original-space clustering, shared by pointer selection and host verification. */
export function groupPdfTextBlocks(index: PdfTextIndex, page: number): PdfTextBlock[] {
  const chunks = [...(index.pages[page]?.chunks ?? [])].filter(
    (chunk) =>
      chunk.sourceText.trim() &&
      chunk.fontSizeHint > 0 &&
      chunk.pdfRect.every(Number.isFinite) &&
      chunk.pdfRect[2] > chunk.pdfRect[0] &&
      chunk.pdfRect[3] > chunk.pdfRect[1],
  )
  chunks.sort((a, b) => b.pdfRect[1] - a.pdfRect[1] || a.pdfRect[0] - b.pdfRect[0])
  const rows: Chunk[][] = []
  for (const chunk of chunks) {
    const row = rows.at(-1),
      anchor = row?.[0]
    if (
      row &&
      anchor &&
      Math.abs(chunk.pdfRect[1] - anchor.pdfRect[1]) <=
        Math.max(chunk.fontSizeHint, anchor.fontSizeHint) * 0.3
    )
      row.push(chunk)
    else rows.push([chunk])
  }
  const lines: Line[] = []
  for (const row of rows) {
    row.sort((a, b) => a.pdfRect[0] - b.pdfRect[0])
    let segment: Chunk[] = []
    for (const chunk of row) {
      const previous = segment.at(-1)
      if (
        previous &&
        chunk.pdfRect[0] - previous.pdfRect[2] >
          Math.max(chunk.fontSizeHint, previous.fontSizeHint) * 1.2
      ) {
        lines.push(line(segment))
        segment = []
      }
      segment.push(chunk)
    }
    if (segment.length) lines.push(line(segment))
  }
  lines.sort((a, b) => b.bounds[1] - a.bounds[1] || a.bounds[0] - b.bounds[0])
  const paragraphs: { lines: Line[]; leads: number[] }[] = []
  for (const current of lines) {
    let best: (typeof paragraphs)[number] | undefined
    let overlap = 0
    for (const paragraph of paragraphs) {
      const previous = paragraph.lines.at(-1)!,
        gap = previous.bounds[1] - current.bounds[1],
        size = Math.max(previous.size, current.size),
        box = union(paragraph.lines.map((item) => item.bounds)),
        width = Math.min(box[2] - box[0], current.bounds[2] - current.bounds[0]),
        intersection = Math.min(box[2], current.bounds[2]) - Math.max(box[0], current.bounds[0])
      if (
        gap <= 0 ||
        gap > (paragraph.leads.length ? median(paragraph.leads) * 1.45 : size * 2.1) ||
        Math.abs(previous.size - current.size) > size * 0.1 ||
        intersection < width * 0.6 ||
        intersection <= overlap
      )
        continue
      best = paragraph
      overlap = intersection
    }
    if (best) {
      best.leads.push(best.lines.at(-1)!.bounds[1] - current.bounds[1])
      best.lines.push(current)
    } else paragraphs.push({ lines: [current], leads: [] })
  }
  // A short closing line ends a left-set paragraph even with identical leading.
  const split: Line[][] = []
  for (const paragraph of paragraphs) {
    const box = union(paragraph.lines.map((item) => item.bounds))
    const leftSet = paragraph.lines.every(
      (item) => Math.abs(item.bounds[0] - box[0]) <= item.size * 0.6,
    )
    let current: Line[] = []
    for (const item of paragraph.lines) {
      const previous = current.at(-1),
        firstToken = /^\S+/.exec(item.text.trimStart())?.[0] ?? ''
      const firstWidth = /^[\u2e80-\u9fff]/.test(firstToken)
        ? item.size * 2
        : firstToken.length * item.size * 0.6
      if (previous && leftSet && box[2] - previous.bounds[2] > firstWidth + item.size * 1.5) {
        split.push(current)
        current = []
      }
      current.push(item)
    }
    if (current.length) split.push(current)
  }
  split.sort((a, b) => b[0]!.bounds[1] - a[0]!.bounds[1] || a[0]!.bounds[0] - b[0]!.bounds[0])
  return split.map((paragraph, blockIndex) => {
    const members = paragraph.flatMap((item) => item.chunks)
    const display = union(
      members.map(({ rect }) => [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height]),
    )
    return {
      page,
      blockIndex,
      text: paragraph.map((item) => item.text).join('\n'),
      rect: {
        x: display[0],
        y: display[1],
        width: display[2] - display[0],
        height: display[3] - display[1],
      },
      pdfRect: union(members.map((chunk) => chunk.pdfRect)),
      items: members.map((chunk) => ({ text: chunk.sourceText, bounds: [...chunk.pdfRect] })),
    }
  })
}

export function pickPdfTextBlock(
  index: PdfTextIndex,
  page: number,
  x: number,
  y: number,
): PdfTextBlock | null {
  if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x > 1 || y > 1) return null
  const matches = groupPdfTextBlocks(index, page).filter(
    ({ rect }) =>
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height,
  )
  return matches.length === 1 ? matches[0]! : null
}

/** The difference of two inverse-viewport points cancels CropBox translation. */
export function pdfTextBlockDelta(
  viewport: { convertToPdfPoint(x: number, y: number): number[] },
  dx: number,
  dy: number,
): [number, number] {
  const a = viewport.convertToPdfPoint(0, 0),
    b = viewport.convertToPdfPoint(dx, dy)
  return [b[0]! - a[0]!, b[1]! - a[1]!]
}
