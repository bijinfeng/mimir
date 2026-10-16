// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { SectionGeom } from '../vendor/apps/docs/src/renderer/pagination-types.js'
import { paginateFootnoteContinuations } from './docx-footnote-flow.js'
import { makeGapNotesEl, notesAreaHeight, type NoteFragment } from './footnotes.js'
const geoms = [{ contentHeight: 300 }] as SectionGeom[]
const note = (id: string, height: number): NoteFragment => ({
  id,
  no: Number(id),
  text: `脚注 ${id}`,
  height,
  lineHeightPx: 20,
})
describe('fixed paper footnote continuation flow', () => {
  it('splits long rich notes along measured safe boundaries and resumes body on the following paper', () => {
    const original = [
      { start: 0, end: 40, physHeight: 40, section: 0 },
      { start: 40, end: 240, physHeight: 200, section: 0 },
    ]
    const long = {
      ...note('1', 620),
      breakOffsets: [
        22, 52, 82, 112, 142, 172, 202, 232, 262, 292, 322, 352, 382, 412, 442, 472, 502, 532, 562,
        592,
      ],
      richParas: [[{ text: 'long body', bold: true }]],
    }
    const result = paginateFootnoteContinuations(original, [[long], []], geoms)
    expect(result.slices).toHaveLength(4)
    expect(result.slices.map((slice) => slice.physHeight)).toEqual([40, 0, 0, 200])
    expect(result.notes.flat().map((item) => item.height)).toEqual([232, 270, 118])
    expect(result.notes.flat().reduce((sum, item) => sum + item.height, 0)).toBe(620)
    for (let i = 0; i < result.slices.length; i++)
      expect(
        (result.slices[i]!.physHeight ?? 0) + notesAreaHeight(result.notes[i]!),
      ).toBeLessThanOrEqual(300)
    const rendered = makeGapNotesEl(result.notes[1]!, 400)
    expect(rendered.querySelector('[data-note-continuation=true]')).toBeTruthy()
    expect(rendered.querySelector<HTMLElement>('.page-gap-note > div')?.style.transform).toBe(
      'translateY(-232px)',
    )
    expect(rendered.querySelector('span')?.style.fontWeight).toBe('600')
    expect(original).toHaveLength(2)
  })
  it('continues multiple notes in order at document end and leaves ordinary notes unchanged', () => {
    const result = paginateFootnoteContinuations(
      [{ start: 0, end: 40, physHeight: 40, section: 0 }],
      [[note('1', 100), note('2', 480)]],
      geoms,
    )
    expect(result.slices).toHaveLength(3)
    expect(
      result.notes.map((items) => items.map((item) => [item.id, item.clipTop ?? 0, item.height])),
    ).toEqual([
      [
        ['1', 0, 100],
        ['2', 0, 140],
      ],
      [['2', 140, 280]],
      [['2', 420, 60]],
    ])
    expect(result.slices.slice(1).every((slice) => slice.start === 40 && slice.end === 40)).toBe(
      true,
    )
    const short = note('1', 100)
    const same = paginateFootnoteContinuations(
      [{ start: 0, end: 40, section: 0 }],
      [[short]],
      geoms,
    )
    expect(same.notes).toEqual([[short]])
  })
})
