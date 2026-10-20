import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import {
  aggregateArtifacts,
  hashFile,
  stageArtifacts,
  targets,
  validateMetadata,
  validateVersion,
} from './release-artifacts.mjs'
import { signingConfiguration } from './package.mjs'
import { publishRelease } from './publish-release.mjs'

const version = '1.2.3'

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-release-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const inputDir = path.join(root, 'incoming')
  for (const [targetKey, target] of Object.entries(targets)) {
    const releaseDir = path.join(root, targetKey)
    await mkdir(releaseDir)
    const files = []
    for (const ext of target.extensions) {
      const url = `mimir-${version}-${target.os}-${target.arch}.${ext}`
      const data = Buffer.from(`real installer bytes ${targetKey} ${ext}`)
      await writeFile(path.join(releaseDir, url), data)
      files.push({ url, size: data.length, sha512: await hashFile(path.join(releaseDir, url)) })
    }
    const fallback = files.find((file) => file.url.endsWith('.zip')) ?? files[0]
    await writeFile(
      path.join(releaseDir, target.metadata),
      stringify({
        version,
        files,
        path: fallback.url,
        sha512: fallback.sha512,
        releaseDate: '2026-10-20T00:00:00Z',
      }),
    )
    await stageArtifacts({
      releaseDir,
      outputDir: path.join(inputDir, targetKey),
      targetKey,
      version,
      updateMode: target.platform === 'darwin' ? 'manual' : 'automatic',
    })
  }
  return { root, inputDir, outputDir: path.join(root, 'complete'), version, tag: `v${version}` }
}

test('stable versions require an exact tag and reject prereleases, padding and malformed input', () => {
  assert.equal(validateVersion('0.0.1', 'v0.0.1'), '0.0.1')
  for (const candidate of ['v1.2.3', '01.2.3', '1.2', '1.2.3-beta.1', '1.2.3+build', '1.2.3\n'])
    assert.throws(() => validateVersion(candidate))
  assert.throws(() => validateVersion(version, 'v1.2.4'))
  assert.throws(() => validateVersion(version, '1.2.3'))
})

test('four real byte sets aggregate with both mac architectures and matching compatibility ZIP', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  const metadata = parse(await readFile(path.join(setup.outputDir, 'latest-mac.yml'), 'utf8'))
  assert.equal(metadata.files.length, 4)
  assert.match(metadata.path, /-x64\.zip$/)
  assert.ok(metadata.files.some((file) => file.url.endsWith('-arm64.zip')))
  const names = metadata.files.map((file) => file.url)
  await validateMetadata(setup.outputDir, 'latest-mac.yml', version, names)
  assert.equal(manifest.assets.length, 9)
  for (const asset of manifest.assets)
    assert.equal(await hashFile(path.join(setup.outputDir, asset.name)), asset.sha512)
})

test('missing platform, stale manifest and modified bytes cannot form a release', async (t) => {
  for (const change of ['missing', 'manifest', 'bytes']) {
    const setup = await fixture(t)
    const dir = path.join(setup.inputDir, 'mac-arm64')
    if (change === 'missing') await rm(dir, { recursive: true })
    if (change === 'manifest') {
      const file = path.join(dir, 'build-manifest.json')
      const manifest = JSON.parse(await readFile(file, 'utf8'))
      manifest.version = '1.2.4'
      await writeFile(file, JSON.stringify(manifest))
    }
    if (change === 'bytes')
      await writeFile(path.join(dir, `mimir-${version}-mac-arm64.zip`), 'tampered bytes')
    await assert.rejects(aggregateArtifacts(setup))
    await assert.rejects(readFile(path.join(setup.outputDir, 'release-manifest.json')), {
      code: 'ENOENT',
    })
  }
})

test('malicious references, duplicate files and invalid metadata SHA-512 are rejected', async (t) => {
  const setup = await fixture(t)
  const dir = path.join(setup.root, 'mac-arm64')
  const name = 'latest-mac.yml'
  const original = parse(await readFile(path.join(dir, name), 'utf8'))
  const names = original.files.map((file) => file.url)
  for (const mutate of [
    (metadata) => {
      metadata.files[0].url = '../escape.dmg'
    },
    (metadata) => {
      metadata.files[0].url = 'https://example.org/installer.dmg'
    },
    (metadata) => {
      metadata.files.push(metadata.files[0])
    },
    (metadata) => {
      metadata.files[0].sha512 = 'bad hash'
    },
    (metadata) => {
      metadata.sha512 = 'wrong compatibility hash'
    },
    (metadata) => {
      metadata.files.pop()
    },
  ]) {
    const metadata = structuredClone(original)
    mutate(metadata)
    await writeFile(path.join(dir, name), stringify(metadata))
    await assert.rejects(validateMetadata(dir, name, version, names))
  }
})

test('mismatched mac signing mode cannot publish a mixed channel', async (t) => {
  const setup = await fixture(t)
  const file = path.join(setup.inputDir, 'mac-arm64', 'build-manifest.json')
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  manifest.updateMode = 'automatic'
  await writeFile(file, JSON.stringify(manifest))
  await assert.rejects(aggregateArtifacts(setup), /signing modes differ/)
})

test('macOS signed mode is explicit and fails closed without full credentials', () => {
  assert.deepEqual(signingConfiguration('darwin', {}), {
    extraMetadata: { desktopUpdateMode: 'manual' },
    mac: { identity: null, notarize: false },
  })
  assert.throws(() => signingConfiguration('darwin', { MIMIR_MAC_SIGNING: 'signed' }), /requires/)
  assert.throws(() => signingConfiguration('darwin', { MIMIR_MAC_SIGNING: 'typo' }), /must be/)
  const env = {
    MIMIR_MAC_SIGNING: 'signed',
    CSC_LINK: 'certificate',
    CSC_KEY_PASSWORD: 'password',
    CSC_NAME: 'Developer ID Application: Example',
    APPLE_ID: 'email',
    APPLE_APP_SPECIFIC_PASSWORD: 'password',
    APPLE_TEAM_ID: 'team',
  }
  const config = signingConfiguration('darwin', env)
  assert.equal(config.extraMetadata.desktopUpdateMode, 'automatic')
  assert.equal(config.forceCodeSigning, true)
  assert.equal(config.mac.notarize, true)
  assert.equal(signingConfiguration('win32', {}).extraMetadata.desktopUpdateMode, 'automatic')
})

function fakeApi({
  existing = null,
  existingAssets = [],
  failUpload = false,
  badDigest = false,
} = {}) {
  const calls = []
  const uploaded = [...existingAssets]
  const api = {
    async find() {
      return existing
    },
    async create(body) {
      calls.push('draft')
      assert.equal(body.draft, true)
      assert.equal(body.make_latest, 'false')
      return { id: 1 }
    },
    async assets() {
      return [...uploaded]
    },
    async removeAsset(id) {
      calls.push('delete')
      uploaded.splice(
        uploaded.findIndex((asset) => asset.id === id),
        1,
      )
    },
    async upload(_release, asset) {
      calls.push(`upload:${asset.name}`)
      if (failUpload) throw new Error('network failure')
      uploaded.push({ ...asset, id: uploaded.length })
    },
    async digest(asset) {
      calls.push(`verify:${asset.name}`)
      return badDigest ? 'incorrect' : asset.sha256
    },
    async publish() {
      calls.push('publish')
    },
  }
  return { api, calls }
}

test('draft publishes only after every remote asset passes validation', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  const { api, calls } = fakeApi()
  await publishRelease({ api, manifest, commit: 'a'.repeat(40) })
  assert.equal(calls[0], 'draft')
  assert.equal(calls.at(-1), 'publish')
  assert.equal(calls.filter((call) => call.startsWith('verify:')).length, manifest.assets.length)
})

test('upload failure or remote digest mismatch leaves the release unpublished', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  for (const options of [{ failUpload: true }, { badDigest: true }]) {
    const { api, calls } = fakeApi(options)
    await assert.rejects(publishRelease({ api, manifest, commit: 'a'.repeat(40) }))
    assert.ok(!calls.includes('publish'))
  }
})

test('published releases and unrelated drafts are immutable on rerun', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  for (const existing of [
    { draft: false },
    { draft: true, body: 'unrelated', tag_name: manifest.tag },
  ]) {
    const { api, calls } = fakeApi({ existing })
    await assert.rejects(publishRelease({ api, manifest, commit: 'a'.repeat(40) }))
    assert.deepEqual(calls, [])
  }
})

test('incomplete manifest fails before creating a draft', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  manifest.assets.pop()
  const { api, calls } = fakeApi()
  await assert.rejects(publishRelease({ api, manifest, commit: 'a'.repeat(40) }), /missing/)
  assert.deepEqual(calls, [])
})

test('only an owned draft can replace partial uploads; unknown draft assets stop recovery', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  const commit = 'a'.repeat(40)
  const existing = {
    id: 1,
    draft: true,
    body: `<!-- mimir-desktop-build:${commit} -->`,
    tag_name: manifest.tag,
    target_commitish: commit,
  }
  const recovery = fakeApi({ existing, existingAssets: [{ ...manifest.assets[0], id: 100 }] })
  await publishRelease({ api: recovery.api, manifest, commit })
  assert.equal(recovery.calls[0], 'delete')
  assert.equal(recovery.calls.at(-1), 'publish')
  const unknown = fakeApi({ existing, existingAssets: [{ name: 'unrelated.txt', id: 100 }] })
  await assert.rejects(publishRelease({ api: unknown.api, manifest, commit }), /outside/)
  assert.deepEqual(unknown.calls, [])
})
