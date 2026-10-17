import { expect, it } from 'vitest'
import { pptxGroupPicturePreviewFrame } from './pptx-group-picture-preview.js'

it.each([
  { width: 240, height: 160, available: 298, expectedWidth: 270, expectedHeight: 180 },
  { width: 240, height: 160, available: 210, expectedWidth: 210, expectedHeight: 140 },
  { width: 4000, height: 200, available: 298, expectedWidth: 298, expectedHeight: 14.9 },
  { width: 200, height: 4000, available: 298, expectedWidth: 9, expectedHeight: 180 },
])('fits $width × $height into $availablepx without changing its ratio', (example) => {
  const frame = pptxGroupPicturePreviewFrame(example.width, example.height)
  const width = Math.min(example.available, frame.maxWidth)
  const height = width / frame.aspectRatio
  expect(width).toBeCloseTo(example.expectedWidth)
  expect(height).toBeCloseTo(example.expectedHeight)
  expect(width / height).toBeCloseTo(example.width / example.height)
  expect(height).toBeLessThanOrEqual(180)
})

it.each([
  [0, 200],
  [200, 0],
  [-1, 200],
  [Infinity, 200],
  [200, Infinity],
  [Number.MAX_VALUE, 1],
  [200, NaN],
])('uses a finite fallback for invalid frame dimensions %s × %s', (width, height) => {
  expect(pptxGroupPicturePreviewFrame(width, height)).toEqual({ aspectRatio: 1.5, maxWidth: 270 })
})
