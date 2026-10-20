import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { EventEmitter } from 'node:events'
import { runInNewContext } from 'node:vm'
import {
  Cdp,
  CdpTargetClosedError,
  createDebugEndpointAllocator,
  dispatchMouseClick,
  previewScreenshot,
  releaseAsset,
  settleScreenshotPaint,
  sha256,
  until,
  versionPair,
} from './update-smoke-lib.mjs'

test('explicit launches get distinct available loopback endpoints and release their probes before use', async () => {
  const allocate = createDebugEndpointAllocator()
  const ports = new Set()
  for (let index = 0; index < 4; index++) {
    const { port, endpoint } = await allocate()
    assert.ok(!ports.has(port), 'A prior launch port cannot be reused')
    ports.add(port)
    assert.equal(endpoint, `http://127.0.0.1:${port}`)
    const listener = createServer()
    try {
      await new Promise((resolve, reject) => {
        listener.once('error', reject)
        listener.listen({ host: '127.0.0.1', port, exclusive: true }, resolve)
      })
      assert.equal(listener.address().address, '127.0.0.1')
    } finally {
      if (listener.listening) await new Promise((resolve) => listener.close(resolve))
    }
  }
})

function debugProbe(address, { bindError, closeError } = {}) {
  const listener = new EventEmitter()
  listener.listening = false
  listener.closes = 0
  listener.listen = (options, callback) => {
    assert.deepEqual(options, { host: '127.0.0.1', port: 0, exclusive: true })
    if (bindError) listener.emit('error', bindError)
    else {
      listener.listening = true
      callback()
    }
  }
  listener.address = () => address
  listener.close = (callback) => {
    listener.closes++
    listener.listening = false
    callback(closeError)
  }
  return listener
}

test('OS reuse of a previous launch port is rejected, closed, and retried with a bounded allocation limit', async () => {
  const probes = [40001, 40001, 40002].map((port) => debugProbe({ address: '127.0.0.1', port }))
  let attempts = 0
  const allocate = createDebugEndpointAllocator({ createListener: () => probes[attempts++] })
  assert.equal((await allocate()).port, 40001)
  assert.equal((await allocate()).port, 40002)
  assert.equal(attempts, 3)
  assert.ok(probes.every((probe) => probe.closes === 1 && !probe.listening))

  const repeats = []
  const repeated = createDebugEndpointAllocator({
    createListener() {
      const probe = debugProbe({ address: '127.0.0.1', port: 40003 })
      repeats.push(probe)
      return probe
    },
  })
  await repeated()
  await assert.rejects(repeated(), /previously unused loopback CDP port/)
  assert.equal(repeats.length, 21)
  assert.ok(repeats.every((probe) => probe.closes === 1 && !probe.listening))
})

test('debug endpoint allocation propagates bind/close errors and rejects non-loopback or invalid addresses', async () => {
  for (const failure of ['bindError', 'closeError']) {
    const error = new Error(failure)
    const probe = debugProbe({ address: '127.0.0.1', port: 40004 }, { [failure]: error })
    const allocate = createDebugEndpointAllocator({ createListener: () => probe })
    await assert.rejects(allocate(), (actual) => actual === error)
    assert.equal(probe.closes, failure === 'bindError' ? 0 : 1)
  }
  for (const address of [
    null,
    'socket-path',
    { address: '0.0.0.0', port: 40004 },
    { address: '127.0.0.1', port: 0 },
    { address: '127.0.0.1', port: 65536 },
  ]) {
    const probe = debugProbe(address)
    await assert.rejects(createDebugEndpointAllocator({ createListener: () => probe })())
    assert.equal(probe.closes, 1)
  }
})

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

function paintPage() {
  let sequence = 0
  const frames = new Map()
  const timers = new Map()
  let animations = []
  const page = {
    document: { getAnimations: () => animations },
    requestAnimationFrame: (callback) => {
      frames.set(++sequence, callback)
      return sequence
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, milliseconds) => {
      assert.ok(milliseconds <= 5000)
      timers.set(++sequence, callback)
      return sequence
    },
    clearTimeout: (id) => timers.delete(id),
  }
  return {
    page,
    frames,
    timers,
    async frame(next = []) {
      animations = next
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) callback()
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

test('screenshot preview explicitly foregrounds its target before reading state or waiting for paint', async () => {
  const events = []
  const observed = {
    visibilityState: 'visible',
    hidden: false,
    hasFocus: true,
    finiteAnimations: [],
  }
  const session = {
    async call(method, params, options) {
      events.push(method)
      assert.deepEqual(params, {})
      assert.equal(options.timeoutMs, 5000)
    },
    async evaluate(expression, options) {
      assert.equal(options.timeoutMs, 5000)
      if (expression.includes('visibilityState')) {
        events.push('read-state')
        return observed
      }
      assert.ok(expression.includes('settleScreenshotPaint'))
      events.push('wait-paint')
    },
  }
  await previewScreenshot(session, async (stage, state) => {
    events.push(stage)
    if (state) assert.deepEqual(state, observed)
  })
  assert.deepEqual(events, [
    'bring-to-front',
    'Page.bringToFront',
    'foreground-state',
    'read-state',
    'paint-wait',
    'wait-paint',
    'paint-ready',
  ])
})

test('screenshot preview identifies the failing phase and preserves target-close or timeout errors', async () => {
  for (const failedAt of ['bring-to-front', 'foreground-state', 'paint-wait']) {
    const phases = []
    const error =
      failedAt === 'bring-to-front' ? new CdpTargetClosedError() : new Error('CDP timeout')
    const rejectAtPhase = () => {
      if (phases.at(-1) === failedAt) throw error
    }
    const session = {
      async call() {
        rejectAtPhase()
      },
      async evaluate() {
        rejectAtPhase()
        return { visibilityState: 'visible' }
      },
    }
    await assert.rejects(
      previewScreenshot(session, async (stage) => phases.push(stage)),
      (failure) => failure === error,
    )
    assert.equal(phases.at(-1), failedAt)
    assert.ok(!phases.includes('paint-ready'))
  }
})

function motion(endTime, playState = 'running', pending = false) {
  return { effect: { getComputedTiming: () => ({ endTime }) }, playState, pending }
}

test('screenshot capture waits for finite motion and two painted frames, ignoring infinite spinners', async () => {
  const observed = paintPage()
  let settled = false
  const painting = settleScreenshotPaint({ page: observed.page }).then(() => {
    settled = true
  })
  await observed.frame()
  assert.equal(settled, false)
  // The entry animation can start on the frame after the guard entered the DOM.
  await observed.frame([motion(300, 'idle', true), motion(Infinity)])
  await observed.frame([motion(300), motion(Infinity)])
  assert.equal(settled, false)
  await observed.frame([motion(300, 'finished'), motion(Infinity)])
  assert.equal(settled, false)
  await observed.frame([motion(Infinity)])
  await painting
  assert.equal(settled, true)
  assert.equal(observed.frames.size, 0)
  assert.equal(observed.timers.size, 0)
})

test('screenshot paint helper runs as an isolated serialized browser expression', async () => {
  const observed = paintPage()
  const painting = runInNewContext(`(${settleScreenshotPaint.toString()})()`, observed.page)
  await observed.frame()
  await observed.frame()
  await painting
  assert.equal(observed.timers.size, 0)
})

test('screenshot paint timeout and page errors fail capture and clean up their pending waits', async () => {
  const observed = paintPage()
  const painting = settleScreenshotPaint({ page: observed.page })
  const rejection = assert.rejects(painting, /Screenshot paint did not settle/)
  await observed.frame([motion(300)])
  for (const callback of observed.timers.values()) callback()
  await rejection
  assert.equal(observed.frames.size, 0)
  assert.equal(observed.timers.size, 0)

  const broken = paintPage()
  const failure = new Error('renderer is no longer available')
  broken.page.document.getAnimations = () => {
    throw failure
  }
  const failed = settleScreenshotPaint({ page: broken.page })
  const failedAssertion = assert.rejects(failed, (error) => error === failure)
  await broken.frame()
  await failedAssertion
  assert.equal(broken.timers.size, 0)
  await assert.rejects(settleScreenshotPaint({ timeoutMs: 5001 }), /five seconds/)
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

test('CDP paint evaluation has an external five-second deadline even without any renderer response', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const clearing = t.mock.method(globalThis, 'clearTimeout')
  const socket = new Socket()
  const cdp = new Cdp(socket)
  const evaluation = cdp.evaluate(`(${settleScreenshotPaint.toString()})()`, { timeoutMs: 5000 })
  const paintId = socket.sent[0].id
  const paintTimer = cdp.pending.get(paintId).timer
  const paintRejection = assert.rejects(evaluation, /CDP timeout: Runtime.evaluate/)
  const normal = cdp.call('normal-default-deadline')
  const normalRejection = assert.rejects(normal, /CDP timeout: normal-default-deadline/)
  t.mock.timers.tick(4999)
  assert.equal(cdp.pending.size, 2)
  t.mock.timers.tick(1)
  await paintRejection
  assert.equal(cdp.pending.size, 1)
  assert.ok(clearing.mock.calls.some(({ arguments: args }) => args[0] === paintTimer))
  socket.message({ id: paintId, result: { result: { value: 'late success' } } })
  socket.message({ id: paintId, error: { message: 'late error' } })
  assert.equal(cdp.pending.size, 1)
  t.mock.timers.tick(24_999)
  assert.equal(cdp.pending.size, 1)
  t.mock.timers.tick(1)
  await normalRejection
  assert.equal(cdp.pending.size, 0)
  cdp.close()
})

test('CDP clears custom request timers on response, target closure and synchronous send failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const clearing = t.mock.method(globalThis, 'clearTimeout')
  const socket = new Socket()
  const cdp = new Cdp(socket)
  const evaluation = cdp.evaluate('true', { timeoutMs: 5000 })
  const responseTimer = cdp.pending.get(socket.sent[0].id).timer
  socket.message({ id: socket.sent[0].id, result: { result: { value: true } } })
  assert.equal(await evaluation, true)
  assert.equal(cdp.pending.size, 0)
  const interrupted = cdp.evaluate('true', { timeoutMs: 5000 })
  const closeTimer = cdp.pending.get(socket.sent[1].id).timer
  cdp.close()
  await assert.rejects(interrupted, CdpTargetClosedError)
  assert.equal(cdp.pending.size, 0)
  for (const timer of [responseTimer, closeTimer])
    assert.ok(clearing.mock.calls.some(({ arguments: args }) => args[0] === timer))
  t.mock.timers.tick(5000)
  assert.equal(cdp.pending.size, 0)

  const brokenSocket = new Socket()
  const failure = new Error('socket send failed')
  brokenSocket.send = () => {
    throw failure
  }
  const broken = new Cdp(brokenSocket)
  const clearsBefore = clearing.mock.calls.length
  await assert.rejects(broken.evaluate('true', { timeoutMs: 5000 }), (error) => error === failure)
  assert.equal(broken.pending.size, 0)
  assert.equal(clearing.mock.calls.length, clearsBefore + 1)
  broken.close()
})

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
