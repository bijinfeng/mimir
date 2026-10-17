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
  it('registers the pinned find_cells and newly implemented inspection contracts', () => {
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
    expect(catalog.clientToolNames.has('read_formats')).toBe(true)
  })

  it('shows the model the supported op discriminator and concrete set_cell fields', () => {
    const tool = xlsxAgentCatalog().tools.find((entry) => entry.name === 'propose_operations')
    expect(tool?.inputSchema).toMatchObject({
      required: ['operations'],
      properties: {
        operations: {
          items: {
            required: ['op'],
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
    expect(JSON.stringify(tool?.inputSchema)).toContain('add_chart')
    expect(JSON.stringify(tool?.inputSchema)).toContain('rename_sheet')
    expect(JSON.stringify(tool?.inputSchema)).toContain('add_sheet')
    expect(tool?.description).toContain('"op":"set_cell"')
    expect(tool?.description).toContain('"address":"B3"')
  })

  it('adds a blank selectable sheet and keeps it after editing A1 and saving twice', async () => {
    const input = load()
    const first = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: input,
      expectedVersion: 0,
      ops: [{ op: 'add_sheet', name: '新增表' }],
    })
    const reopened = await readBasicWorkbook(Buffer.from(first.bytes))
    expect(reopened.snapshot.sheets.map((sheet) => sheet.name)).toEqual(['数据', '新增表'])
    const added = reopened.snapshot.sheets[1]!
    expect(added.id).not.toBe(reopened.snapshot.sheets[0]?.id)
    expect(added.cells.A1?.value ?? null).toBeNull()
    const savedZip = await JSZip.loadAsync(first.bytes)
    const originalZip = await JSZip.loadAsync(input)
    for (const path of Object.keys(originalZip.files)) {
      if (first.touchedEntries.includes(path)) continue
      expect(await savedZip.file(path)?.async('uint8array')).toEqual(
        await originalZip.file(path)?.async('uint8array'),
      )
    }
    const second = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: first.bytes,
      expectedVersion: 1,
      ops: [{ op: 'set_cell', sheetId: added.id, address: 'A1', value: '可编辑' }],
    })
    const twice = await readBasicWorkbook(Buffer.from(second.bytes))
    expect(twice.snapshot.sheets.map((sheet) => sheet.name)).toEqual(['数据', '新增表'])
    expect(twice.snapshot.sheets[1]?.cells.A1?.value).toBe('可编辑')
    expect(twice.snapshot.sheets[0]?.cells.A2?.value).toBe('姓名')
  })

  it('refuses duplicate names and unsupported custom grid sizes before adding a sheet', async () => {
    const bytes = load()
    for (const [op, reason] of [
      [{ op: 'add_sheet', name: '' }, '参数无效'],
      [{ op: 'add_sheet', name: '无效/名称' }, '参数无效'],
      [{ op: 'add_sheet', name: '数据' }, '已被使用'],
      [{ op: 'add_sheet', name: '新表', rows: 10 }, '不支持指定网格行列数'],
    ] as const) {
      await expect(
        applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion: 0, ops: [op] }),
      ).rejects.toThrow(reason)
      expect(bytes).toEqual(load())
    }
  })

  it('renames a sheet, rewrites cross-sheet formulas and preserves unrelated parts', async () => {
    const zip = await JSZip.loadAsync(load())
    const workbook = await zip.file('xl/workbook.xml')!.async('string')
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
    zip.file(
      'xl/workbook.xml',
      workbook.replace(
        '</sheets>',
        '<sheet name="汇总" sheetId="2" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>',
      ),
    )
    zip.file(
      'xl/_rels/workbook.xml.rels',
      rels.replace(
        '</Relationships>',
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
      ),
    )
    zip.file(
      'xl/worksheets/sheet2.xml',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>数据!C3</f><v>1001</v></c></row></sheetData></worksheet>',
    )
    const input = await zip.generateAsync({ type: 'uint8array' })
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes: input,
        expectedVersion: 0,
        ops: [{ op: 'rename_sheet', sheetId: 'sheet-1', name: '汇总' }],
      }),
    ).rejects.toThrow('已被使用')
    const first = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: input,
      expectedVersion: 0,
      ops: [{ op: 'rename_sheet', sheetId: 'sheet-1', name: '新数据' }],
    })
    expect(first.version).toBe(1)
    expect(first.changedCells).toEqual([])
    expect(first.touchedEntries).toContain('xl/workbook.xml')
    expect(first.touchedEntries).toContain('xl/worksheets/sheet2.xml')
    const reopened = await readBasicWorkbook(Buffer.from(first.bytes))
    expect(reopened.snapshot.sheets.map((sheet) => sheet.name)).toEqual(['新数据', '汇总'])
    expect(reopened.snapshot.sheets[1]?.cells.A1?.formula).toBe("='新数据'!C3")
    const second = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: first.bytes,
      expectedVersion: 1,
      ops: [{ op: 'set_cell', sheetId: 'sheet-1', address: 'A2', value: '再次保存' }],
    })
    const twice = await readBasicWorkbook(Buffer.from(second.bytes))
    expect(twice.snapshot.sheets[0]?.name).toBe('新数据')
    expect(twice.snapshot.sheets[0]?.cells.A2?.value).toBe('再次保存')
    expect(twice.snapshot.sheets[1]?.cells.A1?.formula).toBe("='新数据'!C3")
    const saved = await JSZip.loadAsync(first.bytes)
    for (const path of Object.keys(zip.files)) {
      if (first.touchedEntries.includes(path)) continue
      expect(await saved.file(path)?.async('uint8array')).toEqual(
        await zip.file(path)?.async('uint8array'),
      )
    }
  })

  it('rejects invalid or duplicate sheet names before changing the input', async () => {
    const bytes = load()
    for (const [name, reason] of [
      ['', '参数无效'],
      ['bad/name', '参数无效'],
      ['数据', '没有变化'],
    ]) {
      await expect(
        applyXlsxOpsOnHost({
          documentId: 'xlsx-1',
          bytes,
          expectedVersion: 0,
          ops: [{ op: 'rename_sheet', sheetId: 'sheet-1', name }],
        }),
      ).rejects.toThrow(reason)
      expect(bytes).toEqual(load())
    }
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
        ops: [{ op: 'unknown_operation', sheetId: 'sheet-1' }],
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
            filterValues: ['没有这行'],
          },
        ],
      }),
    ).rejects.toThrow('没有匹配行')
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

async function rangeFixture() {
  const zip = await JSZip.loadAsync(load())
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>键</t></is></c><c r="B1" t="inlineStr"><is><t>公式</t></is></c><c r="D1"><v>10</v></c></row><row r="2" ht="30"><c r="A2" s="1"><v>2</v></c><c r="B2" s="1"><f>A2+$D$1</f><v>12</v></c><c r="C2" t="inlineStr"><is><r><rPr><b/></rPr><t>乙</t></r><r><t>富文本</t></r></is></c><c r="D2" t="inlineStr"><is><t>范围外</t></is></c></row><row r="3"><c r="A3" s="0"><v>1</v></c><c r="B3" s="0"><f>A3+$D$1</f><v>11</v></c><c r="C3" t="inlineStr"><is><t>甲</t></is></c></row></sheetData></worksheet>',
  )
  return zip.generateAsync({ type: 'uint8array' })
}
const execute = (bytes: Uint8Array, op: unknown, expectedVersion = 0) =>
  applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion, ops: [op] })

describe('XLSX worksheet and range data commands', () => {
  it('sorts complete styled cells and rich text, translates formulas, keeps headers and outside cells', async () => {
    const bytes = await rangeFixture()
    const sorted = await execute(bytes, {
      op: 'sort_range',
      sheetId: 'sheet-1',
      range: 'A1:C3',
      byColumn: 'A',
      order: 'asc',
      hasHeader: true,
    })
    const zip = await JSZip.loadAsync(sorted.bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toContain('<c r="A2" s="0"><v>1</v></c>')
    expect(xml).toContain('<c r="A3" s="1"><v>2</v></c>')
    expect(xml).toContain('<c r="B2" s="0"><f>A2+$D$1</f><v>11</v></c>')
    expect(xml).toContain('<c r="B3" s="1"><f>A3+$D$1</f><v>12</v></c>')
    expect(xml).toContain(
      '<c r="C3" t="inlineStr"><is><r><rPr><b/></rPr><t>乙</t></r><r><t>富文本</t></r></is></c>',
    )
    expect(xml).toContain('<c r="D2" t="inlineStr"><is><t>范围外</t></is></c>')
    expect(xml).toContain('<row r="2" ht="30">')
    const read = await readBasicWorkbook(Buffer.from(sorted.bytes))
    expect(read.snapshot.sheets[0]?.cells.A2?.value).toBe(1)
    expect(read.snapshot.sheets[0]?.cells.B2?.formula).toBe('=A2+$D$1')
    const prior = await JSZip.loadAsync(bytes)
    for (const path of Object.keys(prior.files).filter(
      (entryPath) => !sorted.touchedEntries.includes(entryPath),
    )) {
      expect(await zip.file(path)?.async('uint8array')).toEqual(
        await prior.file(path)?.async('uint8array'),
      )
    }
    const reversed = await execute(
      sorted.bytes,
      {
        op: 'sort_range',
        sheetId: 'sheet-1',
        range: 'A1:C3',
        byColumn: 'A',
        order: 'desc',
        hasHeader: true,
      },
      1,
    )
    const twice = await JSZip.loadAsync(reversed.bytes)
    expect(await twice.file('xl/worksheets/sheet1.xml')!.async('string')).toContain(
      '<c r="A2" s="1"><v>2</v></c>',
    )
  })

  it('sets and combines value filter criteria and restores row visibility when cleared', async () => {
    const bytes = await rangeFixture()
    const enabled = await execute(bytes, { op: 'set_filter', sheetId: 'sheet-1', range: 'A1:C3' })
    const filtered = await execute(
      enabled.bytes,
      { op: 'set_filter_criteria', sheetId: 'sheet-1', column: 'A', values: ['1'] },
      1,
    )
    const zip = await JSZip.loadAsync(filtered.bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toContain(
      '<autoFilter ref="A1:C3"><filterColumn colId="0"><filters><filter val="1"/></filters></filterColumn></autoFilter>',
    )
    expect(xml).toMatch(/<row\b[^>]*r="2"[^>]*hidden="1"/)
    expect(xml).not.toMatch(/<row\b[^>]*r="3"[^>]*hidden="1"/)
    const clearedColumn = await execute(
      filtered.bytes,
      { op: 'set_filter_criteria', sheetId: 'sheet-1', column: 'A', values: null },
      2,
    )
    const cleared = await execute(
      clearedColumn.bytes,
      { op: 'clear_filter', sheetId: 'sheet-1' },
      3,
    )
    const lastZip = await JSZip.loadAsync(cleared.bytes)
    const last = await lastZip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(last).not.toContain('autoFilter')
    expect(last).not.toContain('hidden="1"')
    expect(last).toContain('<f>A2+$D$1</f><v>12</v>')
  })

  it('copies, moves, hides and deletes worksheets through the original package gateway', async () => {
    const bytes = await rangeFixture()
    await expect(
      execute(bytes, { op: 'set_sheet_hidden', sheetId: 'sheet-1', hidden: true }),
    ).rejects.toThrow('visible')
    const copied = await execute(bytes, { op: 'duplicate_sheet', sheetId: 'sheet-1', name: '副本' })
    const read = await readBasicWorkbook(Buffer.from(copied.bytes))
    const id = read.snapshot.sheets[1]!.id
    expect(read.snapshot.sheets[1]?.cells.B2?.formula).toBe('=A2+$D$1')
    const moved = await execute(copied.bytes, { op: 'move_sheet', sheetId: id, position: 1 }, 1)
    expect(
      (await readBasicWorkbook(Buffer.from(moved.bytes))).snapshot.sheets.map(
        (sheet) => sheet.name,
      ),
    ).toEqual(['副本', '数据'])
    const hidden = await execute(
      moved.bytes,
      { op: 'set_sheet_hidden', sheetId: id, hidden: true },
      2,
    )
    expect(
      await (await JSZip.loadAsync(hidden.bytes)).file('xl/workbook.xml')!.async('string'),
    ).toMatch(/<sheet\b[^>]*state="hidden"[^>]*name="副本"/)
    const removed = await execute(hidden.bytes, { op: 'delete_sheet', sheetId: id }, 3)
    expect(
      (await readBasicWorkbook(Buffer.from(removed.bytes))).snapshot.sheets.map(
        (sheet) => sheet.name,
      ),
    ).toEqual(['数据'])
  })

  it('replaces only raw text cells and keeps formulas and numbers typed', async () => {
    const bytes = await rangeFixture()
    const result = await execute(bytes, {
      op: 'find_replace',
      sheetId: 'sheet-1',
      range: 'A1:D3',
      find: '范围',
      replace: '更改',
    })
    const read = await readBasicWorkbook(Buffer.from(result.bytes))
    expect(read.snapshot.sheets[0]?.cells.D2?.value).toBe('更改外')
    expect(read.snapshot.sheets[0]?.cells.B2?.formula).toBe('=A2+$D$1')
    const xml = await (
      await JSZip.loadAsync(result.bytes)
    )
      .file('xl/worksheets/sheet1.xml')!
      .async('string')
    expect(xml).toContain('<c r="A2" s="1"><v>2</v></c>')
  })
})

describe('XLSX sort preflight and cached-key safety', () => {
  it('refuses shared/array formulas and address-bound structures before returning mutated bytes', async () => {
    const original = load()
    for (const body of [
      '<sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1"><f t="shared" si="0" ref="B1:B2">A1+1</f><v>3</v></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2"><f t="shared" si="0"/><v>2</v></c></row></sheetData>',
      '<sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1"><f t="array" ref="B1:B2">A1:A2+1</f><v>3</v></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData>',
      ...[
        'mergeCells',
        'hyperlinks',
        'legacyDrawing',
        'tableParts',
        'conditionalFormatting',
        'dataValidations',
        'autoFilter',
      ].map(
        (feature) =>
          `<sheetData><row r="1"><c r="A1"><v>2</v></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData><${feature}/>`,
      ),
    ]) {
      const zip = await JSZip.loadAsync(original)
      zip.file(
        'xl/worksheets/sheet1.xml',
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${body}</worksheet>`,
      )
      const bytes = await zip.generateAsync({ type: 'uint8array' })
      const prior = bytes.slice()
      await expect(
        applyXlsxOpsOnHost({
          documentId: 'xlsx-1',
          bytes,
          expectedVersion: 0,
          ops: [
            { op: 'sort_range', sheetId: 'sheet-1', range: 'A1:B2', byColumn: 'A', order: 'asc' },
          ],
        }),
      ).rejects.toThrow(/共享\/数组公式|范围关联结构无法安全保留/)
      expect(bytes).toEqual(prior)
    }
  })

  it('refuses a formula sort key without a cached result', async () => {
    const zip = await JSZip.loadAsync(load())
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>1+1</f></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData></worksheet>',
    )
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes,
        expectedVersion: 0,
        ops: [
          { op: 'sort_range', sheetId: 'sheet-1', range: 'A1:A2', byColumn: 'A', order: 'asc' },
        ],
      }),
    ).rejects.toThrow('排序键公式无缓存结果')
  })
})
