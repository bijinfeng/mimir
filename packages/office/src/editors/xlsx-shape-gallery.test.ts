import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { ADDABLE_SHAPE_TYPES } from '../../vendor/packages/xlsx-gateway/src/shared/shape-types.js'
import { workbookOperationSchema } from '../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import { applyXlsxObjectOperation } from '../../../../apps/server/src/services/xlsx-agent-objects.js'
import { readXlsx } from '../xlsx.js'
import {
  createXlsxShapeDraft,
  filterXlsxShapes,
  XLSX_SHAPES,
  xlsxShapeOperation,
  xlsxShapePreview,
  type XlsxShapeDraft,
} from './xlsx-shape-gallery.js'

const workbookXml = (xml: string) => xml.replace(/<calcPr\b[^>]*\/>/g, '')

it('covers the exact native whitelist and textbox with real, finite geometry; no PPTX-only connectors', () => {
  const kinds = XLSX_SHAPES.map((shape) => shape.kind)
  expect(new Set(kinds).size).toBe(ADDABLE_SHAPE_TYPES.length + 1)
  expect(kinds.toSorted()).toEqual([...ADDABLE_SHAPE_TYPES, 'textbox'].toSorted())
  for (const kind of kinds) {
    const paths = xlsxShapePreview(kind, 256, 160)
    expect(paths).not.toBeNull()
    expect(Object.values(paths!).filter(Boolean).join(' ')).not.toMatch(/NaN|Infinity/)
    expect(Object.values(paths!).some(Boolean)).toBe(true)
  }
  expect(xlsxShapePreview('unknown-native-preset')).toBeNull()
  expect(xlsxShapePreview('heart')).not.toEqual(xlsxShapePreview('rect'))
  expect(xlsxShapePreview('flowChartMagneticDisk')).not.toEqual(xlsxShapePreview('rect'))
  expect(
    filterXlsxShapes('圆角')
      .flatMap((group) => group.shapes)
      .map((s) => s.kind),
  ).toContain('roundRect')
  expect(
    filterXlsxShapes('CLOUD')
      .flatMap((group) => group.shapes)
      .map((s) => s.kind),
  ).toEqual(['cloud', 'cloudCallout'])
  expect(filterXlsxShapes('', 'callouts').flatMap((group) => group.shapes)).toHaveLength(4)
  expect(filterXlsxShapes('无匹配')).toEqual([])
})

it('validates insertion position, native envelope, text and fill without silently changing the selected preset', () => {
  const draft = {
    ...createXlsxShapeDraft('E2:H7'),
    kind: 'cloudCallout' as const,
    text: '批注 & <保留>',
    fillColor: '#FF0000',
  }
  expect(xlsxShapeOperation(draft)).toMatchObject({
    op: 'add_shape',
    shapeType: 'cloudCallout',
    anchorCell: 'E2',
    text: draft.text,
  })
  for (const anchorCell of ['', 'A0', 'A1:B2', 'XFD1', 'A1048576', 'XFE1', 'A10000000'])
    expect(() => xlsxShapeOperation({ ...draft, anchorCell })).toThrow(/单元格|位置/)
  expect(xlsxShapeOperation({ ...draft, anchorCell: ' e2 ' }).anchorCell).toBe('E2')
  expect(() => xlsxShapeOperation({ ...draft, kind: 'line' } as unknown as XlsxShapeDraft)).toThrow(
    /形状库/,
  )
  expect(() => xlsxShapeOperation({ ...draft, text: '字'.repeat(1001) })).toThrow(/1000/)
  expect(() => xlsxShapeOperation({ ...draft, fillColor: 'red' })).toThrow(/填充/)
  expect(() => xlsxShapeOperation({ ...draft, fillColor: 'FF0000' })).toThrow(/填充/)
})

it('inserts all native presets and textbox through the actual host and reopens without losing existing workbook data', async () => {
  let bytes: Uint8Array = new Uint8Array(
    readFileSync(
      join(import.meta.dirname, '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx'),
    ),
  )
  const original = await JSZip.loadAsync(bytes),
    before = await readXlsx(bytes),
    sheetId = before.sheets[0]!.id
  let version = 0
  for (const shape of XLSX_SHAPES) {
    const operation = workbookOperationSchema.parse({
      ...xlsxShapeOperation({
        ...createXlsxShapeDraft('F2'),
        kind: shape.kind,
        text: `${shape.kind} & <文字>`,
      }),
      sheetId,
    })
    const result = await applyXlsxObjectOperation(bytes, operation, version)
    expect(result.version).toBe(++version)
    bytes = result.bytes
  }
  const reopened = await readXlsx(bytes),
    zip = await JSZip.loadAsync(bytes),
    drawing = await zip.file(reopened.sheets[0]!.visuals![0]!.drawingPath)!.async('string')
  expect(reopened.sheets[0]!.visuals).toHaveLength(XLSX_SHAPES.length)
  const presets = [...drawing.matchAll(/<a:prstGeom prst="([^"]+)"/g)].map((match) => match[1])
  expect(presets.toSorted()).toEqual([...ADDABLE_SHAPE_TYPES, 'rect'].toSorted())
  expect(drawing).toContain('txBox="1"')
  expect(drawing).toContain('&amp; &lt;文字&gt;')
  const sheetEntry = before.sheets[0]!.entry
  expect(
    /<sheetData[\s\S]*?<\/sheetData>/.exec(await zip.file(sheetEntry)!.async('string'))?.[0],
  ).toEqual(
    /<sheetData[\s\S]*?<\/sheetData>/.exec(await original.file(sheetEntry)!.async('string'))?.[0],
  )
  for (const path of ['xl/sharedStrings.xml', 'xl/styles.xml'])
    expect(await zip.file(path)?.async('uint8array')).toEqual(
      await original.file(path)?.async('uint8array'),
    )
  // The established gateway asks Excel for full calculation after every workbook edit.
  expect(workbookXml(await zip.file('xl/workbook.xml')!.async('string'))).toBe(
    workbookXml(await original.file('xl/workbook.xml')!.async('string')),
  )
}, 30000)
