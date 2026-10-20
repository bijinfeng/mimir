import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  captureResources,
  validateResourceManifest,
  verifyResources,
} from './package-resources.mjs'

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-resource-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source')
  const installed = path.join(root, 'installed')
  await mkdir(path.join(source, 'dist/vendor/nested'), { recursive: true })
  await writeFile(path.join(source, 'package.json'), '{"name":"server"}')
  await writeFile(path.join(source, 'dist/index.js'), 'import "./vendor/nested/module.js"')
  await writeFile(path.join(source, 'dist/vendor/nested/module.js'), 'export default "original"')
  await cp(source, installed, { recursive: true })
  return { root, source, installed }
}

test('a relocated real resource tree retains every file and byte in a portable sorted manifest', async (t) => {
  const { root, source, installed } = await fixture(t)
  const manifest = await captureResources(source)
  assert.deepEqual(
    manifest.files.map((file) => file.path),
    ['dist/index.js', 'dist/vendor/nested/module.js', 'package.json'],
  )
  assert.ok(!JSON.stringify(manifest).includes(root))
  assert.equal(manifest.files[2].size, Buffer.byteLength('{"name":"server"}'))
  const result = await verifyResources(installed, manifest)
  assert.deepEqual(result, {
    fileCount: 3,
    longestRelativePathLength: 'dist/vendor/nested/module.js'.length,
    longestRelativePaths: ['dist/vendor/nested/module.js'],
  })
})

test('verification reports precise missing, extra, size and same-size hash changes together', async (t) => {
  const { source, installed } = await fixture(t)
  const manifest = await captureResources(source)
  await rm(path.join(installed, 'dist/index.js'))
  await writeFile(path.join(installed, 'extra.bin'), 'additional')
  await writeFile(path.join(installed, 'package.json'), '{"name":"SERVER"}')
  await writeFile(path.join(installed, 'dist/vendor/nested/module.js'), 'short')
  await assert.rejects(verifyResources(installed, manifest), (error) => {
    const differences = JSON.parse(error.message.slice(error.message.indexOf('{')))
    assert.deepEqual(differences.missing, ['dist/index.js'])
    assert.deepEqual(differences.extra, ['extra.bin'])
    assert.deepEqual(
      differences.size.map((item) => item.path),
      ['dist/vendor/nested/module.js'],
    )
    assert.deepEqual(
      differences.hash.map((item) => item.path),
      ['dist/vendor/nested/module.js', 'package.json'],
    )
    return true
  })
})

test('unsafe and duplicate manifest entries are rejected before resource traversal', async () => {
  const entry = { path: 'safe.js', size: 1, sha256: 'a'.repeat(64) }
  for (const unsafe of [
    '../outside',
    '/absolute',
    'a/../b',
    'a//b',
    './a',
    'a\\b',
    'C:/root',
    'a:stream',
    'a\0b',
  ])
    await assert.rejects(
      verifyResources('does-not-exist', { formatVersion: 1, files: [{ ...entry, path: unsafe }] }),
      /Unsafe/,
    )
  assert.throws(
    () => validateResourceManifest({ formatVersion: 1, files: [entry, entry] }),
    /Duplicate/,
  )
  for (const change of [{ size: -1 }, { size: 1.5 }, { sha256: 'invalid' }, { root: '/private' }])
    assert.throws(() =>
      validateResourceManifest({ formatVersion: 1, files: [{ ...entry, ...change }] }),
    )
})

test('resource links and linked roots cannot traverse outside the package', async (t) => {
  const { source, installed } = await fixture(t)
  const manifest = await captureResources(source)
  const alias = path.join(installed, 'alias')
  await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(verifyResources(installed, manifest), /not a regular file/)
  await assert.rejects(captureResources(alias), /real directory/)
  if (process.platform !== 'win32') {
    await rm(alias)
    await symlink(path.join(source, 'package.json'), path.join(installed, 'alias.json'))
    await assert.rejects(captureResources(installed), /not a regular file/)
  }
})

test('CLI writes only relative evidence, rejects differences and prevents self-inclusion', async (t) => {
  const { root, source, installed } = await fixture(t)
  const script = fileURLToPath(new URL('./package-resources.mjs', import.meta.url))
  const manifestFile = path.join(root, 'manifest.json')
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  const capture = run('capture', source, manifestFile)
  assert.equal(capture.status, 0, capture.stderr)
  assert.equal(JSON.parse(capture.stdout).fileCount, 3)
  assert.ok(!(await readFile(manifestFile, 'utf8')).includes(root))
  assert.equal(run('verify', installed, manifestFile).status, 0)
  await rm(path.join(installed, 'package.json'))
  const failure = run('verify', installed, manifestFile)
  assert.equal(failure.status, 1)
  assert.match(failure.stderr, /"missing":\["package.json"\]/)
  assert.equal(run('capture', source, path.join(source, 'evidence.json')).status, 1)
})
