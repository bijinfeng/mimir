import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = realpathSync(process.argv[2])
if (
  process.platform !== 'linux' ||
  process.arch !== 'x64' ||
  process.versions.node.split('.')[0] !== '22'
)
  throw new Error('fnOS native verification requires Linux x86_64 Node 22')
const require = createRequire(path.join(root, 'package.json'))
const Database = require('better-sqlite3')
const db = new Database(':memory:')
const vec = require('sqlite-vec')
try {
  vec.load(db)
  if (!db.prepare('select vec_version() as version').get().version)
    throw new Error('SQLite vec unavailable')
} finally {
  db.close()
}
const jieba = require('@node-rs/jieba')
if (!jieba.Jieba.withDict(require('@node-rs/jieba/dict.js').dict).cut('客户端更新', false).length)
  throw new Error('Jieba dictionary unavailable')
if (require('@napi-rs/canvas').createCanvas(1, 1).width !== 1) throw new Error('Canvas unavailable')
const binaries = [
  ...Object.keys(require.cache).filter((file) => file.endsWith('.node')),
  vec.getLoadablePath(),
]
if (binaries.length < 4) throw new Error('Required native dependencies did not load')
for (const file of binaries) {
  const actual = realpathSync(file)
  if (!actual.startsWith(`${root}${path.sep}`))
    throw new Error(`Native module escapes package: ${actual}`)
  const header = readFileSync(actual).subarray(0, 20)
  if (header.toString('hex', 0, 4) !== '7f454c46' || header.readUInt16LE(18) !== 62)
    throw new Error(`Native module is not Linux x86_64 ELF: ${actual}`)
}
console.log(`[fnOS] loaded ${binaries.length} in-package Linux x86_64 native binaries`)
