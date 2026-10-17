import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser } from 'linkedom'
import { expect, it, vi } from 'vitest'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'

vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
const sourceXml =
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:J20"/><cols><col min="1" max="1" style="1"/><col min="2" max="2" style="2"/><col min="4" max="6" style="6"/></cols><sheetData>' +
  '<row r="1" s="3" customFormat="1"><c r="A1"><v>12</v></c><c r="B1" s="0"><v>0</v></c></row>' +
  '<row r="2" s="4" customFormat="0"><c r="A2"><f>A1+$C$1</f><v>12</v></c><c r="B2" s="5" t="inlineStr"><is><r><rPr><b/><color theme="4" tint="0.2"/></rPr><t>Rich source</t></r></is></c></row>' +
  '<row r="3" s="4"><c r="A3" t="s"><v>0</v></c><c r="C3"/></row>' +
  '<row r="4" s="4" customFormat="true"><c r="B4" t="b"><v>1</v></c></row>' +
  '<row r="8" s="7" customFormat="1"><c r="D8"><v>999</v></c><c r="F8" s="7"><v>999</v></c><extLst><ext uri="keep-row"/></extLst></row>' +
  '<row r="20" ht="29"><c r="J20" s="7" t="inlineStr"><is><t>Untouched</t></is></c></row>' +
  '</sheetData></worksheet>'
const expectedStyles = [
  ['3', '0', '3'],
  ['1', '5', '0'],
  ['1', '2', '0'],
  ['4', '4', '4'],
  ['1', '2', '0'],
]
async function fixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
  zip.file('xl/worksheets/sheet1.xml', sourceXml)
  zip.file('xl/worksheets/sheet2.xml', sourceXml)
  zip.file(
    'xl/workbook.xml',
    (await zip.file('xl/workbook.xml')!.async('string')).replace(
      '</sheets>',
      '<sheet name="目标" sheetId="2" r:id="rId99"/></sheets>',
    ),
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>',
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
    ),
  )
  zip.file(
    'xl/theme/theme1.xml',
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Original"><a:themeElements><a:clrScheme name="Original"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="445566"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="204060"/></a:accent1><a:accent2><a:srgbClr val="426282"/></a:accent2><a:accent3><a:srgbClr val="6484A4"/></a:accent3><a:accent4><a:srgbClr val="86A6C6"/></a:accent4><a:accent5><a:srgbClr val="A8C8E8"/></a:accent5><a:accent6><a:srgbClr val="284868"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>',
  )
  zip.file(
    'xl/styles.xml',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="00000"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/><color theme="1"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.3"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8">' +
      Array.from(
        { length: 8 },
        (_, i) =>
          `<xf numFmtId="${i === 5 ? 164 : 0}" fontId="0" fillId="${i % 3}" borderId="0" xfId="0" applyFill="1"/>`,
      ).join('') +
      '</cellXfs></styleSheet>',
  )
  zip.file('customXml/keep.xml', '<keep opaque="true"/>')
  return zip.generateAsync({ type: 'uint8array' })
}
const apply = (bytes: Uint8Array, operation: Record<string, unknown>, version = 0) =>
  applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: version,
    ops: [operation],
  })
const readXml = (zip: JSZip, path: string) => zip.file(path)!.async('string')
const parseXml = (text: string) => new DOMParser().parseFromString(text, 'text/xml')
const withoutCalc = (text: string) => text.replace(/<calcPr\b[^>]*\/>/g, '')
const cells = (xml: string) => {
  const document = parseXml(xml)
  return new Map(
    [...document.querySelectorAll('sheetData > row > c')].map((cell) => [
      cell.getAttribute('r')!,
      cell,
    ]),
  )
}
it.each([
  { op: 'copy_range', cross: false, overlap: false },
  { op: 'copy_range', cross: true, overlap: false },
  { op: 'move_range', cross: false, overlap: false },
  { op: 'move_range', cross: true, overlap: false },
  { op: 'move_range', cross: false, overlap: true },
])(
  'materializes inherited styles and holes for $op cross=$cross overlap=$overlap',
  async (mode) => {
    const bytes = await fixture(),
      original = bytes.slice(),
      target = mode.overlap ? 'B2' : 'D8',
      sheetId = mode.cross ? 'sheet-2' : 'sheet-1',
      result = await apply(bytes, {
        op: mode.op,
        sheetId,
        sourceSheetId: 'sheet-1',
        source: 'A1:C5',
        target,
      }),
      before = await JSZip.loadAsync(bytes),
      after = await JSZip.loadAsync(result.bytes),
      path = `xl/worksheets/${mode.cross ? 'sheet2' : 'sheet1'}.xml`,
      xml = await readXml(after, path),
      parsed = cells(xml),
      rowStart = mode.overlap ? 2 : 8,
      columnStart = mode.overlap ? 1 : 3
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++) {
        const address = `${String.fromCharCode(65 + columnStart + col)}${rowStart + row}`
        expect(parsed.get(address)?.getAttribute('s')).toBe(expectedStyles[row]![col])
      }
    const formula = parsed.get(`${String.fromCharCode(65 + columnStart)}${rowStart + 1}`)!
    expect(formula.querySelector('f')?.textContent).toBeTruthy()
    expect(formula.querySelector('v')?.textContent).toBe('12')
    const richAddress = `${String.fromCharCode(66 + columnStart)}${rowStart + 1}`
    expect(xml).toContain(
      `<c r="${richAddress}" s="5" t="inlineStr"><is><r><rPr><b/><color theme="4" tint="0.2"/></rPr><t>Rich source</t></r></is></c>`,
    )
    expect(
      parsed.get(`${String.fromCharCode(65 + columnStart)}${rowStart + 2}`)?.getAttribute('t'),
    ).toBe('s')
    expect(xml).toContain(
      '<row r="20" ht="29"><c r="J20" s="7" t="inlineStr"><is><t>Untouched</t></is></c></row>',
    )
    expect(xml).toContain('<extLst><ext uri="keep-row"/></extLst>')
    const sourceA1 = cells(await readXml(after, 'xl/worksheets/sheet1.xml')).get('A1')
    expect(sourceA1?.outerHTML ?? null).toBe(
      mode.op === 'copy_range' ? cells(sourceXml).get('A1')!.outerHTML : null,
    )
    const untouched = Object.entries(before.files).filter(
      ([entryPath, entry]) => !entry.dir && !result.touchedEntries.includes(entryPath),
    )
    for (const [entryPath, entry] of untouched)
      expect(await after.file(entryPath)!.async('uint8array')).toEqual(
        await entry.async('uint8array'),
      )
    expect(result.version).toBe(1)
    expect(bytes).toEqual(original)
  },
)

it('shares the customFormat row semantics with format painting and preserves destination values', async () => {
  const result = await apply(await fixture(), {
    op: 'copy_format',
    sheetId: 'sheet-1',
    sourceSheetId: 'sheet-1',
    source: 'A1:C5',
    range: 'D8',
  })
  const parsed = cells(
    await readXml(await JSZip.loadAsync(result.bytes), 'xl/worksheets/sheet1.xml'),
  )
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 3; col++)
      expect(parsed.get(`${String.fromCharCode(68 + col)}${8 + row}`)?.getAttribute('s')).toBe(
        expectedStyles[row]![col],
      )
  expect(parsed.get('D8')?.querySelector('v')?.textContent).toBe('999')
})

it('retains materialized styles and original resources after a second native save and reopen', async () => {
  const bytes = await fixture()
  const copied = await apply(bytes, {
    op: 'copy_range',
    sheetId: 'sheet-1',
    source: 'A1:C5',
    target: 'D8',
  })
  const moved = await apply(
    copied.bytes,
    {
      op: 'move_range',
      sheetId: 'sheet-2',
      sourceSheetId: 'sheet-1',
      source: 'D8:F12',
      target: 'G14',
    },
    copied.version,
  )
  const original = await JSZip.loadAsync(bytes),
    saved = await JSZip.loadAsync(moved.bytes),
    parsed = cells(await readXml(saved, 'xl/worksheets/sheet2.xml'))
  for (let row = 0; row < 5; row++)
    for (let column = 0; column < 3; column++)
      expect(parsed.get(`${String.fromCharCode(71 + column)}${14 + row}`)?.getAttribute('s')).toBe(
        expectedStyles[row]![column],
      )
  for (const path of [
    'xl/styles.xml',
    'xl/sharedStrings.xml',
    'xl/theme/theme1.xml',
    'customXml/keep.xml',
  ])
    expect(await saved.file(path)!.async('uint8array')).toEqual(
      await original.file(path)!.async('uint8array'),
    )
  expect(cells(await readXml(saved, 'xl/worksheets/sheet1.xml')).has('D8')).toBe(false)
  expect(moved.version).toBe(2)
})

it.each([false, true])(
  'tiles inherited styles and styled empty rows in fill_range cross=%s',
  async (cross) => {
    const source = sourceXml
      .replace('style="1"', "style='1'")
      .replace('s="4" customFormat="0"', "s='4' customFormat='false'")
      .replace('s="4" customFormat="true"', "s='4' customFormat='true'")
      .replace('<row r="8"', '<row r="6" s=\'5\' customFormat=\'1\'/><row r="8"')
    const zip = await JSZip.loadAsync(await fixture())
    zip.file('xl/worksheets/sheet1.xml', source)
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      before = await JSZip.loadAsync(bytes),
      result = await apply(bytes, {
        op: 'fill_range',
        sheetId: cross ? 'sheet-2' : 'sheet-1',
        sourceSheetId: 'sheet-1',
        source: 'A1:C6',
        target: 'D8:I19',
      }),
      saved = await JSZip.loadAsync(result.bytes),
      path = `xl/worksheets/${cross ? 'sheet2' : 'sheet1'}.xml`,
      xml = await readXml(saved, path),
      parsed = cells(xml),
      styles = [...expectedStyles, ['5', '5', '5']]
    for (let row = 0; row < 12; row++)
      for (let column = 0; column < 6; column++) {
        const cell = parsed.get(`${String.fromCharCode(68 + column)}${8 + row}`)!
        expect(cell.getAttribute('s')).toBe(styles[row % 6]![column % 3])
      }
    for (const row of [13, 19])
      for (let column = 0; column < 6; column++)
        expect(parsed.get(`${String.fromCharCode(68 + column)}${row}`)?.childNodes.length).toBe(0)
    expect(parsed.get('D9')?.querySelector('f')?.textContent).toBe('D8+$C$1')
    expect(parsed.get('G15')?.querySelector('f')?.textContent).toBe('G14+$C$1')
    expect(parsed.get('E9')?.querySelector('rPr color')?.getAttribute('tint')).toBe('0.2')
    const oldXml = await readXml(before, path)
    expect(parseXml(xml).querySelector('cols')?.outerHTML).toBe(
      parseXml(oldXml).querySelector('cols')?.outerHTML,
    )
    expect(parseXml(xml).querySelector('row[r="8"]')?.getAttribute('s')).toBe('7')
    expect(xml).toContain('<extLst><ext uri="keep-row"/></extLst>')
    const untouched = Object.entries(before.files).filter(
      ([entryPath, entry]) => !entry.dir && !result.touchedEntries.includes(entryPath),
    )
    for (const [entryPath, entry] of untouched)
      expect(await saved.file(entryPath)!.async('uint8array')).toEqual(
        await entry.async('uint8array'),
      )
    expect(result.touchedEntries.toSorted()).toEqual(['xl/workbook.xml', path].toSorted())
    expect(withoutCalc(await readXml(saved, 'xl/workbook.xml'))).toBe(
      withoutCalc(await readXml(before, 'xl/workbook.xml')),
    )
    expect(result.version).toBe(1)
  },
)

it('uses the original row styles after filtered copy compacts rows', async () => {
  const bytes = await fixture(),
    result = await apply(bytes, {
      op: 'copy_range',
      sheetId: 'sheet-2',
      sourceSheetId: 'sheet-1',
      source: 'A1:C5',
      target: 'D8',
      filterColumn: 'B',
      filterValues: ['0', 'true'],
    }),
    parsed = cells(await readXml(await JSZip.loadAsync(result.bytes), 'xl/worksheets/sheet2.xml'))
  // Original rows 1 and 4 compact to destination rows 8 and 9.
  for (let column = 0; column < 3; column++) {
    expect(parsed.get(`${String.fromCharCode(68 + column)}8`)?.getAttribute('s')).toBe(
      expectedStyles[0]![column],
    )
    expect(parsed.get(`${String.fromCharCode(68 + column)}9`)?.getAttribute('s')).toBe('4')
  }
  expect(parsed.get('D9')?.querySelector('v')).toBeNull()
  expect(parsed.get('E9')?.getAttribute('t')).toBe('b')
  expect(parsed.get('E9')?.querySelector('v')?.textContent).toBe('1')
  expect(result.changedCells).toHaveLength(6)
})

it('replaces a single-quoted destination style once when painting inherited formatting', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file('xl/worksheets/sheet1.xml', sourceXml.replace('<c r="F8" s="7">', '<c r="F8" s=\'7\'>'))
  const result = await apply(await zip.generateAsync({ type: 'uint8array' }), {
    op: 'copy_format',
    sheetId: 'sheet-1',
    sourceSheetId: 'sheet-1',
    source: 'A1:C1',
    range: 'D8',
  })
  const xml = await readXml(await JSZip.loadAsync(result.bytes), 'xl/worksheets/sheet1.xml'),
    tag = /<c r="F8"[^>]*>/.exec(xml)![0]
  expect(tag.match(/\ss=/g)).toHaveLength(1)
  expect(cells(xml).get('F8')?.getAttribute('s')).toBe('3')
  expect(cells(xml).get('F8')?.querySelector('v')?.textContent).toBe('999')
})

it.each([
  { op: 'copy_range', cross: false },
  { op: 'copy_range', cross: true },
  { op: 'move_range', cross: false },
  { op: 'move_range', cross: true },
  { op: 'fill_range', cross: false },
  { op: 'fill_range', cross: true },
  { op: 'copy_format', cross: false },
  { op: 'copy_format', cross: true },
])(
  'matches preview inheritance for overlapping column spans in $op cross=$cross',
  async ({ op, cross }) => {
    const columns =
        '<cols><col min="1" max="3" style="1"/><col min="2" max="2" style="2"/><col min="1" max="1" width="12"/><col min="3" max="3" style="0"/><col min="2" max="3" width="14"/></cols>',
      source = sourceXml.replace(
        /<cols>[\s\S]*?<\/cols>/,
        cross ? columns.replaceAll('"', "'") : columns,
      ),
      zip = await JSZip.loadAsync(await fixture())
    zip.file('xl/worksheets/sheet1.xml', source)
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      original = bytes.slice(),
      before = await readXlsx(bytes),
      result = await apply(bytes, {
        op,
        sheetId: cross ? 'sheet-2' : 'sheet-1',
        sourceSheetId: 'sheet-1',
        source: 'A3:C5',
        ...(op === 'copy_format'
          ? { range: 'D8' }
          : { target: op === 'fill_range' ? 'D8:F10' : 'D8' }),
      }),
      saved = await JSZip.loadAsync(result.bytes),
      targetPath = `xl/worksheets/${cross ? 'sheet2' : 'sheet1'}.xml`,
      xml = await readXml(saved, targetPath),
      native = cells(xml),
      expected = [
        ['1', '2', '0'],
        ['4', '4', '4'],
        ['1', '2', '0'],
      ],
      after = await readXlsx(result.bytes),
      target = after.sheets[cross ? 1 : 0]!
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 3; column++)
        expect(native.get(`${String.fromCharCode(68 + column)}${8 + row}`)?.getAttribute('s')).toBe(
          expected[row]![column],
        )
    for (const row of [3, 4])
      for (let column = 0; column < 3; column++)
        expect(
          target.rows.find((entry) => entry.number === row + 5)!.cells[column + 3]!.format,
        ).toEqual(
          before.sheets[0]!.rows.find((entry) => entry.number === row)!.cells[column]!.format,
        )
    expect(
      parseXml(await readXml(saved, 'xl/worksheets/sheet1.xml')).querySelector('cols')?.outerHTML,
    ).toBe(parseXml(source).querySelector('cols')?.outerHTML)
    expect(bytes).toEqual(original)
    const archive = await JSZip.loadAsync(bytes)
    for (const [name, part] of Object.entries(archive.files).filter(
      ([partName, entry]) => !entry.dir && !result.touchedEntries.includes(partName),
    ))
      expect(await saved.file(name)!.async('uint8array')).toEqual(await part.async('uint8array'))
    expect(result.version).toBe(1)
  },
)

it.each(['copy_range', 'move_range', 'fill_range', 'copy_format'] as const)(
  'writes %s into existing implicit rows without duplicates, retaining unrelated XML',
  async (op) => {
    const implicit = sourceXml
        .replace('<row r="4" s="4"', '<row s="4"')
        .replace('<row r="8" s="7"', '<row r="7"/><row s="7"')
        .replace('<row r="20"', "<row r='20'"),
      zip = await JSZip.loadAsync(await fixture())
    zip.file('xl/worksheets/sheet1.xml', implicit)
    zip.file('xl/worksheets/sheet2.xml', implicit)
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      result = await apply(bytes, {
        op,
        sheetId: 'sheet-2',
        sourceSheetId: 'sheet-1',
        source: 'A3:C4',
        ...(op === 'copy_format'
          ? { range: 'D8' }
          : { target: op === 'fill_range' ? 'D8:F9' : 'D8' }),
      }),
      saved = await JSZip.loadAsync(result.bytes),
      targetXml = await readXml(saved, 'xl/worksheets/sheet2.xml'),
      native = parseXml(targetXml)
    expect(native.querySelectorAll('c[r="D8"]')).toHaveLength(1)
    expect(native.querySelectorAll('c[r="F8"]')).toHaveLength(1)
    expect(native.querySelectorAll('row[r="8"]')).toHaveLength(1)
    for (let column = 0; column < 3; column++) {
      expect(
        native.querySelector(`c[r="${String.fromCharCode(68 + column)}8"]`)?.getAttribute('s'),
      ).toBe(['1', '2', '0'][column])
      expect(
        native.querySelector(`c[r="${String.fromCharCode(68 + column)}9"]`)?.getAttribute('s'),
      ).toBe('4')
    }
    expect(targetXml).toContain('<extLst><ext uri="keep-row"/></extLst>')
    expect(targetXml).toContain(
      '<row r=\'20\' ht="29"><c r="J20" s="7" t="inlineStr"><is><t>Untouched</t></is></c></row>',
    )
    expect(targetXml.indexOf('r="9"')).toBeLessThan(targetXml.indexOf("r='20'"))
    const source = cells(await readXml(saved, 'xl/worksheets/sheet1.xml'))
    expect(source.has('A3')).toBe(op !== 'move_range')
    expect(source.has('B4')).toBe(op !== 'move_range')
    expect(result.version).toBe(1)
  },
)

it.each(["<dimension ref='A1:Z40'/>", "<dimension ref='A1:Z40'></dimension>"])(
  'retains one valid worksheet dimension and its existing extent for %s',
  async (dimension) => {
    const zip = await JSZip.loadAsync(await fixture())
    zip.file('xl/worksheets/sheet2.xml', sourceXml.replace('<dimension ref="A1:J20"/>', dimension))
    const result = await apply(await zip.generateAsync({ type: 'uint8array' }), {
      op: 'copy_range',
      sheetId: 'sheet-2',
      sourceSheetId: 'sheet-1',
      source: 'A3:C4',
      target: 'D8',
    })
    const xml = await readXml(await JSZip.loadAsync(result.bytes), 'xl/worksheets/sheet2.xml'),
      document = parseXml(xml)
    expect(document.querySelectorAll('worksheet > dimension')).toHaveLength(1)
    expect(document.querySelector('dimension')?.getAttribute('ref')).toBe('A1:Z40')
    expect(document.querySelectorAll('c[r="D8"]')).toHaveLength(1)
    expect(xml).toContain(
      '<row r="20" ht="29"><c r="J20" s="7" t="inlineStr"><is><t>Untouched</t></is></c></row>',
    )
  },
)
