import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const baseline = process.env.BRAND_BASELINE ?? join(here, 'source/before')
const records = []
async function data(file, base, mime = 'image/png') {
  const bytes = await readFile(join(base, file))
  records.push({
    file,
    source: base === repo ? 'after' : 'before',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  return `data:${mime};base64,${bytes.toString('base64')}`
}
let cards = ''
for (const stage of ['before', 'after']) {
  const base = stage === 'before' ? baseline : repo
  const favicon = await data('apps/web/public/favicon.svg', base, 'image/svg+xml')
  const desktop = await data('apps/desktop/resources/icon.png', base)
  const fnos = await data('apps/fnos/ICON.PNG', base)
  const fnos256 = await data('apps/fnos/ICON_256.PNG', base)
  cards += `<section><h2>${stage === 'before' ? '接入前' : '第七版 · 已接入'}</h2><h3>实际 favicon · 16 / 32px</h3><div class="row"><img width="16" height="16" src="${favicon}"><img width="32" height="32" src="${favicon}"></div><h3>桌面资源 · 原图 1024px</h3><img width="256" height="256" src="${desktop}"><h3>fnOS 包资源 · 64 / 256px</h3><div class="row"><img width="64" height="64" src="${fnos}"><img width="256" height="256" src="${fnos256}"></div></section>`
}
const avatar = await data('assets/brand/exports/miniapp-avatar.png', repo)
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>实际平台资源对比</title><style>:root{color-scheme:light dark}body{font:15px/1.6 system-ui;margin:0;padding:32px;background:light-dark(#f7f8f8,#18191a);color:light-dark(#262626,#e6e7e8)}main{max-width:1100px;margin:auto}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}section{border:1px solid light-dark(#ddd,#454b47);padding:24px;border-radius:8px;min-width:0}h1{font-size:24px}h2{font-size:20px}h3{font-size:14px;margin:24px 0 12px}.row{display:flex;gap:24px;align-items:center}img{max-width:100%;height:auto}.circle{width:256px;height:256px;border-radius:50%;overflow:hidden}@media(max-width:650px){body{padding:16px}.grid{grid-template-columns:1fr}.row{gap:12px}}</style><main><h1>实际平台资源对比</h1><p>读取仓库生成资源及接入前原文件。图标文件可用不等于系统已刷新缓存；这里不是原生安装截图。</p><div class="grid">${cards}</div><h2>小程序后台头像 · 1024px 正方形导出</h2><p>下列圆形仅为安全区遮罩；实际上传资源保留正方形。</p><div class="row"><img width="256" height="256" src="${avatar}"><div class="circle"><img width="256" height="256" src="${avatar}"></div></div></main></html>`
await writeFile(join(here, 'assets.html'), html)
await writeFile(join(here, 'asset-manifest.json'), JSON.stringify(records, null, 2) + '\n')
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
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1100 },
    colorScheme: theme,
  })
  await page.goto('file://' + join(here, 'assets.html'))
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.decode()))
  })
  await page.screenshot({ path: join(here, `assets-${theme}.png`), fullPage: true })
  await page.close()
}
await browser.close()
