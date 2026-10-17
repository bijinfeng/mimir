import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { createXlsxAgentHandle } from '../../../../packages/office/src/agent/xlsx-agent.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { pivotXmlTree } from '../../../../packages/office/src/xlsx-pivot-editability.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { parseRange } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { assertXlsxRangeFeatures } from '../services/xlsx-range-features.js'
import { planXlsxRangeStructures } from '../services/xlsx-range-structures.js'

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
const source = 'xl/worksheets/sheet1.xml'
const target = 'xl/worksheets/sheet2.xml'
const targetRels = 'xl/worksheets/_rels/sheet2.xml.rels'
const sourceRels = 'xl/worksheets/_rels/sheet1.xml.rels'
async function fixture(transform?: (zip: JSZip) => Promise<void>) {
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
      '<sheet name="目标" sheetId="2" r:id="check-sheet"/></sheets>',
    ),
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
      '</Relationships>',
      `<Relationship Id="check-sheet" Type="${OFFICE}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
  )
  const features = `<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><hyperlinks><hyperlink ref="A2" r:id="link" tooltip="literal &amp;#65;"/></hyperlinks>`
  for (const entry of [source, target])
    zip.file(
      entry,
      `<worksheet xmlns="${MAIN}" xmlns:r="${OFFICE}"><dimension ref="A1:J20"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>标题</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>链接</t></is></c></row></sheetData>${entry === source ? features : ''}<pageMargins left="1" right="1" top="1" bottom="1" header="0" footer="0"/></worksheet>`,
    )
  zip.file(
    sourceRels,
    `<Relationships xmlns="${PACKAGE}"><Relationship Id="link" Type="${OFFICE}/hyperlink" Target="https://example.com/?q=&amp;#65;" TargetMode="External"/></Relationships>`,
  )
  zip.file('customXml/r2a-check.bin', new Uint8Array([17, 0, 252]))
  await transform?.(zip)
  return zip.generateAsync({ type: 'uint8array' })
}
const op = (move = false) => ({
  op: move ? 'move_range' : 'copy_range',
  sheetId: 'sheet-2',
  sourceSheetId: 'sheet-1',
  source: 'A1:C3',
  target: 'E5',
})
const apply = (bytes: Uint8Array, move = false) =>
  applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion: 4, ops: [op(move)] })
async function alter(zip: JSZip, entry: string, change: (xml: string) => string) {
  zip.file(entry, change(await zip.file(entry)!.async('string')))
}

it.each([
  [
    'destination partial hyperlink',
    target,
    (s: string) =>
      s.replace(
        '<pageMargins',
        '<hyperlinks><hyperlink ref="D6:E6" location="\'目标\'!A1"/></hyperlinks><pageMargins',
      ),
  ],
  [
    'duplicate hyperlink',
    source,
    (s: string) => s.replace('</hyperlinks>', '<hyperlink ref="A2" r:id="link"/></hyperlinks>'),
  ],
  [
    'wrong namespace leaf',
    source,
    (s: string) => s.replace('<mergeCell ref=', '<mergeCell xmlns="urn:unknown" ref='),
  ],
  [
    'relationship unknown namespace attr',
    sourceRels,
    (s: string) => s.replace('Id="link"', 'xmlns:x="urn:check" x:Id="extra" Id="link"'),
  ],
  [
    'relationship text leaf',
    sourceRels,
    (s: string) =>
      s.replace(
        'TargetMode="External"/>',
        'TargetMode="External"><![CDATA[unknown]]></Relationship>',
      ),
  ],
  [
    'relationship mixed content',
    sourceRels,
    (s: string) => s.replace('</Relationships>', '<![CDATA[unknown]]></Relationships>'),
  ],
  [
    'hyperlink mixed content',
    source,
    (s: string) => s.replace('</hyperlinks>', '<![CDATA[unknown]]></hyperlinks>'),
  ],
  ['numeric XML control entity', sourceRels, (s: string) => s.replace('q=&amp;#65;', 'q=&#1;')],
  [
    'ambiguous relative internal link',
    source,
    (s: string) => s.replace('r:id="link"', 'location="A1"'),
  ],
  [
    'internal link out of worksheet bounds',
    source,
    (s: string) => s.replace('r:id="link"', 'location="\'目标\'!XFE1"'),
  ],
  [
    'unknown alternate content',
    source,
    (s: string) => s.replace('</worksheet>', '<AlternateContent xmlns="urn:unknown"/></worksheet>'),
  ],
])('independent native refusal: %s', async (_name, entry, transform) => {
  const bytes = await fixture((zip) => alter(zip, entry, transform)),
    original = bytes.slice()
  await expect(apply(bytes)).rejects.toThrow(/范围|结构|链接|关系|XML|原件/)
  await expect(apply(bytes, true)).rejects.toThrow(/范围|结构|链接|关系|XML|原件/)
  expect(bytes).toEqual(original)
})

it('binds a real structure permit to exact XML, entry and ordered footprint', async () => {
  const bytes = await fixture(),
    zip = await BoundedZip.open(bytes)
  const from = (await zip.readText(source))!,
    to = (await zip.readText(target))!
  const a = parseRange('A1:C3'),
    b = parseRange('E5:G7')
  const plan = await planXlsxRangeStructures(
    zip,
    { entry: source, xml: from, bounds: a },
    { entry: target, xml: to, bounds: b },
    false,
  )
  await expect(
    assertXlsxRangeFeatures(zip, source, from, [a], plan.permit),
  ).resolves.toBeUndefined()
  await expect(assertXlsxRangeFeatures(zip, source, from, [a], {})).rejects.toThrow(/相交/)
  await expect(assertXlsxRangeFeatures(zip, source, from + '\n', [a], plan.permit)).rejects.toThrow(
    /相交/,
  )
  await expect(assertXlsxRangeFeatures(zip, source, from, [a, b], plan.permit)).rejects.toThrow(
    /相交/,
  )
})

it.each([false, true])(
  'cross-sheet move=%s preserves literal entity text, allocates around unrelated rIds, and leaves other entries exact',
  async (move) => {
    const bytes = await fixture(async (zip) => {
      zip.file(
        'xl/drawings/r2a-check.xml',
        `<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>`,
      )
      zip.file(
        targetRels,
        `<Relationships xmlns="${PACKAGE}"><Relationship Id="rId1" Type="${OFFICE}/drawing" Target="../drawings/r2a-check.xml"/></Relationships>`,
      )
      await alter(zip, target, (s) =>
        s.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'),
      )
    })
    const result = await apply(bytes, move),
      before = await JSZip.loadAsync(bytes),
      after = await JSZip.loadAsync(result.bytes)
    const relationships = await after.file(targetRels)!.async('string')
    expect(relationships).toContain(
      'Id="rId1" Type="' + OFFICE + '/drawing" Target="../drawings/r2a-check.xml"',
    )
    expect(relationships).toContain('Id="rId2"')
    expect(relationships).toContain('Target="https://example.com/?q=&amp;#65;"')
    expect(await after.file(target)!.async('string')).toContain('tooltip="literal &amp;#65;"')
    expect(result.touchedEntries.toSorted()).toEqual(
      ['xl/workbook.xml', target, targetRels, ...(move ? [source] : [])].toSorted(),
    )
    for (const [entry, file] of Object.entries(before.files)) {
      if (file.dir || result.touchedEntries.includes(entry)) continue
      expect(await after.file(entry)!.async('uint8array')).toEqual(await file.async('uint8array'))
    }
    expect(
      Object.keys(after.files).filter((entry) => !before.files[entry] && !after.files[entry]!.dir),
    ).toEqual([])
  },
)

it('rejects a completed actual structured host candidate after explicit abort', async () => {
  const bytes = await fixture(),
    changed = vi.fn<() => void>()
  let resolveCandidate!: () => void, candidateReady!: () => void
  const ready = new Promise<void>((resolve) => {
    candidateReady = resolve
  })
  const gate = new Promise<void>((resolve) => {
    resolveCandidate = resolve
  })
  const host: typeof applyXlsxOpsOnHost = async (request) => {
    const result = await applyXlsxOpsOnHost(request)
    candidateReady()
    await gate
    return result
  }
  const handle = createXlsxAgentHandle(
    'xlsx-1',
    bytes,
    await openXlsxForEdit(bytes),
    () => null,
    changed,
    host,
  )
  const controller = new AbortController()
  const pending = handle.execute(
    'propose_operations',
    { operations: [op()] },
    { signal: controller.signal },
  )
  await ready
  controller.abort()
  resolveCandidate()
  await expect(pending).rejects.toThrow(/取消/)
  expect(handle.currentBytes()).toEqual(bytes)
  expect(handle.getVersion()).toBe(0)
  expect(handle.history()).toEqual({ undo: 0, redo: 0 })
  expect(handle.isDirty()).toBe(false)
  expect(changed).not.toHaveBeenCalled()
  handle.dispose()
})

it.each([false, true])(
  'move=%s migrates native CDATA formula character data without publishing literal markup',
  async (move) => {
    const bytes = await fixture((zip) =>
      alter(zip, source, (s) =>
        s.replace('<c r="A2"', '<c r="C2"><f><![CDATA[A1]]></f><v>1</v></c><c r="A2"'),
      ),
    )
    const result = await apply(bytes, move)
    const output = await (await JSZip.loadAsync(result.bytes)).file(target)!.async('string')
    const cell = /<c r="G6"[^>]*>[\s\S]*?<\/c>/.exec(output)![0]
    const formula = pivotXmlTree(cell).children.find((node) => node.tag === 'f')!
    expect(formula.children.map((node) => node.attrs.value).join('')).toBe(
      move ? "'目标'!E5" : 'E5',
    )
  },
)

it.each([false, true])(
  'move=%s preserves literal ampersands and entity-looking text inside CDATA formulas',
  async (move) => {
    const bytes = await fixture((zip) =>
      alter(zip, source, (s) =>
        s.replace('<c r="A2"', '<c r="C2"><f><![CDATA[A1&"&amp;#49;"]]></f><v>1</v></c><c r="A2"'),
      ),
    )
    const result = await apply(bytes, move)
    const output = await (await JSZip.loadAsync(result.bytes)).file(target)!.async('string')
    const cell = /<c r="G6"[^>]*>[\s\S]*?<\/c>/.exec(output)![0]
    const formula = pivotXmlTree(cell).children.find((node) => node.tag === 'f')!
    expect(formula.children.map((node) => node.attrs.value).join('')).toBe(
      (move ? "'目标'!E5" : 'E5') + '&"&amp;#49;"',
    )
  },
)

it('preserves an untouched native CDATA formula byte-for-byte during structured move', async () => {
  const untouched = '<c r="J10"><f><![CDATA[SUM(J11:J12)&"&amp;#49;"]]></f><v>1</v></c>'
  const bytes = await fixture((zip) =>
    alter(zip, source, (s) =>
      s.replace('</sheetData>', `<row r="10">${untouched}</row></sheetData>`),
    ),
  )
  const result = await apply(bytes, true)
  expect(await (await JSZip.loadAsync(result.bytes)).file(source)!.async('string')).toContain(
    untouched,
  )
})

it.each([false, true])(
  'recheck move=%s reads comments and multiple CDATA sections as formula character data once',
  async (move) => {
    const body =
      'A1<!-- fake </f> and <f> -->&amp;<![CDATA["literal </f> &amp;#49;"]]><![CDATA[&"tail"]]>'
    const bytes = await fixture((zip) =>
      alter(zip, source, (s) =>
        s.replace('<c r="A2"', `<c r="C2"><f>${body}</f><v>1</v></c><c r="A2"`),
      ),
    )
    const result = await apply(bytes, move)
    const output = await (await JSZip.loadAsync(result.bytes)).file(target)!.async('string')
    const cell = /<c r="G6"[^>]*>[\s\S]*?<\/c>/.exec(output)![0]
    const formula = pivotXmlTree(cell).children.find((node) => node.tag === 'f')!
    expect(formula.children.map((node) => node.attrs.value).join('')).toBe(
      (move ? "'目标'!E5" : 'E5') + '&"literal </f> &amp;#49;"&"tail"',
    )
  },
)

it.each([
  '<f>A1<!-- invalid--comment --></f>',
  '<f>A1<!-- invalid---></f>',
  '<f>A1]]></f>',
  '<f>A1<?unknown data?></f>',
  '<f><![CDATA[A1]]><unknown/></f>',
  '<f>A1&amp<![CDATA[;]]></f>',
])(
  'recheck rejects invalid or unknown formula XML with zero live publication: %s',
  async (formula) => {
    const bytes = await fixture((zip) =>
      alter(zip, source, (s) =>
        s.replace('<c r="A2"', `<c r="C2">${formula}<v>1</v></c><c r="A2"`),
      ),
    )
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      () => {},
      applyXlsxOpsOnHost,
    )
    await expect(handle.execute('propose_operations', { operations: [op()] }, {})).rejects.toThrow(
      /公式|XML|原件|范围/,
    )
    expect(handle.currentBytes()).toEqual(bytes)
    expect(handle.getVersion()).toBe(0)
    expect(handle.history()).toEqual({ undo: 0, redo: 0 })
    expect(handle.isDirty()).toBe(false)
    handle.dispose()
  },
)

it.each([false, true])(
  'move=%s retains the 2000 cell operation budget with actual source structures',
  async (move) => {
    const bytes = await fixture()
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes,
        expectedVersion: 4,
        ops: [{ ...op(move), source: 'A1:C668' }],
      }),
    ).rejects.toThrow(/2000|范围|预算/)
  },
)
