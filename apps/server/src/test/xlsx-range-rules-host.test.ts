import { readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { createXlsxAgentHandle } from '../../../../packages/office/src/agent/xlsx-agent.js'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { MAIN, cf, dv } from './xlsx-range-rules.test-helper.js'

vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
const path = (n: number) => `xl/worksheets/sheet${n}.xml`
const body =
  '<row r="1"><c r="A1"><v>5</v></c><c r="B1"><v>6</v></c></row><row r="2"><c r="A2"><v>7</v></c><c r="B2"><v>8</v></c></row><row r="10"><c r="J10"><v>1</v></c></row>'
async function fixture(source: string, target = '', cells = body, targetCells = '') {
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
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
  )
  for (const n of [1, 2])
    zip.file(
      path(n),
      `<worksheet xmlns="${MAIN}" xmlns:q="${MAIN}"><dimension ref="A1:M14"/><sheetData>${n === 1 ? cells : targetCells}</sheetData>${n === 1 ? source : target}<pageMargins left="0.7"/></worksheet>`,
    )
  zip.file('customXml/rule-opaque.bin', new Uint8Array([1, 255, 0, 42]))
  return zip.generateAsync({ type: 'uint8array' })
}
const op = (move = false, cross = true, target = 'E5') => ({
  op: move ? 'move_range' : 'copy_range',
  sheetId: cross ? 'sheet-2' : 'sheet-1',
  sourceSheetId: 'sheet-1',
  source: 'A1:B2',
  target,
})
const apply = (bytes: Uint8Array, operation = op()) =>
  applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, expectedVersion: 0, ops: [operation] })
async function xml(bytes: Uint8Array, n: number) {
  return (await JSZip.loadAsync(bytes)).file(path(n))!.async('string')
}
async function untouched(before: Uint8Array, after: Uint8Array, entries: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  for (const [name, file] of Object.entries(a.files).filter(
    ([entry, candidate]) => !candidate.dir && !entries.includes(entry),
  ))
    expect(await b.file(name)!.async('uint8array')).toEqual(await file.async('uint8array'))
}
for (const move of [false, true])
  for (const cross of [false, true])
    it(`native CF and DV migrate atomically alongside merge/link, move=${move} cross=${cross}`, async () => {
      const features =
        '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>' +
        cf('A1:B2') +
        dv('A1:B2', '0', 'showErrorMessage="1" allowBlank="1" prompt="原生提示"') +
        '<hyperlinks><hyperlink ref="A2" location="\'数据\'!A1"/></hyperlinks>'
      const bytes = await fixture(features),
        original = bytes.slice(),
        result = await apply(bytes, op(move, cross))
      expect(bytes).toEqual(original)
      const native = await xml(result.bytes, cross ? 2 : 1)
      expect(native).toContain('ref="E5:F5"')
      expect(native).toContain('sqref="E5:F6"')
      expect(native).toContain('prompt="原生提示"')
      expect(native).toContain('ref="E6"')
      const view = await readXlsx(result.bytes),
        sheet = view.sheets[cross ? 1 : 0]!
      expect(sheet.extras!.validations!.some((rule) => rule.range === 'E5:F6')).toBe(true)
      expect(sheet.extras!.cfRules!.some((rule) => rule.range === 'E5:F6')).toBe(true)
      await untouched(bytes, result.bytes, [
        'xl/workbook.xml',
        path(cross ? 2 : 1),
        ...(move ? [path(1)] : []),
      ])
    })
it('candidate validation rejects a new rule even when source and destination values are identical', async () => {
  const cells =
    '<row r="1"><c r="A1"><v>0</v></c><c r="B1"><v>0</v></c></row><row r="2"><c r="A2"><v>0</v></c><c r="B2"><v>0</v></c></row>'
  const target =
    '<row r="5"><c r="E5"><v>0</v></c><c r="F5"><v>0</v></c></row><row r="6"><c r="E6"><v>0</v></c><c r="F6"><v>0</v></c></row>'
  const bytes = await fixture(dv('A1:B2', '5', 'showErrorMessage="1"'), '', cells, target)
  await expect(apply(bytes)).rejects.toThrow(/文档未修改/)
  expect(await xml(bytes, 2)).not.toContain('dataValidation')
})
it('checks newly validated empty target cells instead of considering absent values unchanged', async () => {
  const rule = dv('A1:B2', '0', 'showErrorMessage="1"').replace(
    'type="whole" operator="greaterThan"',
    'type="custom"',
  )
  const bytes = await fixture(rule, '', '')
  await expect(apply(bytes)).rejects.toThrow(/文档未修改/)
})
it('does not grant ordinary copy manual warning confirmation', async () => {
  const bytes = await fixture(dv('A1:B2', '99', 'showErrorMessage="1" errorStyle="warning"'))
  await expect(apply(bytes)).rejects.toThrow(/确认|手动|无效/)
})
it('preserves invalid unchanged validation outside the changed domain', async () => {
  const bytes = await fixture(cf('A1:B2') + dv('J10', '99', 'showErrorMessage="1"'))
  const result = await apply(bytes)
  expect(result.version).toBe(1)
  expect(await xml(result.bytes, 1)).toContain('sqref="J10"')
})
it('overwrites only intersected target rules and leaves their outside native fragments', async () => {
  const bytes = await fixture('', dv('D4:G7', '99', 'showErrorMessage="1"'))
  const result = await apply(bytes)
  expect(await xml(result.bytes, 2)).toContain('sqref="D4:G4 D5:D6 G5:G6 D7:G7"')
})
it('moves cross-sheet mixed and absolute validation dependencies in the actual candidate', async () => {
  const bytes = await fixture(
    dv('A1:B2', '$J$10', 'showErrorMessage="1"'),
    '',
    body,
    '<row r="10"><c r="J10"><v>99</v></c></row>',
  )
  const result = await apply(bytes, op(true))
  expect(await xml(result.bytes, 2)).toContain("<formula1>'数据'!$J$10</formula1>")
  expect((await readXlsx(result.bytes)).sheets[1]!.extras!.validations![0]!.formula1).toBe(
    "'数据'!$J$10",
  )
})
it('reads native prefix and CDATA through the same parser in host and browser', async () => {
  const rule = dv('A1:B2', '<![CDATA[0]]><!--keep-->', 'showErrorMessage="1" prompt="&amp;#49;"')
    .replaceAll('<data', '<q:data')
    .replaceAll('</data', '</q:data')
    .replaceAll('<formula1>', '<q:formula1>')
    .replaceAll('</formula1>', '</q:formula1>')
  const conditional = cf('A1:B2', '<![CDATA[A1>0]]><!--keep-->')
    .replaceAll('<conditional', '<q:conditional')
    .replaceAll('</conditional', '</q:conditional')
    .replaceAll('<cfRule', '<q:cfRule')
    .replaceAll('</cfRule', '</q:cfRule')
    .replaceAll('<formula>', '<q:formula>')
    .replaceAll('</formula>', '</q:formula>')
  const bytes = await fixture(conditional + rule),
    result = await apply(bytes)
  const before = (await readXlsx(bytes)).sheets[0]!,
    after = (await readXlsx(result.bytes)).sheets[1]!
  expect(before.extras!.validations![0]!.formula1).toBe('0')
  expect(after.extras!.validations![0]!.formula1).toBe('0')
  expect(after.extras!.validations![0]!.prompt).toBe('&#49;')
  expect(after.extras!.cfRules![0]!.formula).toEqual(['E5>0'])
  expect(await xml(result.bytes, 2)).toContain('<q:formula1><![CDATA[0]]><!--keep--></q:formula1>')
})
it('rejects prefixed CDATA stop constraints against actual unchanged values', async () => {
  const rule = dv('A1:B2', '<![CDATA[99]]>', 'showErrorMessage="1"')
    .replaceAll('<data', '<q:data')
    .replaceAll('</data', '</q:data')
    .replaceAll('<formula1>', '<q:formula1>')
    .replaceAll('</formula1>', '</q:formula1>')
  const bytes = await fixture(rule)
  await expect(apply(bytes)).rejects.toThrow(/文档未修改/)
})
it('validates each relative list from its actual sqref anchor after native copy', async () => {
  const cells =
    '<row r="1"><c r="A1" t="inlineStr"><is><t>X</t></is></c><c r="B1" t="inlineStr"><is><t>X</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Z</t></is></c><c r="B2" t="inlineStr"><is><t>Y</t></is></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>Z</t></is></c></row>'
  const rule = dv('A1:A2', 'B1:B2', 'showErrorMessage="1"').replace(
    'type="whole" operator="greaterThan"',
    'type="list"',
  )
  const bytes = await fixture(rule, '', cells)
  const result = await apply(bytes, { ...op(), source: 'A1:B3' })
  expect(result.version).toBe(1)
  expect(await xml(result.bytes, 2)).toContain('<formula1>F5:F6</formula1>')
})
it('keeps complete native bytes through one history step, undo/redo and reopen', async () => {
  const bytes = await fixture(cf('A1:B2') + dv('A1:B2', '0', 'showErrorMessage="1"'))
  const changed = vi.fn<() => void>(),
    handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      changed,
      applyXlsxOpsOnHost,
    )
  await handle.execute('propose_operations', { operations: [op(true)] }, {})
  const saved = handle.currentBytes()
  expect(handle.history()).toEqual({ undo: 1, redo: 0 })
  handle.markSaved()
  expect((await openXlsxForEdit(saved)).view().sheets[1]!.extras!.validations![0]!.range).toBe(
    'E5:F6',
  )
  expect(await handle.undo()).toBe(true)
  expect(handle.currentBytes()).toEqual(bytes)
  expect(await handle.redo()).toBe(true)
  expect(handle.currentBytes()).toEqual(saved)
  expect(handle.isDirty()).toBe(false)
  handle.dispose()
})
it('writes a readable native fixture for root browser acceptance', async () => {
  const features = (
    cf('A1:B2').replace('stopIfTrue="1"', 'stopIfTrue="1" dxfId="0"') +
    dv(
      'A1:B2',
      '0',
      'showErrorMessage="1" showInputMessage="1" promptTitle="验证" prompt="请输入正整数"',
    )
  ).replace(
    /<(\/?)(conditionalFormatting|cfRule|formula|dataValidations|dataValidation|formula1)(?=[\s>])/g,
    '<$1q:$2',
  )
  const zip = await JSZip.loadAsync(
    await fixture(
      features,
      cf('J10', 'J10>0', 7),
      body,
      '<row r="10"><c r="J10"><v>11</v></c></row>',
    ),
  )
  zip.file(
    'xl/styles.xml',
    (
      (await zip.file('xl/styles.xml')?.async('string')) ??
      `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`
    )
      .replace(/<dxfs\b[^>]*(?:\/>|>[\s\S]*?<\/dxfs>)/, '')
      .replace(
        '</styleSheet>',
        '<dxfs count="1"><dxf><font><b/></font><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill></dxf></dxfs></styleSheet>',
      ),
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rIdRuleStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  writeFileSync('/tmp/mimir-xlsx-range-rules-20261017.xlsx', bytes)
  expect((await readXlsx(bytes)).sheets[0]!.extras!.validations).toHaveLength(1)
  const copied = await apply(bytes)
  expect(
    (await readXlsx(copied.bytes)).sheets[1]!.extras!.cfRules!.find(
      (rule) => rule.range === 'E5:F6',
    )!.style!.bold,
  ).toBe(true)
})
