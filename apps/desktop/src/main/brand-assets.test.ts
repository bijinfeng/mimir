import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { buildBrandAssets, parseBrandSource } from '../../scripts/make-icons'

const root = resolve(import.meta.dirname, '../../../..')

function pngSize(png: Buffer) {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

async function decodePng(png: Buffer) {
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  }
}

/**
 * PNG 字节在 macOS arm64 与 Linux x64 的 Skia/zlib 下不保证一致（同一张图标
 * 会差一百多字节），但**像素内容**必须一致。抗锯齿边缘允许少量通道差；
 * 颜色或形状变化会覆盖大面积像素，被下面两个比例抓住。
 */
async function expectSameRaster(actual: Buffer, committed: Buffer, label: string) {
  const [rendered, expected] = await Promise.all([decodePng(actual), decodePng(committed)])
  expect(rendered.width, `${label}: width`).toBe(expected.width)
  expect(rendered.height, `${label}: height`).toBe(expected.height)

  let sumDelta = 0
  let changed = 0
  const pixels = rendered.width * rendered.height
  for (let index = 0; index < rendered.data.length; index += 4) {
    const renderedAlpha = rendered.data[index + 3]!
    const expectedAlpha = expected.data[index + 3]!
    const alphaDelta = Math.abs(renderedAlpha - expectedAlpha)
    const colorDelta =
      renderedAlpha === 0 && expectedAlpha === 0
        ? 0
        : Math.max(
            Math.abs(rendered.data[index]! - expected.data[index]!),
            Math.abs(rendered.data[index + 1]! - expected.data[index + 1]!),
            Math.abs(rendered.data[index + 2]! - expected.data[index + 2]!),
          )
    const delta = Math.max(alphaDelta, colorDelta)
    sumDelta += delta
    if (delta > 16) changed += 1
  }

  expect(sumDelta / pixels, `${label}: average channel delta`).toBeLessThanOrEqual(2)
  expect(changed / pixels, `${label}: changed pixel ratio`).toBeLessThanOrEqual(0.02)
}

function expectValidIco(ico: Buffer) {
  expect(ico.readUInt16LE(0)).toBe(0)
  expect(ico.readUInt16LE(2)).toBe(1)
  expect(ico.readUInt16LE(4)).toBe(7)
  let icoOffset = 6 + 7 * 16
  for (const [index, size] of [16, 24, 32, 48, 64, 128, 256].entries()) {
    const entry = ico.subarray(6 + index * 16, 22 + index * 16)
    expect(entry[0] || 256).toBe(size)
    expect(entry[1] || 256).toBe(size)
    expect(entry.readUInt16LE(6)).toBe(32)
    expect(entry.readUInt32LE(12)).toBe(icoOffset)
    const length = entry.readUInt32LE(8)
    expect(pngSize(ico.subarray(icoOffset, icoOffset + length))).toEqual([size, size])
    icoOffset += length
  }
  expect(icoOffset).toBe(ico.length)
}

function expectValidIcns(icns: Buffer) {
  expect(icns.toString('ascii', 0, 4)).toBe('icns')
  expect(icns.readUInt32BE(4)).toBe(icns.length)
  let icnsOffset = 8
  for (const [type, size] of [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ] as const) {
    expect(icns.toString('ascii', icnsOffset, icnsOffset + 4)).toBe(type)
    const length = icns.readUInt32BE(icnsOffset + 4)
    expect(pngSize(icns.subarray(icnsOffset + 8, icnsOffset + length))).toEqual([size, size])
    icnsOffset += length
  }
  expect(icnsOffset).toBe(icns.length)
}

describe('single-source brand generation', () => {
  it('rejects unsupported geometry, invalid colors and inconsistent source color', async () => {
    const svg = await readFile(resolve(root, 'assets/brand/mimir-mark.svg'), 'utf8')
    const metadata = JSON.parse(await readFile(resolve(root, 'assets/brand/brand.json'), 'utf8'))
    expect(parseBrandSource(svg, metadata).viewBox).toBe('0 0 64 64')
    for (const invalid of [
      svg.replace('0 0 64 64', '0 0 32 32'),
      svg.replace('</svg>', '<rect width="1"/></svg>'),
      svg.replace('evenodd', 'nonzero'),
      svg.replace('#00834d', '#123456'),
    ])
      expect(() => parseBrandSource(invalid, metadata)).toThrow(/Brand SVG|brand.json/)
    expect(() => parseBrandSource(svg, { colors: { primary: 'green' } })).toThrow(
      /Brand SVG|brand.json/,
    )
  })

  it('reproduces every committed output and validates native container directories', async () => {
    const assets = await buildBrandAssets()
    expect([...assets.keys()].sort()).toEqual(
      [
        'packages/renderer/src/components/brand.generated.ts',
        'apps/web/public/favicon.svg',
        'apps/desktop/public/favicon.svg',
        'apps/desktop/resources/icon.png',
        'apps/desktop/resources/icon.icns',
        'apps/desktop/resources/icon.ico',
        'apps/fnos/ICON.PNG',
        'apps/fnos/ICON_256.PNG',
        'apps/fnos/app/ui/images/icon_64.png',
        'apps/fnos/app/ui/images/icon_256.png',
        'apps/miniapp/src/assets/brand/icon.png',
        'assets/brand/exports/miniapp-avatar.png',
        'assets/brand/exports/app-icon.svg',
      ].sort(),
    )
    expect(await buildBrandAssets()).toEqual(assets)

    // SVG / generated TS 没有 rasterizer 参与，必须逐字节一致
    for (const [path, bytes] of [...assets].filter(
      ([path]) =>
        !path.toLowerCase().endsWith('.png') &&
        !path.toLowerCase().endsWith('.ico') &&
        !path.toLowerCase().endsWith('.icns'),
    )) {
      expect(await readFile(resolve(root, path)), `${path}: regenerate with desktop icons`).toEqual(
        bytes,
      )
    }
    // PNG 由平台 Skia 栅格化，按像素内容比较（见 expectSameRaster）
    for (const [path, bytes] of [...assets].filter(([path]) =>
      path.toLowerCase().endsWith('.png'),
    )) {
      await expectSameRaster(bytes, await readFile(resolve(root, path)), path)
    }

    for (const [path, size] of [
      ['apps/desktop/resources/icon.png', 1024],
      ['apps/fnos/ICON.PNG', 64],
      ['apps/fnos/ICON_256.PNG', 256],
      ['apps/fnos/app/ui/images/icon_64.png', 64],
      ['apps/fnos/app/ui/images/icon_256.png', 256],
      ['apps/miniapp/src/assets/brand/icon.png', 128],
      ['assets/brand/exports/miniapp-avatar.png', 1024],
    ] as const)
      expect(pngSize(assets.get(path)!)).toEqual([size, size])

    // 容器（ICO/ICNS）里的 PNG 压缩字节跨平台不同，但结构必须完整。
    // 生成物与提交物各自校验，防止“生成对了、提交文件损坏”。
    expectValidIco(assets.get('apps/desktop/resources/icon.ico')!)
    expectValidIcns(assets.get('apps/desktop/resources/icon.icns')!)
    expectValidIco(await readFile(resolve(root, 'apps/desktop/resources/icon.ico')))
    expectValidIcns(await readFile(resolve(root, 'apps/desktop/resources/icon.icns')))
  })

  it('keeps the upload avatar square and the white mark inside a circular mask', async () => {
    const assets = await buildBrandAssets()
    const canvas = createCanvas(1024, 1024)
    const context = canvas.getContext('2d')
    context.drawImage(await loadImage(assets.get('assets/brand/exports/miniapp-avatar.png')!), 0, 0)
    expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([0, 131, 77, 255])
    const pixels = context.getImageData(0, 0, 1024, 1024).data
    let whiteCount = 0
    let maxRadius = 0
    for (let y = 0; y < 1024; y++)
      for (let x = 0; x < 1024; x++) {
        const offset = (y * 1024 + x) * 4
        if (pixels[offset]! > 240 && pixels[offset + 1]! > 240 && pixels[offset + 2]! > 240) {
          whiteCount++
          maxRadius = Math.max(maxRadius, Math.hypot(x - 512, y - 512))
        }
      }
    expect(whiteCount).toBeGreaterThan(100_000)
    expect(maxRadius).toBeLessThan(480)
    // The eye is real negative space, showing the green tile through it.
    expect([...context.getImageData(667, 328, 1, 1).data]).toEqual([0, 131, 77, 255])
  })
})
