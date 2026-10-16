import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { editableElements, openPptxForEdit } from './pptx.js'
import {
  editPptxTextValue,
  formatPptxTextRange,
  normalizePptxTextSelection,
  pptxSelectionRuns,
  pptxTextValue,
} from './pptx-text-range.js'
import type { Paragraph } from '../vendor/packages/pptx-engine/src/types.js'
const FIELD = '{11111111-2222-3333-4444-555555555555}'
const RPR =
  '<a:rPr sz="2400" lang="en-US" dirty="0"><a:latin typeface="Arial"/><a:extLst><a:ext uri="KEEP-RUN"><z:custom xmlns:z="urn:mimir:test" val="original"/></a:ext></a:extLst></a:rPr>'
const PPR =
  '<a:pPr algn="ctr" marL="12345"><a:tabLst><a:tab pos="23456" algn="r"/></a:tabLst><a:defRPr sz="2400"/><a:extLst><a:ext uri="KEEP-PARAGRAPH"/></a:extLst></a:pPr>'
async function fixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(new URL('../tests/fixtures/formatted-text.pptx', import.meta.url)),
  )
  let xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  xml = xml.replace(
    /<p:txBody\b[^>]*>[\s\S]*?<\/p:txBody>/,
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p>${PPR}<a:r><a:rPr b="1" sz="3600"/><a:t>Label: </a:t></a:r><a:r>${RPR.replace('<a:extLst>', '<a:hlinkClick r:id="rId77" tooltip="original link"/><a:extLst>')}<a:t>link</a:t></a:r><a:br><a:rPr lang="ja-JP"/></a:br><a:r>${RPR}<a:t>Tail</a:t></a:r><a:fld id="${FIELD}" type="slidenum"><a:rPr sz="2000"/><a:t>1</a:t></a:fld><a:endParaRPr lang="zh-CN"/></a:p><a:p><a:pPr algn="r"/><a:r>${RPR}<a:t>Other🚀</a:t></a:r></a:p></p:txBody>`,
  )
  zip.file('ppt/slides/slide1.xml', xml)
  const rel = zip.file('ppt/slides/_rels/slide1.xml.rels')
  const relXml = rel
    ? await rel.async('string')
    : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    relXml.replace(
      '</Relationships>',
      '<Relationship Id="rId77" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/keep" TargetMode="External"/></Relationships>',
    ),
  )
  return zip.generateAsync({ type: 'uint8array' })
}
async function slideXml(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file('ppt/slides/slide1.xml')!.async('string')
}
function target(session: Awaited<ReturnType<typeof openPptxForEdit>>) {
  return editableElements(session.slides()[0]!)[0]!
}
describe('PPTX native character-range edits', () => {
  it('preserves split rPr, links, breaks, pPr and field GUID through two saves and checkpoint history', async () => {
    const original = await fixture()
    const session = await openPptxForEdit(original)
    let el = target(session)
    const before = session.checkpoint()
    const originalText = pptxTextValue(el.text!.paragraphs)
    const start = originalText.indexOf('link') + 1
    expect(
      session.setText(
        0,
        el.id,
        formatPptxTextRange(el.text!.paragraphs, { start, end: start + 2 }, { italic: true }),
      ),
    ).toBe(true)
    const first = await session.save()
    session.commit()
    const xml = await slideXml(first)
    expect(xml).toContain('<a:t>l</a:t>')
    expect(xml).toContain('<a:t>in</a:t>')
    expect(xml).toContain('<a:t>k</a:t>')
    expect(xml.match(/KEEP-RUN/g)?.length).toBe(5)
    expect(xml).toContain(PPR)
    expect(xml).toContain(`<a:fld id="${FIELD}" type="slidenum">`)
    expect(xml).toContain('<a:br><a:rPr lang="ja-JP"/></a:br>')
    expect(xml.match(/r:id="rId77"/g)?.length).toBe(3)
    let reopened = await openPptxForEdit(first)
    const runs = target(reopened).text!.paragraphs[0]!.runs
    expect(runs.filter((r) => r.italic).map((r) => r.text)).toEqual(['in'])
    expect(
      runs
        .filter((r) => r.hyperlink)
        .map((r) => r.text)
        .join(''),
    ).toBe('link')
    const after = session.checkpoint()
    el = target(session)
    session.setText(
      0,
      el.id,
      editPptxTextValue(el.text!.paragraphs, originalText.replace('Tail', 'Tail!')),
    )
    const second = await session.save()
    session.commit()
    expect(await slideXml(second)).toContain('<a:t>Tail!</a:t>')
    expect(await slideXml(second)).toContain(`<a:fld id="${FIELD}" type="slidenum">`)
    reopened = await openPptxForEdit(second)
    expect(pptxTextValue(target(reopened).text!.paragraphs)).toBe(
      originalText.replace('Tail', 'Tail!'),
    )
    expect(target(reopened).text!.paragraphs[0]!.runs.find((r) => r.text === 'in')?.italic).toBe(
      true,
    )
    session.restore(before, { forceDirty: true })
    expect(await slideXml(await session.save())).not.toContain('<a:t>in</a:t>')
    session.commit()
    session.restore(after, { forceDirty: true })
    expect(await slideXml(await session.save())).toContain('<a:t>in</a:t>')
    session.commit()
    const a = await JSZip.loadAsync(original)
    const b = await JSZip.loadAsync(second)
    for (const name of Object.keys(a.files).filter(
      (n) => !n.endsWith('/') && n !== 'ppt/slides/slide1.xml',
    ))
      expect(await b.file(name)!.async('uint8array')).toEqual(
        await a.file(name)!.async('uint8array'),
      )
  })
  it('formats a multi-paragraph range and preserves unaffected runs', async () => {
    const session = await openPptxForEdit(await fixture())
    const el = target(session)
    const text = pptxTextValue(el.text!.paragraphs)
    session.setText(
      0,
      el.id,
      formatPptxTextRange(
        el.text!.paragraphs,
        { start: text.indexOf('Tail') + 1, end: text.indexOf('Other') + 3 },
        { color: '#FF0000' },
      ),
    )
    const next = target(await openPptxForEdit(await session.save())).text!.paragraphs
    expect(next[0]!.runs.find((r) => r.text === 'Label: ')?.color).not.toBe('#FF0000')
    expect(next[0]!.runs.find((r) => r.text === 'ail')?.color).toBe('#FF0000')
    expect(next[1]!.runs.find((r) => r.text === 'Oth')?.color).toBe('#FF0000')
    expect(next[1]!.runs.find((r) => r.text === 'er🚀')?.color).not.toBe('#FF0000')
    expect(pptxTextValue(next)).toBe(text)
  })
  it('replaces partial multi-paragraph text without flattening suffix or copying field identity', async () => {
    const session = await openPptxForEdit(await fixture())
    let el = target(session)
    const text = pptxTextValue(el.text!.paragraphs)
    const next =
      text.slice(0, text.indexOf('link') + 1) + 'NEW\nBODY' + text.slice(text.indexOf('Other') + 2)
    session.setText(0, el.id, editPptxTextValue(el.text!.paragraphs, next, { underline: true }))
    const first = await session.save()
    session.commit()
    expect(pptxTextValue(target(await openPptxForEdit(first)).text!.paragraphs)).toBe(next)
    const xml = await slideXml(first)
    expect(xml).toContain('<a:t>her🚀</a:t>')
    expect(xml).toContain('KEEP-RUN')
    expect(xml).not.toContain(FIELD)
    el = target(session)
    session.setText(0, el.id, editPptxTextValue(el.text!.paragraphs, next + '!'))
    expect(
      pptxTextValue(target(await openPptxForEdit(await session.save())).text!.paragraphs),
    ).toBe(next + '!')
  })
  it('keeps field formatting atomic with the original GUID', async () => {
    const session = await openPptxForEdit(await fixture())
    const el = target(session)
    const at = pptxTextValue(el.text!.paragraphs).indexOf('1')
    session.setText(
      0,
      el.id,
      formatPptxTextRange(el.text!.paragraphs, { start: at, end: at + 1 }, { bold: true }),
    )
    const xml = await slideXml(await session.save())
    expect(xml.match(/<a:fld /g)?.length).toBe(1)
    expect(xml).toContain(`<a:fld id="${FIELD}" type="slidenum"><a:rPr b="1" sz="2000"/>`)
  })
  it('supports caret marks and soft breaks without losing next-edit source mapping', async () => {
    const session = await openPptxForEdit(await fixture())
    let el = target(session)
    let value = pptxTextValue(el.text!.paragraphs)
    const at = value.indexOf('Tail') + 2
    value = value.slice(0, at) + '\n' + value.slice(at)
    session.setText(0, el.id, editPptxTextValue(el.text!.paragraphs, value, { italic: true }, true))
    expect(target(session).text!.paragraphs).toHaveLength(2)
    el = target(session)
    session.setText(
      0,
      el.id,
      editPptxTextValue(el.text!.paragraphs, value.replace('Other', 'OTHER')),
    )
    const reopened = await openPptxForEdit(await session.save())
    expect(pptxTextValue(target(reopened).text!.paragraphs)).toBe(value.replace('Other', 'OTHER'))
    expect(target(reopened).text!.paragraphs).toHaveLength(2)
  })
  it('rejects stale provenance atomically and keeps no-op formatting clean', async () => {
    const session = await openPptxForEdit(await fixture())
    let el = target(session)
    const stale = formatPptxTextRange(el.text!.paragraphs, { start: 0, end: 2 }, { italic: true })
    session.setText(
      0,
      el.id,
      formatPptxTextRange(el.text!.paragraphs, { start: 0, end: 2 }, { bold: true }),
    )
    expect(session.hasChanges()).toBe(false)
    el = target(session)
    session.setText(
      0,
      el.id,
      editPptxTextValue(el.text!.paragraphs, 'X' + pptxTextValue(el.text!.paragraphs)),
    )
    const checkpoint = session.checkpoint()
    expect(() => session.setText(0, el.id, stale)).toThrow('过期')
    expect(session.checkpoint()).toEqual(checkpoint)
  })
  it('uses the actual caret when repeated text makes a plain string diff ambiguous', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    zip.file(
      'ppt/slides/slide1.xml',
      xml.replace(
        /<p:txBody[\s\S]*?<\/p:txBody>/,
        '<p:txBody><a:bodyPr/><a:p><a:r><a:rPr b="1" sz="3600"/><a:t>aa</a:t></a:r><a:r><a:rPr sz="2400"/><a:t>aa</a:t></a:r></a:p></p:txBody>',
      ),
    )
    const session = await openPptxForEdit(await zip.generateAsync({ type: 'uint8array' }))
    let el = target(session)
    session.setText(
      0,
      el.id,
      editPptxTextValue(el.text!.paragraphs, 'aaaaa', undefined, false, { start: 2, end: 2 }),
    )
    let reopened = target(await openPptxForEdit(await session.save()))
    expect(reopened.text!.paragraphs[0]!.runs.map((r) => [r.text, r.fontSize])).toEqual([
      ['aaa', 36],
      ['aa', 24],
    ])
    session.commit()
    el = target(session)
    session.setText(
      0,
      el.id,
      editPptxTextValue(
        el.text!.paragraphs,
        'aaaa',
        undefined,
        false,
        { start: 2, end: 2 },
        'deleteContentBackward',
      ),
    )
    reopened = target(await openPptxForEdit(await session.save()))
    expect(reopened.text!.paragraphs[0]!.runs.map((r) => [r.text, r.fontSize])).toEqual([
      ['aa', 36],
      ['aa', 24],
    ])
  })
  it('can clear, save, reopen and type into a genuinely empty native paragraph', async () => {
    const session = await openPptxForEdit(await fixture())
    let el = target(session)
    session.setText(0, el.id, editPptxTextValue(el.text!.paragraphs, ''))
    const bytes = await session.save()
    session.commit()
    const reopened = await openPptxForEdit(bytes)
    el = target(reopened)
    reopened.setText(0, el.id, editPptxTextValue(el.text!.paragraphs, 'New text'))
    expect(
      pptxTextValue(target(await openPptxForEdit(await reopened.save())).text!.paragraphs),
    ).toBe('New text')
  })
  it('uses browser UTF16 offsets without splitting emoji and reports current caret/mixed runs', () => {
    const p: Paragraph[] = [
      {
        runs: [
          { text: 'A🚀', bold: true },
          { text: 'B', bold: false },
        ],
      },
      { runs: [{ text: 'C', italic: true }] },
    ]
    expect(normalizePptxTextSelection(p, { start: 2, end: 3 })).toMatchObject({ start: 1, end: 3 })
    expect(
      formatPptxTextRange(p, { start: 2, end: 3 }, { italic: true })[0]!.runs.map((r) => r.text),
    ).toEqual(['A', '🚀', 'B'])
    expect(pptxSelectionRuns(p, { start: 3, end: 3 })[0]?.bold).toBe(true)
    expect(pptxSelectionRuns(p, { start: 5, end: 5 })[0]?.italic).toBe(true)
    expect(pptxSelectionRuns(p, { start: 1, end: 4 }).map((r) => r.bold)).toEqual([true, false])
  })
})
