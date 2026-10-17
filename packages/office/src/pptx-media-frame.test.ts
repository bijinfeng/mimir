import { expect, it } from 'vitest'
import { pptxMediaFrame } from './pptx-media-frame.js'
const slide = { width: 9144000, height: 6858000 }
it('keeps landscape/portrait natural proportions at one pixel per point, shrinking only to fit', () => {
  expect(pptxMediaFrame('video', slide, { width: 320, height: 180 })).toEqual({
    box: { x: 2540000, y: 2286000, cx: 4064000, cy: 2286000 },
    fallback: false,
  })
  const portrait = pptxMediaFrame('video', slide, { width: 180, height: 320 }).box
  expect(portrait.cx / portrait.cy).toBe(180 / 320)
  const large = pptxMediaFrame('video', slide, { width: 3840, height: 2160 }).box
  expect(large.cx).toBe(slide.width)
  expect(large.cy).toBe((slide.width * 9) / 16)
})
it('uses an explicit16:9 fallback fitted to either slide axis', () => {
  expect(pptxMediaFrame('video', slide, null)).toEqual({
    box: { x: 0, y: 857250, cx: 9144000, cy: 5143500 },
    fallback: true,
  })
  const narrow = pptxMediaFrame('video', { width: 4000000, height: 1000000 }, null)
  expect(narrow.box.cy).toBe(1000000)
  expect(narrow.box.cx / narrow.box.cy).toBeCloseTo(16 / 9, 5)
})
it('uses an exact64pt audio square on every slide and accepts a private normalized center', () => {
  const audio = pptxMediaFrame('audio', slide, null, { x: 0.25, y: 0.75 })
  expect(audio.box).toEqual({ x: 1879600, y: 4737100, cx: 812800, cy: 812800 })
  expect(audio.fallback).toBe(false)
  expect(pptxMediaFrame('audio', { width: 100000, height: 100000 }, null).box.cx).toBe(812800)
})
it.each([NaN, Infinity, -1, 1.1])('rejects unsafe center%j without clamping it', (x) => {
  expect(() => pptxMediaFrame('video', slide, null, { x, y: 0.5 })).toThrow('放置位置无效')
})
it('rejects invalid slide and declared natural sizes', () => {
  expect(() => pptxMediaFrame('video', { ...slide, width: 0 }, null)).toThrow('页面')
  expect(() => pptxMediaFrame('video', slide, { width: 40000, height: 10 })).toThrow('原始尺寸')
})
