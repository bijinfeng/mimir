import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { applyPptxManualParagraph } from '../services/pptx-manual-paragraph.js'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { elementDurableId } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import {
  pptxManualParagraphSchema,
  type PptxParagraphFormat,
} from '../../../../packages/shared/src/pptx-paragraph.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'

async function source() {
  const opened = await openPptx(
    new Uint8Array(
      readFileSync(
        new URL('../../../../packages/office/tests/fixtures/title-layout.pptx', import.meta.url),
      ),
    ),
  )
  const slide = opened.deck.slides[0]!,
    element = slide.elements[0]!
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'setText',
          target: { slide: 0, el: element.id },
          paragraphs: [
            { runs: [{ text: '第一段', bold: true }] },
            { runs: [{ text: '中段' }, { text: '\n' }, { text: '软换行' }] },
            { runs: [{ text: '末段' }] },
          ],
        },
      ],
    }).applied,
  ).toBe(true)
  const zip = await JSZip.loadAsync(await savePptx(opened))
  let xml = await zip.file(slide.path)!.async('string')
  // Unknown pPr/rPr/endParaRPr and a live field must survive paragraph-only edits.
  xml = xml.replace(/<a:p>[\s\S]*?<\/a:p>/, (paragraph) => {
    const withProperties = paragraph.includes('<a:pPr')
      ? paragraph.replace('<a:pPr', '<a:pPr hangingPunct="0" defTabSz="777777"')
      : paragraph.replace(
          '<a:p>',
          '<a:p><a:pPr hangingPunct="0" defTabSz="777777"><a:tabLst><a:tab pos="333" algn="ctr"/></a:tabLst><a:extLst><a:ext uri="opaque"><m:keep xmlns:m="urn:mimir"/></a:ext></a:extLst></a:pPr>',
        )
    return withProperties
      .replace('<a:rPr', '<a:rPr kumimoji="1"')
      .replace('</a:p>', '<a:endParaRPr lang="zh-CN" dirty="0"/></a:p>')
  })
  xml = xml.replace(
    '<a:t>中段</a:t></a:r>',
    '<a:t>中段</a:t></a:r><a:fld id="{KEEP-FIELD-GUID}" type="slidenum"><a:rPr lang="zh-CN"/><a:t>42</a:t></a:fld>',
  )
  zip.file(slide.path, xml)
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
  const parsed = await openPptx(bytes)
  return { bytes, id: elementDurableId(parsed.deck.slides[0]!.elements[0]!)!, path: slide.path }
}
const imageInfo = (bytes: Uint8Array) => {
  const image = PNG.sync.read(Buffer.from(bytes))
  return { ext: 'png', width: image.width, height: image.height }
}
const apply = (
  bytes: Uint8Array,
  el: string,
  format: PptxParagraphFormat,
  indices = [1],
  signal?: AbortSignal,
) =>
  applyPptxManualParagraph(
    {
      documentId: 'paragraph',
      bytes,
      expectedVersion: 5,
      ops: [{ slide: 0, el, paraIndices: indices, format }],
      signal,
    },
    imageInfo,
  )
const paras = (xml: string) => xml.match(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g)!
const noPPr = (xml: string) => xml.replace(/<a:pPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/g, '')
describe('PPTX manual paragraph scope native save', () => {
  it('changes exactly selected paragraphs, preserving runs/fields/unknown properties and all unrelated package parts across two saves', async () => {
    const { bytes, id, path } = await source(),
      before = await JSZip.loadAsync(bytes)
    const original = await before.file(path)!.async('string')
    const result = await apply(
      bytes,
      id,
      { align: 'right', rtl: true, lineSpacingPct: 150, spaceBeforePt: 7, spaceAfterPt: 8 },
      [0, 1],
    )
    expect(result).toMatchObject({ changed: true, version: 6 })
    expect(result.records).toHaveLength(1)
    const session = await openPptxForEdit(result.bytes)
    await session.save()
    session.commit()
    const final = await JSZip.loadAsync(await session.save()),
      xml = await final.file(path)!.async('string')
    const old = paras(original),
      current = paras(xml)
    expect(current[2]).toBe(old[2])
    for (const index of [0, 1]) {
      expect(noPPr(current[index]!)).toBe(noPPr(old[index]!))
      expect(current[index]).toContain('algn="r"')
      expect(current[index]).toContain('rtl="1"')
    }
    expect(current[0]).toContain('defTabSz="777777"')
    expect(current[0]).toContain('kumimoji="1"')
    expect(current[0]).toContain('<a:tabLst><a:tab pos="333" algn="ctr"/></a:tabLst>')
    expect(current[0]).toContain('<m:keep xmlns:m="urn:mimir"/>')
    expect(current[1]).toContain('{KEEP-FIELD-GUID}')
    for (const entry of Object.values(before.files).filter(
      (file) => !file.dir && file.name !== path,
    ))
      expect(await final.file(entry.name)!.async('uint8array')).toEqual(
        await entry.async('uint8array'),
      )
    const noOp = await apply(
      result.bytes,
      id,
      { align: 'right', rtl: true, lineSpacingPct: 150, spaceBeforePt: 7, spaceAfterPt: 8 },
      [0, 1],
    )
    expect(noOp).toMatchObject({ changed: false, version: 5, bytes: result.bytes })
  })
  it('writes numbering, custom symbols/fonts/color/size/hanging/level while keeping unselected paragraphs and individual glyphs', async () => {
    const { bytes, id } = await source()
    const first = await apply(bytes, id, {
      bullet: 'number',
      numType: 'romanUcPeriod',
      startAt: 4,
      bulletSizePct: 125,
      bulletColor: '#2255AA',
      bulletHangEmu: 171450,
      indentDelta: 1,
    })
    let read = await openPptx(first.bytes),
      text = read.deck.slides[0]!.elements[0]!
    expect(text.type).toBe('text')
    if (text.type !== 'text') throw new Error('text required')
    expect(text.text!.paragraphs[1]).toMatchObject({
      level: 1,
      marL: 342900,
      indent: -171450,
      bullet: {
        type: 'number',
        numType: 'romanUcPeriod',
        startAt: 4,
        sizePct: 125,
        color: '#2255AA',
      },
    })
    expect(text.text!.paragraphs[0]!.bullet?.type).not.toBe('number')
    const resetNumber = await apply(first.bytes, id, { startAt: 1 })
    expect(await apply(resetNumber.bytes, id, { startAt: 1 })).toMatchObject({
      changed: false,
      bytes: resetNumber.bytes,
    })
    const a = await apply(
      first.bytes,
      id,
      { bullet: 'char', bulletChar: '◆', bulletFont: 'Arial' },
      [0],
    )
    const b = await apply(
      a.bytes,
      id,
      { bullet: 'char', bulletChar: '★', bulletFont: 'Arial' },
      [1],
    )
    const font = await apply(b.bytes, id, { bulletFont: 'Georgia' }, [0, 1])
    read = await openPptx(font.bytes)
    text = read.deck.slides[0]!.elements[0]!
    if (text.type !== 'text') throw new Error('text required')
    expect(text.text!.paragraphs.slice(0, 2).map((p) => [p.bullet?.char, p.bullet?.font])).toEqual([
      ['◆', 'Georgia'],
      ['★', 'Georgia'],
    ])
  })
  it('lands an image bullet once on just the selected paragraph and reuses its bytes on repeated apply', async () => {
    const { bytes, id, path } = await source()
    const png = PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 255) } as PNG)
    const format = {
      bullet: 'blip' as const,
      bulletImage: { ext: 'png' as const, base64: png.toString('base64') },
    }
    const result = await apply(bytes, id, format)
    const zip = await JSZip.loadAsync(result.bytes),
      xml = await zip.file(path)!.async('string')
    expect(paras(xml)[1]).toContain('<a:buBlip>')
    expect(paras(xml)[0]).not.toContain('<a:buBlip>')
    const read = await openPptx(result.bytes),
      text = read.deck.slides[0]!.elements[0]!
    if (text.type !== 'text') throw new Error('text required')
    expect(
      await zip.file(text.text!.paragraphs[1]!.bullet!.mediaRef!)!.async('uint8array'),
    ).toEqual(new Uint8Array(png))
    expect(await apply(result.bytes, id, format)).toMatchObject({
      changed: false,
      bytes: result.bytes,
    })
  })
  it('rejects invalid ranges, XML/relationship injection, invalid image and cancellation atomically', async () => {
    const { bytes, id } = await source()
    for (const input of [
      { paraIndices: [0, 0], format: { align: 'right' } },
      { paraIndices: [0], format: { bulletBlip: { mediaRef: 'evil', blipEmbedId: 'rId7' } } },
      { paraIndices: [0], format: { rawXml: '<a:pPr/>' } },
      { paraIndices: [0], format: { bullet: 'blip' } },
      { paraIndices: [0], format: { bullet: 'number', startAt: 0 } },
    ])
      expect(pptxManualParagraphSchema.safeParse({ slide: 0, el: id, ...input }).success).toBe(
        false,
      )
    await expect(apply(bytes, id, { align: 'center' }, [1, 300])).rejects.toThrow(/范围已失效/)
    await expect(apply(bytes, id, { align: 'center' }, [1], AbortSignal.abort())).rejects.toThrow(
      /取消/,
    )
    await expect(
      apply(bytes, id, {
        bullet: 'blip',
        bulletImage: { ext: 'png', base64: Buffer.from('invalid').toString('base64') },
      }),
    ).rejects.toThrow(/图片符号/)
    expect((await openPptx(bytes)).deck.slides).toHaveLength(1)
  })
})
