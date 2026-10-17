import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'xlsx-fill'
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
import {
  xlsxFillFixture,
  FILL_BASE_XF,
} from '../../../../packages/office/src/editors/xlsx-fill-test-fixture.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { PATTERN_TYPES } from '../../../../packages/office/src/xlsx-fill.js'
import { xlsxAttribute as attr } from '../../../../packages/office/src/xlsx-sheet-features.js'
const format = (fill: unknown, range = 'A1:B1') => ({
  op: 'format_range',
  sheetId: 'sheet-1',
  range,
  format: { fill },
})
async function apply(bytes: Uint8Array, ops: readonly unknown[], version = 0) {
  return applyXlsxOpsOnHost({
    documentId: 'xlsx-fill',
    bytes,
    expectedVersion: version,
    ops: [...ops],
  })
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    values: Record<string, string> = {}
  for (const [name, entry] of Object.entries(zip.files))
    if (!entry.dir) values[name] = await entry.async('string')
  return values
}
function cell(workbook: Awaited<ReturnType<typeof readXlsx>>, col = 0) {
  return workbook.sheets[0]!.rows[0]!.cells.find((c) => c.col === col)!
}
function xf(styles: string, xml: string, address = 'A1') {
  const c = new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*>`).exec(xml)?.[0] ?? ''
  return [
    ...(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '').matchAll(
      /<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g,
    ),
  ][Number(attr(c, 's') ?? 0)]![0]
}
it('advertises the complete native fill contract to Agent', () => {
  const schema = JSON.stringify(
    xlsxAgentCatalog().tools.find((t) => t.name === 'propose_operations')?.inputSchema,
  )
  for (const name of [...PATTERN_TYPES, 'gradient', 'stops', 'tint', 'minItems', 'maxItems'])
    expect(schema).toContain(name)
})
it.each(PATTERN_TYPES)(
  'roundtrips %s with theme/tint and explicit background through native host, two edit-session saves and unrelated ZIP preservation',
  async (pattern) => {
    const fixture = await xlsxFillFixture(),
      before = await entries(fixture.bytes),
      result = await apply(fixture.bytes, [
        format({ pattern, fg: 'accent2-20%', bg: { theme: 'lt1', tint: 0.1 } }),
      ])
    const workbook = await readXlsx(result.bytes)
    expect(cell(workbook).format?.fill).toEqual({
      spec: { pattern, fg: { theme: 5, tint: -0.2 }, bg: { theme: 0, tint: 0.1 } },
      source: 'direct',
    })
    expect(cell(workbook, 1).format?.fill).toEqual(cell(workbook).format?.fill)
    const after = await entries(result.bytes),
      nativeXf = xf(after['xl/styles.xml']!, after[fixture.sheet.entry]!)
    expect(
      nativeXf.replace(/ fillId="\d+"/, ' fillId="0"').replace('applyFill="1"', 'applyFill="0"'),
    ).toBe(FILL_BASE_XF)
    for (const [path, value] of Object.entries(before).filter(
      ([entryName]) =>
        !['xl/styles.xml', fixture.sheet.entry, 'xl/workbook.xml'].includes(entryName),
    ))
      expect(after[path]).toBe(value)
    expect(after['xl/workbook.xml']?.replace('<calcPr fullCalcOnLoad="1"/>', '')).toBe(
      before['xl/workbook.xml'],
    )
    expect(after['xl/styles.xml']).toContain(
      '<dxfs count="1"><dxf><fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/></patternFill></fill></dxf></dxfs>',
    )
    const session = await openXlsxForEdit(result.bytes),
      saved = await session.save()
    session.commit()
    const reopened = await openXlsxForEdit(saved),
      twice = await reopened.save()
    expect(cell(await readXlsx(twice)).format?.fill).toEqual(cell(workbook).format?.fill)
    expect(await entries(twice)).toEqual(after)
  },
)
it.each(['linear', 'path'] as const)(
  'roundtrips all %s gradient parameters and 2–10 stops without RGB baking',
  async (type) => {
    let bytes = (await xlsxFillFixture()).bytes
    for (const count of [2, 10]) {
      const gradient = {
        type,
        ...(type === 'linear' ? { angle: 237 } : { left: 0.2, right: 0.7, top: 0.1, bottom: 0.8 }),
        stops: Array.from({ length: count }, (_, i) => ({
          position: i / (count - 1),
          color: { theme: i % 12, tint: -0.1 },
        })),
      }
      const result = await apply(bytes, [format({ gradient })])
      expect(cell(await readXlsx(result.bytes)).format?.fill?.spec).toEqual({ gradient })
      const styles = (await entries(result.bytes))['xl/styles.xml']!
      expect(styles).toContain('theme="0" tint="-0.1"')
      expect(styles).toContain(
        type === 'linear'
          ? 'degree="237"'
          : 'type="path" left="0.2" right="0.7" top="0.1" bottom="0.8"',
      )
      bytes = result.bytes
    }
  },
)
it('clears inherited fill explicitly, omission preserves it, batch order and same-operation fill priority agree', async () => {
  const fixture = await xlsxFillFixture()
  expect(cell(fixture.workbook).format?.fill?.source).toBe('inherited')
  const cleared = await apply(fixture.bytes, [format(null)])
  expect(cell(await readXlsx(cleared.bytes)).format?.fill).toEqual({ spec: null, source: 'direct' })
  const omitted = await apply(fixture.bytes, [
    { op: 'format_range', sheetId: 'sheet-1', range: 'A1', format: { bold: false } },
  ])
  // Native unrelated font formatting retains inherited fill references.
  const inherited = cell(await readXlsx(omitted.bytes)).format?.fill
  expect(inherited?.spec).toEqual({ pattern: 'solid', fg: { theme: 4, tint: 0.4 } })
  const laterColor = await apply(fixture.bytes, [
    format({ pattern: 'darkGrid', fg: '#112233' }),
    { op: 'format_range', sheetId: 'sheet-1', range: 'A1:B1', format: { fillColor: '#445566' } },
  ])
  expect(cell(await readXlsx(laterColor.bytes)).format?.fill?.spec).toEqual({
    pattern: 'solid',
    fg: '#445566',
  })
  const same = await apply(fixture.bytes, [
    {
      ...format(null),
      format: { fillColor: '#445566', fill: { pattern: 'lightGrid', fg: '#123456' } },
    },
  ])
  expect(cell(await readXlsx(same.bytes)).format?.fill?.spec).toEqual({
    pattern: 'lightGrid',
    fg: '#123456',
  })
})
it('preserves unrelated xf metadata while applying fill and font/alignment/number/border changes together', async () => {
  const fixture = await xlsxFillFixture(),
    result = await apply(fixture.bytes, [
      {
        ...format(null),
        format: {
          fill: { pattern: 'solid', fg: '#123456' },
          bold: false,
          horizontalAlign: 'center',
          numberFormat: '0.00',
          border: { type: 'right', color: '#654321' },
        },
      },
    ]),
    after = await entries(result.bytes),
    value = xf(after['xl/styles.xml']!, after[fixture.sheet.entry]!)
  for (const marker of [
    'quotePrefix="1"',
    'pivotButton="1"',
    'm:keep="yes"',
    'shrinkToFit="1"',
    'readingOrder="2"',
    '<protection locked="0" hidden="1"/>',
    '<m:keep value="untouched"/>',
  ])
    expect(value).toContain(marker)
  expect(value).toContain('horizontal="center"')
  expect(cell(await readXlsx(result.bytes)).format).toMatchObject({
    bold: false,
    horizontalAlign: 'center',
    numberFormat: '0.00',
    fillColor: '#123456',
  })
})
it('retains unsupported original RGB tint when a format operation omits fill', async () => {
  const fixture = await xlsxFillFixture(),
    zip = await JSZip.loadAsync(fixture.bytes),
    original = (await zip.file('xl/styles.xml')!.async('string')).replace(
      '<fgColor theme="4" tint="0.4"/>',
      '<fgColor rgb="FF204060" tint="0.4"/>',
    )
  expect(original).toContain('<fgColor rgb="FF204060" tint="0.4"/>')
  zip.file('xl/styles.xml', original)
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    result = await apply(bytes, [
      { op: 'format_range', sheetId: 'sheet-1', range: 'A1', format: { bold: true } },
    ]),
    after = await entries(result.bytes)
  expect(cell(await readXlsx(result.bytes)).format?.fill).toMatchObject({
    spec: null,
    source: 'inherited',
    unsupported: expect.any(String),
  })
  expect(after['xl/styles.xml']).toContain('<fgColor rgb="FF204060" tint="0.4"/>')
})
it('rejects malformed gradients, invalid colors and protected sheets atomically', async () => {
  const fixture = await xlsxFillFixture(),
    baseline = fixture.bytes.slice()
  for (const fill of [
    { gradient: { stops: [{ position: 0, color: '#000000' }] } },
    { gradient: { stops: Array.from({ length: 11 }, () => ({ position: 0, color: '#000000' })) } },
    {
      gradient: {
        left: 1.1,
        stops: [
          { position: 0, color: '#000000' },
          { position: 1, color: '#FFFFFF' },
        ],
      },
    },
    { pattern: 'solid', fg: { theme: 12 } },
    { pattern: 'solid', fg: { theme: 4, tint: 1.1 } },
  ]) {
    await expect(
      apply(fixture.bytes, [
        { op: 'set_cell', sheetId: 'sheet-1', address: 'A2', value: 'must not leak' },
        format(fill),
      ]),
    ).rejects.toThrow('参数无效')
    expect(fixture.bytes).toEqual(baseline)
  }
  const zip = await JSZip.loadAsync(fixture.bytes),
    xml = await zip.file(fixture.sheet.entry)!.async('string')
  zip.file(
    fixture.sheet.entry,
    xml.replace('</sheetData>', '</sheetData><sheetProtection sheet="1"/>'),
  )
  await expect(
    apply(await zip.generateAsync({ type: 'uint8array' }), [format(null)]),
  ).rejects.toThrow('保护')
})
