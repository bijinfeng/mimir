import { expect, it } from 'vitest'
import {
  xlsxAutoSizes,
  xlsxFillOperation,
  xlsxFlashFillRange,
  xlsxFormatPaintRange,
} from './xlsx-manual.js'
import type { XlsxSheet, XlsxCell } from './xlsx.js'
const cell = (text: string, col: number, extra: Partial<XlsxCell> = {}): XlsxCell => ({
  text,
  col,
  rowSpan: 1,
  colSpan: 1,
  ...extra,
})
const sheet: XlsxSheet = {
  id: 'sheet-1',
  name: '数据',
  entry: 'xl/worksheets/sheet1.xml',
  columns: [
    { col: 0, width: 80 },
    { col: 1, width: 50 },
    { col: 2, width: 60 },
  ],
  rows: [
    { number: 1, height: 24, cells: [cell('Alice', 0), cell('Chen', 1), cell('Alice Chen', 2)] },
    { number: 2, height: 24, cells: [cell('Brian', 0), cell('Wang', 1), cell('', 2)] },
    { number: 3, height: 24, cells: [cell('Carol', 0), cell('Zhou', 1), cell('', 2)] },
  ],
}
it('flash fill matches pinned concatenation semantics and preserves existing examples', () => {
  expect(xlsxFillOperation(sheet, 'C1:C3', 'flash')).toEqual({
    op: 'set_range',
    start: 'C1',
    values: [['Alice Chen'], ['Brian Wang'], ['Carol Zhou']],
  })
  expect(() => xlsxFillOperation(sheet, 'A1:A3', 'flash')).toThrow('左侧')
})
it('single-cell flash follows only contiguous immediate-left values, including zero and false', () => {
  const data = {
    ...sheet,
    rows: [
      { number: 1, height: 24, cells: [cell('Alice', 0), cell('Chen', 1), cell('Alice Chen', 2)] },
      {
        number: 2,
        height: 24,
        cells: [cell('Brian', 0), cell('0', 1, { numeric: true, rawText: '0' }), cell('', 2)],
      },
      {
        number: 3,
        height: 24,
        cells: [cell('Carol', 0), cell('FALSE', 1, { boolean: false, rawText: '0' }), cell('', 2)],
      },
      { number: 4, height: 24, cells: [cell('Gap', 0), cell('', 1), cell('', 2)] },
      { number: 5, height: 24, cells: [cell('After', 0), cell('Gap', 1), cell('', 2)] },
    ],
  }
  expect(xlsxFlashFillRange(data, 'C1')).toBe('C1:C3')
  expect(xlsxFillOperation(data, 'C1', 'flash')).toMatchObject({
    values: [['Alice Chen'], ['Brian 0'], ['Carol false']],
  })
  expect(xlsxFlashFillRange(data, 'C1:C5')).toBe('C1:C5')
  expect(() => xlsxFlashFillRange(data, 'C4')).toThrow('至少两行')
})
it('single-cell flash caps the probe at 1000 rows and the last worksheet row', () => {
  const data = {
    ...sheet,
    rows: Array.from({ length: 1002 }, (_, index) => ({
      number: index + 1,
      height: 24,
      cells: [cell(`Name${index}`, 0), cell('Last', 1), cell(index ? '' : 'Name0 Last', 2)],
    })),
  }
  expect(xlsxFlashFillRange(data, 'C1')).toBe('C1:C1000')
  const tail = {
    ...sheet,
    rows: [1048575, 1048576].map((number) => ({
      number,
      height: 24,
      cells: [cell('Name', 0), cell('Last', 1), cell('', 2)],
    })),
  }
  expect(xlsxFlashFillRange(tail, 'C1048575')).toBe('C1048575:C1048576')
  expect(() => xlsxFlashFillRange(tail, 'C1048576')).toThrow('至少两行')
})
it('flash infers raw numbers instead of formatted values and preserves false targets', () => {
  const data = {
    ...sheet,
    rows: [
      {
        number: 1,
        height: 24,
        cells: [
          cell('1,200.00', 0, { numeric: true, rawText: '1200' }),
          cell('units', 1),
          cell('1200 units', 2),
        ],
      },
      {
        number: 2,
        height: 24,
        cells: [
          cell('2,500.00', 0, { numeric: true, rawText: '2500' }),
          cell('units', 1),
          cell('', 2),
        ],
      },
    ],
  }
  expect(xlsxFillOperation(data, 'C1', 'flash')).toMatchObject({
    values: [['1200 units'], ['2500 units']],
  })
  const bool = {
    ...sheet,
    rows: [
      {
        number: 1,
        height: 24,
        cells: [
          cell('FALSE', 0, { boolean: false, rawText: '0' }),
          cell('FALSE', 1, { boolean: false, rawText: '0' }),
        ],
      },
      {
        number: 2,
        height: 24,
        cells: [cell('TRUE', 0, { boolean: true, rawText: '1' }), cell('', 1)],
      },
    ],
  }
  expect(xlsxFillOperation(bool, 'B1', 'flash')).toMatchObject({ values: [[false], ['true']] })
})
it('format painter expands a single target to source dimensions and rejects overflow before applying', () => {
  expect(xlsxFormatPaintRange('A1:B3', 'D5')).toBe('D5:E7')
  expect(xlsxFormatPaintRange('A1:B3', 'D5:G8')).toBe('D5:G8')
  expect(() => xlsxFormatPaintRange('A1:B3', 'XFD1048576')).toThrow('边界')
  expect(() => xlsxFormatPaintRange('A1:B1001', 'D5')).toThrow('2000')
  expect(xlsxFormatPaintRange('A1:B1000', 'D5')).toBe('D5:E1004')
  expect(() => xlsxFormatPaintRange('A1', 'D5:E1005')).toThrow('2000')
  expect(() => xlsxFlashFillRange(sheet, 'C1:C2001')).toThrow('2000')
  expect(xlsxFlashFillRange(sheet, 'C1:C2000')).toBe('C1:C2000')
})
it('directional fill excludes source and builds relative formula copy operation; numeric series uses explicit first two values', () => {
  expect(xlsxFillOperation(sheet, 'A1:C3', 'down')).toEqual({
    op: 'fill_range',
    source: 'A1:C1',
    target: 'A2:C3',
  })
  expect(xlsxFillOperation(sheet, 'A1:C3', 'left')).toEqual({
    op: 'fill_range',
    source: 'C1:C3',
    target: 'A1:B3',
  })
  const numbers = {
    ...sheet,
    rows: [1, 2, 3, 4].map((r) => ({
      number: r,
      height: 24,
      cells: [
        cell(String(2 + (r - 1) * 3), 0, { numeric: true, rawText: String(2 + (r - 1) * 3) }),
      ],
    })),
  }
  expect(xlsxFillOperation(numbers, 'A1:A4', 'series')).toEqual({
    op: 'set_range',
    start: 'A1',
    values: [[2], [5], [8], [11]],
  })
})
it('autosize measures all data in selected entire columns and wrapped rows, excluding merged cells', () => {
  expect(xlsxAutoSizes(sheet, 'A1:A1', 'columns', (text) => text.length * 10)).toEqual([
    { index: 0, pixels: 62 },
  ])
  const wrapped = {
    ...sheet,
    rows: [
      {
        number: 1,
        height: 24,
        cells: [
          cell('a long line that wraps', 0, { format: { wrapText: true, fontSize: 12 } }),
          cell('ignored', 1, { mergeRef: 'B1:C1' }),
        ],
      },
    ],
  }
  expect(xlsxAutoSizes(wrapped, 'A1:A1', 'rows', (text) => text.length * 10)[0]!.pixels).toBe(88)
})
