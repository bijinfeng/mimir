import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ??
    join(
      repo,
      '.trellis/tasks/10-17-wechat-miniapp-research/prototype/node_modules/playwright/index.mjs',
    )
)
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { headless: true, executablePath: process.env.CHROMIUM_PATH }
    : { headless: true, channel: 'chrome' },
)
const manifest = []
for (const [stage, folder] of [
  ['before', process.argv[2]],
  ['after', process.argv[3]],
]) {
  if (!folder) throw new Error('Usage: render-miniapp.mjs before-dist-h5 after-dist-h5')
  const output = resolve(folder)
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    const file = join(output, path === '/' ? 'index.html' : path)
    readFile(file)
      .then((bytes) => {
        res.setHeader(
          'Content-Type',
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.html': 'text/html',
          }[extname(file)] ?? 'application/octet-stream',
        )
        res.end(bytes)
      })
      .catch(() => {
        res.statusCode = 404
        res.end()
      })
  })
  await new Promise((resolve) => server.listen(5199, '127.0.0.1', resolve))
  try {
    for (const [view, path] of [
      ['gate', 'chat'],
      ['login', 'login'],
    ]) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        colorScheme: 'light',
        deviceScaleFactor: 1,
      })
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(`http://127.0.0.1:5199/#/pages/${path}/index`)
      await page.locator('.brand-mark').waitFor()
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all([...document.images].map((image) => image.decode().catch(() => {})))
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      })
      await mkdir(join(here, stage), { recursive: true })
      await page.screenshot({ path: join(here, stage, `miniapp-${view}.png`) })
      let html = await page.evaluate(() => {
        const copy = document.documentElement.cloneNode(true)
        copy
          .querySelectorAll('script,link[rel="stylesheet"],link[rel="preload"]')
          .forEach((node) => node.remove())
        const css = [...document.styleSheets]
          .map((sheet) => {
            try {
              return [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
            } catch {
              return ''
            }
          })
          .join('\n')
        copy.querySelector('head').insertAdjacentHTML('beforeend', `<style>${css}</style>`)
        return '<!doctype html>\n' + copy.outerHTML
      })
      const urls = [
        ...new Set(
          [
            ...html.matchAll(
              /(?:src=["']|url\(["']?)([^"')\s]+?\.(?:png|jpg|jpeg|svg|woff2?))(?:["')])/g,
            ),
          ].map((match) => match[1]),
        ),
      ]
      for (const url of urls) {
        if (url.startsWith('data:')) continue
        const file = join(output, new URL(url, 'http://127.0.0.1:5199/').pathname)
        try {
          const bytes = await readFile(file)
          const mime =
            {
              '.png': 'image/png',
              '.svg': 'image/svg+xml',
              '.jpg': 'image/jpeg',
              '.woff2': 'font/woff2',
            }[extname(file)] ?? 'application/octet-stream'
          html = html.replaceAll(url, `data:${mime};base64,${bytes.toString('base64')}`)
        } catch {
          /* A missing resource is still visible in the screenshot. */
        }
      }
      await writeFile(join(here, stage, `miniapp-${view}.html`), html)
      manifest.push({
        stage,
        view,
        width: 390,
        height: 844,
        theme: 'light',
        errors,
        sha256: createHash('sha256').update(html).digest('hex'),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      })
      await page.close()
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}
await browser.close()
await writeFile(
  join(here, 'miniapp-capture-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log('Captured actual Taro H5 Gate/login; these are not WeChat device screenshots.')
