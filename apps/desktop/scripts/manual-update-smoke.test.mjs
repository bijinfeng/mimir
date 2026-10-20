import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  macZipAsset,
  assertManualState,
  manualDownloadDirectory,
  downloadOfficialZip,
} from './manual-update-smoke.mjs'

test('mac manual verification pins the official stable ZIP and exact architecture', () => {
  const asset = {
    id: 123,
    url: 'https://api.github.com/repos/bijinfeng/mimir/releases/assets/123',
    name: 'mimir-0.1.0-mac-arm64.zip',
    size: 100,
    digest: `sha256:${'a'.repeat(64)}`,
    browser_download_url:
      'https://github.com/bijinfeng/mimir/releases/download/v0.1.0/mimir-0.1.0-mac-arm64.zip',
  }
  const release = { tag_name: 'v0.1.0', draft: false, prerelease: false, assets: [asset] }
  assert.equal(macZipAsset(release, '0.1.0', 'arm64'), asset)
  for (const changed of [
    { tag_name: 'v0.1.1' },
    { draft: true },
    { prerelease: true },
    { assets: [] },
    { assets: [{ ...asset, browser_download_url: 'https://example.com/mimir.zip' }] },
    { assets: [{ ...asset, id: 0 }] },
    { assets: [{ ...asset, id: 456 }] },
    { assets: [{ ...asset, url: 'https://example.com/123' }] },
    { assets: [{ ...asset, digest: undefined }] },
  ])
    assert.throws(() => macZipAsset({ ...release, ...changed }, '0.1.0', 'arm64'))
  assert.throws(() => macZipAsset(release, '0.1.0', 'x64'))
})

test('manual acceptance rejects automatic states, source drift or wrong versions', () => {
  const state = {
    currentVersion: '0.1.0',
    version: '0.1.1',
    status: 'available',
    platform: 'darwin',
    capability: 'manual',
    autoDownload: false,
    releaseUrl: 'https://github.com/bijinfeng/mimir/releases/tag/v0.1.1',
  }
  assertManualState(state, '0.1.0', '0.1.1')
  for (const changed of [
    { capability: 'automatic' },
    { autoDownload: true },
    { currentVersion: '0.0.9' },
    { version: '0.1.2' },
    { releaseUrl: 'https://example.com' },
    ...['downloading', 'preparing', 'downloaded', 'restarting'].map((status) => ({ status })),
  ])
    assert.throws(() => assertManualState({ ...state, ...changed }, '0.1.0', '0.1.1'))
})

async function zipFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mimir-official-manual-update-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const bytes = Buffer.from('PK\u0003\u0004official fixture bytes')
  const asset = {
    id: 123,
    name: 'mimir-0.1.0-mac-arm64.zip',
    url: 'https://api.github.com/repos/bijinfeng/mimir/releases/assets/123',
    size: bytes.length,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }
  return { directory, bytes, asset, file: join(directory, asset.name) }
}

test('official ZIP download resumes exact ranges and only reuses a fully verified cache', async (t) => {
  const { directory, bytes, asset, file } = await zipFixture(t)
  await writeFile(file, bytes.subarray(0, 7))
  let calls = 0
  const request = async (url, options) => {
    calls++
    assert.equal(url, asset.url)
    assert.deepEqual(options.headers, { Accept: 'application/octet-stream', Range: 'bytes=7-' })
    assert.equal(options.signal.aborted, false)
    return new Response(bytes.subarray(7), {
      status: 206,
      headers: {
        'content-type': 'application/octet-stream',
        'content-range': `bytes 7-${bytes.length - 1}/${bytes.length}`,
      },
    })
  }
  assert.equal(await downloadOfficialZip(asset, directory, { request }), file)
  assert.deepEqual(await readFile(file), bytes)
  assert.equal(await downloadOfficialZip(asset, directory, { request }), file)
  assert.equal(calls, 1)
  await writeFile(file, Buffer.alloc(bytes.length))
  await assert.rejects(
    downloadOfficialZip(asset, directory, { request }),
    /Cached ZIP digest mismatch/,
  )
  assert.equal(calls, 1)
})

test('official ZIP download rejects untrusted resume responses without modifying the partial file', async (t) => {
  const { directory, bytes, asset, file } = await zipFixture(t)
  const partial = bytes.subarray(0, 7)
  await writeFile(file, partial)
  for (const changed of [
    { status: 200 },
    { headers: { 'content-type': 'application/json' } },
    { headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-7/8' } },
  ]) {
    const request = async () =>
      new Response(bytes.subarray(7), {
        status: 206,
        headers: { 'content-type': 'application/octet-stream' },
        ...changed,
      })
    await assert.rejects(downloadOfficialZip(asset, directory, { request }))
    assert.deepEqual(await readFile(file), partial)
  }
})

test('official ZIP download verifies fresh and empty files and rejects corrupt or linked cache bytes', async (t) => {
  const { directory, bytes, asset, file } = await zipFixture(t)
  const request = async (url, options) => {
    assert.equal(url, asset.url)
    assert.deepEqual(options.headers, { Accept: 'application/octet-stream' })
    return new Response(bytes, { headers: { 'content-type': 'application/zip' } })
  }
  assert.equal(await downloadOfficialZip(asset, directory, { request }), file)
  await writeFile(file, '')
  assert.equal(await downloadOfficialZip(asset, directory, { request }), file)
  await writeFile(file, bytes.subarray(0, 7))
  await assert.rejects(
    downloadOfficialZip(asset, directory, {
      request: async () =>
        new Response(Buffer.alloc(bytes.length - 7), {
          status: 206,
          headers: {
            'content-type': 'application/octet-stream',
            'content-range': `bytes 7-${bytes.length - 1}/${bytes.length}`,
          },
        }),
    }),
  )
  const other = join(directory, 'unrelated-file')
  await writeFile(other, bytes)
  await rm(file)
  await symlink(other, file)
  await assert.rejects(downloadOfficialZip(asset, directory, { request }), /regular file/)
  assert.deepEqual(await readFile(other), bytes)
})

test('official ZIP download enforces stall and overall deadlines while preserving received bytes', async (t) => {
  for (const limits of [
    { stallMs: 20, timeoutMs: 1000 },
    { stallMs: 1000, timeoutMs: 20 },
  ]) {
    const { directory, asset, file } = await zipFixture(t)
    let timer
    let cancelled = false
    const request = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([80, 75]))
            timer = setTimeout(() => controller.close(), 1000)
          },
          cancel() {
            cancelled = true
            clearTimeout(timer)
          },
        }),
        { headers: { 'content-type': 'application/octet-stream' } },
      )
    await assert.rejects(downloadOfficialZip(asset, directory, { request, ...limits }))
    assert.equal(cancelled, true)
    assert.deepEqual(await readFile(file), Buffer.from([80, 75]))
  }
})

test('download cache is restricted to real prior harness temporary roots', async (t) => {
  const { directory } = await zipFixture(t)
  assert.equal(await manualDownloadDirectory(undefined, directory), directory)
  assert.equal(
    await manualDownloadDirectory(directory, directory),
    await manualDownloadDirectory(directory),
  )
  await assert.rejects(manualDownloadDirectory('.'))
  await assert.rejects(manualDownloadDirectory(tmpdir()))
  const alias = `${directory}-alias`
  t.after(() => rm(alias, { force: true }))
  await symlink(directory, alias)
  await assert.rejects(manualDownloadDirectory(alias), /real directory/)
})
