import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import {
  openPptx,
  savePptx,
  elementDurableId,
  groupChildDurableId,
  groupChildSlices,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'

/** Actual native bytes for component/history tests and the browser acceptance fixture. */
export async function pptxGroupPictureFixture() {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures')
  const images = await JSZip.loadAsync(readFileSync(resolve(directory, 'image-deck.pptx')))
  const image = await images.file('ppt/media/image1.png')!.async('uint8array')
  const opened = await openPptx(
    new Uint8Array(readFileSync(resolve(directory, 'title-layout.pptx'))),
  )
  const added = runTxn(opened, {
    ops: [
      {
        op: 'addElement',
        target: { slide: 0 },
        kind: 'rect',
        offset: { x: 300000, y: 400000, cx: 1400000, cy: 900000 },
        paragraphs: [{ runs: [{ text: '不应改变的兄弟对象' }] }],
      },
      ...[0, 1].map((index) => ({
        op: 'addPicture',
        target: { slide: 0 },
        bytes: image,
        ext: 'png',
        offset: { x: 2000000 + index * 1700000, y: 600000, cx: 1200000, cy: 800000 },
      })),
    ],
  })
  if (!added.applied) throw new Error('Unable to create picture fixture')
  const refs = opened.deck.slides[0]!.elements.slice(-3).map((element) =>
    elementDurableId(element)!,
  )
  if (
    !runTxn(opened, {
      ops: [
        { op: 'groupElements', target: { slide: 0 }, els: refs.slice(0, 2) },
        { op: 'duplicateSlide', target: { slide: 0 } },
      ],
    }).applied
  )
    throw new Error('Unable to group fixture')
  const slide = opened.deck.slides[0]!
  const group = slide.elements.find((element) => element.type === 'group')!
  if (group.type !== 'group') throw new Error('Missing fixture group')
  const picture = group.children.find((element) => element.type === 'picture')!
  const slice = groupChildSlices(group.anchor.originalXml).find(
    (child) => child.nvId === picture.nvId,
  )!
  const pictureXml = slice.xml
    .replace(/(<p:cNvPr\b[^>]*\bname=")[^"]*"/, '$1产品图片"')
    .replace(/<a:blip\b([^>]*?)\/>/, '<a:blip$1><a:alphaModFix amt="37000"/></a:blip>')
    .replace('</p:blipFill>', '<a:srcRect l="10000" t="5000" r="15000" b="20000"/></p:blipFill>')
    .replace(
      '</p:spPr>',
      '<a:ln w="25400"><a:solidFill><a:srgbClr val="987654"/></a:solidFill><a:prstDash val="dash"/></a:ln><a:effectLst><a:outerShdw blurRad="25000" dist="10000" dir="5400000"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst></p:spPr>',
    )
  const parentXfrm =
    '<a:xfrm rot="2700000" flipH="1"><a:off x="1200000" y="700000"/><a:ext cx="6000000" cy="3000000"/><a:chOff x="200000" y="100000"/><a:chExt cx="4000000" cy="1500000"/></a:xfrm>'
  const groupXml = group.anchor.originalXml
    .replace(slice.xml, pictureXml)
    .replace(/(<p:cNvPr\b[^>]*\bname=")[^"]*"/, '$1组合图片验收"')
    .replace(/(<p:grpSpPr>)\s*<a:xfrm[\s\S]*?<\/a:xfrm>/, `$1${parentXfrm}`)
    .replace('</p:grpSpPr>', '</p:grpSpPr><!-- untouched-group-sentinel-20261017 -->')
  const zip = await JSZip.loadAsync(await savePptx(opened))
  zip.file(
    slide.path,
    (await zip.file(slide.path)!.async('string')).replace(group.anchor.originalXml, groupXml),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    bytes,
    image,
    target: {
      slide: 0,
      group: elementDurableId(group)!,
      elementId: groupChildDurableId(group, picture)!,
    },
  }
}
