/** Rasterize the shared user avatar for native miniapp Image. Run: node scripts/generate-default-avatar.mjs */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, 'apps/desktop/package.json'))
const { createCanvas, loadImage } = require('@napi-rs/canvas')

export async function renderDefaultAvatar() {
  const image = await loadImage(await readFile(resolve(root, 'assets/avatar/default-avatar.svg')))
  const canvas = createCanvas(144, 144)
  canvas.getContext('2d').drawImage(image, 0, 0, 144, 144)
  return canvas.toBuffer('image/png')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(root, 'apps/miniapp/src/assets/avatar/default-avatar.png')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, await renderDefaultAvatar())
  console.log('Generated miniapp default avatar (144×144) from shared SVG')
}
