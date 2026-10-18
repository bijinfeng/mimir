import assert from 'node:assert/strict'
import { builtinModules } from 'node:module'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist')
const app = JSON.parse(await readFile(join(output, 'app.json'), 'utf8'))
const pages = [
  'pages/chat/index',
  'pages/library/index',
  'pages/account/index',
  'pages/login/index',
  'pages/reader/index',
  'pages/editor/index',
  'pages/capture/index',
]
assert.deepEqual(app.pages, pages, 'All native pages must be registered and compiled')
assert.deepEqual(
  app.tabBar.list.map((tab) => tab.pagePath),
  pages.slice(0, 3),
)
for (const page of app.pages) {
  for (const extension of ['js', 'json', 'wxml']) {
    assert.ok((await stat(join(output, `${page}.${extension}`))).size > 0)
  }
}
assert.ok((await stat(join(output, 'app.wxss'))).size > 0, 'Global styles are missing')
assert.ok((await stat(join(output, 'pages/chat/index.wxss'))).size > 0, 'NutUI styles are missing')
const modules = JSON.parse(await readFile(join(root, '.temp/runtime-modules.json'), 'utf8'))
const forbidden = modules.filter((name) =>
  /node_modules\/(?:antd|antd-style|react-dom|lottie-web|lottie-react|@mimir\/(?:office|renderer))(?:\/|$)|packages\/(?:office|renderer)\//.test(
    name,
  ),
)
assert.deepEqual(forbidden, [], 'DOM / Office libraries must not enter the weapp runtime')
const nodeExternals = modules.filter(
  (name) =>
    name.startsWith('external ') &&
    builtinModules.some(
      (builtin) =>
        name.includes(JSON.stringify(builtin)) || name.includes(JSON.stringify(`node:${builtin}`)),
    ),
)
assert.deepEqual(nodeExternals, [], 'Node builtins must not enter the weapp runtime')
assert.ok(
  modules.some((name) => name.includes('/@tarojs/react/')),
  'Taro React renderer is missing',
)
assert.ok(
  modules.some((name) => name.includes('/react-reconciler/')),
  'React reconciler is missing',
)
assert.ok(
  modules.some((name) => name.includes('/nutui-react-taro/dist/es/packages/button/')),
  'On-demand NutUI Button is missing',
)

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? collect(path) : (await stat(path)).size
    }),
  )
  return sizes.reduce((total, size) => total + size, 0)
}
const bytes = await collect(output)
assert.ok(bytes < 2 * 1024 * 1024, `Raw main package exceeds 2 MiB: ${bytes} bytes`)
console.log(
  `Weapp artifact verified: ${app.pages.length} pages, ${modules.length} modules, ${bytes} raw bytes (${(bytes / 1024).toFixed(1)} KiB).`,
)
console.log(
  'Raw directory size is not the WeChat developer-tools upload measurement; real-device validation is still required.',
)
