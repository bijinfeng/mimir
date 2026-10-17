import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { readXlsx } from './xlsx.js'
import { openXlsxForEdit } from './xlsx-edit.js'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const samples = [
  {
    // Exact rich source used in the R3 browser fixture.
    body: '<r><rPr><b/><color theme="4"/></rPr><t xml:space="preserve"> rich &amp; </t></r><r><t><![CDATA[text&literal;]]></t></r>',
    text: ' rich & text&literal;',
  },
  {
    body: '<t xml:space="preserve"> &amp;#49; &#x26;amp; &#x1F600;<![CDATA[&amp;#50; </t><t>fake </si>]]><!--<t>comment</t>-->&#13;tail </t>',
    text: ' &#49; &amp; 😀&amp;#50; </t><t>fake </si>\rtail ',
  },
  {
    body: '<t/><r><rPr><i/></rPr><t><![CDATA[ line1\r\nline2\rline3 ]]></t></r><t/>',
    text: ' line1\nline2\nline3 ',
  },
]
async function fixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL('../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx', import.meta.url),
    ),
  )
  const strings = `<sst xmlns="${MAIN}"><si/>${samples.map((sample) => `<si>${sample.body}</si>`).join('')}<si/></sst>`
  const worksheet = `<worksheet xmlns="${MAIN}"><sheetData>${samples
    .map(
      (sample, index) =>
        `<row r="${index + 1}"><c r="A${index + 1}" t="s"><v>${index + 1}</v></c><c r="B${index + 1}" t="inlineStr"><is>${sample.body}</is></c></row>`,
    )
    .join(
      '',
    )}<row r="4"><c r="A4" t="s"><v>0</v></c><c r="B4" t="s"><v>4</v></c><c r="C4"><v>7</v></c></row></sheetData></worksheet>`
  zip.file('xl/sharedStrings.xml', strings)
  zip.file('xl/worksheets/sheet1.xml', worksheet)
  return { bytes: await zip.generateAsync({ type: 'uint8array' }), strings, worksheet }
}
function displayed(rows: Awaited<ReturnType<typeof readXlsx>>['sheets'][number]['rows']) {
  return rows.slice(0, samples.length).map((row) => row.cells.slice(0, 2).map((c) => c.text))
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    result: Record<string, string> = {}
  for (const [name, item] of Object.entries(zip.files))
    if (!item.dir) result[name] = await item.async('base64')
  return result
}
it('displays shared and inline rich strings as XML character data without exposing CDATA/comments or decoding twice', async () => {
  const { bytes } = await fixture(),
    before = bytes.slice()
  const sheet = (await readXlsx(bytes)).sheets[0]!
  expect(displayed(sheet.rows)).toEqual(samples.map((sample) => [sample.text, sample.text]))
  expect(sheet.rows[3]!.cells.slice(0, 2).map((c) => c.text)).toEqual(['', ''])
  expect(bytes).toEqual(before)
})
it('leaves rich runs, CDATA, spaces and entity tokens exact on no-op save and unrelated edits', async () => {
  const { bytes, strings, worksheet } = await fixture()
  const session = await openXlsxForEdit(bytes)
  expect(displayed(session.view().sheets[0]!.rows)).toEqual(
    samples.map((sample) => [sample.text, sample.text]),
  )
  expect(session.isDirty()).toBe(false)
  expect(await entries(await session.save())).toEqual(await entries(bytes))
  session.setCell({ sheet: 0, row: 4, col: 2 }, 'edited')
  const output = await session.save(),
    zip = await JSZip.loadAsync(output)
  expect(await zip.file('xl/sharedStrings.xml')!.async('string')).toBe(strings)
  const updated = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  expect(updated.slice(0, updated.indexOf('<row r="4">'))).toBe(
    worksheet.slice(0, worksheet.indexOf('<row r="4">')),
  )
  expect(displayed((await readXlsx(output)).sheets[0]!.rows)).toEqual(
    samples.map((sample) => [sample.text, sample.text]),
  )
  const beforeEntries = await entries(bytes),
    afterEntries = await entries(output)
  delete beforeEntries['xl/worksheets/sheet1.xml']
  delete afterEntries['xl/worksheets/sheet1.xml']
  expect(afterEntries).toEqual(beforeEntries)
  session.commit()
  expect(await entries(await session.save())).toEqual(await entries(output))
})

it.each(['&missing;', '&#0;', '&#xD800;', '&#x110000;', 'bad ]]> tail', '<!--bad--comment-->'])(
  'independent: rejects invalid string character data %s without changing native bytes',
  async (body) => {
    for (const kind of ['shared', 'inline']) {
      const { bytes, worksheet } = await fixture()
      const zip = await JSZip.loadAsync(bytes)
      if (kind === 'shared')
        zip.file('xl/sharedStrings.xml', `<sst xmlns="${MAIN}"><si><t>${body}</t></si></sst>`)
      else
        zip.file('xl/worksheets/sheet1.xml', worksheet.replace(samples[0]!.body, `<t>${body}</t>`))
      const malformed = await zip.generateAsync({ type: 'uint8array' })
      const original = malformed.slice()
      await expect(readXlsx(malformed)).rejects.toThrow(/XML|字符|注释/)
      expect(malformed).toEqual(original)
    }
  },
)
