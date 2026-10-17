import { readFileSync, writeFileSync } from 'node:fs'
import { Worker as NativeWorker } from 'node:worker_threads'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { prepareNativeEncryptionWorker } from './docx-encryption-native.test-helper.js'
import { DocxEncryptionController } from './docx-encryption.js'
import { type DocxEncryptionRequest } from './docx-encryption-types.js'
let entry: URL
class BrowserWorkerBridge extends EventTarget {
  static instances: BrowserWorkerBridge[] = []
  private native: NativeWorker
  private ready = false
  private queued: { request: DocxEncryptionRequest; transfers: ArrayBuffer[] } | null = null
  terminated = false
  constructor() {
    super()
    BrowserWorkerBridge.instances.push(this)
    this.native = new NativeWorker(entry)
    this.native.on('message', (data) => {
      if (data.ready) {
        this.ready = true
        if (this.queued) {
          this.native.postMessage(this.queued.request, this.queued.transfers)
          this.queued = null
        }
      } else this.dispatchEvent(new MessageEvent('message', { data }))
    })
    this.native.on('error', () => this.dispatchEvent(new Event('error')))
  }
  postMessage(request: DocxEncryptionRequest, transfers: ArrayBuffer[]) {
    if (this.ready) this.native.postMessage(request, transfers)
    else this.queued = { request, transfers }
  }
  terminate() {
    this.terminated = true
    this.queued = null
    void this.native.terminate()
  }
}
beforeAll(() => {
  entry = prepareNativeEncryptionWorker().worker
})
afterEach(() => {
  for (const worker of BrowserWorkerBridge.instances) worker.terminate()
  BrowserWorkerBridge.instances = []
  vi.unstubAllGlobals()
})
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../tests/fixtures/docx-encryption/${name}`, import.meta.url)),
  )
describe('actual dedicated production encryption worker with browser Buffer-free CFB path', () => {
  for (const format of ['standard', 'agile']) {
    it(`opens actual ${format} Office bytes through real worker/controller`, async () => {
      vi.stubGlobal('Worker', BrowserWorkerBridge)
      const source = {},
        controller = new DocxEncryptionController(source),
        original = fixture(`office-${format}-password.docx`),
        preserved = original.slice()
      const result = await controller.decrypt(
        original,
        'Password1234_',
        new AbortController().signal,
        source,
      )
      expect(result.bytes).toEqual(fixture(`office-${format}-plain.docx`))
      expect(original).toEqual(preserved)
      expect(BrowserWorkerBridge.instances[0]?.terminated).toBe(true)
      controller.dispose()
    })
  }
  it('encrypts with real no-Buffer CFB writer and reopens in a second isolated worker', async () => {
    vi.stubGlobal('Worker', BrowserWorkerBridge)
    const source = {},
      controller = new DocxEncryptionController(source),
      plain = fixture('office-agile-plain.docx'),
      secret = '独立互通🦉Password1234_'
    const encrypted = await controller.encrypt(plain, secret, new AbortController().signal, source)
    expect(
      (await controller.decrypt(encrypted.bytes, secret, new AbortController().signal, source))
        .bytes,
    ).toEqual(plain)
    // External oracle command uses this synthetic-only artifact; never persist real user plaintext/passwords.
    writeFileSync('/tmp/mimir-docx-encryption-self-agile-20261017.docx', encrypted.bytes)
    expect(BrowserWorkerBridge.instances).toHaveLength(2)
    expect(BrowserWorkerBridge.instances.every((worker) => worker.terminated)).toBe(true)
    controller.dispose()
  })
  it('can terminate the actual worker before completion without publishing bytes', async () => {
    vi.stubGlobal('Worker', BrowserWorkerBridge)
    const source = {},
      controller = new DocxEncryptionController(source),
      abort = new AbortController()
    const promise = controller.encrypt(
      fixture('office-agile-plain.docx'),
      'cancel-private-secret',
      abort.signal,
      source,
    )
    const rejected = promise.catch((error: unknown) => error)
    await new Promise((resolve) => setTimeout(resolve, 30))
    abort.abort()
    expect(await rejected).toMatchObject({ name: 'AbortError' })
    expect(BrowserWorkerBridge.instances[0]?.terminated).toBe(true)
    controller.dispose()
  })
  it('only returns a fixed failure code for wrong password from real worker', async () => {
    vi.stubGlobal('Worker', BrowserWorkerBridge)
    const source = {},
      controller = new DocxEncryptionController(source)
    await expect(
      controller.decrypt(
        fixture('office-agile-password.docx'),
        'secret-wrong',
        new AbortController().signal,
        source,
      ),
    ).rejects.toMatchObject({ code: 'wrong-password' })
    expect(BrowserWorkerBridge.instances[0]?.terminated).toBe(true)
    controller.dispose()
  })
})
