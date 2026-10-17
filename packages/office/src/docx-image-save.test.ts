import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { openDocx, type PmDocJson } from './docx.js'
import { docxImageSaveBaselines } from './docx-image-save.js'

const FIXTURE = new URL(
  '../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
  import.meta.url,
)
const variants = [
  ['missing spPr', ''],
  ['empty spPr', '<pic:spPr bwMode="auto"/>'],
  [
    'spPr without xfrm',
    '<pic:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></pic:spPr>',
  ],
  [
    'self-closing xfrm',
    '<pic:spPr><a:xfrm rot="1800000" flipH="1"/><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>',
  ],
  [
    'normal xfrm',
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:noFill/></pic:spPr>',
  ],
] as const

async function fixture(properties: string) {
  const zip = await JSZip.loadAsync(readFileSync(FIXTURE))
  const xml = await zip.file('word/document.xml')!.async('string')
  zip.file('word/document.xml', xml.replace('</pic:pic>', `${properties}</pic:pic>`))
  return zip.generateAsync({ type: 'uint8array' })
}
function editedImage(content: PmDocJson) {
  const edited = structuredClone(content)
  const node = edited.content!.find(
    (item) => (item.attrs as Record<string, unknown>)?.blockType === 'image',
  )!
  return { edited, attrs: node.attrs as Record<string, unknown> }
}
async function unchangedParts(a: Uint8Array, b: Uint8Array) {
  const [original, saved] = await Promise.all([JSZip.loadAsync(a), JSZip.loadAsync(b)])
  expect(Object.keys(saved.files).toSorted()).toEqual(Object.keys(original.files).toSorted())
  for (const name of Object.keys(original.files).filter((entry) => entry !== 'word/document.xml'))
    expect(await saved.files[name]!.async('uint8array')).toEqual(
      await original.files[name]!.async('uint8array'),
    )
}

describe('DOCX missing picture transform save compatibility', () => {
  it.each(variants)(
    '%s: no-op exact bytes, native transformation, second save and return to original',
    async (_name, properties) => {
      const bytes = await fixture(properties)
      const session = await openDocx(bytes)
      expect(docxImageSaveBaselines(session.content, session.blocks)).toBe(session.blocks)
      expect(await session.save(session.content)).toEqual(bytes)
      const originalBlocks = structuredClone(session.blocks)
      const { edited, attrs } = editedImage(session.content)
      Object.assign(attrs, {
        imageRotDeg: 37,
        imageFlipH: false,
        imageFlipV: true,
        imageWidthPx: 125,
        imageHeightPx: 75,
      })
      const first = await session.save(edited)
      expect((await openDocx(first)).blocks.find((block) => block.type === 'image')).toMatchObject({
        imageRotDeg: 37,
        imageFlipV: true,
        imageWidthPx: 125,
        imageHeightPx: 75,
      })
      const xml = await (await JSZip.loadAsync(first)).file('word/document.xml')!.async('string')
      expect(xml).toContain('rot="2220000"')
      expect(xml).toContain('flipV="1"')
      expect(xml).not.toContain('flipH="1"')
      expect(xml).not.toContain('<a:xfrm/')
      expect(xml).not.toContain('<a:xfrm /')
      for (const block of session.blocks.filter(
        (item) => item.type !== 'image' && item.originalXml,
      ))
        expect(xml).toContain(block.originalXml)
      await unchangedParts(bytes, first)
      Object.assign(attrs, { imageRotDeg: 90, imageFlipH: true, imageFlipV: false })
      const second = await session.save(edited)
      expect((await openDocx(second)).blocks.find((block) => block.type === 'image')).toMatchObject(
        { imageRotDeg: 90, imageFlipH: true },
      )
      await unchangedParts(bytes, second)
      expect(session.blocks).toEqual(originalBlocks)
      expect(await session.save(session.content)).toEqual(bytes)
    },
  )

  it('only seeds a transformed target; size-only edits and ambiguous drawings retain baseline or reject', async () => {
    const session = await openDocx(new Uint8Array(readFileSync(FIXTURE)))
    const { edited, attrs } = editedImage(session.content)
    attrs.imageWidthPx = 123
    expect(docxImageSaveBaselines(edited, session.blocks)).toBe(session.blocks)
    attrs.imageRotDeg = 90
    const original = session.blocks.find((block) => block.type === 'image')!
    for (const originalXml of [
      '<w:p><w:pict/></w:p>',
      `${original.originalXml}${original.originalXml}`,
    ]) {
      const blocks = session.blocks.map((block) =>
        block === original ? { ...block, originalXml } : block,
      )
      expect(() => docxImageSaveBaselines(edited, blocks)).toThrow('绘图结构不支持')
    }
    expect(session.blocks.find((block) => block.type === 'image')!.originalXml).toBe(
      original.originalXml,
    )
  })
})
