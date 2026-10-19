import { Worker as NativeWorker } from 'node:worker_threads'
import { URL as NativeURL } from 'node:url'
import { prepareNativeEncryptionWorker } from '../docx-encryption-native.test-helper.js'
import type { DocxEncryptionRequest } from '../docx-encryption-types.js'
/** Browser-compatible bridge to the actual production worker, including Buffer-free crypto. */
export function nativeEncryptionWorker() {
  const browserURL = globalThis.URL
  let entry: URL
  try {
    globalThis.URL = NativeURL as typeof URL
    entry = prepareNativeEncryptionWorker().worker
  } finally {
    globalThis.URL = browserURL
  }
  return class BrowserWorkerBridge extends EventTarget {
    static instances: BrowserWorkerBridge[] = []
    native = new NativeWorker(entry)
    ready = false
    queued: { request: DocxEncryptionRequest; transfers: ArrayBuffer[] } | null = null
    terminated = false
    resolveResponse!: () => void
    readonly response = new Promise<void>((resolve) => {
      this.resolveResponse = resolve
    })
    constructor() {
      super()
      BrowserWorkerBridge.instances.push(this)
      this.native.on('message', (data) => {
        if (data.ready) {
          this.ready = true
          if (this.queued) {
            this.native.postMessage(this.queued.request, this.queued.transfers)
            this.queued = null
          }
        } else {
          this.dispatchEvent(new MessageEvent('message', { data }))
          this.resolveResponse()
        }
      })
      this.native.on('error', () => {
        this.dispatchEvent(new Event('error'))
        this.resolveResponse()
      })
    }
    postMessage(request: DocxEncryptionRequest, transfers: ArrayBuffer[]) {
      if (this.ready) this.native.postMessage(request, transfers)
      else this.queued = { request, transfers }
    }
    terminate() {
      this.terminated = true
      this.queued = null
      this.resolveResponse()
      void this.native.terminate()
    }
  }
}
