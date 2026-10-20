import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parse } from 'yaml'
import { targets, validateVersion } from './release-artifacts.mjs'

const [targetKey, version] = process.argv.slice(2)
validateVersion(version)
const target = targets[targetKey]
if (!target || target.platform !== process.platform || target.arch !== process.arch)
  throw new Error('Package verification must run natively')
const desktopRoot = path.resolve('apps/desktop')
const require = createRequire(path.join(desktopRoot, 'package.json'))
const builderRequire = createRequire(require.resolve('electron-builder'))
const libRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const { extractFile, listPackage } = libRequire('@electron/asar')
const unpacked =
  target.platform === 'darwin'
    ? `release/${target.arch === 'arm64' ? 'mac-arm64' : 'mac'}/mimir.app/Contents`
    : `release/${target.platform === 'win32' ? 'win-unpacked' : 'linux-unpacked'}`
const resources = path.join(
  desktopRoot,
  unpacked,
  target.platform === 'darwin' ? 'Resources' : 'resources',
)
const asar = path.join(resources, 'app.asar')
const packaged = JSON.parse(extractFile(asar, 'package.json').toString())
if (packaged.version !== version || packaged.dependencies?.['electron-updater'] !== '6.8.9')
  throw new Error('Wrong packaged version/updater dependency')
const expectedMode =
  target.platform === 'darwin' && process.env.MIMIR_MAC_SIGNING !== 'signed'
    ? 'manual'
    : 'automatic'
if (packaged.desktopUpdateMode !== expectedMode)
  throw new Error('Wrong immutable update capability')
if (!listPackage(asar).some((name) => name.endsWith('/electron-updater/package.json')))
  throw new Error('electron-updater missing from app.asar')
for (const file of [
  'dist/main/index.js',
  'dist/preload/index.js',
  'dist/preload/updater.js',
  'dist/renderer/index.html',
  'dist/renderer/setup.html',
  'dist/renderer/update.html',
])
  extractFile(asar, file)
for (const file of [
  'server/dist/index.js',
  'server/dist/db/migrate.js',
  'server/drizzle-sqlite',
  'server/node_modules',
])
  await access(path.join(resources, file))
// Resolve and execute the deployed native bindings, independently of workspace node_modules.
const hostRequire = createRequire(path.join(resources, 'server', 'package.json'))
const Database = hostRequire('better-sqlite3')
const database = new Database(':memory:')
try {
  hostRequire('sqlite-vec').load(database)
  if (!database.prepare('select vec_version() as version').get().version)
    throw new Error('SQLite vector extension unavailable')
} finally {
  database.close()
}
const jieba = hostRequire('@node-rs/jieba')
if (
  !jieba.Jieba.withDict(hostRequire('@node-rs/jieba/dict.js').dict).cut('客户端更新', false).length
)
  throw new Error('Tokenizer native binding unavailable')
if (hostRequire('@napi-rs/canvas').createCanvas(1, 1).width !== 1)
  throw new Error('Canvas native binding unavailable')
const publish = parse(await readFile(path.join(resources, 'app-update.yml'), 'utf8'))
if (publish.provider !== 'github' || publish.owner !== 'bijinfeng' || publish.repo !== 'mimir')
  throw new Error('Unexpected packaged update source')
console.log(`Verified ${targetKey} package ${version} (${expectedMode})`)
