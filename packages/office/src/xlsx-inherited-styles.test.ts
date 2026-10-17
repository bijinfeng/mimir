import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { openXlsxForEdit } from './xlsx-edit.js'
import { readXlsx, type XlsxSheet } from './xlsx.js'

const stylesXml =
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts><font/><font><b/><color rgb="FFAA0000"/></font><font><i/><color rgb="FF0000AA"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00FFFF"/></patternFill></fill></fills><borders><border/></borders><cellXfs><xf numFmtId="0"/><xf numFmtId="164" fontId="1" fillId="2"><alignment wrapText="1"/></xf><xf numFmtId="2" fontId="2" fillId="3"><alignment horizontal="right"/></xf><xf numFmtId="9" fontId="1"/></cellXfs></styleSheet>'
async function fixture(
  sheet: string,
  date1904 = false,
  drawingTo?: { row: number; column: number },
) {
  const zip = new JSZip()
  const add = (name: string, xml: string) => zip.file(name, xml, { createFolders: false })
  add(
    'xl/workbook.xml',
    `<workbook><workbookPr date1904="${date1904 ? 1 : 0}"/><sheets><sheet name="Inherited" sheetId="1" r:id="s1"/></sheets></workbook>`,
  )
  add(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="s1" Target="worksheets/sheet1.xml"/></Relationships>',
  )
  add('xl/styles.xml', stylesXml)
  add(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheet}</worksheet>`,
  )
  add('customXml/keep.xml', '<keep untouched="true"/>')
  if (drawingTo) {
    add(
      'xl/worksheets/_rels/sheet1.xml.rels',
      '<Relationships><Relationship Id="drawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
    )
    add(
      'xl/drawings/drawing1.xml',
      `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from><xdr:to><xdr:col>${drawingTo.column}</xdr:col><xdr:row>${drawingTo.row}</xdr:row></xdr:to><xdr:sp><xdr:nvSpPr><xdr:cNvPr id="1" name="Grid extent"/></xdr:nvSpPr></xdr:sp></xdr:twoCellAnchor></xdr:wsDr>`,
    )
  }
  return zip.generateAsync({ type: 'uint8array' })
}
function cell(sheet: XlsxSheet, row: number, column: number) {
  return sheet.rows.find((entry) => entry.number === row)!.cells[column]!
}
async function expectOriginalEntries(bytes: Uint8Array, saved: Uint8Array) {
  const before = await JSZip.loadAsync(bytes),
    after = await JSZip.loadAsync(saved)
  expect(Object.keys(after.files).toSorted()).toEqual(Object.keys(before.files).toSorted())
  for (const [name, part] of Object.entries(before.files))
    expect(await after.file(name)!.async('uint8array')).toEqual(await part.async('uint8array'))
}

it.each(['"', "'"])(
  'resolves cell, custom row and column defaults including blanks with %s attributes',
  async (quote) => {
    const sheetXml =
      '<cols><col min="1" max="2" style="1"/><col min="3" max="4" style="2" width="14" hidden="true"/></cols><sheetData>' +
      '<row r="1" s="3" customFormat="true" ht="24" hidden="1"><c r="A1"><v>0.25</v></c><c r="B1" s="0"><v>0.25</v></c><c r="C1" s="2"><v>0.25</v></c></row>' +
      '<row r="4" s="3" customFormat="0"><c r="D4" t="inlineStr"><is><t>Tail</t></is></c></row>' +
      '<row s="2" customFormat="1"><c r="A5"><v>3</v></c></row>' +
      '<row r="6" s="3"><c r="A6"><v>1</v></c></row>' +
      '<row r="7" s="3" customFormat="false"><c r="A7"><v>1</v></c></row>' +
      '<row r="9" s="2" customFormat="1"/>' +
      '<row r="10" s="0" customFormat="true"/>' +
      '<row r="11"><c s="0"><v>1</v></c><c><v>1</v></c></row></sheetData>'
    const bytes = await fixture(quote === '"' ? sheetXml : sheetXml.replaceAll('"', "'")),
      original = bytes.slice(),
      session = await openXlsxForEdit(bytes),
      sheet = session.workbook().sheets[0]!
    expect(sheet.rows.map((row) => row.number)).toEqual([1, 4, 5, 6, 7, 9, 10, 11])
    expect(cell(sheet, 1, 0)).toMatchObject({
      text: '25%',
      bold: true,
      format: { numberFormat: '0%' },
    })
    expect(cell(sheet, 1, 1)).toMatchObject({ text: '0.25', format: { numberFormat: 'General' } })
    expect(cell(sheet, 1, 1).bold).toBeUndefined()
    expect(cell(sheet, 1, 2)).toMatchObject({
      text: '0.25',
      format: { italic: true, fillColor: '#00FFFF' },
    })
    expect(cell(sheet, 1, 3).format?.numberFormat).toBe('0%') // Equal-width padding.
    expect(sheet.rows[0]).toMatchObject({ height: 32, hidden: true })
    expect(sheet.columns[2]).toMatchObject({ width: 103, hidden: true })
    expect(cell(sheet, 4, 0)).toMatchObject({
      text: '',
      bold: true,
      format: { fillColor: '#FFFF00', wrapText: true },
    }) // Missing <c>.
    expect(cell(sheet, 4, 2).format?.fillColor).toBe('#00FFFF')
    expect(cell(sheet, 4, 3).text).toBe('Tail')
    expect(cell(sheet, 5, 0).text).toBe('3.00')
    expect(cell(sheet, 5, 1).format?.numberFormat).toBe('0.00')
    expect(cell(sheet, 6, 0).text).toBe('1900-01-01')
    expect(cell(sheet, 7, 0).text).toBe('1900-01-01')
    expect(cell(sheet, 9, 0).format?.fillColor).toBe('#00FFFF')
    expect(cell(sheet, 10, 0).format?.numberFormat).toBe('General')
    expect(cell(sheet, 11, 0).text).toBe('1')
    expect(cell(sheet, 11, 1).text).toBe('1900-01-01')
    expect(session.isDirty()).toBe(false)
    await expectOriginalEntries(bytes, await session.save())
    expect(bytes).toEqual(original)
  },
)

it.each([false, true])(
  'applies inherited date and number formats using date1904=%s and keeps numeric source/cache',
  async (date1904) => {
    const bytes = await fixture(
        '<cols><col min="1" max="1" style="1"/><col min="2" max="2" style="2"/></cols><sheetData><row r="3"><c r="A3"><f>1</f><v>1</v></c><c r="B3"><v>2.5</v></c><c r="C3" s="0"><v>1</v></c></row><row r="7" s="1" customFormat="true"><c r="B7"><v>1</v></c></row></sheetData>',
        date1904,
      ),
      sheet = (await readXlsx(bytes)).sheets[0]!
    const date = date1904 ? '1904-01-02' : '1900-01-01'
    expect(cell(sheet, 3, 0)).toMatchObject({
      text: date,
      rawText: '1',
      numeric: true,
      formula: true,
      formulaText: '=1',
      formulaCache: 'cached',
    })
    expect(cell(sheet, 3, 1)).toMatchObject({ text: '2.50', rawText: '2.5' })
    expect(cell(sheet, 3, 2).text).toBe('1')
    expect(cell(sheet, 7, 1).text).toBe(date)
    await expectOriginalEntries(bytes, await (await openXlsxForEdit(bytes)).save())
  },
)

it('uses the last styled overlapping column span, ignores width-only spans and honors explicit zero', async () => {
  const sheet = (
    await readXlsx(
      await fixture(
        '<cols><col min="1" max="4" style="1"/><col min="2" max="3" style="2"/><col min="2" max="2" width="18"/><col min="4" max="4" style="0"/><col min="4" max="4" width="12"/></cols><sheetData><row r="2"><c r="A2"><v>1</v></c><c r="D2"><v>1</v></c></row></sheetData>',
      ),
    )
  ).sheets[0]!
  expect(sheet.rows[0]!.cells.map((entry) => entry.format?.numberFormat)).toEqual([
    'yyyy-mm-dd',
    '0.00',
    '0.00',
    'General',
  ])
  expect(sheet.rows[0]!.cells.map((entry) => entry.bold === true)).toEqual([
    true,
    false,
    false,
    false,
  ])
  expect(sheet.columns[1]!.width).toBe(131)
})

it('styles every blank grid cell materialized for a drawing without expanding a full-column style declaration', async () => {
  const bytes = await fixture(
      '<cols><col min="1" max="16384" style="1"/></cols><sheetData><row r="1"><c r="A1" s="0"><v>1</v></c></row><row r="3" s="2" customFormat="1"/></sheetData>',
      false,
      { row: 4, column: 3 },
    ),
    sheet = (await readXlsx(bytes)).sheets[0]!
  expect(sheet.rows.map((row) => row.number)).toEqual([1, 2, 3, 4, 5])
  expect(sheet.columns).toHaveLength(4)
  expect(cell(sheet, 1, 0).format?.numberFormat).toBe('General')
  expect(cell(sheet, 1, 3).format?.numberFormat).toBe('yyyy-mm-dd')
  expect(cell(sheet, 2, 2)).toMatchObject({
    text: '',
    bold: true,
    format: { fillColor: '#FFFF00' },
  })
  expect(cell(sheet, 3, 3).format?.numberFormat).toBe('0.00')
  expect(cell(sheet, 5, 3).format?.numberFormat).toBe('yyyy-mm-dd')
  await expectOriginalEntries(bytes, await (await openXlsxForEdit(bytes)).save())
})

it('keeps the existing object grid budget while resolving styles for an empty-sheet A1 and sparkline padding', async () => {
  const empty = (
    await readXlsx(await fixture('<cols><col min="1" max="16384" style="2"/></cols><sheetData/>'))
  ).sheets[0]!
  expect(empty.empty).toBe(true)
  expect(empty.rows).toHaveLength(1)
  expect(empty.columns).toHaveLength(1)
  expect(cell(empty, 1, 0).format?.numberFormat).toBe('0.00')
  const limited = (
    await readXlsx(
      await fixture(
        '<cols><col min="1" max="16384" style="1"/></cols><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>',
        false,
        { row: 1048575, column: 16383 },
      ),
    )
  ).sheets[0]!
  expect(limited.columns).toHaveLength(200)
  expect(limited.rows).toHaveLength(1) // 1000 * 200 exceeds the existing 20000-cell expansion budget.
  const spark = (
    await readXlsx(
      await fixture(
        '<cols><col min="1" max="3" style="2"/></cols><sheetData/><extLst><x14:sparklineGroups><x14:sparklineGroup><x14:sparklines><x14:sparkline><xm:f>A1:B1</xm:f><xm:sqref>C8</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></extLst>',
      ),
    )
  ).sheets[0]!
  expect(spark.rows.map((row) => row.number)).toEqual([1, 8])
  expect(cell(spark, 8, 2).format?.numberFormat).toBe('0.00')
})
