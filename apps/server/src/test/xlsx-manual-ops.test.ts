import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { xlsxCellEffects } from '../../../../packages/office/src/xlsx-cell-effects.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
async function fixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:F4"/><sheetData><row r="1"><c r="A1"><v>12</v></c><c r="B1"><f>A1+$A$1+SUM(A1:A2)+&quot;A1&quot;</f><v>30</v></c><c r="E1"><f>B1+A4</f><v>42</v></c></row><row r="2"><c r="A2"><v>3</v></c><c r="B2"><f>A2*2</f><v>6</v></c></row><row r="4"><c r="A4"><v>2</v></c></row></sheetData></worksheet>',
  )
  zip.file('customXml/keep.xml', '<keep/>')
  return zip.generateAsync({ type: 'uint8array' })
}
const apply = (bytes: Uint8Array, op: Record<string, unknown>, expectedVersion = 0) =>
  applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion,
    ops: [{ sheetId: 'sheet-1', ...op }],
  })
const xml = async (bytes: Uint8Array, path = 'xl/worksheets/sheet1.xml') =>
  (await JSZip.loadAsync(bytes)).file(path)!.async('string')
it('genuinely moves raw cells and retargets relative/absolute/range dependents; overlap and second save preserve opaque entries', async () => {
  const bytes = await fixture()
  const moved = await apply(bytes, {
    op: 'move_range',
    sourceSheetId: 'sheet-1',
    source: 'A1:B2',
    target: 'B2',
  })
  const text = await xml(moved.bytes)
  expect(text).toContain('<c r="B2" s="0"><v>12</v></c>')
  expect(text).toContain('<f>B2+$B$2+SUM(B2:B3)+"A1"</f>')
  expect(text).toContain('<f>C2+A4</f>')
  expect(text).not.toContain('r="A1"')
  const second = await apply(
    moved.bytes,
    { op: 'move_range', sourceSheetId: 'sheet-1', source: 'B2:C3', target: 'D2' },
    1,
  )
  expect(await xml(second.bytes)).toContain('<f>D2+$D$2+SUM(D2:D3)+"A1"</f>')
  expect(await xml(second.bytes)).toContain('<f>E2+A4</f>')
  expect(await xml(second.bytes, 'customXml/keep.xml')).toBe('<keep/>')
})
it('cross-sheet cut keeps moved formulas referencing original external cells; defined names and other sheets follow', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file(
    'xl/worksheets/sheet1.xml',
    (await zip.file('xl/worksheets/sheet1.xml')!.async('string')).replace(
      'A1+$A$1+SUM(A1:A2)+&quot;A1&quot;',
      'a1+$a$1+SUM(a1:a2)+a4+&quot;A1&quot;',
    ),
  )
  zip.file(
    'xl/workbook.xml',
    (await zip.file('xl/workbook.xml')!.async('string'))
      .replace('</sheets>', '<sheet name="目标" sheetId="2" r:id="rId99"/></sheets>')
      .replace(
        '</workbook>',
        '<definedNames><definedName name="Moved">数据!$A$1:$B$2</definedName></definedNames></workbook>',
      ),
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
  )
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>数据!$A$1</f><v>12</v></c></row></sheetData></worksheet>',
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const moved = await apply(bytes, {
    op: 'move_range',
    sheetId: 'sheet-2',
    sourceSheetId: 'sheet-1',
    source: 'A1:B2',
    target: 'C3',
  })
  expect(await xml(moved.bytes)).toContain("<f>'目标'!D3+A4</f>")
  expect(await xml(moved.bytes, 'xl/worksheets/sheet2.xml')).toContain("<f>'目标'!$C$3</f>")
  expect(await xml(moved.bytes, 'xl/workbook.xml')).toContain("'目标'!$C$3:$D$4")
  expect(await xml(moved.bytes, 'xl/worksheets/sheet2.xml')).toContain(
    "<f>'目标'!C3+'目标'!$C$3+SUM('目标'!C3:C4)+'数据'!a4+\"A1\"</f>",
  )
})
it('partial range references reject atomically rather than keep references to the emptied source', async () => {
  const bytes = await fixture(),
    original = bytes.slice()
  await expect(
    apply(bytes, { op: 'move_range', sourceSheetId: 'sheet-1', source: 'A1', target: 'D4' }),
  ).rejects.toThrow('部分相交')
  expect(bytes).toEqual(original)
})
it('cut retargets lowercase references while preserving function names and quoted text', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file(
    'xl/worksheets/sheet1.xml',
    (await zip.file('xl/worksheets/sheet1.xml')!.async('string')).replace(
      'A1+$A$1+SUM(A1:A2)+&quot;A1&quot;',
      'a1+$a$1+sum(a1:a2)+LOG10(a2)+&quot;a1&quot;',
    ),
  )
  const moved = await apply(await zip.generateAsync({ type: 'uint8array' }), {
    op: 'move_range',
    sourceSheetId: 'sheet-1',
    source: 'A1:B2',
    target: 'C2',
  })
  expect(await xml(moved.bytes)).toContain('<f>C2+$C$2+sum(C2:C3)+LOG10(C3)+"a1"</f>')
})
it('format brush copies complete style but keeps values/formulas; clearing removes direct rich formatting and selected CF only', async () => {
  let result = await apply(await fixture(), {
    op: 'format_range',
    range: 'A1',
    format: { bold: true, fillColor: '#FFCC00', numberFormat: '0.00' },
  })
  result = await apply(
    result.bytes,
    { op: 'copy_format', sourceSheetId: 'sheet-1', source: 'A1', range: 'B1:B2' },
    result.version,
  )
  let book = await readXlsx(result.bytes)
  expect(book.sheets[0]!.rows[0]!.cells[1]!.format?.fillColor).toBe('#FFCC00')
  expect(await xml(result.bytes)).toContain('<f>A1+$A$1+SUM(A1:A2)+&quot;A1&quot;</f>')
  const zip = await JSZip.loadAsync(result.bytes)
  zip.file(
    'xl/worksheets/sheet1.xml',
    (await xml(result.bytes)).replace(
      '</worksheet>',
      '<conditionalFormatting sqref="A1:B2"><cfRule type="cellIs" operator="greaterThan" priority="1"><formula>1</formula></cfRule></conditionalFormatting></worksheet>',
    ),
  )
  result = await apply(
    await zip.generateAsync({ type: 'uint8array' }),
    { op: 'clear_format', range: 'B1:B2' },
    result.version,
  )
  book = await readXlsx(result.bytes)
  expect(book.sheets[0]!.rows[0]!.cells[1]!.format?.bold).toBe(false)
  expect(book.sheets[0]!.rows[0]!.cells[0]!.format?.bold).toBe(true)
  expect(await xml(result.bytes)).toContain('sqref="A1:A2"')
  expect(await xml(result.bytes)).toContain('<v>30</v>')
})
it.each([
  ['A1:B3', 'A1:B1', 'A2:B3', 'A2+$A2+A$1+$A$1', 'A2:A4', 'A:A', '2:2'],
  ['A1:B3', 'A1', 'A2:B3 B1:B1', 'A2+$A2+A$1+$A$1', 'A2:A4', 'A:A', '2:2'],
  ['A1:B3', 'A1:A3', 'B1:B3', 'B1+$A1+B$1+$A$1', 'B1:B3', 'B:B', '1:1'],
  ['A1 B3:C4', 'A1', 'B3:C4', 'B3+$A3+B$1+$A$1', 'B3:B5', 'B:B', '3:3'],
])(
  'clear format rebases remaining CF formulas from %s after clearing %s',
  async (sqref, range, remaining, relative, qualified, columns, rows) => {
    const zip = await JSZip.loadAsync(await fixture())
    zip.file(
      'xl/worksheets/sheet1.xml',
      (await zip.file('xl/worksheets/sheet1.xml')!.async('string')).replace(
        '</worksheet>',
        `<conditionalFormatting sqref="${sqref}"><cfRule type="expression" priority="1"><formula>AND(a1+$a1+a$1+$a$1&gt;0,COUNTIF('Q a1'!a1:a3,&quot;a1&quot;)&gt;0,COUNTIF(a:a,&quot;a1&quot;)&gt;0,COUNTIF(1:1,&quot;a1&quot;)&gt;0,LOG10(a1)&gt;0)</formula><formula>$a$1</formula></cfRule></conditionalFormatting></worksheet>`,
      ),
    )
    const result = await apply(await zip.generateAsync({ type: 'uint8array' }), {
      op: 'clear_format',
      range,
    })
    const text = await xml(result.bytes)
    expect(text).toContain(`sqref="${remaining}"`)
    expect(text).toContain(
      `<formula>AND(${relative}&gt;0,COUNTIF('Q a1'!${qualified},"a1")&gt;0,COUNTIF(${columns},"a1")&gt;0,COUNTIF(${rows},"a1")&gt;0,LOG10(${relative.split('+')[0]})&gt;0)</formula>`,
    )
    expect(text).toContain('<formula>$A$1</formula>')
  },
)
it('clear format preserves actual CF effects on all surviving disjoint cells after the anchor changes', async () => {
  const styled = await apply(await fixture(), {
    op: 'format_range',
    range: 'A1',
    format: { italic: true },
  })
  const zip = await JSZip.loadAsync(styled.bytes)
  zip.file(
    'xl/worksheets/sheet1.xml',
    (await zip.file('xl/worksheets/sheet1.xml')!.async('string')).replace(
      '</worksheet>',
      '<conditionalFormatting sqref="A1:B2"><cfRule type="expression" dxfId="0" priority="1"><formula>A1&gt;2</formula></cfRule></conditionalFormatting></worksheet>',
    ),
  )
  zip.file(
    'xl/styles.xml',
    (await zip.file('xl/styles.xml')!.async('string'))
      .replace(/<dxfs\b[^>]*(?:\/>|>[\s\S]*?<\/dxfs>)/, '')
      .replace('</styleSheet>', '<dxfs count="1"><dxf><font><b/></font></dxf></dxfs></styleSheet>'),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    before = await readXlsx(bytes),
    beforeEffects = xlsxCellEffects(before.sheets[0]!, before),
    result = await apply(bytes, { op: 'clear_format', range: 'A1' }),
    after = await readXlsx(result.bytes),
    afterEffects = xlsxCellEffects(after.sheets[0]!, after)
  expect(beforeEffects.get('1:1')?.format?.bold).toBe(true)
  expect(beforeEffects.get('2:0')?.format?.bold).toBe(true)
  for (const key of ['1:1', '2:0', '2:1'])
    expect(afterEffects.get(key)).toEqual(beforeEffects.get(key))
  expect(afterEffects.has('1:0')).toBe(false)
})
it('nested row and column groups persist levels, collapsed summary and visibility, then ungroup restores detail', async () => {
  let result = await apply(await fixture(), {
    op: 'set_outline',
    axis: 'rows',
    range: 'A1:B2',
    action: 'group',
  })
  result = await apply(
    result.bytes,
    { op: 'set_outline', axis: 'rows', range: 'A2:B2', action: 'group' },
    result.version,
  )
  expect(await xml(result.bytes)).toMatch(/<row[^>]*r="2"[^>]*outlineLevel="2"/)
  result = await apply(
    result.bytes,
    { op: 'set_outline', axis: 'rows', range: 'A1:B2', action: 'collapse' },
    result.version,
  )
  expect(await xml(result.bytes)).toMatch(/<row[^>]*r="1"[^>]*hidden="1"/)
  expect(await xml(result.bytes)).toMatch(/<row[^>]*r="3"[^>]*collapsed="1"/)
  result = await apply(
    result.bytes,
    { op: 'set_outline', axis: 'columns', range: 'A1:B2', action: 'group' },
    result.version,
  )
  expect(await xml(result.bytes)).toContain('outlineLevelCol="1"')
  result = await apply(
    result.bytes,
    { op: 'set_outline', axis: 'rows', range: 'A1:B2', action: 'ungroup' },
    result.version,
  )
  expect(await xml(result.bytes)).toMatch(/<row[^>]*r="2"[^>]*outlineLevel="1"/)
  expect((await readXlsx(result.bytes)).sheets[0]!.rows[0]!.hidden).toBe(false)
})
it('autosize applies a single atomic batch with actual row and column units and preserves formulas', async () => {
  let result = await apply(await fixture(), {
    op: 'auto_size',
    axis: 'columns',
    sizes: [
      { index: 0, pixels: 145 },
      { index: 1, pixels: 215 },
    ],
  })
  result = await apply(
    result.bytes,
    { op: 'auto_size', axis: 'rows', sizes: [{ index: 0, pixels: 48 }] },
    result.version,
  )
  expect(await xml(result.bytes)).toContain('ht="36"')
  expect(await xml(result.bytes)).toContain('width="20"')
  expect(await xml(result.bytes)).toContain('<f>A2*2</f>')
  await expect(
    apply(result.bytes, {
      op: 'auto_size',
      axis: 'columns',
      sizes: [{ index: 16384, pixels: 200 }],
    }),
  ).rejects.toThrow('边界')
})
it('flash fill writes inferred text literally, keeps existing examples byte-identical and preserves source data', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Alice</t></is></c><c r="B1" t="inlineStr"><is><t>=Alice!</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Brian</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Carol</t></is></c></row></sheetData></worksheet>',
  )
  const result = await apply(await zip.generateAsync({ type: 'uint8array' }), {
    op: 'flash_fill',
    range: 'B1:B3',
  })
  const text = await xml(result.bytes)
  expect(text).toContain('<c r="B1" t="inlineStr"><is><t>=Alice!</t></is></c>')
  expect(text).toContain('>=Brian!</t>')
  expect(text).not.toContain('<f>')
  expect((await readXlsx(result.bytes)).sheets[0]!.rows[2]!.cells[1]!.text).toBe('=Carol!')
})
it('single-cell flash expands through raw contiguous source values but keeps examples, formulas and cells after a gap intact', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  const example =
    '<c r="B1" s="0" t="inlineStr"><is><r><rPr><b/></rPr><t>1200</t></r><r><t> units</t></r></is></c>'
  const formula = '<c r="B3" t="str"><f>A3&amp;&quot; units&quot;</f><v>6 units</v></c>'
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1200</v></c>${example}</row><row r="2"><c r="A2"><v>2500</v></c></row><row r="3"><c r="A3"><v>6</v></c>${formula}</row><row r="4"><c r="A4"><v>7</v></c></row><row r="6"><c r="A6"><v>999</v></c></row></sheetData></worksheet>`,
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const result = await apply(bytes, { op: 'flash_fill', range: 'B1' })
  const text = await xml(result.bytes)
  expect(text).toContain(example)
  expect(text).toContain(formula)
  expect(text).toContain('>2500 units</t>')
  expect(text).toContain('>7 units</t>')
  expect(text).not.toContain('r="B5"')
  expect(text).not.toContain('r="B6"')
  expect(result.changedCells).toEqual(['sheet-1:B2', 'sheet-1:B4'])
  expect(await xml(result.bytes, 'customXml/keep.xml')).toBe('<keep/>')
})
it('flash fill preserves hidden numeric values, zero, false and formulas while filling missing and explicit empty targets', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file(
    'xl/styles.xml',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode=";;;"/></numFmts><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
  )
  const existing = [
    '<c r="B4" s="1"><v>0</v></c>',
    '<c r="B5" s="1"><v>7</v></c>',
    '<c r="B6" t="b"><v>0</v></c>',
    '<c r="B7" t="str"><f>IF(A7=&quot;&quot;,&quot;&quot;,&quot;&quot;)</f><v></v></c>',
  ]
  const rows = Array.from({ length: 9 }, (_, i) => {
    const number = i + 1
    const target =
      i < 3
        ? `<c r="B${number}" t="inlineStr"><is><t>Name${number}!</t></is></c>`
        : (existing[i - 3] ?? (i === 7 ? '<c r="B8" t="inlineStr"><is><t></t></is></c>' : ''))
    return `<row r="${number}"><c r="A${number}" t="inlineStr"><is><t>Name${number}</t></is></c>${target}</row>`
  }).join('')
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
  )
  const result = await apply(await zip.generateAsync({ type: 'uint8array' }), {
    op: 'flash_fill',
    range: 'B1:B9',
  })
  const text = await xml(result.bytes)
  for (const cell of existing) expect(text).toContain(cell)
  expect(text).toContain('>Name8!</t>')
  expect(text).toContain('>Name9!</t>')
  expect(result.changedCells).toEqual(['sheet-1:B8', 'sheet-1:B9'])
})
it('format painter expands a single target, preserves content, strips target rich overrides and leaves source rich runs intact', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  const source =
    '<c r="A1" s="0" t="inlineStr"><is><r><rPr><b/></rPr><t>Mixed</t></r><r><rPr><i/></rPr><t> source</t></r></is></c>'
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${source}<c r="B1"><v>10</v></c><c r="D1" t="inlineStr"><is><r><rPr><u/></rPr><t>Target</t></r></is></c><c r="E1"><f>B1+1</f><v>11</v></c></row><row r="2"><c r="A2"><v>20</v></c><c r="B2"><v>30</v></c><c r="D2"><v>40</v></c><c r="E2"><v>50</v></c></row></sheetData></worksheet>`,
  )
  const styled = await apply(await zip.generateAsync({ type: 'uint8array' }), {
    op: 'format_range',
    range: 'B2',
    format: { italic: true, fillColor: '#FFFF00' },
  })
  const result = await apply(
    styled.bytes,
    {
      op: 'copy_format',
      sourceSheetId: 'sheet-1',
      source: 'A1:B2',
      range: 'D1',
    },
    styled.version,
  )
  const text = await xml(result.bytes)
  expect(text).toContain(source)
  expect(text).toContain('<c r="D1" t="inlineStr" s="0"><is><r><t>Target</t></r></is></c>')
  expect(text).toContain('<f>B1+1</f><v>11</v>')
  expect(result.changedCells).toEqual(['sheet-1:D1', 'sheet-1:E1', 'sheet-1:D2', 'sheet-1:E2'])
  const target = (await readXlsx(result.bytes)).sheets[0]!.rows[1]!.cells[4]!
  expect(target.text).toBe('50')
  expect(target.format).toMatchObject({ italic: true, fillColor: '#FFFF00' })
  expect(await xml(result.bytes, 'customXml/keep.xml')).toBe('<keep/>')
})
it('format painter rejects expanded overflow and source or expanded-target merges atomically', async () => {
  const bytes = await fixture()
  await expect(
    apply(bytes, {
      op: 'copy_format',
      sourceSheetId: 'sheet-1',
      source: 'A1:B2',
      range: 'XFD1048576',
    }),
  ).rejects.toThrow('边界')
  for (const ref of ['A1:B1', 'D2:E2']) {
    const zip = await JSZip.loadAsync(bytes)
    zip.file(
      'xl/worksheets/sheet1.xml',
      (await xml(bytes)).replace(
        '</worksheet>',
        `<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells></worksheet>`,
      ),
    )
    const merged = await zip.generateAsync({ type: 'uint8array' }),
      original = merged.slice()
    await expect(
      apply(merged, { op: 'copy_format', sourceSheetId: 'sheet-1', source: 'A1:B2', range: 'D1' }),
    ).rejects.toThrow('合并')
    expect(merged).toEqual(original)
  }
})
it('cut outside a structured table preserves the table and original formula references', async () => {
  const table = await apply(await fixture(), {
    op: 'add_table',
    range: 'A1:B2',
    name: 'SourceData',
  })
  const result = await apply(
    table.bytes,
    { op: 'move_range', sourceSheetId: 'sheet-1', source: 'E1', target: 'F1' },
    table.version,
  )
  expect((await readXlsx(result.bytes)).sheets[0]!.tables![0]!.name).toBe('SourceData')
  expect(await xml(result.bytes)).toContain('<c r="F1" s="0"><f>B1+A4</f><v>42</v></c>')
  const before = await JSZip.loadAsync(table.bytes),
    after = await JSZip.loadAsync(result.bytes)
  for (const path of Object.keys(before.files).filter(
    (p) => p.startsWith('xl/tables/') && !before.files[p]!.dir,
  ))
    expect(await after.file(path)!.async('string')).toBe(await before.file(path)!.async('string'))
})
it('manual writes invalidate a stale calcChain and request workbook recalculation', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file(
    'xl/calcChain.xml',
    '<calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="B1" i="1"/></calcChain>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rIdChain" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>',
    ),
  )
  const result = await apply(await zip.generateAsync({ type: 'uint8array' }), {
    op: 'move_range',
    sourceSheetId: 'sheet-1',
    source: 'A1:B2',
    target: 'C2',
  })
  const saved = await JSZip.loadAsync(result.bytes)
  expect(saved.file('xl/calcChain.xml')).toBeNull()
  expect(await xml(result.bytes, 'xl/workbook.xml')).toContain('fullCalcOnLoad="1"')
})
