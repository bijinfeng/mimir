import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { extractArchiveFile, verifyPackagedUpdater } from './verify-package-contents.mjs'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder'))
const libRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const { createPackage, extractFile } = libRequire('@electron/asar')

async function fixture(
  t,
  { version = '6.8.9', nested = false, main = './out/main.js', entry = true } = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-package-contents-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  const source = path.join(root, 'source')
  const moduleRoot = path.join(
    source,
    nested ? 'node_modules/other/node_modules/electron-updater' : 'node_modules/electron-updater',
  )
  await mkdir(path.join(moduleRoot, 'out'), { recursive: true })
  await writeFile(
    path.join(source, 'package.json'),
    JSON.stringify({ dependencies: { 'electron-updater': '6.8.9' } }),
  )
  await writeFile(
    path.join(moduleRoot, 'package.json'),
    JSON.stringify({ name: 'electron-updater', version, main }),
  )
  if (entry) await writeFile(path.join(moduleRoot, 'out/main.js'), 'exports.autoUpdater = {}')
  const archive = path.join(root, 'app.asar')
  await createPackage(source, archive)
  return archive
}

test('verifies real root updater manifest and normalized main bytes without platform-specific listing', async (t) => {
  for (const main of ['./out/main.js', '.\\out\\main.js']) {
    const archive = await fixture(t, { main })
    verifyPackagedUpdater(archive, extractFile)
  }
})

test('reads real ASAR entry bytes through either input separator convention', async (t) => {
  const archive = await fixture(t)
  for (const entry of [
    'node_modules/electron-updater/out/main.js',
    'node_modules\\electron-updater\\out\\main.js',
  ])
    assert.equal(
      extractArchiveFile(archive, entry, extractFile).toString(),
      'exports.autoUpdater = {}',
    )
})

test('manifest declaration and a nested updater cannot replace the actual root dependency', async (t) => {
  const archive = await fixture(t, { nested: true })
  assert.throws(() => verifyPackagedUpdater(archive, extractFile))
})

test('wrong bundled updater version fails even when the outer declaration is correct', async (t) => {
  const archive = await fixture(t, { version: '6.8.8' })
  assert.throws(() => verifyPackagedUpdater(archive, extractFile), /Wrong packaged/)
})

test('updater manifest without executable entry bytes cannot pass package verification', async (t) => {
  const archive = await fixture(t, { entry: false })
  assert.throws(() => verifyPackagedUpdater(archive, extractFile))
})

test('updater entry escaping its package is rejected', async (t) => {
  for (const main of ['../../package.json', '..\\..\\package.json']) {
    const archive = await fixture(t, { main })
    assert.throws(() => verifyPackagedUpdater(archive, extractFile), /Missing packaged/)
  }
})
