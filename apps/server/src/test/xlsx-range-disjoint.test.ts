import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { createXlsxAgentHandle } from '../../../../packages/office/src/agent/xlsx-agent.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { applyXlsxDataOperation } from '../services/xlsx-agent-data.js'
import { applyXlsxRangeOperation } from '../services/xlsx-agent-range.js'
import { applyXlsxManualOperation } from '../services/xlsx-manual-ops.js'
import { readBasicWorkbook } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
const path = 'xl/worksheets/sheet1.xml'
const features = ['merge', 'link', 'cf', 'dv', 'filter', 'comment', 'table'] as const
type Feature = (typeof features)[number]
async function fixture(feature: Feature, ref = 'J1:K2', side = 1) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
  const start = ref.split(':')[0]!
  const rels: string[] = []
  let native = ''
  if (feature === 'merge') native = `<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`
  if (feature === 'link') {
    native = `<hyperlinks><hyperlink ref="${ref}" r:id="link"/></hyperlinks>`
    rels.push(
      `<Relationship Id="link" Type="${REL}hyperlink" Target="https://example.com/" TargetMode="External"/>`,
    )
  }
  if (feature === 'cf')
    native = `<conditionalFormatting sqref="${ref}"><cfRule type="expression" priority="1"><formula>J1&gt;0</formula></cfRule></conditionalFormatting>`
  if (feature === 'dv')
    native = `<dataValidations count="1"><dataValidation type="whole" operator="greaterThan" sqref="${ref}"><formula1>0</formula1></dataValidation></dataValidations>`
  if (feature === 'filter') native = `<autoFilter ref="${ref}"/>`
  if (feature === 'table') {
    native = '<tableParts count="1"><tablePart r:id="table"/></tableParts>'
    rels.push(`<Relationship Id="table" Type="${REL}table" Target="../tables/table1.xml"/>`)
    zip.file(
      'xl/tables/table1.xml',
      `<table xmlns="${MAIN}" id="1" name="NativeTable" displayName="NativeTable" ref="${ref}"><autoFilter ref="${ref}"/><tableColumns count="2"><tableColumn id="1" name="First"/><tableColumn id="2" name="Second"/></tableColumns></table>`,
    )
  }
  if (feature === 'comment') {
    native = '<legacyDrawing r:id="vml"/>'
    rels.push(
      `<Relationship Id="comments" Type="${REL}comments" Target="../comments1.xml"/>`,
      `<Relationship Id="vml" Type="${REL}vmlDrawing" Target="../drawings/comments.vml"/>`,
    )
    zip.file(
      'xl/comments1.xml',
      `<comments xmlns="${MAIN}"><authors><author>admin</author></authors><commentList><comment ref="${start}" authorId="0"><text><t>Keep native note</t></text></comment></commentList></comments>`,
    )
    const letters = start.match(/^[A-Z]+/)![0]
    const column = [...letters].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1
    const row = Number(start.match(/[0-9]+$/)![0]) - 1
    zip.file(
      'xl/drawings/comments.vml',
      `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:x="urn:schemas-microsoft-com:office:excel"><v:shape id="note" type="#_x0000_t202"><x:ClientData ObjectType="Note"><x:Row>${row}</x:Row><x:Column>${column}</x:Column></x:ClientData></v:shape></xml>`,
    )
  }
  for (const n of [1, 2])
    zip.file(
      `xl/worksheets/sheet${n}.xml`,
      `<worksheet xmlns="${MAIN}" xmlns:r="${REL.slice(0, -1)}"><dimension ref="A1:K10"/><sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1" t="inlineStr"><is><t>two</t></is></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>one</t></is></c></row></sheetData>${n === side ? native : ''}</worksheet>`,
    )
  zip.file(
    `xl/worksheets/_rels/sheet${side}.xml.rels`,
    `<Relationships xmlns="${PKG}">${rels.join('')}</Relationships>`,
  )
  zip.file(
    'xl/workbook.xml',
    (await zip.file('xl/workbook.xml')!.async('string')).replace(
      '</sheets>',
      '<sheet name="目标" sheetId="2" r:id="rId99"/></sheets>',
    ),
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
      '</Relationships>',
      `<Relationship Id="rId99" Type="${REL}worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    ),
  )
  zip.file('customXml/opaque.bin', new Uint8Array([0, 255, 17, 9]))
  return zip.generateAsync({ type: 'uint8array' })
}
const apply = (bytes: Uint8Array, operation: string, cross = false) =>
  applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: 7,
    ops: [
      operation === 'sort'
        ? { op: 'sort_range', sheetId: 'sheet-1', range: 'A1:B2', byColumn: 'A', order: 'asc' }
        : {
            op: operation === 'copy' ? 'copy_range' : 'move_range',
            sheetId: cross ? 'sheet-2' : 'sheet-1',
            sourceSheetId: 'sheet-1',
            source: 'A1:B2',
            target: 'D1',
          },
    ],
  })
const stripCalc = (value: string) =>
  value.replace(/<calcPr\b[^>]*\/>|<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/g, '')
const withoutCells = (value: string) =>
  value.replace(/<sheetData[\s\S]*?<\/sheetData>/, '').replace(/<dimension[^>]*\/>/, '')
async function exactOtherEntries(before: Uint8Array, after: Uint8Array, touched: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  expect(Object.keys(b.files).toSorted()).toEqual(Object.keys(a.files).toSorted())
  const untouched = Object.keys(a.files).filter(
    (name) => !a.files[name]!.dir && !touched.includes(name),
  )
  const contents = async (zip: JSZip) =>
    Promise.all(
      untouched.map(async (name) => [
        name,
        name === 'xl/workbook.xml'
          ? stripCalc(await zip.file(name)!.async('string'))
          : await zip.file(name)!.async('uint8array'),
      ]),
    )
  expect(await contents(b)).toEqual(await contents(a))
  const featureXml = async (zip: JSZip) =>
    Promise.all(
      touched.map(async (name) => [name, withoutCells(await zip.file(name)!.async('string'))]),
    )
  expect(await featureXml(b)).toEqual(await featureXml(a))
}
const expectMigrated = async (result: ReturnType<typeof apply>) => {
  expect((await result).version).toBe(8)
}
const expectRefused = async (result: ReturnType<typeof apply>) => {
  await expect(result).rejects.toThrow(/相交|范围|结构|引用|关系|XML|批注|表格|Invalid/)
}
for (const feature of features)
  for (const operation of ['copy', 'move', 'sort'])
    it(`${operation} allows disjoint native ${feature}, preserving every unrelated byte`, async () => {
      const bytes = await fixture(feature),
        before = bytes.slice(),
        result = await apply(bytes, operation)
      expect(result.version).toBe(8)
      expect(bytes).toEqual(before)
      await exactOtherEntries(bytes, result.bytes, [path])
      expect(await (await JSZip.loadAsync(result.bytes)).file(path)!.async('string')).toContain(
        operation === 'sort' ? '<c r="A1"><v>1</v></c>' : 'r="D1"',
      )
    })
for (const feature of features)
  for (const operation of ['copy', 'move'])
    for (const side of [1, 2])
      it(`${operation} checks native ${feature} on cross-sheet side ${side}`, async () => {
        const bytes = await fixture(feature, 'J1:K2', side),
          result = await apply(bytes, operation, true)
        await exactOtherEntries(
          bytes,
          result.bytes,
          operation === 'move' ? [path, 'xl/worksheets/sheet2.xml'] : ['xl/worksheets/sheet2.xml'],
        )
        const intersect = await fixture(feature, side === 1 ? 'A1:B2' : 'D1:E2', side),
          original = intersect.slice()
        const verify = ['merge', 'link', 'cf', 'dv'].includes(feature)
          ? expectMigrated
          : expectRefused
        await verify(apply(intersect, operation, true))
        expect(intersect).toEqual(original)
      })
for (const feature of features)
  it(`sort rejects intersecting native ${feature}`, async () => {
    const bytes = await fixture(feature, 'A1:B2')
    await expect(apply(bytes, 'sort')).rejects.toThrow(
      /相交|范围|结构|引用|关系|XML|批注|表格|Invalid/,
    )
  })
async function mutate(bytes: Uint8Array, part: string, edit: (xml: string) => string) {
  const zip = await JSZip.loadAsync(bytes)
  zip.file(part, edit(await zip.file(part)!.async('string')))
  return zip.generateAsync({ type: 'uint8array' })
}
for (const operation of ['copy', 'move', 'sort'])
  for (const ref of ['', 'J0', 'XFE1', 'J1048577', 'J1 K2', 'A1:Z9:K2'])
    it(`${operation} rejects invalid native ref ${JSON.stringify(ref)} atomically`, async () => {
      const bytes = await fixture('merge', ref),
        original = bytes.slice()
      await expect(apply(bytes, operation)).rejects.toThrow(
        /相交|范围|结构|引用|关系|XML|批注|表格|Invalid/,
      )
      expect(bytes).toEqual(original)
    })
for (const operation of ['copy', 'move', 'sort'])
  it(`${operation} rejects malformed and external table relationships`, async () => {
    for (const transform of [
      (xml: string) =>
        xml.replace('Target="../tables/table1.xml"', 'Target="../tables/missing.xml"'),
      (xml: string) =>
        xml.replace(
          'Target="../tables/table1.xml"',
          'Target="https://example.com/table.xml" TargetMode="External"',
        ),
      (xml: string) =>
        xml.replace(
          '</Relationships>',
          `<Relationship Id="table" Type="${REL}table" Target="../tables/table1.xml"/></Relationships>`,
        ),
      (xml: string) =>
        xml.replace('Target="../tables/table1.xml"', 'Target="../../../outside.xml"'),
    ]) {
      const bytes = await mutate(
        await fixture('table'),
        'xl/worksheets/_rels/sheet1.xml.rels',
        transform,
      )
      await expect(apply(bytes, operation)).rejects.toThrow(
        /相交|范围|结构|引用|关系|XML|批注|表格|Invalid/,
      )
    }
  })
for (const operation of ['copy', 'move', 'sort'])
  it(`${operation} rejects unknown extension, namespace and misplaced native structures`, async () => {
    for (const addition of [
      '<extLst><ext uri="unknown"><custom ref="A1"/></ext></extLst>',
      '<x:conditionalFormatting xmlns:x="urn:unknown" sqref="J1"/>',
      '<mergeCell ref="A1"/>',
      '<mergeCells><mergeCell ref="J1"/><mergeCell ref="J1"/></mergeCells>',
      '<mergeCells count="3"><mergeCell ref="J1"/></mergeCells>',
    ]) {
      const bytes = await mutate(await fixture('filter'), path, (xml) =>
        xml.replace('</worksheet>', addition + '</worksheet>'),
      )
      await expect(apply(bytes, operation)).rejects.toThrow(
        /相交|范围|结构|引用|关系|XML|批注|表格|Invalid/,
      )
    }
  })
it('accepts namespace-resolved standard CF and single-quoted sqref while keeping its exact XML', async () => {
  const bytes = await mutate(await fixture('cf'), path, (xml) =>
    xml
      .replace(
        '<conditionalFormatting sqref="J1:K2">',
        "<s:conditionalFormatting xmlns:s='" + MAIN + "' sqref='J1:K2'>",
      )
      .replace('</conditionalFormatting>', '</s:conditionalFormatting>'),
  )
  for (const op of ['copy', 'move', 'sort']) {
    const result = await apply(bytes, op)
    expect(result.version).toBe(8)
    await exactOtherEntries(bytes, result.bytes, [path])
  }
})
it('sqref checks every rectangle including a later intersecting entry', async () => {
  const bytes = await mutate(await fixture('dv'), path, (xml) =>
    xml.replace('sqref="J1:K2"', 'sqref="J1:K2 A1:A2"'),
  )
  for (const op of ['copy', 'move']) {
    const result = await apply(bytes, op)
    const native = await (await JSZip.loadAsync(result.bytes)).file(path)!.async('string')
    expect(native).toContain('sqref="D1:D2"')
    expect(native.includes('sqref="J1:K2 A1:A2"')).toBe(op === 'copy')
  }
  await expect(apply(bytes, 'sort')).rejects.toThrow(/相交|范围|结构/)
})
it('rejects malformed comments and VML instead of treating missing parsed notes as empty', async () => {
  const base = await fixture('comment')
  for (const [part, from, to] of [
    ['xl/comments1.xml', 'ref="J1"', 'ref="bad"'],
    ['xl/drawings/comments.vml', '<x:Column>9</x:Column>', '<x:Column>0</x:Column>'],
    ['xl/drawings/comments.vml', 'ObjectType="Note"', 'ObjectType="Button"'],
    ['xl/drawings/comments.vml', '<x:Row>0</x:Row>', ''],
  ]) {
    const bytes = await mutate(base, part!, (xml) => xml.replace(from!, to!))
    for (const op of ['copy', 'move', 'sort'])
      await expect(apply(bytes, op)).rejects.toThrow(
        /相交|范围|结构|引用|关系|XML|批注|表格|Invalid/,
      )
  }
})
for (const feature of ['cf', 'dv'] as const)
  it(`move migrates actual range-external ${feature} formula dependencies`, async () => {
    const base = await fixture(feature)
    const dependent = await mutate(base, path, (xml) =>
      feature === 'cf'
        ? xml.replace('J1&gt;0', 'A1&gt;0')
        : xml.replace('<formula1>0</formula1>', '<formula1>A1</formula1>'),
    )
    const moved = await apply(dependent, 'move')
    expect(await (await JSZip.loadAsync(moved.bytes)).file(path)!.async('string')).toContain(
      feature === 'cf' ? '<formula>D1&gt;0</formula>' : '<formula1>D1</formula1>',
    )
    const quoted = await mutate(base, path, (xml) =>
      feature === 'cf'
        ? xml.replace('J1&gt;0', '&quot;A1&quot;=&quot;A1&quot;')
        : xml.replace('<formula1>0</formula1>', '<formula1>LEN(&quot;A1&quot;)</formula1>'),
    )
    await exactOtherEntries(quoted, (await apply(quoted, 'move')).bytes, [path])
    const otherSheet = await mutate(
      await fixture(feature, 'J1:K2', 2),
      'xl/worksheets/sheet2.xml',
      (xml) =>
        feature === 'cf'
          ? xml.replace('J1&gt;0', "'数据'!$A$1&gt;0")
          : xml.replace('<formula1>0</formula1>', "<formula1>'数据'!$A$1</formula1>"),
    )
    const external = await apply(otherSheet, 'move')
    expect(
      await (
        await JSZip.loadAsync(external.bytes)
      )
        .file('xl/worksheets/sheet2.xml')!
        .async('string'),
    ).toContain("'数据'!$D$1")
  })
it('sort header-only native comment is disjoint from actual data rows', async () => {
  let bytes = await fixture('comment', 'A1')
  bytes = await mutate(bytes, path, (xml) =>
    xml.replace('</sheetData>', '<row r="3"><c r="A3"><v>0</v></c></row></sheetData>'),
  )
  const result = await applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: 7,
    ops: [
      {
        op: 'sort_range',
        sheetId: 'sheet-1',
        range: 'A1:B3',
        hasHeader: true,
        byColumn: 'A',
        order: 'asc',
      },
    ],
  })
  expect(result.version).toBe(8)
  await exactOtherEntries(bytes, result.bytes, [path])
})
it('rejects XML recursion budget before tree conversion', async () => {
  const bytes = await mutate(await fixture('cf'), path, (xml) =>
    xml.replace('</worksheet>', '<unknown>'.repeat(70) + '</unknown>'.repeat(70) + '</worksheet>'),
  )
  await expect(apply(bytes, 'sort')).rejects.toThrow('XML 节点或深度超过预算')
})
it('repeated identical sort preserves original bytes, version and empty mutation inventory', async () => {
  const original = await fixture('comment'),
    first = await apply(original, 'sort')
  const second = await applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes: first.bytes,
    expectedVersion: first.version,
    ops: [{ op: 'sort_range', sheetId: 'sheet-1', range: 'A1:B2', byColumn: 'A', order: 'asc' }],
  })
  expect(second).toEqual({
    bytes: first.bytes,
    version: first.version,
    changedCells: [],
    touchedEntries: [],
  })
})

it('real current-canvas host sort has one publish/history entry and a repeated sort has none', async () => {
  const bytes = await fixture('table'),
    changed = vi.fn<() => void>()
  const handle = createXlsxAgentHandle(
    'xlsx-1',
    bytes,
    await openXlsxForEdit(bytes),
    () => null,
    changed,
    applyXlsxOpsOnHost,
  )
  const args = {
    operations: [
      { op: 'sort_range', sheetId: 'sheet-1', range: 'A1:B2', byColumn: 'A', order: 'asc' },
    ],
  }
  expect(await handle.execute('propose_operations', args, {})).toMatchObject({
    changed: true,
    version: 1,
  })
  const saved = handle.currentBytes()
  handle.markSaved()
  changed.mockClear()
  expect(await handle.execute('propose_operations', args, { roundId: 'no-op' })).toMatchObject({
    changed: false,
    version: 1,
  })
  expect(handle.history()).toEqual({ undo: 1, redo: 0 })
  expect(handle.isDirty()).toBe(false)
  expect(changed).not.toHaveBeenCalled()
  expect(handle.currentBytes()).toEqual(saved)
  expect(await handle.undoRound('no-op')).toBe(false)
  expect(await handle.undo()).toBe(true)
  expect(handle.currentBytes()).toEqual(bytes)
  expect(await handle.redo()).toBe(true)
  expect(handle.currentBytes()).toEqual(saved)
  expect(handle.isDirty()).toBe(false)
  handle.dispose()
})
it('keeps the existing 20000 stored-cell budget with inline strings outside the small operation', async () => {
  const rows = Array.from(
    { length: 1000 },
    (_rowValue, row) =>
      `<row r="${row + 1}">${Array.from({ length: 20 }, (_columnValue, column) => `<c r="${String.fromCharCode(65 + column)}${row + 1}" t="inlineStr"><is><t>keep</t></is></c>`).join('')}</row>`,
  ).join('')
  const bytes = await mutate(await fixture('merge', 'ZZ1:AAA2'), path, (xml) =>
    xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${rows}</sheetData>`),
  )
  const result = await apply(bytes, 'sort')
  expect(result.bytes).toEqual(bytes)
  expect(result.version).toBe(7)
})

for (const feature of ['cf', 'dv'] as const)
  it(`move partitions ${feature} dependencies reached through a relative sqref offset`, async () => {
    const bytes = await mutate(await fixture(feature), path, (xml) =>
      feature === 'cf'
        ? xml.replace('J1&gt;0', 'A1&gt;0')
        : xml.replace('<formula1>0</formula1>', '<formula1>A1</formula1>'),
    )
    const result = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes,
      expectedVersion: 7,
      ops: [
        {
          op: 'move_range',
          sheetId: 'sheet-1',
          sourceSheetId: 'sheet-1',
          source: 'B2',
          target: 'D2',
        },
      ],
    })
    const native = await (await JSZip.loadAsync(result.bytes)).file(path)!.async('string')
    expect(native).toContain('sqref="K2"')
    expect(native).toContain(
      feature === 'cf' ? '<formula>D2&gt;0</formula>' : '<formula1>D2</formula1>',
    )
  })

it.each([
  '<custom:rangeFeature xmlns:custom="urn:unknown" ref="A1"/>',
  '<rangeFeature ref="A1"/>',
  '<custom:sheetData xmlns:custom="urn:unknown" ref="A1"/>',
])('rejects unknown top-level native extension %s without an extLst wrapper', async (extra) => {
  const bytes = await mutate(await fixture('filter'), path, (xml) =>
    xml.replace('</worksheet>', extra + '</worksheet>'),
  )
  await expect(apply(bytes, 'sort')).rejects.toThrow(/结构|扩展|命名空间/)
})

it('counts real XML nesting independently of closing tags inside comments', async () => {
  const bytes = await mutate(await fixture('cf'), path, (xml) =>
    xml.replace(
      '</worksheet>',
      '<!-- ' +
        '</decoy>'.repeat(80) +
        ' -->' +
        '<unknown>'.repeat(70) +
        '</unknown>'.repeat(70) +
        '</worksheet>',
    ),
  )
  await expect(apply(bytes, 'sort')).rejects.toThrow('XML 节点或深度超过预算')
})

for (const operation of ['copy', 'move', 'sort'])
  it(`${operation} respects native sheet protection expressed with a namespace prefix`, async () => {
    const bytes = await mutate(await fixture('filter'), path, (xml) =>
      xml.replace(
        '</worksheet>',
        '<s:sheetProtection xmlns:s="' + MAIN + '" sheet="1"/></worksheet>',
      ),
    )
    await expect(apply(bytes, operation)).rejects.toThrow(/保护/)
  })

const protect = (xml: string) =>
  xml.replace(
    '</worksheet>',
    `<s:sheetProtection xmlns:s="${MAIN}" sheet="1" password="ABCD"/></worksheet>`,
  )
it('copy can read a prefixed password-protected source, but move cannot write that source', async () => {
  const bytes = await mutate(await fixture('filter'), path, protect)
  const result = await apply(bytes, 'copy', true)
  await exactOtherEntries(bytes, result.bytes, ['xl/worksheets/sheet2.xml'])
  expect(result.version).toBe(8)
  await expect(apply(bytes, 'move', true)).rejects.toThrow('保护')
})
it.each(['copy', 'move'])(
  '%s cannot write a cross-sheet prefixed protected target',
  async (operation) => {
    const bytes = await mutate(await fixture('filter'), 'xl/worksheets/sheet2.xml', protect)
    await expect(apply(bytes, operation, true)).rejects.toThrow('保护')
  },
)
it('move cannot rewrite a dependent formula in a prefixed protected third-party sheet', async () => {
  const bytes = await mutate(await fixture('filter'), 'xl/worksheets/sheet2.xml', (xml) =>
    protect(
      xml.replace(
        '</sheetData>',
        `<row r="3"><c r="E3"><f>数据!A1</f><v>2</v></c></row></sheetData>`,
      ),
    ),
  )
  await expect(apply(bytes, 'move')).rejects.toThrow('保护')
})
it('direct native range/data/manual calls repeat namespace-aware protection checks', async () => {
  const bytes = await mutate(await fixture('filter'), path, protect),
    before = await readBasicWorkbook(Buffer.from(bytes))
  await expect(
    applyXlsxDataOperation(
      bytes,
      before,
      { op: 'sort_range', sheetId: 'sheet-1', range: 'A1:B2', byColumn: 'A', order: 'asc' },
      7,
    ),
  ).rejects.toThrow('保护')
  await expect(
    applyXlsxRangeOperation(
      bytes,
      before,
      { op: 'copy_range', sheetId: 'sheet-1', source: 'A1:B2', target: 'D1' },
      7,
    ),
  ).rejects.toThrow('保护')
  await expect(
    applyXlsxManualOperation(
      bytes,
      {
        op: 'move_range',
        sheetId: 'sheet-1',
        sourceSheetId: 'sheet-1',
        source: 'A1:B2',
        target: 'D1',
      },
      7,
    ),
  ).rejects.toThrow('保护')
})

it('move migrates an absolute native data-bar threshold without splitting its statistical domain', async () => {
  const bytes = await mutate(await fixture('cf'), path, (xml) =>
    xml.replace(
      '<cfRule type="expression" priority="1"><formula>J1&gt;0</formula></cfRule>',
      '<cfRule type="dataBar" priority="1"><dataBar><cfvo type="formula" val="$A$1"/><cfvo type="max"/><color rgb="FF335599"/></dataBar></cfRule>',
    ),
  )
  const result = await apply(bytes, 'move')
  expect(await (await JSZip.loadAsync(result.bytes)).file(path)!.async('string')).toContain(
    'val="$D$1"',
  )
  const disjoint = await mutate(bytes, path, (xml) => xml.replace('val="$A$1"', 'val="$Z$1"'))
  await exactOtherEntries(disjoint, (await apply(disjoint, 'move')).bytes, [path])
})

it.each([
  '<extLst><ext uri="{78C0D931-6437-407D-A8EE-F0AAD7539E65}"><x14:conditionalFormattings xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:conditionalFormatting><x14:cfRule type="expression" priority="1" id="{00000000-0000-0000-0000-000000000001}"><xm:f xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">数据!A1&gt;0</xm:f></x14:cfRule><xm:sqref xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">J1</xm:sqref></x14:conditionalFormatting></x14:conditionalFormattings></ext></extLst>',
  '<custom:rangeFeature xmlns:custom="urn:unknown" ref="数据!A1"/>',
])('move refuses unmodeled extension rules on another sheet: %s', async (extension) => {
  const bytes = await mutate(await fixture('filter'), 'xl/worksheets/sheet2.xml', (xml) =>
    xml.replace('</worksheet>', extension + '</worksheet>'),
  )
  await expect(apply(bytes, 'move')).rejects.toThrow(/扩展|复杂|结构|依赖/)
})
