import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { renderDefaultAvatar } from '../../../scripts/generate-default-avatar.mjs'

const require = createRequire(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../desktop/package.json'),
)
const { createCanvas, loadImage } = require('@napi-rs/canvas')

/**
 * PNG 字节在不同平台的 Skia/zlib 版本下不保证一致（macOS 生成的文件在
 * Linux runner 上会差几十字节），但**像素内容**必须一致。这里解码后按
 * 通道容差比较：压缩/抗锯齿的细微差异允许，颜色或形状变化会被抓住。
 */
async function decode(buffer) {
  const image = await loadImage(buffer)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  }
}

test('native avatar PNG stays visually identical to the shared SVG raster', async () => {
  const committed = await readFile(
    new URL('../src/assets/avatar/default-avatar.png', import.meta.url),
  )
  const rendered = await renderDefaultAvatar()
  const [actual, expected] = await Promise.all([decode(rendered), decode(committed)])

  assert.equal(actual.width, 144)
  assert.equal(actual.height, 144)
  assert.equal(expected.width, actual.width)
  assert.equal(expected.height, actual.height)

  let maxDelta = 0
  let sumDelta = 0
  let changed = 0
  const pixels = actual.width * actual.height
  for (let index = 0; index < actual.data.length; index += 4) {
    const delta = Math.max(
      Math.abs(actual.data[index] - expected.data[index]),
      Math.abs(actual.data[index + 1] - expected.data[index + 1]),
      Math.abs(actual.data[index + 2] - expected.data[index + 2]),
      Math.abs(actual.data[index + 3] - expected.data[index + 3]),
    )
    maxDelta = Math.max(maxDelta, delta)
    sumDelta += delta
    if (delta > 16) changed += 1
  }

  // 抗锯齿边缘在 Linux x64 上会出现少量 255 的通道差（1px 轮廓），
  // 但颜色/形状整体变化会覆盖大面积。这里约束平均差与显著差异像素比例。
  assert.ok(sumDelta / pixels <= 2, `平均通道差异 ${sumDelta / pixels} 超过 2`)
  assert.ok(
    changed / pixels <= 0.015,
    `${changed}/${pixels} 个像素差异超过 16（最大 ${maxDelta}）；共享 SVG 或提交的 PNG 已漂移`,
  )
})
