import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  assertDeletableOut,
  assertNativeTarget,
  assertPortableLayout,
  buildManifest,
  detectLibc,
  gitSha,
  REQUIRED_RUNTIME_FILES,
  RUNTIME_PATHS,
  verifyRuntimeTree,
} from './build-runtime.mjs'

/**
 * runtime 产物的纯函数/布局守卫。
 *
 * 不做完整构建（那要 700MB 的 node_modules 和几十秒），只验证三件最容易
 * 在真实机器上静默出错的事：
 *   1. manifest 的 required 与真实文件一致；
 *   2. 开发文件没有混进产物；
 *   3. 删除目标不是源码目录。
 */

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-runtime-artifact-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const file of REQUIRED_RUNTIME_FILES) {
    const location = path.join(root, file)
    await mkdir(path.dirname(location), { recursive: true })
    if (file.endsWith('.json')) await writeFile(location, '{}\n')
    else await writeFile(location, '// fixture\n')
  }
  await writeFile(
    path.join(root, 'drizzle-sqlite/meta/_journal.json'),
    JSON.stringify({ entries: [{ when: 100 }, { when: 200 }] }),
  )
  await writeFile(
    path.join(root, 'drizzle/meta/_journal.json'),
    JSON.stringify({ entries: [{ when: 100 }] }),
  )
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@mimir/server' }))
  return root
}

test('verifyRuntimeTree lists every missing entry instead of failing on the first', async (t) => {
  const root = await fixture(t)
  assert.deepEqual(await verifyRuntimeTree(root), {
    root: path.resolve(root),
    files: REQUIRED_RUNTIME_FILES.length,
  })

  await rm(path.join(root, 'dist/runtime/cli.js'))
  await rm(path.join(root, 'node_modules/sqlite-vec/package.json'))
  await assert.rejects(verifyRuntimeTree(root), /dist\/runtime\/cli\.js[\s\S]*sqlite-vec/)
})

test('manifest records versions, target, migrations, web and schema journal', async (t) => {
  const root = await fixture(t)
  await mkdir(path.join(root, 'web/dist'), { recursive: true })
  await writeFile(path.join(root, 'web/dist/index.html'), '<html></html>')

  const manifest = await buildManifest({
    root,
    platform: process.platform,
    arch: process.arch,
    web: 'web/dist',
    productVersion: '1.2.3',
    protocolVersion: 7,
    shellAbi: 9,
    sha: 'a'.repeat(40),
  })

  assert.equal(manifest.name, 'mimir-runtime')
  assert.equal(manifest.productVersion, '1.2.3')
  assert.equal(manifest.protocolVersion, 7)
  assert.equal(manifest.shellAbi, 9)
  assert.equal(manifest.gitSha, 'a'.repeat(40))
  assert.equal(manifest.entry, 'dist/runtime/cli.js')
  assert.equal(manifest.library, 'dist/runtime/index.js')
  assert.equal(manifest.web, 'web/dist')
  assert.deepEqual(manifest.migrations, { sqlite: 'drizzle-sqlite', postgres: 'drizzle' })
  assert.equal(manifest.schemaVersion, 200)
  assert.ok(manifest.required.includes('web/dist/index.html'))
  assert.ok(manifest.required.includes('node_modules/@node-rs/jieba/package.json'))
})

test('manifest without web keeps web optional and does not require index.html', async (t) => {
  const root = await fixture(t)
  const manifest = await buildManifest({
    root,
    platform: process.platform,
    arch: process.arch,
    web: null,
    productVersion: '1.2.3',
    protocolVersion: 1,
    shellAbi: 1,
    sha: 'unknown',
  })
  assert.equal('web' in manifest, false)
  assert.equal(manifest.required.includes('web/dist/index.html'), false)
})

test('portable layout rejects dev files and tests even if required files exist', async (t) => {
  const root = await fixture(t)
  await assertPortableLayout(root)

  await mkdir(path.join(root, 'src/test'), { recursive: true })
  await writeFile(path.join(root, 'src/test/foo.test.ts'), '// test\n')
  await assert.rejects(assertPortableLayout(root), /开发文件[\s\S]*src\/test/)

  await rm(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'vite.config.ts'), 'export default {}\n')
  await assert.rejects(assertPortableLayout(root), /vite\.config\.ts/)
})

test('native target rejects cross builds; libc is only probed on Linux', () => {
  assert.doesNotThrow(() => assertNativeTarget(process.platform, process.arch))
  assert.throws(
    () => assertNativeTarget(process.platform === 'linux' ? 'darwin' : 'linux', process.arch),
    /只允许原生构建/,
  )
  assert.equal(detectLibc('darwin'), 'n/a')
  assert.equal(detectLibc('win32'), 'n/a')
  assert.ok(['glibc', 'musl'].includes(detectLibc('linux')))
})

test('deletable-out guard refuses source roots but allows fixed build dirs and temp dirs', async (t) => {
  assert.throws(() => assertDeletableOut(RUNTIME_PATHS.repoRoot), /仓库根/)
  assert.throws(
    () => assertDeletableOut(path.join(RUNTIME_PATHS.repoRoot, 'apps/server')),
    /只允许/,
  )
  assert.throws(() => assertDeletableOut(path.dirname(RUNTIME_PATHS.repoRoot)), /父目录/)
  assert.throws(() => assertDeletableOut(RUNTIME_PATHS.stagingRoot), /staging 根/)

  assert.doesNotThrow(() =>
    assertDeletableOut(path.join(RUNTIME_PATHS.repoRoot, 'apps/desktop/runtime-build')),
  )
  assert.doesNotThrow(() =>
    assertDeletableOut(path.join(RUNTIME_PATHS.repoRoot, 'apps/fnos/staging/app/server')),
  )
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'mimir-runtime-out-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  assert.doesNotThrow(() => assertDeletableOut(temporary))
})

test('gitSha prefers CI env and falls back to unknown outside a repository', () => {
  assert.equal(gitSha({ GITHUB_SHA: 'b'.repeat(40) }), 'b'.repeat(40))
  assert.equal(gitSha({}, path.join(os.tmpdir(), 'mimir-no-git-here')), 'unknown')
})
