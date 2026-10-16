import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
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
const fixture = () =>
  new Uint8Array(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
const apply = (bytes: Uint8Array, op: Record<string, unknown>, version = 0) =>
  applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    ops: [{ sheetId: 'sheet-1', ...op }],
    expectedVersion: version,
  })
describe('XLSX actual rule effects and input validation', () => {
  it('renders numeric, text, duplicate, expression, colorscale and databar rules from native OOXML', async () => {
    for (const [rule, address, property] of [
      [
        { kind: 'number', operator: 'greaterThan', value: 80, format: { fillColor: '#FFCC00' } },
        '5:2',
        'format',
      ],
      [{ kind: 'text', operator: 'contains', text: '张', format: { bold: true } }, '3:0', 'format'],
      [{ kind: 'duplicate', format: { bold: true } }, '2:0', 'format'],
      [
        { kind: 'formula', formula: '=AND(C3>80,ISNUMBER(C3))', format: { italic: true } },
        '3:2',
        'format',
      ],
      [{ kind: 'colorScale', minColor: '#FFFFFF', maxColor: '#FF0000' }, '3:2', 'format'],
      [{ kind: 'dataBar', color: '#336699' }, '3:2', 'bar'],
    ] as const) {
      const result = await apply(fixture(), {
        op: 'add_conditional_format',
        range: rule.kind === 'formula' ? 'C3:C5' : rule.kind === 'duplicate' ? 'A1:C5' : 'A2:C5',
        rule,
      })
      const workbook = await readXlsx(result.bytes),
        effects = xlsxCellEffects(workbook.sheets[0]!, workbook)
      expect(effects.get(address)?.[property]).toBeDefined()
    }
  })
  it('shows real sparkline values from source cells and retains them across another save', async () => {
    let bytes = (
      await apply(fixture(), {
        op: 'set_range',
        start: 'E2',
        values: [
          [2, 9, -3],
          [5, 1, 8],
        ],
      })
    ).bytes
    bytes = (
      await apply(bytes, {
        op: 'add_sparkline',
        dataRange: 'E2:G3',
        targetCell: 'H2',
        type: 'line',
        color: '#336699',
      })
    ).bytes
    bytes = (await apply(bytes, { op: 'set_cell', address: 'E2', value: 4 })).bytes
    const workbook = await readXlsx(bytes),
      effects = xlsxCellEffects(workbook.sheets[0]!, workbook)
    expect(effects.get('2:7')?.sparkline).toMatchObject({
      values: [4, 9, -3],
      type: 'line',
      color: '#336699',
    })
    expect(effects.get('3:7')?.sparkline?.values).toEqual([5, 1, 8])
  })
  it('rejects single-cell and bulk writes violating validation, accepts valid inputs and evaluates relative custom constraints', async () => {
    let bytes = (
      await apply(fixture(), {
        op: 'set_data_validation',
        range: 'C5',
        validation: { kind: 'numberBetween', min: 1, max: 10 },
      })
    ).bytes
    await expect(apply(bytes, { op: 'set_cell', address: 'C5', value: 20 })).rejects.toThrow(
      '数据验证',
    )
    await expect(
      apply(bytes, { op: 'set_range', start: 'B5', values: [['new', 30]] }),
    ).rejects.toThrow('数据验证')
    bytes = (await apply(bytes, { op: 'set_cell', address: 'C5', value: 7 })).bytes
    expect(
      (await readXlsx(bytes)).sheets[0]!.rows.find((r) => r.number === 5)!.cells[2]!.text,
    ).toBe('7')
    bytes = (
      await apply(bytes, {
        op: 'set_data_validation',
        range: 'D2:D5',
        validation: { kind: 'formula', formula: '=AND(ISNUMBER(D2),D2>0)' },
      })
    ).bytes
    await expect(apply(bytes, { op: 'set_cell', address: 'D3', value: -1 })).rejects.toThrow(
      '数据验证',
    )
    bytes = (await apply(bytes, { op: 'set_cell', address: 'D3', value: 3 })).bytes
    expect(
      (await readXlsx(bytes)).sheets[0]!.rows.find((r) => r.number === 3)!.cells[3]!.text,
    ).toBe('3')
  })
  it('enforces list validation during text replacement and disallows blank when imported rule requires it', async () => {
    let bytes = (
      await apply(fixture(), {
        op: 'set_data_validation',
        range: 'B5',
        validation: { kind: 'list', values: ['市场部 & <测试>', '允许'] },
      })
    ).bytes
    await expect(
      apply(bytes, { op: 'find_replace', range: 'B5', find: '市场部', replace: '未知' }),
    ).rejects.toThrow('数据验证')
    bytes = (
      await apply(bytes, {
        op: 'find_replace',
        range: 'B5',
        find: '市场部 & <测试>',
        replace: '允许',
      })
    ).bytes
    const zip = await (await import('jszip')).default.loadAsync(bytes),
      path = 'xl/worksheets/sheet1.xml'
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace('allowBlank="1"', 'allowBlank="0"'),
    )
    await expect(
      apply(await zip.generateAsync({ type: 'uint8array' }), { op: 'clear_cell', address: 'B5' }),
    ).rejects.toThrow('数据验证')
  })
})
