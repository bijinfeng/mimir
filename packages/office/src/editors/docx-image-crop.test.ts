import { describe, expect, it } from 'vitest'
import {
  cropInsets,
  cropRect,
  docxCropPixels,
  moveDocxCrop,
  type DocxCropHandle,
} from './docx-image-crop.js'

describe('DOCX source image crop geometry', () => {
  const rect = { left: 0.1, top: 0.05, right: 0.85, bottom: 0.8 }
  it.each(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as DocxCropHandle[])(
    '%s clamps crossing and outside drag to at least one source pixel',
    (handle) => {
      for (const delta of [-100, 100]) {
        const r = moveDocxCrop(rect, handle, delta, delta, 240, 160)
        expect(r.left).toBeGreaterThanOrEqual(0)
        expect(r.top).toBeGreaterThanOrEqual(0)
        expect(r.right).toBeLessThanOrEqual(1)
        expect(r.bottom).toBeLessThanOrEqual(1)
        expect(r.right - r.left).toBeGreaterThanOrEqual(1 / 240 - 1e-12)
        expect(r.bottom - r.top).toBeGreaterThanOrEqual(1 / 160 - 1e-12)
      }
    },
  )
  it('moves keep-region without changing dimensions; clamps on all four image edges', () => {
    for (const delta of [-100, 100]) {
      const r = moveDocxCrop(rect, 'move', delta, delta, 240, 160)
      expect(r.right - r.left).toBeCloseTo(0.75)
      expect(r.bottom - r.top).toBeCloseTo(0.75)
      expect(r.left).toBeGreaterThanOrEqual(0)
      expect(r.right).toBeLessThanOrEqual(1)
    }
  })
  it('numeric→gesture→numeric retains native inset precision and exact source boundary rounding', () => {
    const initial = { left: 10, top: 5, right: 15, bottom: 20 }
    expect(cropRect(initial)).toEqual(rect)
    const next = cropInsets(moveDocxCrop(cropRect(initial), 'nw', 0.4, 0.45, 240, 160))
    expect(docxCropPixels(next, 240, 160)).toEqual({ x: 120, y: 80, width: 84, height: 48 })
    expect(docxCropPixels({ left: 50, top: 50, right: 0, bottom: 0 }, 240, 160)).toEqual({
      x: 120,
      y: 80,
      width: 120,
      height: 80,
    })
    expect(docxCropPixels({ left: 99.999, top: 99.999, right: 0, bottom: 0 }, 240, 160)).toEqual({
      x: 239,
      y: 159,
      width: 1,
      height: 1,
    })
    expect(() => docxCropPixels({ left: NaN, top: 0, right: 0, bottom: 0 }, 240, 160)).toThrow(
      '保留',
    )
  })
  it.each([
    [20, 1],
    [1, 20],
    [240, 160],
  ])(
    'uses normalized image coords at %s:%s independently of DPR and fitted preview size',
    (width, height) => {
      const one = moveDocxCrop(rect, 'nw', 10 / 298, 2 / 100, width * 100, height * 100)
      const two = moveDocxCrop(rect, 'nw', 20 / 596, 4 / 200, width * 100, height * 100)
      expect(one).toEqual(two)
    },
  )
})
