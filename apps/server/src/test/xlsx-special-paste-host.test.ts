import { readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { createXlsxAgentHandle } from '../../../../packages/office/src/agent/xlsx-agent.js'
import { readXlsxRangeXmlTree } from '../../../../packages/office/src/xlsx-native-xml.js'
import { cellMap } from '../services/xlsx-agent-range.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { planXlsxRangeStructures } from '../services/xlsx-range-structures.js'
import { planXlsxPasteGeometry } from '../services/xlsx-special-paste.js'
import { xlsxSpecialPasteSchema, type XlsxPasteMode } from '@mimir/shared'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const styles = `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><name val="Calibri"/><sz val="11"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4"/></patternFill></fill></fills><borders count="3"><border/><border><left style="thin"><color rgb="FFFF0000"/></left></border><border><bottom style="double"><color rgb="FF123456"/></bottom></border></borders><cellStyleXfs count="1"><xf borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0"/></cellXfs><dxfs count="1"><dxf><font><b/><color rgb="FF008000"/></font></dxf></dxfs></styleSheet>`
const rich =
  '<is><r><rPr><b/><color theme="4"/></rPr><t xml:space="preserve"> rich &amp; </t></r><r><t><![CDATA[text&literal;]]></t></r></is>'
const source = `<worksheet xmlns="${MAIN}"><dimension ref="A1:C3"/><sheetFormatPr defaultColWidth="${83 / 7}"/><cols><col min="1" max="1" width="20"/><col min="3" max="3" width="30"/></cols><sheetData><row r="1" s="1" customFormat="1"><c r="A1"><v>5</v></c></row><row r="2" s="1" customFormat="1"><c r="A2"><v>12.25</v></c><c r="B2"><f>A2*2</f><v>24.5</v></c><c r="C2" t="b"><v>0</v></c></row><row r="3" s="1" customFormat="1"><c r="A3" t="inlineStr">${rich}</c><c r="B3" t="s"><v>0</v></c><c r="C3" t="e"><v>#DIV/0!</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><conditionalFormatting sqref="A1:C3"><cfRule type="expression" priority="1" dxfId="0"><formula>A1&gt;0</formula></cfRule></conditionalFormatting><dataValidations count="1"><dataValidation type="decimal" operator="greaterThan" showErrorMessage="1" allowBlank="1" showInputMessage="1" promptTitle="原生提示" prompt="正数" sqref="A2:B2"><formula1>0</formula1></dataValidation></dataValidations><hyperlinks><hyperlink ref="A2" location="'目标'!A1"/></hyperlinks></worksheet>`
const target = `<worksheet xmlns="${MAIN}"><dimension ref="A1:M20"/><sheetFormatPr defaultColWidth="10"/><cols><col min="5" max="7" width="22" style="2" outlineLevel="1"/><col min="6" max="6" hidden="1"/></cols><sheetData><row r="5"><c r="E5" s="2"><v>99</v></c><c r="G5" s="2"><v>99</v></c></row><row r="6"><c r="E6" s="2"><v>99</v></c><c r="F6" s="2"><v>99</v></c><c r="G6" s="2"><v>99</v></c></row><row r="7"><c r="E7" s="2"><f>E5+1</f><v>100</v></c><c r="F7" s="2"><v>99</v></c><c r="G7" s="2"><v>99</v></c></row><row r="20"><c r="M20" t="inlineStr"><is><t>untouched</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="E5:F5"/></mergeCells><conditionalFormatting sqref="E5:G7"><cfRule type="expression" priority="7" dxfId="0"><formula>E5&lt;0</formula></cfRule></conditionalFormatting><dataValidations count="1"><dataValidation type="decimal" operator="greaterThan" showErrorMessage="0" allowBlank="1" sqref="E5:E7"><formula1>1000</formula1></dataValidation></dataValidations><hyperlinks><hyperlink ref="E6" location="'目标'!J10"/></hyperlinks></worksheet>`
async function specialFixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
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
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdStrings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    ),
  )
  zip.file('xl/worksheets/sheet1.xml', source)
  zip.file('xl/worksheets/sheet2.xml', target)
  zip.file('xl/styles.xml', styles)
  zip.file(
    'xl/sharedStrings.xml',
    `<sst xmlns="${MAIN}" count="1" uniqueCount="1">${rich.replace('<is>', '<si>').replace('</is>', '</si>')}</sst>`,
  )
  zip.file('customXml/opaque.bin', new Uint8Array([0, 255, 1, 42]))
  return zip.generateAsync({ type: 'uint8array' })
}
const op = (mode: XlsxPasteMode, targetRef = 'E5', cross = true) => ({
  op: 'paste_range' as const,
  kind: 'copy' as const,
  mode,
  sheetId: cross ? 'sheet-2' : 'sheet-1',
  sourceSheetId: 'sheet-1',
  source: 'A1:C3',
  target: targetRef,
})
const apply = (bytes: Uint8Array, mode: XlsxPasteMode, targetRef = 'E5', cross = true) =>
  applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: 0,
    ops: [op(mode, targetRef, cross)],
  })
const xml = async (bytes: Uint8Array, path = 'xl/worksheets/sheet2.xml') =>
  (await JSZip.loadAsync(bytes)).file(path)!.async('string')
const sections = (s: string, name: string) => {
  const root = readXlsxRangeXmlTree(s)
  return root.children
    .filter((n) => n.local === name)
    .map((n) => s.slice(n.start, n.end))
    .join('')
}
for (const mode of [
  'all',
  'value',
  'formula',
  'format',
  'column-width',
  'besides-border',
] as XlsxPasteMode[])
  it(`real host mode ${mode} preserves native mode matrix and unrelated ZIP entries`, async () => {
    const bytes = await specialFixture(),
      copy = bytes.slice(),
      result = await apply(bytes, mode),
      native = await xml(result.bytes),
      cells = cellMap(native)
    expect(result.version).toBe(1)
    expect(bytes).toEqual(copy)
    const before = await JSZip.loadAsync(bytes),
      after = await JSZip.loadAsync(result.bytes)
    for (const [path, file] of Object.entries(before.files).filter(
      ([entryPath, entryFile]) => !entryFile.dir && !result.touchedEntries.includes(entryPath),
    ))
      expect(await after.file(path)!.async('uint8array')).toEqual(await file.async('uint8array'))
    expect(native).toContain(
      '<row r="20"><c r="M20" t="inlineStr"><is><t>untouched</t></is></c></row>',
    )
    const preserved: Record<XlsxPasteMode, string[]> = {
      all: [],
      value: ['conditionalFormatting', 'mergeCells', 'dataValidations', 'hyperlinks'],
      formula: ['conditionalFormatting', 'mergeCells', 'dataValidations', 'hyperlinks'],
      format: ['dataValidations', 'hyperlinks'],
      'column-width': ['conditionalFormatting', 'mergeCells', 'dataValidations', 'hyperlinks'],
      'besides-border': [],
    }
    for (const name of preserved[mode]) expect(sections(native, name)).toBe(sections(target, name))
    const check: Record<XlsxPasteMode, () => void | Promise<void>> = {
      all: () => {
        expect(native).toContain('prompt="正数"')
        expect(sections(native, 'hyperlinks')).toContain("'目标'!A1")
      },
      value: () => {
        expect(cells.get('F6')).toContain('<v>24.5</v>')
        expect(cells.get('F6')).not.toContain('<f>')
        expect(cells.get('F7')).toContain('t="s"')
        expect(cells.get('E7')).not.toContain('<rPr>')
      },
      formula: () => {
        expect(cells.get('F6')).toContain('<f>E6*2</f>')
        expect(cells.get('F6')).not.toContain('<v>')
        expect(cells.get('E6')).toContain('<v>12.25</v>')
        expect(cells.get('F7')).not.toContain('<rPr>')
      },
      format: () => {
        expect(cells.get('F6')).toContain('<v>99</v>')
        expect(cells.get('E7')).toContain('<f>E5+1</f>')
        expect(cells.get('E6')).toContain('s="1"')
      },
      'column-width': () => {
        expect(sections(native, 'sheetData')).toBe(sections(target, 'sheetData'))
        expect(native).toContain('width="20"')
        expect(native).toContain('hidden="1"')
        expect(native).toContain('width="30"')
      },
      'besides-border': async () => {
        const style = await xml(result.bytes, 'xl/styles.xml')
        expect(style).toContain('fillId="2" borderId="2"')
        expect(cells.get('E6')).not.toContain('s="1"')
        expect(cells.get('E7')).toContain('<rPr>')
        expect(native).toContain('prompt="正数"')
        expect(sections(native, 'hyperlinks')).toContain("'目标'!A1")
      },
    }
    await check[mode]()
  })
it('all-mode tiling snapshots overlapping source, copies all four merges/rules once and makes CF priorities unique', async () => {
  const bytes = await specialFixture(),
    result = await apply(bytes, 'all', 'E5:J10'),
    native = await xml(result.bytes)
  for (const ref of ['E5:F5', 'H5:I5', 'E8:F8', 'H8:I8']) expect(native).toContain(`ref="${ref}"`)
  expect(
    readXlsxRangeXmlTree(native).children.filter((n) => n.local === 'conditionalFormatting'),
  ).toHaveLength(1)
  const priorities = [...native.matchAll(/priority="(\d+)"/g)].map((m) => m[1])
  expect(new Set(priorities).size).toBe(1)
  expect(cellMap(native).get('I9')).toContain('<f>H9*2</f>')
  const overlap = await apply(bytes, 'all', 'B2:G7', false),
    map = cellMap(await xml(overlap.bytes, 'xl/worksheets/sheet1.xml'))
  expect(map.get('F3')).toContain('<f>E3*2</f>')
  expect(map.get('E4')).toContain('<rPr>')
})
it('rejects special CUT, unknown schema, missing cache, malformed tiling and protected targets without source mutation', async () => {
  const bytes = await specialFixture(),
    copy = bytes.slice()
  expect(xlsxSpecialPasteSchema.safeParse({ ...op('all'), extra: true }).success).toBe(false)
  await expect(
    applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes,
      expectedVersion: 0,
      ops: [{ ...op('value'), kind: 'cut' }],
    }),
  ).rejects.toThrow('请先复制')
  await expect(apply(bytes, 'all', 'E5:I7')).rejects.toThrow('整数倍')
  const zip = await JSZip.loadAsync(bytes)
  zip.file('xl/worksheets/sheet1.xml', source.replace('<v>24.5</v>', ''))
  await expect(apply(await zip.generateAsync({ type: 'uint8array' }), 'value')).rejects.toThrow(
    '没有缓存',
  )
  zip.file('xl/worksheets/sheet1.xml', source)
  zip.file(
    'xl/worksheets/sheet2.xml',
    target.replace('<sheetData>', '<sheetProtection sheet="1"/><sheetData>'),
  )
  await expect(apply(await zip.generateAsync({ type: 'uint8array' }), 'format')).rejects.toThrow(
    '保护',
  )
  expect(bytes).toEqual(copy)
})
it('real Editor host uses one history entry for tiled paste, then exact Undo/Redo/markSaved', async () => {
  const bytes = await specialFixture(),
    initial = await openXlsxForEdit(bytes),
    handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      initial,
      () => null,
      () => {},
      (request) => applyXlsxOpsOnHost(request),
    )
  expect(handle.history().undo).toBe(0)
  expect(handle.isDirty()).toBe(false)
  await handle.execute(
    'propose_operations',
    { operations: [op('value', 'E5:J10')] },
    { expectedVersion: 0 },
  )
  expect(handle.getVersion()).toBe(1)
  expect(handle.history()).toEqual({ undo: 1, redo: 0 })
  const output = handle.currentBytes()
  expect((await readXlsx(output)).sheets[1]!.rows.length).toBeGreaterThan(0)
  handle.markSaved()
  expect(handle.isDirty()).toBe(false)
  await handle.undo()
  expect(handle.currentBytes()).toEqual(bytes)
  await handle.redo()
  expect(handle.currentBytes()).toEqual(output)
  expect(handle.isDirty()).toBe(false)
  handle.dispose()
})
it('writes a stable browser fixture for all native modes', async () => {
  const bytes = await specialFixture()
  writeFileSync('/tmp/mimir-xlsx-special-paste-r3-20261017.xlsx', bytes)
  expect(bytes.length).toBeGreaterThan(2000)
})

it.each(['all', 'format', 'besides-border'] as const)(
  'same-source %s is byte exact and does not advance version',
  async (mode) => {
    const bytes = await specialFixture(),
      result = await apply(bytes, mode, 'A1:C3', false)
    expect(result.bytes).toEqual(bytes)
    expect(result.version).toBe(0)
    expect(result.touchedEntries).toEqual([])
  },
)
it.each(['all', 'format', 'besides-border', 'column-width'] as const)(
  'repeated %s does not advance version or alter native entries',
  async (mode) => {
    const first = await apply(await specialFixture(), mode, 'E5:J10'),
      second = await apply(first.bytes, mode, 'E5:J10')
    expect(second.version).toBe(0)
    expect(second.bytes).toEqual(first.bytes)
    expect(second.touchedEntries).toEqual([])
  },
)
it.each(['format', 'besides-border'] as const)(
  'tiled %s retains its exact rule-kind boundary',
  async (mode) => {
    const bytes = await specialFixture(),
      result = await apply(bytes, mode, 'E5:J10'),
      native = await xml(result.bytes)
    expect(sections(native, 'conditionalFormatting')).toContain('sqref="E5:G7 H5:J7 E8:G10 H8:J10"')
    const verify = {
      format: () => {
        expect(sections(native, 'dataValidations')).toBe(sections(target, 'dataValidations'))
        expect(sections(native, 'hyperlinks')).toBe(sections(target, 'hyperlinks'))
        expect(cellMap(native).get('E7')).toContain('<f>E5+1</f>')
      },
      'besides-border': () => {
        expect(sections(native, 'dataValidations')).toContain('sqref="E6:F6 H6:I6 E9:F9 H9:I9"')
        expect(sections(native, 'hyperlinks')).toContain('ref="H9"')
      },
    }
    verify[mode]()
  },
)
it('retained target DV refuses uncached formulas even when error display is disabled', async () => {
  const zip = await JSZip.loadAsync(await specialFixture())
  zip.file('xl/worksheets/sheet2.xml', target.replace('sqref="E5:E7"', 'sqref="E5:G7"'))
  await expect(apply(await zip.generateAsync({ type: 'uint8array' }), 'formula')).rejects.toThrow(
    '缓存',
  )
})

it('uses inherited destination borders and preserves target rich text in format mode', async () => {
  const zip = await JSZip.loadAsync(await specialFixture())
  zip.file(
    'xl/styles.xml',
    styles
      .replace(
        '<cellStyleXfs count="1"><xf borderId="0"/>',
        '<cellStyleXfs count="1"><xf borderId="2"/>',
      )
      .replace(
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0"/>',
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyBorder="0"/>',
      ),
  )
  zip.file(
    'xl/worksheets/sheet2.xml',
    target.replace('<c r="F7" s="2"><v>99</v></c>', `<c r="F7" s="2" t="inlineStr">${rich}</c>`),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const pasted = await apply(bytes, 'besides-border')
  const nextStyles = await xml(pasted.bytes, 'xl/styles.xml')
  const c = cellMap(await xml(pasted.bytes)).get('E6')!
  const id = Number(readXlsxRangeXmlTree(c).attrs.get('s'))
  const xf = readXlsxRangeXmlTree(nextStyles).children.find((n) => n.local === 'cellXfs')!.children[
    id
  ]!
  expect(xf.attrs.get('borderId')).toBe('2')
  expect(xf.attrs.get('fillId')).toBe('2')
  const formatted = await apply(bytes, 'format')
  expect(cellMap(await xml(formatted.bytes)).get('F7')).toContain(rich)
})
it('repeats nondefault column widths, preserves default-width destinations and skips hidden columns', async () => {
  const output = await xml((await apply(await specialFixture(), 'column-width', 'E5:J10')).bytes)
  const cols = readXlsxRangeXmlTree(output).children.find((n) => n.local === 'cols')!.children
  const attrs = (column: number) =>
    Object.fromEntries(
      cols
        .filter((n) => column >= Number(n.attrs.get('min')) && column <= Number(n.attrs.get('max')))
        .flatMap((n) => Array.from(n.attrs)),
    )
  expect(attrs(5)).toMatchObject({ width: '20', style: '2', outlineLevel: '1' })
  expect(attrs(6)).toMatchObject({ hidden: '1', width: '22' })
  expect(attrs(7).width).toBe('30')
  expect(attrs(8).width).toBe('20')
  expect(attrs(9).width).toBeUndefined()
  expect(attrs(10).width).toBe('30')
})
it('private structure planner rejects incomplete, duplicate, reordered and fractional tile permits', async () => {
  const zip = await BoundedZip.open(await specialFixture())
  const geometry = planXlsxPasteGeometry('A1:C3', 'E5:J10', 'copy', 'all')
  const { tiles } = geometry
  for (const invalid of [
    tiles.slice(1),
    [tiles[0]!, tiles[0]!, ...tiles.slice(2)],
    tiles.toReversed(),
    [{ ...tiles[0]!, startRow: 4.5 }, ...tiles.slice(1)],
  ])
    await expect(
      planXlsxRangeStructures(
        zip,
        { entry: 'xl/worksheets/sheet1.xml', xml: source, bounds: geometry.source },
        { entry: 'xl/worksheets/sheet2.xml', xml: target, bounds: geometry.target },
        false,
        { tiles: invalid },
      ),
    ).rejects.toThrow('平铺')
})

it('reads protected source for cross-sheet copy while retaining actual target protection', async () => {
  const zip = await JSZip.loadAsync(await specialFixture())
  zip.file(
    'xl/worksheets/sheet1.xml',
    source.replace('<sheetData>', '<sheetProtection sheet="1"/><sheetData>'),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const result = await apply(bytes, 'all')
  expect(result.version).toBe(1)
  expect(await xml(result.bytes, 'xl/worksheets/sheet1.xml')).toBe(
    await xml(bytes, 'xl/worksheets/sheet1.xml'),
  )
  expect(await xml(result.bytes, 'xl/worksheets/sheet1.xml')).toContain(
    '<sheetProtection sheet="1"/>',
  )
  await expect(apply(bytes, 'format', 'E5', false)).rejects.toThrow('保护')
})
