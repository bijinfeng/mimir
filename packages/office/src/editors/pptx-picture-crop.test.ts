import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptx as openMimirPptx } from '../pptx.js'
import {
  PICTURE_CROP_HANDLES,
  movePictureCropHandle,
  pictureCropCommit,
  pictureCropToLocal,
  pictureCropToSlide,
  pptxPictureCropGeometry,
  pptxPictureCropUnavailableReason,
} from './pptx-picture-crop.js'
const viewport = { width: 960, height: 540, slideWidth: 9144000, slideHeight: 5143500 }
function picture(): PictureElement {
  return {
    type: 'picture',
    id: 'pic',
    mediaRef: 'ppt/media/image1.png',
    transform: {
      offset: { x: 952500, y: 952500, cx: 3810000, cy: 1905000 },
      rot: 0,
      flipH: false,
      flipV: false,
    },
    anchor: { originalXml: '', range: [0, 0], spIndex: 0 },
  }
}
it('recovers exact source extent and restores non-destructively beyond the current picture frame', () => {
  const element = picture()
  element.srcRect = { l: 0.2, t: 0.1, r: 0.3, b: 0.4 }
  const geometry = pptxPictureCropGeometry(element, viewport)!
  expect(geometry.frame).toEqual({ x: 0, y: 0, w: 400, h: 200 })
  expect(geometry.full).toEqual({ x: -160, y: -40, w: 800, h: 400 })
  expect(pictureCropCommit(geometry, geometry.frame)).toEqual({
    srcRect: element.srcRect,
    box: element.transform.offset,
  })
  expect(pictureCropCommit(geometry, geometry.full)).toEqual({
    srcRect: null,
    box: { x: -571500, y: 571500, cx: 7620000, cy: 3810000 },
  })
})
it.each(PICTURE_CROP_HANDLES)(
  'clamps %s grip to full source and prevents crossing opposite edges',
  (handle) => {
    const geometry = pptxPictureCropGeometry(picture(), viewport)!
    for (const sign of [-1, 1]) {
      const frame = movePictureCropHandle(geometry.frame, geometry.full, handle, {
        x: sign * 10000,
        y: sign * 10000,
      })
      expect(frame.x).toBeGreaterThanOrEqual(geometry.full.x)
      expect(frame.y).toBeGreaterThanOrEqual(geometry.full.y)
      expect(frame.x + frame.w).toBeLessThanOrEqual(geometry.full.x + geometry.full.w)
      expect(frame.y + frame.h).toBeLessThanOrEqual(geometry.full.y + geometry.full.h)
      expect(frame.w).toBeGreaterThanOrEqual(12)
      expect(frame.h).toBeGreaterThanOrEqual(12)
      const crop = pictureCropCommit(geometry, frame).srcRect ?? { l: 0, t: 0, r: 0, b: 0 }
      expect(crop.l + crop.r).toBeLessThan(1)
      expect(crop.t + crop.b).toBeLessThan(1)
    }
  },
)
it('supports sub-12px pictures and extreme previous crops without rounding to an empty strip', () => {
  const element = picture()
  element.transform.offset.cx = 10000
  const g = pptxPictureCropGeometry(element, viewport)!
  expect(movePictureCropHandle(g.frame, g.full, 'w', { x: 9000, y: 0 }).w).toBe(g.full.w)
  element.transform.offset.cx = 3810000
  element.srcRect = { l: 0.9999999, r: 0, t: 0, b: 0 }
  const extreme = pptxPictureCropGeometry(element, viewport)!
  const result = pictureCropCommit(
    extreme,
    movePictureCropHandle(extreme.frame, extreme.full, 'w', { x: 10000, y: 0 }),
  ).srcRect!
  expect(result.l + result.r).toBeLessThan(1)
})
describe.each([0, 30, 90, 180, 270])('rotation %s', (rotation) => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'keeps source pixels at the same screen points for flipH=%s/flipV=%s after atomic frame crop',
    (flipH, flipV) => {
      const element = picture()
      element.transform = {
        ...element.transform,
        rot: rotation * 60000,
        flipH: flipH!,
        flipV: flipV!,
      }
      const geometry = pptxPictureCropGeometry(element, viewport)!
      const frame = { x: 40, y: 30, w: 280, h: 130 }
      const before = pictureCropToSlide(geometry, { x: 80, y: 60 })
      expect(pictureCropToLocal(geometry, before).x).toBeCloseTo(80)
      expect(pictureCropToLocal(geometry, before).y).toBeCloseTo(60)
      const result = pictureCropCommit(geometry, frame)
      const after = pptxPictureCropGeometry(
        {
          ...element,
          transform: { ...element.transform, offset: result.box },
          srcRect: result.srcRect!,
        },
        viewport,
      )!
      const screen = pictureCropToSlide(after, { x: 40, y: 30 })
      expect(screen.x).toBeCloseTo(before.x, 3)
      expect(screen.y).toBeCloseTo(before.y, 3)
    },
  )
})
it('folds flat 3D camera mirrors exactly like the renderer and rejects actual projected scenes/media/invalid geometry', () => {
  const element = picture()
  element.scene3d = {
    cameraPreset: 'orthographicFront',
    cameraRot: { lon: 180 * 60000, lat: 0, rev: 30 * 60000 },
  }
  expect(pptxPictureCropGeometry(element, viewport)?.box).toMatchObject({
    flipH: true,
    flipV: false,
    rotationDeg: -30,
  })
  element.scene3d = { cameraPreset: 'orthographicFront' }
  expect(pptxPictureCropGeometry(element, viewport)).not.toBeNull()
  element.scene3d.cameraRot = { lon: 15 * 60000, lat: 0, rev: 0 }
  expect(pptxPictureCropUnavailableReason(element, viewport)).toContain('三维')
  delete element.scene3d
  element.media = { kind: 'video' }
  expect(pptxPictureCropUnavailableReason(element, viewport)).toContain('封面')
  delete element.media
  expect(pptxPictureCropGeometry(element, { ...viewport, width: NaN })).toBeNull()
  element.srcRect = { l: 0.5, r: 0.5, t: 0, b: 0 }
  expect(pptxPictureCropGeometry(element, viewport)).toBeNull()
})
it('writes native srcRect and rotated frame in one actual transaction, reopens twice and preserves all unrelated ZIP parts', async () => {
  const bytes = new Uint8Array(
      readFileSync(new URL('../../tests/fixtures/image-deck.pptx', import.meta.url)),
    ),
    opened = await openPptx(bytes),
    slide = opened.deck.slides[0]!,
    element = slide.elements.find((e): e is PictureElement => e.type === 'picture')!
  expect(element).toBeDefined()
  // Native transforms remain arbitrary and flipped; only the crop and frame change.
  element.transform.rot = 30 * 60000
  element.transform.flipH = true
  element.dirtyTransform = true
  const baseline = await savePptx(opened),
    fresh = await openPptx(baseline),
    pic = fresh.deck.slides[0]!.elements.find((e): e is PictureElement => e.type === 'picture')!,
    g = pptxPictureCropGeometry(pic, {
      ...viewport,
      slideWidth: fresh.deck.size.cx,
      slideHeight: fresh.deck.size.cy,
    })!,
    value = pictureCropCommit(g, {
      x: g.frame.w * 0.1,
      y: g.frame.h * 0.2,
      w: g.frame.w * 0.6,
      h: g.frame.h * 0.5,
    }),
    transaction = runTxn(fresh, {
      isolation: 'atomic',
      ops: [{ op: 'setPictureSrcRect', target: { slide: 0, el: pic.id }, ...value }],
    })
  expect(transaction.applied).toBe(true)
  const saved = await savePptx(fresh),
    reopened = await openMimirPptx(saved),
    native = reopened.slides()[0]!.elements.find((e): e is PictureElement => e.type === 'picture')!
  expect(native.srcRect).toEqual({ l: 0.1, r: 0.3, t: 0.2, b: 0.3 })
  expect(native.transform).toEqual({ ...pic.transform, offset: value.box })
  const originalZip = await JSZip.loadAsync(baseline),
    savedZip = await JSZip.loadAsync(saved),
    changed: string[] = []
  for (const path of Object.keys(originalZip.files).filter((p) => !originalZip.files[p]!.dir)) {
    if (
      Buffer.compare(
        await originalZip.file(path)!.async('nodebuffer'),
        await savedZip.file(path)!.async('nodebuffer'),
      )
    )
      changed.push(path)
  }
  expect(changed).toEqual(['ppt/slides/slide1.xml'])
  const again = await openMimirPptx(await savePptx(await openPptx(saved)))
  expect(again.slides()[0]!.elements.find((e) => e.type === 'picture')?.transform).toEqual(
    native.transform,
  )
})
