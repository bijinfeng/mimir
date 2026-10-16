import { describe, expect, it } from 'vitest'
import { readXlsxTableBands, xlsxTableCellFormat } from './xlsx-table-styles.js'
import { xlsxCellEffects } from './xlsx-cell-effects.js'
import type { XlsxSheet } from './xlsx.js'
import type { XlsxTable } from './xlsx-visuals.js'

const table = (style: string): XlsxTable => ({
  path: 'xl/tables/table1.xml',
  relationshipId: 'r1',
  name: 'Sales',
  range: 'A1:B4',
  columns: ['项目', '值'],
  style,
  bandedRows: true,
  headerRows: 1,
  totalRows: 1,
  bands: readXlsxTableBands(
    style,
    '',
    '<a:theme><a:dk1><a:sysClr lastClr="000000"/></a:dk1><a:accent1><a:srgbClr val="204060"/></a:accent1></a:theme>',
  ),
})
const sheet: XlsxSheet = {
  id: 's1',
  entry: 's.xml',
  name: '表',
  columns: [
    { col: 0, width: 64 },
    { col: 1, width: 64 },
  ],
  rows: [1, 2, 3, 4].map((number) => ({
    number,
    height: 20,
    cells: [0, 1].map((col) => ({ col, text: '值', rowSpan: 1, colSpan: 1 })),
  })),
}
describe('native structured table style overlay', () => {
  it('resolves actual theme accents and HSL tint bands, headers and totals without changing direct styles', () => {
    const t = table('TableStyleMedium2')
    expect(xlsxTableCellFormat(t, sheet, 1, sheet.rows[0]!.cells[0]!)).toMatchObject({
      fillColor: '#204060',
      fontColor: '#FFFFFF',
      bold: true,
    })
    expect(xlsxTableCellFormat(t, sheet, 2, sheet.rows[1]!.cells[0]!)).toMatchObject({
      fillColor: '#C6D9EC',
    })
    expect(xlsxTableCellFormat(t, sheet, 3, sheet.rows[2]!.cells[0]!)?.fillColor).toBeUndefined()
    expect(xlsxTableCellFormat(t, sheet, 4, sheet.rows[3]!.cells[0]!)).toMatchObject({
      bold: true,
      borders: { top: '3px double #204060' },
    })
    const explicit = {
      ...sheet.rows[1]!.cells[0]!,
      format: { fillColor: '#FFCC00', fontColor: '#FF0000' },
    }
    expect(xlsxTableCellFormat(t, sheet, 2, explicit)?.fillColor).toBeUndefined()
    expect(xlsxTableCellFormat(t, sheet, 2, explicit)?.fontColor).toBeUndefined()
    expect(explicit.format.fillColor).toBe('#FFCC00')
  })
  it('renders all 60 built-in families, omits no-style tables and honors nonbanded and filtered-row parity', () => {
    const names = [
      ['Light', 21],
      ['Medium', 28],
      ['Dark', 11],
    ] as const
    const outputs = names.flatMap(([family, count]) =>
      Array.from({ length: count }, (_, i) =>
        readXlsxTableBands(`TableStyle${family}${i + 1}`, '', ''),
      ),
    )
    expect(outputs).toHaveLength(60)
    expect(outputs.every((bands) => !!bands.headerRow)).toBe(true)
    expect(readXlsxTableBands('', '', '')).toEqual({})
    const t = table('TableStyleMedium2'),
      filtered = { ...sheet, rows: sheet.rows.map((row) => ({ ...row, hidden: row.number === 2 })) }
    expect(
      xlsxTableCellFormat({ ...t, filterActive: true }, filtered, 3, sheet.rows[2]!.cells[0]!)
        ?.fillColor,
    ).toBe('#C6D9EC')
    expect(
      xlsxTableCellFormat({ ...t, bandedRows: false }, sheet, 2, sheet.rows[1]!.cells[0]!)
        ?.fillColor,
    ).toBeUndefined()
  })
  it('resolves custom dxf band sizes and lets conditional formatting take precedence over table styling', () => {
    const styles =
      '<styleSheet><dxfs><dxf><fill><patternFill patternType="solid"><fgColor rgb="FF00CC88"/></patternFill></fill></dxf></dxfs><tableStyles><tableStyle name="Custom"><tableStyleElement type="firstRowStripe" dxfId="0" size="2"/></tableStyle></tableStyles></styleSheet>'
    const t = { ...table('Custom'), totalRows: 0, bands: readXlsxTableBands('Custom', styles, '') },
      s = {
        ...sheet,
        tables: [t],
        extras: {
          protected: false,
          passwordProtected: false,
          hyperlinks: {},
          notes: {},
          richNotes: false,
          cfRules: [
            {
              range: 'A2',
              type: 'containsText',
              priority: 1,
              stop: false,
              formula: [],
              style: { fillColor: '#FF0000' },
              xml: '<cfRule text="值"/>',
            },
          ],
        },
      }
    const effects = xlsxCellEffects(s, { sheets: [s] })
    expect(effects.get('2:0')?.format?.fillColor).toBe('#FF0000')
    expect(effects.get('3:0')?.format?.fillColor).toBe('#00CC88')
    expect(effects.get('4:0')?.format?.fillColor).toBeUndefined()
  })
})
