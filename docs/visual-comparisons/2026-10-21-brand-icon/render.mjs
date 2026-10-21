import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const require = createRequire(join(repo, 'apps/web/package.json'))
const { build } = await import(require.resolve('vite'))
const { projectReactSources, genofficeFontAlias } = await import(
  join(repo, 'packages/renderer/vite-preset.ts')
)
const { default: react } = await import(require.resolve('@vitejs/plugin-react'))
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ??
  join(
    repo,
    '.trellis/tasks/10-17-wechat-miniapp-research/prototype/node_modules/playwright/index.mjs',
  )
const { chromium } = await import(playwrightPath)
const original = await readFile(join(here, 'source/before/BrandMark.tsx'), 'utf8')
const manifest = []
const errors = []
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { headless: true, executablePath: process.env.CHROMIUM_PATH }
    : { headless: true, channel: 'chrome' },
)

for (const stage of ['before', 'after']) {
  const cached = process.env[`CAPTURE_${stage.toUpperCase()}_BUILD`]
  const output = cached ?? (await mkdtemp(join(tmpdir(), 'mimir-brand-render-')))
  console.log(stage, output)
  if (!cached)
    await build({
      configFile: false,
      root: repo,
      resolve: {
        alias: {
          ...genofficeFontAlias,
          '@': join(repo, 'apps/desktop/src/renderer'),
          'react-dom': dirname(require.resolve('react-dom/package.json')),
          react: dirname(require.resolve('react/package.json')),
          '@tanstack/react-query': dirname(
            createRequire(join(repo, 'packages/renderer/package.json')).resolve(
              '@tanstack/react-query/package.json',
            ),
          ),
          '@tanstack/react-router': dirname(
            createRequire(join(repo, 'packages/renderer/package.json')).resolve(
              '@tanstack/react-router/package.json',
            ),
          ),
        },
        dedupe: ['react', 'react-dom'],
      },
      plugins: [
        {
          name: 'archived-brand',
          enforce: 'pre',
          transform(code, id) {
            if (
              stage === 'before' &&
              id.split('?')[0] === join(repo, 'packages/renderer/src/components/BrandMark.tsx')
            )
              return original
          },
        },
        react({ compiler: { sources: projectReactSources } }),
      ],
      build: {
        outDir: output,
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: { input: join(here, 'harness.html') },
      },
    })
  const server = createHttpServer((req, res) => {
    const path = req.url.split('?')[0]
    const file = path.startsWith('/assets/')
      ? join(output, path)
      : join(output, 'docs/visual-comparisons/2026-10-21-brand-icon/harness.html')
    readFile(file)
      .then((bytes) => {
        res.setHeader(
          'Content-Type',
          file.endsWith('.js')
            ? 'text/javascript'
            : file.endsWith('.css')
              ? 'text/css'
              : file.endsWith('.png')
                ? 'image/png'
                : file.endsWith('.svg')
                  ? 'image/svg+xml'
                  : 'text/html',
        )
        res.end(bytes)
      })
      .catch(() => {
        res.statusCode = 404
        res.end()
      })
  })
  await new Promise((resolve) => server.listen(5198, '127.0.0.1', resolve))
  try {
    for (const theme of ['light', 'dark'])
      for (const [view, width, height] of [
        ['samples', 1200, 720],
        ['home', 1440, 900],
        ['login', 390, 844],
        ['setup', 900, 680],
      ]) {
        const page = await browser.newPage({
          viewport: { width, height },
          colorScheme: theme,
          deviceScaleFactor: 1,
        })
        page.on('pageerror', (error) => errors.push({ stage, view, message: error.message }))
        await page.route('**/api/**', (route) =>
          route.fulfill({
            json: route.request().url().includes('setup/state')
              ? { needsSetup: false }
              : { items: [] },
          }),
        )
        await page.goto(
          `http://127.0.0.1:5198/${view === 'login' ? 'login' : '__capture'}?view=${view}`,
        )
        await page.locator('svg path').first().waitFor({ state: 'attached' })
        if (view === 'home') await page.getByRole('group', { name: '知识工作台示例' }).waitFor()
        if (view === 'setup') await page.getByText('选择使用方式', { exact: true }).waitFor()
        if (view === 'login') await page.getByRole('button', { name: /登\s*录/ }).waitFor()
        await page.evaluate(async () => {
          await document.fonts.ready
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        })
        const name = `${view}-${theme}`
        await mkdir(join(here, stage), { recursive: true })
        await page.screenshot({ path: join(here, stage, `${name}.png`) })
        let snapshot = await page.evaluate(() => {
          const copy = document.documentElement.cloneNode(true)
          copy
            .querySelectorAll(
              'script, link[rel="stylesheet"], link[rel="modulepreload"], vite-error-overlay',
            )
            .forEach((node) => node.remove())
          const css = [...document.styleSheets]
            .map((sheet) => {
              try {
                return [...sheet.cssRules]
                  .filter((rule) => rule.type !== CSSRule.FONT_FACE_RULE)
                  .map((rule) => rule.cssText)
                  .join('\n')
              } catch {
                return ''
              }
            })
            .join('\n')
          copy.querySelector('head').insertAdjacentHTML('beforeend', `<style>${css}</style>`)
          return '<!doctype html>\n' + copy.outerHTML
        })
        const urls = [...new Set(snapshot.match(/\/assets\/[^"'()\s]+/g) ?? [])]
        for (const url of urls) {
          const bytes = await readFile(join(output, url))
          const mime = url.endsWith('.png')
            ? 'image/png'
            : url.endsWith('.svg')
              ? 'image/svg+xml'
              : url.endsWith('.ttf')
                ? 'font/ttf'
                : 'application/octet-stream'
          snapshot = snapshot.replaceAll(url, `data:${mime};base64,${bytes.toString('base64')}`)
        }
        await writeFile(join(here, stage, `${name}.html`), snapshot)
        const observations = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          marks: [
            ...document.querySelectorAll('svg[viewBox="0 0 64 64"],svg[viewBox="0 0 32 32"]'),
          ].map((node) => ({
            width: node.getAttribute('width'),
            viewBox: node.getAttribute('viewBox'),
          })),
        }))
        manifest.push({
          stage,
          view,
          theme,
          width,
          height,
          ...observations,
          sha256: createHash('sha256').update(snapshot).digest('hex'),
        })
        await page.close()
      }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}
await browser.close()
await writeFile(
  join(here, 'capture-manifest.json'),
  JSON.stringify({ manifest, errors }, null, 2) + '\n',
)
console.log(`Captured ${manifest.length} real component screens; ${errors.length} page errors`)
