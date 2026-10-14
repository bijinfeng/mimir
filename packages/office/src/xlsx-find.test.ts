import { describe, expect, it } from 'vitest'
import { findXlsxCells } from './xlsx-find.js'
import type { XlsxWorkbook } from './xlsx.js'

const workbook: XlsxWorkbook = {
  sheets: [
    {
      id: 'sheet-1',
      name: 'Sales',
      entry: 'xl/worksheets/sheet1.xml',
      columns: [],
      rows: [
        {
          number: 2,
          height: 20,
          cells: [
            { col: 0, text: 'Alpha', colSpan: 1, rowSpan: 1 },
            { col: 1, text: '#REF!', formula: true, formulaText: '=B99', colSpan: 1, rowSpan: 1 },
          ],
        },
      ],
    },
    {
      id: 'sheet-2',
      name: 'Archive',
      entry: 'xl/worksheets/sheet2.xml',
      columns: [],
      rows: [
        {
          number: 8,
          height: 20,
          cells: [
            { col: 0, text: 'alpha two', colSpan: 1, rowSpan: 1 },
            {
              col: 1,
              text: '2',
              formula: true,
              formulaText: '=SUM(A1:A2)',
              colSpan: 1,
              rowSpan: 1,
            },
          ],
        },
      ],
    },
  ],
}

describe('XLSX shared find', () => {
  it('searches all sheets by value, restricts by sheet, and reports a real result cap', () => {
    expect(
      findXlsxCells(workbook, { query: 'ALPHA' }).matches.map(
        (match) => `${match.sheetName}!${match.address}`,
      ),
    ).toEqual(['Sales!A2', 'Archive!A8'])
    expect(findXlsxCells(workbook, { query: 'alpha', sheetId: 'sheet-2' }).matches).toMatchObject([
      { address: 'A8' },
    ])
    expect(findXlsxCells(workbook, { query: 'alpha', maxResults: 1 })).toMatchObject({
      matches: [{ address: 'A2' }],
      truncated: true,
    })
  })

  it('distinguishes cached values, formulas, regular expressions, and formula errors', () => {
    expect(findXlsxCells(workbook, { query: 'SUM', lookIn: 'values' }).matches).toEqual([])
    expect(findXlsxCells(workbook, { query: 'SUM', lookIn: 'formulas' }).matches).toMatchObject([
      { sheetName: 'Archive', address: 'B8', formula: '=SUM(A1:A2)' },
    ])
    expect(findXlsxCells(workbook, { query: '^alpha', regex: true }).matches).toHaveLength(2)
    expect(findXlsxCells(workbook, { query: '', errorsOnly: true }).matches).toMatchObject([
      { sheetName: 'Sales', address: 'B2', text: '#REF!' },
    ])
  })

  it('allows the manual find field to search for a space', () => {
    expect(findXlsxCells(workbook, { query: ' ' }).matches).toMatchObject([
      { sheetName: 'Archive', address: 'A8' },
    ])
  })
})
