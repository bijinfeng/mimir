import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import {
  aggregateArtifacts,
  hashFile,
  releaseTargets,
  stageArtifacts,
  targets,
  validateCommittedReleaseVersion,
  validateMetadata,
  validateVersion,
} from './release-artifacts.mjs'
import { nativeArtifactName, signingConfiguration } from './package.mjs'
import {
  githubApiError,
  publishRelease,
  resolveReleaseTag,
  validateReleaseDirectory,
} from './publish-release.mjs'

const version = '1.2.3'

test('native artifact names survive builder extension-specific architecture mapping', () => {
  const require = createRequire(import.meta.url)
  const builderRequire = createRequire(require.resolve('electron-builder'))
  builderRequire('app-builder-lib')
  const libRequire = createRequire(builderRequire.resolve('app-builder-lib'))
  const { PlatformPackager } = libRequire('./platformPackager.js')
  const { Arch } = libRequire('builder-util')
  for (const target of Object.values(targets)) {
    // Exercise the locked builder's real arch mapping and macro expansion without packaging.
    const packager = Object.create(PlatformPackager.prototype)
    Object.defineProperties(packager, {
      appInfo: { value: { version } },
      platform: { value: { buildConfigurationKey: target.os } },
    })
    for (const ext of target.extensions) {
      if (ext === 'AppImage')
        assert.equal(
          packager.computeArtifactName('mimir-${version}-${os}-${arch}.${ext}', ext, Arch.x64),
          `mimir-${version}-linux-x86_64.AppImage`,
        )
      assert.equal(
        packager.computeArtifactName(nativeArtifactName(target.arch), ext, Arch[target.arch]),
        `mimir-${version}-${target.os}-${target.arch}.${ext}`,
      )
    }
  }
  assert.throws(() => nativeArtifactName('x86_64'), /Unsupported/)
  assert.throws(() => nativeArtifactName('../x64'), /Unsupported/)
})

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-release-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const inputDir = path.join(root, 'incoming')
  for (const [targetKey, target] of Object.entries(releaseTargets)) {
    const releaseDir = path.join(root, targetKey)
    await mkdir(releaseDir)
    const files = []
    for (const ext of target.extensions) {
      const url = `mimir-${version}-${target.os}-${target.arch}.${ext}`
      const data = Buffer.from(`real installer bytes ${targetKey} ${ext}`)
      await writeFile(path.join(releaseDir, url), data)
      files.push({ url, size: data.length, sha512: await hashFile(path.join(releaseDir, url)) })
    }
    if (target.metadata) {
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
    }
    await stageArtifacts({
      releaseDir,
      outputDir: path.join(inputDir, targetKey),
      targetKey,
      version,
      updateMode: target.updateMode ?? (target.platform === 'darwin' ? 'manual' : 'automatic'),
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

test('committed desktop and fnOS versions must exactly agree before builds', () => {
  assert.equal(
    validateCommittedReleaseVersion(version, `appname=mimir\nversion=${version}\n`, `v${version}`),
    version,
  )
  assert.equal(validateCommittedReleaseVersion(version, `version=${version}\r\n`), version)
  for (const manifest of [
    'version=1.2.4\n',
    'appname=mimir\n',
    `version=${version}\nversion=${version}\n`,
    `version= ${version}\n`,
    `version=${version} \n`,
  ])
    assert.throws(() => validateCommittedReleaseVersion(version, manifest), /fnOS manifest version/)
  assert.throws(
    () => validateCommittedReleaseVersion(version, `version=${version}\n`, 'v1.2.4'),
    /Tag/,
  )
})

test('desktop and fnOS byte sets aggregate with both mac architectures and matching compatibility ZIP', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  const metadata = parse(await readFile(path.join(setup.outputDir, 'latest-mac.yml'), 'utf8'))
  assert.equal(metadata.files.length, 4)
  assert.match(metadata.path, /-x64\.zip$/)
  assert.ok(metadata.files.some((file) => file.url.endsWith('-arm64.zip')))
  const names = metadata.files.map((file) => file.url)
  await validateMetadata(setup.outputDir, 'latest-mac.yml', version, names)
  assert.equal(manifest.assets.length, 10)
  const fpk = `mimir-${version}-fnos-x64.fpk`
  assert.deepEqual(
    await readFile(path.join(setup.outputDir, fpk)),
    await readFile(path.join(setup.inputDir, 'fnos-x64', fpk)),
  )
  for (const name of ['latest-mac.yml', 'latest.yml', 'latest-linux.yml']) {
    const platformMetadata = parse(await readFile(path.join(setup.outputDir, name), 'utf8'))
    assert.ok(platformMetadata.files.every((file) => !file.url.endsWith('.fpk')))
  }
  for (const asset of manifest.assets)
    assert.equal(await hashFile(path.join(setup.outputDir, asset.name)), asset.sha512)
})

test('fnOS staging requires manual mode and a correctly versioned nonempty regular FPK, without updater metadata', async (t) => {
  const setup = await fixture(t)
  const dir = path.join(setup.inputDir, 'fnos-x64')
  assert.deepEqual((await readdir(dir)).toSorted(), [
    'build-manifest.json',
    `mimir-${version}-fnos-x64.fpk`,
  ])
  const manifest = JSON.parse(await readFile(path.join(dir, 'build-manifest.json'), 'utf8'))
  assert.deepEqual(
    [manifest.platform, manifest.arch, manifest.updateMode],
    ['linux', 'x64', 'manual'],
  )
  const staging = (updateMode = 'manual') =>
    stageArtifacts({
      releaseDir: path.join(setup.root, 'fnos-x64'),
      outputDir: path.join(setup.root, 'invalid-fnos'),
      targetKey: 'fnos-x64',
      version,
      updateMode,
    })
  await assert.rejects(staging('automatic'), /identity/)
  await rm(path.join(setup.root, 'fnos-x64', `mimir-${version}-fnos-x64.fpk`))
  await writeFile(path.join(setup.root, 'fnos-x64', 'mimir-1.2.4-fnos-x64.fpk'), 'wrong version')
  await assert.rejects(staging(), /ENOENT/)
  await writeFile(path.join(setup.root, 'fnos-x64', `mimir-${version}-fnos-x64.fpk`), '')
  await assert.rejects(staging(), /empty/)
  await assert.rejects(readdir(path.join(setup.root, 'invalid-fnos')), { code: 'ENOENT' })
})

test('missing fnOS and tampered FPK bytes block the entire release before output creation', async (t) => {
  for (const mutation of ['missing', 'bytes']) {
    const setup = await fixture(t)
    const dir = path.join(setup.inputDir, 'fnos-x64')
    if (mutation === 'missing') await rm(dir, { recursive: true })
    else await writeFile(path.join(dir, `mimir-${version}-fnos-x64.fpk`), 'tampered FPK')
    await assert.rejects(aggregateArtifacts(setup))
    await assert.rejects(readdir(setup.outputDir), { code: 'ENOENT' })
  }
})

test('fnOS wrong identity, architecture, hashes and Electron metadata fail closed', async (t) => {
  for (const mutate of [
    (manifest) => {
      manifest.targetKey = 'linux-x64'
    },
    (manifest) => {
      manifest.platform = 'darwin'
    },
    (manifest) => {
      manifest.arch = 'arm64'
    },
    (manifest) => {
      delete manifest.arch
    },
    (manifest) => {
      manifest.version = '1.2.4'
    },
    (manifest) => {
      manifest.updateMode = 'automatic'
    },
    (manifest) => {
      manifest.assets = []
    },
    (manifest) => {
      manifest.assets[0].sha512 = 'incorrect'
    },
    (manifest) => {
      manifest.assets[0].sha256 = 'a'.repeat(64)
    },
    (manifest) => {
      manifest.assets[0].size++
    },
    (manifest) => {
      manifest.assets[0].name = `mimir-${version}-fnos-arm64.fpk`
    },
    (manifest) => {
      manifest.assets.push({ ...manifest.assets[0], name: 'latest-linux.yml' })
    },
    (manifest) => {
      manifest.assets.push({ ...manifest.assets[0], name: `${manifest.assets[0].name}.blockmap` })
    },
    (manifest) => {
      manifest.assets.push(manifest.assets[0])
    },
  ]) {
    const setup = await fixture(t)
    const file = path.join(setup.inputDir, 'fnos-x64', 'build-manifest.json')
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    mutate(manifest)
    await writeFile(file, JSON.stringify(manifest))
    await assert.rejects(aggregateArtifacts(setup))
    await assert.rejects(readdir(setup.outputDir), { code: 'ENOENT' })
  }
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
  failUploadAsset,
  badDigestAsset,
  tagCommit = 'a'.repeat(40),
} = {}) {
  const calls = []
  const uploaded = [...existingAssets]
  const api = {
    async tagCommit() {
      return tagCommit
    },
    async find() {
      return existing
    },
    async create(body) {
      calls.push('draft')
      assert.equal(body.draft, true)
      assert.equal(body.make_latest, 'false')
      assert.equal(Object.hasOwn(body, 'target_commitish'), false)
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
      if (failUpload || asset.name === failUploadAsset) throw new Error('network failure')
      uploaded.push({ ...asset, id: uploaded.length })
    },
    async digest(asset) {
      calls.push(`verify:${asset.name}`)
      return badDigest || asset.name === badDigestAsset ? 'incorrect' : asset.sha256
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
  assert.ok(calls.includes(`verify:mimir-${version}-fnos-x64.fpk`))
})

test('a missing or different remote tag stops all draft mutations', async (t) => {
  const manifest = await aggregateArtifacts(await fixture(t))
  for (const tagCommit of [null, 'b'.repeat(40)]) {
    const { api, calls } = fakeApi({ tagCommit })
    await assert.rejects(
      publishRelease({ api, manifest, commit: 'a'.repeat(40) }),
      /Remote release tag does not identify/,
    )
    assert.deepEqual(calls, [])
  }
})

test('a remote tag moved during upload prevents publication', async (t) => {
  const manifest = await aggregateArtifacts(await fixture(t))
  const { api, calls } = fakeApi()
  let lookups = 0
  api.tagCommit = async () => (++lookups === 1 ? 'a' : 'b').repeat(40)
  await assert.rejects(
    publishRelease({ api, manifest, commit: 'a'.repeat(40) }),
    /Remote release tag changed/,
  )
  assert.ok(calls.includes('draft'))
  assert.ok(!calls.includes('publish'))
})

test('owned draft recovery uses the verified tag and marker, not target creation metadata', async (t) => {
  const manifest = await aggregateArtifacts(await fixture(t))
  const commit = 'a'.repeat(40)
  const { api, calls } = fakeApi({
    existing: {
      id: 1,
      draft: true,
      tag_name: manifest.tag,
      target_commitish: 'master',
      body: `<!-- mimir-desktop-build:${commit} -->`,
    },
  })
  await publishRelease({ api, manifest, commit })
  assert.ok(!calls.includes('draft'))
  assert.equal(calls.at(-1), 'publish')
})

function readTagGraph(graph) {
  return async (route) => {
    assert.ok(Object.hasOwn(graph, route), `Unexpected tag request: ${route}`)
    return { object: graph[route] }
  }
}

test('remote tag resolution peels annotated objects and rejects invalid or cyclic graphs', async () => {
  const commit = 'a'.repeat(40)
  const annotation = 'b'.repeat(40)
  const ref = '/git/ref/tags/v1.2.3'
  assert.equal(
    await resolveReleaseTag('v1.2.3', readTagGraph({ [ref]: { type: 'commit', sha: commit } })),
    commit,
  )
  assert.equal(
    await resolveReleaseTag(
      'v1.2.3',
      readTagGraph({
        [ref]: { type: 'tag', sha: annotation },
        [`/git/tags/${annotation}`]: { type: 'commit', sha: commit },
      }),
    ),
    commit,
  )
  for (const object of [null, { type: 'commit', sha: 'bad' }, { type: 'tree', sha: commit }]) {
    await assert.rejects(resolveReleaseTag('v1.2.3', readTagGraph({ [ref]: object })), /Invalid/)
  }
  await assert.rejects(
    resolveReleaseTag(
      'v1.2.3',
      readTagGraph({
        [ref]: { type: 'tag', sha: annotation },
        [`/git/tags/${annotation}`]: { type: 'tag', sha: annotation },
      }),
    ),
    /cyclic/,
  )
  let depth = 0
  await assert.rejects(
    resolveReleaseTag('v1.2.3', async () => ({
      object: { type: 'tag', sha: (++depth).toString(16).padStart(40, '0') },
    })),
    /nesting exceeds/,
  )
})

test('GitHub failures include operation, message, permission and request ID without secrets or URL queries', async () => {
  const token = 'test-publisher-credential'
  const response = new Response(
    JSON.stringify({
      message: `Resource not accessible by integration ${token} https://uploads.github.com/path?secret=body-secret`,
    }),
    {
      status: 403,
      headers: {
        'x-accepted-github-permissions': 'contents=write; workflows=write',
        'x-github-request-id': 'ABCD:1234',
      },
    },
  )
  const error = await githubApiError(response, {
    method: 'POST',
    url: 'https://api.github.com/repos/bijinfeng/mimir/releases?secret=request-secret',
    token,
  })
  assert.match(error.message, /POST \/repos\/bijinfeng\/mimir\/releases failed \(403\)/)
  assert.match(error.message, /Resource not accessible by integration/)
  assert.match(error.message, /contents=write; workflows=write/)
  assert.match(error.message, /ABCD:1234/)
  for (const secret of [token, 'body-secret', 'request-secret'])
    assert.ok(!error.message.includes(secret))
  const nonJson = await githubApiError(new Response('upstream unavailable', { status: 502 }), {
    url: 'https://api.github.com/repos/bijinfeng/mimir/releases',
    token,
  })
  assert.match(nonJson.message, /GET .*failed \(502\)/)
})

test('missing fnOS or its remote upload/digest failure never publishes a partial desktop release', async (t) => {
  const setup = await fixture(t)
  const manifest = await aggregateArtifacts(setup)
  const fpk = `mimir-${version}-fnos-x64.fpk`
  const incomplete = structuredClone(manifest)
  incomplete.assets = incomplete.assets.filter((asset) => asset.name !== fpk)
  const missing = fakeApi()
  await assert.rejects(
    publishRelease({ api: missing.api, manifest: incomplete, commit: 'a'.repeat(40) }),
    /missing/,
  )
  assert.deepEqual(missing.calls, [])
  for (const options of [{ failUploadAsset: fpk }, { badDigestAsset: fpk }]) {
    const { api, calls } = fakeApi(options)
    await assert.rejects(publishRelease({ api, manifest, commit: 'a'.repeat(40) }))
    assert.ok(calls.includes(`upload:${fpk}`))
    assert.ok(!calls.includes('publish'))
  }
})

test('downloaded release directory rechecks FPK bytes, size and both digests before remote mutations', async (t) => {
  for (const mutation of ['bytes', 'size', 'sha256', 'sha512']) {
    const setup = await fixture(t)
    const manifest = await aggregateArtifacts(setup)
    await validateReleaseDirectory(setup.outputDir, manifest)
    const fpk = manifest.assets.find((asset) => asset.name.endsWith('.fpk'))
    if (mutation === 'bytes') await writeFile(path.join(setup.outputDir, fpk.name), 'tampered')
    else if (mutation === 'size') fpk.size++
    else if (mutation === 'sha256') fpk.sha256 = 'a'.repeat(64)
    else fpk.sha512 = 'A'.repeat(86) + '=='
    await assert.rejects(
      validateReleaseDirectory(setup.outputDir, manifest),
      /Local asset mismatch/,
    )
  }
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
    { draft: true, body: `<!-- mimir-desktop-build:${'a'.repeat(40)} -->`, tag_name: 'v9.9.9' },
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
