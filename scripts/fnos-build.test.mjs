import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { extractFpk, verifyFnosManifest, verifyTarEntries } from './fnos-artifacts.mjs'
import { fnpack, verifyFnpack } from './fnos-fnpack.mjs'

const manifest = 'appname=mimir\nversion=1.2.3\nplatform=x86\ninstall_dep_apps=nodejs_v22\n'
test('FPK manifest validates exact application, release version, architecture and runtime', () => {
  verifyFnosManifest(manifest, '1.2.3')
  verifyFnosManifest(manifest.replaceAll('=', ' = '), '1.2.3')
  for (const bad of [
    manifest.replace('x86', 'all'),
    manifest.replace('1.2.3', '1.2.4'),
    manifest.replace('v22', 'v20'),
    `${manifest}version=1.2.3\n`,
  ])
    assert.throws(() => verifyFnosManifest(bad, '1.2.3'))
})

test('fnpack source is fixed and downloaded bytes fail closed on mismatch', () => {
  assert.equal(fnpack.version, '1.2.3')
  assert.equal(fnpack.url, 'https://static2.fnnas.com/fnpack/fnpack-1.2.3-linux-amd64')
  assert.match(fnpack.sha256, /^[a-f0-9]{64}$/)
  assert.throws(() => verifyFnpack(Buffer.from('tampered binary')), /checksum/)
})

test('archive paths cannot escape the extraction tree', () => {
  verifyTarEntries('app.tgz\ncmd/main\n')
  for (const entry of ['/tmp/escape', '../escape', 'app/../../escape', 'app\\..\\escape'])
    assert.throws(() => verifyTarEntries(entry), /Unsafe/)
})

function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

test('real nested FPK bytes are extracted and checked before installation smoke', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-fpk-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const outer = path.join(root, 'outer')
  const app = path.join(root, 'app')
  await mkdir(path.join(app, 'server/dist'), { recursive: true })
  await writeFile(path.join(app, 'server/dist/index.js'), 'real host entry')
  for (const name of ['cmd', 'config', 'wizard'])
    await mkdir(path.join(outer, name), { recursive: true })
  for (const name of ['cmd/main', 'cmd/install_callback', 'config/privilege', 'wizard/install'])
    await writeFile(path.join(outer, name), 'fixture')
  await writeFile(path.join(outer, 'manifest'), manifest)
  tar(['-czf', path.join(outer, 'app.tgz'), '-C', app, 'server'])
  const archive = path.join(root, 'mimir.fpk')
  tar(['-cf', archive, '-C', outer, 'manifest', 'app.tgz', 'cmd', 'config', 'wizard'])
  const unpacked = await extractFpk(archive, path.join(root, 'unpacked'), '1.2.3')
  assert.equal(
    await readFile(path.join(unpacked.app, 'server/dist/index.js'), 'utf8'),
    'real host entry',
  )
  await assert.rejects(extractFpk(archive, path.join(root, 'wrong-version'), '1.2.4'), /version/)
  await symlink('../server', path.join(app, 'server/alias'), 'dir')
  tar(['-czf', path.join(outer, 'app.tgz'), '-C', app, 'server'])
  tar(['-cf', archive, '-C', outer, 'manifest', 'app.tgz', 'cmd', 'config', 'wizard'])
  await assert.rejects(extractFpk(archive, path.join(root, 'links'), '1.2.3'), /links/)
})
