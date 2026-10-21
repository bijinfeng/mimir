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
const projectReactSources = ['packages/renderer/src']
const { default: react } = await import(require.resolve('@vitejs/plugin-react'))
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ??
  join(
    repo,
    '.trellis/tasks/10-17-wechat-miniapp-research/prototype/node_modules/playwright/index.mjs',
  )
const { chromium } = await import(playwrightPath)
const originals = new Map(
  await Promise.all(
    [
      'components/nav/AccountRow.tsx',
      'components/settings/AccountSection.tsx',
      'components/settings/AccountSection.style.ts',
    ].map(async (path) => [
      join(repo, 'packages/renderer/src', path),
      await readFile(join(here, 'source-before/packages/renderer/src', path), 'utf8'),
    ]),
  ),
)
const manifest = []
const errors = []
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { headless: true, executablePath: process.env.CHROMIUM_PATH }
    : { headless: true, channel: 'chrome' },
)

for (const stage of ['before', 'after']) {
  const cached = process.env[`CAPTURE_${stage.toUpperCase()}_BUILD`]
  const output = cached ?? (await mkdtemp(join(tmpdir(), 'mimir-avatar-render-')))
  console.log(stage, output)
  if (!cached)
    await build({
      configFile: false,
      root: repo,
      resolve: {
        alias: {
          antd: dirname(require.resolve('antd/package.json')),
          'antd-style': dirname(require.resolve('antd-style/package.json')),
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
          name: 'archived-avatar',
          enforce: 'pre',
          transform(code, id) {
            if (stage === 'before' && originals.has(id.split('?')[0]))
              return originals.get(id.split('?')[0])
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
    if (path === '/missing-custom-avatar.png') {
      res.statusCode = 404
      res.end()
      return
    }
    const file = path.startsWith('/assets/')
      ? join(output, path)
      : join(output, 'docs/visual-comparisons/2026-10-21-default-avatar/harness.html')
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
  await new Promise((done) => server.listen(5199, '127.0.0.1', done))
  try {
    for (const theme of ['light', 'dark'])
      for (const view of ['default', 'custom', 'failed']) {
        const width = 1000
        const height = 600
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
        await page.goto(`http://127.0.0.1:5199/__capture?state=${view}&stage=${stage}`)
        await page.getByRole('button', { name: 'admin，账号菜单' }).first().waitFor()
        if (view === 'failed')
          await page.waitForFunction(
            () => !document.querySelector('img[src="/missing-custom-avatar.png"]'),
          )
        await page.getByRole('button', { name: 'admin，账号菜单' }).first().click()
        await page.getByRole('menu').waitFor()
        await page.mouse.move(980, 580)
        await page.evaluate(async () => {
          await Promise.all(
            document.getAnimations().map((animation) => animation.finished.catch(() => {})),
          )
        })
        await page.getByRole('tooltip').waitFor({ state: 'hidden' })
        if (view === 'failed')
          await page.waitForFunction(
            () => !document.querySelector('img[src="/missing-custom-avatar.png"]'),
          )
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.ant-avatar img')].every(
            (node) => node.complete && node.naturalWidth > 0,
          ),
        )
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
          avatarDimensions: [...document.querySelectorAll('.ant-avatar')].map((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
          images: [...document.querySelectorAll('.ant-avatar img')].map((node) => ({
            loaded: node.complete && node.naturalWidth > 0,
            src: node.getAttribute('src'),
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
    await new Promise((done) => server.close(done))
  }
}
await browser.close()
await writeFile(
  join(here, 'capture-manifest.json'),
  JSON.stringify({ manifest, errors }, null, 2) + '\n',
)
console.log(`Captured ${manifest.length} real component screens; ${errors.length} page errors`)
