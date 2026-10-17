import { readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { createXlsxAgentHandle } from '../../../../packages/office/src/agent/xlsx-agent.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
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
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006/relationships'
const sheet = (n: number) => `xl/worksheets/sheet${n}.xml`
const rels = (n: number) => `xl/worksheets/_rels/sheet${n}.xml.rels`
const relation = (id: string, target: string) =>
  `<Relationship Id="${id}" Type="${OFFICE}/hyperlink" Target="${target}" TargetMode="External"/>`
async function fixture(targetFeatures = false) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
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
      `<Relationship Id="rId99" Type="${OFFICE}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
  )
  for (const n of [1, 2]) {
    const features =
      n === 1
        ? `<m:mergeCells xmlns:m="${MAIN}" count="1"><m:mergeCell ref='A1:B1'/></m:mergeCells><h:hyperlinks xmlns:h="${MAIN}"><h:hyperlink ref="A2" q:id="rId1" tooltip="外链 &amp; 原始"/><h:hyperlink ref="B2" location="'目标'!$A$1" display="内部位置"/></h:hyperlinks>`
        : targetFeatures
          ? '<mergeCells count="1"><mergeCell ref="E5:F5"/></mergeCells><hyperlinks><hyperlink ref="E6" q:id="rId1"/><hyperlink ref="J10" q:id="rId1"/></hyperlinks>'
          : ''
    zip.file(
      sheet(n),
      `<worksheet xmlns="${MAIN}" xmlns:q="${OFFICE}" xmlns:custom="urn:keep"><dimension ref="A1:L12"/><sheetData><row r="1" customHeight="1" ht="24"><c r="A1" t="inlineStr"><is><t>合并标题</t></is></c><c r="C1"><v>42</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>外部链接</t></is></c><c r="B2" t="inlineStr"><is><t>内部位置</t></is></c><c r="C2"><f>A2&amp;B2</f><v>0</v></c></row><row r="3"><c r="C3" t="inlineStr"><is><r><rPr><b/></rPr><t>粗体</t></r><r><t>文本</t></r></is></c></row><row r="10"><c r="J10" t="inlineStr"><is><t>保留</t></is></c></row></sheetData>${features}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`,
    )
    if (n === 1 || targetFeatures)
      zip.file(
        rels(n),
        `<Relationships xmlns="${PACKAGE}">${relation('rId1', n === 1 ? 'https://example.com/source?x=1&amp;y=2' : 'https://example.com/keep')}</Relationships>`,
      )
  }
  zip.file('customXml/opaque.bin', new Uint8Array([0, 255, 17, 9]))
  return zip.generateAsync({ type: 'uint8array' })
}
async function edit(bytes: Uint8Array, path: string, transform: (xml: string) => string) {
  const zip = await JSZip.loadAsync(bytes)
  zip.file(path, transform(await zip.file(path)!.async('string')))
  return zip.generateAsync({ type: 'uint8array' })
}
const xml = async (bytes: Uint8Array, path: string) =>
  (await JSZip.loadAsync(bytes)).file(path)!.async('string')
const operation = (move = false, cross = false, target = 'E5') => ({
  op: move ? 'move_range' : 'copy_range',
  sheetId: cross ? 'sheet-2' : 'sheet-1',
  sourceSheetId: 'sheet-1',
  source: 'A1:C3',
  target,
})
const apply = (bytes: Uint8Array, op = operation()) =>
  applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion: 7, ops: [op] })
async function exactOtherEntries(before: Uint8Array, after: Uint8Array, allowed: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  for (const [name, file] of Object.entries(a.files).filter(
    ([entryName, entryFile]) => !entryFile.dir && !allowed.includes(entryName),
  ))
    expect(await b.file(name)!.async('uint8array')).toEqual(await file.async('uint8array'))
  expect(Object.keys(b.files).filter((name) => !a.files[name] && !b.files[name]!.dir)).toEqual(
    allowed.filter((name) => !a.files[name]),
  )
}
async function assertCrossLinks(bytes: Uint8Array, output: string) {
  const targetRels = await xml(bytes, rels(2))
  expect(targetRels).toContain('https://example.com/source?x=1&amp;y=2')
  expect(targetRels).toContain('https://example.com/keep')
  expect(output).toMatch(/ref="E6"[^>]*id="rId2"/)
  expect(output).toContain('ref="J10" q:id="rId1"')
}
for (const move of [false, true])
  for (const cross of [false, true])
    it(`${move ? 'move' : 'copy'} ${cross ? 'cross' : 'same'} sheet migrates native merge/link and preserves raw rich cells`, async () => {
      const bytes = await fixture(cross),
        original = bytes.slice(),
        result = await apply(bytes, operation(move, cross))
      expect(bytes).toEqual(original)
      const output = await xml(result.bytes, sheet(cross ? 2 : 1))
      expect(output).toMatch(/ref="E5:F5"/)
      expect(output).toMatch(/ref="E6"/)
      expect(output).toContain('location="\'目标\'!$A$1"')
      expect(output).toContain('<rPr><b/></rPr><t>粗体</t>')
      expect(output).toContain(move && cross ? "'目标'!E6&amp;'目标'!F6" : 'E6&amp;F6')
      if (cross) await assertCrossLinks(result.bytes, output)
      const source = await xml(result.bytes, sheet(1))
      expect(source.includes("ref='A1:B1'")).toBe(!move)
      expect(result.version).toBe(8)
      await exactOtherEntries(bytes, result.bytes, [
        'xl/workbook.xml',
        sheet(cross ? 2 : 1),
        ...(move && cross ? [sheet(1)] : []),
        ...(cross ? [rels(2)] : []),
      ])
    })
it('overlapping same-sheet move freezes cells and structures before clearing source', async () => {
  const bytes = await fixture(),
    result = await apply(bytes, operation(true, false, 'B2'))
  const output = await xml(result.bytes, sheet(1))
  expect(output).toContain('ref="B2:C2"')
  expect(output).toContain('ref="B3"')
  expect(output).toContain('ref="C3"')
  expect(output).toContain('<c r="B2" t="inlineStr" s="0">')
  expect(output).not.toContain("ref='A1:B1'")
  expect(output).not.toContain('<c r="A1"')
})
it('creates a cross-sheet relationship part without changing content types or source relationships', async () => {
  const bytes = await fixture(),
    result = await apply(bytes, operation(false, true))
  expect(await xml(result.bytes, rels(2))).toContain('Id="rId1"')
  expect(result.touchedEntries).toContain(rels(2))
  await exactOtherEntries(bytes, result.bytes, ['xl/workbook.xml', sheet(2), rels(2)])
})
it.each([
  ['source partial merge', sheet(1), (s: string) => s.replace("ref='A1:B1'", "ref='A1:D1'")],
  ['target partial merge', sheet(2), (s: string) => s.replace('ref="E5:F5"', 'ref="D5:F5"')],
  ['source partial hyperlink', sheet(1), (s: string) => s.replace('ref="A2"', 'ref="A2:D2"')],
  [
    'unknown merge attr',
    sheet(1),
    (s: string) => s.replace("ref='A1:B1'", "ref='A1:B1' custom:danger='1'"),
  ],
  [
    'unknown link attr',
    sheet(1),
    (s: string) => s.replace('ref="A2"', 'ref="A2" custom:danger="1"'),
  ],
  [
    'overlapping merges',
    sheet(1),
    (s: string) =>
      s
        .replace('</m:mergeCells>', '<m:mergeCell ref="B1:C1"/></m:mergeCells>')
        .replace('count="1"', 'count="2"'),
  ],
  ['missing relation', sheet(1), (s: string) => s.replace('q:id="rId1"', 'q:id="missing"')],
  ['unqualified location', sheet(1), (s: string) => s.replace("'目标'!$A$1", '$A$1')],
  ['unknown relation attr', rels(1), (s: string) => s.replace('Id="rId1"', 'Id="rId1" custom="1"')],
  [
    'ambiguous mode',
    rels(1),
    (s: string) => s.replace('TargetMode="External"', 'TargetMode="Internal"'),
  ],
  [
    'unsafe target',
    rels(1),
    (s: string) => s.replace('https://example.com/source?x=1&amp;y=2', 'javascript:alert(1)'),
  ],
  [
    'duplicate relation',
    rels(1),
    (s: string) =>
      s.replace(
        '</Relationships>',
        relation('rId1', 'https://example.com/duplicate') + '</Relationships>',
      ),
  ],
])('rejects %s before publishing', async (_name, path, transform) => {
  const bytes = await edit(await fixture(true), path as string, transform as (s: string) => string),
    original = bytes.slice()
  for (const move of [false, true])
    await expect(apply(bytes, operation(move, true))).rejects.toThrow(
      /范围|结构|合并|链接|关系|XML/,
    )
  expect(bytes).toEqual(original)
})
it('retains unknown or malformed native CF/DV guards and filtered/fill structure refusal', async () => {
  const bytes = await fixture()
  for (const op of [
    { ...operation(), filterColumn: 'A', filterValues: ['外部链接'] },
    { op: 'fill_range', sheetId: 'sheet-1', source: 'A1:C3', target: 'E5:G7' },
  ])
    await expect(
      applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion: 7, ops: [op] }),
    ).rejects.toThrow(/相交|迁移|结构/)
  for (const feature of [
    '<conditionalFormatting sqref="A1"><cfRule type="expression" priority="1" unknown="1"><formula>1</formula></cfRule></conditionalFormatting>',
    '<dataValidations count="1"><dataValidation type="whole" sqref="E5"><formula1>0</formula1></dataValidation></dataValidations>',
  ]) {
    const guarded = await edit(bytes, sheet(1), (s) =>
      s.replace('</worksheet>', feature + '</worksheet>'),
    )
    await expect(apply(guarded)).rejects.toThrow(/相交|迁移|结构/)
  }
})
it('protected source is copy-readable while actual source/target writes are protected', async () => {
  const bytes = await edit(await fixture(), sheet(1), (s) =>
    s.replace('</worksheet>', '<sheetProtection password="ABCD"/></worksheet>'),
  )
  expect((await apply(bytes, operation(false, true))).version).toBe(8)
  await expect(apply(bytes, operation(true, true))).rejects.toThrow(/保护/)
  const target = await edit(await fixture(), sheet(2), (s) =>
    s.replace('</worksheet>', '<sheetProtection/></worksheet>'),
  )
  await expect(apply(target, operation(false, true))).rejects.toThrow(/保护/)
})
it('real current handle publishes once, saves native bytes and restores complete undo/redo snapshots', async () => {
  const bytes = await fixture(true),
    changed = vi.fn<() => void>()
  const handle = createXlsxAgentHandle(
    'xlsx-1',
    bytes,
    await openXlsxForEdit(bytes),
    () => null,
    changed,
    applyXlsxOpsOnHost,
  )
  expect(
    await handle.execute('propose_operations', { operations: [operation(true, true)] }, {}),
  ).toMatchObject({ changed: true, version: 1 })
  const saved = handle.currentBytes()
  handle.markSaved()
  expect(handle.history()).toEqual({ undo: 1, redo: 0 })
  expect(handle.isDirty()).toBe(false)
  expect(
    (await readXlsx(saved)).sheets[1]!.rows.find((row) => row.number === 5)?.cells.find(
      (cell) => cell.col === 4,
    )?.mergeRef,
  ).toBe('E5:F5')
  expect(await handle.undo()).toBe(true)
  expect(handle.currentBytes()).toEqual(bytes)
  expect(handle.isDirty()).toBe(true)
  expect(await handle.redo()).toBe(true)
  expect(handle.currentBytes()).toEqual(saved)
  expect(handle.isDirty()).toBe(false)
  handle.dispose()
})
it('writes the readable browser fixture for root acceptance', async () => {
  let bytes = await fixture(true)
  for (const n of [1, 2])
    bytes = await edit(bytes, sheet(n), (text) =>
      text
        .replaceAll('xmlns:q=', 'xmlns:r=')
        .replaceAll('q:id=', 'r:id=')
        .replaceAll('m:merge', 'merge')
        .replaceAll('h:hyperlink', 'hyperlink')
        .replace("ref='A1:B1'", 'ref="A1:B1"'),
    )
  writeFileSync('/tmp/mimir-xlsx-range-structures-20261017.xlsx', bytes)
  expect((await readXlsx(bytes)).sheets[0]!.rows[0]!.cells[0]!.mergeRef).toBe('A1:B1')
})

it.each([false, true])(
  'move=%s can create and reopen a previously absent relationship part',
  async (move) => {
    const bytes = await fixture(),
      result = await apply(bytes, operation(move, true))
    expect(await xml(result.bytes, rels(2))).toContain('https://example.com/source?x=1&amp;y=2')
    expect(result.touchedEntries.toSorted()).toEqual(
      ['xl/workbook.xml', sheet(2), rels(2), ...(move ? [sheet(1)] : [])].toSorted(),
    )
    const reopened = await openXlsxForEdit(result.bytes)
    expect(
      reopened
        .view()
        .sheets[1]!.rows.find((row) => row.number === 5)
        ?.cells.find((cell) => cell.col === 4)?.mergeRef,
    ).toBe('E5:F5')
    await exactOtherEntries(bytes, result.bytes, [
      'xl/workbook.xml',
      sheet(2),
      rels(2),
      ...(move ? [sheet(1)] : []),
    ])
  },
)
it.each([false, true])(
  'move=%s safely expands an empty namespace-prefixed relationships root',
  async (move) => {
    const zip = await JSZip.loadAsync(await fixture())
    zip.file(rels(2), `<p:Relationships xmlns:p="${PACKAGE}"/>`)
    const bytes = await zip.generateAsync({ type: 'uint8array' }),
      result = await apply(bytes, operation(move, true))
    const output = await xml(result.bytes, rels(2))
    expect(output).toContain('<p:Relationships')
    expect(output).toContain('</p:Relationships>')
    expect(output).toContain('TargetMode="External"')
    expect((await apply(result.bytes, operation(false, true))).bytes.length).toBeGreaterThan(0)
  },
)
it('reuses one cross-sheet relationship for multiple copied links with the same source identity', async () => {
  const bytes = await edit(await fixture(), sheet(1), (s) =>
    s.replace('location="\'目标\'!$A$1"', 'q:id="rId1"'),
  )
  const result = await apply(bytes, operation(false, true)),
    native = await xml(result.bytes, sheet(2)),
    relationships = await xml(result.bytes, rels(2))
  expect([...relationships.matchAll(/<Relationship\s/g)]).toHaveLength(1)
  expect([...native.matchAll(/r:id="rId1"/g)]).toHaveLength(2)
})
it.each([false, true])(
  'copy cross=%s repeated with unchanged native output is a byte/version/history no-op',
  async (cross) => {
    const bytes = await fixture(cross)
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      () => {},
      applyXlsxOpsOnHost,
    )
    const args = { operations: [operation(false, cross)] }
    expect(await handle.execute('propose_operations', args, {})).toMatchObject({
      changed: true,
      version: 1,
    })
    const saved = handle.currentBytes()
    handle.markSaved()
    expect(await handle.execute('propose_operations', args, {})).toMatchObject({
      changed: false,
      version: 1,
    })
    expect(handle.currentBytes()).toEqual(saved)
    expect(handle.history()).toEqual({ undo: 1, redo: 0 })
    expect(handle.isDirty()).toBe(false)
    handle.dispose()
  },
)
it('retains final actual native validation on dependent cells after a structured move', async () => {
  const rule =
    '<dataValidations count="1"><dataValidation type="whole" operator="greaterThan" showErrorMessage="1" sqref="J10"><formula1>5</formula1></dataValidation></dataValidations>'
  const bytes = await edit(await fixture(true), sheet(2), (s) =>
    s
      .replace(
        '<c r="J10" t="inlineStr"><is><t>保留</t></is></c>',
        '<c r="J10"><f>数据!C1</f><v>2</v></c>',
      )
      .replace('<hyperlinks>', rule + '<hyperlinks>'),
  )
  const copy = await apply(bytes, operation(false, true))
  expect(await xml(copy.bytes, sheet(2))).toContain(rule)
  const handle = createXlsxAgentHandle(
    'xlsx-1',
    bytes,
    await openXlsxForEdit(bytes),
    () => null,
    () => {},
    applyXlsxOpsOnHost,
  )
  await expect(
    handle.execute('propose_operations', { operations: [operation(true, true)] }, {}),
  ).rejects.toThrow(/验证|输入|数值|文档未修改/)
  expect(handle.currentBytes()).toEqual(bytes)
  expect(handle.history()).toEqual({ undo: 0, redo: 0 })
  expect(handle.getVersion()).toBe(0)
  expect(handle.isDirty()).toBe(false)
  handle.dispose()
  const valid = await edit(bytes, sheet(2), (s) =>
    s.replace('<f>数据!C1</f><v>2</v>', '<f>数据!C1</f><v>42</v>'),
  )
  const moved = await apply(valid, operation(true, true))
  expect(await xml(moved.bytes, sheet(2))).toContain(rule)
  expect(await xml(moved.bytes, sheet(2))).toContain("<f>'目标'!G5</f><v>42</v>")
})
it('resolves legal __proto__ namespace prefixes without inheriting object members', async () => {
  const bytes = await edit(await fixture(), sheet(1), (s) =>
    s.replaceAll('xmlns:q=', 'xmlns:__proto__=').replaceAll('q:id=', '__proto__:id='),
  )
  const result = await apply(bytes, operation(false, true))
  expect(await xml(result.bytes, rels(2))).toContain('https://example.com/source?x=1&amp;y=2')
})
it('preserves literal single-pass entity text when copying and moving native formulas and link attributes', async () => {
  const base = await edit(await fixture(), sheet(1), (s) =>
    s
      .replace('A2&amp;B2', 'A2&amp;"&#x26;#49;"')
      .replace('tooltip="外链 &amp; 原始"', 'tooltip="&#x26;#115;tr"'),
  )
  for (const move of [false, true]) {
    const output = await xml((await apply(base, operation(move, false))).bytes, sheet(1))
    expect(output).toContain('<f>E6&amp;"&amp;#49;"</f>')
    expect(output).toContain('tooltip="&amp;#115;tr"')
  }
})
it('preserves an unrelated namespace named count while adjusting the real merge count', async () => {
  const bytes = await edit(await fixture(), sheet(1), (s) =>
    s.replace('count="1"', 'xmlns:count="urn:keep-count" count="1"'),
  )
  const result = await apply(bytes)
  expect(await xml(result.bytes, sheet(1))).toContain('xmlns:count="urn:keep-count" count="2"')
})
it.each([
  '<m:mergeCell ref="A1:B1"><![CDATA[unknown]]></m:mergeCell>',
  '<m:mergeCell ref="A1:B1">unknown</m:mergeCell>',
])('rejects text-bearing native leaf %s atomically', async (leaf) => {
  const bytes = await edit(await fixture(), sheet(1), (s) =>
    s.replace("<m:mergeCell ref='A1:B1'/>", leaf),
  )
  await expect(apply(bytes)).rejects.toThrow(/结构|XML/)
})
it('ordinary plain source fully replaces target merge/link while preserving unrelated links and unused relationships', async () => {
  const bytes = await edit(await fixture(true), sheet(1), (s) =>
    s
      .replace(/<m:mergeCells[\s\S]*?<\/m:mergeCells>/, '')
      .replace(/<h:hyperlinks[\s\S]*?<\/h:hyperlinks>/, ''),
  )
  const result = await apply(bytes, operation(false, true)),
    output = await xml(result.bytes, sheet(2))
  expect(output).not.toContain('<mergeCells')
  expect(output).not.toContain('ref="E6" q:id=')
  expect(output).toContain('ref="J10" q:id="rId1"')
  expect(await xml(result.bytes, rels(2))).toBe(await xml(bytes, rels(2)))
  expect(result.touchedEntries).not.toContain(rels(2))
})

it('distinct source rIds with identical targets stay stable on repeated cross-sheet copy', async () => {
  let bytes = await edit(await fixture(), sheet(1), (s) =>
    s.replace('location="\'目标\'!$A$1"', 'q:id="rId2"'),
  )
  bytes = await edit(bytes, rels(1), (s) =>
    s.replace(
      '</Relationships>',
      relation('rId2', 'https://example.com/source?x=1&amp;y=2') + '</Relationships>',
    ),
  )
  const first = await apply(bytes, operation(false, true))
  const repeated = await applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes: first.bytes,
    expectedVersion: first.version,
    ops: [operation(false, true)],
  })
  expect(repeated).toEqual({
    bytes: first.bytes,
    version: first.version,
    changedCells: [],
    touchedEntries: [],
  })
})
it('a completed actual structured host candidate cannot publish after its current handle is disposed', async () => {
  const bytes = await fixture(true),
    changed = vi.fn<() => void>()
  let release!: () => void
  let ready!: () => void
  const completed = new Promise<void>((resolve) => {
      ready = resolve
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
  const host: typeof applyXlsxOpsOnHost = async (request) => {
    const candidate = await applyXlsxOpsOnHost(request)
    ready()
    await gate
    return candidate
  }
  const handle = createXlsxAgentHandle(
    'xlsx-1',
    bytes,
    await openXlsxForEdit(bytes),
    () => null,
    changed,
    host,
  )
  const pending = handle.execute('propose_operations', { operations: [operation(true, true)] }, {})
  await completed
  handle.dispose()
  release()
  await expect(pending).rejects.toThrow(/关闭|失效|版本|取消/)
  expect(handle.currentBytes()).toEqual(bytes)
  expect(handle.history()).toEqual({ undo: 0, redo: 0 })
  expect(handle.getVersion()).toBe(0)
  expect(changed).not.toHaveBeenCalled()
})

it.each([false, true])(
  'translates mixed text and CDATA with a literal formula end tag, move=%s',
  async (move) => {
    const bytes = await edit(await fixture(), sheet(1), (s) =>
      s.replace('<f>A2&amp;B2</f>', '<f>A2<![CDATA[&"literal </f> &amp;#49;"]]></f>'),
    )
    const result = await apply(bytes, operation(move, true))
    expect(await xml(result.bytes, sheet(2))).toContain(
      `<f>${move ? "'目标'!" : ''}E6&amp;"literal &lt;/f&gt; &amp;amp;#49;"</f>`,
    )
  },
)
it('retains unchanged CDATA cell, defined name, and chart formulas byte for byte', async () => {
  const formula = '<![CDATA["&amp;#49;"]]>'
  let bytes = await edit(await fixture(), sheet(1), (s) =>
    s.replace('<f>A2&amp;B2</f>', `<f>${formula}</f>`),
  )
  bytes = await edit(bytes, 'xl/workbook.xml', (s) =>
    s.replace(
      '</sheets>',
      `</sheets><definedNames><definedName name="KeepCDATA">${formula}</definedName></definedNames>`,
    ),
  )
  const zip = await JSZip.loadAsync(bytes)
  const chartPath = 'xl/charts/unrelated-cdata.xml'
  const chart = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:f>${formula}</c:f></c:chartSpace>`
  zip.file(chartPath, chart)
  bytes = await zip.generateAsync({ type: 'uint8array' })
  const result = await apply(bytes, operation(true, true))
  expect(await xml(result.bytes, sheet(2))).toContain(`<f>${formula}</f>`)
  expect(await xml(result.bytes, 'xl/workbook.xml')).toContain(
    `<definedName name="KeepCDATA">${formula}</definedName>`,
  )
  expect(await xml(result.bytes, chartPath)).toBe(chart)
  expect(result.touchedEntries).not.toContain(chartPath)
})
it.each(['<f>A2<unknown/>B2</f>', '<f><![CDATA[A2]]><unknown/>B2</f>'])(
  'rejects nested formula markup atomically: %s',
  async (formula) => {
    const bytes = await edit(await fixture(), sheet(1), (s) =>
      s.replace('<f>A2&amp;B2</f>', formula),
    )
    const original = bytes.slice()
    await expect(apply(bytes, operation(false, true))).rejects.toThrow(/公式|XML/)
    await expect(apply(bytes, operation(true, true))).rejects.toThrow(/公式|XML/)
    expect(bytes).toEqual(original)
  },
)

it.each([
  [
    'merge leaf',
    sheet(1),
    (s: string) =>
      s.replace(
        "<m:mergeCell ref='A1:B1'/>",
        "<m:mergeCell ref='A1:B1'><!-- invalid---></m:mergeCell>",
      ),
  ],
  [
    'merge container',
    sheet(1),
    (s: string) => s.replace('</m:mergeCells>', '<!-- invalid---></m:mergeCells>'),
  ],
  [
    'hyperlink leaf',
    sheet(1),
    (s: string) =>
      s.replace('display="内部位置"/>', 'display="内部位置"><!-- invalid---></h:hyperlink>'),
  ],
  [
    'hyperlink container',
    sheet(1),
    (s: string) => s.replace('</h:hyperlinks>', '<!-- invalid---></h:hyperlinks>'),
  ],
  [
    'relationship leaf',
    rels(1),
    (s: string) =>
      s.replace('TargetMode="External"/>', 'TargetMode="External"><!-- invalid---></Relationship>'),
  ],
  [
    'relationship container',
    rels(1),
    (s: string) => s.replace('</Relationships>', '<!-- invalid---></Relationships>'),
  ],
])(
  'rejects invalid XML comment in %s without live publication',
  async (_label, path, transform) => {
    const bytes = await edit(await fixture(), path, transform)
    for (const move of [false, true]) {
      const changed = vi.fn<() => void>()
      const handle = createXlsxAgentHandle(
        'xlsx-1',
        bytes,
        await openXlsxForEdit(bytes),
        () => null,
        changed,
        applyXlsxOpsOnHost,
      )
      await expect(
        handle.execute('propose_operations', { operations: [operation(move, true)] }, {}),
      ).rejects.toThrow(/XML|注释|范围|原件/)
      expect(handle.currentBytes()).toEqual(bytes)
      expect(handle.getVersion()).toBe(0)
      expect(handle.history()).toEqual({ undo: 0, redo: 0 })
      expect(handle.isDirty()).toBe(false)
      expect(changed).not.toHaveBeenCalled()
      handle.dispose()
    }
  },
)
it.each([false, true])(
  'preserves legal XML comments and CDATA comment-looking text, move=%s',
  async (move) => {
    const comment = '<!-- valid - comment -->'
    const untouched = `<c r="J10" t="inlineStr"><is>${comment}<t><![CDATA[<!-- invalid--->]]></t></is></c>`
    let bytes = await edit(await fixture(), sheet(1), (s) =>
      s
        .replace("<m:mergeCell ref='A1:B1'/>", `<m:mergeCell ref='A1:B1'>${comment}</m:mergeCell>`)
        .replace('</m:mergeCells>', `${comment}</m:mergeCells>`)
        .replace('display="内部位置"/>', `display="内部位置">${comment}</h:hyperlink>`)
        .replace('</h:hyperlinks>', `${comment}</h:hyperlinks>`)
        .replace('<f>A2&amp;B2</f>', `<f>A2${comment}&amp;B2</f>`)
        .replace('<c r="J10" t="inlineStr"><is><t>保留</t></is></c>', untouched),
    )
    bytes = await edit(bytes, rels(1), (s) =>
      s
        .replace('TargetMode="External"/>', `TargetMode="External">${comment}</Relationship>`)
        .replace('</Relationships>', `${comment}</Relationships>`),
    )
    const result = await apply(bytes, operation(move, true))
    const output = await xml(result.bytes, sheet(2))
    expect(output).toContain('ref="E5:F5"')
    expect(output).toContain('ref="E6"')
    expect(output).toContain(move ? "<f>'目标'!E6&amp;'目标'!F6</f>" : '<f>E6&amp;F6</f>')
    expect(await xml(result.bytes, sheet(1))).toContain(untouched)
    expect(await xml(result.bytes, rels(1))).toBe(await xml(bytes, rels(1)))
  },
)
