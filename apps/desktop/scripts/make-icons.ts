#!/usr/bin/env node
/**
 * 生成各平台的应用图标（D-091）。
 *
 * ## 产物
 *
 * ```
 * resources/icon.png    1024×1024   通用（Linux / electron-builder 兜底）
 * resources/icon.icns   macOS       打包 dmg / .app
 * resources/icon.ico    Windows     （当前只打 macOS，留着以免将来漏掉）
 * ```
 *
 * 三个都**提交进仓库**：图标是几乎不变的二进制资产，而生成它需要一条
 * 能画图的链路（见下）。这样 `pnpm install` 出来的环境不必装任何东西
 * 就能打包。
 *
 * ## 为什么不用 Electron / rsvg / ImageMagick
 *
 * 走过三条弯路，都实测过：
 *
 *  1. `rsvg-convert` / `convert` / `magick` —— 本机都没有
 *  2. **Electron 的 Chromium 截图**（最直觉的一条）—— 在 Wayland 上不稳：
 *     `data:` URL 在小尺寸时报 `ERR_FAILED`；每个尺寸开一个窗口时 16px 能过、
 *     24px 起报 `UnknownVizError`；复用一个窗口反复 loadFile 第二次就挂。
 *     折腾完还得依赖「本机能起 Electron」，而做图标的人未必有显示环境
 *  3. **`@napi-rs/canvas`** —— 它已经在依赖树里（`pdfjs-dist` 的可选依赖，
 *     Node 侧渲染 PDF 用的），纯原生、不开窗口、不需要显示环境。
 *     它没有 SVG 解析器，但那不影响我们：**图标的路径是写死的**，
 *     直接用 `Path2D` 的 SVG 路径语法画即可，比先解析 SVG 更直接
 *
 * ## 图形来自 favicon，不在这里另抄一份
 *
 * 引号的路径**在这个脚本运行时从 `apps/web/public/favicon.svg` 读**
 * （解析它的 `<path d="…">`）。两处都需要这份几何，抄一份就有两个真相源——
 * 改了一处忘了另一处，两边的图标会慢慢长得不一样，而那种差异没人会主动
 * 去比对。所以 favicon 是**唯一来源**，这里只加「底色与留白」这层
 * 桌面端特有的处理（favicon 是透明底 + 蓝字，要能在任意标签栏上活；
 * 应用图标是品牌蓝底 + 白字，要在一块方寸里立住）。
 *
 * 孔的掏空用 `fill(path, 'evenodd')`，与 favicon 的 `fill-rule="evenodd"`
 * 同一条理由：白圆覆盖方案在别的底色上会露馅。
 *
 * 用法：`pnpm --filter @mimir/desktop icons`
 */

import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `@napi-rs/canvas` 是**本包的 devDependency**（显式声明，不是因为它在别处
 * 恰好也有）。它同时是 pdfjs-dist 的可选依赖，但靠那个传递关系太脆——
 * 哪天 pdfjs 换掉它，这个脚本会以一个难懂的方式失败。
 */
const require = createRequire(import.meta.url)

interface Canvas2D {
  fillStyle: string
  beginPath(): void
  roundRect(x: number, y: number, w: number, h: number, r: number): void
  fill(): void
  fill(path: unknown, rule: 'evenodd'): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
}

interface NapiCanvas {
  createCanvas(
    width: number,
    height: number,
  ): {
    getContext(type: '2d'): Canvas2D
    toBuffer(mime: 'image/png'): Buffer
  }
  Path2D: new (path: string) => unknown
}

const { createCanvas, Path2D } = require('@napi-rs/canvas') as NapiCanvas

const here = dirname(fileURLToPath(import.meta.url))
const resources = join(here, '..', 'resources')

/** 画布边长。各尺寸都由它缩放采样——一次几何、多档输出，不留坐标漂移 */
const BASE = 1024

/** 品牌蓝，与 `apps/web/src/theme/tokens.ts` 的 `colorPrimary` 同值 */
const BRAND = '#1677ff'

/**
 * 引号路径**从 favicon 读**，不在这个脚本里再抄一份。
 *
 * 两个地方都需要这份几何（浏览器标签页用 SVG、桌面图标用 canvas），
 * 抄一份就有两个真相源——改了一处忘了另一处，图标与 favicon 会慢慢长得
 * 不一样，而那种差异没人会主动去比对。所以 `favicon.svg` 是这份路径的
 * **唯一来源**，这里只加「底色与留白」这层桌面端特有的处理。
 *
 * 读不到就抛错而不是退回一个内置的默认路径：那会让「读文件失败」
 * 表现成「图标画出来了但不是最新的」，比直接失败难查得多。
 */
async function readQuotePath(): Promise<string> {
  const favicon = await readFile(join(here, '..', '..', 'web', 'public', 'favicon.svg'), 'utf8')
  // favicon 里只有一个 <path d="…">（两个引号是**一条**路径）
  const match = favicon.match(/<path[^>]*\sd="([^"]+)"/)
  if (!match) {
    throw new Error('favicon.svg 里没找到 <path d="…">——图形来源变了，改这里的解析')
  }
  return match[1]!
}

/**
 * 画一张图标。
 *
 * 几何（1024 画布）：
 *  - 圆角方底铺满，圆角半径 22.4%（Apple 的 squircle 近似）
 *  - 引号缩放到画布的 56% 并居中——macOS / Windows 的惯例是艺术内容
 *    占约 80%，四周要有留白；56% 再加引号自身的形状余量，观感接近那个比例
 *  - 引号原图的视觉中心约 (16.5, 15.2)（不是 16/16：它上下不等高），
 *    用它对齐画布中心而不是用网格中心，否则会偏下一截
 */
function drawIcon(size: number, quotePath: string): Buffer {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, (229 / BASE) * size)
  ctx.fillStyle = BRAND
  ctx.fill()

  const scale = (size / 32) * 0.56
  ctx.translate(size / 2, size / 2)
  ctx.scale(scale, scale)
  ctx.translate(-16.5, -15.2)

  ctx.fillStyle = '#ffffff'
  ctx.fill(new Path2D(quotePath), 'evenodd')

  return canvas.toBuffer('image/png')
}

/* ── ICNS / ICO 容器（自己拼，不为几个字节头引包）──────────── */

/** ICNS 的类型码 → 尺寸。`ic07`–`ic14` 是现代 PNG 载荷，`icp*` 是老的几档 */
const ICNS_TYPES: [string, number][] = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32], // 16@2x
  ['ic12', 64], // 32@2x
  ['ic13', 256], // 128@2x
  ['ic14', 512], // 256@2x
]

function buildIcns(pngs: Map<number, Buffer>): Buffer {
  const blocks: Buffer[] = []
  for (const [type, size] of ICNS_TYPES) {
    const png = pngs.get(size)
    if (!png) continue
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    blocks.push(header, png)
  }

  const body = Buffer.concat(blocks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

/**
 * ICO：头 + 目录项 + 各档 PNG 数据（Vista 起支持 PNG 载荷）。
 *
 * 256 那一档在目录里宽度/高度写 **0**——一个字节装不下 256，这是格式的约定。
 */
function buildIco(pngs: Map<number, Buffer>): Buffer {
  const entries = [16, 24, 32, 48, 64, 128, 256].filter((size) => pngs.has(size))

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  entries.forEach((size, index) => {
    const png = pngs.get(size)!
    const entry = directory.subarray(index * 16, index * 16 + 16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // 调色板数（PNG 载荷无调色板）
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
  })

  return Buffer.concat([header, directory, ...entries.map((size) => pngs.get(size)!)])
}

/* ── 跑 ─────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const quotePath = await readQuotePath()
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  const pngs = new Map<number, Buffer>(sizes.map((size) => [size, drawIcon(size, quotePath)]))

  const icns = buildIcns(pngs)
  const ico = buildIco(pngs)
  const png1024 = pngs.get(1024)!

  await writeFile(join(resources, 'icon.png'), png1024)
  await writeFile(join(resources, 'icon.icns'), icns)
  await writeFile(join(resources, 'icon.ico'), ico)

  console.log('图标已生成：')
  console.log(`  resources/icon.png   ${png1024.length} B（1024×1024）`)
  console.log(`  resources/icon.icns  ${icns.length} B`)
  console.log(`  resources/icon.ico   ${ico.length} B`)
}

void main()
