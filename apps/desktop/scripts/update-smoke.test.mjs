import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Cdp,
  CdpTargetClosedError,
  dispatchMouseClick,
  releaseAsset,
  sha256,
  until,
  versionPair,
} from './update-smoke-lib.mjs'

test('pins exact stable versions and rejects equal, lower or prerelease versions', () => {
  assert.deepEqual(versionPair('0.1.0', '0.1.1'), { base: '0.1.0', target: '0.1.1' })
  versionPair('0.9.9', '1.0.0')
  for (const pair of [
    ['0.1.0', '0.1.0'],
    ['1.0.0', '0.9.9'],
    ['0.1.0', 'v0.1.1'],
    ['0.1.0', '0.1.1-beta'],
    ['01.0.0', '2.0.0'],
  ]) {
    assert.throws(() => versionPair(...pair))
  }
})

test('only accepts complete, stable official public release asset with digest', () => {
  const asset = {
    name: 'mimir-0.1.1-linux-x64.AppImage',
    size: 123,
    digest: `sha256:${'a'.repeat(64)}`,
    browser_download_url:
      'https://github.com/bijinfeng/mimir/releases/download/v0.1.1/mimir-0.1.1-linux-x64.AppImage',
  }
  const release = { tag_name: 'v0.1.1', draft: false, prerelease: false, assets: [asset] }
  assert.equal(releaseAsset(release, '0.1.1', 'linux'), asset)
  for (const changed of [
    { tag_name: 'v0.1.2' },
    { draft: true },
    { prerelease: true },
    { assets: [] },
    { assets: [{ ...asset, browser_download_url: 'https://example.com/application' }] },
    { assets: [{ ...asset, digest: undefined }] },
  ]) {
    assert.throws(() => releaseAsset({ ...release, ...changed }, '0.1.1', 'linux'))
  }
})

test('hashes actual file bytes and detects changed package contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mimir-update-smoke-test-'))
  try {
    const file = join(directory, 'package')
    await writeFile(file, 'abc')
    assert.equal(
      await sha256(file),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    await writeFile(file, 'abcd')
    assert.notEqual(
      await sha256(file),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('bounded waits require the actual condition and retain the last failure', async () => {
  let reads = 0
  assert.equal(
    await until('event', () => (++reads === 3 ? 'complete' : false), { interval: 1, timeout: 100 }),
    'complete',
  )
  const failure = new Error('network failed')
  await assert.rejects(
    until(
      'never completes',
      () => {
        throw failure
      },
      { interval: 1, timeout: 10 },
    ),
    (error) => error.cause === failure && error.message.includes('never completes'),
  )
})

class Socket extends EventTarget {
  sent = []
  send(value) {
    this.sent.push(JSON.parse(value))
  }
  message(value) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }
  close() {
    this.dispatchEvent(new Event('close'))
  }
}

test('CDP correlates out-of-order replies and rejects interrupted requests', async () => {
  const socket = new Socket()
  const cdp = new Cdp(socket)
  const first = cdp.call('one')
  const second = cdp.call('two')
  socket.message({ id: socket.sent[1].id, result: { value: 2 } })
  socket.message({ id: socket.sent[0].id, result: { value: 1 } })
  assert.deepEqual(await Promise.all([first, second]), [{ value: 1 }, { value: 2 }])
  const pending = cdp.call('interrupted')
  cdp.close()
  await assert.rejects(pending, /CDP target closed/)
  assert.equal(cdp.pending.size, 0)
  await assert.rejects(cdp.call('after-close'), CdpTargetClosedError)
})

test('renderer exceptions fail the harness rather than becoming a false success', async () => {
  const socket = new Socket()
  const cdp = new Cdp(socket)
  const evaluation = cdp.evaluate('throw Error("save failed")')
  socket.message({ id: socket.sent[0].id, result: { exceptionDetails: { text: 'save failed' } } })
  await assert.rejects(evaluation, /save failed/)
  cdp.close()
})

function clickSession({ closeAt, protocolError } = {}) {
  const socket = new Socket()
  socket.send = function (value) {
    const request = JSON.parse(value)
    this.sent.push(request)
    if (request.params.type === closeAt) this.close()
    else if (request.params.type === 'mouseReleased' && protocolError)
      this.message({ id: request.id, error: { message: protocolError } })
    else this.message({ id: request.id, result: {} })
  }
  return new Cdp(socket)
}

test('real close during mouse release needs explicit target disappearance confirmation', async () => {
  const cdp = clickSession({ closeAt: 'mouseReleased' })
  let confirmations = 0
  await dispatchMouseClick(
    cdp,
    { x: 20, y: 30 },
    {
      confirmTargetClosed: async () => {
        confirmations++
      },
    },
  )
  assert.equal(confirmations, 1)
  assert.deepEqual(
    cdp.socket.sent.map((request) => request.params.type),
    ['mousePressed', 'mouseReleased'],
  )
  const missingTarget = new Error('clicked window is still present')
  await assert.rejects(
    dispatchMouseClick(
      clickSession({ closeAt: 'mouseReleased' }),
      { x: 1, y: 2 },
      {
        confirmTargetClosed: async () => {
          throw missingTarget
        },
      },
    ),
    (error) => error === missingTarget,
  )
})

test('closing clicks still verify disappearance when CDP acknowledges the release', async () => {
  const cdp = clickSession()
  let verified = false
  await dispatchMouseClick(
    cdp,
    { x: 1, y: 2 },
    {
      confirmTargetClosed: async () => {
        verified = true
      },
    },
  )
  assert.equal(verified, true)
  cdp.close()
})

test('unexpected target closure and mouse/protocol failures are never accepted as clicks', async () => {
  await assert.rejects(
    dispatchMouseClick(clickSession({ closeAt: 'mouseReleased' }), { x: 1, y: 2 }),
    CdpTargetClosedError,
  )
  let confirmations = 0
  const options = {
    confirmTargetClosed: async () => {
      confirmations++
    },
  }
  await assert.rejects(
    dispatchMouseClick(clickSession({ closeAt: 'mousePressed' }), { x: 1, y: 2 }, options),
    CdpTargetClosedError,
  )
  const cdp = clickSession({ protocolError: 'CDP target closed' })
  await assert.rejects(dispatchMouseClick(cdp, { x: 1, y: 2 }, options), /CDP target closed/)
  cdp.close()
  assert.equal(confirmations, 0)
})
