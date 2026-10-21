#!/usr/bin/env node
/**
 * Single-source brand assets for web, desktop, fnOS and the miniapp.
 * Edit assets/brand/mimir-mark.svg / brand.json, then run:
 * pnpm --filter @mimir/desktop icons
 * PNGs are rasterized directly at each target resolution. Generated files are committed.
 */
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { createCanvas, Path2D } = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')
const here = dirname(fileURLToPath(import.meta.url))
const repository = resolve(here, '../../..')

interface BrandColors {
  primary: string
  inverse: string
  onDark: string
}
interface BrandSource {
  path: string
  viewBox: string
  colors: BrandColors
}

/** Deliberately narrow SVG contract: reject extra shapes instead of silently dropping them. */
export function parseBrandSource(svg: string, metadata: unknown): BrandSource {
  const match = svg
    .trim()
    .match(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="(0 0 64 64)"><path fill="(#[0-9a-fA-F]{6})" fill-rule="evenodd" d="([^"]+)"\/><\/svg>$/,
    )
  if (!match || !/^[Mm][0-9.,\sMmLlHhVvCcSsQqTtAaZz+-]+$/.test(match[3]!)) {
    throw new Error('Brand SVG must contain one evenodd path in a 64×64 viewBox')
  }
  const colors = (metadata as { colors?: BrandColors } | null)?.colors
  if (
    !colors ||
    !['primary', 'inverse', 'onDark'].every((key) =>
      /^#[0-9a-fA-F]{6}$/.test(colors[key as keyof BrandColors] ?? ''),
    )
  ) {
    throw new Error('brand.json requires primary, inverse and onDark hex colors')
  }
  if (colors.primary.toLowerCase() !== match[2]!.toLowerCase()) {
    throw new Error('Brand SVG fill and brand.json primary color must match')
  }
  return { path: match[3]!, viewBox: match[1]!, colors }
}

function drawIcon(size: number, source: BrandSource, rounded: boolean, padding: number): Buffer {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, rounded ? (229 / 1024) * size : 0)
  ctx.fillStyle = source.colors.primary
  ctx.fill()
  const scale = (size / 64) * padding
  ctx.translate(size / 2, size / 2)
  ctx.scale(scale, scale)
  ctx.translate(-32, -32)
  ctx.fillStyle = source.colors.inverse
  ctx.fill(new Path2D(source.path), 'evenodd')
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

/** Build bytes without writing, so the same pipeline can verify every committed asset. */
export async function buildBrandAssets(root = repository): Promise<Map<string, Buffer>> {
  const source = parseBrandSource(
    await readFile(join(root, 'assets/brand/mimir-mark.svg'), 'utf8'),
    JSON.parse(await readFile(join(root, 'assets/brand/brand.json'), 'utf8')),
  )
  const assets = new Map<string, Buffer>()
  const put = (path: string, value: string | Buffer) => assets.set(path, Buffer.from(value))
  const generated = '// Generated by apps/desktop/scripts/make-icons.ts. Do not edit.\n'
  put(
    'packages/renderer/src/components/brand.generated.ts',
    generated +
      `export const BRAND_VIEW_BOX = '${source.viewBox}'\n` +
      `export const BRAND_PATH =\n  '${source.path}'\n` +
      `export const BRAND_COLORS = {\n  primary: '${source.colors.primary}',\n  inverse: '${source.colors.inverse}',\n  onDark: '${source.colors.onDark}',\n} as const\n`,
  )
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="${source.viewBox}">
  <!-- Generated from assets/brand/mimir-mark.svg. -->
  <style>
    path { fill: ${source.colors.primary} }
    @media (prefers-color-scheme: dark) { path { fill: ${source.colors.onDark} } }
  </style>
  <path fill-rule="evenodd" clip-rule="evenodd" d="${source.path}"/>
</svg>
`
  for (const app of ['web', 'desktop']) put(`apps/${app}/public/favicon.svg`, favicon)
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  // Preserve the desktop resource contract: 22.4% rounded tile and .82 mark scale.
  const pngs = new Map(sizes.map((size) => [size, drawIcon(size, source, true, 0.82)]))
  put('apps/desktop/resources/icon.png', pngs.get(1024)!)
  put('apps/desktop/resources/icon.icns', buildIcns(pngs))
  put('apps/desktop/resources/icon.ico', buildIco(pngs))
  for (const [path, size] of [
    ['apps/fnos/ICON.PNG', 64],
    ['apps/fnos/ICON_256.PNG', 256],
    ['apps/fnos/app/ui/images/icon_64.png', 64],
    ['apps/fnos/app/ui/images/icon_256.png', 256],
  ] as const)
    put(path, pngs.get(size)!)
  // Miniapp Image is cropped by its UI container. Avatar uploads need a full square.
  put('apps/miniapp/src/assets/brand/icon.png', drawIcon(128, source, false, 1))
  put('assets/brand/exports/miniapp-avatar.png', drawIcon(1024, source, false, 1))
  put(
    'assets/brand/exports/app-icon.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${source.viewBox}"><rect width="64" height="64" rx="14" fill="${source.colors.primary}"/><path fill="${source.colors.inverse}" fill-rule="evenodd" d="${source.path}"/></svg>\n`,
  )
  return assets
}

async function main(): Promise<void> {
  const assets = await buildBrandAssets()
  for (const [path, bytes] of assets) {
    await mkdir(dirname(join(repository, path)), { recursive: true })
    await writeFile(join(repository, path), bytes)
  }
  console.log(`Generated ${assets.size} brand assets from assets/brand/mimir-mark.svg`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
