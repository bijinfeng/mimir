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
