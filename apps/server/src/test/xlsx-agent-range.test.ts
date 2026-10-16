import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { readBasicWorkbook } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
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
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:G2"/><sheetData><row r="1" ht="33"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>A1+$A$1</f><v>42</v></c><c r="C1" t="b"><f>TRUE()</f><v>1</v></c><c r="D1" t="str"><f>""</f><v></v></c><c r="E1" t="e"><f>1/0</f><v>#DIV/0!</v></c><c r="F1" t="inlineStr"><is><r><rPr><b/></rPr><t>富文本</t></r></is></c><c r="G1"/><extLst/></row><row r="2"><c r="A2" t="inlineStr"><is><t>姓名</t></is></c><c r="B2"><v>2</v></c></row></sheetData></worksheet>',
  )
  zip.file('customXml/keep.xml', '<keep>opaque</keep>')
  return zip.generateAsync({ type: 'uint8array' })
}
async function apply(bytes: Uint8Array, op: Record<string, unknown>, version = 0) {
  return applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: version,
    ops: [{ ...op, sheetId: 'sheet-1' }],
  })
}
async function xml(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file('xl/worksheets/sheet1.xml')!.async('string')
}
async function unchanged(before: Uint8Array, after: Uint8Array, touched: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  for (const [path, part] of Object.entries(a.files).filter(
    ([entryName, entry]) => !entry.dir && !touched.includes(entryName),
  )) {
    expect(await b.file(path)!.async('uint8array')).toEqual(await part.async('uint8array'))
  }
}
describe('raw XLSX ranges', () => {
  it('rejects direct and expanded range writes beyond the Excel grid boundary', async () => {
    const bytes = await fixture(),
      original = bytes.slice()
    for (const operation of [
      { op: 'set_cell', address: 'XFE1', value: 1 },
      { op: 'set_formula', address: 'A1048577', formula: '=1' },
      { op: 'set_range', start: 'XFD1', values: [[1, 2]] },
      { op: 'set_range', start: 'A1048576', values: [[1], [2]] },
      { op: 'set_range', range: 'XFD1:XFE1', values: [[1, 2]] },
      { op: 'convert_to_values', range: 'XFE1' },
    ]) {
      await expect(apply(bytes, operation)).rejects.toThrow('边界')
      expect(bytes).toEqual(original)
    }
  })
  it('copies typed raw cells, rich text and styles, translates formulas, tiles a second save and preserves unrelated parts', async () => {
    const styled = await apply(await fixture(), {
      op: 'format_range',
      range: 'A1:G1',
      format: { italic: true, fillColor: '#FFCC00', numberFormat: '0.00' },
    })
    const first = await apply(styled.bytes, { op: 'copy_range', source: 'A1:G1', target: 'A4' }, 1)
    const text = await xml(first.bytes)
    expect(text).toContain('<f>A4+$A$1</f><v>42</v>')
    expect(text).toMatch(/<c r="C4"[^>]*t="b"[^>]*>[\s\S]*?<v>1<\/v>/)
    expect(text).toMatch(/<c r="D4"[^>]*t="str"[^>]*>[\s\S]*?<v><\/v>/)
    expect(text).toContain('<t>富文本</t>')
    const s = /<c r="B1"[^>]*\bs="(\d+)"/.exec(await xml(styled.bytes))?.[1]
    expect(s).toBeDefined()
    expect(text).toMatch(new RegExp(`<c r="B4"[^>]*s="${s}"`))
    const second = await apply(
      first.bytes,
      { op: 'fill_range', source: 'A4:G4', target: 'A5:G6' },
      2,
    )
    expect(await xml(second.bytes)).toContain('<f>A6+$A$1</f><v>42</v>')
    expect(await xml(second.bytes)).toContain('<f>A4+$A$1</f><v>42</v>')
    expect(await xml(second.bytes)).toContain('ht="33"')
    await unchanged(styled.bytes, first.bytes, first.touchedEntries)
    await unchanged(first.bytes, second.bytes, second.touchedEntries)
  })
  it('rejects extended address-linked rules before copying values without their semantics', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    const base = await xml(await fixture())
    for (const rule of [
      '<x14:conditionalFormatting><xm:sqref>A1:B1</xm:sqref></x14:conditionalFormatting>',
      '<x14:dataValidation><xm:sqref>A1:B1</xm:sqref></x14:dataValidation>',
    ]) {
      zip.file(
        'xl/worksheets/sheet1.xml',
        base.replace('</worksheet>', `<extLst>${rule}</extLst></worksheet>`),
      )
      const bytes = await zip.generateAsync({ type: 'uint8array' })
      await expect(
        apply(bytes, { op: 'copy_range', source: 'A1:B1', target: 'A3' }),
      ).rejects.toThrow('扩展')
      expect(await xml(bytes)).toContain(rule)
    }
  })
  it('matches filtered copy against typed formula caches and writes static typed results', async () => {
    const result = await apply(await fixture(), {
      op: 'copy_range',
      source: 'B1:E1',
      target: 'B4',
      filterColumn: 'B',
      filterValues: ['42'],
    })
    const text = await xml(result.bytes)
    expect(text).toContain('<c r="B4"><v>42</v></c>')
    expect(text).toContain('<c r="C4" t="b"><v>1</v></c>')
    expect(text).toContain('<c r="D4" t="str"><v></v></c>')
    expect(text).toContain('<c r="E4" t="e"><v>#DIV/0!</v></c>')
    expect(text).not.toMatch(/<c r="[B-E]4"[^>]*><f>/)
  })
  it('freezes only formulas, retaining number, boolean, empty string and error types and all styles', async () => {
    const bytes = await fixture(),
      before = await xml(bytes)
    const result = await apply(bytes, { op: 'convert_to_values', range: 'B1:E1' })
    const text = await xml(result.bytes)
    expect(text).not.toContain('<f>')
    expect(text).toContain('<c r="B1"><v>42</v></c>')
    expect(text).toContain('<c r="C1" t="b"><v>1</v></c>')
    expect(text).toContain('<c r="D1" t="str"><v></v></c>')
    expect(text).toContain('<c r="E1" t="e"><v>#DIV/0!</v></c>')
    expect(text).toContain(before.match(/<c r="F1"[\s\S]*?<\/c>/)![0])
    const second = await apply(result.bytes, { op: 'set_cell', address: 'A2', value: '第二次' }, 1)
    expect(await xml(second.bytes)).not.toContain('<f>')
    await unchanged(bytes, result.bytes, result.touchedEntries)
  })
  it('extracts matching rows as static cached values, preserving source cell types and formatting', async () => {
    const result = await apply(await fixture(), {
      op: 'copy_range',
      source: 'A1:E2',
      target: 'A4',
      filterColumn: 'A',
      filterValues: ['姓名'],
    })
    const text = await xml(result.bytes)
    expect(text).toContain('<c r="B4"><v>42</v></c>')
    expect(text).toContain('<c r="C4" t="b"><v>1</v></c>')
    expect(text).toContain('<c r="B5"><v>2</v></c>')
    expect(text).not.toContain('<f>A4')
  })
  it('copies across sheets into self-closing sheetData and extends dimensions', async () => {
    const first = await apply(await fixture(), { op: 'add_sheet', name: '复制目标' })
    const read = await readBasicWorkbook(Buffer.from(first.bytes)),
      id = read.snapshot.sheets[1]!.id
    const second = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: first.bytes,
      expectedVersion: 1,
      ops: [
        { op: 'copy_range', sheetId: id, sourceSheetId: 'sheet-1', source: 'A1:G1', target: 'D3' },
      ],
    })
    const copy = (await readBasicWorkbook(Buffer.from(second.bytes))).snapshot.sheets[1]!
    expect(copy.cells.E3?.formula).toBe('=D3+$A$1')
    const zip = await JSZip.loadAsync(second.bytes)
    expect(await zip.file('xl/worksheets/sheet2.xml')!.async('string')).toContain('ref="A1:J3"')
    await unchanged(first.bytes, second.bytes, second.touchedEntries)
  })
  it('rejects overlap, mismatched dimensions, absent caches, shared/array formulas, protection and intersecting features without changing source', async () => {
    const bytes = await fixture(),
      original = bytes.slice()
    await expect(apply(bytes, { op: 'copy_range', source: 'A1:B1', target: 'B1' })).rejects.toThrow(
      'overlap',
    )
    await expect(
      apply(bytes, { op: 'copy_range', source: 'A1:B1', target: 'D3:F3' }),
    ).rejects.toThrow('size')
    await expect(
      apply(bytes, { op: 'fill_range', source: 'A1:B1', target: 'A3:C3' }),
    ).rejects.toThrow('multiple')
    const zip = await JSZip.loadAsync(bytes),
      base = await xml(bytes)
    for (const [part, reason] of [
      [base.replace('<f>A1+$A$1</f><v>42</v>', '<f>A1+$A$1</f>'), '没有缓存'],
      [base.replace('<f>A1+$A$1</f>', '<f t="shared" si="0">A1+$A$1</f>'), '共享'],
      [base.replace('</worksheet>', '<sheetProtection sheet="1"/></worksheet>'), '保护'],
    ]) {
      zip.file('xl/worksheets/sheet1.xml', part!)
      await expect(
        apply(await zip.generateAsync({ type: 'uint8array' }), {
          op: 'convert_to_values',
          range: 'B1:E1',
        }),
      ).rejects.toThrow(reason!)
    }
    zip.file(
      'xl/worksheets/sheet1.xml',
      base.replace('</worksheet>', '<mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>'),
    )
    await expect(
      apply(await zip.generateAsync({ type: 'uint8array' }), {
        op: 'copy_range',
        source: 'A1:B1',
        target: 'A3',
      }),
    ).rejects.toThrow('相交')
    expect(bytes).toEqual(original)
  })
})
