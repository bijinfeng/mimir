import { expect, it } from 'vitest'
import { xlsxFillFixture } from './editors/xlsx-fill-test-fixture.js'
import { xlsxCellEffects } from './xlsx-cell-effects.js'
import { readXlsxTableBands } from './xlsx-table-styles.js'
import type { FillSpec } from './xlsx-fill.js'
it.each<FillSpec>([
  { pattern: 'darkGrid', fg: { theme: 4 }, bg: { theme: 0 } },
  {
    gradient: {
      type: 'path',
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      stops: [
        { position: 0, color: { theme: 4 } },
        { position: 1, color: { theme: 0 } },
      ],
    },
  },
])(
  'keeps CF above rich cell fill above table bands; clear exposes table layer without changing saved rules',
  async (spec) => {
    const fixture = await xlsxFillFixture(),
      sheet = fixture.sheet,
      cell = sheet.rows[0]!.cells[0]!
    sheet.tables = [
      {
        path: 'xl/tables/table1.xml',
        relationshipId: 'table1',
        name: 'Sales',
        range: 'A1:B3',
        columns: ['区域', '部门'],
        style: 'TableStyleMedium2',
        headerRows: 1,
        totalRows: 0,
        bandedRows: true,
        bands: readXlsxTableBands('TableStyleMedium2', '', ''),
      },
    ]
    sheet.extras!.cfRules = []
    cell.format!.fill = { spec, source: 'direct' }
    delete cell.format!.fillColor
    expect(xlsxCellEffects(sheet, fixture.workbook).get('1:0')?.format?.fillColor).toBeUndefined()
    sheet.extras!.cfRules = [
      {
        range: 'A1',
        type: 'containsText',
        priority: 1,
        stop: false,
        formula: [],
        style: { fillColor: '#FF0000' },
        xml: '<cfRule text="区域"/>',
      },
    ]
    const rules = JSON.stringify(sheet.extras!.cfRules)
    expect(xlsxCellEffects(sheet, fixture.workbook).get('1:0')?.format?.fillColor).toBe('#FF0000')
    cell.format!.fill = { spec: null, source: 'direct' }
    expect(xlsxCellEffects(sheet, fixture.workbook).get('1:0')?.format?.fillColor).toBe('#FF0000')
    expect(JSON.stringify(sheet.extras!.cfRules)).toBe(rules)
    sheet.extras!.cfRules = []
    expect(xlsxCellEffects(sheet, fixture.workbook).get('1:0')?.format?.fillColor).toBeTruthy()
  },
)
