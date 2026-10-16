import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { readXlsxArchive } from '../../../../packages/office/src/xlsx.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
async function fixture(xml?: string) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
  if (xml) zip.file('xl/worksheets/sheet1.xml', xml)
  zip.file('customXml/keep.xml', 'opaque')
  return zip.generateAsync({ type: 'uint8array' })
}
async function apply(bytes: Uint8Array, op: Record<string, unknown>, version = 0) {
  return applyXlsxOpsOnHost({
    documentId: 'xlsx-1',
    bytes,
    expectedVersion: version,
    ops: [{ ...op, sheetId: 'sheet-1' }],
  })
}
async function extras(bytes: Uint8Array) {
  return (await readXlsxArchive(await BoundedZip.open(bytes))).sheets[0]!.extras!
}
async function unchanged(before: Uint8Array, after: Uint8Array, touched: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  for (const [path, entry] of Object.entries(a.files).filter(
    ([entryPath, part]) => !part.dir && !touched.includes(entryPath),
  ))
    expect(await b.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
}
describe('XLSX hyperlink, note and protection host', () => {
  it('creates external and internal links, changes and removes them without altering cell text or unrelated parts', async () => {
    const bytes = await fixture()
    const one = await apply(bytes, {
      op: 'set_hyperlink',
      address: 'A2',
      target: 'https://example.com/path?a=1&b=2',
    })
    expect((await extras(one.bytes)).hyperlinks.A2).toBe('https://example.com/path?a=1&b=2')
    await unchanged(bytes, one.bytes, one.touchedEntries)
    const two = await apply(
      one.bytes,
      { op: 'set_hyperlink', address: 'A2', target: '#员工表!C3' },
      1,
    )
    expect((await extras(two.bytes)).hyperlinks.A2).toBe('#员工表!C3')
    await unchanged(one.bytes, two.bytes, two.touchedEntries)
    const three = await apply(two.bytes, { op: 'set_hyperlink', address: 'A2', target: null }, 2)
    expect((await extras(three.bytes)).hyperlinks.A2).toBeUndefined()
    expect(
      (await readXlsxArchive(await BoundedZip.open(three.bytes))).sheets[0]!.rows.find(
        (row) => row.number === 2,
      )!.cells[0]!.text,
    ).toBe('姓名')
  })
  it('preserves ordinary note authors and other notes across two saves, XML escapes text, then removes the note', async () => {
    const bytes = await fixture()
    const one = await apply(bytes, {
      op: 'set_note',
      address: 'A2',
      text: '中文批注 & <说明>\n第二行',
    })
    expect((await extras(one.bytes)).notes.A2).toMatchObject({
      author: 'Mimir',
      text: '中文批注 & <说明>\n第二行',
    })
    await unchanged(bytes, one.bytes, one.touchedEntries)
    const two = await apply(one.bytes, { op: 'set_note', address: 'B2', text: '另一个' }, 1)
    expect((await extras(two.bytes)).notes.A2?.text).toContain('第二行')
    expect((await extras(two.bytes)).notes.B2?.text).toBe('另一个')
    await unchanged(one.bytes, two.bytes, two.touchedEntries)
    const three = await apply(two.bytes, { op: 'set_note', address: 'A2', text: null }, 2)
    expect((await extras(three.bytes)).notes.A2).toBeUndefined()
    expect((await extras(three.bytes)).notes.B2?.text).toBe('另一个')
  })
  it('preserves existing note author and literal XLSX escapes, refusing rich text notes', async () => {
    const first = await apply(await fixture(), {
      op: 'set_note',
      address: 'A2',
      text: '原文\r字面_x0041_',
    })
    const zip = await JSZip.loadAsync(first.bytes)
    const path = Object.keys(zip.files).find((entryName) => /comments\d+\.xml$/.test(entryName))!
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace(
        '<author>Mimir</author>',
        '<author>原作者</author>',
      ),
    )
    const authored = await zip.generateAsync({ type: 'uint8array' })
    const second = await apply(authored, { op: 'set_note', address: 'B2', text: '追加' }, 1)
    expect((await extras(second.bytes)).notes.A2).toMatchObject({
      author: '原作者',
      text: '原文\r字面_x0041_',
    })
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace('<text>', '<text><r><t>粗体</t></r>'),
    )
    await expect(
      apply(await zip.generateAsync({ type: 'uint8array' }), {
        op: 'set_note',
        address: 'B2',
        text: '改写',
      }),
    ).rejects.toThrow('富文本')
  })
  it('protects and unprotects a sheet, rejecting content edits while protected and password removal', async () => {
    const bytes = await fixture()
    const one = await apply(bytes, { op: 'protect_sheet', protected: true })
    expect((await extras(one.bytes)).protected).toBe(true)
    await unchanged(bytes, one.bytes, one.touchedEntries)
    await expect(
      apply(one.bytes, { op: 'set_cell', address: 'A2', value: '禁止' }, 1),
    ).rejects.toThrow('保护')
    await expect(
      apply(one.bytes, { op: 'set_note', address: 'A2', text: '禁止' }, 1),
    ).rejects.toThrow('保护')
    const two = await apply(one.bytes, { op: 'protect_sheet', protected: false }, 1)
    expect((await extras(two.bytes)).protected).toBe(false)
    await apply(two.bytes, { op: 'set_cell', address: 'A2', value: '允许' }, 2)
    const zip = await JSZip.loadAsync(one.bytes)
    zip.file(
      'xl/worksheets/sheet1.xml',
      (await zip.file('xl/worksheets/sheet1.xml')!.async('string')).replace(
        '<sheetProtection ',
        '<sheetProtection password="ABCD" ',
      ),
    )
    await expect(
      apply(await zip.generateAsync({ type: 'uint8array' }), {
        op: 'protect_sheet',
        protected: false,
      }),
    ).rejects.toThrow('密码')
  })
  it('rejects unsafe links, out of bounds addresses and overlapping range hyperlinks', async () => {
    const bytes = await fixture()
    await expect(
      apply(bytes, { op: 'set_hyperlink', address: 'A2', target: 'javascript:alert(1)' }),
    ).rejects.toThrow('链接')
    await expect(apply(bytes, { op: 'set_note', address: 'XFE1', text: '越界' })).rejects.toThrow(
      '边界',
    )
    const xml =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/><hyperlinks><hyperlink ref="A2:B3" location="Sheet1!A1"/></hyperlinks></worksheet>'
    await expect(
      apply(await fixture(xml), { op: 'set_hyperlink', address: 'A2', target: null }),
    ).rejects.toThrow('范围超链接')
  })
})
