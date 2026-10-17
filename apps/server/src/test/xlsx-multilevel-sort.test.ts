import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { xlsxManualSortSchema } from '@mimir/shared'
import { workbookOperationSchema } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
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
const path = 'xl/worksheets/sheet1.xml'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const text = (ref: string, value: string) =>
  `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`
async function fixture(data?: string, extras = '') {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
  const rows: Array<[string | null, number | null, string]> = [
    ['B', 2, 'r2'],
    ['A', 1, 'r3'],
    ['A', 3, 'r4'],
    ['A', 3, 'r5'],
    [null, 9, 'r6'],
    ['A', null, 'r7'],
  ]
  zip.file(
    path,
    `<worksheet xmlns="${MAIN}"><dimension ref="A1:Z20"/><sheetData><row r="1">${text('A1', 'Category')}${text('B1', 'Amount')}${text('C1', 'ID')}</row>${data ?? rows.map(([a, b, id], i) => `<row r="${i + 2}" ht="${20 + i}">${a === null ? '' : text(`A${i + 2}`, a)}${b === null ? '' : `<c r="B${i + 2}"><v>${b}</v></c>`}${text(`C${i + 2}`, id)}${text(`Z${i + 2}`, 'outside')}</row>`).join('')}</sheetData>${extras}</worksheet>`,
  )
  zip.file(
    'xl/styles.xml',
    `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><name val="Calibri"/><sz val="11"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="sortStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
  )
  zip.file('customXml/preserve.bin', new Uint8Array([255, 0, 9, 17]))
  return zip.generateAsync({ type: 'uint8array' })
}
const operation = {
  op: 'sort_range_multi',
  sheetId: 'sheet-1',
  range: 'A1:C7',
  rules: [
    { column: 'A', order: 'asc' },
    { column: 'B', order: 'desc' },
  ],
  hasHeader: true,
}
const apply = (bytes: Uint8Array, op: unknown = operation) =>
  applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion: 7, ops: [op] })
async function xml(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}
async function ids(bytes: Uint8Array, col = 2) {
  return (await readXlsx(bytes)).sheets[0]!.rows.slice(1).map((r) => r.cells[col]?.text ?? '')
}
const outside = (value: string) => value.replace(/<sheetData[\s\S]*?<\/sheetData>/, '')
const z = (value: string) =>
  [...value.matchAll(/<c r="Z\d+"[^>]*>[\s\S]*?<\/c>/g)].map(([raw]) => raw)
async function untouched(before: Uint8Array, after: Uint8Array) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  for (const [name, entry] of Object.entries(a.files).filter(
    ([entryName, part]) => !part.dir && ![path, 'xl/workbook.xml'].includes(entryName),
  ))
    expect(await b.file(name)!.async('uint8array')).toEqual(await entry.async('uint8array'))
  expect(outside(await xml(after))).toBe(outside(await xml(before)))
  expect(z(await xml(after))).toEqual(z(await xml(before)))
}
it('orders levels by priority, keeps ties stable and blanks last in both directions, preserving native non-target entries', async () => {
  const bytes = await fixture(),
    result = await apply(bytes)
  expect(await ids(result.bytes)).toEqual(['r4', 'r5', 'r3', 'r7', 'r2', 'r6'])
  expect(result.version).toBe(8)
  expect(await xml(result.bytes)).toContain('<row r="2" ht="20">')
  expect(await xml(result.bytes)).toContain(text('A1', 'Category'))
  await untouched(bytes, result.bytes)
  const reversed = await apply(bytes, {
    ...operation,
    rules: [
      { column: 'A', order: 'desc' },
      { column: 'B', order: 'asc' },
    ],
  })
  expect(await ids(reversed.bytes)).toEqual(['r2', 'r3', 'r4', 'r5', 'r7', 'r6'])
  const noop = await apply(result.bytes)
  expect(noop).toEqual({ bytes: result.bytes, version: 7, changedCells: [], touchedEntries: [] })
})
it('sorts every row without a header and accepts eight ordered unique selected columns', async () => {
  const bytes = await fixture(
    '<row r="2"><c r="A2"><v>2</v></c></row><row r="3"><c r="A3"><v>1</v></c></row>',
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A2:H3',
    hasHeader: false,
    rules: 'ABCDEFGH'.split('').map((column) => ({ column, order: 'asc' })),
  })
  expect(await xml(result.bytes)).toContain('<c r="A2"><v>1</v></c>')
  expect(await xml(result.bytes)).toContain('<c r="A3"><v>2</v></c>')
})
it('uses raw numeric/date/boolean/text/error and formula caches, translates ordinary formulas and materializes source inherited styles', async () => {
  const cells = [
    '<c r="A2"><f>1+1</f><v>2</v></c>',
    '<c r="A3" t="b"><f>TRUE()</f><v>1</v></c>',
    '<c r="A4" t="str"><f>"2"</f><v>2</v></c>',
    '<c r="A5" t="e"><f>1/0</f><v>#DIV/0!</v></c>',
    '<c r="A6"><v>1</v></c>',
    '<c r="A7" t="str"><f>""</f><v></v></c>',
  ]
  const bytes = await fixture(
    cells
      .map(
        (cell, i) =>
          `<row r="${i + 2}"${i === 0 ? ' s="1" customFormat="1"' : ''}>${cell}<c r="B${i + 2}"><f>A${i + 2}+$A$1</f><v>8</v></c>${text(`C${i + 2}`, `r${i + 2}`)}</row>`,
      )
      .join(''),
  )
  const result = await apply(bytes, { ...operation, rules: [{ column: 'A', order: 'asc' }] })
  expect(await ids(result.bytes)).toEqual(['r6', 'r2', 'r7', 'r5', 'r4', 'r3'])
  const native = await xml(result.bytes)
  expect(native).toContain('<c r="A3" s="1"><f>1+1</f><v>2</v></c>')
  expect(native).toContain('<c r="B2" s="0"><f>A2+$A$1</f><v>8</v></c>')
  expect(native).toContain('<c r="A4" t="str"><f>""</f><v></v></c>')
  await untouched(bytes, result.bytes)
})
for (const [label, change] of [
  ['empty rules', { rules: [] }],
  ['too many levels', { rules: 'ABCDEFGHI'.split('').map((column) => ({ column, order: 'asc' })) }],
  [
    'duplicate columns',
    {
      rules: [
        { column: 'A', order: 'asc' },
        { column: 'A', order: 'desc' },
      ],
    },
  ],
  ['unknown rule field', { rules: [{ column: 'A', order: 'asc', ignored: true }] }],
  ['unknown field', { ignored: true }],
  ['direction', { rules: [{ column: 'A', order: 'ascending' }] }],
  ['out of range', { rules: [{ column: 'D', order: 'asc' }] }],
  ['out of grid', { range: 'XFD1:XFE3', rules: [{ column: 'XFD', order: 'asc' }] }],
  ['over budget', { range: 'A1:C1000' }],
  ['one row', { range: 'A1:C2' }],
] as const)
  it(`rejects ${label} atomically`, async () => {
    const bytes = await fixture(),
      copy = bytes.slice()
    await expect(apply(bytes, { ...operation, ...change })).rejects.toThrow(/./)
    expect(bytes).toEqual(copy)
  })
for (const extras of [
  `<s:sheetProtection xmlns:s="${MAIN}" sheet="1"/>`,
  '<mergeCells count="1"><mergeCell ref="B3:C4"/></mergeCells>',
  '<dataValidations count="1"><dataValidation type="whole" sqref="B2:B7"><formula1>0</formula1></dataValidation></dataValidations>',
])
  it('retains namespace-aware protection and intersecting native feature rejection', async () => {
    const bytes = await fixture(undefined, extras)
    await expect(apply(bytes)).rejects.toThrow(/保护|相交/)
    expect(await xml(bytes)).toContain(extras)
  })
it('preserves disjoint native features and refuses missing secondary-key caches and shared or spill formulas', async () => {
  const feature =
    '<conditionalFormatting sqref="J1:K2"><cfRule type="expression" priority="1"><formula>J1&gt;0</formula></cfRule></conditionalFormatting>'
  const bytes = await fixture(undefined, feature),
    result = await apply(bytes)
  await untouched(bytes, result.bytes)
  for (const cell of [
    '<c r="B2"><f>1+1</f></c>',
    '<c r="B2"><f t="shared" si="0">1</f><v>2</v></c>',
    '<c r="B2" cm="1"><f>1</f><v>2</v></c>',
  ]) {
    const bad = await fixture(
      `<row r="2">${text('A2', 'B')}${cell}</row><row r="3">${text('A3', 'A')}</row>`,
    )
    await expect(apply(bad, { ...operation, range: 'A1:C3' })).rejects.toThrow(/缓存|公式/)
  }
})
it('does not extend the pinned public Agent sort vocabulary', () => {
  expect(xlsxManualSortSchema.safeParse(operation).success).toBe(true)
  expect(workbookOperationSchema.safeParse(operation).success).toBe(false)
  const publicResult = workbookOperationSchema.parse({
    ...operation,
    op: 'sort_range',
    byColumn: 'A',
    order: 'asc',
  })
  expect(publicResult).not.toHaveProperty('rules')
})

it('independent lexicographic oracle: eight mixed typed levels, stable ties and natural text ordering in both directions', async () => {
  const pool = [null, 0, 2, 10, false, true, 'a2', 'A2', 'a10', '#N/A'] as const
  const data = Array.from({ length: 48 }, (_row, id) => ({
    id: `row-${id}`,
    // Repeated key vectors make source stability observable independently of sort direction.
    keys: Array.from(
      { length: 8 },
      (_cell, level) => pool[((id % 24) * (level + 3) + Math.floor((id % 24) / 5)) % pool.length]!,
    ),
  }))
  const bytes = await fixture(
    data
      .map(({ id, keys }, index) => {
        const row = index + 2
        return `<row r="${row}">${keys
          .map((value, level) => {
            const ref = `${String.fromCharCode(65 + level)}${row}`
            return value === null
              ? ''
              : typeof value === 'string'
                ? text(ref, value)
                : `<c r="${ref}"${typeof value === 'boolean' ? ' t="b"' : ''}><v>${typeof value === 'boolean' ? Number(value) : value}</v></c>`
          })
          .join('')}${text(`I${row}`, id)}</row>`
      })
      .join(''),
  )
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  const rank = (value: Exclude<(typeof pool)[number], null>) =>
    typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2
  for (const descending of [false, true]) {
    const rules = 'HGBCFADE'.split('').map((column, index) => ({
      column,
      order: (index % 2 === Number(descending) ? 'desc' : 'asc') as 'asc' | 'desc',
    }))
    const expected = data.toSorted((left, right) => {
      for (const rule of rules) {
        const key = rule.column.charCodeAt(0) - 65
        const a = left.keys[key]!,
          b = right.keys[key]!
        if (a === null || b === null) {
          if (a !== b) return a === null ? 1 : -1
          continue
        }
        const comparison =
          rank(a) - rank(b) ||
          (typeof a === 'number' && typeof b === 'number'
            ? a - b
            : typeof a === 'boolean' && typeof b === 'boolean'
              ? Number(a) - Number(b)
              : collator.compare(String(a), String(b)))
        if (comparison) return rule.order === 'asc' ? comparison : -comparison
      }
      return 0
    })
    const result = await apply(bytes, { ...operation, range: 'A1:I49', rules })
    expect(await ids(result.bytes, 8)).toEqual(expected.map(({ id }) => id))
    await untouched(bytes, result.bytes)
  }
})

it('independent oracle: keeps native formula string and boolean cache types with single-quoted attributes', async () => {
  const bytes = await fixture(
    `<row r="2"><c r="A2" t='str'><f>"1"</f><v>1</v></c>${text('C2', 'text')}</row>` +
      `<row r="3"><c r="A3"><f>1+1</f><v>2</v></c>${text('C3', 'number')}</row>` +
      `<row r="4"><c r="A4" t='b'><f>FALSE()</f><v>0</v></c>${text('C4', 'boolean')}</row>`,
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A1:C4',
    rules: [{ column: 'A', order: 'asc' }],
  })
  expect(await ids(result.bytes)).toEqual(['number', 'text', 'boolean'])
})

it('independent oracle: decodes legal numeric character references in a formula cache before comparing', async () => {
  const bytes = await fixture(
    `<row r="2"><c r="A2"><f>1+1</f><v>2</v></c>${text('C2', 'two')}</row>` +
      `<row r="3"><c r="A3"><f>1</f><v>&#49;</v></c>${text('C3', 'one')}</row>`,
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A1:C3',
    rules: [{ column: 'A', order: 'asc' }],
  })
  expect(await ids(result.bytes)).toEqual(['one', 'two'])
})

it('independent oracle: does not normalize an unchanged middle row formula during a real permutation', async () => {
  const middle = '<c r="B3"><f>&#65;3+$A$1</f><v>8</v></c>'
  const bytes = await fixture(
    `<row r="2"><c r="A2"><v>3</v></c>${text('C2', 'three')}</row>` +
      `<row r="3"><c r="A3"><v>2</v></c>${middle}${text('C3', 'two')}</row>` +
      `<row r="4"><c r="A4"><v>1</v></c>${text('C4', 'one')}</row>`,
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A1:C4',
    rules: [{ column: 'A', order: 'asc' }],
  })
  expect(await ids(result.bytes)).toEqual(['one', 'two', 'three'])
  expect(await xml(result.bytes)).toContain(middle)
})

it('returns exact identity for a self-closing empty sheetData and never accepts a generic DV confirmation or combined manual batch', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.file(path, `<worksheet xmlns="${MAIN}"><sheetData/></worksheet>`)
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  expect(await apply(bytes)).toEqual({ bytes, version: 7, changedCells: [], touchedEntries: [] })
  await expect(
    applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes,
      expectedVersion: 7,
      ops: [operation],
      validationConsent: { intent: 'manual_cell' },
    }),
  ).rejects.toThrow('仅适用于当前格手动输入')
  await expect(
    applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes,
      expectedVersion: 7,
      ops: [operation, operation],
    }),
  ).rejects.toThrow('单独提交')
  await expect(
    applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes,
      expectedVersion: 7,
      ops: [operation],
      image: { bytes: new Uint8Array(), mimeType: 'image/png' },
    }),
  ).rejects.toThrow('单独提交')
})

it('reads only actual root cache type attributes with XML whitespace, entities and quoted decoy text', async () => {
  const bytes = await fixture(
    `<row r="2"><c r="A2" xmlns:m="urn:mimir" m:note=" t='b' > fake " t = '&#115;tr'><f>"1"</f><v>&#49;</v></c>${text('C2', 'text')}</row>` +
      `<row r="3"><c r="A3" t = 'n'><f>2</f><v>2</v></c>${text('C3', 'number')}</row>` +
      `<row r="4"><c r="A4" t = 'b'><f>FALSE()</f><v>&#48;</v></c>${text('C4', 'boolean')}</row>`,
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A1:C4',
    rules: [{ column: 'A', order: 'asc' }],
  })
  expect(await ids(result.bytes)).toEqual(['number', 'text', 'boolean'])
  const native = await xml(result.bytes)
  expect(native).toContain(`m:note=" t='b' > fake " t = '&#115;tr'`)
  expect(native).toContain('<v>&#49;</v>')
  expect(native).toContain('<v>&#48;</v>')
})

it('decodes hexadecimal numeric cache references and rejects an explicitly empty or unknown type atomically', async () => {
  const bytes = await fixture(
    `<row r="2"><c r="A2"><f>2</f><v>2</v></c>${text('C2', 'two')}</row>` +
      `<row r="3"><c r="A3"><f>1.5</f><v>&#x31;&#46;&#53;</v></c>${text('C3', 'one-point-five')}</row>`,
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A1:C3',
    rules: [{ column: 'A', order: 'asc' }],
  })
  expect(await ids(result.bytes)).toEqual(['one-point-five', 'two'])
  expect(await xml(result.bytes)).toContain('<v>&#x31;&#46;&#53;</v>')
  for (const type of ['', 'unknown', '&amp;#115;tr', '&#x26;#115;tr']) {
    const bad = await fixture(
      `<row r="2"><c r="A2" t='${type}'><f>1</f><v>1</v></c></row><row r="3"><c r="A3"><v>2</v></c></row>`,
    )
    const prior = bad.slice()
    await expect(
      apply(bad, { ...operation, range: 'A1:C3', rules: [{ column: 'A', order: 'asc' }] }),
    ).rejects.toThrow('缓存类型暂不支持')
    expect(bad).toEqual(prior)
  }
})

it('keeps a stationary row byte exact including quote styles, numeric entities, empty cells and holes', async () => {
  const middle =
    `<row r='3' ht = '30' customFormat='0'><c r="A3"><v>2</v></c>` +
    `<c r="B3"><f>&#x41;3+$A$1</f><v>8</v></c><c r="C3" t='inlineStr'><is><t>two</t></is></c><c r="D3"/></row>`
  const bytes = await fixture(
    `<row r="2"><c r="A2"><v>3</v></c>${text('C2', 'three')}</row>` +
      middle +
      `<row r="4"><c r="A4"><v>1</v></c>${text('C4', 'one')}</row>`,
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A1:F4',
    rules: [{ column: 'A', order: 'asc' }],
  })
  expect(await ids(result.bytes)).toEqual(['one', 'two', 'three'])
  expect(await xml(result.bytes)).toContain(middle)
  expect(result.changedCells).not.toContain('sheet-1:E3')
  await untouched(bytes, result.bytes)
})

it('preserves an escaped character-reference literal inside an actually moved ordinary formula', async () => {
  const bytes = await fixture(
    `<row r="2"><c r="A2"><v>2</v></c><c r="B2" t="str"><f>A2&amp;"&#x26;#49;"</f><v>2&amp;#49;</v></c>${text('C2', 'two')}</row>` +
      `<row r="3"><c r="A3"><v>1</v></c>${text('C3', 'one')}</row>`,
  )
  const result = await apply(bytes, {
    ...operation,
    range: 'A1:C3',
    rules: [{ column: 'A', order: 'asc' }],
  })
  expect(await ids(result.bytes)).toEqual(['one', 'two'])
  expect(await xml(result.bytes)).toContain('<f>A3&amp;"&amp;#49;"</f>')
})
