import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, it, expect, vi } from 'vitest'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
import { workbookOperationSchema } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
async function fixture() {
  const z = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
  z.file('customXml/keep.xml', 'opaque')
  return z.generateAsync({ type: 'uint8array' })
}
async function apply(bytes: Uint8Array, op: Record<string, unknown>, version = 0) {
  return applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: version,
    ops: [workbookOperationSchema.parse({ ...op, sheetId: 'sheet-1' })],
  })
}
async function entry(bytes: Uint8Array, path = 'xl/worksheets/sheet1.xml') {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}
async function unchanged(a: Uint8Array, b: Uint8Array, touched: string[]) {
  const x = await JSZip.loadAsync(a),
    y = await JSZip.loadAsync(b)
  for (const [path, p] of Object.entries(x.files).filter(
    ([key, part]) => !part.dir && !touched.includes(key),
  ))
    expect(await y.file(path)!.async('uint8array')).toEqual(await p.async('uint8array'))
}
describe('XLSX property tools', () => {
  it('adds all supported conditional formats without replacing imported rules, then clears ordinary rules', async () => {
    let bytes = await fixture()
    const rules = [
      {
        kind: 'number',
        operator: 'between',
        value: 10,
        value2: 100,
        format: { fillColor: '#FFCC00', bold: true },
      },
      { kind: 'text', operator: 'contains', text: '中', format: { fontColor: '#FF0000' } },
      { kind: 'blank', blank: true, format: { italic: true } },
      { kind: 'duplicate', format: { bold: true } },
      { kind: 'top10', rank: 3, format: { bold: true } },
      { kind: 'formula', formula: '=A1>1', format: { bold: true } },
      { kind: 'colorScale', minColor: '#00FF00', midColor: '#FFFF00', maxColor: '#FF0000' },
      { kind: 'dataBar', color: '#336699' },
    ]
    for (const rule of rules) {
      const result = await apply(bytes, { op: 'add_conditional_format', range: 'A2:C5', rule })
      await unchanged(bytes, result.bytes, result.touchedEntries)
      bytes = result.bytes
    }
    expect((await entry(bytes)).match(/<conditionalFormatting\b/g)).toHaveLength(8)
    expect(await entry(bytes, 'xl/styles.xml')).toContain('FFFFCC00')
    const clear = await apply(bytes, { op: 'clear_conditional_formats' })
    expect(await entry(clear.bytes)).not.toContain('<conditionalFormatting')
    await unchanged(bytes, clear.bytes, clear.touchedEntries)
  })
  it('validates types, exact replacement/removal and preserves other validation areas over two saves', async () => {
    const bytes = await fixture()
    const first = await apply(bytes, {
      op: 'set_data_validation',
      range: 'A2:A5',
      validation: { kind: 'list', values: ['选项一', '选项二'] },
    })
    expect(await entry(first.bytes)).toContain('"选项一,选项二"')
    await unchanged(bytes, first.bytes, first.touchedEntries)
    const second = await apply(
      first.bytes,
      {
        op: 'set_data_validation',
        range: 'B2:B5',
        validation: { kind: 'numberBetween', min: 1, max: 100 },
      },
      1,
    )
    expect(await entry(second.bytes)).toContain('sqref="A2:A5"')
    expect(await entry(second.bytes)).toContain('<formula2>100</formula2>')
    const third = await apply(
      second.bytes,
      { op: 'set_data_validation', range: 'A2:A5', validation: null },
      2,
    )
    expect(await entry(third.bytes)).not.toContain('sqref="A2:A5"')
    expect(await entry(third.bytes)).toContain('sqref="B2:B5"')
    for (const validation of [
      { kind: 'dateBetween', start: '2026-01-01', end: '2026-12-31' },
      { kind: 'listRef', range: 'A2:A5' },
      { kind: 'checkbox' },
      { kind: 'formula', formula: '=A2>0' },
    ])
      expect(
        (await apply(bytes, { op: 'set_data_validation', range: 'C2:C5', validation }))
          .touchedEntries,
      ).toContain('xl/worksheets/sheet1.xml')
    await expect(
      apply(second.bytes, { op: 'set_data_validation', range: 'A3:A4', validation: null }),
    ).rejects.toThrow('重叠')
    await expect(
      apply(bytes, {
        op: 'set_data_validation',
        range: 'A2',
        validation: { kind: 'list', values: ['a,b'] },
      }),
    ).rejects.toThrow('逗号')
    await expect(
      apply(bytes, {
        op: 'set_data_validation',
        range: 'A2',
        validation: { kind: 'dateBetween', start: '2026-02-31', end: '2026-12-31' },
      }),
    ).rejects.toThrow('日期')
  })
  it('adds and deletes workbook names without changing imported names or built-in print names', async () => {
    const bytes = await fixture()
    const z = await JSZip.loadAsync(bytes)
    z.file(
      'xl/workbook.xml',
      (await z.file('xl/workbook.xml')!.async('string')).replace(
        '</sheets>',
        '</sheets><definedNames><definedName name="原名称" comment="keep">\'数据\'!$A$1</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">\'数据\'!$A$1:$C$5</definedName></definedNames>',
      ),
    )
    const before = await z.generateAsync({ type: 'uint8array' }),
      one = await apply(before, {
        op: 'add_defined_name',
        name: '销售区域',
        ref: "'数据'!$A$2:$B$5",
      })
    expect(await entry(one.bytes, 'xl/workbook.xml')).toContain('name="原名称" comment="keep"')
    expect(await entry(one.bytes, 'xl/workbook.xml')).toContain('name="销售区域"')
    await unchanged(before, one.bytes, one.touchedEntries)
    const two = await apply(one.bytes, { op: 'delete_defined_name', name: '销售区域' }, 1)
    expect(await entry(two.bytes, 'xl/workbook.xml')).not.toContain('name="销售区域"')
    expect(await entry(two.bytes, 'xl/workbook.xml')).toContain('_xlnm.Print_Area')
    await expect(apply(two.bytes, { op: 'delete_defined_name', name: '不存在' })).rejects.toThrow(
      '不存在',
    )
  })
  it('preserves self-closing imported names when adding or deleting another name', async () => {
    const z = await JSZip.loadAsync(await fixture())
    const preserved = '<definedName name="空名称" comment="keep"/>'
    z.file(
      'xl/workbook.xml',
      (await z.file('xl/workbook.xml')!.async('string')).replace(
        '</sheets>',
        `</sheets><definedNames>${preserved}</definedNames>`,
      ),
    )
    const bytes = await z.generateAsync({ type: 'uint8array' })
    const one = await apply(bytes, { op: 'add_defined_name', name: '新名称', ref: '1' })
    expect(await entry(one.bytes, 'xl/workbook.xml')).toContain(preserved)
    const two = await apply(one.bytes, { op: 'delete_defined_name', name: '新名称' }, 1)
    expect(await entry(two.bytes, 'xl/workbook.xml')).toContain(preserved)
    await unchanged(bytes, one.bytes, one.touchedEntries)
    await unchanged(one.bytes, two.bytes, two.touchedEntries)
  })
  it('writes print layout, freezes panes, appends sparklines and keeps two-save settings and unrelated entries', async () => {
    const bytes = await fixture()
    const one = await apply(bytes, {
      op: 'set_page_setup',
      orientation: 'landscape',
      paperSize: 9,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: 'narrow',
      printArea: 'A1:C5',
      printTitles: '1:2',
      header: { center: '标题 &P' },
      rowBreaks: [3],
    })
    const xml = await entry(one.bytes)
    expect(xml).toContain('orientation="landscape"')
    expect(xml).toContain('fitToPage="1"')
    expect(xml).toContain('标题 &amp;P')
    expect(await entry(one.bytes, 'xl/workbook.xml')).toContain('_xlnm.Print_Area')
    await unchanged(bytes, one.bytes, one.touchedEntries)
    const two = await apply(one.bytes, { op: 'set_freeze', rows: 2, columns: 1 }, 1)
    expect(await entry(two.bytes)).toContain('xSplit="1"')
    expect(await entry(two.bytes)).toContain('ySplit="2"')
    expect(await entry(two.bytes)).toContain('orientation="landscape"')
    await unchanged(one.bytes, two.bytes, two.touchedEntries)
    const three = await apply(
      two.bytes,
      { op: 'add_sparkline', type: 'line', dataRange: 'A2:C3', targetCell: 'E2', color: '#336699' },
      2,
    )
    expect(await entry(three.bytes)).toContain('<xm:sqref>E2</xm:sqref>')
    expect(await entry(three.bytes)).toContain('<xm:sqref>E3</xm:sqref>')
    expect(await entry(three.bytes)).toContain("'数据'!A2:C2")
    await unchanged(two.bytes, three.bytes, three.touchedEntries)
    await expect(
      apply(three.bytes, {
        op: 'add_sparkline',
        type: 'column',
        dataRange: 'A2:C3',
        targetCell: 'E2',
      }),
    ).rejects.toThrow('已有迷你图')
    const four = await apply(three.bytes, { op: 'set_freeze', rows: 0, columns: 0 }, 3)
    expect(await entry(four.bytes)).not.toContain('state="frozen"')
    expect(await entry(four.bytes)).toContain('<xm:sqref>E2</xm:sqref>')
  })
})
