import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Worker as NodeWorker } from 'node:worker_threads'
import { URL as NodeURL } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'

const dataUrl = (source: string) =>
  new NodeURL(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const compile = (filename: string) =>
  stripTypeScriptTypes(readFileSync(join(import.meta.dirname, filename), 'utf8'))
const coreUrl = dataUrl(compile('docx-protection-password-crypto.ts'))
const entryUrl = dataUrl(
  compile('docx-protection-password.worker.ts').replace(
    './docx-protection-password-crypto.js',
    coreUrl.href,
  ),
)
/** Browser transport backed by a real Node worker running the unchanged production module. */
export class RealDocxPasswordWorker {
  static instances: RealDocxPasswordWorker[] = []
  readonly native: NodeWorker
  terminated = false
  private listeners = new Map<string, (event: never) => void>()
  constructor() {
    this.native = new NodeWorker(
      dataUrl(`import { parentPort } from 'node:worker_threads';
      globalThis.postMessage = (data) => parentPort.postMessage(data,[]);
      let receive; globalThis.addEventListener = (_, listener) => { receive = listener };
      await import(${JSON.stringify(entryUrl.href)});
      parentPort.on('message', (data) => receive({data}));`),
    )
    this.native.on('message', (data) => this.emit('message', { data } as MessageEvent))
    this.native.on('error', () => this.emit('error', {} as ErrorEvent))
    this.native.on('messageerror', () => this.emit('messageerror', null))
    RealDocxPasswordWorker.instances.push(this)
  }
  addEventListener(type: string, listener: (event: never) => void) {
    this.listeners.set(type, listener)
  }
  removeEventListener(type: string) {
    this.listeners.delete(type)
  }
  emit(type: string, event: MessageEvent | ErrorEvent | null) {
    this.listeners.get(type)?.(event as never)
  }
  postMessage(value: unknown) {
    this.native.postMessage(value, [])
  }
  terminate() {
    this.terminated = true
    void this.native.terminate()
  }
}
export const PASSWORD_VECTOR_SALT = 'AAECAwQFBgcICQoLDA0ODw=='
/** Independent Python hashlib SHA512(salt||UTF16LE), followed by SHA512(previous||LE32(i)). */
export const PASSWORD_VECTORS = [
  {
    password: 'editor',
    spinCount: 0,
    hash: '98ryTUvSdxcNzeK0yE7nn8EdsKC8m4/YTBeKSN1Iv4IxlUxZTAdPU2cF+eAY2zl1kpygdyEJRRJ0VEYzJSQ13w==',
  },
  {
    password: 'editor',
    spinCount: 1,
    hash: 'zjq5c/a4JpTyAiVFs+W+1hp5Xas61/dDz9TxOQ0nleYCVUo0u0izgU0/IJIfCLl83insW6/QsJLCiEiLdMnQkQ==',
  },
  {
    password: '中文😀密碼',
    spinCount: 1024,
    hash: '5DC/ARQjaxu8LB5G7VP9CZ0xg6Aymoi1szDDJbo/i/TEngZCssrbbnNUhcUALMpfy6G2rk/kzbwGGCC727681g==',
  },
  {
    password: 'default',
    spinCount: 100000,
    hash: '1swSocVVUheqxkM9+U4cYGHSMl+Sl9fMgFgkqCfdu6Hz+A0hH69P6zoibabNf+qBLGnMMu5rXNAnl2mlDoAnpw==',
  },
] as const
export const vectorCredential = (
  vector: (typeof PASSWORD_VECTORS)[number] = PASSWORD_VECTORS[0],
) => ({
  algorithmSid: 14 as const,
  hash: vector.hash,
  salt: PASSWORD_VECTOR_SALT,
  spinCount: vector.spinCount,
})
