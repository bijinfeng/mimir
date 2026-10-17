import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { applyXlsxPivotOperation } from '../services/xlsx-agent-pivots.js'
import { xlsxCrossSheetPivotFixture } from '../../../../packages/office/src/editors/xlsx-pivot-test-fixture.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { inspectXlsxPivotLayout } from '../../../../packages/office/src/xlsx-pivot-editability.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
async function fixture() {
  const original = await xlsxCrossSheetPivotFixture()
  const result = await applyXlsxPivotOperation(
    original.bytes,
    {
      op: 'add_pivot',
      sheetId: original.source.id,
      targetSheetId: original.sheet.id,
      sourceRange: 'A1:F6',
      targetCell: 'A1',
      rowFields: ['区域', '部门'],
      values: [
        { field: '金额', agg: 'average' },
        { field: '成本', agg: 'sum' },
      ],
      name: '原有销售透视布局验收',
    },
    0,
  )
  const pivot = (await readXlsx(result.bytes)).sheets.find(
    (sheet) => sheet.id === original.sheet.id,
  )!.pivots![0]!
  return { ...original, bytes: result.bytes, pivot }
}
const edit = (bytes: Uint8Array, pivotPath: string, extra: Record<string, unknown> = {}) =>
  applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: 3,
    ops: [
      {
        op: 'edit_pivot_layout',
        sheetId: 'sheet-2',
        pivotPath,
        rowFields: ['区域'],
        columnFields: ['部门'],
        values: [{ field: '金额', agg: 'sum' }],
        ...extra,
      },
    ],
  })
describe('existing pivot layout edit', () => {
  it('edits a real generated pivot and preserves identity and unrelated native parts across repeated edits and refresh', async () => {
    const f = await fixture()
    const eligible = await inspectXlsxPivotLayout(f.bytes, f.sheet.id, f.pivot.path)
    expect(eligible).toMatchObject({
      eligible: true,
      seed: {
        rowFields: ['区域', '部门'],
        values: [
          { field: '金额', agg: 'average' },
          { field: '成本', agg: 'sum' },
        ],
      },
    })
    writeFileSync('/tmp/mimir-xlsx-pivot-layout-supported-20261017.xlsx', f.bytes)
    const result = await edit(f.bytes, f.pivot.path)
    expect(result.version).toBe(4)
    const after = (await readXlsx(result.bytes)).sheets.find((sheet) => sheet.id === 'sheet-2')!,
      pivot = after.pivots![0]!
    expect(pivot.path).toBe(f.pivot.path)
    expect(pivot.cachePath).toBe(f.pivot.cachePath)
    expect(pivot.name).toBe(f.pivot.name)
    expect(pivot.definition.rowFields).toEqual([0])
    expect(pivot.definition.colFields).toEqual([1])
    expect(after.rows.flatMap((row) => row.cells).some((cell) => cell.text === '150')).toBe(true)
    const oldZip = await JSZip.loadAsync(f.bytes),
      zip = await JSZip.loadAsync(result.bytes)
    for (const path of Object.keys(oldZip.files).filter(
      (entryPath) =>
        !oldZip.files[entryPath]!.dir &&
        ![
          'xl/worksheets/sheet2.xml',
          f.pivot.path,
          f.pivot.cachePath,
          'xl/pivotCache/pivotCacheRecords1.xml',
          'xl/workbook.xml',
        ].includes(entryPath),
    ))
      expect(await zip.file(path)!.async('uint8array')).toEqual(
        await oldZip.file(path)!.async('uint8array'),
      )
    expect(await inspectXlsxPivotLayout(result.bytes, f.sheet.id, f.pivot.path)).toMatchObject({
      eligible: true,
    })
    const back = await edit(result.bytes, f.pivot.path, {
      rowFields: ['部门', '区域'],
      columnFields: [],
      values: [
        { field: '金额', agg: 'count' },
        { field: '成本', agg: 'max' },
      ],
    })
    expect((await readXlsx(back.bytes)).sheets[1]!.pivots![0]!.definition.rowFields).toEqual([1, 0])
    const refreshed = await applyXlsxPivotOperation(
      back.bytes,
      { op: 'refresh_pivot', sheetId: f.sheet.id },
      4,
    )
    expect((await readXlsx(refreshed.bytes)).sheets[1]!.pivots![0]!.definition.rowFields).toEqual([
      1, 0,
    ])
  })
  it('clears only the real union for tall-narrow to short-wide and back, preserving external corner text, formula and style', async () => {
    const f = await xlsxCrossSheetPivotFixture()
    let bytes = (
      await applyXlsxPivotOperation(
        f.bytes,
        {
          op: 'add_pivot',
          sheetId: f.source.id,
          targetSheetId: f.sheet.id,
          sourceRange: 'A1:F6',
          targetCell: 'A1',
          rowFields: ['区域', '部门'],
          values: [{ field: '金额', agg: 'sum' }],
          name: '角落保留',
        },
        0,
      )
    ).bytes
    const view = await readXlsx(bytes),
      pivot = view.sheets[1]!.pivots![0]!
    const zip = await JSZip.loadAsync(bytes),
      path = f.sheet.entry
    const corner =
      '<c r="E8" t="inlineStr"><is><t>不能清除的角落</t></is></c><c r="F8" s="1"><f>1+2</f><v>3</v></c>'
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace(
        '</sheetData>',
        `<row r="8">${corner}</row></sheetData>`,
      ),
    )
    bytes = await zip.generateAsync({ type: 'uint8array' })
    const wide = await edit(bytes, pivot.path, { rowFields: ['部门'], columnFields: ['区域'] })
    const native = await JSZip.loadAsync(wide.bytes)
    expect(await native.file(path)!.async('string')).toContain(corner)
    const tall = await edit(wide.bytes, pivot.path, {
      rowFields: ['区域', '部门'],
      columnFields: [],
    })
    expect(await (await JSZip.loadAsync(tall.bytes)).file(path)!.async('string')).toContain(corner)
    expect(new Set(wide.changedCells).size).toBe(wide.changedCells.length)
    expect(wide.changedCells).not.toContain('汇总!E8')
    const conflict = await JSZip.loadAsync(bytes)
    conflict.file(
      path,
      (await conflict.file(path)!.async('string')).replace(
        '<row r="1">',
        '<row r="1"><c r="E1" t="inlineStr"><is><t>不能覆盖</t></is></c>',
      ),
    )
    await expect(
      edit(await conflict.generateAsync({ type: 'uint8array' }), pivot.path, {
        rowFields: ['部门'],
        columnFields: ['区域'],
      }),
    ).rejects.toThrow('覆盖')
  })
  it.each([
    [
      'number format',
      'table',
      (xml: string) => xml.replace('<dataField ', '<dataField numFmtId="2" '),
    ],
    [
      'custom format',
      'table',
      (xml: string) => xml.replace('<dataField ', '<dataField numFmtId="164" '),
    ],
    ['custom style', 'table', (xml: string) => xml.replace('PivotStyleLight16', 'PivotStyleDark1')],
    ['custom caption', 'table', (xml: string) => xml.replace('Average of 金额', '自定名称')],
    [
      'total',
      'table',
      (xml: string) =>
        xml.replace('<pivotTableDefinition ', '<pivotTableDefinition rowGrandTotals="0" '),
    ],
    [
      'unknown attribute',
      'table',
      (xml: string) => xml.replace('<location ', '<location mystery="1" '),
    ],
    [
      'extension',
      'table',
      (xml: string) => xml.replace('</pivotTableDefinition>', '<extLst/></pivotTableDefinition>'),
    ],
    ['hidden item', 'table', (xml: string) => xml.replace('<item x=', '<item h="1" x=')],
    [
      'grouping',
      'cache',
      (xml: string) => xml.replace('</cacheField>', '<fieldGroup/></cacheField>'),
    ],
    [
      'cache attr',
      'cache',
      (xml: string) => xml.replace('<cacheField ', '<cacheField unknown="1" '),
    ],
    [
      'formula',
      'cache',
      (xml: string) => xml.replace('<cacheField ', '<cacheField formula="A+1" '),
    ],
    [
      'pageFields',
      'table',
      (xml: string) =>
        xml.replace('</pivotTableDefinition>', '<pageFields count="0"/></pivotTableDefinition>'),
    ],
    [
      'filters',
      'table',
      (xml: string) =>
        xml.replace('</pivotTableDefinition>', '<filters count="0"/></pivotTableDefinition>'),
    ],
    [
      'duplicate',
      'table',
      (xml: string) =>
        xml.replace('</pivotTableDefinition>', '<location ref="A1:B2"/></pivotTableDefinition>'),
    ],
  ])('rejects raw %s without changing any input bytes', async (_name, kind, mutate) => {
    const f = await fixture(),
      zip = await JSZip.loadAsync(f.bytes),
      path = kind === 'table' ? f.pivot.path : f.pivot.cachePath
    zip.file(path, mutate(await zip.file(path)!.async('string')))
    const input = await zip.generateAsync({ type: 'uint8array' }),
      copy = input.slice()
    const state = await inspectXlsxPivotLayout(input, f.sheet.id, f.pivot.path)
    expect(state.eligible).toBe(false)
    await expect(edit(input, f.pivot.path)).rejects.toThrow(/./)
    expect(input).toEqual(copy)
    if (_name === 'extension')
      writeFileSync('/tmp/mimir-xlsx-pivot-layout-readonly-20261017.xlsx', input)
  })
  it('rejects source/target protection, shared cache, invalid binding, extra schema fields, mixed batches and abort', async () => {
    const f = await fixture()
    for (const path of [f.source.entry, f.sheet.entry]) {
      const zip = await JSZip.loadAsync(f.bytes)
      zip.file(
        path,
        (await zip.file(path)!.async('string')).replace(
          '</sheetData>',
          '</sheetData><sheetProtection sheet="1"/>',
        ),
      )
      await expect(
        edit(await zip.generateAsync({ type: 'uint8array' }), f.pivot.path),
      ).rejects.toThrow('保护')
    }
    const shared = await JSZip.loadAsync(f.bytes)
    shared.file('xl/pivotTables/pivotTable2.xml', await shared.file(f.pivot.path)!.async('string'))
    shared.file(
      'xl/pivotTables/_rels/pivotTable2.xml.rels',
      await shared.file('xl/pivotTables/_rels/pivotTable1.xml.rels')!.async('string'),
    )
    await expect(
      edit(await shared.generateAsync({ type: 'uint8array' }), f.pivot.path),
    ).rejects.toThrow('共享缓存')
    await expect(edit(f.bytes, 'xl/not-a-pivot.xml')).rejects.toThrow('关系')
    for (const extra of [{ sourceRange: 'A1:F6' }, { targetCell: 'Z1' }, { cacheId: 2 }])
      await expect(edit(f.bytes, f.pivot.path, extra)).rejects.toThrow(/./)
    await expect(
      edit(f.bytes, f.pivot.path, {
        rowFields: ['区域', '部门'],
        columnFields: [],
        values: [
          { field: '金额', agg: 'average' },
          { field: '成本', agg: 'sum' },
        ],
      }),
    ).rejects.toThrow('配置未变化')
    const controller = new AbortController()
    controller.abort()
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes: f.bytes,
        expectedVersion: 0,
        signal: controller.signal,
        ops: [
          {
            op: 'edit_pivot_layout',
            sheetId: f.sheet.id,
            pivotPath: f.pivot.path,
            rowFields: ['区域'],
            columnFields: [],
            values: [{ field: '金额', agg: 'sum' }],
          },
        ],
      }),
    ).rejects.toThrow(/./)
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes: f.bytes,
        expectedVersion: 0,
        ops: [
          {
            op: 'edit_pivot_layout',
            sheetId: f.sheet.id,
            pivotPath: f.pivot.path,
            rowFields: ['区域'],
            columnFields: [],
            values: [{ field: '金额', agg: 'sum' }],
          },
          { op: 'set_cell', sheetId: f.sheet.id, address: 'Z1', value: 'bad' },
        ],
      }),
    ).rejects.toThrow('单独')
  })
  it.each(['c', ''])(
    'rejects a native %s pivotSource text reference to the selected pivot',
    async (prefix) => {
      const f = await fixture(),
        zip = await JSZip.loadAsync(f.bytes),
        tag = prefix ? `${prefix}:` : '',
        namespace = prefix ? `xmlns:${prefix}` : 'xmlns'
      zip.file(
        'xl/charts/chart1.xml',
        `<${tag}chartSpace ${namespace}="http://schemas.openxmlformats.org/drawingml/2006/chart"><${tag}pivotSource><${tag}name>[0]汇总!${f.pivot.name}</${tag}name><${tag}fmtId val="0"/></${tag}pivotSource><${tag}chart><${tag}plotArea/></${tag}chart></${tag}chartSpace>`,
      )
      const bytes = await zip.generateAsync({ type: 'uint8array' }),
        before = bytes.slice()
      expect(await inspectXlsxPivotLayout(bytes, f.sheet.id, f.pivot.path)).toMatchObject({
        eligible: false,
        reasons: [expect.stringContaining('透视图')],
      })
      await expect(edit(bytes, f.pivot.path)).rejects.toThrow('透视图')
      expect(bytes).toEqual(before)
    },
  )
  it('preserves an unrelated pivot chart whose pivot name only starts with the selected name', async () => {
    const f = await fixture(),
      zip = await JSZip.loadAsync(f.bytes),
      chart = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:pivotSource><c:name>[0]汇总!${f.pivot.name}另一张</c:name><c:fmtId val="0"/></c:pivotSource><c:chart><c:plotArea/></c:chart></c:chartSpace>`
    zip.file('xl/charts/chart1.xml', chart)
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    expect(await inspectXlsxPivotLayout(bytes, f.sheet.id, f.pivot.path)).toMatchObject({
      eligible: true,
    })
    const result = await edit(bytes, f.pivot.path)
    expect(
      await (await JSZip.loadAsync(result.bytes)).file('xl/charts/chart1.xml')!.async('string'),
    ).toBe(chart)
  })
  it.each(['pivotCacheDefinition1', 'pivotCacheRecords1'])(
    'rejects an ambiguous encoded relationship to selected %s outside the standard pivot folder',
    async (name) => {
      const f = await fixture(),
        zip = await JSZip.loadAsync(f.bytes)
      zip.file('xl/custom/dependent.xml', '<dependent/>')
      zip.file(
        'xl/custom/_rels/dependent.xml.rels',
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${name.startsWith('pivotCacheDefinition') ? 'pivotCacheDefinition' : 'pivotCacheRecords'}" Target="../pivotCache/${name.replace('1', '%31')}.xml"/></Relationships>`,
      )
      const bytes = await zip.generateAsync({ type: 'uint8array' }),
        before = bytes.slice()
      expect(await inspectXlsxPivotLayout(bytes, f.sheet.id, f.pivot.path)).toMatchObject({
        eligible: false,
      })
      await expect(edit(bytes, f.pivot.path)).rejects.toThrow(/关系|缓存/)
      expect(bytes).toEqual(before)
    },
  )
  it.each([
    'external records',
    'duplicate relationship',
    'unknown records',
    'source members',
    'custom output style',
  ])('rejects %s from actual package bytes', async (kind) => {
    const f = await fixture(),
      zip = await JSZip.loadAsync(f.bytes)
    if (kind === 'external records') {
      const path = 'xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels'
      zip.file(
        path,
        (await zip.file(path)!.async('string')).replace(
          '<Relationship ',
          '<Relationship TargetMode="External" ',
        ),
      )
    } else if (kind === 'duplicate relationship') {
      const path = 'xl/pivotTables/_rels/pivotTable1.xml.rels',
        xml = await zip.file(path)!.async('string')
      zip.file(
        path,
        xml.replace(
          '</Relationships>',
          xml.match(/<Relationship\b[^>]*\/>/)![0] + '</Relationships>',
        ),
      )
    } else if (kind === 'unknown records') {
      const path = 'xl/pivotCache/pivotCacheRecords1.xml'
      zip.file(path, (await zip.file(path)!.async('string')).replace('<r>', '<r mystery="1">'))
    } else if (kind === 'source members') {
      zip.file(
        f.source.entry,
        (await zip.file(f.source.entry)!.async('string')).replace('华东', '新成员'),
      )
    } else {
      zip.file(
        f.sheet.entry,
        (await zip.file(f.sheet.entry)!.async('string')).replace('<c r="A1"', '<c r="A1" s="1"'),
      )
    }
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      before = bytes.slice()
    expect((await inspectXlsxPivotLayout(bytes, f.sheet.id, f.pivot.path)).eligible).toBe(false)
    await expect(edit(bytes, f.pivot.path)).rejects.toThrow(/关系|记录|缓存|成员|格式|外观/)
    expect(bytes).toEqual(before)
  })
})
