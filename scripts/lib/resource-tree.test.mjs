import assert from 'node:assert/strict'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { finalizeResourceTree } from './resource-tree.mjs'

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-portable-host-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  const source = path.join(root, 'source')
  await mkdir(source)
  return { root, source }
}

async function assertNoLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false)
    if (entry.isDirectory()) await assertNoLinks(path.join(directory, entry.name))
  }
}

test('hoisted resources keep nested versions and file aliases after source removal and relocation', async (t) => {
  const { root, source } = await fixture(t)
  for (const [relative, contents] of [
    ['package.json', '{"type":"commonjs"}'],
    ['dist/node_modules/.pnpm/embedded/index.js', 'module.exports = "embedded"'],
    ['node_modules/shared/index.js', 'module.exports = "v1"'],
    ['node_modules/parent/index.js', 'module.exports = require("shared")'],
    ['node_modules/parent/node_modules/shared/index.js', 'module.exports = "v2"'],
    ['node_modules/tool/bin/run.cjs', 'module.exports = "tool"'],
  ]) {
    const file = path.join(source, relative)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, contents)
  }
  await mkdir(path.join(source, 'node_modules/.bin'))
  await symlink('../tool/bin/run.cjs', path.join(source, 'node_modules/.bin/tool'), 'file')
  const copied = path.join(root, 'copied')
  await cp(source, copied, { recursive: true, verbatimSymlinks: true })
  assert.deepEqual(await finalizeResourceTree(copied), { files: 7, materialized: 1 })
  assert.equal((await lstat(path.join(copied, 'node_modules/.bin/tool'))).isSymbolicLink(), false)
  assert.equal(
    await readFile(path.join(copied, 'node_modules/.bin/tool'), 'utf8'),
    'module.exports = "tool"',
  )
  const installed = path.join(root, 'installed/host')
  await mkdir(path.dirname(installed))
  await cp(copied, installed, { recursive: true })
  await rm(source, { recursive: true })
  await rm(copied, { recursive: true })
  const require = createRequire(path.join(installed, 'package.json'))
  assert.equal(require('shared'), 'v1')
  assert.equal(require('parent'), 'v2')
  assert.equal(require('./dist/node_modules/.pnpm/embedded'), 'embedded')
  await assertNoLinks(installed)
})

for (const kind of ['absolute', 'outside', 'directory-cycle', 'broken']) {
  test(`non-portable ${kind} resource link aborts instead of following the graph`, async (t) => {
    const { root, source } = await fixture(t)
    await writeFile(path.join(source, 'inside.cjs'), 'inside')
    await writeFile(path.join(root, 'outside.cjs'), 'outside')
    const target = {
      absolute: path.join(source, 'inside.cjs'),
      outside: '../outside.cjs',
      'directory-cycle': '.',
      broken: 'absent.cjs',
    }[kind]
    await symlink(target, path.join(source, 'alias'), kind === 'directory-cycle' ? 'dir' : 'file')
    await assert.rejects(finalizeResourceTree(source))
    assert.equal((await lstat(path.join(source, 'alias'))).isSymbolicLink(), true)
    assert.equal(await readFile(path.join(source, 'inside.cjs'), 'utf8'), 'inside')
  })
}
