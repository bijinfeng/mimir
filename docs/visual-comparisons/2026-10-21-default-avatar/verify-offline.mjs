/** Recheck frozen HTML without a server; browser stays offline and no JS is retained. */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../../..')
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ??
    join(
      repo,
      '.trellis/tasks/10-17-wechat-miniapp-research/prototype/node_modules/playwright/index.mjs',
    )
)
const capture = JSON.parse(await readFile(join(here, 'capture-manifest.json'), 'utf8'))
for (const item of capture.manifest)
  item.sha256 = createHash('sha256')
    .update(await readFile(join(here, item.stage, `${item.view}-${item.theme}.html`)))
    .digest('hex')
await writeFile(join(here, 'capture-manifest.json'), JSON.stringify(capture, null, 2) + '\n')
const files = capture.manifest
  .map((item) => `${item.stage}/${item.view}-${item.theme}.html`)
  .concat(['miniapp-before.html', 'miniapp-after.html'])
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const results = []
try {
  for (const file of files) {
    const miniapp = file.startsWith('miniapp')
    const page = await browser.newPage({
      offline: true,
      viewport: { width: miniapp ? 390 : 1000, height: miniapp ? 240 : 600 },
    })
    await page.goto(pathToFileURL(join(here, file)).href)
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    )
    const result = await page.evaluate(() => ({
      scripts: document.scripts.length,
      externalStyles: document.querySelectorAll('link[rel="stylesheet"]').length,
      externalImages: [...document.images].filter((image) => !image.src.startsWith('data:')).length,
      imagesLoaded: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }))
    results.push({ file, ...result })
    await page.close()
  }
} finally {
  await browser.close()
}
await writeFile(
  join(here, 'offline-verification.json'),
  JSON.stringify({ results }, null, 2) + '\n',
)
if (
  results.some(
    (result) =>
      result.scripts ||
      result.externalStyles ||
      result.externalImages ||
      !result.imagesLoaded ||
      result.overflow,
  )
)
  throw new Error('Frozen HTML failed offline verification')
console.log(
  `Verified ${results.length} offline HTML files with no script or external styles/images`,
)
