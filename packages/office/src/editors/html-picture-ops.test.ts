import { expect, it } from 'vitest'
import { removeBackground, sampleBackgroundColors } from '../../vendor/packages/ui/src/cutout.js'

it('固定上游去背景只移除与边缘相连的背景像素', () => {
  const pixels: number[] = []
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      pixels.push(...(x === 1 && y === 1 ? [255, 0, 0, 255] : [255, 255, 255, 255]))
    }
  }
  const source = new Uint8ClampedArray(pixels)
  const image = { data: source, width: 3, height: 3 }
  const result = removeBackground(image, 0, sampleBackgroundColors(image))
  expect(result.removedCount).toBe(8)
  expect(result.data[3]).toBe(0)
  expect(result.data[(1 * 3 + 1) * 4 + 3]).toBe(255)
  expect(source[3]).toBe(255)
})
