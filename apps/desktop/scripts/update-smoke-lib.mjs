/** Helpers for the external, real-release upgrade smoke test. No application test hooks. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

export const officialRepository = 'bijinfeng/mimir'

export function versionPair(base, target) {
  const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  assert.match(base ?? '', stable, 'BASE_VERSION must be an exact stable version')
  assert.match(target ?? '', stable, 'TARGET_VERSION must be an exact stable version')
  const a = base.split('.').map(Number)
  const b = target.split('.').map(Number)
  const first = b.findIndex((value, index) => value !== a[index])
  assert.ok(first >= 0 && b[first] > a[first], 'TARGET_VERSION must be newer than BASE_VERSION')
  return { base, target }
}

export function releaseAsset(release, version, platform) {
  assert.equal(release.tag_name, `v${version}`, 'Official release version differs')
  assert.equal(release.draft, false)
  assert.equal(release.prerelease, false)
  const name = `mimir-${version}-${platform === 'win32' ? 'win-x64.exe' : 'linux-x64.AppImage'}`
  const asset = release.assets.find((entry) => entry.name === name)
  assert.ok(asset, `Missing official asset: ${name}`)
  assert.equal(
    asset.browser_download_url,
    `https://github.com/${officialRepository}/releases/download/v${version}/${name}`,
  )
  assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0)
  assert.match(
    asset.digest ?? '',
    /^sha256:[a-f0-9]{64}$/,
    'Published GitHub asset must have a SHA-256 digest',
  )
  return asset
}

export async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

export async function until(label, read, { timeout = 120_000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await read()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(interval)
  }
  throw new Error(`Timed out: ${label}`, { cause: lastError })
}

/** Serialized into the observed renderer by CDP; never changes page state or animations. */
export async function settleScreenshotPaint({ page = globalThis, timeoutMs = 5000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5000)
    throw new Error('Screenshot paint deadline must be within five seconds')
  let frame
  let timer
  const deadline = new Promise((resolve, reject) => {
    timer = page.setTimeout(() => reject(new Error('Screenshot paint did not settle')), timeoutMs)
  })
  const painting = (async () => {
    let stableFrames = 0
    while (stableFrames < 2) {
      await new Promise((resolve) => {
        frame = page.requestAnimationFrame(resolve)
      })
      const finiteMotion = page.document
        .getAnimations()
        .some(
          (animation) =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
            (animation.pending || animation.playState === 'running'),
        )
      stableFrames = finiteMotion ? 0 : stableFrames + 1
    }
  })()
  try {
    await Promise.race([painting, deadline])
  } finally {
    page.clearTimeout(timer)
    if (frame !== undefined) page.cancelAnimationFrame(frame)
  }
}

/** Explicit external preview: background/occluded windows may not receive animation frames. */
export async function previewScreenshot(session, phase) {
  await phase('bring-to-front')
  await session.call('Page.bringToFront', {}, { timeoutMs: 5000 })
  await phase('foreground-state')
  const observed = await session.evaluate(
    `({ visibilityState: document.visibilityState, hidden: document.hidden, hasFocus: document.hasFocus(), finiteAnimations: document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => ({ playState: animation.playState, pending: animation.pending, endTime: animation.effect.getComputedTiming().endTime })) })`,
    { timeoutMs: 5000 },
  )
  await phase('paint-wait', observed)
  await session.evaluate(`(${settleScreenshotPaint.toString()})()`, { timeoutMs: 5000 })
  await phase('paint-ready')
}

export class CdpTargetClosedError extends Error {
  constructor() {
    super('CDP target closed')
  }
}

/** A real close button can destroy its CDP target before mouseReleased is acknowledged. */
export async function dispatchMouseClick(session, point, { confirmTargetClosed } = {}) {
  await session.call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    clickCount: 1,
  })
  try {
    await session.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      clickCount: 1,
    })
  } catch (error) {
    if (!confirmTargetClosed || !(error instanceof CdpTargetClosedError)) throw error
  }
  // A successful CDP reply alone cannot prove that the intended window actually closed.
  if (confirmTargetClosed) await confirmTargetClosed()
}

/** CDP only connects to a port supplied externally when launching a real packaged app. */
export class Cdp {
  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.closed = false
    socket.addEventListener('message', ({ data }) => {
      const value = JSON.parse(String(data))
      if (value.id) {
        const request = this.pending.get(value.id)
        if (!request) return
        this.pending.delete(value.id)
        clearTimeout(request.timer)
        if (value.error) request.reject(new Error(JSON.stringify(value.error)))
        else request.resolve(value.result)
      } else {
        for (const listener of this.listeners.get(value.method) ?? []) listener(value.params)
      }
    })
    socket.addEventListener('close', () => {
      this.closed = true
      for (const request of this.pending.values()) {
        clearTimeout(request.timer)
        request.reject(new CdpTargetClosedError())
      }
      this.pending.clear()
    })
  }

  static async connect(url) {
    assert.ok(/^ws:\/\/127\.0\.0\.1:\d+\//.test(url), 'CDP must remain on loopback')
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return new Cdp(socket)
  }

  call(method, params = {}, { timeoutMs = 30_000 } = {}) {
    if (this.closed) return Promise.reject(new CdpTargetClosedError())
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
      return Promise.reject(new Error('CDP timeout must be a positive integer'))
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(new Error(`CDP timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error)
      }
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  async evaluate(expression, { timeoutMs = 30_000 } = {}) {
    const value = await this.call(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      },
      { timeoutMs },
    )
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails))
    return value.result.value
  }

  close() {
    this.socket.close()
  }
}
