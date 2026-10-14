import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'xlsx-1'
      ? {
          id,
          kind: 'file',
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileExtension: 'xlsx',
        }
      : null,
}))

import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { xlsxAgentCatalog } from '../services/xlsx-agent-catalog.js'
import { readBasicWorkbook } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'

const fixture = new URL(
  '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
  import.meta.url,
)
const load = () => new Uint8Array(readFileSync(fixture))

describe('XLSX host executor', () => {
  it('registers the pinned find_cells read contract without exposing read_formats', () => {
    const catalog = xlsxAgentCatalog()
    const tool = catalog.tools.find((entry) => entry.name === 'find_cells')
    expect(catalog.clientToolNames.has('find_cells')).toBe(true)
    expect(tool?.inputSchema).toMatchObject({
      properties: {
        query: { type: 'string' },
        regex: { type: 'boolean' },
        look_in: { enum: ['values', 'formulas', 'both'] },
        sheetId: { type: 'string' },
        errors_only: { type: 'boolean' },
        max_results: { maximum: 200 },
      },
    })
    expect(catalog.clientToolNames.has('read_formats')).toBe(false)
  })

  it('shows the model the supported op discriminator and concrete set_cell fields', () => {
    const tool = xlsxAgentCatalog().tools.find((entry) => entry.name === 'propose_operations')
    expect(tool?.inputSchema).toMatchObject({
      required: ['operations'],
      properties: {
        operations: {
          items: {
            required: ['op', 'sheetId'],
            properties: {
              op: { enum: expect.arrayContaining(['set_cell', 'format_range']) },
              sheetId: { type: 'string' },
              address: { type: 'string' },
              value: { type: expect.arrayContaining(['string', 'number', 'boolean', 'null']) },
            },
          },
        },
      },
    })
    expect(JSON.stringify(tool?.inputSchema)).not.toContain('add_chart')
    expect(tool?.description).toContain('"op":"set_cell"')
    expect(tool?.description).toContain('"address":"B3"')
  })

  it('reports a missing op or required set_cell field before changing bytes', async () => {
    const bytes = load()
    for (const [ops, message] of [
      [[{ type: 'set_cell', sheetId: 'sheet-1', address: 'B3', value: '内容' }], '字段 op'],
      [[{ op: 'set_cell', sheetId: 'sheet-1', value: '内容' }], 'address'],
      [[{ op: 'set_cell', sheetId: 'sheet-1', address: 'B3' }], 'value'],
    ] as const) {
      await expect(
        applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion: 0, ops: [...ops] }),
      ).rejects.toThrow(message)
    }
    expect(bytes).toEqual(load())
  })

  it('preserves unrelated entries and earlier edits across two saves', async () => {
    const input = load()
    const source = await JSZip.loadAsync(input)
    const first = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: input,
      expectedVersion: 2,
      ops: [{ op: 'set_cell', sheetId: 'sheet-1', address: 'A1', value: '第一次' }],
    })
    expect(first.version).toBe(3)
    const second = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: first.bytes,
      expectedVersion: 3,
      ops: [{ op: 'set_formula', sheetId: 'sheet-1', address: 'B1', formula: '=1+2' }],
    })
    const reopened = await readBasicWorkbook(Buffer.from(second.bytes))
    expect(reopened.snapshot.sheets[0]?.cells.A1?.value).toBe('第一次')
    expect(reopened.snapshot.sheets[0]?.cells.B1?.formula).toBe('=1+2')
    const saved = await JSZip.loadAsync(second.bytes)
    const touched = new Set([...first.touchedEntries, ...second.touchedEntries])
    for (const path of Object.keys(source.files)) {
      if (touched.has(path)) continue
      expect(await saved.file(path)?.async('uint8array')).toEqual(
        await source.file(path)?.async('uint8array'),
      )
    }
  })

  it('keeps the original style index on a shared-string cell', async () => {
    const zip = await JSZip.loadAsync(load())
    const original = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    zip.file('xl/worksheets/sheet1.xml', original.replace('r="A1" t="s"', 'r="A1" s="0" t="s"'))
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const result = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes,
      expectedVersion: 0,
      ops: [{ op: 'set_cell', sheetId: 'sheet-1', address: 'A1', value: '保留样式' }],
    })
    const saved = await JSZip.loadAsync(result.bytes)
    const sheet = await saved.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheet).toMatch(/<c\b[^>]*r="A1"[^>]*s="0"/)
    expect(
      (await readBasicWorkbook(Buffer.from(result.bytes))).snapshot.sheets[0]?.cells.A1?.value,
    ).toBe('保留样式')
  })

  it('uses the GenOffice structural gateway for rows, merges and row attributes', async () => {
    const inserted = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: load(),
      expectedVersion: 0,
      ops: [{ op: 'insert_rows', sheetId: 'sheet-1', row: 2, count: 1 }],
    })
    const moved = await readBasicWorkbook(Buffer.from(inserted.bytes))
    expect(moved.snapshot.sheets[0]?.cells.A2?.value).toBeUndefined()
    expect(moved.snapshot.sheets[0]?.cells.A3?.value).toBe('姓名')
    const merged = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: inserted.bytes,
      expectedVersion: 1,
      ops: [{ op: 'merge_cells', sheetId: 'sheet-1', range: 'A3:B3' }],
    })
    const hidden = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: merged.bytes,
      expectedVersion: 2,
      ops: [{ op: 'set_rows_hidden', sheetId: 'sheet-1', row: 3, count: 1, hidden: true }],
    })
    const zip = await JSZip.loadAsync(hidden.bytes)
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheet).toContain('ref="A3:B3"')
    expect(sheet).toMatch(/<row\b[^>]*r="3"[^>]*hidden="1"/)
    expect(
      (await readBasicWorkbook(Buffer.from(hidden.bytes))).snapshot.sheets[0]?.cells.A3?.value,
    ).toBe('姓名')
  })

  it('clears, fills and copies values and relative formulas through the same gateway', async () => {
    const formula = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: load(),
      expectedVersion: 0,
      ops: [{ op: 'set_formula', sheetId: 'sheet-1', address: 'D1', formula: '=B1+$C$1' }],
    })
    const filled = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: formula.bytes,
      expectedVersion: 1,
      ops: [{ op: 'fill_range', sheetId: 'sheet-1', source: 'D1', target: 'D1:D3' }],
    })
    const copied = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: filled.bytes,
      expectedVersion: 2,
      ops: [{ op: 'copy_range', sheetId: 'sheet-1', source: 'D2:D3', target: 'F2' }],
    })
    const cleared = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: copied.bytes,
      expectedVersion: 3,
      ops: [{ op: 'clear_range', sheetId: 'sheet-1', range: 'D1:D2' }],
    })
    const sheet = (await readBasicWorkbook(Buffer.from(cleared.bytes))).snapshot.sheets[0]
    expect(sheet?.cells.D1?.formula).toBeUndefined()
    expect(sheet?.cells.D2?.formula).toBeUndefined()
    expect(sheet?.cells.D3?.formula).toBe('=B3+$C$1')
    expect(sheet?.cells.F2?.formula).toBe('=D2+$C$1')
    expect(sheet?.cells.F3?.formula).toBe('=D3+$C$1')
  })

  it('writes formatting and column width to OOXML without changing cell values', async () => {
    const formatted = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: load(),
      expectedVersion: 0,
      ops: [
        {
          op: 'format_range',
          sheetId: 'sheet-1',
          range: 'A1:B1',
          format: { bold: true, fillColor: '#FFF2CC' },
        },
      ],
    })
    const widened = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: formatted.bytes,
      expectedVersion: 1,
      ops: [{ op: 'set_col_width', sheetId: 'sheet-1', column: 'A', widthPx: 180 }],
    })
    const zip = await JSZip.loadAsync(widened.bytes)
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    const stylesXml = await zip.file('xl/styles.xml')!.async('string')
    expect(sheetXml).toMatch(/<c\b[^>]*r="A1"[^>]*s="[1-9]/)
    expect(sheetXml).toMatch(/<col\b[^>]*min="1"[^>]*max="1"[^>]*width="25"/)
    expect(stylesXml).toContain('<b')
    expect(stylesXml).toContain('FFFFF2CC')
    expect(
      (await readBasicWorkbook(Buffer.from(widened.bytes))).snapshot.sheets[0]?.cells.A1?.value,
    ).toBe('姓名')
  })

  it('rejects unsupported commands, stale expectations and wrong documents before writing', async () => {
    const bytes = load()
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes,
        expectedVersion: 0,
        ops: [{ op: 'add_chart', sheetId: 'sheet-1', chartType: 'bar', dataRange: 'A1:B2' }],
      }),
    ).rejects.toThrow('尚未接入')
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes,
        expectedVersion: 0,
        ops: [
          { op: 'set_cell', sheetId: 'sheet-1', address: 'A1', value: 5, expectedValue: 'stale' },
        ],
      }),
    ).rejects.toThrow('内容已变化')
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'wrong',
        bytes,
        expectedVersion: 0,
        ops: [{ op: 'set_cell', sheetId: 'sheet-1', address: 'A1', value: 5 }],
      }),
    ).rejects.toThrow('文档不存在')
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes,
        expectedVersion: 0,
        ops: [
          {
            op: 'copy_range',
            sheetId: 'sheet-1',
            source: 'A2',
            target: 'D2',
            filterColumn: 'A',
            filterValues: ['姓名'],
          },
        ],
      }),
    ).rejects.toThrow('筛选条件')
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes,
        expectedVersion: 0,
        ops: [
          { op: 'format_range', sheetId: 'sheet-1', range: 'A1:A2001', format: { bold: true } },
        ],
      }),
    ).rejects.toThrow('最多 2000 个格子')
  })
})
