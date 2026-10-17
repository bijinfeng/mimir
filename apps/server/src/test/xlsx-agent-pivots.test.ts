import { xlsxCrossSheetPivotFixture } from '../../../../packages/office/src/editors/xlsx-pivot-test-fixture.js'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, it, expect, vi } from 'vitest'
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
const fixture = () =>
  new Uint8Array(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
const apply = (bytes: Uint8Array, op: Record<string, unknown>) =>
  applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    ops: [{ sheetId: 'sheet-1', ...op }],
    expectedVersion: 0,
  })
describe('XLSX native pivots', () => {
  it('creates a native pivot, renders aggregate cells and refreshes changed values plus new categories over two saves', async () => {
    let bytes = (
      await apply(fixture(), {
        op: 'set_range',
        start: 'E1',
        values: [
          ['区域', '季度', '金额'],
          ['华东', 'Q1', 10],
          ['华东', 'Q2', 20],
          ['华南', 'Q1', 30],
          ['华南', 'Q2', 40],
        ],
      })
    ).bytes
    bytes = (
      await apply(bytes, {
        op: 'add_pivot',
        sourceRange: 'E1:G5',
        targetCell: 'I1',
        rowFields: '区域',
        values: [{ field: '金额', agg: 'sum' }],
        name: '销售汇总',
      })
    ).bytes
    const before = (await readXlsx(bytes)).sheets[0]!
    expect(before.pivots).toHaveLength(1)
    expect(before.pivots![0]!.name).toBe('销售汇总')
    expect(before.rows.find((r) => r.number === 2)!.cells[9]!.text).toBe('30')
    bytes = (await apply(bytes, { op: 'set_range', start: 'E5', values: [['华北', 'Q2', 50]] }))
      .bytes
    const refreshed = await apply(bytes, { op: 'refresh_pivot' })
    const after = (await readXlsx(refreshed.bytes)).sheets[0]!
    expect(after.pivots![0]!.definition.outputRef).toBe('I1:J5')
    expect(after.pivots![0]!.definition.fields[0]!.sharedItems).toContain('华北')
    expect(after.rows.find((r) => r.number === 5)!.cells[9]!.text).toBe('110')
    const zip = await JSZip.loadAsync(refreshed.bytes)
    expect(await zip.file(after.pivots![0]!.cachePath)!.async('string')).toContain(
      'refreshOnLoad="1"',
    )
    const second = await apply(refreshed.bytes, { op: 'set_cell', address: 'G2', value: 15 })
    expect((await readXlsx(second.bytes)).sheets[0]!.pivots![0]!.definition.outputRef).toBe('I1:J5')
    const again = await apply(second.bytes, { op: 'refresh_pivot' })
    expect(
      (await readXlsx(again.bytes)).sheets[0]!.rows.find((r) => r.number === 5)!.cells[9]!.text,
    ).toBe('115')
  })
  it('rejects output conflicts and validates multi-level, grouped and column layouts through upstream layout', async () => {
    let bytes = (
      await apply(fixture(), {
        op: 'set_range',
        start: 'E1',
        values: [
          ['区域', '季度', '金额'],
          ['华东', 'Q1', 10],
          ['华东', 'Q2', 20],
          ['华南', 'Q1', 30],
        ],
      })
    ).bytes
    await expect(
      apply(bytes, {
        op: 'add_pivot',
        sourceRange: 'E1:G4',
        targetCell: 'E2',
        rowFields: '区域',
        values: [{ field: '金额', agg: 'sum' }],
      }),
    ).rejects.toThrow('重叠')
    bytes = (
      await apply(bytes, {
        op: 'add_pivot',
        sourceRange: 'E1:G4',
        targetCell: 'I1',
        rowFields: ['区域', '季度'],
        values: [{ field: '金额', agg: 'average' }],
        name: '多级',
      })
    ).bytes
    expect((await readXlsx(bytes)).sheets[0]!.pivots![0]!.definition.rowFields).toHaveLength(2)
    const refreshed = await apply(bytes, { op: 'refresh_pivot' })
    expect(refreshed.changedCells.length).toBeGreaterThan(0)
  })
  it('refuses growth that would discard native custom number formats, and rejects output across validation rules', async () => {
    let bytes = (
      await apply(fixture(), {
        op: 'set_range',
        start: 'E1',
        values: [
          ['区域', '金额'],
          ['东', 10],
          ['南', 20],
          ['东', 30],
        ],
      })
    ).bytes
    const validation = (
      await apply(bytes, {
        op: 'set_data_validation',
        range: 'I1:J6',
        validation: { kind: 'numberBetween', min: 1, max: 10 },
      })
    ).bytes
    await expect(
      apply(validation, {
        op: 'add_pivot',
        sourceRange: 'E1:F4',
        targetCell: 'I1',
        rowFields: '区域',
        values: [{ field: '金额', agg: 'sum' }],
      }),
    ).rejects.toThrow('数据验证')
    bytes = (
      await apply(bytes, {
        op: 'add_pivot',
        sourceRange: 'E1:F4',
        targetCell: 'I1',
        rowFields: '区域',
        values: [{ field: '金额', agg: 'sum', numFmt: '0.00' }],
      })
    ).bytes
    bytes = (await apply(bytes, { op: 'set_cell', address: 'E4', value: '北' })).bytes
    await expect(apply(bytes, { op: 'refresh_pivot' })).rejects.toThrow('自定义数值格式')
    const parsed = (await readXlsx(bytes)).sheets[0]!
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file(parsed.pivots![0]!.path)!.async('string')).toContain('numFmtId="2"')
  })
})

it('creates across sheets through the full host, preserves the source/third sheet, then refreshes current output from changed source values', async () => {
  const cross = await xlsxCrossSheetPivotFixture()
  const op = {
    op: 'add_pivot',
    sheetId: cross.source.id,
    targetSheetId: cross.sheet.id,
    sourceRange: 'A1:F6',
    targetCell: 'A1',
    rowFields: ['区域'],
    values: [{ field: '金额', agg: 'sum' }],
    name: '跨表汇总',
  }
  const before = await JSZip.loadAsync(cross.bytes)
  const added = await apply(cross.bytes, op)
  const after = await JSZip.loadAsync(added.bytes)
  for (const path of [
    cross.source.entry,
    cross.workbook.sheets[2]!.entry,
    'customXml/mimir-pivot-preservation.xml',
    'xl/sharedStrings.xml',
  ])
    expect(await after.file(path)!.async('uint8array')).toEqual(
      await before.file(path)!.async('uint8array'),
    )
  const current = (await readXlsx(added.bytes)).sheets[1]!
  expect(current.pivots![0]!.definition.sourceSheet).toBe(cross.source.name)
  expect(current.rows.flatMap((row) => row.cells).some((cell) => cell.text === '150')).toBe(true)
  const changed = await apply(added.bytes, {
    op: 'set_cell',
    sheetId: cross.source.id,
    address: 'D2',
    value: 110,
  })
  const refreshed = await apply(changed.bytes, { op: 'refresh_pivot', sheetId: cross.sheet.id })
  expect(
    (await readXlsx(refreshed.bytes)).sheets[1]!.rows.flatMap((row) => row.cells).some(
      (cell) => cell.text === '250',
    ),
  ).toBe(true)
})

it.each([
  'sourceProtection',
  'targetProtection',
  'invalidTarget',
  'content',
  'merge',
  'validation',
  'table',
])('atomically rejects cross-sheet %s through the full host', async (kind) => {
  const cross = await xlsxCrossSheetPivotFixture()
  const op = {
    op: 'add_pivot',
    sheetId: cross.source.id,
    targetSheetId: cross.sheet.id,
    sourceRange: 'A1:F6',
    targetCell: 'A1',
    rowFields: ['区域'],
    values: [{ field: '金额', agg: 'sum' }],
  }
  let bytes = cross.bytes
  let reason = '保护'
  if (kind === 'sourceProtection') op.sheetId = cross.workbook.sheets[4]!.id
  else if (kind === 'invalidTarget') {
    op.targetSheetId = 'missing'
    reason = '目标工作表已失效'
  } else if (kind === 'table') {
    bytes = (
      await apply(bytes, {
        op: 'set_range',
        sheetId: cross.sheet.id,
        start: 'A1',
        values: [
          ['a', 'b'],
          [1, 2],
        ],
      })
    ).bytes
    bytes = (
      await apply(bytes, {
        op: 'add_table',
        sheetId: cross.sheet.id,
        range: 'A1:B2',
        name: 'ExistingTable',
      })
    ).bytes
    reason = '结构化表'
  } else {
    const zip = await JSZip.loadAsync(bytes)
    let xml = await zip.file(cross.sheet.entry)!.async('string')
    if (kind === 'targetProtection')
      xml = xml.replace('</sheetData>', '</sheetData><sheetProtection sheet="1"/>')
    if (kind === 'content') {
      xml = xml.replace(
        '<row r="1">',
        '<row r="1"><c r="A1" t="inlineStr"><is><t>不能覆盖</t></is></c>',
      )
      reason = '覆盖'
    }
    if (kind === 'merge') {
      xml = xml.replace(
        '</sheetData>',
        '</sheetData><mergeCells count="1"><mergeCell ref="A1:B2"/></mergeCells>',
      )
      reason = '合并'
    }
    if (kind === 'validation') {
      xml = xml.replace(
        '</sheetData>',
        '</sheetData><dataValidations count="1"><dataValidation type="whole" sqref="A1:B5"><formula1>1</formula1></dataValidation></dataValidations>',
      )
      reason = '数据验证'
    }
    zip.file(cross.sheet.entry, xml)
    bytes = await zip.generateAsync({ type: 'uint8array' })
  }
  const snapshot = bytes.slice()
  await expect(apply(bytes, op)).rejects.toThrow(reason)
  expect(bytes).toEqual(snapshot)
})
