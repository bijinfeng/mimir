import { describe, expect, it } from 'vitest'
import type { Paragraph } from '../vendor/packages/pptx-engine/src/types.js'
import {
  pptxParagraphIndices,
  pptxParagraphScope,
  uniformPptxParagraphValue,
} from './pptx-paragraph-range.js'
const paragraphs: Paragraph[] = [
  { runs: [{ text: 'A🚀' }, { text: '\n' }, { text: 'B' }], align: 'left' },
  { runs: [], align: 'right' },
  { runs: [{ text: '23', field: 'slidenum' }], align: 'right' },
  { runs: [{ text: '尾段' }], align: 'right' },
]
describe('PPTX real selection to paragraph scope', () => {
  it('uses hard separators and UTF16 offsets while keeping soft breaks and fields within their paragraph', () => {
    // "A🚀\nB"(5), hard separator(1), empty(0), separator(1), field(2), separator(1), "尾段"(2).
    expect(pptxParagraphIndices(paragraphs, null)).toEqual([0, 1, 2, 3])
    for (const at of [0, 1, 2, 3, 4, 5])
      expect(pptxParagraphIndices(paragraphs, { start: at, end: at })).toEqual([0])
    expect(pptxParagraphIndices(paragraphs, { start: 6, end: 6 })).toEqual([1])
    for (const at of [7, 8, 9])
      expect(pptxParagraphIndices(paragraphs, { start: at, end: at })).toEqual([2])
    expect(pptxParagraphIndices(paragraphs, { start: 10, end: 10 })).toEqual([3])
  })
  it('treats range end as exclusive, including empty paragraphs only when actually touched', () => {
    expect(pptxParagraphIndices(paragraphs, { start: 2, end: 6 })).toEqual([0])
    expect(pptxParagraphIndices(paragraphs, { start: 5, end: 7 })).toEqual([0, 1])
    expect(pptxParagraphIndices(paragraphs, { start: 6, end: 10 })).toEqual([1, 2])
    expect(pptxParagraphIndices(paragraphs, { start: 9, end: 10 })).toEqual([2])
    expect(pptxParagraphIndices(paragraphs, { start: 12, end: 7 })).toEqual([2, 3])
  })
  it('handles empty text, last caret, normalized out-of-bounds and mixed values without taking the first paragraph', () => {
    expect(pptxParagraphIndices([{ runs: [] }], { start: 0, end: 0 })).toEqual([0])
    expect(pptxParagraphIndices([], null)).toEqual([])
    expect(pptxParagraphIndices(paragraphs, { start: 100, end: 100 })).toEqual([3])
    expect(uniformPptxParagraphValue(paragraphs, [0, 1], (p) => p.align)).toBeNull()
    expect(uniformPptxParagraphValue(paragraphs, [1, 2, 3], (p) => p.align)).toBe('right')
    expect(pptxParagraphScope([1, 2], { start: 6, end: 10 })).toBe('第 2–3 段 · 共 2 段')
  })
})
