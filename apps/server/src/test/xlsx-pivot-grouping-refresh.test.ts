import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { applyXlsxPivotOperation } from '../services/xlsx-agent-pivots.js'
import { xlsxPivotFixture } from '../../../../packages/office/src/editors/xlsx-pivot-test-fixture.js'
import {
  createXlsxPivotDraft,
  xlsxPivotOperation,
  xlsxPivotReadback,
  xlsxPivotValue,
} from '../../../../packages/office/src/editors/xlsx-pivot-controls.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { applyCellEditsToXlsx } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'

async function grouped(kind: 'date' | 'range') {
  const fixture = await xlsxPivotFixture(),
    draft = createXlsxPivotDraft(fixture.sheet, 'A1:F6')
  Object.assign(draft, {
    targetCell: 'I1',
    rowFields: ['区域', kind === 'date' ? '日期' : '金额'],
    values: [
      xlsxPivotValue('one', kind === 'date' ? '金额' : '成本'),
      { ...xlsxPivotValue('two', '成本'), agg: 'average' },
    ],
    pageFields: ['渠道'],
    groupings: [
      {
        key: 'group',
        field: kind === 'date' ? '日期' : '金额',
        mode: kind === 'date' ? 'year' : 'range',
        step: '20',
        start: '-5',
      },
    ],
    filters: [
      {
        key: 'filter',
        field: '区域',
        op: 'contains',
        text: '华',
        valueKey: 'one',
        count: '10',
        from: '',
        to: '',
      },
    ],
  })
  const added = await applyXlsxPivotOperation(
    fixture.bytes,
    xlsxPivotOperation(fixture.sheet, draft).operation,
    0,
  )
  return { ...fixture, added }
}

it.each(['inlineStr', 's'] as const)(
  'aggregates every real department from %s after adjacent self-closing cells/shared strings, with no invented blank member, and preserves totals on refresh',
  async (storage) => {
    const fixture = await xlsxPivotFixture(),
      zip = await JSZip.loadAsync(fixture.bytes)
    const records = [
      ['部门', '地区', '年份', '收入', '成本'],
      ['技术部', '华东', 2024, 120, 70],
      ['技术部', '华南', 2025, 150, 80],
      ['市场部', '华东', 2024, 100, 60],
      ['市场部', '华南', 2025, 180, 95],
      ['技术部', '华东', 2026, 200, 100],
      ['市场部', '华东', 2026, 160, 90],
    ]
    const labels = [
      ...new Set(
        records.flatMap((record) =>
          record.filter((value): value is string => typeof value === 'string'),
        ),
      ),
    ]
    // Empty shared entries before and between actual labels must keep their indexes.
    const strings = labels.flatMap((value) => ['', value])
    if (storage === 's') {
      zip.file(
        'xl/sharedStrings.xml',
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((value) => (value ? `<si><t>${value}</t></si>` : '<si/>')).join('')}</sst>`,
      )
    }
    const sourceCell = (value: string | number, ref: string) =>
      `<c r="${ref}"${typeof value === 'string' ? ` t="${storage}"` : ''}>${typeof value === 'string' ? (storage === 's' ? `<v>${strings.indexOf(value)}</v>` : `<is><t>${value}</t></is>`) : `<v>${value}</v>`}</c>`
    const xml = await zip.file(fixture.sheet.entry)!.async('string')
    zip.file(
      fixture.sheet.entry,
      xml.replace(
        /<sheetData>[\s\S]*?<\/sheetData>/,
        `<sheetData>${records
          .map((record, index) => {
            const row = index + 1
            return `<row r="${row}">${row === 5 || row === 6 ? `<c r="D${row}" s="0"/><c r="E${row}" s="0" />` : ''}${record.map((value, column) => sourceCell(value, `${String.fromCharCode(70 + column)}${row}`)).join('')}</row>`
          })
          .join('')}</sheetData>`,
      ),
    )
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const added = await applyXlsxPivotOperation(
      bytes,
      {
        op: 'add_pivot',
        sheetId: fixture.sheet.id,
        sourceRange: 'F1:J7',
        targetCell: 'F12',
        rowFields: ['部门'],
        values: [
          { field: '收入', agg: 'sum' },
          { field: '成本', agg: 'average' },
        ],
        pageFields: ['地区'],
        filters: [{ kind: 'label', field: '部门', op: 'contains', value: '部' }],
      },
      0,
    )
    const refreshed = await applyXlsxPivotOperation(
      added.bytes,
      { op: 'refresh_pivot', sheetId: fixture.sheet.id },
      1,
    )
    for (const result of [added, refreshed]) {
      const sheet = (await readXlsx(result.bytes)).sheets[0]!
      expect(sheet.rows.find((row) => row.number === 5)!.cells[5]!.text).toBe('市场部')
      expect(sheet.rows.find((row) => row.number === 6)!.cells[5]!.text).toBe('技术部')
      expect(sheet.pivots![0]!.definition.fields[0]!.sharedItems.toSorted()).toEqual(
        ['市场部', '技术部'].toSorted(),
      )
      expect(sheet.pivots![0]!.definition.outputRef).toBe('F12:H15')
      const output = new Map(
        sheet.rows
          .filter((row) => row.number >= 13 && row.number <= 15)
          .map((row) => [
            row.cells[5]!.text,
            row.cells.slice(6, 8).map((entry) => Number(entry.rawText)),
          ]),
      )
      expect(output.get('技术部')?.[0]).toBe(470)
      expect(output.get('技术部')?.[1]).toBeCloseTo(250 / 3)
      expect(output.get('市场部')?.[0]).toBe(440)
      expect(output.get('市场部')?.[1]).toBeCloseTo(245 / 3)
      expect(output.get('总计')?.[0]).toBe(910)
      expect(output.get('总计')?.[1]).toBeCloseTo(495 / 6)
      expect(output.has('')).toBe(false)
      const written = await (
        await JSZip.loadAsync(result.bytes)
      )
        .file(fixture.sheet.entry)!
        .async('string')
      expect(written).toContain(sourceCell('市场部', 'F5'))
      expect(written).toContain(sourceCell('技术部', 'F6'))
    }
  },
)

it.each(['date', 'range'] as const)(
  'refreshes writer-generated %s groups initially and after new members, preserving native metadata and unrelated ZIP entries across two saves',
  async (kind) => {
    const fixture = await grouped(kind),
      op = { op: 'refresh_pivot', sheetId: fixture.sheet.id } as const
    const first = await applyXlsxPivotOperation(fixture.added.bytes, op, 1)
    const initial = xlsxPivotReadback((await readXlsx(first.bytes)).sheets[0]!.pivots![0]!)
    expect(initial.groupings).toEqual([
      {
        field: kind === 'date' ? '日期' : '金额',
        ...(kind === 'date'
          ? { kind: 'date', dateUnit: 'year' }
          : { kind: 'range', rangeStep: 20, rangeStart: -5 }),
      },
    ])
    expect(initial.values).toHaveLength(2)
    expect(initial.pages).toEqual([{ field: '渠道', value: '全部项' }])
    expect(initial.filters).toMatchObject([{ kind: 'label', fieldName: '区域', value: '华' }])
    const edit = await applyCellEditsToXlsx(Buffer.from(first.bytes), [
      {
        sheetName: fixture.sheet.name,
        row: 5,
        column: kind === 'date' ? 2 : 3,
        writeValue: true,
        cell: { value: kind === 'date' ? '2027-09-10' : 150 },
      },
    ])
    const edited = new Uint8Array(edit.buffer),
      refreshed = await applyXlsxPivotOperation(edited, op, 2)
    const sheet = (await readXlsx(refreshed.bytes)).sheets[0]!
    expect(sheet.rows.flatMap((row) => row.cells.slice(8, 13).map((cell) => cell.text))).toContain(
      kind === 'date' ? '2027' : '135-155',
    )
    const readback = xlsxPivotReadback(sheet.pivots![0]!)
    expect(readback).toEqual(initial)
    const original = await JSZip.loadAsync(edited),
      after = await JSZip.loadAsync(refreshed.bytes)
    for (const [path, entry] of Object.entries(original.files).filter(
      ([candidatePath, candidate]) =>
        !candidate.dir && !refreshed.touchedEntries.includes(candidatePath),
    )) {
      expect(await after.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
    }
    const session = await openXlsxForEdit(refreshed.bytes),
      once = await session.save()
    session.commit()
    const twice = await session.save(),
      saved = (await readXlsx(twice)).sheets[0]!
    expect(xlsxPivotReadback(saved.pivots![0]!)).toEqual(readback)
    for (const bytes of [once, twice]) {
      const zip = await JSZip.loadAsync(bytes)
      expect(await zip.file('customXml/mimir-pivot-preservation.xml')!.async('string')).toBe(
        '<mimir value="keep-untouched"/>',
      )
      expect(await zip.file(fixture.sheet.entry)!.async('string')).toContain(
        '<c r="Z2"><f>1+2</f><v>3</v></c>',
      )
    }
  },
)

it.each([
  [
    'unknown sibling extension',
    (xml: string) =>
      xml.replace('</ext></extLst>', '</ext><ext uri="unknown"><payload/></ext></extLst>'),
  ],
  [
    'unknown child XML',
    (xml: string) => xml.replace('</ext></extLst>', '<payload/></ext></extLst>'),
  ],
  [
    'extra attributes',
    (xml: string) =>
      xml.replace('<aio:aioPivotGroupings ', '<aio:aioPivotGroupings custom="keep" '),
  ],
  [
    'unknown JSON metadata',
    (xml: string) => xml.replace('&quot;kind&quot;:', '&quot;custom&quot;:true,&quot;kind&quot;:'),
  ],
  [
    'duplicate extLst',
    (xml: string) =>
      xml.replace(
        '</pivotTableDefinition>',
        '<extLst><ext uri="unknown"/></extLst></pivotTableDefinition>',
      ),
  ],
  [
    'namespaced unknown extLst',
    (xml: string) =>
      xml.replace(
        '</pivotTableDefinition>',
        '<x:extLst xmlns:x="urn:unknown"><x:ext/></x:extLst></pivotTableDefinition>',
      ),
  ],
  ['invalid JSON', (xml: string) => xml.replace('v="[{', 'v="broken[{')],
] as const)(
  'atomically refuses grouping growth with %s instead of discarding original metadata',
  async (_label, change) => {
    const fixture = await grouped('date'),
      zip = await JSZip.loadAsync(fixture.added.bytes)
    const pivot = (await readXlsx(fixture.added.bytes)).sheets[0]!.pivots![0]!
    const xml = await zip.file(pivot.path)!.async('string'),
      modified = change(xml)
    expect(modified).not.toBe(xml)
    zip.file(pivot.path, modified)
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      before = bytes.slice()
    await expect(
      applyXlsxPivotOperation(bytes, { op: 'refresh_pivot', sheetId: fixture.sheet.id }, 1),
    ).rejects.toThrow(/扩展属性|metadata/)
    expect(bytes).toEqual(before)
    expect(await (await JSZip.loadAsync(bytes)).file(pivot.path)!.async('string')).toBe(modified)
  },
)
