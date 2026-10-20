import assert from 'node:assert/strict'
import { test } from 'node:test'
import { macZipAsset, assertManualState } from './manual-update-smoke.mjs'

test('mac manual verification pins the official stable ZIP and exact architecture', () => {
  const asset = {
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
