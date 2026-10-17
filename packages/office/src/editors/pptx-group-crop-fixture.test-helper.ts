import JSZip from 'jszip'
import { pptxGroupPictureFixture } from './pptx-group-picture-test-fixture.js'
import { openPptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { resolvePptxGroupPicture } from '../pptx-picture-edit.js'

// Deterministic 200×120 RGBA grid, four colors, lower-left alpha128; no decoder dependency.
const grid =
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAAB4CAYAAAC3kr3rAAADdklEQVR4nO3bMVLDUBQEwX9EjsTxiLkQBHZoSKSgXTuvSoSdeFaKOD9d1/155/H33PfkXfbO17ntybv4vEMwa54czJrXQEBPDmbNayCgJwez5jUQ0JODWfMaCOjJwax5DQT05GDWvAYCenIwa14DAT05mDWvgYCeHMya10BATw5mzWsgoCcHs+Y1ENCTg1nzGgjoycGseQ0E9ORg1rwGAnpyMGteAwE9OZg1r4GAnhzMmtdAQE8OZs17/sJd1726viCgJ79R17wGAnpyMGteAwE9OZg1r4GAnhzMmtdAQE8OZs1rIKAnB7PmNRDQk4NZ8xoI6MnBrHkNBPTkYNa8BgJ6cjBrXgMBPTmYNa+BgJ4czJrXQEBPDmbNayCgJwez5jUQ0JODWfMaCOjJwax5DQT05GDWvAYCenIwa14DAT05mDXv+Qt3Xffq+oKAnvxGXfMaCOjJwax5DQT05GDWvAYCenIwa14DAT05mDWvgYCeHMya10BATw5mzWsgoCcHs+Y1ENCTg1nzGgjoycGseQ0E9ORg1rwGAnpyMGteAwE9OZg1r4GAnhzMmtdAQE8OZs1rIKAnB7PmNRDQk4NZ8xoI6MnBrHkNBPTkYNa85y/cdd2rewzk+3ze9uRd9s7HfU/execdglnz5GDWvAYCenIwa14DAT05mDWvgYCeHMya10BATw5mzWsgoCcHs+Y1ENCTg1nzGgjoycGseQ0E9ORg1rwGAnpyMGteAwE9OZg1r4GAnhzMmtdAQE8OZs1rIKAnB7PmNRDQk4NZ8xoI6MnBrHkNBPTkYNa8BgJ6cjBrXv+T3nX/XF8Q0JPfqGteAwE9OZg1r4GAnhzMmtdAQE8OZs1rIKAnB7PmNRDQk4NZ8xoI6MnBrHkNBPTkYNa8BgJ6cjBrXgMBPTmYNa+BgJ4czJrXQEBPDmbNayCgJwez5jUQ0JODWfMaCOjJwax5DQT05GDWvAYCenIwa14DAT05mDWvgYCeHMya1/+kd90/1xcE9OQ36prXQEBPDmbNayCgJwez5jUQ0JODWfMaCOjJwax5DQT05GDWvAYCenIwa14DAT05mDWvgYCeHMya10BATw5mzWsgoCcHs+Y1ENCTg1nzGgjoycGseQ0E9ORg1rwGAnpyMGteAwE9OZg1r4GAnhzMmtdAQE8OZs1rIKAnB7Pm/QLTSPMorlcmmQAAAABJRU5ErkJggg=='
export type GroupCropFixtureKind = 'anisotropic37' | 'quarter90' | 'identity' | 'flat-camera'
export async function pptxGroupCropFixture(kind: GroupCropFixtureKind = 'anisotropic37') {
  const fixture = await pptxGroupPictureFixture(),
    zip = await JSZip.loadAsync(fixture.bytes)
  const opened = await openPptx(fixture.bytes)
  const slide = opened.deck.slides[0]!
  const { picture, xml: originalPicture } = resolvePptxGroupPicture(slide, fixture.target)
  zip.file(picture.mediaRef, Buffer.from(grid, 'base64'))
  const xml = await zip.file(slide.path)!.async('string')
  const rotation = kind === 'identity' ? 0 : kind === 'quarter90' ? 90 : 37
  let target = originalPicture
    .replace(
      /<a:xfrm\b[^>]*>/,
      `<a:xfrm rot="${rotation * 60000}" flipV="1" xmlns:c1="urn:mimir:crop-test" c1:keep="yes">`,
    )
    .replace(/<a:ln\b[\s\S]*?<\/a:ln>/, '')
    .replace(/<a:effectLst>[\s\S]*?<\/a:effectLst>/, '')
  if (kind === 'flat-camera')
    target = target.replace(
      '</p:spPr>',
      '<a:scene3d><a:camera prst="orthographicFront"><a:rot lat="0" lon="10800000" rev="1800000"/></a:camera><a:lightRig rig="threePt" dir="t"/></a:scene3d></p:spPr>',
    )
  zip.file(slide.path, xml.replace(originalPicture, target))
  zip.file('customXml/mimir-c1-sentinel.xml', '<sentinel>native crop untouched</sentinel>')
  return {
    ...fixture,
    image: new Uint8Array(Buffer.from(grid, 'base64')),
    bytes: await zip.generateAsync({ type: 'uint8array' }),
  }
}
