import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { applyXlsxPivotOperation } from '../../../../apps/server/src/services/xlsx-agent-pivots.js'
import { openXlsxForEdit } from '../xlsx-edit.js'
import { readXlsx } from '../xlsx.js'
import {
  createXlsxPivotDraft,
  xlsxPivotOperation,
  xlsxPivotReadback,
  xlsxPivotValue,
  xlsxPivotSource,
} from './xlsx-pivot-controls.js'
import { xlsxPivotFixture, xlsxCrossSheetPivotFixture } from './xlsx-pivot-test-fixture.js'

it('reads actual headers and cached values, keeps basic defaults and rejects missing headers/cache/bounds', async () => {
  const { sheet } = await xlsxPivotFixture()
  expect(xlsxPivotSource(sheet, 'A1:F6').fields).toEqual([
    '区域',
    '部门',
    '日期',
    '金额',
    '成本',
    '渠道',
  ])
  expect(createXlsxPivotDraft(sheet, 'A1:F6')).toMatchObject({
    rowFields: ['区域'],
    values: [{ field: '金额', agg: 'sum' }],
    groupings: [],
    filters: [],
    pageFields: [],
  })
  for (const range of ['', 'A1', 'A1:F1', 'A1:ZZ1000', 'XFE1:XFE2'])
    expect(() => xlsxPivotSource(sheet, range)).toThrow(/源范围|标题/)
  const bad = structuredClone(sheet)
  bad.rows[0]!.cells[1]!.text = '区域'
  expect(() => xlsxPivotSource(bad, 'A1:F6')).toThrow('不能重复')
  const uncached = structuredClone(sheet)
  uncached.rows[1]!.cells.find((cell) => cell.col === 25)!.formulaCache = 'missing'
  expect(() => xlsxPivotSource(uncached, 'Z1:Z2')).toThrow('未计算公式')
})

it('sends multi-values, label/value filters, date groups and report fields to the real native executor and preserves readback across refresh and two saves', async () => {
  const { bytes, sheet } = await xlsxPivotFixture()
  const draft = createXlsxPivotDraft(sheet, 'A1:F6')
  Object.assign(draft, {
    targetCell: 'I1',
    name: '高级透视',
    rowFields: ['区域', '日期'],
    pageFields: ['渠道'],
    values: [
      xlsxPivotValue('sales', '金额'),
      { ...xlsxPivotValue('cost', '成本'), agg: 'average' },
    ],
    groupings: [{ key: 'g', field: '日期', mode: 'quarter', step: '100', start: '' }],
    filters: [
      {
        key: 'f1',
        field: '区域',
        op: 'contains',
        text: '华',
        valueKey: 'sales',
        count: '10',
        from: '',
        to: '',
      },
      {
        key: 'f2',
        field: '日期',
        op: 'top',
        text: '',
        valueKey: 'cost',
        count: '2',
        from: '',
        to: '',
      },
    ],
  })
  const { operation, layout } = xlsxPivotOperation(sheet, draft)
  expect(operation).toMatchObject({
    pageFields: ['渠道'],
    groupings: [{ field: '日期', kind: 'date', dateUnit: 'quarter' }],
    filters: [
      { kind: 'label', field: '区域', value: '华' },
      { kind: 'value', field: '日期', valueIndex: 1, count: 2 },
    ],
  })
  expect(JSON.stringify(operation)).not.toContain('valueKey')
  expect(layout.matrix.some((row) => row.includes('Q2'))).toBe(true)
  const added = await applyXlsxPivotOperation(bytes, operation, 0)
  const first = (await readXlsx(added.bytes)).sheets[0]!
  const pivot = first.pivots![0]!
  const readback = xlsxPivotReadback(pivot)
  expect(readback).toMatchObject({
    rows: ['区域', '日期'],
    pages: [{ field: '渠道', value: '全部项' }],
    values: [
      { fieldName: '金额', subtotal: 'sum' },
      { fieldName: '成本', subtotal: 'average' },
    ],
    groupings: [{ field: '日期', kind: 'date', dateUnit: 'quarter' }],
    filters: [
      { kind: 'label', fieldName: '区域' },
      { kind: 'value', fieldName: '日期', dataField: 1 },
    ],
  })
  const refreshed = await applyXlsxPivotOperation(
    added.bytes,
    { op: 'refresh_pivot', sheetId: sheet.id },
    1,
  )
  const session = await openXlsxForEdit(refreshed.bytes)
  const once = await session.save()
  session.commit()
  const twice = await session.save()
  expect(xlsxPivotReadback((await readXlsx(once)).sheets[0]!.pivots![0]!)).toEqual(readback)
  expect(xlsxPivotReadback((await readXlsx(twice)).sheets[0]!.pivots![0]!)).toEqual(readback)
  const before = await JSZip.loadAsync(bytes),
    after = await JSZip.loadAsync(twice)
  for (const path of ['customXml/mimir-pivot-preservation.xml', 'xl/sharedStrings.xml'])
    expect(await after.file(path)!.async('uint8array')).toEqual(
      await before.file(path)!.async('uint8array'),
    )
  const xml = await after.file(sheet.entry)!.async('string')
  expect(xml).toContain('<c r="Z1" s="0" t="inlineStr"><is><t>保留原件属性</t></is></c>')
  expect(xml).toContain('<c r="Z2"><f>1+2</f><v>3</v></c>')
})

it('keeps numeric grouping start, all value properties and stable filter binding when other values are removed', async () => {
  const { sheet } = await xlsxPivotFixture()
  const draft = createXlsxPivotDraft(sheet, 'A1:F6')
  Object.assign(draft, {
    targetCell: 'I1',
    rowFields: ['金额'],
    values: [
      xlsxPivotValue('one', '成本'),
      {
        ...xlsxPivotValue('two', '成本'),
        agg: 'average',
        numFmt: '0.00',
        showDataAs: 'percentOfTotal',
      },
    ],
    groupings: [{ key: 'g', field: '金额', mode: 'range', step: '20', start: '-5' }],
    filters: [
      {
        key: 'f',
        field: '金额',
        op: 'between',
        valueKey: 'two',
        text: '',
        count: '10',
        from: '0',
        to: '100',
      },
    ],
  })
  const snapshot = structuredClone(draft)
  expect(xlsxPivotOperation(sheet, draft).operation).toMatchObject({
    groupings: [{ rangeStep: 20, rangeStart: -5 }],
    values: [{ field: '成本' }, { agg: 'average', numFmt: '0.00', showDataAs: 'percentOfTotal' }],
    filters: [{ valueIndex: 1, from: 0, to: 100 }],
  })
  expect(draft).toEqual(snapshot)
  draft.values.shift()
  expect(xlsxPivotOperation(sheet, draft).operation.filters).toMatchObject([{ valueIndex: 0 }])
  draft.values = [xlsxPivotValue('other', '成本')]
  expect(() => xlsxPivotOperation(sheet, draft)).toThrow('汇总值已移除')
})

it('rejects incompatible axes, stale rules, invalid numbers, and output overlap before any write', async () => {
  const { sheet } = await xlsxPivotFixture()
  const base = createXlsxPivotDraft(sheet, 'A1:F6')
  base.targetCell = 'I1'
  base.values = [xlsxPivotValue('one', '金额')]
  for (const [patch, message] of [
    [
      {
        columnFields: ['部门'],
        values: [xlsxPivotValue('one', '金额'), xlsxPivotValue('two', '成本')],
      },
      '只能配置一个',
    ],
    [{ rowFields: ['区域', '区域'] }, '不能重复'],
    [{ pageFields: ['金额'] }, '汇总值不能'],
    [{ targetCell: 'A2' }, '不能与源'],
    [
      { groupings: [{ key: 'g', field: '渠道', mode: 'range', step: '10', start: '' }] },
      '当前行或列',
    ],
    [{ groupings: [{ key: 'g', field: '区域', mode: 'range', step: '0', start: '' }] }, '大于0'],
    [{ filters: [{ key: 'f', field: '区域', op: 'top', valueKey: 'one', count: '1.5' }] }, '整数'],
    [
      {
        filters: [{ key: 'f', field: '区域', op: 'between', valueKey: 'one', from: '4', to: '3' }],
      },
      '不能小于',
    ],
  ] as const)
    expect(() =>
      xlsxPivotOperation(sheet, { ...base, ...structuredClone(patch) } as typeof base),
    ).toThrow(message)
})

it('uses selected source fields and permits overlapping coordinates only across different sheets', async () => {
  const { source, sheet } = await xlsxCrossSheetPivotFixture()
  const draft = createXlsxPivotDraft(source, 'A1:F6')
  draft.targetCell = 'A1'
  const { operation, layout } = xlsxPivotOperation(source, draft, sheet)
  expect(operation).toMatchObject({
    sheetId: source.id,
    targetSheetId: sheet.id,
    sourceRange: 'A1:F6',
    targetCell: 'A1',
  })
  expect(layout.matrix.at(-1)).toContain(150)
  expect(() => xlsxPivotOperation(source, draft)).toThrow('不能与源范围重叠')
  expect(() => xlsxPivotOperation(sheet, draft, source)).toThrow('字段标题不能为空')
})
