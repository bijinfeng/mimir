import { readFileSync } from 'node:fs'
import JSZip from 'jszip'

export type GroupRenderFixture =
  | 'identity'
  | 'parent45-flip'
  | 'nested'
  | 'child37-flip'
  | 'shear37'
const xfrm = (x: number, y: number, cx: number, cy: number, extra = '') =>
  `<a:xfrm${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
const rect = (id: number, x: number, y: number, color: string, extra = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${color}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, 400000, 200000, extra)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
const group = (id: number, children: string, extra = '', nested = false) =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="组合 &amp; &quot;${id}&quot;"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm${extra}><a:off x="${nested ? 350000 : 2000000}" y="${nested ? 250000 : 1600000}"/><a:ext cx="${nested ? 900000 : 3000000}" cy="${nested ? 500000 : 2000000}"/><a:chOff x="200000" y="100000"/><a:chExt cx="2000000" cy="1000000"/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`

/** Native, independent files for root browser acceptance; no knowledge-base uploads. */
export async function pptxGroupRenderFixture(kind: GroupRenderFixture): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(
    readFileSync(new URL('../tests/fixtures/title-layout.pptx', import.meta.url)),
  )
  const path = 'ppt/slides/slide1.xml'
  const original = await zip.file(path)!.async('string')
  const childExtra =
    kind === 'child37-flip'
      ? ' rot="2220000" flipH="1"'
      : kind === 'shear37'
        ? ' rot="2220000"'
        : ''
  const children =
    rect(3, 300000, 200000, 'FF0000', childExtra) +
    rect(4, 1700000, 200000, '00FF00') +
    rect(5, 300000, 700000, 'FFFF00') +
    rect(6, 1700000, 700000, '0000FF')
  const content =
    kind === 'nested' ? group(7, children, ' rot="5400000" flipV="1"', true) : children
  const outer = group(
    2,
    content,
    kind === 'identity' || kind === 'child37-flip' || kind === 'shear37'
      ? ''
      : ' rot="2700000" flipH="1"',
  )
  const tree = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${outer}</p:spTree>`
  zip.file(path, original.replace(/<p:spTree>[\s\S]*?<\/p:spTree>/, tree))
  zip.file('customXml/mimir-group-render-sentinel.xml', '<sentinel>C0 native untouched</sentinel>')
  return zip.generateAsync({ type: 'uint8array' })
}
