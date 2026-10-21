/** Inspect real miniapp JSX/local Image using an explicit DOM adapter, never device evidence. */
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const web = createRequire(join(repo, 'apps/web/package.json'))
const miniapp = createRequire(join(repo, 'apps/miniapp/package.json'))
const { build } = await import(web.resolve('vite'))
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ??
    join(
      repo,
      '.trellis/tasks/10-17-wechat-miniapp-research/prototype/node_modules/playwright/index.mjs',
    )
)
const output = await mkdtemp(join(tmpdir(), 'mimir-avatar-miniapp-'))
await build({
  configFile: false,
  root: repo,
  resolve: {
    alias: {
      'react-dom': dirname(web.resolve('react-dom/package.json')),
      react: dirname(web.resolve('react/package.json')),
      '@tarojs/components': join(here, 'native-image-adapter.tsx'),
      '@tarojs/taro': join(here, 'taro-adapter.ts'),
      '@nutui/nutui-react-taro': dirname(miniapp.resolve('@nutui/nutui-react-taro/package.json')),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: { outDir: output, rollupOptions: { input: join(here, 'miniapp.html') } },
})
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0]
  const file = path.startsWith('/assets/')
    ? join(output, path)
    : join(output, 'docs/visual-comparisons/2026-10-21-default-avatar/miniapp.html')
  try {
    const bytes = await readFile(file)
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.png')
            ? 'image/png'
            : 'text/html',
    )
    res.end(bytes)
  } catch {
    res.statusCode = 404
    res.end()
  }
})
await new Promise((done) => server.listen(5200, '127.0.0.1', done))
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const manifest = []
const errors = []
try {
  for (const stage of ['before', 'after']) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 240 },
      deviceScaleFactor: 1,
    })
    page.on('pageerror', (error) => errors.push({ stage, message: error.message }))
    await page.goto(`http://127.0.0.1:5200/?stage=${stage}`)
    await page.getByText('admin', { exact: true }).first().waitFor()
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    )
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.screenshot({ path: join(here, `miniapp-${stage}.png`) })
    const css = await page.evaluate(() =>
      [...document.styleSheets]
        .map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n'))
        .join('\n'),
    )
    let snapshot = await page.evaluate((capturedCss) => {
      const copy = document.documentElement.cloneNode(true)
      copy.querySelectorAll('script,link').forEach((node) => node.remove())
      copy.querySelector('head').insertAdjacentHTML('beforeend', `<style>${capturedCss}</style>`)
      return '<!doctype html>\n' + copy.outerHTML
    }, css)
    for (const url of new Set(snapshot.match(/\/assets\/[^"'()\s]+/g) ?? [])) {
      const bytes = await readFile(join(output, url))
      const mime = url.endsWith('.png') ? 'image/png' : 'application/octet-stream'
      snapshot = snapshot.replaceAll(url, `data:${mime};base64,${bytes.toString('base64')}`)
    }
    await writeFile(join(here, `miniapp-${stage}.html`), snapshot)
    manifest.push({
      stage,
      width: 390,
      height: 240,
      adapter: 'DOM mapping for native Image/View/Text, not WeChat',
      ...(await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        images: [...document.images].map((image) => ({
          width: image.width,
          height: image.height,
          loaded: image.complete && image.naturalWidth > 0,
        })),
      }))),
    })
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise((done) => server.close(done))
}
await writeFile(
  join(here, 'miniapp-capture-manifest.json'),
  JSON.stringify({ manifest, errors }, null, 2) + '\n',
)
if (errors.length) throw new Error(JSON.stringify(errors))
console.log('Captured 2 miniapp source-fragment renders; native device evidence remains pending')
