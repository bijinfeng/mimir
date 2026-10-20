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

/** CDP only connects to a port supplied externally when launching a real packaged app. */
export class Cdp {
  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    this.listeners = new Map()
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
      for (const request of this.pending.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('CDP target closed'))
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

  call(method, params = {}) {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 30_000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  async evaluate(expression) {
    const value = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails))
    return value.result.value
  }

  close() {
    this.socket.close()
  }
}
