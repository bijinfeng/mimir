import type { Paragraph } from '../vendor/packages/pptx-engine/src/types.js'
import { normalizePptxTextSelection, type PptxTextSelection } from './pptx-text-range.js'

/** Hard paragraph separators count once; soft-break runs stay inside their paragraph. */
export function pptxParagraphIndices(
  paragraphs: readonly Paragraph[],
  selection: PptxTextSelection | null,
): number[] {
  if (!selection) return paragraphs.map((_, index) => index)
  const range = normalizePptxTextSelection(paragraphs, selection)
  let start = 0
  return paragraphs.flatMap((paragraph, index) => {
    const end = start + paragraph.runs.reduce((length, run) => length + run.text.length, 0)
    const next = end + (index < paragraphs.length - 1 ? 1 : 0)
    const touches =
      range.start === range.end
        ? range.start >= start && range.start <= end
        : start < range.end && next > range.start
    start = next
    return touches ? [index] : []
  })
}

export function uniformPptxParagraphValue<T>(
  paragraphs: readonly Paragraph[],
  indices: readonly number[],
  read: (paragraph: Paragraph) => T,
): T | null {
  const selected = indices.map((index) => paragraphs[index]).filter((p): p is Paragraph => !!p)
  if (!selected.length) return null
  const first = read(selected[0]!)
  return selected.every((paragraph) => Object.is(read(paragraph), first)) ? first : null
}

export function pptxParagraphScope(
  indices: readonly number[],
  selection: PptxTextSelection | null,
): string {
  if (!selection) return `整个文本框 · ${indices.length} 段`
  if (indices.length === 1)
    return `第 ${indices[0]! + 1} 段${selection.start === selection.end ? ' · 光标所在段' : ''}`
  return `第 ${indices[0]! + 1}–${indices.at(-1)! + 1} 段 · 共 ${indices.length} 段`
}
