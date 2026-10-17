import { describe, expect, it } from 'vitest'
import { openPptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { pptxGroupPictureFixture } from './pptx-group-picture-test-fixture.js'
import { resolvePptxGroupPicture } from '../pptx-picture-edit.js'
import {
  pictureCropCommit,
  pictureCropToLocal,
  pictureCropToSlide,
  pptxPictureCropGeometry,
} from './pptx-picture-crop.js'
import type { GroupElement, PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
import type { PictureCropPoint, PictureCropViewport } from './pptx-picture-crop.js'
const viewport = { width: 960, height: 720, slideWidth: 9144000, slideHeight: 6858000 }
/** Independent native OOXML corner order; uses EMU throughout until final viewport. */
function nativePoint(
  picture: PictureElement,
  group: GroupElement,
  point: PictureCropPoint,
  vp: PictureCropViewport,
) {
  const p = picture.transform,
    g = group.transform,
    o = p.offset,
    outer = g.offset,
    ch = group.childOffset!
  const a = ((p.rot / 60000) * Math.PI) / 180
  const dx = (point.x / (vp.width / vp.slideWidth) - o.cx / 2) * (p.flipH ? -1 : 1)
  const dy = (point.y / (vp.height / vp.slideHeight) - o.cy / 2) * (p.flipV ? -1 : 1)
  const x =
    (((o.x + o.cx / 2 + dx * Math.cos(a) - dy * Math.sin(a) - ch.x) * outer.cx) / ch.cx -
      outer.cx / 2) *
    (g.flipH ? -1 : 1)
  const y =
    (((o.y + o.cy / 2 + dx * Math.sin(a) + dy * Math.cos(a) - ch.y) * outer.cy) / ch.cy -
      outer.cy / 2) *
    (g.flipV ? -1 : 1)
  const r = ((g.rot / 60000) * Math.PI) / 180
  return {
    x: ((outer.x + outer.cx / 2 + x * Math.cos(r) - y * Math.sin(r)) * vp.width) / vp.slideWidth,
    y: ((outer.y + outer.cy / 2 + x * Math.sin(r) + y * Math.cos(r)) * vp.height) / vp.slideHeight,
  }
}

describe('direct group picture native crop geometry', () => {
  it.each([0, 30, 45, 90, 270])(
    'native source corners and retained pixels with parent %s° at both viewports',
    async (parentRotation) => {
      const fixture = await pptxGroupPictureFixture()
      const opened = await openPptx(fixture.bytes)
      const { parent, picture } = resolvePptxGroupPicture(opened.deck.slides[0]!, fixture.target)
      for (const width of [960, 1440])
        for (const unequal of [false, true])
          for (const parentH of [false, true])
            for (const parentV of [false, true])
              for (const childRotation of [0, 37, 90, 270])
                for (const childH of [false, true])
                  for (const childV of [false, true]) {
                    const vp = { ...viewport, width, height: width * 0.75 }
                    parent.transform = {
                      ...parent.transform,
                      rot: parentRotation * 60000,
                      flipH: parentH,
                      flipV: parentV,
                    }
                    parent.childOffset = {
                      x: 200000,
                      y: 100000,
                      cx: unequal ? 4000000 : 6000000,
                      cy: unequal ? 1500000 : 3000000,
                    }
                    picture.transform = {
                      ...picture.transform,
                      rot: childRotation * 60000,
                      flipH: childH,
                      flipV: childV,
                    }
                    const geometry = pptxPictureCropGeometry(picture, vp, parent)!
                    for (const point of [
                      { x: 0, y: 0 },
                      { x: geometry.frame.w, y: 0 },
                      { x: geometry.frame.w, y: geometry.frame.h },
                      { x: 0, y: geometry.frame.h },
                    ]) {
                      const actual = pictureCropToSlide(geometry, point),
                        expected = nativePoint(picture, parent, point, vp)
                      expect(actual.x).toBeCloseTo(expected.x, 8)
                      expect(actual.y).toBeCloseTo(expected.y, 8)
                      const back = pictureCropToLocal(geometry, actual)
                      expect(back.x).toBeCloseTo(point.x, 8)
                      expect(back.y).toBeCloseTo(point.y, 8)
                    }
                    const frame = {
                      x: geometry.frame.w * 0.2,
                      y: geometry.frame.h * 0.2,
                      w: geometry.frame.w * 0.6,
                      h: geometry.frame.h * 0.6,
                    }
                    const value = pictureCropCommit(geometry, frame)
                    const updated = {
                      ...picture,
                      transform: { ...picture.transform, offset: value.box },
                      srcRect: value.srcRect!,
                    }
                    const after = pptxPictureCropGeometry(updated, vp, parent)!
                    const beforePoint = pictureCropToSlide(geometry, {
                      x: geometry.full.x + geometry.full.w * 0.5,
                      y: geometry.full.y + geometry.full.h * 0.5,
                    })
                    const afterPoint = pictureCropToSlide(after, {
                      x: after.full.x + after.full.w * 0.5,
                      y: after.full.y + after.full.h * 0.5,
                    })
                    const oneEmuProjection = (width / vp.slideWidth) * 4
                    expect(Math.abs(beforePoint.x - afterPoint.x)).toBeLessThan(oneEmuProjection)
                    expect(Math.abs(beforePoint.y - afterPoint.y)).toBeLessThan(oneEmuProjection)
                  }
    },
  )

  it('restores outward source extent and keeps exact no-op native box', async () => {
    const fixture = await pptxGroupPictureFixture()
    const opened = await openPptx(fixture.bytes)
    const { parent, picture } = resolvePptxGroupPicture(opened.deck.slides[0]!, fixture.target)
    const g = pptxPictureCropGeometry(picture, viewport, parent)!
    expect(pictureCropCommit(g, g.frame)).toEqual({
      srcRect: picture.srcRect,
      box: picture.transform.offset,
    })
    const restored = pictureCropCommit(g, g.full)
    expect(restored.srcRect).toBeNull()
    expect(restored.box.cx).toBeGreaterThan(picture.transform.offset.cx)
    expect(restored.box.cy).toBeGreaterThan(picture.transform.offset.cy)
    parent.childOffset!.cx = 0
    expect(pptxPictureCropGeometry(picture, viewport, parent)).toBeNull()
  })
})
